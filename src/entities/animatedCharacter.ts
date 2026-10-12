import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterTemplate, ClipRole } from './characterAssets';
import type { CharacterView, MuzzleOffset, ViewAction, ViewState } from './view';
import { markCharacterMaterial, silhouetteMaterial } from '../render/materials';
import { getToonRamp } from '../render/textures';
import { TUNING } from '../config';
import { clamp, damp, wrapAngle } from '../util/math';

/**
 * 以骨架動畫呈現的角色（外部模型）。
 *
 * 移動動作有兩種做法，依模型提供的動作自動選擇：
 * - 方向混合：模型有前、後、左、右的跑步動作時，依移動方向混合四個動作，並同步步伐。
 * - 髖部轉向：只有前進動作時，把髖部轉向移動方向、脊椎反向轉回；後退時倒著播。
 *
 * 主角有瞄準姿勢時，上半身固定播瞄準、下半身播移動，並把上半身轉回正前方，
 * 所以不管往哪裡走，手上的槍都對準滑鼠方向。
 */

const UP = new THREE.Vector3(0, 1, 0);
const FADE = 0.18;
const MAX_TWIST = 1.15;
const DIRECTIONS = ['run', 'walkBack', 'strafeLeft', 'strafeRight'] as const;

export interface AnimatedOptions {
  silhouette: number;
  withGun: boolean;
  /** 每個角色的色調（乘在材質顏色上）。 */
  tint?: THREE.Color;
}

export class AnimatedCharacter implements CharacterView {
  readonly root = new THREE.Group();
  /** 承載起身、下沉、沒有死亡動作時的倒地等整體位移。 */
  private readonly body = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<ClipRole, THREE.AnimationAction>> = {};
  private loco: ClipRole | null = null;
  private readonly directional: boolean;
  private moveBlend = 0;
  private phase = 0;
  private readonly materials: (THREE.Material & { emissive: THREE.Color })[] = [];
  private readonly silhouettes: THREE.Object3D[] = [];
  private readonly hips?: THREE.Object3D;
  private readonly spine?: THREE.Object3D;
  private readonly handR?: THREE.Object3D;
  private readonly gun?: THREE.Group;
  private twist = 0;
  private flash = 0;
  private readonly flashColor = new THREE.Color(1, 1, 1);
  private recoil = 0;
  private lastAction: ViewAction = 'none';
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQ2 = new THREE.Quaternion();
  private readonly tmpV = new THREE.Vector3();
  /** 髖部與脊椎的原始姿勢：每幀先還原再轉向，避免沒有關鍵影格的骨頭累積轉動。 */
  private readonly hipsRest = new THREE.Quaternion();
  private readonly spineRest = new THREE.Quaternion();
  /** 站姿時，「角色正前方」在髖部本地座標裡的方向；用來量髖部被移動動作轉了多少。 */
  private readonly hipsForwardLocal = new THREE.Vector3(0, 0, 1);

