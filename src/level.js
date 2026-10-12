// The rooftop arena: static cover, destructible glass, explosive barrels,
// ricochet frying pans, spawn points, the neon city backdrop and rain.

import * as THREE from 'three';
import { ARENA, GUN_Y } from './config.js';
import { NavGrid } from './nav.js';
import { clamp, rand, resolveCircleAABB, segAABB, segCircle, TAU } from './utils.js';
import { crateTexture, floorTexture, helipadTexture, signTexture, windowTexture } from './textures.js';

// [x, z, width(x), depth(z), height]
const LAYOUT = {
  crates: [
    [-7.5, -5, 2, 2, 1.7],
    [-5.9, -5.6, 1.2, 1.2, 1.1],
    [7.5, -5, 2, 2, 1.7],
    [9.1, -4.4, 1.2, 1.2, 1.1],
    [-18, 10, 1.6, 1.6, 1.4],
    [18, 10, 1.6, 1.6, 1.4],
    [-2.5, 11.5, 1.4, 1.4, 1.3],
  ],
  walls: [
    [0, -8, 7, 0.6, 1.25],
    [-10.5, 9, 0.6, 4.5, 1.25],
    [10.5, 9, 0.6, 4.5, 1.25],
  ],
  pillars: [
    [-4.5, 2.5, 1, 1, 3.4],
    [4.5, 2.5, 1, 1, 3.4],
  ],
  units: [
    [-14, 4, 2.8, 1.8, 1.5],
    [14, 4, 2.8, 1.8, 1.5],
    [-17, -6, 1.4, 1.4, 1.0],
    [17, -6, 1.4, 1.4, 1.0],
  ],
  huts: [
    [-13, -13.5, 4, 3, 2.9],
    [13, -13.5, 4, 3, 2.9],
  ],
  glass: [
    [0, -12.4, 6, 0.25, 1.9],
    [-19.5, -2.5, 0.25, 4, 1.9],
    [19.5, -2.5, 0.25, 4, 1.9],
    [0, 7, 5, 0.25, 1.9],
  ],
  barrels: [
    [-6, -3.4],
    [11.8, 6.2],
    [-12, -2],
    [3.5, -10],
    [-19.5, 13],
    [5.2, 12.4],
    [15.5, -9.5],
  ],
  pans: [
    [-2.5, -1.5],
    [2.5, -1.5],
    [-12.5, -8.5],
    [12.5, -8.5],
    [-16, 7],
    [16, 7],
  ],
  spawns: [
    { x: -13, z: -11.4, ex: -13, ez: -9.2, kind: 'door' },
    { x: 13, z: -11.4, ex: 13, ez: -9.2, kind: 'door' },
    { x: -21.4, z: 3.5, ex: -18.6, ez: 3.5, kind: 'ledge' },
    { x: 21.4, z: 3.5, ex: 18.6, ez: 3.5, kind: 'ledge' },
    { x: 7.5, z: 14.4, ex: 7.5, ez: 11.6, kind: 'ledge' },
  ],
};

export const PLAYER_START = { x: 0, z: 4 };

const _hit = { t: 0, nx: 0, nz: 0 };

