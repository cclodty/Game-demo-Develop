// Particles, decals, flash lights, shockwave rings and laser sights.
// Particles tick with world time, so in bullet time sparks hang in the air.

import * as THREE from 'three';
import { rand, TAU } from './utils.js';
import { GUN_Y } from './config.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _Z = new THREE.Vector3(0, 0, 1);

class ParticlePool {
  constructor(scene, max, geometry, material, { additive = false, shadow = false } = {}) {
    this.max = max;
    this.additive = additive;
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    scene.add(this.mesh);
    this.items = [];
    for (let i = 0; i < max; i++) this.items.push({});
    this.n = 0;
  }

  spawn(o) {
    let p;
    if (this.n < this.max) p = this.items[this.n++];
    else p = this.items[(Math.random() * this.max) | 0];
    p.x = o.x;
    p.y = o.y;
    p.z = o.z;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.life = p.max = o.life || 1;
    p.sx = o.sx || o.size || 0.1;
    p.sy = o.sy || o.size || 0.1;
    p.sz = o.sz || o.size || 0.1;
    p.r = o.r ?? 1;
    p.g = o.g ?? 1;
    p.b = o.b ?? 1;
    p.grav = o.grav || 0;
    p.drag = o.drag || 0;
    p.bounce = o.bounce || 0;
    p.floor = o.floor ?? 0.02;
    p.stretch = o.stretch || 0;
    p.shrink = o.shrink ?? true;
    p.grow = o.grow || 0;
    p.rx = rand(0, TAU);
    p.ry = rand(0, TAU);
    p.rz = rand(0, TAU);
    const sp = o.spin ?? 0;
    p.wx = rand(-sp, sp);
    p.wy = rand(-sp, sp);
    p.wz = rand(-sp, sp);
    p.onLand = o.onLand || null;
    p.landed = false;
    return p;
  }

  clear() {
    this.n = 0;
    this.mesh.count = 0;
  }

  update(dt) {
    const items = this.items;
    let i = 0;
    while (i < this.n) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) {
        const last = this.n - 1;
        items[i] = items[last];
        items[last] = p;
        this.n--;
        continue;
      }
      p.vy -= p.grav * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.vz *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floor && p.grav > 0) {
        p.y = p.floor;
        if (p.vy < -1.5 && p.bounce > 0) {
          p.vy = -p.vy * p.bounce;
          p.vx *= 0.6;
          p.vz *= 0.6;
          p.wx *= 0.5;
          p.wz *= 0.5;
        } else {
          p.vy = 0;
          const f = Math.exp(-9 * dt);
          p.vx *= f;
          p.vz *= f;
          p.wx *= f;
          p.wy *= f;
          p.wz *= f;
        }
        if (!p.landed) {
          p.landed = true;
          if (p.onLand) p.onLand(p);
        }
      }

      const t = p.life / p.max;
      let sc = p.shrink ? Math.min(1, t * 2.5) : 1;
      if (p.grow) sc *= 1 + p.grow * (1 - t);
      let lenMul = 1;
      if (p.stretch) {
        _v.set(p.vx, p.vy, p.vz);
        const sp = _v.length();
        if (sp > 0.001) {
          _q.setFromUnitVectors(_Z, _v.multiplyScalar(1 / sp));
          lenMul = 1 + sp * p.stretch;
        }
      } else {
        p.rx += p.wx * dt;
        p.ry += p.wy * dt;
        p.rz += p.wz * dt;
        _q.setFromEuler(_e.set(p.rx, p.ry, p.rz));
      }
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(p.sx * sc, p.sy * sc, p.sz * sc * lenMul));
      this.mesh.setMatrixAt(i, _m);
      const f = this.additive ? t : 1;
      this.mesh.instanceColor.setXYZ(i, p.r * f, p.g * f, p.b * f);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

const laserGeo = (() => {
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  const c = new Float32Array([1, 1, 1, 1, 1, 1, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15]);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
})();

