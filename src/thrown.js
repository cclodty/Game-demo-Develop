// Picking things up and throwing them (G): a pan or barrel from the floor is
// carried over the head and thrown at the cursor; an emptied special weapon
// is thrown straight from the hand. Thrown things fly a low arc, stun the
// enemy they hit (a barrel explodes), and a pan in the air scatters any
// player bullet that hits it (see Bullets.scatter). Collision stays 2D like
// everything else; height only decides when a thing lands.

import { buildWeaponModel, HOLDS, holdBoth, holdInHand } from './characters.js';
import { ENV, PAN, PLAYER, UMBRELLA } from './config.js';
import { withLabels } from './input.js';
import { clamp, rand, segCircle } from './utils.js';
import { PLAYER_WEAPONS } from './weapons.js';

const GRAVITY = 22;
const CARRY_Y = 2.15;
/**
 * How a carried thing is shown (look only: a throw still starts from CARRY_Y): its height, just over
 * the head (the comic proportions' head tops out at 1.75 m and their arms reach about 1.85 m), and
 * where the hands go, `half` to each side at `hand` above the ground and `ahead` of the middle, in
 * the carrier's space (for a barrel `half` is a share of its radius). A barrel on the head, by its
 * base: the hands a little behind its middle, as the overhead stance leans the body back and a worn
 * arm (0.53 m) would fall short of one further ahead. (A pan or umbrella goes into the hand and an
 * extinguisher into the arms instead: characters.js HOLDS.)
 */
const CARRY_SHOWN = {
  barrel: { y: 1.77, hand: 1.8, half: 0.8, ahead: -0.08 },
};

