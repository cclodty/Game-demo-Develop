// Ambient life: a flock of pigeons that pecks around the square and bursts
// into the air at gunfire, explosions or anyone walking through them. They run
// on world time, so in bullet time they flap in slow motion.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pick, rand, TAU } from './utils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

const COLORS = [
  [0.52, 0.55, 0.6],
  [0.45, 0.48, 0.53],
  [0.62, 0.64, 0.68],
  [0.86, 0.86, 0.84],
  [0.36, 0.34, 0.36],
  [0.55, 0.5, 0.46],
];

export class Pigeons {
  /** areas: [[x0, z0, x1, z1], ...] rectangles where the flock lands. */
  constructor(level, areas, count = 26) {
    this.level = level;
    this.areas = areas;
    const body = mergeGeometries([
      new THREE.BoxGeometry(0.16, 0.13, 0.3).translate(0, 0.13, 0),
      new THREE.BoxGeometry(0.09, 0.09, 0.1).translate(0, 0.24, 0.16),
      new THREE.BoxGeometry(0.1, 0.03, 0.15).translate(0, 0.14, -0.21),
    ]);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.bodies = new THREE.InstancedMesh(level.own(body), level.own(mat), count);
    this.wings = new THREE.InstancedMesh(level.own(new THREE.BoxGeometry(0.62, 0.02, 0.15).translate(0, 0.18, 0)), mat, count);
    for (const m of [this.bodies, this.wings]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true;
      m.frustumCulled = false;
      level.add(m);
    }
    this.bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.wings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const c = COLORS[i % COLORS.length];
      const k = rand(0.9, 1.08);
      this.bodies.instanceColor.setXYZ(i, c[0] * k, c[1] * k, c[2] * k);
      this.wings.instanceColor.setXYZ(i, c[0] * k * 0.85, c[1] * k * 0.85, c[2] * k * 0.85);
      this.birds.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: rand(0, TAU), state: 'idle', t: rand(0, 3), flap: rand(0, TAU), tx: 0, tz: 0, hop: 0 });
    }
    // landing spots need the nav grid, which the level builds after decorating
    this.placed = false;
  }

  /** Pick a landing spot, away from the player when there is one. */
  spot(player) {
    for (let k = 0; k < 20; k++) {
      const [x0, z0, x1, z1] = pick(this.areas);
      const x = rand(x0, x1);
      const z = rand(z0, z1);
      if (!this.level.nav.isWalkable(x, z)) continue;
      if (player && Math.hypot(x - player.x, z - player.z) < 10) continue;
      return [x, z];
    }
    const [x0, z0, x1, z1] = this.areas[0];
    return [(x0 + x1) / 2, (z0 + z1) / 2];
  }

  place(b, player) {
    [b.x, b.z] = this.spot(player);
    b.y = 0;
    b.state = 'idle';
    b.t = rand(0.5, 3);
  }

  flee(b, fx, fz) {
    if (b.state === 'flee' || b.state === 'away') return;
    let dx = b.x - fx;
    let dz = b.z - fz;
    const l = Math.hypot(dx, dz) || 1;
    const a = Math.atan2(dx / l, dz / l) + rand(-0.6, 0.6);
    const sp = rand(4, 7);
    b.vx = Math.sin(a) * sp;
    b.vz = Math.cos(a) * sp;
    b.vy = rand(3, 4.5);
    b.heading = a;
    b.state = 'flee';
    b.t = 0;
  }

  /** Something loud happened at (x, z): everything within r takes off. */
  scare(x, z, r) {
    let n = 0;
    for (const b of this.birds) {
      if (b.state !== 'idle' || Math.hypot(b.x - x, b.z - z) >= r * rand(0.8, 1.1)) continue;
      this.flee(b, x, z);
      n++;
    }
    if (n) this.level.game.audio.flutter(n, this.level.game.panFor(x));
  }

  update(dt) {
    const game = this.level.game;
    const player = game.player;
    const movers = game.enemies.list;
    if (!this.placed) {
      this.placed = true;
      for (const b of this.birds) this.place(b, null);
    }
    for (const b of this.birds) {
      b.flap += dt * (b.state === 'idle' ? 0 : 26);
      switch (b.state) {
        case 'idle': {
          b.t -= dt;
          // anyone walking through the flock scatters it
          const ps = Math.hypot(player.vx, player.vz);
          if (player.alive && ps > 1 && Math.hypot(b.x - player.x, b.z - player.z) < 2.4) {
            this.flee(b, player.x, player.z);
            break;
          }
          for (const e of movers) {
            if (e.alive && Math.hypot(b.x - e.x, b.z - e.z) < 1.5) {
              this.flee(b, e.x, e.z);
              break;
            }
          }
          if (b.t <= 0) {
            // peck, turn, hop a few steps
            b.t = rand(0.6, 2.2);
            b.heading += rand(-1.2, 1.2);
            b.hop = 0.35;
            const step = rand(0.1, 0.4);
            const nx = b.x + Math.sin(b.heading) * step;
            const nz = b.z + Math.cos(b.heading) * step;
            if (this.level.nav.isWalkable(nx, nz)) {
              b.x = nx;
              b.z = nz;
            }
          }
          b.hop = Math.max(0, b.hop - dt * 2);
          b.y = Math.sin(b.hop * Math.PI / 0.35) * 0.05;
          break;
        }
        case 'flee':
          b.t += dt;
          b.vy += 1.4 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          if (b.y > 16 || b.t > 6) {
            b.state = 'away';
            b.t = rand(6, 12);
          }
          break;
        case 'away':
          b.t -= dt;
          if (b.t <= 0) {
            // glide back in to a spot away from the player
            [b.tx, b.tz] = this.spot(player);
            const a = rand(0, TAU);
            b.x = b.tx + Math.sin(a) * 10;
            b.z = b.tz + Math.cos(a) * 10;
            b.y = 9;
            b.heading = Math.atan2(b.tx - b.x, b.tz - b.z);
            b.state = 'land';
            b.t = 0;
          }
          break;
        case 'land': {
          b.t += dt;
          const k = Math.min(1, dt * 0.9);
          b.x += (b.tx - b.x) * k;
          b.z += (b.tz - b.z) * k;
          b.y += (0 - b.y) * k;
          if (b.y < 0.08) {
            b.y = 0;
            b.state = 'idle';
            b.t = rand(0.5, 2);
          }
          break;
        }
      }
    }
    this.sync();
  }

  sync() {
    const L = this.level;
    this.birds.forEach((b, i) => {
      const hidden = b.state === 'away';
      const flying = b.state === 'flee' || b.state === 'land';
      _q.setFromEuler(_e.set(flying ? -0.25 : 0, b.heading, 0));
      _p.set(b.x, L.groundY(b.x, b.z) + 0.05 + b.y, b.z);
      _m.compose(_p, _q, _s.setScalar(hidden ? 0 : 1));
      this.bodies.setMatrixAt(i, _m);
      // wings: folded along the body at rest, a wide flicker in flight (reads well from above)
      const span = flying ? 0.35 + 0.65 * Math.abs(Math.sin(b.flap)) : 0.36;
      _m.compose(_p, _q, _s.set(hidden ? 0 : span, 1, hidden ? 0 : 1));
      this.wings.setMatrixAt(i, _m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }
}
