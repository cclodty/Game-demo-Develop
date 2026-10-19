// Player weapons and the grenade projectile.

import * as THREE from 'three';
import { GUN_Y, PLAYER } from './config.js';
import { weaponTemplate } from './models.js';
import { clamp, lerp, rand, segCircle } from './utils.js';

/**
 * Pistols are the default and never run dry (they reload). Everything else
 * is a pickup with a fixed ammo pool and no reload; when it empties you fall
 * back to pistols.
 */
export const PLAYER_WEAPONS = {
  pistols: {
    id: 'pistols',
    name: '雙槍',
    en: 'DUAL PISTOLS',
    model: 'dualPistol',
    dual: true,
    interval: 0.11,
    speed: 62,
    damage: 1,
    spread: 0.012,
    mag: 30,
    reload: 1.05,
    sound: 'player',
    shake: 0.05,
    flash: 16,
  },
  smg: {
    id: 'smg',
    name: '雙衝鋒槍',
    en: 'DUAL SMG',
    model: 'dualSmg',
    dual: true,
    interval: 0.06,
    speed: 58,
    damage: 1,
    spread: 0.06,
    ammo: 160,
    sound: 'smg',
    shake: 0.035,
    flash: 12,
  },
  shotgun: {
    id: 'shotgun',
    name: '散彈槍',
    en: 'SHOTGUN',
    model: 'shotgun',
    interval: 0.55,
    speed: 52,
    damage: 1,
    pellets: 8,
    spread: 0.2,
    range: 16,
    knock: 2.2,
    recoil: 3,
    ammo: 20,
    sound: 'pshotgun',
    shake: 0.32,
    flash: 34,
    look: 'pellet',
    casing: [0.9, 0.12, 0.1],
  },
  rifle: {
    id: 'rifle',
    name: '突擊步槍',
    en: 'ASSAULT RIFLE',
    model: 'rifle',
    interval: 0.085,
    speed: 78,
    damage: 1.5,
    spread: 0.016,
    ammo: 100,
    sound: 'prifle',
    shake: 0.06,
    flash: 18,
  },
  sniper: {
    id: 'sniper',
    name: '狙擊槍',
    en: 'SNIPER RIFLE',
    model: 'sniper',
    interval: 0.8,
    speed: 150,
    damage: 9,
    pierce: 5,
    spread: 0,
    recoil: 2.5,
    ammo: 12,
    sound: 'sniper',
    shake: 0.42,
    flash: 44,
    look: 'sniper',
    trail: 7,
    scope: true,
  },
  launcher: {
    id: 'launcher',
    name: '榴彈發射器',
    en: 'GRENADE LAUNCHER',
    model: 'launcher',
    interval: 0.75,
    grenade: true,
    speed: 22,
    recoil: 1.5,
    ammo: 8,
    sound: 'launcher',
    shake: 0.18,
    flash: 22,
  },
  minigun: {
    id: 'minigun',
    name: '機槍',
    en: 'MINIGUN',
    model: 'minigun',
    interval: 0.045,
    speed: 64,
    damage: 1,
    spread: 0.075,
    ammo: 240,
    sound: 'pminigun',
    shake: 0.035,
    flash: 12,
    moveMul: 0.72,
  },
};

/** Weapons that appear on the map's weapon pads at the start of each wave. */
export const PAD_POOL = ['smg', 'shotgun', 'rifle', 'sniper', 'launcher'];

/** What each enemy type may drop on death: [weapon, chance]. */
export const DROPS = {
  grunt: [['smg', 0.12]],
  shotgun: [['shotgun', 0.5]],
  rifle: [['rifle', 0.5]],
  brute: [['minigun', 1]],
  rusher: [],
};

const _hit = { t: 0, nx: 0, nz: 0 };

