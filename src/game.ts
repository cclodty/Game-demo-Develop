import * as THREE from 'three';
import { DEFAULT_SETTINGS, type Settings, TILT_RANGE, TUNING, VIEW_HEIGHT_RANGE } from './config';
import { PixelPipeline } from './render/pipeline';
import { buildLevel, type Level } from './world/level';
import { NavGrid } from './world/navGrid';
import { firstBoxHit, rayHitsBox3D, segmentCircle } from './world/collision';
import { Player } from './entities/player';
import { Zombie } from './entities/zombie';
import { Dummy } from './entities/dummy';
import { Projectiles, type BulletHit } from './combat/projectiles';
import { Particles } from './fx/particles';
import { Decals } from './fx/decals';
import { BulletTime } from './systems/bulletTime';
import { WaveDirector } from './systems/waves';
import { Input } from './input';
import { Sfx } from './audio';
import { Hud, bindSettingsForm } from './ui/hud';
import { loadSettings, saveSettings } from './settings';
import { Textures } from './render/textures';
import { aimYawWithMuzzleOffset, clamp, damp, DEG, forwardOf, Rng, wrapAngle } from './util/math';

type Mode = 'start' | 'playing' | 'paused' | 'dead';
type LaserHit = 'none' | 'wall' | 'zombie' | 'dummy';

interface Pickup {
  kind: 'ammo' | 'med';
  x: number;
  z: number;
  group: THREE.Group;
  active: boolean;
  timer: number;
}

export interface GameOptions {
  testMode: boolean;
}