  constructor(
    private readonly tpl: CharacterTemplate,
    opts: AnimatedOptions,
  ) {
    this.root.add(this.body);
    const holder = new THREE.Group();
    holder.scale.setScalar(tpl.scale);
    holder.position.copy(tpl.offset);
    const yawFix = new THREE.Group();
    yawFix.rotation.y = THREE.MathUtils.degToRad(tpl.config.yawOffsetDeg);
    this.body.add(yawFix);
    yawFix.add(holder);
    this.model = cloneSkinned(tpl.scene);
    holder.add(this.model);

    const silMat = silhouetteMaterial(opts.silhouette);
    const meshes: THREE.Mesh[] = [];
    this.model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    for (const mesh of meshes) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const src = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const mats = src.map((m) => this.prepareMaterial(m, tpl.config.toon, opts.tint));
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
      // 穿牆剪影：與原網格共用幾何與骨架
      let sil: THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const sk = mesh as THREE.SkinnedMesh;
        const sm = new THREE.SkinnedMesh(sk.geometry, silMat);
        sm.bind(sk.skeleton, sk.bindMatrix);
        sm.bindMode = sk.bindMode;
        sil = sm;
      } else {
        sil = new THREE.Mesh(mesh.geometry, silMat);
      }
      sil.position.copy(mesh.position);
      sil.quaternion.copy(mesh.quaternion);
      sil.scale.copy(mesh.scale);
      sil.renderOrder = 10;
      sil.layers.set(1);
      sil.frustumCulled = false;
      mesh.parent?.add(sil);
      this.silhouettes.push(sil);
    }

    const byName = (name?: string) => (name ? this.model.getObjectByName(name) : undefined);
    this.hips = byName(tpl.bones.hips);
    this.spine = byName(tpl.bones.spine);
    this.handR = byName(tpl.bones.handR);
    if (this.hips) this.hipsRest.copy(this.hips.quaternion);
    if (this.spine) this.spineRest.copy(this.spine.quaternion);

    this.mixer = new THREE.AnimationMixer(this.model);
    for (const [role, clip] of Object.entries(tpl.roles) as [ClipRole, THREE.AnimationClip][]) {
      const a = this.mixer.clipAction(clip);
      if (role === 'death' || role === 'attack' || role === 'hit') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[role] = a;
    }
    this.directional = DIRECTIONS.every((r) => this.actions[r]);
    if (this.directional) {
      // 四個方向的動作一直在播，只調整權重；時間由程式同步，步伐才會一致
      for (const r of DIRECTIONS) {
        const a = this.actions[r]!;
        a.setEffectiveWeight(0).play();
        a.timeScale = 0;
      }
    }
    this.setLoco('idle', 1, true);
    if (tpl.layered) this.actions.aim?.setEffectiveWeight(1).play();

    // 量出站姿時髖部的朝向，之後用來把上半身轉回正前方
    if (this.hips) {
      this.mixer.update(0);
      this.root.updateMatrixWorld(true);
      const hq = this.hips.getWorldQuaternion(new THREE.Quaternion());
      this.hipsForwardLocal.set(0, 0, 1).applyQuaternion(hq.invert());
    }

    if (opts.withGun) {
      this.gun = tpl.layered ? buildPistol() : buildRifle();
      this.root.add(this.gun);
    }
  }

  private prepareMaterial(m: THREE.Material, toon: boolean, tint?: THREE.Color): THREE.Material {
    const src = m as THREE.MeshStandardMaterial;
    let out: THREE.Material & { emissive: THREE.Color; color?: THREE.Color };
    if (toon) {
      out = new THREE.MeshToonMaterial({
        color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
        map: src.map ?? null,
        vertexColors: src.vertexColors,
        gradientMap: getToonRamp(),
        transparent: src.transparent,
        opacity: src.opacity,
        alphaTest: src.alphaTest,
        side: src.side,
      });
    } else {
      const c = m.clone() as THREE.Material & { emissive?: THREE.Color };
      out = (c.emissive ? c : new THREE.MeshStandardMaterial({ color: src.color, map: src.map ?? null })) as THREE.Material & {
        emissive: THREE.Color;
      };
    }
    if (tint && out.color) out.color.multiply(tint);
    markCharacterMaterial(out);
    this.materials.push(out);
    return out;
  }

  /** 槍口相對角色的位置：有瞄準姿勢時用量測值，否則用暫用步槍的參數。 */
  muzzleOffset(): MuzzleOffset {
    if (this.tpl.layered && this.tpl.muzzle) return this.tpl.muzzle;
    return { side: TUNING.player.gunSide, height: TUNING.weapon.muzzleHeight, forward: TUNING.player.muzzleForward };
  }

  /** 切換循環動作（待機、走、跑、後退），以淡入淡出銜接（非方向混合模式）。 */
  private setLoco(role: ClipRole, timeScale: number, instant = false): void {
    const chain: Record<string, ClipRole[]> = {
      idle: ['idle'],
      walk: ['walk', 'run', 'idle'],
      run: ['run', 'walk', 'idle'],
      walkBack: ['walkBack'],
    };
    let found = (chain[role] ?? [role]).find((r) => this.actions[r]);
    if (!found && role === 'idle' && this.actions.walk) {
      // 沒有待機動作：用走路動作的第一格當站姿（播放速度 0）
      found = 'walk';
      timeScale = 0;
    }
    if (!found) return;
    const next = this.actions[found]!;
    next.timeScale = timeScale;
    if (this.loco === found) return;
    const prev = this.loco ? this.actions[this.loco] : undefined;
    next.reset().setEffectiveWeight(1).play();
    if (!instant) next.fadeIn(FADE);
    if (prev && !(this.directional && (DIRECTIONS as readonly string[]).includes(this.loco!))) prev.fadeOut(FADE);
    this.loco = found;
  }

  private stopLoco(fade = FADE): void {
    if (this.loco && !(this.directional && (DIRECTIONS as readonly string[]).includes(this.loco))) this.actions[this.loco]?.fadeOut(fade);
    this.loco = null;
  }

  update(dt: number, st: ViewState): void {
    if (st.action !== this.lastAction) this.onAction(st.action, st);
    this.lastAction = st.action;

    const speed = Math.hypot(st.vx, st.vz);
    const yaw = this.root.rotation.y;
    const fwd = st.vx * Math.sin(yaw) + st.vz * Math.cos(yaw);
    const side = st.vx * Math.cos(yaw) - st.vz * Math.sin(yaw);
    const phi = Math.atan2(side, fwd);
    let twistTarget = 0;
    const locomoting = st.action === 'none' || st.action === 'rising' || (st.action === 'recover' && !this.actions.attack);

    if (this.directional) {
      this.updateDirectional(dt, locomoting && st.action !== 'rising' ? speed : 0, phi, st.action !== 'dead');
    } else if (locomoting) {
      const { walk, run } = this.tpl.speeds;
      if (speed < 0.2 || st.action === 'rising') {
        this.setLoco('idle', 1);
      } else {
        const backward = Math.abs(phi) > 1.95;
        const running = speed > this.tpl.config.runThreshold && !!this.actions.run;
        const base = running ? run : walk;
        if (backward && this.actions.walkBack) {
          this.setLoco('walkBack', speed / walk);
          twistTarget = wrapAngle(phi - Math.PI);
        } else if (backward) {
          // 沒有後退動作：把前進動作倒著播
          this.setLoco(running ? 'run' : 'walk', -speed / base);
          twistTarget = wrapAngle(phi - Math.PI);
        } else {
          this.setLoco(running ? 'run' : 'walk', speed / base);
          twistTarget = phi;
        }
      }
    }
    this.twist = damp(this.twist, clamp(twistTarget, -MAX_TWIST, MAX_TWIST), 10, dt);

    // 整體位移：起身、下沉、沒有死亡動作時的倒地
    const t = Math.min(1, st.actionTime / Math.max(0.001, st.actionDuration));
    if (st.action === 'rising') {
      this.body.position.y = -1.7 * (1 - t) * (1 - t);
      this.body.rotation.x = (1 - t) * 0.6;
    } else if (st.action === 'dead') {
      if (!this.actions.death) {
        const f = Math.min(1, st.actionTime / 0.42);
        this.body.rotation.x = -(Math.PI / 2) * f * f;
        this.body.position.y = 0.13 * f - st.sink;
      } else {
        this.body.position.y = -st.sink;
      }
    } else if ((st.action === 'windup' || st.action === 'recover') && !this.actions.attack) {
      this.body.rotation.x = st.action === 'windup' ? -t * 0.2 : damp(this.body.rotation.x, 0.2, 12, dt);
    } else {
      this.body.rotation.x = damp(this.body.rotation.x, 0, 8, dt);
      this.body.position.y = damp(this.body.position.y, 0, 10, dt);
    }

    if (this.hips) this.hips.quaternion.copy(this.hipsRest);
    if (this.spine) this.spine.quaternion.copy(this.spineRest);
    this.mixer.update(dt);
    if (st.action !== 'dead') this.applyTwist(this.twist, st.reload);

    this.recoil = Math.max(0, this.recoil - dt * 9);
    this.updateGun(st.action === 'dead');

    this.flash = Math.max(0, this.flash - dt * 7);
    for (const m of this.materials) m.emissive.copy(this.flashColor).multiplyScalar(this.flash * 0.7);
  }

  /** 依移動方向混合前、後、左、右四個跑步動作，並與待機動作依速度交叉淡入。 */
  private updateDirectional(dt: number, speed: number, phi: number, alive: boolean): void {
    const target = alive ? clamp(speed / 1.2, 0, 1) : 0;
    this.moveBlend = damp(this.moveBlend, target, 12, dt);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const w = { run: Math.max(0, c), walkBack: Math.max(0, -c), strafeLeft: Math.max(0, s), strafeRight: Math.max(0, -s) };
    const sum = w.run + w.walkBack + w.strafeLeft + w.strafeRight || 1;
    // 每個循環代表的移動距離＝設計速度 × 前進動作長度
    const cycle = this.tpl.speeds.run * this.actions.run!.getClip().duration;
    this.phase = (this.phase + (dt * speed) / Math.max(0.1, cycle)) % 1;
    for (const r of DIRECTIONS) {
      const a = this.actions[r]!;
      a.time = this.phase * a.getClip().duration;
      a.setEffectiveWeight(alive ? (w[r] / sum) * this.moveBlend : 0);
    }
    const idle = this.actions.idle;
    if (idle) {
      if (!idle.isRunning()) idle.play();
      idle.setEffectiveWeight(alive ? 1 - this.moveBlend : 0);
    }
  }

  private onAction(action: ViewAction, st: ViewState): void {
    const { death, attack, aim } = this.actions;
    if (action === 'dead') {
      this.stopLoco(0.12);
      attack?.fadeOut(0.12);
      aim?.fadeOut(0.12);
      if (death) death.reset().setEffectiveWeight(1).fadeIn(0.12).play();
    } else if (action === 'windup' && attack) {
      const total = st.actionDuration + 0.4;
      attack.timeScale = clamp(attack.getClip().duration / total, 0.5, 2.5);
      attack.reset().setEffectiveWeight(1).fadeIn(0.1).play();
      this.stopLoco(0.1);
    } else if (action === 'none' || action === 'rising') {
      if (this.lastAction === 'windup' || this.lastAction === 'recover') attack?.fadeOut(0.2);
      if (this.lastAction === 'dead') {
        death?.stop();
        if (this.tpl.layered) aim?.reset().setEffectiveWeight(1).play();
      }
      this.setLoco('idle', 1);
    }
  }

  /**
   * 1. 髖部轉向移動方向、脊椎反向轉回（只有前進動作的模型）。
   * 2. 分層模式：把上半身轉回角色正前方，抵銷移動動作帶來的髖部轉動。
   * 3. 換彈前傾、開槍後縮。
   */
  private applyTwist(angle: number, reloadLean: number): void {
    if (!this.hips || !this.spine) return;
    this.root.updateMatrixWorld(true);
    if (Math.abs(angle) > 1e-4) {
      this.rotateAboutWorldUp(this.hips, angle);
      this.rotateAboutWorldUp(this.spine, -angle);
    }
    if (this.tpl.layered) {
      const hq = this.hips.getWorldQuaternion(this.tmpQ);
      const f = this.tmpV.copy(this.hipsForwardLocal).applyQuaternion(hq);
      const rootYaw = this.root.getWorldQuaternion(this.tmpQ2);
      f.applyQuaternion(rootYaw.invert());
      const dev = Math.atan2(f.x, f.z);
      if (Math.abs(dev) > 1e-3) this.rotateAboutWorldUp(this.spine, -dev);
    }
    const pitch = reloadLean * 0.35 - this.recoil * 0.08;
    if (Math.abs(pitch) > 1e-4) {
      this.spine.parent!.updateMatrixWorld(true);
      const right = this.tmpV.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(this.tmpQ2));
      const parentQ = this.spine.parent!.getWorldQuaternion(this.tmpQ).invert();
      right.applyQuaternion(parentQ).normalize();
      this.spine.quaternion.premultiply(this.tmpQ2.setFromAxisAngle(right, pitch));
      this.spine.updateMatrixWorld(true);
    }
  }

  private rotateAboutWorldUp(bone: THREE.Object3D, angle: number): void {
    const parent = bone.parent!;
    parent.updateMatrixWorld(true);
    const axis = this.tmpV.copy(UP).applyQuaternion(parent.getWorldQuaternion(this.tmpQ).invert()).normalize();
    bone.quaternion.premultiply(this.tmpQ2.setFromAxisAngle(axis, angle));
    bone.updateMatrixWorld(true);
  }

  /**
   * 槍身永遠朝角色正前方（與子彈方向一致）。
   * 分層模式：手槍放在右手的位置；否則步槍固定在槍口參數的位置。
   */
  private updateGun(dead: boolean): void {
    if (!this.gun) return;
    this.gun.visible = !dead || !this.actions.death;
    if (this.tpl.layered && this.handR) {
      this.root.updateMatrixWorld(true);
      const hand = this.handR.getWorldPosition(this.tmpV);
      this.root.worldToLocal(hand);
      this.gun.position.set(hand.x, hand.y, hand.z - this.recoil * 0.05);
      return;
    }
    const P = TUNING.player;
    this.gun.position.set(P.gunSide, TUNING.weapon.muzzleHeight - 0.02, 0.2 - this.recoil * 0.07);
  }

  hitFlash(amount = 1, color: THREE.ColorRepresentation = 0xffffff): void {
    this.flash = Math.max(this.flash, amount);
    this.flashColor.set(color);
  }

  kickRecoil(): void {
    this.recoil = 1;
  }

  setSilhouetteVisible(v: boolean): void {
    for (const s of this.silhouettes) s.visible = v;
  }

  resetPose(): void {
    this.mixer.stopAllAction();
    this.loco = null;
    this.lastAction = 'none';
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.twist = 0;
    this.recoil = 0;
    this.flash = 0;
    this.moveBlend = 0;
    if (this.directional) {
      for (const r of DIRECTIONS) {
        const a = this.actions[r]!;
        a.reset().setEffectiveWeight(0).play();
        a.timeScale = 0;
      }
    }
    this.setLoco('idle', 1, true);
    if (this.tpl.layered) this.actions.aim?.reset().setEffectiveWeight(1).play();
  }

  /** 目前播放中的動作名稱（除錯與測試用）。 */
  activeClips(): string[] {
    return Object.values(this.actions)
      .filter((a): a is THREE.AnimationAction => !!a && a.isScheduled() && a.getEffectiveWeight() > 0.05)
      .map((a) => a.getClip().name);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }
}

