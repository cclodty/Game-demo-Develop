// Picking things up and throwing them (G): a pan or barrel from the floor is
// carried over the head and thrown at the cursor; an emptied special weapon
// is thrown straight from the hand. Thrown things fly a low arc, stun the
// enemy they hit (a barrel explodes), and a pan in the air scatters any
// player bullet that hits it (see Bullets.scatter). Collision stays 2D like
// everything else; height only decides when a thing lands.

import { buildWeaponModel } from './characters.js';
import { PLAYER } from './config.js';
import { clamp, rand, segCircle } from './utils.js';
import { PLAYER_WEAPONS } from './weapons.js';

const GRAVITY = 22;
const CARRY_Y = 2.15;

/** Launch so that something released at height y0 lands at `dist` after about T seconds. */
function launch(obj, x, z, y0, dx, dz, dist, T) {
  obj.x = x;
  obj.z = z;
  obj.y = y0;
  obj.vx = (dx * dist) / T;
  obj.vz = (dz * dist) / T;
  obj.vy = (GRAVITY * T) / 2 - y0 / T;
}

export class Thrown {
  constructor(game) {
    this.game = game;
    this.carry = null; // a level prop (pan or barrel) held over the head
    this.list = []; // thrown weapons in flight
    this.prompt = ''; // HUD hint (HTML, controls as {name}: input.js withLabels), '' for none
  }

  clear() {
    if (this.carry) {
      this.carry.carried = false;
      if (this.carry.kind === 'pan') this.carry.marker.visible = true;
      this.carry = null;
    }
    for (const o of this.list) this.game.scene.remove(o.mesh);
    this.list.length = 0;
    this.prompt = '';
  }

  static propName(prop) {
    if (prop.kind === 'pan') return prop.variant === 'tray' ? '托盤' : '平底鑊';
    return prop.variant === 'gas' ? '氣罐' : prop.variant === 'lpg' ? '石油氣樽' : '油桶';
  }