const W = TUNING.weapon;
// 單幀最長模擬時間：低於 10 FPS 時遊戲才會變慢，避免卡頓後角色瞬移穿牆
const MAX_DT = 1 / 10;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly viewCam = new THREE.OrthographicCamera(-1, 1, 1, -1, TUNING.camera.near, TUNING.camera.far);
  readonly pipeline: PixelPipeline;
  readonly level: Level;
  readonly nav: NavGrid;
  readonly player: Player;
  zombies: Zombie[] = [];
  readonly dummies: Dummy[] = [];
  readonly projectiles: Projectiles;
  readonly particles: Particles;
  readonly decals: Decals;
  readonly bt = new BulletTime();
  readonly waves = new WaveDirector();
  readonly input: Input;
  readonly sfx = new Sfx();
  readonly hud: Hud;
  settings: Settings;
  mode: Mode = 'start';

  private readonly canvas: HTMLCanvasElement;
  private readonly rng: Rng;
  private readonly pickups: Pickup[] = [];
  private readonly muzzleLight: THREE.PointLight;
  private readonly flashlight: THREE.SpotLight;
  private readonly fillLight: THREE.PointLight;
  private readonly laser: THREE.Line;
  private readonly laserDot: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -W.muzzleHeight);
  private readonly camTarget = new THREE.Vector3();
  private readonly camOffsetDir = new THREE.Vector3();
  private shake = 0;
  private damageFx = 0;
  private pulse = 0;
  private readonly pulseCenter = new THREE.Vector2(0.5, 0.5);
  private btWant = false;
  private deadTimer = 0;
  private realTime = 0;
  gameTime = 0;
  private lastFrame = 0;
  private fps = 60;
  private readonly fireTimers = { emit: 0, ash: 0 };
  private wallSoundCooldown = 0;
  private saveTimer = 0;
  private refreshForm: () => void = () => {};
  readonly aim = { x: 0, z: 0, yaw: 0, valid: false, onTarget: false };
  readonly laserInfo: { x0: number; z0: number; x1: number; z1: number; hit: LaserHit } = { x0: 0, z0: 0, x1: 0, z1: 0, hit: 'none' };
  readonly stats = { shots: 0, hits: 0, wallHits: 0, kills: 0, blockedAtMuzzle: 0, damageTaken: 0 };
  readonly lastShot = { x: 0, z: 0, dx: 0, dz: 0, moveX: 0, moveZ: 0 };
  private cssW = 1;
  private cssH = 1;

  constructor(canvas: HTMLCanvasElement, readonly options: GameOptions) {
    this.canvas = canvas;
    this.rng = new Rng(options.testMode ? 12345 : (Date.now() & 0xffffff) | 1);
    this.settings = options.testMode ? { ...DEFAULT_SETTINGS, spawning: false } : loadSettings();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.pipeline = new PixelPipeline(this.renderer);

    this.scene.background = new THREE.Color(0x0b0d10);
    this.setupLights();

    this.level = buildLevel();
    this.scene.add(this.level.group);
    this.nav = new NavGrid(-24, -18, 24, 18, 0.5, this.level.boxes, TUNING.zombie.radius);

    this.player = new Player(this.scene);
    for (const d of this.level.dummySpots) this.dummies.push(new Dummy(this.scene, d.x, d.z));
    this.projectiles = new Projectiles(this.scene);
    this.particles = new Particles(this.scene);
    this.decals = new Decals(this.scene);
    this.buildPickups();

    this.muzzleLight = new THREE.PointLight(0xffc27a, 0, 9, 1.6);
    this.scene.add(this.muzzleLight);
    // 槍上的手電筒：照亮瞄準方向，讓夜間場景中的前方與敵人清楚可見
    this.flashlight = new THREE.SpotLight(0xfff0d2, 70, 20, 0.44, 0.55, 1.4);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 0.4;
    this.flashlight.shadow.camera.far = 22;
    this.flashlight.shadow.bias = -0.0008;
    this.scene.add(this.flashlight, this.flashlight.target);
    // 角色周圍的微弱補光，讓主角在暗處也看得清輪廓
    this.fillLight = new THREE.PointLight(0xd9d2c4, 4, 5, 1.2);
    this.scene.add(this.fillLight);

    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    this.laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0xff3b2f, toneMapped: false }));
    this.laser.layers.set(1);
    this.laser.frustumCulled = false;
    this.scene.add(this.laser);
    this.laserDot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xff5a4a, toneMapped: false }));
    this.laserDot.layers.set(1);
    this.scene.add(this.laserDot);

    this.input = new Input(canvas);
    this.hud = new Hud();
    this.bindUi();

    this.resetWorld();
    this.applySettings(this.settings, false);
    this.updateCamera(0, true);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ---------------------------------------------------------------- 設定與介面

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0x7c818b, 0x3a3229, 1.7);
    this.scene.add(hemi);
    const moon = new THREE.DirectionalLight(0xd2d8e8, 1.15);
    moon.position.set(-14, 30, -12);
    moon.target.position.set(0, 0, 0);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = -28;
    sc.right = 28;
    sc.top = 24;
    sc.bottom = -24;
    sc.near = 5;
    sc.far = 80;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.02;
    this.scene.add(moon, moon.target);
  }

  private buildPickups(): void {
    const ringGeo = new THREE.RingGeometry(0.55, 0.7, 16).rotateX(-Math.PI / 2);
    const make = (kind: Pickup['kind'], x: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(kind === 'ammo' ? 0.62 : 0.5, kind === 'ammo' ? 0.34 : 0.3, kind === 'ammo' ? 0.4 : 0.36),
        new THREE.MeshToonMaterial({ map: kind === 'ammo' ? Textures.ammoCrate() : Textures.medkit() }),
      );
      box.position.y = 0.2;
      box.castShadow = true;
      g.add(box);
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: kind === 'ammo' ? 0xe2b456 : 0x8fc27a, transparent: true, opacity: 0.75, toneMapped: false }),
      );
      ring.position.y = 0.035;
      ring.layers.set(1);
      g.add(ring);
      this.scene.add(g);
      this.pickups.push({ kind, x, z, group: g, active: true, timer: 0 });
    };
    for (const p of this.level.ammoSpots) make('ammo', p.x, p.z);
    for (const p of this.level.medSpots) make('med', p.x, p.z);
  }

  private bindUi(): void {
    const byId = (id: string) => document.getElementById(id)!;
    // 介面按鈕點完就移除焦點，避免之後按空白鍵（子彈時間）又觸發同一個按鈕
    for (const btn of document.querySelectorAll<HTMLButtonElement>('#hud button, #dead button, #start button')) {
      btn.addEventListener('click', () => btn.blur());
    }
    byId('btn-start').addEventListener('click', () => this.start());
    byId('btn-reset').addEventListener('click', () => this.reset());
    byId('btn-reset2').addEventListener('click', () => {
      this.reset();
      this.setPaused(false);
    });
    byId('btn-retry').addEventListener('click', () => this.reset());
    byId('btn-menu').addEventListener('click', () => this.setPaused(this.mode !== 'paused'));
    byId('btn-resume').addEventListener('click', () => this.setPaused(false));
    byId('btn-pixel').addEventListener('click', () => this.togglePixel());
    this.refreshForm = bindSettingsForm(
      () => this.settings,
      (s) => this.applySettings(s, true),
    );
  }

  applySettings(s: Settings, persist: boolean): void {
    s.tiltDeg = clamp(s.tiltDeg, TILT_RANGE.min, TILT_RANGE.max);
    s.viewHeight = clamp(s.viewHeight, VIEW_HEIGHT_RANGE.min, VIEW_HEIGHT_RANGE.max);
    const prev = this.settings;
    this.settings = { ...s };
    this.pipeline.configure({ pixelMode: s.pixelMode, pixelSize: s.pixelSize, outlines: s.outlines });
    this.sfx.setVolume(s.volume, s.muted);
    this.hud.setHelpCollapsed(!s.showHelp);
    this.hud.setPixelLabel(s.pixelMode);
    this.hud.setBulletTimeHelp(s.bulletTimeMode);
    if (prev.bulletTimeMode !== s.bulletTimeMode) this.btWant = false;
    this.updateProjection();
    if (persist && !this.options.testMode) saveSettings(this.settings);
  }

  private togglePixel(): void {
    this.applySettings({ ...this.settings, pixelMode: !this.settings.pixelMode }, true);
    this.refreshForm();
    this.hud.toast(this.settings.pixelMode ? '像素風呈現' : '標準解析度呈現', 'info', 1.1);
  }

  start(): void {
    if (this.mode !== 'start') return;
    this.sfx.init();
    this.hud.start.hidden = true;
    this.hud.showHud(true);
    this.mode = 'playing';
    this.canvas.focus?.();
    this.hud.toast('前往右側試射場，或等待第一波喪屍', 'info', 2.6);
  }

  setPaused(paused: boolean): void {
    if (paused && this.mode === 'playing') {
      this.mode = 'paused';
      this.hud.pause.hidden = false;
      this.input.releaseAll();
      this.btWant = false;
      this.refreshForm();
    } else if (!paused && this.mode === 'paused') {
      this.mode = this.player.alive ? 'playing' : 'dead';
      this.hud.pause.hidden = true;
      this.input.releaseAll();
    }
  }

  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.cssW = w;
    this.cssH = h;
    this.renderer.setSize(w, h, false);
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.pipeline.resize(buf.x, buf.y);
    this.updateProjection();
  }

  private updateProjection(): void {
    const aspect = this.cssW / this.cssH;
    const h = this.settings.viewHeight;
    this.viewCam.top = h / 2;
    this.viewCam.bottom = -h / 2;
    this.viewCam.left = (-h * aspect) / 2;
    this.viewCam.right = (h * aspect) / 2;
    this.viewCam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- 重設

  private resetWorld(): void {
    const s = this.level.playerStart;
    this.player.reset(s.x, s.z, s.yaw);
    for (const z of this.zombies) z.dispose();
    this.zombies = [];
    this.projectiles.clear();
    this.particles.clear();
    this.decals.clear();
    this.bt.reset();
    this.btWant = false;
    this.waves.reset();
    for (const d of this.dummies) d.reset();
    for (const p of this.pickups) {
      p.active = true;
      p.timer = 0;
      p.group.visible = true;
    }
    this.stats.shots = 0;
    this.stats.hits = 0;
    this.stats.wallHits = 0;
    this.stats.kills = 0;
    this.stats.blockedAtMuzzle = 0;
    this.stats.damageTaken = 0;
    this.shake = 0;
    this.damageFx = 0;
    this.pulse = 0;
    this.deadTimer = 0;
    this.muzzleLight.intensity = 0;
    this.aim.yaw = s.yaw;
    this.hud.clearFloaters();
  }

  /** 重設測試場：生命、彈藥、敵人、子彈時間與時間倍率全部回到初始狀態。 */
  reset(): void {
    this.resetWorld();
    this.hud.hideDead();
    this.input.releaseAll();
    if (this.mode === 'dead') this.mode = 'playing';
    this.updateCamera(0, true);
    if (this.mode !== 'start') this.hud.toast('測試場已重設', 'info', 1.2);
  }

  // ---------------------------------------------------------------- 主迴圈

  frame(now: number): void {
    const realDt = this.lastFrame ? Math.min(MAX_DT, (now - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = now;
    if (realDt > 0) this.fps += (1 / realDt - this.fps) * 0.05;
    this.update(realDt);
    this.render();
    this.input.endFrame();
  }

  private update(realDt: number): void {
    this.realTime += realDt;
    const inp = this.input;

    // 全域按鍵
    if (inp.pressed('Escape')) {
      if (this.mode === 'playing') this.setPaused(true);
      else if (this.mode === 'paused') this.setPaused(false);
    }
    if (inp.pressed('KeyP') && this.mode !== 'start') this.togglePixel();
    if (inp.pressed('KeyH')) {
      this.applySettings({ ...this.settings, showHelp: !this.settings.showHelp }, true);
    }
    if (inp.pressed('F3')) {
      this.applySettings({ ...this.settings, showDebug: !this.settings.showDebug }, true);
      this.refreshForm();
    }
    if (inp.pressed('KeyM')) {
      this.applySettings({ ...this.settings, muted: !this.settings.muted }, true);
      this.refreshForm();
      this.hud.toast(this.settings.muted ? '已靜音' : '已開啟聲音', 'info', 1);
    }
    if (inp.wheel !== 0 && this.mode !== 'start') {
      this.settings.viewHeight = clamp(this.settings.viewHeight + inp.wheel, VIEW_HEIGHT_RANGE.min, VIEW_HEIGHT_RANGE.max);
      this.updateProjection();
      this.saveTimer = 0.6;
    }
    if (this.saveTimer > 0) {
      this.saveTimer -= realDt;
      if (this.saveTimer <= 0 && !this.options.testMode) {
        saveSettings(this.settings);
        this.refreshForm();
      }
    }
    if (this.mode === 'dead' && inp.pressed('Enter')) this.reset();

    if (this.mode === 'paused' || this.mode === 'start') {
      this.updateCamera(realDt, false);
      this.updateAmbient(this.mode === 'start' ? realDt : 0);
      this.updateHud(realDt);
      return;
    }

    // 子彈時間（以現實時間計算能量）
    const running = this.player.alive;
    let want = false;
    if (this.settings.bulletTimeMode === 'hold') {
      want = inp.isDown('Space');
    } else {
      if (inp.pressed('Space')) this.btWant = !this.btWant;
      want = this.btWant;
    }
    const btEvent = this.bt.update(realDt, want && running, running);
    if (btEvent === 'activated') {
      this.sfx.btOn();
      this.pulse = 1;
      const sp = this.worldToScreen(this.player.x, 1, this.player.z);
      this.pulseCenter.set(sp.x / this.cssW, 1 - sp.y / this.cssH);
    } else if (btEvent === 'deactivated') {
      this.sfx.btOff();
      this.btWant = false;
    } else if (btEvent === 'depleted') {
      this.sfx.btOff();
      this.btWant = false;
      this.hud.toast('子彈時間能量耗盡', 'energy', 1.2);
    } else if (btEvent === 'denied') {
      this.btWant = false;
      this.sfx.denied();
      this.hud.flashBulletTimeDenied();
      this.hud.toast('能量不足，回復到刻度線即可再次啟動', 'warn', 1.4);
    }
    this.pulse = Math.max(0, this.pulse - realDt * 1.6);
    this.sfx.setSlowmo(this.bt.visual);
    const dt = realDt * this.bt.scale;
    this.gameTime += dt;

    this.updateCamera(realDt, false);
    this.computeAim();

    // 移動：WASD 依畫面方向（與鏡頭觀看方向一致）
    let mx = 0;
    let mz = 0;
    if (this.player.alive) {
      const yaw = this.settings.yawDeg * DEG;
      const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
      const up = (inp.isDown('KeyW') || inp.isDown('ArrowUp') ? 1 : 0) - (inp.isDown('KeyS') || inp.isDown('ArrowDown') ? 1 : 0);
      const side = (inp.isDown('KeyD') || inp.isDown('ArrowRight') ? 1 : 0) - (inp.isDown('KeyA') || inp.isDown('ArrowLeft') ? 1 : 0);
      mx = fwd.x * up + right.x * side;
      mz = fwd.z * up + right.z * side;
    }
    const wasReloading = this.player.reloading;
    this.player.update(dt, realDt, mx, mz, this.aim.yaw, this.level.boxes);
    if (wasReloading && !this.player.reloading && this.player.alive) this.sfx.reloadDone();
    this.separateFromZombies();

    if (this.player.alive) {
      if (inp.pressed('KeyR') && this.player.startReload()) this.sfx.reload();
      if (inp.fireHeld()) this.tryFire(inp.firePressed());
    }

    const targets = this.zombies.map((z) => ({ x: z.x, z: z.z, radius: TUNING.zombie.radius, alive: z.alive && z.state !== 'rising' }));
    const dummyTargets = this.dummies.map((d) => ({ x: d.x, z: d.z, radius: d.radius, alive: true }));
    this.projectiles.update(dt, this.level.boxes, targets, dummyTargets, (h) => this.onBulletHit(h));

    this.updateZombies(dt);
    for (const d of this.dummies) d.update(dt);
    this.updatePickups(dt);

    const ev = this.waves.update(dt, this.zombies.filter((z) => z.alive).length, this.settings.spawning && this.player.alive);
    if (ev?.type === 'waveStart') {
      this.hud.toast(`第 ${ev.wave} 波`, 'warn', 1.6);
    } else if (ev?.type === 'spawn') {
      this.spawnZombie();
    } else if (ev?.type === 'waveClear') {
      this.hud.toast(`第 ${ev.wave} 波清除`, 'info', 1.6);
    }

    this.updateAmbient(dt);
    this.particles.update(dt);
    this.updateLaser();
    this.updateFades(realDt);

    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 900);
    this.shake = Math.max(0, this.shake - realDt * 3.5);
    this.damageFx = Math.max(0, this.damageFx - realDt * 1.6);
    this.wallSoundCooldown -= realDt;

    if (!this.player.alive && this.mode === 'playing') {
      this.deadTimer += realDt;
      if (this.deadTimer > 0.9) {
        this.mode = 'dead';
        const acc = this.stats.shots > 0 ? Math.round((this.stats.hits / this.stats.shots) * 100) : 0;
        this.hud.showDead(`撐到第 ${this.waves.wave} 波，擊倒 ${this.stats.kills} 隻，命中率 ${acc}%。`);
      }
    }

    this.updateHud(realDt);
  }

  // ---------------------------------------------------------------- 鏡頭與瞄準

  private updateCamera(realDt: number, snap: boolean): void {
    const yaw = this.settings.yawDeg * DEG;
    const tilt = this.settings.tiltDeg * DEG;
    this.camOffsetDir.set(Math.sin(yaw) * Math.cos(tilt), Math.sin(tilt), Math.cos(yaw) * Math.cos(tilt));

    // 鏡頭目標：角色位置，加上朝瞄準方向的少量偏移，方便看見前方
    let tx = this.player.x;
    let tz = this.player.z;
    if (this.aim.valid && this.player.alive) {
      const k = this.settings.lookAhead;
      const ox = clamp((this.aim.x - this.player.x) * k, -TUNING.camera.lookAheadMax, TUNING.camera.lookAheadMax);
      const oz = clamp((this.aim.z - this.player.z) * k, -TUNING.camera.lookAheadMax, TUNING.camera.lookAheadMax);
      tx += ox;
      tz += oz;
    }
    if (snap) {
      this.camTarget.set(tx, 0, tz);
    } else {
      this.camTarget.x = damp(this.camTarget.x, tx, TUNING.camera.followSharpness, realDt);
      this.camTarget.z = damp(this.camTarget.z, tz, TUNING.camera.followSharpness, realDt);
    }
    const sx = this.shake > 0 ? (this.rng.next() - 0.5) * this.shake * 0.35 : 0;
    const sz = this.shake > 0 ? (this.rng.next() - 0.5) * this.shake * 0.35 : 0;
    const d = TUNING.camera.distance;
    this.viewCam.position.set(
      this.camTarget.x + sx + this.camOffsetDir.x * d,
      this.camOffsetDir.y * d,
      this.camTarget.z + sz + this.camOffsetDir.z * d,
    );
    this.viewCam.up.set(0, 1, 0);
    this.viewCam.lookAt(this.camTarget.x + sx, 0, this.camTarget.z + sz);
    this.viewCam.updateMatrixWorld();
  }

  /** 滑鼠位置投射到「槍口高度」的水平面，得到瞄準點；人物面向由此計算，不吸附角度。 */
  private computeAim(): void {
    if (!this.input.mouseInside && this.aim.valid) return;
    const p = this.screenToAimPlane(this.input.mouseX, this.input.mouseY);
    if (!p) return;
    this.aim.x = p.x;
    this.aim.z = p.z;
    this.aim.valid = true;
    const dx = p.x - this.player.x;
    const dz = p.z - this.player.z;
    if (Math.hypot(dx, dz) > 0.25) this.aim.yaw = aimYawWithMuzzleOffset(dx, dz, TUNING.player.gunSide);
  }

  screenToAimPlane(cssX: number, cssY: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((cssX / this.cssW) * 2 - 1, -(cssY / this.cssH) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.viewCam);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.aimPlane, out);
  }

  worldToScreen(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.viewCam);
    return { x: ((v.x + 1) / 2) * this.cssW, y: ((1 - v.y) / 2) * this.cssH };
  }

  // ---------------------------------------------------------------- 射擊

  private tryFire(justPressed: boolean): void {
    const p = this.player;
    if (p.reloading) return;
    if (p.mag <= 0) {
      if (p.reserve > 0) {
        if (p.startReload()) this.sfx.reload();
      } else if (justPressed) {
        this.sfx.empty();
        this.hud.toast('彈藥耗盡：到彈藥箱補充', 'warn', 1.6);
      }
      return;
    }
    if (p.fireCooldown > 0) return;
    p.fireCooldown = 1 / W.fireRate;
    p.mag--;
    p.shotsFired++;
    this.stats.shots++;
    // 打空彈匣時自動換彈（不必放開再按）
    if (p.mag === 0 && p.reserve > 0 && p.startReload()) this.sfx.reload();
    const spread = p.spreadDeg() * DEG;
    // 近似常態分布的散布，集中在中心
    const r = (this.rng.next() + this.rng.next() + this.rng.next() - 1.5) / 1.5;
    const angle = p.yaw + r * spread;
    const f = forwardOf(angle);
    const muzzle = p.muzzle();
    const shoulder = p.shoulder();
    Object.assign(this.lastShot, { x: muzzle.x, z: muzzle.z, dx: f.x, dz: f.z, moveX: p.vx, moveZ: p.vz });
    p.bloomDeg = Math.min(W.maxBloomDeg, p.bloomDeg + W.bloomPerShot);
    p.model.recoil = 1;

    // 槍口若已伸進牆裡，子彈在牆面就停下，不會穿牆
    const pointBlank = this.pointBlankHit(shoulder.x, shoulder.z, muzzle.x, muzzle.z, f.x, f.z);
    if (pointBlank) {
      this.stats.blockedAtMuzzle++;
      this.onBulletHit(pointBlank);
    } else {
      this.projectiles.spawn(muzzle.x, muzzle.z, f.x, f.z);
    }

    // 槍口火光、彈殼、閃光
    const flashX = muzzle.x + f.x * 0.08;
    const flashZ = muzzle.z + f.z * 0.08;
    this.muzzleLight.position.set(flashX, W.muzzleHeight + 0.1, flashZ);
    this.muzzleLight.intensity = 55;
    for (let i = 0; i < 5; i++) {
      const a = angle + (this.rng.next() - 0.5) * 0.9;
      const sp = 2 + this.rng.next() * 5;
      this.particles.emit({
        x: flashX, y: W.muzzleHeight, z: flashZ,
        vx: Math.sin(a) * sp, vy: (this.rng.next() - 0.3) * 1.5, vz: Math.cos(a) * sp,
        life: 0.05 + this.rng.next() * 0.04, size: 0.12 - i * 0.012, color: i < 2 ? 0xfff2c8 : 0xffb04a, fadeTo: 0xff6a20, drag: 12,
      });
    }
    const side = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
    this.particles.emit({
      x: shoulder.x + f.x * 0.35, y: W.muzzleHeight + 0.02, z: shoulder.z + f.z * 0.35,
      vx: -side.x * (1.6 + this.rng.next()) + (this.rng.next() - 0.5), vy: 2.4 + this.rng.next(), vz: -side.z * (1.6 + this.rng.next()) + (this.rng.next() - 0.5),
      life: 1.2, size: 0.05, color: 0xd8a640, gravity: 14, bounce: 0.35, shrink: false, spin: 18,
    });
    this.shake = Math.min(1, this.shake + 0.12);
    this.sfx.shot();
  }

  private pointBlankHit(x0: number, z0: number, x1: number, z1: number, dirX: number, dirZ: number): BulletHit | null {
    let best: BulletHit | null = null;
    let bestT = Infinity;
    const wall = firstBoxHit(x0, z0, x1, z1, this.level.boxes, W.muzzleHeight);
    if (wall) {
      bestT = wall.t;
      best = { kind: 'wall', x: x0 + (x1 - x0) * wall.t, z: z0 + (z1 - z0) * wall.t, nx: wall.nx, nz: wall.nz, dirX, dirZ };
    }
    this.zombies.forEach((zb, i) => {
      if (!zb.alive || zb.state === 'rising') return;
      const t = segmentCircle(x0, z0, x1, z1, zb.x, zb.z, TUNING.zombie.radius);
      if (t !== null && t < bestT) {
        bestT = t;
        best = { kind: 'target', group: 'zombie', index: i, x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, dirX, dirZ };
      }
    });
    return best;
  }

  private onBulletHit(h: BulletHit): void {
    const y = W.muzzleHeight;
    if (h.kind === 'wall') {
      this.stats.wallHits++;
      this.decals.addHole(h.x, y + (this.rng.next() - 0.5) * 0.08, h.z, h.nx, h.nz);
      for (let i = 0; i < 6; i++) {
        const sp = 2 + this.rng.next() * 4;
        const rx = h.nx * sp + (this.rng.next() - 0.5) * 3 - h.dirX * 0.5;
        const rz = h.nz * sp + (this.rng.next() - 0.5) * 3 - h.dirZ * 0.5;
        this.particles.emit({
          x: h.x + h.nx * 0.03, y, z: h.z + h.nz * 0.03, vx: rx, vy: 1 + this.rng.next() * 3, vz: rz,
          life: 0.18 + this.rng.next() * 0.2, size: 0.05, color: 0xffe2a0, fadeTo: 0xff7a2a, gravity: 9, drag: 2,
        });
      }
      for (let i = 0; i < 3; i++) {
        this.particles.emit({
          x: h.x + h.nx * 0.05, y, z: h.z + h.nz * 0.05,
          vx: h.nx * (0.6 + this.rng.next()), vy: 0.4 + this.rng.next() * 0.5, vz: h.nz * (0.6 + this.rng.next()),
          life: 0.5 + this.rng.next() * 0.3, size: 0.12, color: 0x7d7a72, fadeTo: 0x3b3a37, drag: 3, gravity: -0.2,
        });
      }
      if (this.wallSoundCooldown <= 0) {
        this.sfx.hitWall();
        this.wallSoundCooldown = 0.05;
      }
      return;
    }
    if (h.kind === 'expire') return;

    this.stats.hits++;
    if (h.group === 'zombie') {
      const zb = this.zombies[h.index];
      if (!zb) return;
      const killed = zb.hit(W.damage, h.dirX, h.dirZ);
      this.bloodBurst(h.x, h.z, h.dirX, h.dirZ, killed ? 14 : 7);
      this.hud.floater(String(W.damage), h.x, 1.9, h.z, killed ? 'kill' : '');
      this.hud.hitMarker(killed);
      this.sfx.hitFlesh();
      if (killed) {
        this.stats.kills++;
        this.waves.kills++;
        this.decals.addPool(zb.x + h.dirX * 0.6, zb.z + h.dirZ * 0.6, 1.1);
        this.sfx.kill();
      }
    } else {
      const d = this.dummies[h.index];
      d.hit(W.damage, h.dirX, h.dirZ);
      for (let i = 0; i < 6; i++) {
        this.particles.emit({
          x: h.x, y: y + (this.rng.next() - 0.5) * 0.3, z: h.z,
          vx: -h.dirX * (1 + this.rng.next() * 2) + (this.rng.next() - 0.5) * 2, vy: 1 + this.rng.next() * 2, vz: -h.dirZ * (1 + this.rng.next() * 2) + (this.rng.next() - 0.5) * 2,
          life: 0.5 + this.rng.next() * 0.4, size: 0.07, color: 0xc9ad62, gravity: 6, drag: 2, spin: 10,
        });
      }
      this.hud.floater(String(W.damage), h.x, 2.0, h.z);
      this.hud.hitMarker(false);
      this.sfx.hitWall();
    }
  }

  private bloodBurst(x: number, z: number, dx: number, dz: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const sp = 1.5 + this.rng.next() * 3.5;
      this.particles.emit({
        x, y: W.muzzleHeight + (this.rng.next() - 0.5) * 0.25, z,
        vx: dx * sp + (this.rng.next() - 0.5) * 2.2, vy: 0.5 + this.rng.next() * 2.5, vz: dz * sp + (this.rng.next() - 0.5) * 2.2,
        life: 0.45 + this.rng.next() * 0.4, size: 0.06 + this.rng.next() * 0.05, color: 0x8a1410, fadeTo: 0x3a0806, gravity: 11, drag: 1.5, shrink: false,
      });
    }
  }

  // ---------------------------------------------------------------- 敵人

  spawnZombie(x?: number, z?: number, instant = false): Zombie {
    let sx = x;
    let sz = z;
    if (sx === undefined || sz === undefined) {
      const min = TUNING.waves.minSpawnDistance;
      const options = this.level.spawnPoints.filter((p) => Math.hypot(p.x - this.player.x, p.z - this.player.z) >= min);
      const pool = options.length > 0 ? options : this.level.spawnPoints;
      const p = this.rng.pick(pool);
      sx = p.x + (this.rng.next() - 0.5);
      sz = p.z + (this.rng.next() - 0.5);
    }
    const zb = new Zombie(this.scene, sx, sz, this.rng, instant);
    this.zombies.push(zb);
    if (!instant) {
      for (let i = 0; i < 10; i++) {
        this.particles.emit({
          x: sx + (this.rng.next() - 0.5) * 0.8, y: 0.05, z: sz + (this.rng.next() - 0.5) * 0.8,
          vx: (this.rng.next() - 0.5) * 1.5, vy: 1.5 + this.rng.next() * 2, vz: (this.rng.next() - 0.5) * 1.5,
          life: 0.7, size: 0.1, color: 0x3a3226, gravity: 6, drag: 1,
        });
      }
    }
    return zb;
  }

  private updateZombies(dt: number): void {
    const p = this.player;
    const ctx = {
      targetX: p.x,
      targetZ: p.z,
      targetAlive: p.alive,
      boxes: this.level.boxes,
      nav: this.nav,
      onStrike: () => {
        if (p.takeDamage(TUNING.zombie.damage)) {
          this.stats.damageTaken += TUNING.zombie.damage;
          this.sfx.hurt();
          this.shake = Math.min(1, this.shake + 0.6);
          this.damageFx = 1;
          this.hud.floater(`-${TUNING.zombie.damage}`, p.x, 2.1, p.z, 'kill');
          this.bloodBurst(p.x, p.z, 0, 0, 5);
          if (!p.alive) this.onPlayerDown();
        } else {
          this.sfx.swipe();
        }
      },
    };
    for (const zb of this.zombies) {
      if (zb.update(dt, ctx)) this.sfx.groan();
    }
    // 喪屍之間互相推開
    const R = TUNING.zombie.radius * 2;
    for (let i = 0; i < this.zombies.length; i++) {
      const a = this.zombies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.zombies.length; j++) {
        const b = this.zombies[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < R * R && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (R - d) * 0.5;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
    const remaining: Zombie[] = [];
    for (const zb of this.zombies) {
      if (zb.removed) zb.dispose();
      else remaining.push(zb);
    }
    this.zombies = remaining;
  }

  /** 角色與喪屍互相推開，被包圍時會被擋住。 */
  private separateFromZombies(): void {
    const p = this.player;
    const R = TUNING.player.radius + TUNING.zombie.radius;
    for (const zb of this.zombies) {
      if (!zb.alive || zb.state === 'rising') continue;
      const dx = zb.x - p.x;
      const dz = zb.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = R - d;
        zb.x += (dx / d) * push * 0.7;
        zb.z += (dz / d) * push * 0.7;
        p.x -= (dx / d) * push * 0.3;
        p.z -= (dz / d) * push * 0.3;
      }
    }
    p.syncModel();
  }

  private onPlayerDown(): void {
    this.bt.forceOff();
    this.btWant = false;
    this.sfx.setSlowmo(0);
    this.deadTimer = 0;
    this.hud.toast('你倒下了', 'warn', 1.5);
  }

  // ---------------------------------------------------------------- 場景細節

  private updatePickups(dt: number): void {
    const P = TUNING.pickups;
    for (const pk of this.pickups) {
      if (!pk.active) {
        pk.timer -= dt;
        if (pk.timer <= 0) {
          pk.active = true;
          pk.group.visible = true;
        }
        continue;
      }
      pk.group.children[0].position.y = 0.2 + Math.sin(this.gameTime * 3 + pk.x) * 0.04;
      pk.group.children[0].rotation.y += dt * 0.8;
      if (!this.player.alive) continue;
      if (Math.hypot(pk.x - this.player.x, pk.z - this.player.z) > P.radius) continue;
      if (pk.kind === 'ammo') {
        const space = W.reserveMax - this.player.reserve;
        if (space <= 0) continue;
        const add = Math.min(space, P.ammoAmount);
        this.player.reserve += add;
        pk.timer = P.ammoRespawn;
        this.hud.floater(`+${add} 彈藥`, pk.x, 1.2, pk.z, 'pick');
      } else {
        if (this.player.hp >= TUNING.player.maxHp) continue;
        const add = Math.min(TUNING.player.maxHp - this.player.hp, P.medAmount);
        this.player.hp += add;
        pk.timer = P.medRespawn;
        this.hud.floater(`+${add} 生命`, pk.x, 1.2, pk.z, 'pick');
      }
      pk.active = false;
      pk.group.visible = false;
      this.sfx.pickup();
    }
  }

  private updateAmbient(dt: number): void {
    if (dt <= 0) return;
    // 火桶：火焰、火星、煙
    for (const fl of this.level.flickerLights) {
      const t = this.gameTime + fl.phase;
      if (fl.kind === 'fire') {
        fl.light.intensity = fl.base * (0.72 + 0.18 * Math.sin(t * 13) + 0.1 * Math.sin(t * 29 + 1.3));
      } else {
        // 其中一盞路燈接觸不良，偶爾閃爍
        const broken = fl.phase > 5 && Math.sin(t * 0.7) > 0.93 && Math.sin(t * 37) > 0;
        fl.light.intensity = broken ? fl.base * 0.15 : fl.base;
      }
    }
    this.fireTimers.emit += dt;
    while (this.fireTimers.emit > 1 / 30) {
      this.fireTimers.emit -= 1 / 30;
      for (const o of this.level.fireOrigins) {
        const hot = this.rng.next();
        this.particles.emit({
          x: o.x + (this.rng.next() - 0.5) * 0.45, y: o.y, z: o.z + (this.rng.next() - 0.5) * 0.45,
          vx: (this.rng.next() - 0.5) * 0.4, vy: 1.4 + this.rng.next() * 1.2, vz: (this.rng.next() - 0.5) * 0.4,
          life: 0.35 + this.rng.next() * 0.3, size: 0.14 + this.rng.next() * 0.1,
          color: hot < 0.3 ? 0xfff0b0 : 0xffa53a, fadeTo: 0xc0301a, drag: 1,
        });
        if (this.rng.next() < 0.12) {
          this.particles.emit({
            x: o.x, y: o.y + 0.5, z: o.z, vx: (this.rng.next() - 0.5) * 0.8, vy: 1.8 + this.rng.next(), vz: (this.rng.next() - 0.5) * 0.8,
            life: 1.2, size: 0.04, color: 0xffd070, fadeTo: 0x803010, drag: 0.5, shrink: false,
          });
        }
        if (this.rng.next() < 0.18) {
          this.particles.emit({
            x: o.x, y: o.y + 0.7, z: o.z, vx: 0.25 + (this.rng.next() - 0.5) * 0.3, vy: 0.9 + this.rng.next() * 0.4, vz: 0.15,
            life: 2.2, size: 0.26, color: 0x2a2724, fadeTo: 0x141312, drag: 0.3,
          });
        }
      }
    }
    // 飄落的灰燼
    this.fireTimers.ash += dt;
    while (this.fireTimers.ash > 0.12) {
      this.fireTimers.ash -= 0.12;
      const cx = this.camTarget.x + (this.rng.next() - 0.5) * this.settings.viewHeight * 2;
      const cz = this.camTarget.z + (this.rng.next() - 0.5) * this.settings.viewHeight * 1.4;
      this.particles.emit({
        x: cx, y: 6 + this.rng.next() * 2, z: cz, vx: 0.4 + this.rng.next() * 0.3, vy: -0.7 - this.rng.next() * 0.4, vz: 0.1,
        life: 8, size: 0.045, color: 0x8a8580, fadeTo: 0x3c3a38, shrink: false, spin: 2,
      });
    }
  }

  /** 雷射瞄準線：顯示槍口位置、實際方向，以及第一個會擋住子彈的位置。 */
  private updateLaser(): void {
    const p = this.player;
    const mz = p.muzzle();
    const fw = forwardOf(p.yaw);
    this.flashlight.visible = p.alive;
    this.flashlight.position.set(mz.x - fw.x * 0.3, W.muzzleHeight + 0.15, mz.z - fw.z * 0.3);
    this.flashlight.target.position.set(mz.x + fw.x * 9, 0, mz.z + fw.z * 9);
    this.flashlight.target.updateMatrixWorld();
    this.fillLight.position.set(p.x, 2.4, p.z + 0.6);
    this.laser.visible = p.alive;
    this.laserDot.visible = p.alive;
    if (!p.alive) {
      this.aim.onTarget = false;
      return;
    }
    const m = p.muzzle();
    const s = p.shoulder();
    const f = forwardOf(p.yaw);
    let x0 = m.x;
    let z0 = m.z;
    let x1 = m.x + f.x * W.range;
    let z1 = m.z + f.z * W.range;
    let kind: LaserHit = 'none';
    const blocked = firstBoxHit(s.x, s.z, m.x, m.z, this.level.boxes, W.muzzleHeight);
    if (blocked) {
      x0 = s.x;
      z0 = s.z;
      x1 = s.x + (m.x - s.x) * blocked.t;
      z1 = s.z + (m.z - s.z) * blocked.t;
      kind = 'wall';
    } else {
      let bestT = 1;
      const wall = firstBoxHit(x0, z0, x1, z1, this.level.boxes, W.muzzleHeight);
      if (wall) {
        bestT = wall.t;
        kind = 'wall';
      }
      for (const zb of this.zombies) {
        if (!zb.alive || zb.state === 'rising') continue;
        const t = segmentCircle(x0, z0, x1, z1, zb.x, zb.z, TUNING.zombie.radius);
        if (t !== null && t < bestT) {
          bestT = t;
          kind = 'zombie';
        }
      }
      for (const d of this.dummies) {
        const t = segmentCircle(x0, z0, x1, z1, d.x, d.z, d.radius);
        if (t !== null && t < bestT) {
          bestT = t;
          kind = 'dummy';
        }
      }
      x1 = x0 + (x1 - x0) * bestT;
      z1 = z0 + (z1 - z0) * bestT;
    }
    const pos = this.laser.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, x0, W.muzzleHeight, z0);
    pos.setXYZ(1, x1, W.muzzleHeight, z1);
    pos.needsUpdate = true;
    this.laser.geometry.computeBoundingSphere();
    this.laserDot.position.set(x1, W.muzzleHeight, z1);
    this.laserDot.visible = kind !== 'none';
    Object.assign(this.laserInfo, { x0, z0, x1, z1, hit: kind });
    this.aim.onTarget = kind === 'zombie' || kind === 'dummy';
  }

  /** 擋在鏡頭與角色之間的高物件改用網點淡出，角色不會被完全遮住。 */
  private updateFades(realDt: number): void {
    const p = this.player;
    const d = this.camOffsetDir;
    const hide: THREE.Object3D[] = [];
    for (const fg of this.level.fadeGroups) {
      const b = fg.box;
      const near = p.x > b.minX - 6 && p.x < b.maxX + 6 && p.z > b.minZ - 10 && p.z < b.maxZ + 10;
      let hit = false;
      if (near) {
        for (const [ox, oy] of [
          [0, 1.0],
          [0, 0.35],
          [0, 1.75],
          [0.3, 1.0],
          [-0.3, 1.0],
        ]) {
          if (rayHitsBox3D(p.x + ox, oy, p.z, d.x, d.y, d.z, b, 60)) {
            hit = true;
            break;
          }
        }
      }
      fg.target = hit ? 0.72 : 0;
      fg.fade.value = damp(fg.fade.value, fg.target, 10, realDt);
      if (fg.fade.value < 0.002) fg.fade.value = 0;
      if (fg.fade.value > 0.35) hide.push(...fg.meshes);
    }
    this.pipeline.hideInNormalPass = hide;
  }

  // ---------------------------------------------------------------- 介面

  private updateHud(realDt: number): void {
    const p = this.player;
    const spreadWorld = Math.tan(p.spreadDeg() * DEG) * Math.max(1, Math.hypot(this.aim.x - p.x, this.aim.z - p.z));
    const spreadPx = 4 + (spreadWorld / this.settings.viewHeight) * this.cssH;
    let waveNote = '';
    if (!this.settings.spawning) waveNote = '喪屍生成已關閉（選單可開啟）';
    else if (this.waves.breakRemaining > 0 && this.mode === 'playing') waveNote = `下一波 ${this.waves.breakRemaining.toFixed(1)} 秒`;
    this.hud.update(
      {
        hp: p.hp,
        maxHp: TUNING.player.maxHp,
        mag: p.mag,
        reserve: p.reserve,
        reloadProgress: p.reloading ? 1 - p.reloadTimer / W.reloadTime : -1,
        energy: this.bt.energy,
        maxEnergy: TUNING.bulletTime.max,
        minEnergy: TUNING.bulletTime.minToActivate,
        btActive: this.bt.active,
        wave: this.waves.wave,
        kills: this.stats.kills,
        waveNote,
        crosshairX: this.input.mouseX,
        crosshairY: this.input.mouseY,
        crosshairVisible: this.mode === 'playing' && this.input.mouseInside && p.alive,
        spreadPx: Math.min(60, spreadPx),
        aimOnTarget: this.aim.onTarget,
      },
      realDt,
    );
    this.hud.updateFloaters(realDt, (x, y, z) => this.worldToScreen(x, y, z));
    if (this.settings.showDebug) {
      const info = this.pipeline.info();
      const ri = this.renderer.info.render;
      const lines = [
        `FPS        ${this.fps.toFixed(0)}`,
        `畫面       ${this.settings.pixelMode ? `像素 ${info.lowW}×${info.lowH}（每格 ${info.pixel}px）` : '標準解析度'}`,
        `次像素補償 ${info.offsetX.toFixed(2)}, ${info.offsetY.toFixed(2)}`,
        `時間倍率   ${this.bt.scale.toFixed(2)}`,
        `子彈時間   ${this.bt.energy.toFixed(1)} / ${TUNING.bulletTime.max}`,
        `面向       ${((wrapAngle(p.yaw) / DEG + 360) % 360).toFixed(1)}°`,
        `瞄準       ${((wrapAngle(this.aim.yaw) / DEG + 360) % 360).toFixed(1)}°`,
        `位置       ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`,
        `速度       ${Math.hypot(p.vx, p.vz).toFixed(2)} m/s`,
        `喪屍       ${this.zombies.filter((z) => z.alive).length}`,
        `子彈／粒子 ${this.projectiles.activeCount} / ${this.particles.activeCount}`,
        `繪製呼叫   ${ri.calls}  三角形 ${ri.triangles}`,
      ];
      this.hud.setDebug(true, lines.join('\n'));
    } else {
      this.hud.setDebug(false);
    }
  }

  private render(): void {
    this.pipeline.render(this.scene, this.viewCam, this.settings.viewHeight, {
      slowmo: this.bt.visual,
      damage: this.damageFx,
      pulse: this.pulse,
      pulseCenter: this.pulseCenter,
      time: this.realTime,
    });
  }

  // ---------------------------------------------------------------- 測試介面

  /** 自動化測試與除錯用：讀取狀態、擺放場景。 */
  testApi() {
    return {
      state: () => ({
        mode: this.mode,
        fps: this.fps,
        player: {
          x: this.player.x,
          z: this.player.z,
          yaw: this.player.yaw,
          vx: this.player.vx,
          vz: this.player.vz,
          hp: this.player.hp,
          alive: this.player.alive,
          mag: this.player.mag,
          reserve: this.player.reserve,
          reloading: this.player.reloading,
          muzzle: this.player.muzzle(),
        },
        aim: { ...this.aim },
        laser: { ...this.laserInfo },
        bt: { energy: this.bt.energy, active: this.bt.active, scale: this.bt.scale, visual: this.bt.visual, activations: this.bt.activations },
        zombies: this.zombies.map((z) => ({ id: z.id, x: z.x, z: z.z, hp: z.hp, state: z.state, alive: z.alive })),
        dummies: this.dummies.map((d) => ({ x: d.x, z: d.z, hits: d.hits, total: d.totalDamage })),
        camera: {
          x: this.viewCam.position.x,
          y: this.viewCam.position.y,
          z: this.viewCam.position.z,
          qx: this.viewCam.quaternion.x,
          qy: this.viewCam.quaternion.y,
          qz: this.viewCam.quaternion.z,
          qw: this.viewCam.quaternion.w,
          targetX: this.camTarget.x,
          targetZ: this.camTarget.z,
        },
        settings: { ...this.settings },
        stats: { ...this.stats },
        wave: this.waves.wave,
        pixel: this.pipeline.info(),
        bullets: this.projectiles.activeCount,
        gameTime: this.gameTime,
        fades: this.level.fadeGroups.filter((f) => f.fade.value > 0.3).map((f) => f.box.id),
      }),
      start: () => this.start(),
      reset: () => this.reset(),
      teleport: (x: number, z: number, yaw?: number) => {
        this.player.x = x;
        this.player.z = z;
        this.player.vx = 0;
        this.player.vz = 0;
        if (yaw !== undefined) {
          this.player.yaw = yaw;
          this.aim.yaw = yaw;
        }
        this.player.syncModel();
        this.aim.valid = false;
        this.updateCamera(0, true);
      },
      spawnZombie: (x: number, z: number) => this.spawnZombie(x, z, true).id,
      clearZombies: () => {
        for (const zb of this.zombies) zb.dispose();
        this.zombies = [];
      },
      freezeZombie: (id: number) => {
        const zb = this.zombies.find((z) => z.id === id);
        if (zb) (zb as unknown as { speed: number }).speed = 0;
      },
      damagePlayer: (n: number) => {
        this.player.invulnerable = 0;
        if (this.player.takeDamage(n) && !this.player.alive) this.onPlayerDown();
      },
      setEnergy: (n: number) => {
        this.bt.energy = n;
      },
      setSetting: (patch: Partial<Settings>) => {
        this.applySettings({ ...this.settings, ...patch }, false);
        this.refreshForm();
      },
      worldToScreen: (x: number, y: number, z: number) => this.worldToScreen(x, y, z),
      screenToAim: (x: number, y: number) => {
        const v = this.screenToAimPlane(x, y);
        return v ? { x: v.x, z: v.z } : null;
      },
      boxes: () => this.level.boxes.map((b) => ({ ...b })),
      lastShot: () => ({ ...this.lastShot }),
      /** 立即渲染一幀並讀回畫面像素（CSS 座標），用來檢查畫面與游標是否對齊。 */
      readPixels: (cssX: number, cssY: number, radius: number) => {
        this.render();
        const gl = this.renderer.getContext();
        const dpr = this.renderer.getPixelRatio();
        const r = Math.round(radius * dpr);
        const x = Math.round(cssX * dpr) - r;
        const y = Math.round((this.cssH - cssY) * dpr) - r;
        const w = r * 2 + 1;
        const buf = new Uint8Array(w * w * 4);
        gl.readPixels(x, y, w, w, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return { w, dpr, data: Array.from(buf) };
      },
      /** 整個畫面的亮度統計：確認真的有畫出內容，而不是一片黑。 */
      frameStats: () => {
        this.render();
        const gl = this.renderer.getContext();
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const buf = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let sum = 0;
        let sum2 = 0;
        const n = w * h;
        for (let i = 0; i < buf.length; i += 4) {
          const l = (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
          sum += l;
          sum2 += l * l;
        }
        const mean = sum / n;
        return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), w, h };
      },
    };
  }
}