/** Where the carrier's hands go on `prop` ({ half, y, z } in its space), for player.js syncRig. */
export function carryHands(prop) {
  const s = CARRY_SHOWN[prop.kind];
  if (!s) return null;
  // a big gas cylinder is held nearer its middle: the arms reach no wider
  return { half: prop.kind === 'barrel' ? Math.min(prop.r * s.half, 0.38) : s.half, y: s.hand, z: s.ahead };
}

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
    this.carry = null; // a level prop held: a barrel over the head, a pan in the right hand (inHand), an extinguisher hugged (hugged)
    this.inHand = false; // the carried thing is a pan or an umbrella in the right hand: the left gun fires, F swings or opens it
    this.hugged = false; // the carried thing is held before the body in both hands (characters.js HOLDS): F sprays it
    this.list = []; // thrown weapons in flight
    this.prompt = ''; // HUD hint (HTML, controls as {name}: input.js withLabels), '' for none
  }

  clear() {
    if (this.carry) {
      this.release(this.carry);
      this.carry = null;
    }
    for (const o of this.list) this.game.scene.remove(o.mesh);
    this.list.length = 0;
    this.prompt = '';
  }

  static propName(prop) {
    if (prop.kind === 'pan') return prop.variant === 'tray' ? '托盤' : '平底鑊';
    if (prop.kind === 'extinguisher') return '滅火筒';
    if (prop.kind === 'umbrella') return '雨傘';
    if (prop.kind === 'net') return '漁網';
    if (prop.kind === 'trolley') return '手推車';
    return prop.variant === 'gas' ? '氣罐' : prop.variant === 'lpg' ? '石油氣樽' : '油桶';
  }

  /** The nearest pan or barrel within reach of the player that is on the floor, if any. */
  nearProp() {
    const p = this.game.player;
    let best = null;
    let bd = PLAYER.throwReach;
    for (const q of this.game.level.props) {
      if (!q.alive || q.carried || q.fixed || q.broken || q.pick === false || (q.y || 0) > 0.6) continue; // a trolley is kicked, not carried
      if (q.kind === 'barrel' && (q.fuse >= 0 || q.rocketT > 0)) continue;
      if (q.kind === 'extinguisher' && q.smokeT > 0) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z) - q.r;
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  /** G: throw what is carried, else pick up what is near, else throw an emptied weapon. */
  /** The pick-up key (E, the same as a pad's swap): take what lies at the feet; carrying something already, nothing. */
  pickAction() {
    if (this.carry) return false;
    const prop = this.nearProp();
    return prop ? this.pickUp(prop) : false;
  }

  /** The throw key (G): throw what is carried, else an emptied special weapon. */
  throwAction() {
    const g = this.game;
    const p = g.player;
    if (this.carry) return this.throwCarried();
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
    const hold = HOLDS[prop.kind];
    const p = g.player;
    if (hold) {
      // its own shape as made (no tumble or lie left on it), held as the data says (characters.js HOLDS; player.js syncRig keeps it)
      prop.tilt.rotation.set(0, 0, 0);
      prop.tilt.position.set(0, 0, 0);
    }
    if (hold && hold.hand === 'R') {
      // into the right hand: the pistol there is put away, the left one keeps firing, F swings the pan or opens the umbrella
      if (p.slot !== 'pistols') p.equip('pistols');
      this.inHand = true;
      this.showRightGun(false);
      p.rig.armR.add(prop.mesh);
      holdInHand(p.rig, prop.mesh, hold, 0);
      prop.y = PAN.handY;
      g.hud.toast(withLabels(`${name} <small>${prop.kind === 'pan' ? '{kick} 鑊擊 · ' : prop.kind === 'umbrella' ? '按住 {kick} 開傘 · ' : ''}{throw} 擲出</small>`, g.padOn));
    } else if (hold && hold.hand === 'both') {
      // hugged before the body: both hands on it, the guns put away
      this.hugged = true;
      p.rig.inner.add(prop.mesh);
      holdBoth(p.rig, prop.mesh, hold);
      prop.y = hold.at[1];
      g.hud.toast(withLabels(`${name} <small>{kick} 噴霧 · {throw} / {fire} 擲出</small>`, g.padOn));
    } else g.hud.toast(withLabels(`${name} <small>{throw} / {fire} 擲出</small>`, g.padOn));
    return true;
  }

  /**
   * F with the extinguisher hugged: it sprays where the player aims and is spent, its cloud
   * ENV.sprayAhead m ahead (Extinguisher.burst: nobody in it can aim) with the player at its edge.
   */
  spray() {
    const g = this.game;
    const p = g.player;
    const prop = this.carry;
    this.carry = null;
    this.release(prop);
    const { dx, dz } = this.aimDir();
    prop.x = p.x + dx * ENV.sprayAhead;
    prop.z = p.z + dz * ENV.sprayAhead;
    prop.y = 0;
    prop.vx = prop.vz = prop.vy = 0;
    prop.mesh.position.set(prop.x, 0, prop.z);
    g.notes.log('滅火筒噴霧');
    prop.burst();
    return true;
  }

  /** The pistol in the right hand shows when the hand is free (and there is one: not under 無槍). */
  showRightGun(on) {
    const p = this.game.player;
    for (const m of p.rig.weaponParts) if (m.parent === p.rig.armR) m.visible = on && !p.unarmed;
  }

  /** Let go of a carried thing: one in the hand or hugged goes back into the level at the player's spot. */
  release(prop) {
    if (this.hugged) {
      this.game.level.root.attach(prop.mesh);
      prop.mesh.rotation.set(0, 0, 0);
      prop.mesh.position.set(prop.x, prop.y, prop.z);
      this.hugged = false;
    }
    if (this.inHand) {
      const g = this.game;
      g.level.root.attach(prop.mesh);
      prop.mesh.rotation.set(0, prop.angle || 0, 0);
      prop.mesh.position.set(prop.x, prop.y, prop.z);
      if (prop.kind === 'umbrella') {
        prop.open(0);
        prop.tilt.rotation.set(Math.PI / 2, 0, 0.3);
        prop.tilt.position.y = 0.05;
      }
      this.inHand = false;
      this.showRightGun(true);
    }
    prop.carried = false;
    if (prop.kind === 'pan') prop.marker.visible = true;
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
    const from = this.inHand ? PAN.handY : this.hugged ? HOLDS[prop.kind].at[1] : CARRY_Y - 0.3;
    this.release(prop);
    prop.thrown = true;
    p.throwT = HOLDS.throw.time; // the arm over the top (player.js syncRig)
    launch(prop, p.x + dx * 0.6, p.z + dz * 0.6, from, dx, dz, dist, 0.5 + dist * 0.035);
    if (prop.kind === 'pan') prop.spin = 14; // a net flies flat and falls open where it lands (level.js Net)
    if (prop.kind === 'umbrella') {
      // a dart: point first, flat
      prop.spin = 0;
      prop.tilt.rotation.set(Math.PI / 2, 0, 0);
      prop.tilt.position.y = 0;
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
    p.throwT = HOLDS.throw.time; // the arm over the top (player.js syncRig)
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

    // carried: a barrel rides above the player's head; a pan in the hand follows the arm (it is the arm's child)
    const c = this.carry;
    if (c) {
      c.x = p.x;
      c.z = p.z;
      c.vx = c.vz = c.vy = 0;
      if (this.inHand) c.y = PAN.handY;
      else if (this.hugged) c.y = HOLDS[c.kind].at[1]; // on the rig (player.js syncRig places it)
      else {
        c.y = CARRY_Y + Math.sin(g.worldTime * 6) * 0.04;
        c.mesh.position.set(c.x, c.y - CARRY_Y + (CARRY_SHOWN[c.kind]?.y ?? CARRY_Y), c.z);
        c.mesh.rotation.y = p.facing;
      }
    }

    // thrown props: hit enemies while in the air (their flight itself is the level's prop physics)
    for (const q of level.props) {
      if (!q.thrown || !q.alive || (q.y || 0) < 0.25) continue;
      if (q.kind === 'net') {
        // a net that meets anyone in the air falls open there
        if (g.enemies.list.some((e) => e.alive && e.spawnLock <= 0 && Math.hypot(e.x - q.x, e.z - q.z) < e.radius + q.r)) q.cast();
        continue;
      }
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
          this.hitEnemy(e, q, q.kind === 'umbrella' ? UMBRELLA.dartDamage : 2);
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
    else if (this.carry) {
      const k = this.carry.kind;
      this.prompt = this.inHand ? (k === 'pan' ? '{kick} 鑊擊 · {throw} 擲出' : k === 'umbrella' ? '按住 {kick} 開傘 · {throw} 擲出' : '{throw} 擲出') : this.hugged ? '{kick} 噴霧 · {throw} / {fire} 擲出' : '{throw} / {fire} 擲出';
    }
    else {
      const near = this.nearProp();
      if (near) this.prompt = `{pick} 拿起${Thrown.propName(near)}`;
      else if (p.special && p.special.empty) this.prompt = `{throw} 擲出空的${PLAYER_WEAPONS[p.special.id].name}`;
      else this.prompt = '';
    }
  }
}
