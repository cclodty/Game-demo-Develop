// Player weapons and the grenade projectile.

import * as THREE from 'three';
import { GUN_Y } from './config.js';
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
  }

  spawn(x, z, tx, tz, speed) {
    let dx = tx - x;
    let dz = tz - z;
    const d = Math.hypot(dx, dz) || 1;
    const dist = clamp(d, 3, 18);
    dx /= d;
    dz /= d;
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(this.geo, this.mat));
    const blink = new THREE.Mesh(this.blinkGeo, this.blinkMat);
    blink.position.y = 0.13;
    mesh.add(blink);
    mesh.castShadow = true;
    this.game.scene.add(mesh);
    this.list.push({ x, z, sx: x, sz: z, tx: x + dx * dist, tz: z + dz * dist, dist, t: 0, T: dist / speed, y: GUN_Y, mesh, blink, smoke: 0 });
  }

  clear() {
    for (const g of this.list) this.game.scene.remove(g.mesh);
    this.list.length = 0;
  }

  update(dt) {
    const game = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.t += dt;
      const k = Math.min(1, g.t / g.T);
      const nx = lerp(g.sx, g.tx, k);
      const nz = lerp(g.sz, g.tz, k);
      const ny = lerp(GUN_Y, 0.25, k) + Math.sin(k * Math.PI) * (1.2 + g.dist * 0.12);
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
      g.mesh.rotation.x += dt * 12;
      g.blink.visible = Math.floor(g.t * 14) % 2 === 0;
      g.smoke -= dt;
      if (g.smoke <= 0) {
        g.smoke = 0.03;
        game.fx.smoke.spawn({ x: nx, y: ny, z: nz, vy: 0.3, life: rand(0.4, 0.7), size: 0.18, r: 0.35, g: 0.35, b: 0.38, drag: 2, grow: 1.2 });
      }
      if (boom) {
        game.scene.remove(g.mesh);
        this.list.splice(i, 1);
        game.explode(bx, bz, 3.9, { selfMul: 0.4 });
      }
    }
  }
}
