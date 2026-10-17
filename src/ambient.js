// Pigeons. A Flock is logic (level.js updates it with the game's RNG): where
// it rests, and how long it stays away after something startles it. Its
// burst can break an enemy's aim (PIGEON STRIKE), so it must play the same on
// every replay. Pigeons is only the look: birds pecking around each flock's
// spot, bursting into the air when their flock is startled and gliding back
// when it returns. They run on world time, so in bullet time they flap in
// slow motion.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rand, TAU } from './utils.js';

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

/** A flock's place and state, in the logic. */
export class Flock {
  constructor(x, z) {
    this.home = [x, z];
    this.reset();
  }

  reset() {
    [this.x, this.z] = this.home;
    this.away = 0; // world seconds until it lands again; 0 while it rests
    this.gen = 0; // counts take-offs, so the look can tell a new one
    this.fromX = this.x; // where the scare came from
    this.fromZ = this.z;
  }
}

export class Pigeons {
  /** The level's flocks get `count` birds between them. */
  constructor(level, count = 26) {
    this.level = level;
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
      this.birds.push({ flock: i, gen: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, heading: rand(0, TAU), state: 'idle', t: rand(0, 3), flap: rand(0, TAU), tx: 0, tz: 0, hop: 0 });
    }
    // landing spots need the nav grid, which the level builds after decorating
    this.placed = false;
  }

  /** A spot a bird can stand on near its flock. */
  spot(f) {
    for (let k = 0; k < 12; k++) {
      const a = rand(0, TAU);
      const r = rand(0.2, 1.6);
      const x = f.x + Math.sin(a) * r;
      const z = f.z + Math.cos(a) * r;
      if (this.level.nav.isWalkable(x, z)) return [x, z];
    }
    return [f.x, f.z];
  }

  place(b) {
    [b.x, b.z] = this.spot(this.level.flocks[b.flock]);
    b.y = 0;
    b.state = 'idle';
    b.t = rand(0.5, 3);
  }

  flee(b, fx, fz) {
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

  update(dt) {
    const flocks = this.level.flocks;
    if (!flocks.length) return;
    if (!this.placed) {
      this.placed = true;
      for (const b of this.birds) {
        b.flock %= flocks.length;
        this.place(b);
      }
    }
    let fled = 0;
    let pan = 0;
    for (const b of this.birds) {
      const f = flocks[b.flock];
      // the flock was startled since this bird last looked: off it goes
      if (b.gen !== f.gen) {
        b.gen = f.gen;
        if (b.state === 'idle' || b.state === 'land') {
          this.flee(b, f.fromX, f.fromZ);
          fled++;
          pan = this.level.game.panFor(f.x);
        }
      }
      b.flap += dt * (b.state === 'idle' ? 0 : 26);
      switch (b.state) {
        case 'idle': {
          b.t -= dt;
          if (b.t <= 0) {
            // peck, turn, hop a few steps (staying near the flock's spot)
            b.t = rand(0.6, 2.2);
            b.heading += rand(-1.2, 1.2);
            b.hop = 0.35;
            const step = rand(0.1, 0.4);
            const nx = b.x + Math.sin(b.heading) * step;
            const nz = b.z + Math.cos(b.heading) * step;
            if (this.level.nav.isWalkable(nx, nz) && Math.hypot(nx - f.x, nz - f.z) < 2) {
              b.x = nx;
              b.z = nz;
            }
          }
          b.hop = Math.max(0, b.hop - dt * 2);
          b.y = Math.sin((b.hop * Math.PI) / 0.35) * 0.05;
          break;
        }
        case 'flee':
          b.t += dt;
          b.vy += 1.4 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          if (b.y > 16 || b.t > 6) b.state = 'away';
          break;
        case 'away':
          if (f.away <= 0) {
            // the flock is back: glide in to a spot beside it
            [b.tx, b.tz] = this.spot(f);
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
    if (fled) this.level.game.audio.flutter(fled, pan);
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
