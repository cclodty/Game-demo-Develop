import * as THREE from 'three';
import { markCharacterMaterial, setFlashEmissive, silhouetteMaterial, toon } from '../render/materials';
import { TUNING } from '../config';
import { damp } from '../util/math';
import type { CharacterView, MuzzleOffset, ViewState } from './view';

/**
 * 可連續轉向的幾何暫用人形（CH-01 / CH-04 / RIG-01 的 R1 替代品）。
 * 整個人物以 root.rotation.y 平滑轉身；腿部以程序擺動表現前進、後退與橫移。
 */

export interface HumanoidStyle {
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  shoes: number;
  eyes?: number; // 有值時眼睛發光（喪屍）
  backpack?: number;
  withGun?: boolean;
  zombie?: boolean;
  silhouette: number;
}

const HIP_Y = 0.86;
const SHOULDER_Y = 1.4;

export class Humanoid implements CharacterView {
  readonly root = new THREE.Group();
  /** 承載倒下、前傾等整體姿勢；root 只負責位置與面向。 */
  readonly body = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly gun = new THREE.Group();
  readonly muzzle = new THREE.Object3D();
  private readonly materials: THREE.MeshToonMaterial[] = [];
  private readonly silhouettes: THREE.Mesh[] = [];
  private walkPhase = 0;
  private flash = 0;
  private flashColor = new THREE.Color(1, 1, 1);
  private time = 0;
  private recoil = 0;
  private lean = 0;

  private static nextId = 1;
  private readonly id = Humanoid.nextId++;