export class Grenades {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geo = new THREE.SphereGeometry(0.15, 10, 8);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x2c3328, roughness: 0.5, metalness: 0.4 });
    this.blinkGeo = new THREE.SphereGeometry(0.06, 6, 4);
    this.blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.6, 0.3) });
    this.ringGeo = new Map(); // blast radius -> the ring marking where an enemy grenade comes down
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.25, 0.2), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    // an enemy grenade's shadow on the floor while it flies: where a bullet meets it
    this.shadowGeo = new THREE.CircleGeometry(0.34, 20).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
  }

  /** The player's launcher: a grenade from (x, z) towards (tx, tz) at `speed`, bursting on what it meets. */
  spawn(x, z, tx, tz, speed) {
    let dx = tx - x;
    let dz = tz - z;
    const d = Math.hypot(dx, dz) || 1;
    const dist = clamp(d, 3, 18);
    dx /= d;
    dz /= d;
    const { mesh, spin, blink } = this.build(dx, dz);
    this.list.push({ owner: 'player', x, z, sx: x, sz: z, tx: x + dx * dist, tz: z + dz * dist, dist, t: 0, T: dist / speed, apex: 1.2 + dist * 0.12, y: GUN_Y, mesh, spin, blink, smoke: 0, r: 3.9, opts: { selfMul: 0.4, kind: 'grenade' } });
  }

  /**
   * An enemy's grenade (enemies.js TYPES lob), from (x, z) onto (tx, tz) over any cover. A ring marks
   * where it comes down; on the ground it waits lob.fuse s, when a kick (kick) can send it back; a
   * player's bullet sets it off in the air (airburst).
   */
  lob(x, z, tx, tz, lob, source) {
    const { mesh, spin, blink } = this.build(tx - x, tz - z);
    if (!this.ringGeo.has(lob.radius)) this.ringGeo.set(lob.radius, new THREE.RingGeometry(lob.radius - 0.09, lob.radius, 48).rotateX(-Math.PI / 2));
    const ring = new THREE.Mesh(this.ringGeo.get(lob.radius), this.ringMat);
    ring.position.set(tx, 0.04, tz);
    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    shadow.position.set(x, 0.035, z);
    this.game.scene.add(ring, shadow);
    const dist = Math.hypot(tx - x, tz - z);
    this.list.push({ owner: 'enemy', x, z, sx: x, sz: z, tx, tz, dist, t: 0, T: lob.flight, apex: lob.apex, y: GUN_Y, mesh, spin, blink, smoke: 0, r: lob.radius, ring, shadow, lob, source, landed: false, fuse: -1, opts: { source: `${source.cfg.label} 的榴彈`, kind: 'grenade' } });
  }

  /** A grenade's look: the 40 mm round if there is a model, else a ball, with a blinking light. */
  build(dx, dz) {
    const mesh = new THREE.Group();
    // the real 40 mm round, if there is one, at 2.5× so it reads from the game camera
    const tpl = weaponTemplate('weapon_grenade');
    let spin = mesh;
    if (tpl) {
      spin = tpl.scene.clone();
      spin.scale.setScalar(2.5);
      mesh.rotation.y = Math.atan2(dx, dz);
      mesh.add(spin);
    } else {
      mesh.add(new THREE.Mesh(this.geo, this.mat));
    }
    const blink = new THREE.Mesh(this.blinkGeo, this.blinkMat);
    blink.position.y = 0.13;
    mesh.add(blink);
    mesh.castShadow = true;
    this.game.style.dress(mesh);
    this.game.scene.add(mesh);
    return { mesh, spin, blink };
  }

  remove(i) {
    const g = this.list[i];
    this.game.scene.remove(g.mesh);
    if (g.ring) this.game.scene.remove(g.ring);
    if (g.shadow) this.game.scene.remove(g.shadow);
    this.list.splice(i, 1);
  }

  /** A player's bullet met an enemy grenade in the air: it goes off there (AIRBURST). */
  airburst(g) {
    const game = this.game;
    this.remove(this.list.indexOf(g));
    game.notes.log('空中射爆榴彈（AIRBURST）');
    game.score.style('AIRBURST', g.lob.airburst);
    game.explode(g.x, g.z, g.r, { source: '空中爆炸的榴彈', kind: 'grenade' });
  }

  /**
   * The player kicks: an enemy grenade on the ground in the kick's cone (`inCone(x, z, reach)` from
   * player.js gives the direction) flies lob.kickDistance m that way and bursts on what it meets.
   */
  /** A kick (or the pan's swing, `air` true: in the air as well) sends an enemy grenade in the arc back the way it is pointed. */
  kick(inCone, air = false) {
    let kicked = false;
    for (const g of this.list) {
      if (g.owner !== 'enemy' || (!g.landed && !air)) continue;
      const dir = inCone(g.x, g.z, PLAYER.kickRange + 0.3);
      if (!dir) continue;
      this.game.scene.remove(g.ring);
      Object.assign(g, { owner: 'kicked', ring: null, landed: false, sx: g.x, sz: g.z, tx: g.x + dir.x * g.lob.kickDistance, tz: g.z + dir.z * g.lob.kickDistance, dist: g.lob.kickDistance, t: 0, T: g.lob.kickFlight, apex: 1, opts: { source: '踢回的榴彈', kind: 'grenade' } });
      this.game.notes.log('踢回榴彈');
      kicked = true;
    }
    return kicked;
  }

  clear() {
    while (this.list.length) this.remove(0);
  }

  update(dt) {
    const game = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      if (g.landed) {
        // an enemy grenade on the ground: its fuse, the ring pulsing faster as it runs out
        g.fuse -= dt;
        g.blink.visible = Math.floor(g.fuse * 24) % 2 === 0;
        g.ring.scale.setScalar(1 + 0.04 * Math.sin(g.fuse * 40));
        if (g.fuse <= 0) {
          this.remove(i);
          game.explode(g.x, g.z, g.r, g.opts);
        }
        continue;
      }
      g.t += dt;
      const k = Math.min(1, g.t / g.T);
      const nx = lerp(g.sx, g.tx, k);
      const nz = lerp(g.sz, g.tz, k);
      const ny = lerp(GUN_Y, 0.25, k) + Math.sin(k * Math.PI) * g.apex;
      g.smoke -= dt;
      if (g.smoke <= 0) {
        g.smoke = 0.03;
        game.fx.smoke.spawn({ x: nx, y: ny, z: nz, vy: 0.3, life: rand(0.4, 0.7), size: 0.18, r: 0.35, g: 0.35, b: 0.38, drag: 2, grow: 1.2 });
      }
      if (g.owner === 'enemy') {
        // lobbed over everything; it comes down where the ring is and waits
        g.x = nx;
        g.z = nz;
        g.y = ny;
        g.mesh.position.set(nx, ny, nz);
        g.shadow.position.set(nx, 0.035, nz);
        g.spin.rotation.x += dt * 9;
        if (k >= 1) {
          g.landed = true;
          g.fuse = g.lob.fuse;
          g.mesh.position.y = 0.15;
          this.game.scene.remove(g.shadow);
          g.shadow = null;
          game.audio.fuse(game.panFor(nx));
        }
        continue;
      }
      let boom = k >= 1;
      let bx = nx;
      let bz = nz;
      // walls taller than the grenade's current height stop it
      for (const s of game.level.solids) {
        if (!s.alive || s.h < ny - 0.1) continue;
        if (game.level.segSolid(g.x, g.z, nx, nz, s, _hit)) {
          boom = true;
          bx = g.x + (nx - g.x) * _hit.t + _hit.nx * 0.2;
          bz = g.z + (nz - g.z) * _hit.t + _hit.nz * 0.2;
          break;
        }
      }
      if (!boom && ny < 2.4) {
        for (const e of game.enemies.list) {
          if (!e.alive || e.spawnLock > 0) continue;
          const t = segCircle(g.x, g.z, nx, nz, e.x, e.z, e.radius + 0.1);
          if (t >= 0) {
            boom = true;
            bx = g.x + (nx - g.x) * t;
            bz = g.z + (nz - g.z) * t;
            break;
          }
        }
      }
      g.x = nx;
      g.z = nz;
      g.y = ny;
      g.mesh.position.set(nx, ny, nz);
      g.spin.rotation.x += dt * 12;
      g.blink.visible = Math.floor(g.t * 14) % 2 === 0;
      if (boom) {
        this.remove(i);
        game.explode(bx, bz, g.r, g.opts);
      }
    }
  }
}
