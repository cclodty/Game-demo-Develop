// The arena. A Level loads one map from maps.js at a time: static cover,
// destructible glass, explosive barrels/gas tanks, ricochet pans, weapon
// pads, spawn points and the map's own decoration and lighting.

import * as THREE from 'three';
import { addCutaway } from './cutaway.js';
import { Flock } from './ambient.js';
import { ENV } from './config.js';
import { MAPS } from './maps.js';
import { propModel } from './models.js';
import { buildFixtures } from './fixtures.js';
import { NavGrid } from './nav.js';
import { clamp, rand, resolveCircleAABB, resolveCirclePoly, segAABB, segCircle, segPoly, TAU } from './utils.js';
import { asphaltTexture, clubFloorTexture, corrugatedTexture, crateTexture, fenceTexture, floorTexture } from './textures.js';

const _hit = { t: 0, nx: 0, nz: 0 };

class Barrel {
  /** `block`: the built barrel even when a model is loaded (cheaper: three parts instead of the model's seven). */
  constructor(level, x, z, variant = 'barrel', block = false) {
    this.level = level;
    this.kind = 'barrel';
    this.variant = variant;
    this.home = [x, z];
    const gas = variant === 'gas';
    const lpg = variant === 'lpg';
    this.r = gas ? 0.62 : lpg ? 0.36 : 0.48;
    this.blast = gas ? 5.6 : lpg ? 4.2 : 4.4;
    this.maxHp = gas ? 4 : lpg ? 2 : 3;
    const g = new THREE.Group();
    const G = level.geo;
    const M = level.mat;
    const model = block ? null : propModel(variant, level.map.id);
    if (model) {
      // a made model; the wrapper takes the fuse wobble without touching its fitted scale
      const body = new THREE.Group();
      body.add(model);
      g.add(body);
      this.body = body;
    } else if (lpg) {
      // the LPG cylinders that sit beside every street-food stall
      const body = new THREE.Mesh(G.lpg, M.lpg);
      body.position.y = 0.52;
      const collar = new THREE.Mesh(G.lpgCollar, M.darkMetal);
      collar.position.y = 1.1;
      g.add(body, collar);
      this.body = body;
    } else if (gas) {
      const body = new THREE.Mesh(G.gas, M.gas);
      body.position.y = 0.8;
      const band = new THREE.Mesh(G.gasBand, M.gasBand);
      band.position.y = 1.0;
      const valve = new THREE.Mesh(G.gasValve, M.darkMetal);
      valve.position.y = 1.7;
      g.add(body, band, valve);
      this.body = body;
    } else {
      const body = new THREE.Mesh(G.barrel, M.barrel);
      body.position.y = 0.6;
      const stripe = new THREE.Mesh(G.barrelStripe, M.hazard);
      stripe.position.y = 0.75;
      const top = new THREE.Mesh(G.barrelTop, M.barrelTop);
      top.position.y = 1.21;
      g.add(body, stripe, top);
      this.body = body;
    }
    g.traverse((m) => {
      if (m.isMesh) m.castShadow = m.receiveShadow = true;
    });
    this.mesh = g;
    level.add(g);
    this.reset();
  }

  reset() {
    [this.x, this.z] = this.home;
    this.vx = this.vz = 0;
    this.hp = this.maxHp;
    this.fuse = -1;
    this.y = 0;
    this.vy = 0;
    this.carried = false;
    this.thrown = false;
    this.alive = true;
    this.rocketT = -1; // an LPG cylinder kicked into flight: seconds of jet left (rocket)
    this.rocketSpeed = 0; // the jet's own speed: the floor's drag does not slow it
    this.rocketHit = false;
    this.mesh.visible = true;
    this.body.scale.setScalar(1);
    this.body.rotation.set(0, 0, 0);
    this.mesh.rotation.set(0, rand(0, TAU), 0);
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

  /** Kicked along (dx, dz): an LPG cylinder's valve gives and it jets off, bouncing off walls, until it meets an enemy or its ENV.rocketTime is up. */
  rocket(dx, dz) {
    if (!this.alive || this.carried || this.fuse >= 0 || this.variant !== 'lpg' || this.rocketT > 0) return false;
    this.rocketT = ENV.rocketTime;
    this.rocketSpeed = 6;
    this.vx = dx * 6;
    this.vz = dz * 6;
    const g = this.level.game;
    g.audio.fuse(g.panFor(this.x));
    g.notes.log('石油氣樽噴射');
    return true;
  }

  update(dt) {
    if (this.fuse >= 0) {
      this.fuse -= dt;
      this.body.scale.setScalar(rand(1, 1.08));
      if (this.fuse < 0) {
        this.alive = false;
        this.mesh.visible = false;
        this.level.game.explode(this.x, this.z, this.blast, { kind: 'barrel', rocket: this.rocketHit });
        return;
      }
    }
    if (this.carried) return;
    if (this.rocketT > 0 && this.fuse < 0) {
      // the jet: faster along its way, sparks behind, a burst on the first enemy it meets or when the gas is spent
      const g = this.level.game;
      this.rocketT -= dt;
      const sp = Math.hypot(this.vx, this.vz) || 1;
      const ux = this.vx / sp; // the way it points (a wall bounce turned it)
      const uz = this.vz / sp;
      this.rocketSpeed = Math.min(ENV.rocketSpeed, this.rocketSpeed + ENV.rocketAccel * dt);
      this.vx = ux * this.rocketSpeed;
      this.vz = uz * this.rocketSpeed;
      g.fx.sparks(this.x - ux * 0.5, 0.5, this.z - uz * 0.5, -ux, -uz, 2, [8, 3, 0.6], 7, 0.5);
      this.body.rotation.z = Math.PI / 2 - 0.3; // lying along its flight
      this.mesh.rotation.y = Math.atan2(ux, uz);
      for (const e of g.enemies.list) {
        if (!e.alive || e.spawnLock > 0 || e.cfg.fly || Math.hypot(e.x - this.x, e.z - this.z) > e.radius + this.r + 0.1) continue;
        this.rocketHit = true;
        this.ignite(0.02);
        break;
      }
      if (this.rocketT <= 0) {
        this.rocketHit = true;
        this.ignite(0.02);
      }
    }
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        if (this.thrown) {
          this.thrown = false;
          this.ignite(0.02); // a thrown barrel is a bomb
        }
      }
    }
    this.mesh.position.set(this.x, this.y, this.z);
  }
}

