import * as THREE from 'three';
import { TUNING } from '../config';
import { type Box, firstBoxHit, segmentCircle } from '../world/collision';

/**
 * 子彈以「有速度的投射物」處理，每一幀用掃掠線段檢查碰撞，不會因速度快而穿透。
 * 子彈時間內可以看見子彈飛行。
 */

export interface Target {
  x: number;
  z: number;
  radius: number;
  alive: boolean;
}

export type BulletHit =
  | { kind: 'wall'; x: number; z: number; nx: number; nz: number; dirX: number; dirZ: number }
  | { kind: 'target'; index: number; group: 'zombie' | 'dummy'; x: number; z: number; dirX: number; dirZ: number }
  | { kind: 'expire'; x: number; z: number };

interface Bullet {
  x: number;
  z: number;
  dx: number;
  dz: number;
  traveled: number;
  active: boolean;
}

const MAX = 96;
const TRACER_LEN = 0.85;

export class Projectiles {
  readonly mesh: THREE.InstancedMesh;
  private readonly bullets: Bullet[] = [];
  private readonly tmp = new THREE.Object3D();
  activeCount = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.06, 0.06, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe7a6, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.layers.set(1);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    for (let i = 0; i < MAX; i++) this.bullets.push({ x: 0, z: 0, dx: 0, dz: 1, traveled: 0, active: false });
  }

  spawn(x: number, z: number, dx: number, dz: number): void {
    const b = this.bullets.find((bb) => !bb.active);
    if (!b) return;
    b.x = x;
    b.z = z;
    b.dx = dx;
    b.dz = dz;
    b.traveled = 0;
    b.active = true;
  }

  clear(): void {
    for (const b of this.bullets) b.active = false;
    this.mesh.count = 0;
    this.activeCount = 0;
  }

  update(
    dt: number,
    boxes: readonly Box[],
    zombies: readonly Target[],
    dummies: readonly Target[],
    onHit: (hit: BulletHit) => void,
  ): void {
    const W = TUNING.weapon;
    const step = W.bulletSpeed * dt;
    let n = 0;
    for (const b of this.bullets) {
      if (!b.active) continue;
      const remaining = W.range - b.traveled;
      const len = Math.min(step, remaining);
      const x1 = b.x + b.dx * len;
      const z1 = b.z + b.dz * len;

      let bestT = Infinity;
      let hit: BulletHit | null = null;
      const wall = firstBoxHit(b.x, b.z, x1, z1, boxes, W.muzzleHeight);
      if (wall) {
        bestT = wall.t;
        hit = {
          kind: 'wall',
          x: b.x + (x1 - b.x) * wall.t,
          z: b.z + (z1 - b.z) * wall.t,
          nx: wall.nx,
          nz: wall.nz,
          dirX: b.dx,
          dirZ: b.dz,
        };
      }
      const check = (list: readonly Target[], group: 'zombie' | 'dummy') => {
        for (let i = 0; i < list.length; i++) {
          const t = list[i];
          if (!t.alive) continue;
          const tt = segmentCircle(b.x, b.z, x1, z1, t.x, t.z, t.radius);
          if (tt !== null && tt < bestT) {
            bestT = tt;
            hit = {
              kind: 'target',
              index: i,
              group,
              x: b.x + (x1 - b.x) * tt,
              z: b.z + (z1 - b.z) * tt,
              dirX: b.dx,
              dirZ: b.dz,
            };
          }
        }
      };
      check(zombies, 'zombie');
      check(dummies, 'dummy');

      if (hit) {
        b.active = false;
        onHit(hit);
        continue;
      }
      b.x = x1;
      b.z = z1;
      b.traveled += len;
      if (b.traveled >= W.range - 1e-6) {
        b.active = false;
        onHit({ kind: 'expire', x: b.x, z: b.z });
        continue;
      }

      // 曳光：線段尾端落在子彈後方，剛發射時長度較短
      const tl = Math.min(TRACER_LEN, b.traveled + 0.1);
      this.tmp.position.set(b.x - (b.dx * tl) / 2, W.muzzleHeight, b.z - (b.dz * tl) / 2);
      this.tmp.rotation.set(0, Math.atan2(b.dx, b.dz), 0);
      this.tmp.scale.set(1, 1, tl);
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(n++, this.tmp.matrix);
    }
    this.mesh.count = n;
    this.activeCount = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