class Barrel {
  constructor(level, x, z) {
    this.level = level;
    this.kind = 'barrel';
    this.home = [x, z];
    this.r = 0.48;
    const g = new THREE.Group();
    const body = new THREE.Mesh(level.geo.barrel, level.mat.barrel);
    body.position.y = 0.6;
    const stripe = new THREE.Mesh(level.geo.barrelStripe, level.mat.hazard);
    stripe.position.y = 0.75;
    const top = new THREE.Mesh(level.geo.barrelTop, level.mat.barrelTop);
    top.position.y = 1.21;
    g.add(body, stripe, top);
    g.traverse((m) => {
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    this.body = body;
    this.mesh = g;
    level.scene.add(g);
    this.reset();
  }

  reset() {
    [this.x, this.z] = this.home;
    this.vx = this.vz = 0;
    this.hp = 3;
    this.fuse = -1;
    this.alive = true;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, rand(0, TAU), 0);
    this.level.mat.barrel.emissiveIntensity = 0.25;
  }

  hit(dmg, dx, dz) {
    if (!this.alive || this.fuse >= 0) return;
    this.hp -= dmg;
    this.vx += dx * 0.6;
    this.vz += dz * 0.6;
    if (this.hp <= 0) this.fuse = 0.04;
  }

  ignite(delay) {
    if (!this.alive) return;
    if (this.fuse < 0 || this.fuse > delay) this.fuse = delay;
  }

  update(dt) {
    if (this.fuse >= 0) {
      this.fuse -= dt;
      this.body.scale.setScalar(1 + Math.random() * 0.08);
      if (this.fuse < 0) {
        this.alive = false;
        this.mesh.visible = false;
        this.level.game.explode(this.x, this.z, 4.4);
        return;
      }
    }
    this.mesh.position.set(this.x, 0, this.z);
  }
}

class Pan {
  constructor(level, x, z) {
    this.level = level;
    this.kind = 'pan';
    this.home = [x, z];
    this.r = 0.46;
    const g = new THREE.Group();
    const tilt = new THREE.Group();
    const disk = new THREE.Mesh(level.geo.pan, level.mat.pan);
    const rim = new THREE.Mesh(level.geo.panRim, level.mat.panRim);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.03;
    const handle = new THREE.Mesh(level.geo.panHandle, level.mat.pan);
    handle.position.set(0, 0.03, 0.62);
    tilt.add(disk, rim, handle);
    tilt.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    g.add(tilt);
    const marker = new THREE.Mesh(level.geo.panMarker, level.mat.panMarker);
    marker.position.y = 0.025;
    this.marker = marker;
    level.scene.add(marker);
    this.tilt = tilt;
    this.mesh = g;
    level.scene.add(g);
    this.reset();
  }

  reset() {
    [this.x, this.z] = this.home;
    this.vx = this.vz = 0;
    this.y = 0.05;
    this.vy = 0;
    this.angle = rand(0, TAU);
    this.spin = 0;
    this.alive = true;
  }

  hit(dx, dz, power) {
    this.vx += dx * power;
    this.vz += dz * power;
    this.vy = Math.max(this.vy, power * 0.9);
    this.spin += rand(-1, 1) * power * 3;
  }

  update(dt, time) {
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    if (this.y < 0.05) {
      this.y = 0.05;
      this.vy = this.vy < -3 ? -this.vy * 0.35 : 0;
    }
    this.angle += this.spin * dt;
    this.spin *= Math.exp(-2 * dt);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;
    const air = clamp((this.y - 0.05) * 1.5, 0, 1);
    this.tilt.rotation.x = Math.sin(this.angle * 2.3) * 0.5 * air;
    this.marker.position.set(this.x, 0.025, this.z);
    const pulse = 0.5 + 0.5 * Math.sin(time * 3 + this.home[0]);
    this.marker.scale.setScalar(0.9 + pulse * 0.25);
  }
}

class Rain {
  constructor(scene, count) {
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 0.45, 0.7), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.drops = [];
    for (let i = 0; i < count; i++) this.drops.push({ x: rand(-32, 32), y: rand(0, 26), z: rand(-28, 22), s: rand(24, 32) });
  }