/**
 * A fire extinguisher (滅火筒): one bullet bursts it into a white cloud of
 * ENV.smokeRadius for ENV.smokeTime, in which no enemy aims (a kill there is
 * SMOKE); a kick sends it careering about for ENV.tumbleTime, bowling over
 * whoever it meets (pushProps). It can be picked up and thrown like a pan.
 */
class Extinguisher {
  constructor(level, x, z) {
    this.level = level;
    this.kind = 'extinguisher';
    this.variant = 'extinguisher';
    this.home = [x, z];
    this.r = 0.28;
    const g = new THREE.Group();
    const body = new THREE.Mesh(level.geo.extinguisher, level.mat.extinguisher);
    body.position.y = 0.3;
    const head = new THREE.Mesh(level.geo.extHead, level.mat.darkMetal);
    head.position.y = 0.64;
    g.add(body, head); // two meshes: every mesh is three draw calls with its shadow and its outline, and the club's budget is tight
    g.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    this.tilt = g; // what a throw tumbles (thrown.js) and the calibration measures
    this.mesh = new THREE.Group();
    this.mesh.add(g);
    level.add(this.mesh);
    this.cloud = new THREE.Mesh(level.geo.cloud, level.mat.cloud);
    this.cloud.position.y = 0.02;
    this.cloud.userData.noOutline = true;
    level.add(this.cloud);
    this.reset();
  }

  reset() {
    [this.x, this.z] = this.home;
    this.vx = this.vz = 0;
    this.y = 0;
    this.vy = 0;
    this.hp = 1;
    this.smokeT = 0;
    this.tumbleT = 0;
    this.steerT = 0;
    this.puff = 0;
    this.alive = true;
    this.carried = false;
    this.thrown = false;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.set(0, 0, 0);
    this.tilt.rotation.set(0, 0, 0);
    this.cloud.visible = false;
  }

  /** A bullet: it bursts. */
  hit(dmg, dx, dz) {
    if (!this.alive || this.smokeT > 0) return;
    this.hp -= dmg;
    this.vx += dx * 0.4;
    this.vz += dz * 0.4;
    if (this.hp <= 0) this.burst();
  }

  burst() {
    const g = this.level.game;
    this.smokeT = ENV.smokeTime;
    this.vx = this.vz = 0;
    this.tumbleT = 0;
    this.cloud.visible = true;
    this.cloud.position.set(this.x, 0.02, this.z);
    g.fx.smokePuff(this.x, 0.6, this.z, 14, 1.2, 0.9, 1.6);
    g.audio.glass(g.panFor(this.x));
    g.level.noise(this.x, this.z, 5);
    g.notes.log('滅火筒爆開，白霧四散');
  }

  /** Kicked along (dx, dz): off it goes, and keeps going. */
  kick(dx, dz) {
    if (!this.alive || this.smokeT > 0) return;
    this.tumbleT = ENV.tumbleTime;
    this.steerT = 0.3;
    this.vx = dx * ENV.tumbleSpeed;
    this.vz = dz * ENV.tumbleSpeed;
    this.level.game.notes.log('踢飛滅火筒');
  }

  /** Inside this one's cloud. */
  smokeAt(x, z) {
    return this.smokeT > 0 && Math.hypot(x - this.x, z - this.z) < ENV.smokeRadius;
  }

  update(dt) {
    const g = this.level.game;
    if (this.smokeT > 0) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.alive = false;
        this.mesh.visible = false;
        this.cloud.visible = false;
        return;
      }
      if (++this.puff % 6 === 0) g.fx.smokePuff(this.x + rand(-1.6, 1.6), 0.4, this.z + rand(-1.6, 1.6), 1, 1.0, 0.88, 0.9);
      this.cloud.material.opacity = 0.3 + 0.08 * Math.sin(g.worldTime * 2) * Math.min(1, this.smokeT / 1.5);
      this.cloud.scale.setScalar(Math.min(1, this.smokeT / 1.2 + 0.3));
      return;
    }
    if (this.carried) return;
    if (this.tumbleT > 0 && this.y <= 0.05) {
      // careering about: its speed is kept up and its course wanders a little every 0.3 s
      this.tumbleT -= dt;
      this.steerT -= dt;
      const sp = Math.hypot(this.vx, this.vz) || 1;
      let ux = this.vx / sp;
      let uz = this.vz / sp;
      if (this.steerT <= 0) {
        this.steerT = 0.3;
        const a = Math.atan2(ux, uz) + g.rng.range(-0.6, 0.6);
        ux = Math.sin(a);
        uz = Math.cos(a);
      }
      this.vx = ux * ENV.tumbleSpeed;
      this.vz = uz * ENV.tumbleSpeed;
      if (++this.puff % 3 === 0) g.fx.smokePuff(this.x - ux * 0.3, 0.3, this.z - uz * 0.3, 1, 0.5, 0.9, 1.4);
    }
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 22 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.thrown = false;
      }
    }
    const sp = Math.hypot(this.vx, this.vz);
    this.mesh.position.set(this.x, this.y, this.z);
    if (sp > 1) {
      this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
      this.tilt.rotation.x = Math.PI / 2;
      this.tilt.position.y = 0.12;
    } else if (this.y <= 0) {
      this.tilt.rotation.x = 0;
      this.tilt.position.y = 0;
    }
  }
}

class Pan {
  constructor(level, x, z, variant = 'pan') {
    this.level = level;
    this.kind = 'pan';
    this.variant = variant;
    this.home = [x, z];
    this.r = 0.46;
    const g = new THREE.Group();
    const tilt = new THREE.Group();
    const tray = variant === 'tray';
    const model = propModel(tray ? 'tray' : 'pan', level.map.id);
    if (model) {
      tilt.add(model);
    } else {
      const disk = new THREE.Mesh(level.geo.pan, tray ? level.mat.tray : level.mat.pan);
      const rim = new THREE.Mesh(level.geo.panRim, level.mat.panRim);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.03;
      tilt.add(disk, rim);
      if (!tray) {
        const handle = new THREE.Mesh(level.geo.panHandle, level.mat.pan);
        handle.position.set(0, 0.03, 0.62);
        tilt.add(handle);
      }
    }
    tilt.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    g.add(tilt);
    const marker = new THREE.Mesh(level.geo.panMarker, level.mat.panMarker);
    marker.position.y = 0.06;
    this.marker = marker;
    level.add(marker);
    this.tilt = tilt;
    this.mesh = g;
    level.add(g);
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
    this.carried = false; // held over the player's head (see thrown.js)
    this.thrown = false; // in flight after a throw
  }