  constructor(readonly style: HumanoidStyle) {
    this.root.add(this.body);
    const silMat = silhouetteMaterial(style.silhouette);

    const part = (
      parent: THREE.Object3D,
      size: [number, number, number],
      pos: [number, number, number],
      color: number,
      opts: { glow?: boolean; noSilhouette?: boolean } = {},
    ) => {
      const geo = new THREE.BoxGeometry(...size);
      let mat: THREE.Material;
      if (opts.glow) {
        mat = new THREE.MeshBasicMaterial({ color });
      } else {
        const m = toon({ color });
        this.materials.push(m);
        mat = m;
      }
      markCharacterMaterial(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      if (!opts.noSilhouette) {
        const sil = new THREE.Mesh(geo, silMat);
        sil.position.copy(mesh.position);
        sil.renderOrder = 10;
        sil.layers.set(1);
        parent.add(sil);
        this.silhouettes.push(sil);
      }
      return mesh;
    };

    // 腿：以髖部為支點
    for (const [leg, sx] of [
      [this.legL, 1],
      [this.legR, -1],
    ] as const) {
      leg.position.set(0.12 * sx, HIP_Y, 0);
      this.body.add(leg);
      part(leg, [0.19, 0.78, 0.21], [0, -0.39, 0], style.pants);
      part(leg, [0.21, 0.1, 0.3], [0, -0.81, 0.04], style.shoes);
    }

    // 軀幹
    this.torso.position.set(0, HIP_Y, 0);
    this.body.add(this.torso);
    part(this.torso, [0.48, 0.14, 0.28], [0, 0.04, 0], style.pants);
    part(this.torso, [0.52, 0.5, 0.3], [0, 0.36, 0], style.shirt);
    if (style.backpack !== undefined) {
      part(this.torso, [0.38, 0.42, 0.17], [0, 0.34, -0.24], style.backpack);
      part(this.torso, [0.3, 0.12, 0.08], [0, 0.18, -0.34], style.backpack - 0x0a0a0a);
    }

    // 頭：臉朝 +Z（前方），眼睛標示面向
    this.head.position.set(0, SHOULDER_Y - HIP_Y + 0.08, 0);
    this.torso.add(this.head);
    part(this.head, [0.32, 0.32, 0.32], [0, 0.17, 0], style.skin);
    part(this.head, [0.34, 0.1, 0.34], [0, 0.31, -0.01], style.hair);
    if (!style.zombie) part(this.head, [0.34, 0.2, 0.08], [0, 0.18, -0.15], style.hair, { noSilhouette: true });
    const eyeColor = style.eyes ?? 0x1a1410;
    for (const ex of [-0.075, 0.075]) {
      part(this.head, [0.06, 0.05, 0.02], [ex, 0.19, 0.165], eyeColor, { glow: style.eyes !== undefined, noSilhouette: true });
    }

    // 手臂：以肩膀為支點
    for (const [arm, sx] of [
      [this.armL, 1],
      [this.armR, -1],
    ] as const) {
      arm.position.set(0.33 * sx, SHOULDER_Y - HIP_Y, 0);
      // 先前伸（X）再向內收（Y），持槍時雙手才會靠攏到槍上
      arm.rotation.order = 'YXZ';
      this.torso.add(arm);
      part(arm, [0.15, 0.52, 0.17], [0, -0.24, 0], style.shirt);
      part(arm, [0.13, 0.12, 0.14], [0, -0.53, 0], style.skin);
    }

    if (style.withGun) {
      // WP-01：槍口位置與 TUNING 的槍口參數一致
      const gunMat = 0x24262a;
      this.gun.position.set(TUNING.player.gunSide, TUNING.weapon.muzzleHeight - HIP_Y - 0.02, 0.2);
      this.torso.add(this.gun);
      part(this.gun, [0.08, 0.12, 0.62], [0, 0, 0.36], gunMat);
      part(this.gun, [0.06, 0.18, 0.1], [0, -0.13, 0.32], 0x1b1c1f);
      part(this.gun, [0.07, 0.13, 0.24], [0, -0.03, -0.02], 0x3a2c22);
      part(this.gun, [0.05, 0.05, 0.16], [0, 0.01, 0.74], 0x111214);
      this.muzzle.position.set(0, 0.02, TUNING.player.muzzleForward - 0.2);
      this.gun.add(this.muzzle);
      // 持槍姿勢：雙手前伸
      this.armR.rotation.set(-1.4, 0.22, 0);
      this.armL.rotation.set(-1.3, -0.62, 0);
    } else if (style.zombie) {
      this.armR.rotation.set(-1.45, 0.1, 0.05);
      this.armL.rotation.set(-1.25, -0.1, -0.05);
      this.torso.rotation.x = 0.18;
      this.head.rotation.set(0.25, 0, 0.12);
    }

    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.layers.isEnabled(0)) o.castShadow = true;
    });
  }

  setSilhouetteVisible(v: boolean): void {
    for (const s of this.silhouettes) s.visible = v;
  }

  /** 受擊或攻擊前的閃色。 */
  hitFlash(amount = 1, color: THREE.ColorRepresentation = 0xffffff): void {
    this.flash = Math.max(this.flash, amount);
    this.flashColor.set(color);
  }

  kickRecoil(): void {
    this.recoil = 1;
  }

  muzzleOffset(): MuzzleOffset {
    return { side: TUNING.player.gunSide, height: TUNING.weapon.muzzleHeight, forward: TUNING.player.muzzleForward };
  }

  resetPose(): void {
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.recoil = 0;
    this.flash = 0;
  }

  update(dt: number, st: ViewState): void {
    this.time += dt;
    this.animateLegs(dt, st.vx, st.vz, st.refSpeed);
    this.lean = st.reload;
    const t = Math.min(1, st.actionTime / Math.max(0.001, st.actionDuration));
    switch (st.action) {
      case 'rising':
        this.body.position.y = -1.7 * (1 - t) * (1 - t);
        this.body.rotation.x = (1 - t) * 0.6;
        break;
      case 'dead': {
        const f = Math.min(1, st.actionTime / 0.42);
        this.body.rotation.x = -(Math.PI / 2) * f * f;
        this.body.position.y = 0.13 * f - st.sink;
        break;
      }
      case 'windup':
        // 出手前搖：雙手舉高、身體後仰
        this.armL.rotation.x = -1.25 - t * 1.0;
        this.armR.rotation.x = -1.45 - t * 1.0;
        this.body.rotation.x = -t * 0.18;
        break;
      case 'recover':
        this.armL.rotation.x = damp(this.armL.rotation.x, -0.9, 12, dt);
        this.armR.rotation.x = damp(this.armR.rotation.x, -1.0, 12, dt);
        this.body.rotation.x = damp(this.body.rotation.x, 0.22, 12, dt);
        break;
      default:
        if (this.style.zombie) {
          this.armL.rotation.x = damp(this.armL.rotation.x, -1.25 + Math.sin(this.time * 3 + this.id) * 0.08, 6, dt);
          this.armR.rotation.x = damp(this.armR.rotation.x, -1.45, 6, dt);
        }
        this.body.rotation.x = damp(this.body.rotation.x, 0, 6, dt);
        this.body.position.y = damp(this.body.position.y, 0, 10, dt);
    }
  }

  /**
   * 依速度做程序動畫。vx/vz 為世界速度。
   * 腿部的擺動方向由「移動方向相對於面向」決定，所以後退與橫移看得出來。
   */
  private animateLegs(dt: number, vx: number, vz: number, refSpeed: number): void {
    const yaw = this.root.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // 本地 +X（角色左手）
    const lx = Math.cos(yaw);
    const lz = -Math.sin(yaw);
    const speed = Math.hypot(vx, vz);
    const forward = vx * fx + vz * fz;
    const side = vx * lx + vz * lz;
    const k = Math.min(1, speed / Math.max(0.01, refSpeed));
    this.walkPhase += dt * (4 + speed * 2.2);
    const s = Math.sin(this.walkPhase);
    const fr = speed > 0.05 ? forward / speed : 0;
    const sr = speed > 0.05 ? side / speed : 0;
    const amp = 0.62 * k;
    this.legL.rotation.x = -s * amp * fr;
    this.legR.rotation.x = s * amp * fr;
    this.legL.rotation.z = s * amp * sr * 0.55;
    this.legR.rotation.z = -s * amp * sr * 0.55;
    this.torso.position.y = HIP_Y + Math.abs(Math.cos(this.walkPhase)) * 0.035 * k;
    this.body.rotation.z = -sr * 0.06 * k;

    // 後座力：槍與軀幹往後一縮
    this.recoil = Math.max(0, this.recoil - dt * 9);
    if (this.style.withGun) {
      this.gun.position.z = 0.2 - this.recoil * 0.07;
      this.torso.rotation.x = -this.recoil * 0.06 + this.lean;
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 7);
    }
    for (const m of this.materials) setFlashEmissive(m, this.flashColor, this.flash * 0.7);
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
    this.root.removeFromParent();
  }
}