export class Laser {
  constructor(scene, color) {
    this.base = new THREE.Color(color);
    this.mat = new THREE.MeshBasicMaterial({
      color: this.base.clone(),
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(laserGeo, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }

  set(x0, z0, x1, z1, width, intensity, y = GUN_Y) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.01 || intensity <= 0.001) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.mesh.position.set(x0, y, z0);
    this.mesh.rotation.y = Math.atan2(dx, dz);
    this.mesh.scale.set(width, 1, len);
    this.mat.color.copy(this.base).multiplyScalar(intensity);
  }

  hide() {
    this.mesh.visible = false;
  }

  dispose(scene) {
    scene.remove(this.mesh);
    this.mat.dispose();
  }
}

export class FX {
  constructor(game) {
    this.game = game;
    const scene = (this.scene = game.scene);
    const cube = new THREE.BoxGeometry(1, 1, 1);

    this.glow = new ParticlePool(
      scene,
      1800,
      cube,
      new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      { additive: true },
    );
    this.solid = new ParticlePool(scene, 1600, cube, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 }), { shadow: true });
    this.smoke = new ParticlePool(
      scene,
      260,
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true, transparent: true, opacity: 0.85 }),
    );

    // Floor decals (blood, scorch marks).
    this.decalMax = 360;
    this.decals = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      this.decalMax,
    );
    this.decals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.decalMax * 3), 3);
    this.decals.count = 0;
    this.decals.receiveShadow = true;
    this.decals.frustumCulled = false;
    this.decalIdx = 0;
    scene.add(this.decals);

    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 14, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push({ l, t: 0, dur: 1, peak: 0 });
    }

    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.rings.push({ mesh, mat, t: 0, dur: 1, r: 1, color: new THREE.Color() });
    }
  }

  clear() {
    this.glow.clear();
    this.solid.clear();
    this.smoke.clear();
    this.decals.count = 0;
    this.decalIdx = 0;
    for (const L of this.lights) {
      L.t = 0;
      L.l.intensity = 0;
    }
    for (const r of this.rings) {
      r.t = 0;
      r.mesh.visible = false;
    }
  }

  update(dt) {
    this.glow.update(dt);
    this.solid.update(dt);
    this.smoke.update(dt);
    for (const L of this.lights) {
      if (L.t <= 0) continue;
      L.t -= dt;
      const k = Math.max(0, L.t / L.dur);
      L.l.intensity = L.peak * k * k;
    }
    for (const r of this.rings) {
      if (r.t <= 0) continue;
      r.t -= dt;
      if (r.t <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.t / r.dur;
      const s = r.r * (0.15 + 0.85 * Math.sqrt(k));
      r.mesh.scale.set(s, 1, s);
      r.mat.color.copy(r.color).multiplyScalar(1 - k);
    }
  }

  // ---------------------------------------------------------------- basics

  decal(x, z, size, r, g, b) {
    const i = this.decalIdx;
    _q.setFromAxisAngle(_v.set(0, 1, 0), rand(0, TAU));
    _m.compose(_p.set(x, 0.012 + (i % 16) * 0.0006, z), _q, _s.set(size, 1, size * rand(0.55, 1)));
    this.decals.setMatrixAt(i, _m);
    this.decals.instanceColor.setXYZ(i, r, g, b);
    this.decalIdx = (i + 1) % this.decalMax;
    this.decals.count = Math.min(this.decals.count + 1, this.decalMax);
    this.decals.instanceMatrix.needsUpdate = true;
    this.decals.instanceColor.needsUpdate = true;
  }

  flash(x, y, z, color, intensity, dur, distance = 14) {
    let best = this.lights[0];
    for (const L of this.lights) if (L.t < best.t) best = L;
    best.l.position.set(x, y, z);
    best.l.color.set(color);
    best.l.distance = distance;
    best.peak = intensity;
    best.l.intensity = intensity;
    best.t = best.dur = dur;
  }

  ring(x, z, radius, dur, color, intensity = 3, y = 0.06) {
    let best = this.rings[0];
    for (const r of this.rings) if (r.t < best.t) best = r;
    best.mesh.position.set(x, y, z);
    best.mesh.visible = true;
    best.t = best.dur = dur;
    best.r = radius;
    best.color.set(color).multiplyScalar(intensity);
  }

  // -------------------------------------------------------------- emitters

  sparks(x, y, z, dx, dz, count, color = [6, 4, 1.5], speed = 9, spread = 1.2) {
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < count; i++) {
      const a = base + rand(-spread, spread);
      const s = rand(0.3, 1) * speed;
      this.glow.spawn({
        x,
        y,
        z,
        vx: Math.sin(a) * s,
        vy: rand(-1, 4),
        vz: Math.cos(a) * s,
        life: rand(0.15, 0.4),
        sx: 0.035,
        sy: 0.035,
        sz: 0.06,
        stretch: 0.035,
        r: color[0],
        g: color[1],
        b: color[2],
        grav: 14,
        drag: 2,
      });
    }
  }

  muzzle(x, y, z, dx, dz, color = [8, 5.5, 2]) {
    for (let i = 0; i < 5; i++) {
      const s = rand(4, 12);
      const a = Math.atan2(dx, dz) + rand(-0.35, 0.35);
      this.glow.spawn({
        x,
        y,
        z,
        vx: Math.sin(a) * s,
        vy: rand(-0.5, 0.5),
        vz: Math.cos(a) * s,
        life: rand(0.05, 0.1),
        size: rand(0.1, 0.2),
        r: color[0],
        g: color[1],
        b: color[2],
        drag: 10,
      });
    }
    this.glow.spawn({ x, y, z, life: 0.06, size: 0.32, r: color[0], g: color[1], b: color[2], spin: 4 });
  }

  casing(x, y, z, dx, dz) {
    const audio = this.game.audio;
    this.solid.spawn({
      x,
      y,
      z,
      vx: dx * rand(2, 3.5) + rand(-0.5, 0.5),
      vy: rand(2.5, 4),
      vz: dz * rand(2, 3.5) + rand(-0.5, 0.5),
      life: rand(5, 7),
      sx: 0.05,
      sy: 0.05,
      sz: 0.12,
      r: 0.95,
      g: 0.7,
      b: 0.25,
      grav: 22,
      bounce: 0.45,
      spin: 22,
      shrink: true,
      onLand: () => audio.casing(),
    });
  }

  blood(x, y, z, dx, dz, count, power = 1) {
    const base = Math.atan2(dx, dz);
    const fx = this;
    const land = (p) => {
      if (Math.random() < 0.35) fx.decal(p.x, p.z, rand(0.15, 0.4), 0.22, 0.01, 0.02);
    };
    for (let i = 0; i < count; i++) {
      const a = base + rand(-0.6, 0.6);
      const s = rand(1.5, 7) * power;
      const dark = rand(0.5, 1);
      this.solid.spawn({
        x,
        y: y + rand(-0.2, 0.2),
        z,
        vx: Math.sin(a) * s,
        vy: rand(0, 4),
        vz: Math.cos(a) * s,
        life: rand(0.8, 1.6),
        size: rand(0.06, 0.13),
        r: 0.55 * dark,
        g: 0.02,
        b: 0.05,
        grav: 16,
        drag: 1.2,
        spin: 8,
        onLand: land,
      });
    }
  }

  debris(x, y, z, dx, dz, count, rgb, size = 0.12) {
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < count; i++) {
      const a = base + rand(-1.4, 1.4);
      const s = rand(1, 6);
      this.solid.spawn({
        x,
        y,
        z,
        vx: Math.sin(a) * s,
        vy: rand(1, 5),
        vz: Math.cos(a) * s,
        life: rand(1.5, 3),
        size: size * rand(0.5, 1.2),
        r: rgb[0],
        g: rgb[1],
        b: rgb[2],
        grav: 18,
        bounce: 0.3,
        spin: 10,
      });
    }
  }

  shards(x, y, z, dx, dz, count) {
    const base = Math.atan2(dx, dz);
    for (let i = 0; i < count; i++) {
      const a = base + rand(-0.9, 0.9);
      const s = rand(2, 10);
      this.glow.spawn({
        x: x + rand(-0.4, 0.4),
        y: y + rand(-0.6, 0.6),
        z: z + rand(-0.4, 0.4),
        vx: Math.sin(a) * s,
        vy: rand(-0.5, 4),
        vz: Math.cos(a) * s,
        life: rand(1.2, 2.4),
        sx: rand(0.08, 0.22),
        sy: 0.015,
        sz: rand(0.08, 0.25),
        r: 0.5,
        g: 0.9,
        b: 1.2,
        grav: 16,
        bounce: 0.25,
        spin: 12,
        shrink: false,
      });
    }
  }

  smokePuff(x, y, z, count, size = 0.6, gray = 0.18, rise = 1.2) {
    for (let i = 0; i < count; i++) {
      this.smoke.spawn({
        x: x + rand(-0.4, 0.4),
        y: y + rand(0, 0.5),
        z: z + rand(-0.4, 0.4),
        vx: rand(-1.2, 1.2),
        vy: rand(0.4, rise),
        vz: rand(-1.2, 1.2),
        life: rand(1.2, 2.4),
        size: size * rand(0.6, 1.3),
        r: gray,
        g: gray,
        b: gray * 1.1,
        drag: 1.5,
        spin: 1,
        grow: 0.8,
      });
    }
  }

  explosion(x, z, radius) {
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU);
      const s = rand(2, 13);
      const hot = Math.random();
      this.glow.spawn({
        x,
        y: rand(0.3, 1.4),
        z,
        vx: Math.sin(a) * s,
        vy: rand(0, 6),
        vz: Math.cos(a) * s,
        life: rand(0.25, 0.7),
        size: rand(0.3, 0.75),
        r: 9,
        g: 2.5 + hot * 4,
        b: 0.6 + hot,
        drag: 3.5,
        spin: 3,
      });
    }
    this.sparks(x, 0.8, z, 1, 0, 30, [8, 4, 1], 18, Math.PI);
    this.smokePuff(x, 0.6, z, 16, 1.1, 0.12, 2.5);
    this.debris(x, 0.6, z, 1, 0, 18, [0.55, 0.05, 0.05], 0.18);
    this.decal(x, z, radius * 0.9, 0.02, 0.02, 0.02);
    this.ring(x, z, radius * 1.15, 0.45, 0xffaa55, 4);
    this.flash(x, 2.2, z, 0xff8833, 260, 0.55, 22);
  }
}