  hit(dx, dz, power) {
    this.vx += dx * power;
    this.vz += dz * power;
    this.vy = Math.max(this.vy, power * 0.9);
    this.spin += rand(-1, 1) * power * 3;
  }

  update(dt, time) {
    if (this.carried) return;
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    if (this.y < 0.05) {
      this.y = 0.05;
      this.vy = this.vy < -3 ? -this.vy * 0.35 : 0;
      if (this.vy === 0) this.thrown = false;
    }
    this.angle += this.spin * dt;
    this.spin *= Math.exp(-2 * dt);
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.angle;
    const air = clamp((this.y - 0.05) * 1.5, 0, 1);
    this.tilt.rotation.x = Math.sin(this.angle * 2.3) * 0.5 * air;
    this.marker.position.set(this.x, 0.06, this.z);
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
    if (!this.lines.visible) return;
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
    this.time = 0;
    this.beat = 0;
    this.root = null;
    this.owned = [];
    // camera -> player cutaway, shared by every material that opts in (see maps.js)
    this.cut = {
      uCutA: { value: new THREE.Vector3() },
      uCutB: { value: new THREE.Vector3() },
      uCutR: { value: 0 },
      uCutSoft: { value: 1 }, // 1: the hole's rim dissolves in noise; 0: a clean rim (the flat look, whose edge pass would ink the noise)
      // the map's fade (maps.js `fade`): outside the play area on the camera's side
      uFadeOn: { value: 0 },
      uFadeY: { value: 1.2 },
      uFadeBox: { value: new THREE.Vector2() },
      uFadeDir: { value: new THREE.Vector2(0, 1) },
    };
    this.makeAssets();
    this.buildLights();
    this.rain = new Rain(this.scene, 900);
    this.load(MAPS[0]);
  }

