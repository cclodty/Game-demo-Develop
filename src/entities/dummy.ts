import * as THREE from 'three';
import { markCharacterMaterial, setFlashEmissive, toon } from '../render/materials';

const WHITE = new THREE.Color(1, 1, 1);

/** 試射用的稻草假人：不會移動、不會倒下，被擊中會晃動並顯示傷害。 */
export class Dummy {
  readonly root = new THREE.Group();
  private readonly swing = new THREE.Group();
  private readonly mats: THREE.MeshToonMaterial[] = [];
  readonly radius = 0.34;
  wobble = 0;
  wobbleDir = 0;
  flash = 0;
  hits = 0;
  totalDamage = 0;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    readonly x: number,
    readonly z: number,
  ) {
    this.root.position.set(x, 0, z);
    this.root.rotation.y = -Math.PI / 2;
    // 以木樁頂端為支點晃動
    this.swing.position.y = 1.0;
    this.root.add(this.swing);
    const post = toon({ color: 0x3a2a1c });
    const straw = toon({ color: 0x9c844f });
    const cloth = toon({ color: 0x6b3a2e });
    const ring = toon({ color: 0xd8d2c0 });
    this.mats.push(straw, cloth);
    const add = (size: [number, number, number], pos: [number, number, number], mat: THREE.Material, parent: THREE.Object3D = this.swing) => {
      markCharacterMaterial(mat);
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
      m.position.set(...pos);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    add([0.12, 1.0, 0.12], [0, 0.5, 0], post, this.root);
    add([0.5, 0.12, 0.5], [0, 0.06, 0], post, this.root);
    add([0.5, 0.62, 0.32], [0, 0.25, 0], straw);
    add([0.52, 0.2, 0.34], [0, 0.08, 0], cloth);
    add([0.3, 0.3, 0.3], [0, 0.74, 0], straw);
    add([0.9, 0.12, 0.12], [0, 0.42, 0], post);
    // 靶心
    add([0.26, 0.26, 0.02], [0, 0.28, 0.17], ring);
    add([0.12, 0.12, 0.03], [0, 0.28, 0.175], cloth);
    scene.add(this.root);
  }

  hit(damage: number, dirX: number, dirZ: number): void {
    this.hits++;
    this.totalDamage += damage;
    this.flash = 1;
    this.wobble = Math.min(1, this.wobble + 0.6);
    // 晃動方向（以假人本地座標）
    const c = Math.cos(-this.root.rotation.y);
    const s = Math.sin(-this.root.rotation.y);
    this.wobbleDir = Math.atan2(dirX * c - dirZ * s, dirX * s + dirZ * c);
  }

  update(dt: number): void {
    this.wobble = Math.max(0, this.wobble - dt * 1.8);
    this.time += dt;
    const t = this.time * 18;
    const a = Math.sin(t) * this.wobble * 0.22;
    this.swing.rotation.x = Math.cos(this.wobbleDir) * a;
    this.swing.rotation.z = -Math.sin(this.wobbleDir) * a;
    this.flash = Math.max(0, this.flash - dt * 7);
    for (const m of this.mats) setFlashEmissive(m, WHITE, this.flash * 0.8);
  }

  reset(): void {
    this.hits = 0;
    this.totalDamage = 0;
    this.wobble = 0;
    this.flash = 0;
  }
}
