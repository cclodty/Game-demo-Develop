import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { CharacterTemplate, ClipRole } from './characterAssets';
import type { CharacterView, ViewAction, ViewState } from './view';
import { markCharacterMaterial, silhouetteMaterial } from '../render/materials';
import { getToonRamp } from '../render/textures';
import { TUNING } from '../config';
import { clamp, damp, wrapAngle } from '../util/math';

/**
 * 以骨架動畫呈現的角色（外部模型）。
 * - 依移動速度在待機、走、跑之間淡入淡出，播放速度跟著實際速度調整，避免腳滑。
 * - 橫移、後退時把髖部轉向移動方向，脊椎反向轉回，讓上半身與槍維持對準滑鼠。
 * - 沒有後退動作時，把走路動作倒著播。
 */

const UP = new THREE.Vector3(0, 1, 0);
const FADE = 0.18;
const MAX_TWIST = 1.15;

export interface AnimatedOptions {
  silhouette: number;
  withGun: boolean;
}

export class AnimatedCharacter implements CharacterView {
  readonly root = new THREE.Group();
  /** 承載起身、下沉、沒有死亡動作時的倒地等整體位移。 */
  private readonly body = new THREE.Group();
  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<ClipRole, THREE.AnimationAction>> = {};
  private loco: ClipRole | null = null;
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
      const mats = src.map((m) => this.prepareMaterial(m, tpl.config.toon));
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
      // 穿牆剪影：與原網格共用幾何與骨架
      let sil: THREE.Mesh;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        const sk = mesh as THREE.SkinnedMesh;
        const s = new THREE.SkinnedMesh(sk.geometry, silMat);
        s.bind(sk.skeleton, sk.bindMatrix);
        s.bindMode = sk.bindMode;
        sil = s;
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
    this.setLoco('idle', 1, true);