  makeAssets() {
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05, ...o });
    const container = (color) => std({ map: corrugatedTexture(3), color, roughness: 0.6, metalness: 0.3 });
    this.geo = {
      unit: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      barrel: new THREE.CylinderGeometry(0.45, 0.45, 1.2, 16),
      barrelStripe: new THREE.CylinderGeometry(0.46, 0.46, 0.18, 16),
      barrelTop: new THREE.CylinderGeometry(0.4, 0.4, 0.03, 16),
      gas: new THREE.CylinderGeometry(0.58, 0.58, 1.6, 18),
      gasBand: new THREE.CylinderGeometry(0.59, 0.59, 0.3, 18),
      gasValve: new THREE.CylinderGeometry(0.12, 0.16, 0.22, 8),
      lpg: new THREE.CapsuleGeometry(0.3, 0.5, 6, 14),
      extinguisher: new THREE.CylinderGeometry(0.12, 0.12, 0.55, 12),
      extHead: new THREE.CylinderGeometry(0.05, 0.08, 0.14, 8),
      cloud: new THREE.CircleGeometry(ENV.smokeRadius, 36).rotateX(-Math.PI / 2),
      lpgCollar: new THREE.CylinderGeometry(0.14, 0.18, 0.18, 10, 1, true),
      pan: new THREE.CylinderGeometry(0.38, 0.32, 0.07, 20),
      panRim: new THREE.TorusGeometry(0.38, 0.03, 6, 24),
      panHandle: new THREE.BoxGeometry(0.08, 0.05, 0.55),
      panMarker: new THREE.RingGeometry(0.5, 0.56, 32).rotateX(-Math.PI / 2),
      ring: new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2),
      padRing: new THREE.RingGeometry(0.72, 0.86, 6).rotateX(-Math.PI / 2),
      padBase: new THREE.CircleGeometry(0.8, 6).rotateX(-Math.PI / 2),
      door: new THREE.PlaneGeometry(1, 1),
    };
    this.mat = {
      concrete: std({ color: 0x55525e, roughness: 0.9 }),
      parapet: std({ color: 0x3c3a46, roughness: 0.9 }),
      pillar: std({ color: 0x4a4756, roughness: 0.85 }),
      crate: std({ map: crateTexture(), roughness: 0.85 }),
      metal: std({ color: 0x8c93a0, roughness: 0.45, metalness: 0.6 }),
      unit: std({ color: 0x8c93a0, roughness: 0.45, metalness: 0.6 }),
      darkMetal: std({ color: 0x2c2f38, roughness: 0.5, metalness: 0.6 }),
      hut: std({ color: 0x34313c, roughness: 0.9 }),
      door: std({ color: 0x0c0b10, roughness: 0.6 }),
      lamp: std({ color: 0xff2244, emissive: 0xff2244, emissiveIntensity: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false }),
      glassEdge: std({ color: 0x9fe8ff, emissive: 0x58d8ff, emissiveIntensity: 0.55 }),
      neonPink: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.28, 1.3) }),
      neonCyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 1.6, 2.2) }),
      neonViolet: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.4, 2.4) }),
      neonOrange: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.0, 0.2) }),
      neonCap: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.12, 0.55) }),
      barrel: std({ color: 0xb3121b, roughness: 0.5, metalness: 0.3, emissive: 0xff2200, emissiveIntensity: 0.25 }),
      barrelTop: std({ color: 0x5a0a0e, roughness: 0.5, metalness: 0.3 }),
      hazard: std({ color: 0xf2c230, emissive: 0xf2c230, emissiveIntensity: 0.35 }),
      gas: std({ color: 0xd8dde4, roughness: 0.35, metalness: 0.4 }),
      gasBand: std({ color: 0x2a6cff, emissive: 0x2a6cff, emissiveIntensity: 0.5 }),
      lpg: std({ color: 0xe8652a, roughness: 0.45, metalness: 0.35, emissive: 0xff4400, emissiveIntensity: 0.15 }),
      extinguisher: std({ color: 0xc8202a, roughness: 0.4, metalness: 0.4 }),
      cloud: new THREE.MeshBasicMaterial({ color: 0xf0f2f4, transparent: true, opacity: 0.3, depthWrite: false }),
      pan: std({ color: 0x22242a, roughness: 0.3, metalness: 0.85 }),
      tray: std({ color: 0xb8bcc6, roughness: 0.2, metalness: 0.95 }),
      panRim: std({ color: 0xffd38a, emissive: 0xffb347, emissiveIntensity: 1.4, metalness: 0.9, roughness: 0.25 }),
      panMarker: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.9, 0.4), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      spawnRing: new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      padRing: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.45, 0.1), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      padBase: std({ color: 0x1c1d24, roughness: 0.4, metalness: 0.6 }),
      // nightclub
      clubWall: std({ color: 0x221a2e, roughness: 0.85 }),
      bar: std({ color: 0x3a2418, roughness: 0.5 }),
      dj: std({ color: 0x111116, roughness: 0.4, metalness: 0.3 }),
      speaker: std({ color: 0x0d0d10, roughness: 0.7 }),
      sofa: std({ color: 0x4a1a5e, roughness: 0.95 }),
      table: std({ color: 0x1a1a22, roughness: 0.3, metalness: 0.4 }),
      // docks
      containerRed: container(0xa8322a),
      containerBlue: container(0x2a5a9a),
      containerGreen: container(0x2f7a4a),
      containerOrange: container(0xd0782a),
      curb: std({ color: 0x6a6a70, roughness: 0.95 }),
      forklift: std({ color: 0xe0b020, roughness: 0.5, metalness: 0.3 }),
      // street furniture (Largo do Senado)
      stall: std({ color: 0x8a5a36, roughness: 0.7 }),
      kiosk: std({ color: 0x24513a, roughness: 0.6, metalness: 0.2 }),
      magazines: std({ color: 0xd9c27a, roughness: 0.8 }),
      canopyA: std({ color: 0xc8302a, roughness: 0.8, side: THREE.DoubleSide }),
      canopyB: std({ color: 0xf2efe6, roughness: 0.8, side: THREE.DoubleSide }),
      planter: std({ color: 0xb9b2a4, roughness: 0.9 }),
      bush: std({ color: 0x4f7a3e, roughness: 0.95, flatShading: true }),
      streetlamp: std({ color: 0x1d1f22, roughness: 0.5, metalness: 0.5 }),
      lampGlass: std({ color: 0xfff6e0, emissive: 0xfff0c8, emissiveIntensity: 0.6, roughness: 0.3 }),
      car: std({ color: 0x1a1c20, roughness: 0.3, metalness: 0.6 }),
      carTop: std({ color: 0xe9d9a8, roughness: 0.5 }),
      carGlass: std({ color: 0x20282e, roughness: 0.15, metalness: 0.5 }),
    };
  }

  buildLights() {
    const s = this.scene;
    s.background = new THREE.Color();
    s.fog = new THREE.FogExp2(0x000000, 0.01);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    s.add(this.hemi);
    const moon = (this.moon = new THREE.DirectionalLight(0xffffff, 1));
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.03;
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 100;
    s.add(moon, moon.target);
    // Always exactly four map lights, so switching maps never changes the
    // light count (which would force every shader to recompile).
    this.points = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 1.6);
      s.add(l);
      this.points.push({ light: l, base: new THREE.Vector3(), intensity: 0 });
    }
  }

  // ------------------------------------------------------------ loading

  add(obj) {
    this.root.add(obj);
    return obj;
  }

  own(res) {
    this.owned.push(res);
    return res;
  }

  unload() {
    if (!this.root) return;
    this.scene.remove(this.root);
    for (const r of this.owned) r.dispose();
    this.owned = [];
    this.root = null;
  }

  load(map) {
    this.unload();
    if (this.game.style) this.game.style.undress(this); // build from the lit materials (clones of a twin would keep the last map's look)
    this.map = map;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    const [halfW, halfD] = map.size;
    this.bounds = { halfW, halfD };
    this.start = { x: map.start[0], z: map.start[1] };
    this.solids = [];
    this.glass = [];
    this.crates = [];
    this.barrels = [];
    this.pans = [];
    this.tools = [];
    this.fixtures = [];
    this.water = []; // { x, z, w, d } rectangles or { x, z, r } circles of water: bodies knocked in are gone, props sink
    this.props = [];
    this.pads = [];
    this.animators = [];
    this.ambient = [];
    this.groundFn = null;

    this.applyTheme(map.theme);
    if (map.floor !== 'none') this.buildFloor(map.floor);
    this.buildEdges(map.edges);
    // a variant (rules.js glassUpTo) makes every box of cover up to that height glass
    this.glassUpTo = this.game.ruleset.glassUpTo;
    for (const s of map.solids) {
      if (this.glassUpTo && typeof s[0] === 'number' && s[4] <= this.glassUpTo) this.addGlass(s[0], s[1], s[2], s[3], s[4]);
      else this.addSolid(...s);
    }
    for (const g of map.glass || []) this.addGlass(...g);
    for (const [x, z, v] of map.barrels || []) this.barrels.push(new Barrel(this, x, z, v));
    // a variant (rules.js pansAsBarrels) puts a barrel where each pan was: the built one, as the
    // model's seven parts (21 draw calls with outlines and shadows) would take the club over its budget
    this.pansAsBarrels = this.game.ruleset.pansAsBarrels;
    for (const [x, z, v] of map.pans || []) {
      if (this.pansAsBarrels) this.barrels.push(new Barrel(this, x, z, 'barrel', true));
      else this.pans.push(new Pan(this, x, z, v));
    }
    this.flocks = (map.flocks || []).map(([x, z]) => new Flock(x, z));
    this.water = (map.water || []).map((w) => ({ ...w }));
    for (const [x, z, kind] of map.tools || []) if (kind === 'extinguisher') this.tools.push(new Extinguisher(this, x, z)); // things to pick up and use (more kinds come with their cards)
    this.fixtures = buildFixtures(this, map.fixtures); // lamps and signs: fixed props that play along (fixtures.js)
    this.props = [...this.barrels, ...this.pans, ...this.tools, ...this.fixtures];
    for (const [x, z] of map.pads || []) this.addPad(x, z);
    this.buildSpawns(map.spawns);
    if (map.decorate) map.decorate(this);
    // Everything lit in the map can be cut away when it hides the player
    // (tall Senado buildings in any view, low walls once the camera tilts).
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && m.isMeshStandardMaterial) addCutaway(m, this.cut);
      }
    });
    if (this.game.style) this.game.style.dressLevel(this); // the look: toon twins (with the cutaway), lines on the props

    this.nav = new NavGrid(-halfW, -halfD, halfW, halfD, 0.5);
    this.rebuildNav();
  }

  applyTheme(t) {
    const s = this.scene;
    s.background.set(t.bg);
    s.fog.color.set(t.fog[0]);
    s.fog.density = t.fog[1];
    this.hemi.color.set(t.hemi[0]);
    this.hemi.groundColor.set(t.hemi[1]);
    this.hemi.intensity = t.hemi[2];
    this.moon.color.set(t.moon[0]);
    this.moon.intensity = t.moon[1];
    this.sunOffset = new THREE.Vector3(...(t.sunDir || [-14, 32, 16]));
    this.moon.position.copy(this.sunOffset);
    this.moon.target.position.set(0, 0, 0);
    // Big maps keep a fixed-size shadow box that follows the camera instead
    // of stretching one shadow map over the whole level.
    this.shadowFollow = !!t.shadowFollow;
    const c = this.moon.shadow.camera;
    const { halfW, halfD } = this.bounds;
    const sx = this.shadowFollow ? 42 : halfW + 6;
    const sz = this.shadowFollow ? 42 : halfD + 7;
    c.left = -sx;
    c.right = sx;
    c.top = sz;
    c.bottom = -sz;
    c.far = this.shadowFollow ? 160 : 100;
    c.updateProjectionMatrix();
    this.exposure = t.exposure ?? 1.05;
    this.bloom = t.bloom || { strength: 0.85, threshold: 0.82 };
    t.points.forEach(([color, x, y, z, intensity, distance], i) => {
      const p = this.points[i];
      p.light.color.set(color);
      p.light.position.set(x, y, z);
      p.light.distance = distance;
      p.light.intensity = intensity;
      p.base.set(x, y, z);
      p.intensity = intensity;
    });
    this.rain.lines.visible = !!t.rain;
  }

  addBox(x, z, w, d, h, mat, kind, { cast = true, solid = true, visible = true } = {}) {
    let m = null;
    if (visible) {
      m = new THREE.Mesh(this.geo.unit, mat);
      m.position.set(x, 0, z);
      m.scale.set(w, h, d);
      m.castShadow = cast;
      m.receiveShadow = true;
      this.add(m);
    }
    if (!solid) return m;
    const s = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, kind, alive: true, mesh: m };
    this.solids.push(s);
    return s;
  }

  /** Decorative box (no collision); returns the mesh. */
  deco(x, y, z, w, h, d, mat, cast = false) {
    const m = new THREE.Mesh(this.geo.unit, mat);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    m.castShadow = cast;
    m.receiveShadow = true;
    return this.add(m);
  }

  /** face: optional direction (degrees) a made model's front points: 0 south, 90 east, 180 north, 270 west. */
  addSolid(x, z, w, d, h, matKey, face) {
    const M = this.mat;
    const s = this.addBox(x, z, w, d, h, M[matKey], matKey === 'crate' ? 'crate' : 'wall');
    if (matKey === 'crate') {
      // wooden crates break apart after ENV.crateHits bullets (breakCrate)
      Object.assign(s, { x, z, w, d, hp: ENV.crateHits });
      this.crates.push(s);
    }
    const model = propModel(matKey, this.map.id, w, d, h, face);
    if (model) {
      // a made model replaces the block look; the box stays for collision
      s.mesh.visible = false;
      model.position.set(x, 0, z);
      this.add(model);
      s.model = model; // for test/calibration.test.mjs
      s.modelKey = matKey;
      return s;
    }
    switch (matKey) {
      case 'pillar':
        this.deco(x, h, z, w + 0.06, 0.08, d + 0.06, M.neonCap);
        break;
      case 'unit': {
        const r = Math.min(w, d) * 0.32;
        const grill = new THREE.Mesh(this.own(new THREE.CylinderGeometry(r, r, 0.04, 20)), M.darkMetal);
        grill.position.set(x, h + 0.02, z);
        this.add(grill);
        break;
      }
      case 'hut':
        this.deco(x, h, z, w + 0.4, 0.15, d + 0.4, M.darkMetal, true);
        break;
      case 'bar':
        this.deco(x, h - 0.02, z, w + 0.1, 0.06, d + 0.15, M.darkMetal);
        this.deco(x, h * 0.75, z + d / 2 + 0.01, w, 0.06, 0.02, M.neonPink);
        break;
      case 'dj':
        this.deco(x, 0.35, z + d / 2 + 0.01, w * 0.9, 0.6, 0.02, M.neonCyan);
        this.deco(x, h, z, w * 0.7, 0.05, d * 0.6, M.neonViolet);
        break;
      case 'speaker':
        this.deco(x, h * 0.62, z + d / 2 + 0.01, w * 0.62, w * 0.62, 0.02, M.darkMetal);
        this.deco(x, h + 0.01, z, w * 0.9, 0.02, d * 0.9, M.darkMetal);
        break;
      case 'table':
        this.deco(x, h, z, 0.12, 0.12, 0.12, M.neonOrange);
        break;
      case 'stall': {
        // a counter with a striped canopy on poles
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.deco(x + sx * (w / 2 - 0.05), h, z + sz * (d / 2 - 0.05), 0.05, 1.25, 0.05, M.streetlamp);
        const n = 6;
        for (let i = 0; i < n; i++) {
          this.deco(x - w / 2 - 0.15 + ((w + 0.3) * (i + 0.5)) / n, h + 1.25, z, (w + 0.3) / n, 0.05, d + 0.4, i % 2 ? M.canopyB : M.canopyA, true);
        }
        break;
      }
      case 'kiosk':
        this.deco(x, h, z, w + 0.5, 0.1, d + 0.5, M.kiosk, true);
        this.deco(x, 0.9, z + d / 2 + 0.01, w * 0.85, 0.7, 0.04, M.magazines);
        break;
      case 'planter': {
        const bush = new THREE.Mesh(this.own(new THREE.IcosahedronGeometry(Math.min(w, d) * 0.45, 0)), M.bush);
        bush.position.set(x, h + 0.25, z);
        bush.castShadow = true;
        this.add(bush);
        break;
      }
      case 'streetlamp':
        // the collision box stays 30 cm; the visible post is a slim cast-iron pole
        s.mesh.visible = false;
        this.deco(x, 0, z, 0.24, 0.5, 0.24, M.streetlamp, true);
        this.deco(x, 0, z, 0.11, h, 0.11, M.streetlamp, true);
        this.deco(x, h, z, 0.55, 0.06, 0.08, M.streetlamp);
        for (const o of [-0.26, 0.26]) this.deco(x + o, h - 0.45, z, 0.18, 0.4, 0.18, M.lampGlass);
        break;
      case 'car':
        this.deco(x - w * 0.05, h, z, w * 0.55, 0.5, d * 0.92, M.carGlass, true);
        this.deco(x - w * 0.05, h + 0.5, z, w * 0.5, 0.06, d * 0.86, M.carTop);
        break;
      case 'forklift':
        this.deco(x, 0, z - d / 2 - 0.15, w * 0.9, 2.6, 0.18, M.darkMetal, true);
        this.deco(x - w * 0.3, 0.12, z - d / 2 - 0.65, 0.12, 0.06, 1.0, M.darkMetal);
        this.deco(x + w * 0.3, 0.12, z - d / 2 - 0.65, 0.12, 0.06, 1.0, M.darkMetal);
        this.deco(x, h, z + d * 0.15, w, 0.08, d * 0.55, M.darkMetal, true);
        break;
    }
    return s;
  }

  /** A solid with an arbitrary footprint: points = [[x, z], ...] in game space. */
  addPoly(points, h, kind = 'wall') {
    const poly = [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const [x, z] of points) {
      poly.push(x, z);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const s = { minX, maxX, minZ, maxZ, h, kind, alive: true, mesh: null, poly };
    this.solids.push(s);
    return s;
  }

  addGlass(x, z, w, d, h) {
    const mesh = new THREE.Group();
    const pane = new THREE.Mesh(this.geo.unit, this.mat.glass);
    pane.scale.set(w, h, d);
    pane.renderOrder = 1;
    const bot = new THREE.Mesh(this.geo.unit, this.mat.darkMetal);
    bot.scale.set(w + 0.06, 0.12, d + 0.06);
    mesh.add(pane, bot);
    // a pane gets a lit top edge; a block of glass (cover in the glass variant) a rim round its top, not a glowing lid
    const edges =
      Math.min(w, d) > 0.5
        ? [
            [0, -d / 2, w + 0.04, 0.05],
            [0, d / 2, w + 0.04, 0.05],
            [-w / 2, 0, 0.05, d],
            [w / 2, 0, 0.05, d],
          ]
        : [[0, 0, w + 0.04, d + 0.04]];
    for (const [ex, ez, ew, ed] of edges) {
      const top = new THREE.Mesh(this.geo.unit, this.mat.glassEdge);
      top.scale.set(ew, 0.06, ed);
      top.position.set(ex, h, ez);
      mesh.add(top);
    }
    mesh.position.set(x, 0, z);
    this.add(mesh);
    const s = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h, kind: 'glass', alive: true, mesh, w, d, x, z };
    this.solids.push(s);
    this.glass.push(s);
    return s;
  }

  addPad(x, z) {
    const base = new THREE.Mesh(this.geo.padBase, this.mat.padBase);
    base.position.set(x, 0.05, z);
    base.receiveShadow = true;
    const ring = new THREE.Mesh(this.geo.padRing, this.mat.padRing);
    ring.position.set(x, 0.07, z);
    this.add(base);
    this.add(ring);
    this.pads.push({ x, z, pickup: null });
  }

  buildFloor(kind) {
    const { halfW, halfD } = this.bounds;
    const tex = this.own(kind === 'club' ? clubFloorTexture() : kind === 'asphalt' ? asphaltTexture() : floorTexture());
    tex.repeat.set((halfW * 2) / 8, (halfD * 2) / 8);
    const mat = this.own(
      new THREE.MeshStandardMaterial({
        map: tex,
        roughness: kind === 'club' ? 0.28 : kind === 'asphalt' ? 0.9 : 0.82,
        metalness: kind === 'club' ? 0.25 : 0.05,
      }),
    );
    const geo = this.own(new THREE.PlaneGeometry(halfW * 2, halfD * 2));
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
  }

  buildEdges(edges) {
    const { halfW: W, halfD: D } = this.bounds;
    const t = 0.6;
    const side = (key, x, z, w, d) => {
      if (!edges) {
        // invisible boundary: the map's own buildings and barriers mark the edge. It stops people
        // and thrown things, not shots (raycast's `edges`): a shot flies on into the street beyond
        this.addBox(x, z, w, d, 3, null, 'wall', { visible: false }).edge = true;
        return;
      }
      const [h, matKey, trim] = edges[key];
      const length = Math.max(w, d);
      if (matKey === 'fence') {
        // collision box stays thick; the visible fence is a thin lattice
        this.addBox(x, z, w, d, h, null, 'wall', { visible: false });
        const tex = this.own(fenceTexture());
        tex.repeat.set(length / 1.5, h / 1.5);
        const mat = this.own(new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
        const along = w > d;
        this.deco(x, 0, z, along ? w : 0.04, h, along ? 0.04 : d, mat);
        for (let o = -length / 2; o <= length / 2 + 0.01; o += 3) {
          this.deco(along ? x + o : x, 0, along ? z : z + o, 0.1, h + 0.1, 0.1, this.mat.darkMetal, true);
        }
        this.deco(x, h, z, along ? w : 0.08, 0.06, along ? 0.08 : d, this.mat.darkMetal);
      } else {
        let mat = this.mat[matKey];
        if (matKey === 'warehouse') {
          const tex = this.own(corrugatedTexture(length / 3));
          mat = this.own(new THREE.MeshStandardMaterial({ map: tex, color: 0x6a7686, roughness: 0.6, metalness: 0.4 }));
        }
        this.addBox(x, z, w, d, h, mat, 'wall');
      }
      if (trim) this.deco(x, h, z, w > d ? w : 0.1, 0.06, w > d ? 0.1 : d, this.mat[trim]);
    };
    side('n', 0, -D - t / 2, W * 2 + t * 2, t);
    side('s', 0, D + t / 2, W * 2 + t * 2, t);
    side('w', -W - t / 2, 0, t, D * 2);
    side('e', W + t / 2, 0, t, D * 2);
  }

  buildSpawns(list) {
    this.spawns = list.map((sp) => {
      const mat = this.own(this.mat.spawnRing.clone());
      const ring = new THREE.Mesh(this.geo.ring, mat);
      ring.position.set(sp.ex, 0.07, sp.ez);
      this.add(ring);
      let dx = sp.ex - sp.x;
      let dz = sp.ez - sp.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      let lamp = null;
      if (sp.kind === 'door') {
        const [dw, dh] = sp.door || [1.3, 2.1];
        const door = new THREE.Mesh(this.geo.door, this.mat.door);
        door.scale.set(dw, dh, 1);
        door.position.set(sp.x - dx * 0.59, dh / 2, sp.z - dz * 0.59);
        door.rotation.y = Math.atan2(dx, dz);
        this.add(door);
        const lampMat = this.own(this.mat.lamp.clone());
        const lm = new THREE.Mesh(this.geo.unit, lampMat);
        lm.scale.set(Math.abs(dz) * 0.8 + 0.12, 0.12, Math.abs(dx) * 0.8 + 0.12);
        lm.position.set(sp.x - dx * 0.52, dh + 0.2, sp.z - dz * 0.52);
        this.add(lm);
        lamp = { mat: lampMat };
      } else if (sp.kind === 'ledge') {
        // ladder rails poking over the edge
        for (const o of [-0.35, 0.35]) {
          this.deco(sp.x - dx * 0.9 - dz * o, -0.2, sp.z - dz * 0.9 + dx * o, 0.08, 1.6, 0.08, this.mat.metal, true);
        }
      }
      return { ...sp, dirX: dx, dirZ: dz, climb: sp.kind === 'ledge' || sp.kind === 'stairs', ring, mat, heat: 0, lamp };
    });
  }

  // ------------------------------------------------------------- queries

  rebuildNav() {
    this.nav.build(this.solids, 0.5);
  }

  /** Segment against one solid (box or polygon footprint). */
  segSolid(x0, z0, x1, z1, s, out) {
    if (!s.poly) return segAABB(x0, z0, x1, z1, s, out);
    // cheap reject on the bounding box first
    if (Math.max(x0, x1) < s.minX || Math.min(x0, x1) > s.maxX || Math.max(z0, z1) < s.minZ || Math.min(z0, z1) > s.maxZ) return false;
    return segPoly(x0, z0, x1, z1, s.poly, out);
  }

  /** A loud event at (x, z): resting flocks within r take off. Logic: it can break an enemy's aim. */
  noise(x, z, r) {
    for (const f of this.flocks) if (f.away <= 0 && Math.hypot(f.x - x, f.z - z) < r) this.startle(f, x, z);
  }

  /** The wave is cleared: fixtures that hold for a wave (shutters) let go. */
  waveEnd() {
    for (const f of this.fixtures) if (f.waveEnd) f.waveEnd();
  }

  /** An enemy walking into a closed door pushes it open (fixtures.js). */
  openDoorsFor(e) {
    for (const f of this.fixtures) {
      if (f.kind !== 'door' || f.open) continue;
      if (Math.hypot(f.x - e.x, f.z - e.z) < f.w / 2 + e.radius + 0.25) f.push();
    }
  }

  /** In the dark pool of a lamp shot out (fixtures.js): nobody aims from there. */
  darkAt(x, z) {
    for (const f of this.fixtures) if (f.darkAt(x, z)) return true;
    return false;
  }

  /** Over water (the docks' harbour, the Senado fountain's pool). */
  waterAt(x, z) {
    for (const w of this.water) {
      if (w.r !== undefined) {
        if (Math.hypot(x - w.x, z - w.z) < w.r) return true;
      } else if (Math.abs(x - w.x) < w.w / 2 && Math.abs(z - w.z) < w.d / 2) return true;
    }
    return false;
  }

  /** A prop slid, thrown or kicked into water: it sinks. */
  sink(p) {
    p.alive = false;
    p.mesh.visible = false;
    if (p.marker) p.marker.visible = false;
    if (p.cloud) p.cloud.visible = false;
    const g = this.game;
    g.fx.smokePuff(p.x, 0.1, p.z, 6, 0.5, 0.75, 1.2);
    g.audio.toss();
    g.notes.log('掉進水裡');
  }

  /** In the cloud of a burst extinguisher: nobody aims from there either. */
  smokeAt(x, z) {
    for (const t of this.tools) if (t.smokeAt && t.smokeAt(x, z)) return true;
    return false;
  }

  /** Height of the ground (the Senado fountain sits in a sunken ring). */
  groundY(x, z) {
    return this.groundFn ? this.groundFn(x, z) : 0;
  }

  /** Nearest static hit along a segment; `edges` false lets it through an invisible map edge (shots, lasers). */
  raycast(x0, z0, x1, z1, ignoreGlass = false, over = 0, edges = true, pass = null) {
    let best = null;
    let bt = Infinity;
    for (const s of this.solids) {
      if (!s.alive || s.h <= over || s === pass) continue; // `over`: from that high up, lower cover is no obstacle; `pass`: a solid this ray flies over (a boss's: boss.js)
      if (!edges && s.edge) continue;
      if (ignoreGlass && s.kind === 'glass') continue;
      if (this.segSolid(x0, z0, x1, z1, s, _hit) && _hit.t < bt) {
        bt = _hit.t;
        best = { t: _hit.t, nx: _hit.nx, nz: _hit.nz, solid: s };
      }
    }
    return best;
  }

  hasLOS(x0, z0, x1, z1, over = 0) {
    for (const s of this.solids) {
      if (!s.alive || s.kind === 'glass' || s.h <= over) continue;
      if (this.segSolid(x0, z0, x1, z1, s, _hit)) return false;
    }
    return true;
  }

  /** Distance a ray (a laser) travels before hitting something solid (glass included; not an invisible map edge, as shots fly on). */
  rayLength(x0, z0, dx, dz, max) {
    const hit = this.raycast(x0, z0, x0 + dx * max, z0 + dz * max, false, 0, false);
    return hit ? hit.t * max : max;
  }

  /** Push a circle out of the solids; `over`: a thing this high up passes over lower cover (a thrown barrel clears a curb). */
  collideCircle(p, r, over = 0) {
    let hit = false;
    for (const s of this.solids) {
      if (!s.alive || s.h <= over) continue;
      if (p.x + r < s.minX || p.x - r > s.maxX || p.z + r < s.minZ || p.z - r > s.maxZ) continue;
      if (s.poly ? resolveCirclePoly(p, r, s.poly) : resolveCircleAABB(p, r, s)) hit = true;
    }
    return hit;
  }

  /** Props hit by a segment: returns {t, prop} or null. */
  raycastProps(x0, z0, x1, z1, ignore, skip) {
    let best = null;
    let bt = Infinity;
    for (const p of this.props) {
      if (!p.alive || p.carried || p === ignore || (skip && skip.length && skip.includes(p))) continue;
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
    this.noise(s.x, s.z, 8);
    this.game.score.style('GLASS', 10, false);
    this.nav.buildRect(this.solids, 0.5, s.minX - 1, s.minZ - 1, s.maxX + 1, s.maxZ + 1);
  }

  /** A crate takes its last bullet: it bursts into planks and stops being cover. */
  breakCrate(s, dx, dz) {
    if (!s.alive) return;
    s.alive = false;
    (s.model || s.mesh).visible = false;
    const fx = this.game.fx;
    for (let i = 0; i < 12; i++) {
      fx.debris(s.x + rand(-s.w, s.w) / 2, rand(0.2, s.h), s.z + rand(-s.d, s.d) / 2, dx + rand(-0.7, 0.7), dz + rand(-0.7, 0.7), 3, [0.42, 0.29, 0.17], 0.16);
    }
    this.game.audio.impact(this.game.panFor(s.x));
    this.game.shake(0.15);
    this.game.notes.log('木箱碎裂');
    this.noise(s.x, s.z, 6);
    this.nav.buildRect(this.solids, 0.5, s.minX - 1, s.minZ - 1, s.maxX + 1, s.maxZ + 1);
  }

  // ------------------------------------------------------------- pigeons (logic)

  /** Resting flocks take off when the player runs through, an enemy walks in, or a player bullet passes close. */
  updateFlocks(dt) {
    const g = this.game;
    const p = g.player;
    for (const f of this.flocks) {
      if (f.away > 0) {
        f.away = Math.max(0, f.away - dt);
        continue;
      }
      let from = null;
      if (p.alive && Math.hypot(p.vx, p.vz) > 1 && Math.hypot(p.x - f.x, p.z - f.z) < 2.4) from = p;
      for (const e of g.enemies.list) if (!from && e.alive && Math.hypot(e.x - f.x, e.z - f.z) < 1.5) from = e;
      for (const b of g.bullets.list) if (!from && b.alive && b.owner === 'player' && Math.hypot(b.x - f.x, b.z - f.z) < ENV.flockScare) from = b;
      if (from) this.startle(f, from.x, from.z);
    }
  }

  /** A flock bursts into the air from (x, z): any enemy aiming within ENV.flockReach loses his aim. */
  startle(f, x, z) {
    const g = this.game;
    f.away = g.rng.range(ENV.flockAway[0], ENV.flockAway[1]);
    f.gen++;
    f.fromX = x;
    f.fromZ = z;
    let n = 0;
    for (const e of g.enemies.list) {
      if (!e.alive || Math.hypot(e.x - f.x, e.z - f.z) > ENV.flockReach) continue;
      if (e.state === 'aim' || e.state === 'fire') {
        e.blind(ENV.flockBlind);
        n++;
      }
    }
    g.notes.log(n ? `白鴿驚起，打斷 ${n} 個敵人的瞄準` : '白鴿驚起');
  }

  resetProps() {
    for (const p of this.props) p.reset();
    for (const f of this.flocks) f.reset();
    for (const s of this.crates) {
      s.alive = true;
      s.hp = ENV.crateHits;
      (s.model || s.mesh).visible = true;
    }
    for (const s of this.glass) {
      s.alive = true;
      s.mesh.visible = true;
    }
    for (const sp of this.spawns) sp.heat = 0;
    for (const pad of this.pads) pad.pickup = null;
    this.rebuildNav();
  }

  // -------------------------------------------------------------- update

  updateProps(dt) {
    this.time += dt;
    this.updateFlocks(dt);
    const props = this.props;
    for (const p of props) {
      if (!p.alive || p.carried || p.fixed) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      // nothing slows a thing that is in the air
      const fr = (p.y || 0) > 0.1 ? 1 : Math.exp(-(p.kind === 'pan' ? 2.2 : 3.2) * dt);
      p.vx *= fr;
      p.vz *= fr;
      const ox = p.x;
      const oz = p.z;
      if (this.collideCircle(p, p.r, (p.y || 0) > 0.1 ? p.y : 0)) {
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
      if (!a.alive || a.carried || a.fixed) continue;
      for (let j = i + 1; j < props.length; j++) {
        const b = props[j];
        if (!b.alive || b.carried || b.fixed) continue;
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
    for (const t of this.tools) if (t.alive) t.update(dt);
    // whatever lies or lands in water sinks (nothing carried, nothing still in the air)
    if (this.water.length) for (const p of props) if (p.alive && !p.carried && !p.fixed && (p.y || 0) <= 0.06 && this.waterAt(p.x, p.z)) this.sink(p);
    for (const f of this.fixtures) f.update(dt);
  }

  updateAmbient(realDt, worldDt, cx, cz) {
    this.rain.update(worldDt, cx, cz);
    if (this.shadowFollow) {
      // snap to whole metres so the shadow texels do not crawl as the camera moves
      const sx = Math.round(cx);
      const sz = Math.round(cz);
      this.moon.target.position.set(sx, 0, sz);
      this.moon.position.set(sx + this.sunOffset.x, this.sunOffset.y, sz + this.sunOffset.z);
    }
    // a beat clock that follows the (time-stretched) music
    this.beat += (realDt * this.game.audio.musicRate * 124) / 60;
    for (const fn of this.animators) fn(realDt, worldDt);
    for (const a of this.ambient) a.update(worldDt);
    for (const sp of this.spawns) {
      sp.heat = Math.max(0, sp.heat - realDt * 0.8);
      const pulse = sp.heat > 0 ? 0.6 + 0.4 * Math.sin(performance.now() * 0.02) : 0;
      sp.mat.color.setRGB(3 * sp.heat * pulse, 0.25 * sp.heat * pulse, 0.4 * sp.heat * pulse);
      sp.ring.visible = sp.heat > 0.01;
      if (sp.lamp) sp.lamp.mat.emissiveIntensity = 0.6 + sp.heat * pulse * 5;
    }
  }
}