  /** The nearest pan or barrel within reach of the player that is on the floor, if any. */
  nearProp() {
    const p = this.game.player;
    let best = null;
    let bd = PLAYER.throwReach;
    for (const q of this.game.level.props) {
      if (!q.alive || q.carried || (q.y || 0) > 0.6) continue;
      if (q.kind === 'barrel' && q.fuse >= 0) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z) - q.r;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  /** G: throw what is carried, else pick up what is near, else throw an emptied weapon. */
  action() {
    const g = this.game;
    const p = g.player;
    if (this.carry) return this.throwCarried();
    const prop = this.nearProp();
    if (prop) return this.pickUp(prop);
    if (p.special && p.special.empty) return this.throwGun();
    g.audio.denied();
    return false;
  }

  pickUp(prop) {
    const g = this.game;
    prop.carried = true;
    prop.thrown = false;
    prop.vx = prop.vz = prop.vy = 0;
    if (prop.kind === 'pan') prop.marker.visible = false;
    this.carry = prop;
    g.audio.pickup();
    const name = Thrown.propName(prop);
    g.notes.log(`拿起${name}`);
    g.hud.toast(`${name} <small>G / 左鍵 擲出</small>`);
    return true;
  }

  aimDir() {
    const g = this.game;
    const p = g.player;
    let dx = g.cmd.aim.x - p.x;
    let dz = g.cmd.aim.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    return { dx: dx / d, dz: dz / d, d };
  }

  throwCarried() {
    const g = this.game;
    const p = g.player;
    const prop = this.carry;
    this.carry = null;
    const { dx, dz, d } = this.aimDir();
    const dist = clamp(d, 2, PLAYER.throwRange);
    prop.carried = false;
    prop.thrown = true;
    launch(prop, p.x + dx * 0.6, p.z + dz * 0.6, CARRY_Y - 0.3, dx, dz, dist, 0.5 + dist * 0.035);
    if (prop.kind === 'pan') {
      prop.spin = 14;
      prop.marker.visible = true;
    }
    g.audio.toss();
    g.notes.log(`擲出${Thrown.propName(prop)}`);
    return true;
  }

  /** Throw the emptied special weapon from the hand; it stuns whoever it hits and is gone. */
  throwGun() {
    const g = this.game;
    const p = g.player;
    const sp = p.special;
    if (!sp) return false;
    p.special = null;
    if (p.slot === 'special') p.equip('pistols');
    const w = PLAYER_WEAPONS[sp.id];
    const mesh = buildWeaponModel(w.model, g.pickups.mats);
    mesh.scale.setScalar(1.1);
    g.style.dress(mesh);
    g.scene.add(mesh);
    const { dx, dz, d } = this.aimDir();
    const dist = clamp(d, 2, PLAYER.throwRange * 1.5);
    const o = { id: sp.id, name: w.name, mesh, t: 0 };
    launch(o, p.x + dx * 0.5, p.z + dz * 0.5, 1.5, dx, dz, dist, 0.4 + dist * 0.03);
    this.list.push(o);
    g.audio.toss();
    g.notes.log(`擲出空的${w.name}`);
    return true;
  }

  /** A thrown thing lands on an enemy: a short stun, some damage, and the enemy flies a little. */
  hitEnemy(e, o, dmg) {
    const g = this.game;
    const dx = e.x - o.x;
    const dz = e.z - o.z;
    const d = Math.hypot(dx, dz) || 1;
    e.kick(dx / d, dz / d, 8, 'throw', dmg);
    g.fx.sparks(e.x, 1.4, e.z, dx / d, dz / d, 8, [6, 5, 3], 7);
    g.audio.kick(true);
    g.hud.hitMarker(false);
    g.shake(0.2);
    g.notes.log(`擲中 ${e.cfg.label}`);
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const level = g.level;

    // carried: ride above the player's head
    const c = this.carry;
    if (c) {
      c.x = p.x;
      c.z = p.z;
      c.y = CARRY_Y + Math.sin(g.worldTime * 6) * 0.04;
      c.vx = c.vz = c.vy = 0;
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.y = p.facing;
    }

    // thrown props: hit enemies while in the air (their flight itself is the level's prop physics)
    for (const q of level.props) {
      if (!q.thrown || !q.alive || (q.y || 0) < 0.25) continue;
      if (q.kind === 'barrel' && g.boss.under(q.x, q.z)) {
        q.thrown = false;
        q.ignite(0.02); // thrown at the helicopter: it goes off right under it
        continue;
      }
      for (const e of g.enemies.list) {
        if (!e.alive || e.spawnLock > 0) continue;
        if (Math.hypot(e.x - q.x, e.z - q.z) > e.radius + q.r) continue;
        q.thrown = false;
        if (q.kind === 'barrel') {
          this.hitEnemy(e, q, 1);
          q.ignite(0.02);
        } else {
          this.hitEnemy(e, q, 2);
          q.vx *= -0.3;
          q.vz *= -0.3;
          q.vy = Math.max(q.vy, 3);
        }
        break;
      }
    }

    // thrown weapons: our own little flight
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.t += dt;
      const nx = o.x + o.vx * dt;
      const nz = o.z + o.vz * dt;
      o.vy -= GRAVITY * dt;
      o.y += o.vy * dt;
      let gone = false;
      const wall = level.raycast(o.x, o.z, nx, nz);
      if (wall && wall.solid.h >= o.y) {
        gone = true;
        g.fx.sparks(o.x, o.y, o.z, -o.vx, -o.vz, 5, [4, 4, 4], 5);
        g.audio.impact(g.panFor(o.x));
      } else {
        for (const e of g.enemies.list) {
          if (!e.alive || e.spawnLock > 0) continue;
          if (segCircle(o.x, o.z, nx, nz, e.x, e.z, e.radius + 0.2) >= 0) {
            this.hitEnemy(e, o, 3);
            gone = true;
            break;
          }
        }
      }
      o.x = nx;
      o.z = nz;
      if (!gone && o.y <= 0.05) {
        gone = true;
        g.audio.impact(g.panFor(o.x));
        g.fx.sparks(o.x, 0.1, o.z, rand(-1, 1), rand(-1, 1), 4, [4, 4, 4], 3);
      }
      o.mesh.position.set(o.x, o.y, o.z);
      o.mesh.rotation.y = Math.atan2(o.vx, o.vz);
      o.mesh.rotation.x += dt * 14;
      if (gone) {
        g.scene.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }

    // HUD hint
    if (!p.alive) this.prompt = '';
    else if (this.carry) this.prompt = '{throw} / {fire} 擲出';
    else {
      const near = this.nearProp();
      if (near) this.prompt = `{throw} 拿起${Thrown.propName(near)}`;
      else if (p.special && p.special.empty) this.prompt = `{throw} 擲出空的${PLAYER_WEAPONS[p.special.id].name}`;
      else this.prompt = '';
    }
  }
}
