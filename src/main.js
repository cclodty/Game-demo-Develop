import * as THREE from 'three';
import { AudioSys } from './audio.js';
import { Bullets } from './bullets.js';
import { buildCharacter, disposeRig } from './characters.js';
import { CAMERA, FOCUS, GUN_Y, LOGIC_HZ, PLAYER, RATING, VIEWS } from './config.js';
import { Enemies } from './enemies.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { Input, StepInput } from './input.js';
import { Level } from './level.js';
import { MAPS } from './maps.js';
import { loadedCharacters, loadModels } from './models.js';
import { Notes } from './notes.js';
import { Pickups } from './pickups.js';
import { Player } from './player.js';
import { PostFX } from './postfx.js';
import { readQuality } from './quality.js';
import { InputRecord } from './replay.js';
import { randomSeed, readSeed, Rng, vfxRng } from './rng.js';
import { rate, Score } from './score.js';
import { Style } from './style.js';
import { Thrown } from './thrown.js';
import { Tutorial, wantWarmup } from './tutorial.js';
import { clamp, damp, lerp } from './utils.js';
import { MODE_IDS, MODES, Waves } from './waves.js';
import { Grenades } from './weapons.js';

const MAP_KEY = 'bullet-ballet.map';
const MODE_KEY = 'bullet-ballet.mode';
const VIEW_KEY = 'bullet-ballet.view';
const DEFAULT_VIEW = VIEWS.findIndex((v) => v.id === 'iso');
const STEP = 1 / LOGIC_HZ;

const $ = (id) => document.getElementById(id);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const TOGGLES = new Set(['checkbox', 'radio', 'range', 'button']);
const isTyping = (t) => !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !TOGGLES.has(t.type)) || t.isContentEditable);