function gunPart(g: THREE.Group, size: [number, number, number], pos: [number, number, number], color: number): void {
  const mat = new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp() });
  markCharacterMaterial(mat);
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos);
  m.castShadow = true;
  g.add(m);
}

/** 暫用的方塊步槍（模型沒有持槍瞄準姿勢時使用）。 */
function buildRifle(): THREE.Group {
  const g = new THREE.Group();
  gunPart(g, [0.08, 0.12, 0.62], [0, 0, 0.36], 0x24262a);
  gunPart(g, [0.06, 0.18, 0.1], [0, -0.13, 0.32], 0x1b1c1f);
  gunPart(g, [0.07, 0.13, 0.24], [0, -0.03, -0.02], 0x3a2c22);
  gunPart(g, [0.05, 0.05, 0.16], [0, 0.01, 0.74], 0x111214);
  return g;
}

/** 暫用的方塊手槍：握把在原點（手的位置），槍管往前。 */
function buildPistol(): THREE.Group {
  const g = new THREE.Group();
  gunPart(g, [0.06, 0.09, 0.26], [0, 0.05, 0.1], 0x26282c);
  gunPart(g, [0.05, 0.12, 0.07], [0, -0.01, -0.01], 0x1b1c1f);
  gunPart(g, [0.04, 0.04, 0.06], [0, 0.06, 0.24], 0x111214);
  return g;
}