  update(dt, cx, cz) {
    const pos = this.geo.attributes.position.array;
    const wind = 3;
    for (let i = 0; i < this.count; i++) {
      const d = this.drops[i];
      d.y -= d.s * dt;
      d.x += wind * dt;
      if (d.y < 0) {
        d.y = rand(20, 26);
        d.x = cx + rand(-32, 32);
        d.z = cz + rand(-30, 20);
      }
      const k = i * 6;
      pos[k] = d.x;
      pos[k + 1] = d.y;
      pos[k + 2] = d.z;
      pos[k + 3] = d.x - wind * 0.025;
      pos[k + 4] = d.y + 0.65;
      pos[k + 5] = d.z;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

export class Level {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.solids = [];
    this.glass = [];
    this.barrels = [];
    this.pans = [];
    this.props = [];
    this.time = 0;
    this.makeAssets();
    this.buildLights();
    this.buildFloor();
    this.buildStatic();
    this.buildProps();
    this.buildSpawns();
    this.buildBackdrop();
    this.rain = new Rain(this.scene, 900);
    this.nav = new NavGrid(-ARENA.halfW, -ARENA.halfD, ARENA.halfW, ARENA.halfD, 0.5);
    this.rebuildNav();
  }

  makeAssets() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05, ...o });
    this.geo = {
      unit: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      barrel: new THREE.CylinderGeometry(0.45, 0.45, 1.2, 16),
      barrelStripe: new THREE.CylinderGeometry(0.46, 0.46, 0.18, 16),
      barrelTop: new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16),
      pan: new THREE.CylinderGeometry(0.38, 0.32, 0.07, 20),
      panRim: new THREE.TorusGeometry(0.38, 0.03, 6, 24),
      panHandle: new THREE.BoxGeometry(0.08, 0.05, 0.55),
      panMarker: new THREE.RingGeometry(0.5, 0.56, 32).rotateX(-Math.PI / 2),
      ring: new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2),
    };
    this.mat = {
      floor: std({ map: floorTexture(), roughness: 0.82 }),
      concrete: std({ color: 0x55525e, roughness: 0.9 }),
      parapet: std({ color: 0x3c3a46, roughness: 0.9 }),
      pillar: std({ color: 0x4a4756, roughness: 0.85 }),
      crate: std({ map: crateTexture(), roughness: 0.85 }),
      metal: std({ color: 0x8c93a0, roughness: 0.45, metalness: 0.6 }),
      darkMetal: std({ color: 0x2c2f38, roughness: 0.5, metalness: 0.6 }),
      hut: std({ color: 0x34313c, roughness: 0.9 }),
      door: std({ color: 0x0c0b10, roughness: 0.6 }),
      lamp: std({ color: 0xff2244, emissive: 0xff2244, emissiveIntensity: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
      glassEdge: std({ color: 0x9fe8ff, emissive: 0x58d8ff, emissiveIntensity: 0.55 }),
      neonPink: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.28, 1.3) }),
      neonCyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 1.6, 2.2) }),
      neonCap: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.12, 0.55) }),
      barrel: std({ color: 0xb3121b, roughness: 0.5, metalness: 0.3, emissive: 0xff2200, emissiveIntensity: 0.25 }),
      barrelTop: std({ color: 0x5a0a0e, roughness: 0.5, metalness: 0.3 }),
      hazard: std({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 0.35 }),
      pan: std({ color: 0x22242a, roughness: 0.3, metalness: 0.85 }),
      panRim: std({ color: 0xffd38a, emissive: 0xffb347, emissiveIntensity: 1.4, metalness: 0.9, roughness: 0.25 }),
      panMarker: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.9, 0.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      spawnRing: new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    };
  }

  buildLights() {
    const s = this.scene;
    s.background = new THREE.Color(0x0a0816);
    s.fog = new THREE.FogExp2(0x0d0a1c, 0.011);

    s.add(new THREE.HemisphereLight(0x8c80ff, 0x1c1020, 1.1));
    const moon = new THREE.DirectionalLight(0xc4d2ff, 1.6);
    moon.position.set(-14, 32, 16);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const c = moon.shadow.camera;
    c.left = -28;
    c.right = 28;
    c.top = 22;
    c.bottom = -22;
    c.near = 1;
    c.far = 90;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.03;
    s.add(moon);
    s.add(moon.target);

    const neon = [
      [0xff3fa4, 0, 3.5, -16.5, 90, 34],
      [0x3fe6ff, -23, 2.5, 6, 60, 26],
      [0x3fe6ff, 23, 2.5, 6, 60, 26],
      [0xffa040, 0, 4, 16.5, 50, 26],
    ];
    for (const [col, x, y, z, i, d] of neon) {
      const l = new THREE.PointLight(col, i, d, 1.6);
      l.position.set(x, y, z);
      s.add(l);
    }
  }

  addBox(x, z, w, d, h, mat, kind, { cast = true, solid = true } = {}) {
    const m = new THREE.Mesh(this.geo.unit, mat);
    m.position.set(x, 0, z);
    m.scale.set(w, h, d);
    m.castShadow = cast;
    m.receiveShadow = true;
    this.scene.add(m);
    if (!solid) return m;
    const s = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, kind, alive: true, mesh: m };
    this.solids.push(s);
    return s;
  }

  buildFloor() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.halfW * 2, ARENA.halfD * 2), this.mat.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 8.5),
      new THREE.MeshStandardMaterial({ map: helipadTexture(), transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.005, -1.5);
    pad.receiveShadow = true;
    this.scene.add(pad);
  }

  buildStatic() {
    const W = ARENA.halfW;
    const D = ARENA.halfD;
    const t = 0.6;
    const ph = 1.0;
    this.addBox(0, -D - t / 2, W * 2 + t * 2, t, ph, this.mat.parapet, 'wall');
    this.addBox(0, D + t / 2, W * 2 + t * 2, t, ph * 0.8, this.mat.parapet, 'wall');
    this.addBox(-W - t / 2, 0, t, D * 2, ph, this.mat.parapet, 'wall');
    this.addBox(W + t / 2, 0, t, D * 2, ph, this.mat.parapet, 'wall');

    // neon trims along the parapet
    const trim = (x, z, w, d, y, mat) => this.addBox(x, z, w, d, 0.06, mat, 'trim', { cast: false, solid: false }).position.setY(y);
    trim(0, -D - t / 2, W * 2 + t * 2, 0.1, ph, this.mat.neonPink);
    trim(0, D + t / 2, W * 2 + t * 2, 0.1, ph * 0.8, this.mat.neonCyan);
    trim(-W - t / 2, 0, 0.1, D * 2, ph, this.mat.neonCyan);
    trim(W + t / 2, 0, 0.1, D * 2, ph, this.mat.neonCyan);

    for (const [x, z, w, d, h] of LAYOUT.crates) this.addBox(x, z, w, d, h, this.mat.crate, 'crate');
    for (const [x, z, w, d, h] of LAYOUT.walls) this.addBox(x, z, w, d, h, this.mat.concrete, 'wall');
    for (const [x, z, w, d, h] of LAYOUT.pillars) {
      this.addBox(x, z, w, d, h, this.mat.pillar, 'wall');
      const cap = this.addBox(x, z, w + 0.06, d + 0.06, 0.08, this.mat.neonCap, 'trim', { cast: false, solid: false });
      cap.position.y = h;
    }
    for (const [x, z, w, d, h] of LAYOUT.units) {
      this.addBox(x, z, w, d, h, this.mat.metal, 'unit');
      const grill = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, d) * 0.32, Math.min(w, d) * 0.32, 0.04, 20), this.mat.darkMetal);
      grill.position.set(x, h + 0.02, z);
      this.scene.add(grill);
    }
    this.doorLamps = [];
    for (const [x, z, w, d, h] of LAYOUT.huts) {
      this.addBox(x, z, w, d, h, this.mat.hut, 'wall');
      const roof = this.addBox(x, z, w + 0.4, d + 0.4, 0.15, this.mat.darkMetal, 'trim', { solid: false });
      roof.position.y = h;
      const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.1), this.mat.door);
      door.position.set(x, 1.05, z + d / 2 + 0.01);
      this.scene.add(door);
      const lampMat = this.mat.lamp.clone();
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), lampMat);
      lamp.position.set(x, 2.35, z + d / 2 + 0.08);
      this.scene.add(lamp);
      this.doorLamps.push({ x, mat: lampMat });
    }
    for (const [x, z, w, d, h] of LAYOUT.glass) {
      const mesh = new THREE.Group();
      const pane = new THREE.Mesh(this.geo.unit, this.mat.glass);
      pane.scale.set(w, h, d);
      pane.renderOrder = 1;
      const top = new THREE.Mesh(this.geo.unit, this.mat.glassEdge);
      top.scale.set(w + 0.04, 0.06, d + 0.04);
      top.position.y = h;
      const bot = new THREE.Mesh(this.geo.unit, this.mat.darkMetal);
      bot.scale.set(w + 0.06, 0.12, d + 0.06);
      mesh.add(pane, top, bot);
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      const s = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, kind: 'glass', alive: true, mesh, w, d, x, z };
      this.solids.push(s);
      this.glass.push(s);
    }

    // corner light poles (decor)
    for (const [x, z] of [[-21.4, -14.4], [21.4, -14.4], [-21.4, 14.4], [21.4, 14.4]]) {
      this.addBox(x, z, 0.18, 0.18, 4.2, this.mat.darkMetal, 'decor', { solid: false });
      const head = this.addBox(x, z, 0.6, 0.3, 0.12, this.mat.neonCyan, 'decor', { solid: false, cast: false });
      head.position.y = 4.2;
    }
  }

  buildProps() {
    for (const [x, z] of LAYOUT.barrels) this.barrels.push(new Barrel(this, x, z));
    for (const [x, z] of LAYOUT.pans) this.pans.push(new Pan(this, x, z));
    this.props = [...this.barrels, ...this.pans];
  }

  buildSpawns() {
    this.spawns = LAYOUT.spawns.map((sp, i) => {
      const mat = this.mat.spawnRing.clone();
      const ring = new THREE.Mesh(this.geo.ring, mat);
      ring.position.set(sp.ex, 0.04, sp.ez);
      this.scene.add(ring);
      if (sp.kind === 'ledge') {
        // ladder rails poking over the parapet
        const dirX = Math.sign(sp.x) * (Math.abs(sp.x) > 20 ? 1 : 0);
        const dirZ = dirX ? 0 : Math.sign(sp.z);
        for (const o of [-0.35, 0.35]) {
          const rail = this.addBox(sp.x + dirX * 0.9 + (dirZ ? o : 0), sp.z + dirZ * 0.9 + (dirX ? o : 0), 0.08, 0.08, 1.6, this.mat.metal, 'decor', { solid: false });
          rail.position.y = -0.2;
        }
      }
      return { ...sp, ring, mat, heat: 0, lamp: sp.kind === 'door' ? this.doorLamps[i] : null, lastUsed: -99 };
    });
  }

  buildBackdrop() {
    const s = this.scene;
    const facadeTex = windowTexture(0.28);
    facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
    facadeTex.repeat.set(4, 2);
    const facade = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA.halfW * 2 + 1.2, 80, ARENA.halfD * 2 + 1.2).translate(0, -40.02, 0),
      new THREE.MeshStandardMaterial({ color: 0x15141c, emissive: 0xffffff, emissiveMap: facadeTex, emissiveIntensity: 1.2, roughness: 0.9 }),
    );
    s.add(facade);

    const tex = windowTexture(0.32);
    const mat = new THREE.MeshStandardMaterial({ color: 0x14131c, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.5, roughness: 0.9 });
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const spots = [];
    for (let gx = -7; gx <= 7; gx++) {
      for (let gz = -7; gz <= 5; gz++) {
        const x = gx * 15 + rand(-4, 4);
        const z = gz * 15 + rand(-4, 4);
        if (Math.abs(x) < 36 && Math.abs(z) < 28) continue;
        if (Math.random() < 0.2) continue;
        const tall = z < -40 && Math.random() < 0.5;
        const top = tall ? rand(5, 35) : rand(-45, -6);
        spots.push([x, z, rand(7, 13), rand(7, 13), top]);
      }
    }
    const city = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z, w, d, top], i) => {
      const h = top + 90;
      m.makeScale(w, h, d);
      m.setPosition(x, -90, z);
      city.setMatrixAt(i, m);
    });
    s.add(city);

    // rooftop sign
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 3.25),
      new THREE.MeshBasicMaterial({ map: signTexture(), color: new THREE.Color(2.2, 2.2, 2.2), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    sign.position.set(0, 2.6, -16.6);
    s.add(sign);
    this.sign = sign;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(13.4, 3.6, 0.15), this.mat.darkMetal);
    frame.position.set(0, 2.6, -16.75);
    s.add(frame);
    for (const x of [-5, 5]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), this.mat.darkMetal);
      leg.position.set(x, 0.4, -16.75);
      s.add(leg);
    }
  }

  // ------------------------------------------------------------- queries

  rebuildNav() {
    this.nav.build(this.solids, 0.5);
  }

  /** Nearest static hit along a segment. */
  raycast(x0, z0, x1, z1, ignoreGlass = false) {
    let best = null;
    let bt = Infinity;
    for (const s of this.solids) {
      if (!s.alive) continue;
      if (ignoreGlass && s.kind === 'glass') continue;
      if (segAABB(x0, z0, x1, z1, s, _hit) && _hit.t < bt) {
        bt = _hit.t;
        best = { t: _hit.t, nx: _hit.nx, nz: _hit.nz, solid: s };
      }
    }
    return best;
  }

  hasLOS(x0, z0, x1, z1) {
    for (const s of this.solids) {
      if (!s.alive || s.kind === 'glass') continue;
      if (segAABB(x0, z0, x1, z1, s, _hit)) return false;
    }
    return true;
  }

  /** Distance a ray travels before hitting something solid (glass included). */
  rayLength(x0, z0, dx, dz, max) {
    const hit = this.raycast(x0, z0, x0 + dx * max, z0 + dz * max);
    return hit ? hit.t * max : max;
  }

  collideCircle(p, r) {
    let hit = false;
    for (const s of this.solids) {
      if (!s.alive) continue;
      if (p.x + r < s.minX || p.x - r > s.maxX || p.z + r < s.minZ || p.z - r > s.maxZ) continue;
      if (resolveCircleAABB(p, r, s)) hit = true;
    }
    return hit;
  }

  /** Props hit by a segment: returns {t, prop} or null. */
  raycastProps(x0, z0, x1, z1, ignore) {
    let best = null;
    let bt = Infinity;
    for (const p of this.props) {
      if (!p.alive || p === ignore) continue;
      const t = segCircle(x0, z0, x1, z1, p.x, p.z, p.r);
      if (t >= 0 && t < bt) {
        bt = t;
        best = { t, prop: p };
      }
    }
    return best;
  }

  breakGlass(s, dx, dz) {
    if (!s.alive) return;
    s.alive = false;
    s.mesh.visible = false;
    const fx = this.game.fx;
    const along = s.w > s.d;
    const len = Math.max(s.w, s.d);
    for (let i = 0; i < len * 2; i++) {
      const o = (i / (len * 2) - 0.5) * len;
      fx.shards(s.x + (along ? o : 0), rand(0.4, s.h), s.z + (along ? 0 : o), dx, dz, 5);
    }
    this.game.audio.glass(this.game.panFor(s.x));
    this.game.score.style('GLASS', 10, false);
    this.rebuildNav();
  }

  resetProps() {
    for (const p of this.props) p.reset();
    for (const s of this.glass) {
      s.alive = true;
      s.mesh.visible = true;
    }
    for (const sp of this.spawns) sp.heat = 0;
    this.rebuildNav();
  }

  // -------------------------------------------------------------- update

  updateProps(dt) {
    this.time += dt;
    const props = this.props;
    for (const p of props) {
      if (!p.alive) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const fr = Math.exp(-(p.kind === 'pan' ? 2.2 : 3.2) * dt);
      p.vx *= fr;
      p.vz *= fr;
      const ox = p.x;
      const oz = p.z;
      if (this.collideCircle(p, p.r)) {
        const nx = p.x - ox;
        const nz = p.z - oz;
        const nl = Math.hypot(nx, nz);
        if (nl > 1e-6) {
          const ux = nx / nl;
          const uz = nz / nl;
          const vn = p.vx * ux + p.vz * uz;
          if (vn < 0) {
            p.vx -= 1.5 * vn * ux;
            p.vz -= 1.5 * vn * uz;
          }
        }
      }
    }
    for (let i = 0; i < props.length; i++) {
      const a = props[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < props.length; j++) {
        const b = props[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const rr = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        a.x -= ux * push;
        a.z -= uz * push;
        b.x += ux * push;
        b.z += uz * push;
        const rel = (b.vx - a.vx) * ux + (b.vz - a.vz) * uz;
        if (rel < 0) {
          a.vx += rel * ux;
          a.vz += rel * uz;
          b.vx -= rel * ux;
          b.vz -= rel * uz;
        }
      }
    }
    for (const b of this.barrels) if (b.alive) b.update(dt);
    for (const p of this.pans) p.update(dt, this.time);
  }

  updateAmbient(realDt, worldDt, cx, cz) {
    this.rain.update(worldDt, cx, cz);
    for (const sp of this.spawns) {
      sp.heat = Math.max(0, sp.heat - realDt * 0.8);
      const pulse = sp.heat > 0 ? 0.6 + 0.4 * Math.sin(performance.now() * 0.02) : 0;
      sp.mat.color.setRGB(3 * sp.heat * pulse, 0.25 * sp.heat * pulse, 0.4 * sp.heat * pulse);
      sp.ring.visible = sp.heat > 0.01;
      if (sp.lamp) sp.lamp.mat.emissiveIntensity = 0.6 + sp.heat * pulse * 5;
    }
  }
}

export { GUN_Y };