class Game {
  constructor() {
    this.quality = readQuality(); // 'high' or 'low' (no bloom, no shadows, pixel ratio 1)
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    $('game').appendChild(this.renderer.domElement);
    this.renderer.info.autoReset = false; // reset once per frame in render(), so the stats panel sees the whole frame

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.5, 400);
    // 45° side view by default; V cycles the others and the choice is remembered
    this.view = DEFAULT_VIEW;
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved !== null) this.view = clamp(Math.floor(Number(saved)) || 0, 0, VIEWS.length - 1);
    } catch {
      /* storage unavailable */
    }
    this.camPitch = 1;
    this.camYaw = 0;

    // Game logic draws from rng, reseeded every run (with ?seed=123 the same input
    // plays the same run); effects draw from vfxRng and never touch the game (see rng.js).
    this.fixedSeed = readSeed();
    this.rng = new Rng(this.fixedSeed ?? randomSeed());
    this.vfxRng = vfxRng;

    // The logic advances in fixed steps of 1/LOGIC_HZ s. Each step reads one
    // StepInput (cmd), latched from the keyboard and mouse, or handed in by
    // feed when set (tests; later, replays), and appends it to the run's record.
    this.input = new Input();
    this.cmd = new StepInput();
    this.feed = null;
    this.record = new InputRecord();
    this.acc = 0;
    this.stepCount = 0;
    this.frameSteps = 0;
    this.aimFresh = true; // updateAim() resampled the cursor since a step last took it
    this.aimStep = -2;
    this.aimEvery = 1;
    this.audio = new AudioSys();
    this.fx = new FX(this);
    this.style = new Style(this); // the look; before the level, whose materials it converts as they load
    this.maps = MAPS;
    this.startMap = 0;
    try {
      this.startMap = Math.min(MAPS.length - 1, Math.max(0, Number(localStorage.getItem(MAP_KEY)) || 0));
    } catch {
      this.startMap = 0;
    }
    this.mode = 'arcade'; // see MODES in waves.js; the title screen switches it
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (MODE_IDS.includes(saved)) this.mode = saved;
    } catch {
      /* storage unavailable */
    }
    this.stage = 0;
    this.transition = null;
    this.level = new Level(this);
    if (this.startMap) this.level.load(MAPS[this.startMap]);
    this.bullets = new Bullets(this);
    this.grenades = new Grenades(this);
    this.pickups = new Pickups(this);
    this.thrown = new Thrown(this);
    this.tutorial = new Tutorial(this);
    this.enemies = new Enemies(this);
    this.player = new Player(this);
    this.score = new Score(this);
    this.waves = new Waves(this);
    this.hud = new HUD(this);
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.post.setSize(innerWidth, innerHeight);
    this.post.bloom.enabled = this.quality !== 'low';
    this.applyMapView();

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GUN_Y);
    const start = this.level.start;
    this.aimPoint = new THREE.Vector3(start.x, GUN_Y, start.z - 5);
    this.camTarget = new THREE.Vector3(start.x, 0, start.z);
    this.zoom = 1;
    this.trauma = 0;

    this.state = 'title';
    this.focusActive = false;
    this.focusAmt = 0;
    this.focusMeter = 1;
    this.timeScale = 1;
    this.playerVelScale = 1;
    this.hitstopT = 0;
    this.killcamT = 0;
    this.killcamPos = new THREE.Vector3();
    this.ripple = -1;
    this.rippleCenter = new THREE.Vector2(0.5, 0.5);
    this.hurtFx = 0;
    this.flashFx = 0;
    this.heartT = 0;
    this.deathT = 0;
    this.overAt = 0;
    this.worldTime = 0;
    this.lastKillAt = -9;
    this.lastCloseCall = -LOGIC_HZ; // a logic step number
    this.time = 0; // real time for what is only shown (camera shake, title sway, pulses)
    this.last = performance.now();
    this.notes = new Notes(this);

    addEventListener('resize', () => this.resize());
    this.warmCharacters();
    this.bindUI();
    this.updateCamera(1, true);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Compile every worn character model's shaders now, so the first enemy of a kind doesn't stutter. */
  warmCharacters() {
    const rigs = loadedCharacters().map((model) => buildCharacter({ model }));
    if (!rigs.length) return;
    for (const r of rigs) {
      r.root.position.set(0, -50, 0);
      this.scene.add(r.root);
    }
    this.renderer.compile(this.scene, this.camera);
    for (const r of rigs) {
      this.scene.remove(r.root);
      disposeRig(r);
    }
  }

  // ------------------------------------------------------------ flow

  bindUI() {
    const start = (map = this.startMap) => {
      this.audio.init();
      this.startRun(map);
    };
    for (const id of MODE_IDS) {
      const m = MODES[id];
      const b = document.createElement('button');
      b.className = 'mode-card';
      b.type = 'button';
      b.dataset.mode = id;
      b.style.setProperty('--mode', m.color);
      b.innerHTML = `<span class="mode-zh">${m.name}</span><span class="mode-en">${m.en}</span><span class="mode-desc">${m.desc}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // choosing a mode is not starting a run
        this.setMode(id);
      });
      $('mode-cards').appendChild(b);
    }
    this.markMode();
    const cards = $('map-cards');
    MAPS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'map-card';
      b.type = 'button';
      b.style.setProperty('--map', m.color);
      b.innerHTML = `<span class="map-key">${i + 1}</span><span class="map-zh">${m.name}</span><span class="map-en">${m.en}</span><span class="map-desc">${m.desc}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        start(i);
      });
      cards.appendChild(b);
    });
    this.markMapCard();
    $('title').addEventListener('click', () => start());
    $('gameover').addEventListener('click', () => {
      if (performance.now() - this.overAt > 700) start();
    });
    $('pause').addEventListener('click', () => this.setPaused(false));
    const menu = {
      resume: () => this.setPaused(false),
      restart: () => start(),
      title: () => this.toTitle(),
      note: () => this.notes.openNote(),
      export: () => this.notes.download(),
    };
    for (const b of document.querySelectorAll('.menu button')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        menu[b.dataset.act]();
      });
    }
    addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return; // the note box handles its own keys
      if (e.code === 'Escape' && this.state === 'playing' && this.tutorial.active) return; // Esc skips the warm-up (a recorded control) instead of pausing
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.notes.noteOpen) this.notes.cancelNote();
        else if (this.state === 'playing') this.setPaused(true);
        else if (this.state === 'paused') this.setPaused(false);
      } else if (e.code === 'Backquote') {
        this.notes.togglePanel();
      } else if (e.code === 'KeyN' && (this.state === 'playing' || this.state === 'paused')) {
        e.preventDefault(); // or the N lands in the note box it just focused
        this.notes.openNote();
      } else if (e.code === 'KeyR' && this.state === 'paused') {
        start();
      } else if (e.code === 'KeyT') {
        if (this.state === 'paused' || (this.state === 'over' && performance.now() - this.overAt > 700)) this.toTitle();
      } else if (e.code === 'KeyV' && this.state !== 'paused') {
        this.cycleView();
      } else if (e.code === 'KeyM') {
        const on = this.audio.toggleMusic();
        if (this.state === 'playing') this.hud.feed(on ? 'MUSIC ON' : 'MUSIC OFF', 0, 'dim');
      } else if (e.code === 'Enter') {
        if (this.state === 'title') start();
        else if (this.state === 'over' && performance.now() - this.overAt > 700) start();
      } else if (this.state === 'title' && /^Digit[1-9]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1;
        if (i < MAPS.length) start(i);
      }
    });
    addEventListener('blur', () => this.setPaused(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true);
    });
  }

  markMapCard() {
    [...$('map-cards').children].forEach((c, i) => c.classList.toggle('selected', i === this.startMap));
  }

  setMode(id) {
    this.mode = id;
    try {
      localStorage.setItem(MODE_KEY, id);
    } catch {
      /* storage unavailable */
    }
    this.markMode();
  }

  markMode() {
    for (const c of $('mode-cards').children) c.classList.toggle('selected', c.dataset.mode === this.mode);
    const r = MODES[this.mode];
    $('maps-note').textContent = Number.isFinite(r.waves) ? `每 ${r.perStage} 波換一個場景，第 ${r.waves} 波完結` : `每 ${r.perStage} 波換一個場景`;
  }

  startRun(mapIndex = this.startMap) {
    this.startMap = mapIndex;
    this.markMapCard();
    try {
      localStorage.setItem(MAP_KEY, String(mapIndex));
    } catch {
      /* storage unavailable */
    }
    this.rng.reset(this.fixedSeed ?? randomSeed());
    // a first run opens with the warm-up; a replay plays it if its record did (fixedWarmup)
    const warmup = this.fixedWarmup ?? wantWarmup();
    this.record = new InputRecord({ seed: this.rng.seed, map: mapIndex, mode: MODE_IDS.indexOf(this.mode), warmup, hz: LOGIC_HZ });
    this.resetWorld(MAPS[mapIndex]);
    this.score.useBest(this.mode);
    this.score.reset();
    this.waves.reset();
    this.hud.reset();
    this.notes.reset(MAPS[mapIndex]);
    if (warmup) {
      this.waves.startWarmup();
      this.tutorial.start();
    }
    this.state = 'playing';
    $('title').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('pause').classList.add('hidden');
    document.body.classList.add('playing');
    this.hud.show(true);
    this.audio.resume();
    this.updateCamera(1, true);
    this.last = performance.now();
  }

  /** Abandon the run (from pause or game over) and go back to the map select. */
  toTitle() {
    this.resetWorld(this.level.map);
    this.state = 'title';
    this.notes.hideNote();
    $('pause').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('title').classList.remove('hidden');
    $('title').scrollTop = 0;
    document.body.classList.remove('playing');
    this.hud.show(false);
    this.audio.resume();
    this.updateCamera(1, true);
    this.last = performance.now();
  }

  /** Clear everything a run leaves behind and stand the player at the map's start. */
  resetWorld(map) {
    this.stage = 0;
    this.tutorial.stop();
    this.transition = null;
    $('fade').classList.remove('on');
    this.enemies.clear();
    this.bullets.clear();
    this.grenades.clear();
    this.pickups.clear();
    this.thrown.clear();
    this.style.clearGhosts();
    this.fx.clear();
    if (this.level.map !== map) {
      this.level.load(map);
      this.applyMapView();
      this.renderer.compile(this.scene, this.camera);
    } else {
      this.level.resetProps();
    }
    this.player.reset();
    // the camera looks ahead toward the aim: start every run aiming the same way, not where the last one ended
    this.aimPoint.set(this.player.x, GUN_Y, this.player.z - 5);
    this.focusActive = false;
    this.focusAmt = 0;
    this.focusMeter = 1;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.killcamT = 0;
    this.ripple = -1;
    this.hurtFx = 0;
    this.flashFx = 0;
    this.deathT = 0;
    this.clearT = 0;
    this.worldTime = 0;
    this.lastKillAt = -9;
    this.cmd = new StepInput();
    this.acc = 0;
    this.stepCount = 0;
    this.aimFresh = true;
    this.aimStep = -2;
    this.lastCloseCall = -LOGIC_HZ;
    this.input.dropEdges();
    // camera shake moves what the cursor points at: same seed, same mouse, same run
    this.time = 0;
    this.trauma = 0;
    this.audio.setSlow(0);
  }

  cycleView() {
    this.view = (this.view + 1) % VIEWS.length;
    try {
      localStorage.setItem(VIEW_KEY, String(this.view));
    } catch {
      /* storage unavailable */
    }
    const v = VIEWS[this.view];
    if (this.state === 'playing') this.hud.toast(`鏡頭：${v.name} <small>${v.en} · V</small>`);
    $('view-name').textContent = v.name;
  }

  /** Camera lens, exposure and bloom can differ per map (the daylight Senado map needs its own). */
  applyMapView() {
    const view = this.level.map.camera;
    this.camera.fov = view?.fov ?? CAMERA.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = this.level.exposure;
    this.post.bloom.threshold = this.level.bloom.threshold;
    $('map-credit').textContent = this.level.map.credit || '';
    $('view-name').textContent = VIEWS[this.view].name;
  }

  get stageMap() {
    return MAPS[(this.startMap + this.stage) % MAPS.length];
  }

  beginStageTransition() {
    this.transition = { t: 0, loaded: false };
    $('fade').classList.add('on');
  }

  updateTransition(realDt) {
    const tr = this.transition;
    tr.t += realDt;
    if (!tr.loaded && tr.t >= 0.65) {
      tr.loaded = true;
      this.stage++;
      this.enemies.clear();
      this.bullets.clear();
      this.grenades.clear();
      this.pickups.clear();
      this.thrown.clear();
      this.fx.clear();
      this.level.load(this.stageMap);
      this.notes.log(`轉場 → ${this.stageMap.name}`);
      this.applyMapView();
      this.player.placeAtStart();
      this.updateCamera(1, true);
      this.renderer.compile(this.scene, this.camera);
      $('fade').classList.remove('on');
    }
    if (tr.t >= 1.3) {
      this.transition = null;
      const m = this.stageMap;
      this.hud.banner(`STAGE ${this.stage + 1}`, `${m.name} · ${m.en}`, 'stage');
      this.waves.state = 'intermission';
      this.waves.timer = 2.6;
    }
  }

  setPaused(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      const m = this.stageMap;
      $('pause-info').textContent = `${m.name} · 第 ${Math.max(1, this.waves.wave)} 波 · ${Math.round(this.score.score).toLocaleString('en-US')} 分`;
      $('pause').classList.remove('hidden');
      document.body.classList.remove('playing');
      this.input.releaseAll();
      this.audio.suspend();
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      $('pause').classList.add('hidden');
      document.body.classList.add('playing');
      this.audio.resume();
      this.last = performance.now();
    }
  }

  /** The end of a run: the player fell, or (cleared) the last arcade wave is down. */
  gameOver(cleared = false) {
    this.state = 'over';
    this.overAt = performance.now();
    const isBest = this.score.saveBest();
    const s = this.score;
    $('go-title').textContent = cleared ? 'RUN CLEAR' : 'GAME OVER';
    $('gameover').classList.toggle('cleared', cleared);
    $('go-score').textContent = Math.round(s.score).toLocaleString('en-US');
    $('go-best').textContent = isBest ? 'NEW BEST!' : `BEST ${Math.round(s.best).toLocaleString('en-US')}`;
    $('go-best').classList.toggle('new', isBest);
    $('go-wave').textContent = String(this.waves.wave);
    $('go-time').textContent = clock(this.stepCount / LOGIC_HZ);
    $('go-kills').textContent = String(s.kills);
    $('go-combo').textContent = `x${Math.max(1, s.maxCombo)}`;
    $('go-clean').textContent = `${this.waves.cleanWaves} / ${this.waves.wave}`;
    const graded = !!this.waves.rules.graded;
    $('gameover').classList.toggle('graded', graded);
    if (graded) this.showGrade(cleared);
    $('gameover').classList.remove('hidden');
    document.body.classList.remove('playing');
    this.hud.show(false);
  }

  /** The arcade grade on the end screen: the letter, its three parts, and a hint at the weakest one. */
  showGrade(cleared) {
    const w = this.waves;
    const r = rate({ score: this.score.score, cleanWaves: w.cleanWaves, waves: w.rules.waves, seconds: this.stepCount / LOGIC_HZ, cleared });
    const grade = $('go-grade');
    grade.textContent = r.grade;
    grade.dataset.grade = r.grade;
    for (const key of ['style', 'clean', 'time']) {
      const row = document.querySelector(`#go-parts [data-part=${key}]`);
      row.querySelector('em').style.width = `${(100 * r.parts[key]) / RATING[key]}%`;
      row.querySelector('b').textContent = `${Math.round(r.parts[key])} / ${RATING[key]}`;
    }
    // a run that fell needs to get further first; a cleared one hears about its weakest part
    const weakest = ['style', 'clean', 'time'].reduce((a, b) => (r.parts[b] / RATING[b] < r.parts[a] / RATING[a] ? b : a));
    const hints = {
      style: '下次：多用花式、保住連擊，Style 分佔最多',
      clean: '下次：少捱打，多幾波無傷',
      time: `下次：打快一點，${Math.round(RATING.timePar / 60)} 分鐘內用時滿分`,
    };
    $('go-hint').textContent = cleared ? hints[weakest] : `下次：撐到第 ${w.rules.waves} 波，通關才有用時分`;
    const p = r.parts;
    this.notes.log(`評級 ${r.grade}（Style ${Math.round(p.style)}/${RATING.style} · 無傷 ${Math.round(p.clean)}/${RATING.clean} · 用時 ${Math.round(p.time)}/${RATING.time}）`);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize(innerWidth, innerHeight);
  }

  // ------------------------------------------------------- game events

  shake(v) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  hitstop(t) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  panFor(x) {
    return clamp((x - this.camTarget.x) / 18, -0.8, 0.8);
  }

  addFocus(v) {
    this.focusMeter = Math.min(1, this.focusMeter + v);
  }

  toggleFocus() {
    if (this.focusActive) this.setFocus(false);
    else if (this.focusMeter >= FOCUS.minToEnter) this.setFocus(true);
    else this.audio.denied();
  }

  setFocus(on) {
    if (this.focusActive === on) return;
    this.focusActive = on;
    this.notes.log(`慢鏡${on ? '開' : '關'}（焦點 ${Math.round(this.focusMeter * 100)}%）`);
    if (on) {
      this.audio.focusIn();
      this.startRipple(this.player.x, this.player.z);
      this.heartT = 0.35;
    } else {
      this.audio.focusOut();
    }
  }

  startRipple(x, z) {
    const s = this.hud.project(x, 1, z);
    this.rippleCenter.set(s.x / innerWidth, 1 - s.y / innerHeight);
    this.ripple = 0;
  }

  onEnemyKilled(e, info) {
    const p = this.player;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    const tags = [{ label: e.cfg.label, pts: e.cfg.score }];
    let refill = FOCUS.killRefill;
    if (this.focusActive) tags.push({ label: 'SLOW-MO', pts: 50, cls: 'cyan' });
    if (info.bullet && info.bullet.spinShot) tags.push({ label: 'PIROUETTE', pts: 150, cls: 'pink' });
    else if (p.alive && p.spinning) tags.push({ label: 'SPIN KILL', pts: 100, cls: 'cyan' });
    if (p.alive && p.sliding) tags.push({ label: 'SLIDE KILL', pts: 100, cls: 'cyan' });
    if (info.juggle) tags.push({ label: 'JUGGLE', pts: 120, cls: 'gold' });
    if (info.split) tags.push({ label: 'SPLIT AIM', pts: 100, cls: 'pink' });
    if (info.bullet && info.bullet.scatter) {
      tags.push({ label: 'SCATTER', pts: 150, cls: 'gold' });
      refill += 0.08;
    } else if (info.ricochet) {
      tags.push({ label: 'RICOCHET', pts: 200, cls: 'gold' });
      refill += 0.08;
    }
    if (info.cause === 'explosion') tags.push({ label: 'BOOM', pts: 120, cls: 'gold' });
    if (info.cause === 'kick') tags.push({ label: 'KICK', pts: 150, cls: 'gold' });
    if (info.cause === 'strike') tags.push({ label: 'STRIKE!', pts: 200, cls: 'gold' });
    if (info.cause === 'friendly') tags.push({ label: 'FRIENDLY FIRE', pts: 200, cls: 'gold' });
    if (info.cause === 'bullet') {
      if (d < 2.6) tags.push({ label: 'POINT BLANK', pts: 60 });
      else if (d > 16) tags.push({ label: 'LONG SHOT', pts: 80 });
    }
    if (this.worldTime - this.lastKillAt < 0.5) tags.push({ label: 'MULTI KILL', pts: 100, cls: 'pink' });
    this.lastKillAt = this.worldTime;
    const last = this.waves.finishedSpawning && this.enemies.aliveCount === 0;
    if (info.bullet && info.bullet.kills >= 2) tags.push({ label: 'COLLATERAL', pts: 150 * (info.bullet.kills - 1), cls: 'gold' });
    if (last) tags.push({ label: 'LAST ONE', pts: 100 });

    this.score.kill(tags);
    this.notes.log(`擊殺 ${e.cfg.label}：${tags.map((t) => t.label).join(' + ')} ×${this.score.mult}`);
    this.addFocus(refill);
    this.hud.hitMarker(true);
    this.audio.kill(this.panFor(e.x));
    this.shake(0.22);
    this.hitstop(0.045);
    if (last && p.alive) {
      this.killcamT = 1.3;
      this.killcamPos.set(e.x, 0, e.z);
      this.startRipple(e.x, e.z);
    }
  }

  onCloseCall(spin) {
    if (this.stepCount - this.lastCloseCall < LOGIC_HZ / 4) return;
    this.lastCloseCall = this.stepCount;
    this.notes.log(spin ? '旋轉中子彈穿身（DODGE）' : '子彈擦身（CLOSE CALL）');
    if (spin) {
      this.score.style('DODGE', 40);
      this.addFocus(0.06);
    } else {
      this.score.style('CLOSE CALL', 25);
      this.addFocus(FOCUS.closeCallRefill);
    }
  }

  onPlayerHurt(dmg, source = '子彈') {
    this.notes.log(`被${source}打中 −${dmg}（HP ${Math.max(0, Math.ceil(this.player.hp))}）`);
    this.score.breakCombo();
    this.score.rank.hit();
    this.waves.hurt = true;
    this.hurtFx = Math.min(1, this.hurtFx + 0.45 + dmg / 60);
    this.shake(0.35);
    this.audio.hurt();
  }

  onPlayerDeath() {
    this.state = 'dying';
    this.notes.log('倒下');
    this.deathT = 0;
    this.focusActive = false;
    this.audio.death();
    this.startRipple(this.player.x, this.player.z);
    this.hud.banner('YOU DIED', '你倒下了', 'dead');
  }

  onWaveClear(n, stageEnd = false) {
    if (!this.player.alive) return;
    const bonus = 250 * n;
    this.notes.log(`第 ${n} 波清空${stageEnd ? '，準備轉場' : ''}`);
    this.score.bonus('WAVE CLEAR', bonus);
    this.addFocus(0.35);
    this.player.hp = PLAYER.hp;
    const next = stageEnd ? ` · 下一站：${MAPS[(this.startMap + this.stage + 1) % MAPS.length].name}` : '';
    this.hud.banner(stageEnd ? 'STAGE CLEAR' : 'WAVE CLEAR', `+${bonus.toLocaleString('en-US')} · 生命值回滿${next}`, 'clear');
    this.audio.waveClear();
  }

  /** The last wave of an arcade run is down: a moment to enjoy it, then the RUN CLEAR screen. */
  onRunClear(n) {
    if (!this.player.alive) return;
    const bonus = 250 * n;
    this.notes.log(`第 ${n} 波清空：通關（RUN CLEAR）`);
    this.score.bonus('RUN CLEAR', bonus);
    this.player.invuln = 99; // nothing still flying can take the run away now
    this.clearT = 2.6;
    this.hud.banner('RUN CLEAR', `全部 ${n} 波清空 · +${bonus.toLocaleString('en-US')}`, 'clear');
    this.audio.waveClear();
  }

  explode(x, z, r, opts = {}) {
    const p = this.player;
    this.fx.explosion(x, z, r);
    this.audio.explosion(this.panFor(x));
    this.level.noise(x, z, 20);
    const dp = Math.hypot(p.x - x, p.z - z);
    this.shake(clamp(1.1 - dp / 25, 0.3, 0.9));
    this.flashFx = Math.max(this.flashFx, clamp(0.16 - dp / 120, 0, 0.16));
    this.hitstop(0.06);

    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > r + e.radius || !this.level.hasLOS(x, z, e.x, e.z)) continue;
      const k = 1 / (d || 1);
      e.blast((e.x - x) * k, (e.z - z) * k, d < r * 0.65 ? 20 : 5);
    }
    for (const e of this.enemies.corpses) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > r + 1) continue;
      const k = (14 * (1 - d / (r + 1))) / (d || 1);
      e.vx += (e.x - x) * k;
      e.vz += (e.z - z) * k;
    }
    if (p.alive && dp < r && this.level.hasLOS(x, z, p.x, p.z)) {
      const dmg = Math.round(lerp(55, 15, dp / r));
      const k = 1 / (dp || 1);
      const mul = (p.spinning ? 0.5 : 1) * (opts.selfMul ?? 1);
      p.hurt(Math.round(dmg * mul), (p.x - x) * k, (p.z - z) * k, true);
    }
    for (const b of this.level.barrels) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d > 0.01 && d < r) b.ignite(0.1 + d * 0.025);
    }
    for (const pan of this.level.pans) {
      const d = Math.hypot(pan.x - x, pan.z - z);
      if (d > r + 1) continue;
      const k = 1 / (d || 1);
      pan.hit((pan.x - x) * k, (pan.z - z) * k, 9 * (1 - d / (r + 1)));
      pan.vy = 7;
    }
    for (const s of this.level.glass) {
      if (!s.alive) continue;
      const cx = clamp(x, s.minX, s.maxX);
      const cz = clamp(z, s.minZ, s.maxZ);
      const d = Math.hypot(cx - x, cz - z);
      if (d < r + 0.5) this.level.breakGlass(s, (cx - x) / (d || 1), (cz - z) / (d || 1));
    }
  }

  // ------------------------------------------------------------- loop

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const rawDt = Math.max(0, (now - this.last) / 1000);
    const realDt = Math.min(0.05, rawDt);
    this.last = now;
    this.time += realDt;
    if (this.state !== 'paused') {
      this.updateAim();
      if (this.state === 'playing' || this.state === 'dying') this.updatePlay(realDt);
      else this.updateIdle(realDt);
    }
    // in a run the logic steps take the presses (a fast frame may hold one over to the next step)
    if (this.state !== 'playing' && this.state !== 'dying') this.input.dropEdges();
    this.notes.update(realDt, rawDt);
    this.render();
  }

  updateAim() {
    const m = this.input.mouse;
    this.ndc.set((m.x / innerWidth) * 2 - 1, -(m.y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint);
    this.aimFresh = true;
  }

  /** One displayed frame of a run: as many fixed logic steps as realDt covers, then what is only shown. */
  updatePlay(realDt) {
    this.acc += realDt;
    this.frameSteps = 0;
    // A frame of 1/60 s or more takes the cursor on its first step. Faster screens
    // (0-1 steps a frame) take it every other step: a 60 Hz aim on any screen,
    // which keeps the input record small.
    this.aimEvery = this.acc > 2 * STEP - 1e-9 ? 1 : 2;
    // a hair of slack, so float rounding never turns a 60 Hz frame into one step and the next into three
    while (this.acc > STEP - 1e-9 && (this.state === 'playing' || this.state === 'dying')) {
      this.acc -= STEP;
      this.step();
      this.frameSteps++;
    }
    this.present(realDt);
  }

  /** One fixed logic step: take this step's input (latched or fed), record it, move the game 1/LOGIC_HZ s. */
  step() {
    const p = this.player;
    // the cursor is resampled once a frame (updateAim); see updatePlay for how often a step takes it
    let aim = null;
    if (this.aimFresh && this.stepCount - this.aimStep >= this.aimEvery) {
      aim = this.aimPoint;
      this.aimFresh = false;
      this.aimStep = this.stepCount;
    }
    this.cmd = this.feed ? this.feed(this) : this.input.latch(this.cmd, aim, p.x, p.z, this.camYaw);
    this.record.push(this.cmd);
    this.stepCount++;
    this.logic(STEP);
  }

  /** The game itself for h seconds of real time: bullet time, everyone's moves, waves and score. */
  logic(h) {
    const cmd = this.cmd;
    if (this.state === 'playing' && cmd.hit('ShiftLeft', 'ShiftRight', 'KeyQ')) this.toggleFocus();
    if (this.focusActive) {
      this.focusMeter -= FOCUS.drain * h;
      if (this.focusMeter <= 0) {
        this.focusMeter = 0;
        this.setFocus(false);
      }
      this.heartT -= h;
      if (this.heartT <= 0) {
        this.heartT = 0.85;
        this.audio.heartbeat();
      }
    } else {
      this.focusMeter = Math.min(1, this.focusMeter + FOCUS.regen * h);
    }

    this.focusAmt = damp(this.focusAmt, this.focusActive ? 1 : 0, 9, h);
    let ts = lerp(1, FOCUS.worldScale, this.focusAmt);
    let ps = lerp(1, FOCUS.playerScale, this.focusAmt);
    if (this.killcamT > 0) {
      this.killcamT -= h;
      const k = this.killcamT > 0.35 ? 0.07 : lerp(1, 0.07, this.killcamT / 0.35);
      ts = Math.min(ts, k);
      ps = Math.min(ps, k);
    }
    if (this.state === 'dying') {
      this.deathT += h;
      ts = ps = 0.14;
      if (this.deathT > 2.3) this.gameOver();
    }
    this.audio.setSlow(clamp((1 - ts) / (1 - FOCUS.worldScale), 0, 1));
    if (this.hitstopT > 0) {
      this.hitstopT -= h;
      ts *= 0.1;
      ps *= 0.1;
    }
    this.timeScale = ts;
    this.playerVelScale = ts > 0 ? ps / ts : 1;
    const dt = h * ts;
    const pdt = h * ps;
    this.worldTime += dt;

    if (this.transition) this.updateTransition(h);
    this.player.update(pdt, cmd);
    this.enemies.update(dt);
    this.level.updateProps(dt);
    this.bullets.update(dt);
    this.grenades.update(dt);
    this.thrown.update(dt);
    this.pickups.update(dt, h, cmd);
    this.tutorial.update(h);
    this.waves.update(dt, h);
    this.score.update(dt, h);
    if (this.clearT > 0) {
      this.clearT -= h;
      if (this.clearT <= 0) this.gameOver(true);
    }
  }

  /** What a frame shows but the logic never reads: effects, ambient life, screen flashes, camera, HUD. */
  present(realDt) {
    const dt = realDt * this.timeScale;
    this.fx.update(dt);
    this.style.update(dt);
    this.level.updateAmbient(realDt, dt, this.camTarget.x, this.camTarget.z);

    this.hurtFx = Math.max(0, this.hurtFx - realDt * 1.8);
    this.flashFx = Math.max(0, this.flashFx - realDt * 3);
    if (this.ripple >= 0) {
      this.ripple += realDt * 1.3;
      if (this.ripple >= 1) this.ripple = -1;
    }
    this.updateCamera(realDt);
    if (this.state !== 'over') this.hud.update(realDt);
  }

  updateIdle(realDt) {
    const dt = this.state === 'over' ? realDt * 0.3 : realDt;
    this.enemies.update(dt);
    this.level.updateProps(dt);
    this.bullets.update(dt);
    this.grenades.update(dt);
    this.fx.update(dt);
    this.style.update(dt);
    this.level.updateAmbient(realDt, dt, this.camTarget.x, this.camTarget.z);
    this.focusAmt = damp(this.focusAmt, 0, 4, realDt);
    this.hurtFx = Math.max(0, this.hurtFx - realDt * 1.8);
    if (this.ripple >= 0) {
      this.ripple += realDt * 1.3;
      if (this.ripple >= 1) this.ripple = -1;
    }
    this.updateCamera(realDt);
  }

  updateCamera(realDt, snap = false) {
    const p = this.player;
    let tx = p.x;
    let tz = p.z;
    let zoom = 1;
    if (this.state === 'playing') {
      // holding right mouse with a sniper rifle pushes the view out along the aim
      const scoped = p.alive && p.weapon.scope && this.input.mouse.right;
      const ahead = scoped ? 0.55 : CAMERA.lookAhead;
      const aheadMax = scoped ? 13 : CAMERA.lookAheadMax;
      let lx = (this.aimPoint.x - p.x) * ahead;
      let lz = (this.aimPoint.z - p.z) * ahead;
      const ll = Math.hypot(lx, lz);
      if (ll > aheadMax) {
        lx *= aheadMax / ll;
        lz *= aheadMax / ll;
      }
      if (scoped) zoom *= 1.12;
      tx += lx;
      tz += lz;
      zoom *= lerp(1, CAMERA.focusZoom, this.focusAmt);
      if (this.killcamT > 0) {
        tx = lerp(tx, this.killcamPos.x, 0.6);
        tz = lerp(tz, this.killcamPos.z, 0.6);
        zoom *= 0.74;
      }
    } else if (this.state === 'dying' || this.state === 'over') {
      zoom = 0.68;
    } else if (this.state === 'title') {
      tz -= 1.5;
      zoom = 0.82 + Math.sin(this.time * 0.25) * 0.03;
    }
    this.zoom = snap ? zoom : damp(this.zoom, zoom, 4, realDt);
    if (snap) this.camTarget.set(tx, 0, tz);
    else {
      this.camTarget.x = damp(this.camTarget.x, tx, 5, realDt);
      this.camTarget.z = damp(this.camTarget.z, tz, 5, realDt);
    }

    this.trauma = Math.max(0, this.trauma - realDt * 1.7);
    const s = this.trauma * this.trauma * 0.8;
    const t = this.time * 38;
    const sx = s * (Math.sin(t * 1.13) + 0.5 * Math.sin(t * 2.71));
    const sz = s * (Math.cos(t * 0.97) + 0.5 * Math.sin(t * 2.33));
    const c = this.camTarget;
    const lens = this.level.map.camera || {};
    const view = VIEWS[this.view];
    const deg = Math.PI / 180;
    const pitch = (view.pitch ?? lens.pitch ?? CAMERA.pitch) * deg;
    const yaw = (view.yaw ?? 0) * deg;
    // ease between views so pressing V swings the camera rather than cutting
    this.camPitch = snap ? pitch : damp(this.camPitch, pitch, 6, realDt);
    this.camYaw = snap ? yaw : damp(this.camYaw, yaw, 6, realDt);
    const dist = (lens.dist ?? CAMERA.dist) * this.zoom;
    const hor = Math.cos(this.camPitch) * dist;
    this.camera.position.set(c.x + Math.sin(this.camYaw) * hor + sx, Math.sin(this.camPitch) * dist, c.z + Math.cos(this.camYaw) * hor + sz);
    this.camera.lookAt(c.x + sx * 0.4, 0, c.z + sz * 0.4);

    // Cut a hole through whatever stands between the camera and the player:
    // always on the Senado map (17-25 m buildings), on every map once the camera tilts.
    const cut = this.level.cut;
    const tilted = view.pitch !== undefined;
    const radius = this.level.map.cutaway ? (tilted ? 5.5 : 4.2) : tilted ? 2.2 : 0;
    cut.uCutR.value = radius;
    if (radius > 0) {
      this.camera.updateMatrixWorld();
      cut.uCutA.value.copy(this.camera.position);
      cut.uCutB.value.set(p.x, this.level.groundY(p.x, p.z) + 1.2, p.z);
    }
  }

  render() {
    this.renderer.info.reset();
    const u = this.post.u;
    let focus = this.focusAmt;
    if (this.killcamT > 0) focus = Math.max(focus, 0.85);
    if (this.state === 'dying' || this.state === 'over') focus = Math.max(focus, 0.9);
    u.uFocus.value = focus;
    let hurt = this.hurtFx;
    if ((this.state === 'playing' || this.state === 'paused') && this.player.hp < 35) {
      hurt = Math.max(hurt, 0.25 + 0.15 * Math.sin(this.time * 6));
    }
    u.uHurt.value = hurt;
    u.uFlash.value = this.flashFx;
    u.uRipple.value = this.ripple;
    u.uCenter.value.copy(this.rippleCenter);
    this.post.bloom.strength = this.level.bloom.strength + focus * 0.25;
    this.post.render();
  }
}

// optional models first (none is fine), then the game — which starts even if loading fails
loadModels()
  .catch((err) => console.warn('[models] skipped', err))
  .then(() => {
    window.game = new Game();
  });
