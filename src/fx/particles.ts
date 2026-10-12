import * as THREE from 'three';

/**
 * 方塊粒子（火花、血、彈殼、火焰、塵土）。全部用一個 InstancedMesh 繪製，
 * 不參與描邊計算，跟著遊戲時間更新，因此子彈時間內也會一起放慢。
 */

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  shrink: boolean;
  gravity: number;
  drag: number;
  bounce: number;
  spin: number;
  rot: number;
  color: THREE.Color;
  fadeTo: THREE.Color | null;
  active: boolean;
}

export interface ParticleOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  color: THREE.ColorRepresentation;
  fadeTo?: THREE.ColorRepresentation;
  gravity?: number;
  drag?: number;
  bounce?: number;
  shrink?: boolean;
  spin?: number;
}

const MAX = 900;

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pool: Particle[] = [];
  private cursor = 0;
  private readonly tmp = new THREE.Object3D();
  private readonly col = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.layers.set(1);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    scene.add(this.mesh);
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.1, shrink: true,
        gravity: 0, drag: 0, bounce: 0, spin: 0, rot: 0, color: new THREE.Color(), fadeTo: null, active: false,
      });
    }
  }

  emit(o: ParticleOptions): void {
    // 環狀緩衝：滿了就覆蓋最舊的粒子
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % MAX;
    p.x = o.x;
    p.y = o.y;
    p.z = o.z;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.life = o.life;
    p.maxLife = o.life;
    p.size = o.size;
    p.shrink = o.shrink ?? true;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.bounce = o.bounce ?? 0;
    p.spin = o.spin ?? 0;
    p.rot = Math.random() * 6;
    p.color.set(o.color);
    if (o.fadeTo !== undefined) {
      p.fadeTo = p.fadeTo ?? new THREE.Color();
      p.fadeTo.set(o.fadeTo);
    } else {
      p.fadeTo = null;
    }
    p.active = true;
  }

  clear(): void {
    for (const p of this.pool) p.active = false;
    this.mesh.count = 0;
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.size * 0.5 && p.gravity > 0) {
        p.y = p.size * 0.5;
        if (p.bounce > 0 && Math.abs(p.vy) > 0.6) {
          p.vy = -p.vy * p.bounce;
          p.vx *= 0.6;
          p.vz *= 0.6;
        } else {
          p.vy = 0;
          p.vx *= 0.85;
          p.vz *= 0.85;
          p.spin *= 0.8;
        }
      }
      p.rot += p.spin * dt;
      const t = p.life / p.maxLife;
      const s = p.shrink ? p.size * (0.35 + 0.65 * t) : p.size;
      this.tmp.position.set(p.x, p.y, p.z);
      this.tmp.rotation.set(p.rot * 0.7, p.rot, 0);
      this.tmp.scale.setScalar(s);
      this.tmp.updateMatrix();
      this.mesh.setMatrixAt(n, this.tmp.matrix);
      if (p.fadeTo) this.col.copy(p.fadeTo).lerp(p.color, t);
      else this.col.copy(p.color);
      this.mesh.setColorAt(n, this.col);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get activeCount(): number {
    return this.mesh.count;
  }
}