    if (opts.withGun) {
      this.gun = buildGun();
      this.root.add(this.gun);
    }
  }

  private prepareMaterial(m: THREE.Material, toon: boolean): THREE.Material {
    const src = m as THREE.MeshStandardMaterial;
    let out: THREE.Material & { emissive: THREE.Color };
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
    markCharacterMaterial(out);
    this.materials.push(out);
    return out;
  }

  /** 切換循環動作（待機、走、跑、後退），以淡入淡出銜接。 */
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
    prev?.fadeOut(FADE);
    this.loco = found;
  }

  private stopLoco(fade = FADE): void {
    if (this.loco) this.actions[this.loco]?.fadeOut(fade);
    this.loco = null;
  }

  update(dt: number, st: ViewState): void {
    const cfg = this.tpl.config;
    if (st.action !== this.lastAction) this.onAction(st.action, st);
    this.lastAction = st.action;

    const speed = Math.hypot(st.vx, st.vz);
    let twistTarget = 0;
    const locomoting = st.action === 'none' || st.action === 'rising' || (st.action === 'recover' && !this.actions.attack);
    if (locomoting) {
      if (speed < 0.2 || st.action === 'rising') {
        this.setLoco('idle', 1);
      } else {
        const yaw = this.root.rotation.y;
        const fwd = st.vx * Math.sin(yaw) + st.vz * Math.cos(yaw);
        const side = st.vx * Math.cos(yaw) - st.vz * Math.sin(yaw);
        const phi = Math.atan2(side, fwd);
        const backward = Math.abs(phi) > 1.95;
        const running = speed > cfg.runThreshold && !!this.actions.run;
        const base = running ? cfg.runSpeed : cfg.walkSpeed;
        if (backward && this.actions.walkBack) {
          this.setLoco('walkBack', speed / cfg.walkSpeed);
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
    this.updateGun();

    this.flash = Math.max(0, this.flash - dt * 7);
    for (const m of this.materials) m.emissive.copy(this.flashColor).multiplyScalar(this.flash * 0.7);
  }

  private onAction(action: ViewAction, st: ViewState): void {
    const { death, attack } = this.actions;
    if (action === 'dead') {
      this.stopLoco(0.12);
      attack?.fadeOut(0.12);
      if (death) {
        death.reset().setEffectiveWeight(1).fadeIn(0.12).play();
      }
    } else if (action === 'windup' && attack) {
      const total = st.actionDuration + 0.4;
      attack.timeScale = clamp(attack.getClip().duration / total, 0.5, 2.5);
      attack.reset().setEffectiveWeight(1).fadeIn(0.1).play();
      this.stopLoco(0.1);
    } else if (action === 'none' || action === 'rising') {
      if (this.lastAction === 'windup' || this.lastAction === 'recover') attack?.fadeOut(0.2);
      if (this.lastAction === 'dead') death?.stop();
      this.setLoco('idle', 1);
    }
  }

  /** 髖部轉向移動方向、脊椎反向轉回：腿跟著走，上半身仍對準瞄準方向。 */
  private applyTwist(angle: number, reloadLean: number): void {
    if (!this.hips || !this.spine) return;
    this.root.updateMatrixWorld(true);
    if (Math.abs(angle) > 1e-4) {
      this.rotateAboutWorldUp(this.hips, angle);
      this.rotateAboutWorldUp(this.spine, -angle);
    }
    // 換彈時上半身前傾、開槍時往後一縮
    const pitch = reloadLean * 0.35 - this.recoil * 0.08;
    if (Math.abs(pitch) > 1e-4) {
      this.spine.parent!.updateMatrixWorld(true);
      const right = this.tmpV.set(1, 0, 0).applyQuaternion(this.root.getWorldQuaternion(this.tmpQ2));
      const parentQ = this.spine.parent!.getWorldQuaternion(this.tmpQ).invert();
      right.applyQuaternion(parentQ).normalize();
      this.spine.quaternion.premultiply(this.tmpQ2.setFromAxisAngle(right, pitch));
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
   * 槍：有持槍動作的模型，槍跟著右手位置移動；沒有的話固定在槍口參數的位置。
   * 兩種情況槍身都朝角色正前方，與實際射擊方向一致。
   */
  private updateGun(): void {
    if (!this.gun) return;
    const P = TUNING.player;
    const baseX = P.gunSide;
    const baseY = TUNING.weapon.muzzleHeight - 0.02;
    const baseZ = 0.2;
    let x: number = baseX;
    let y: number = baseY;
    if (this.tpl.hasGunPose && this.handR) {
      this.root.updateMatrixWorld(true);
      const hand = this.handR.getWorldPosition(this.tmpV);
      this.root.worldToLocal(hand);
      // 只跟隨手的左右與高度，前後仍以槍口參數為準
      x = clamp(hand.x, baseX - 0.15, baseX + 0.15);
      y = clamp(hand.y, baseY - 0.2, baseY + 0.15);
    }
    this.gun.position.set(x, y, baseZ - this.recoil * 0.07);
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
    this.setLoco('idle', 1, true);
  }

  /** 目前播放中的動作名稱（除錯與測試用）。 */
  activeClips(): string[] {
    return Object.values(this.actions)
      .filter((a): a is THREE.AnimationAction => !!a && a.isRunning() && a.getEffectiveWeight() > 0.01)
      .map((a) => a.getClip().name);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if (this.materials.includes(m as never)) m.dispose();
      }
    });
    this.root.removeFromParent();
  }
}

/** 暫用的方塊步槍（外部模型通常不附槍）。 */
function buildGun(): THREE.Group {
  const g = new THREE.Group();
  const mk = (size: [number, number, number], pos: [number, number, number], color: number) => {
    const mat = new THREE.MeshToonMaterial({ color, gradientMap: getToonRamp() });
    markCharacterMaterial(mat);
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
    m.position.set(...pos);
    m.castShadow = true;
    g.add(m);
  };
  mk([0.08, 0.12, 0.62], [0, 0, 0.36], 0x24262a);
  mk([0.06, 0.18, 0.1], [0, -0.13, 0.32], 0x1b1c1f);
  mk([0.07, 0.13, 0.24], [0, -0.03, -0.02], 0x3a2c22);
  mk([0.05, 0.05, 0.16], [0, 0.01, 0.74], 0x111214);
  return g;
}
