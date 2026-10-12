// Enemy types and AI. Gunners telegraph every shot with a laser sight that
// brightens while they aim, so a quick read (or bullet time) lets you dodge.

import * as THREE from 'three';
import { GUN_Y } from './config.js';
import { animateRig, buildCharacter, disposeRig, setFlash } from './characters.js';
import { Laser } from './fx.js';
import { DROPS } from './weapons.js';
import { angleTo, clamp, damp, dampAngle, lerp, rand, smoothstep, TAU, turnTowards } from './utils.js';

export const TYPES = {
  grunt: {
    label: 'THUG',
    hp: 3,
    speed: 3.6,
    radius: 0.45,
    aimTime: 0.7,
    cooldown: [1.2, 2.2],
    range: [6, 13],
    weapon: 'pistol',
    score: 100,
    lead: [0.2, 0.9],
    turn: 5,
    look: { body: 0x2a2a33, pants: 0x1b1b22, accent: 0xff2d4a, hair: 0x8a1020, weapon: 'pistol' },
  },
  shotgun: {
    label: 'SHOTGUNNER',
    hp: 4,
    speed: 3.3,
    radius: 0.47,
    aimTime: 0.8,
    cooldown: [2.0, 2.8],
    range: [3.5, 8],
    weapon: 'shotgun',
    score: 150,
    lead: [0.3, 0.8],
    turn: 4.5,
    look: { body: 0x3a2a1e, pants: 0x1e1a18, accent: 0xff8a1f, hair: 0xd06a10, weapon: 'shotgun' },
  },
  rifle: {
    label: 'RIFLEMAN',
    hp: 3,
    speed: 3.2,
    radius: 0.45,
    aimTime: 0.95,
    cooldown: [2.2, 3.2],
    range: [10, 18],
    weapon: 'rifle',
    score: 150,
    lead: [0.5, 1.0],
    turn: 3.5,
    look: { body: 0x2a2440, pants: 0x1a1830, accent: 0xb36bff, hair: 0x3a2466, weapon: 'rifle' },
  },
  rusher: {
    label: 'BLADE',
    hp: 2,
    speed: 6.6,
    radius: 0.42,
    weapon: 'blade',
    score: 120,
    turn: 10,
    look: { body: 0x141418, pants: 0x101014, accent: 0xff2bd0, hair: 0x0a0a0a, weapon: 'blade' },
  },
  brute: {
    label: 'BRUTE',
    hp: 20,
    speed: 2.1,
    radius: 0.72,
    aimTime: 1.1,
    cooldown: [2.6, 3.4],
    range: [5, 11],
    weapon: 'minigun',
    score: 400,
    lead: [0.3, 0.8],
    turn: 2.2,
    heavy: true,
    look: { body: 0x3b3e48, pants: 0x22242c, accent: 0xff3a2a, hair: 0x55585f, weapon: 'minigun', scale: 1.4 },
  },
};

const WEAPONS = {
  pistol: { shots: 1, interval: 0.1, speed: 20, dmg: 20, pellets: 1, spread: 0.02, sound: 'pistol' },
  shotgun: { shots: 1, interval: 0.1, speed: 17, dmg: 13, pellets: 6, spread: 0.28, range: 13, sound: 'shotgun' },
  rifle: { shots: 3, interval: 0.11, speed: 28, dmg: 16, pellets: 1, spread: 0.035, sound: 'rifle' },
  minigun: { shots: 14, interval: 0.09, speed: 18, dmg: 11, pellets: 1, spread: 0.07, sound: 'minigun', track: 1.1 },
};

const _aim = { x: 0, z: 0 };

const LASER_COLOR = { pistol: [1, 0.08, 0.12], shotgun: [1, 0.35, 0.05], rifle: [0.7, 0.15, 1], minigun: [1, 0.1, 0.05] };

class Enemy {
  constructor(mgr, type, sp) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    this.cfg = TYPES[type];
    const cfg = this.cfg;
    this.rig = buildCharacter({ ...cfg.look, ring: 0.35 });
    this.game.scene.add(this.rig.root);
    const lc = LASER_COLOR[cfg.weapon] || LASER_COLOR.pistol;
    this.laser = new Laser(this.game.scene, new THREE.Color(lc[0], lc[1], lc[2]));
    this.radius = cfg.radius;
    this.hp = cfg.hp;
    this.alive = true;
    this.dead = false;
    this.sp = sp;
    this.x = sp.x;
    this.z = sp.z;
    this.y = 0;
    this.vx = this.vz = 0;
    this.facing = angleTo(sp.x, sp.z, sp.ex, sp.ez);
    this.aimAngle = this.facing;
    this.state = 'enter';
    this.enterT = 0;
    this.spawnLock = sp.climb ? 0.35 : 0.1;
    this.path = null;
    this.pathI = 0;
    this.repath = 0;
    this.fireCd = rand(0.2, 0.8);
    this.aimT = 0;
    this.losLost = 0;
    this.los = false;
    this.losT = 0;
    this.burst = 0;
    this.burstT = 0;
    this.lead = 0.5;
    this.timer = 0;
    this.stunT = 0;
    this.stunCause = 'kick';
    this.flash = 0;
    this.phase = rand(0, TAU);
    this.moveAmt = 0;
    this.hasToken = false;
    this.struck = false;
    this.corpseT = 0;
    this.pooled = false;
    if (sp.climb) {
      const out = [-sp.dirX, -sp.dirZ];
      this.enterFrom = { x: sp.x + out[0] * 1.6, z: sp.z + out[1] * 1.6 };
      this.enterMid = { x: sp.x + out[0] * 0.6, z: sp.z + out[1] * 0.6 };
      this.x = this.enterFrom.x;
      this.z = this.enterFrom.z;
      this.y = -1.8;
    }
    this.sync();
  }

  get aiming() {
    return this.alive && (this.state === 'aim' || this.state === 'windup');
  }

  dispose() {
    this.game.scene.remove(this.rig.root);
    disposeRig(this.rig);
    this.laser.dispose(this.game.scene);
  }

  // ----------------------------------------------------------- damage

  hit(b) {
    if (!this.alive) return;
    const g = this.game;
    const fromPlayer = b.owner === 'player';
    this.hp -= fromPlayer ? b.damage : 3;
    this.flash = 1;
    const knock = b.knock || 1;
    const push = (this.cfg.heavy ? 0.6 : 2.5) * knock;
    this.vx += b.dx * push;
    this.vz += b.dz * push;
    g.fx.blood(this.x, 1.3, this.z, b.dx, b.dz, 7);
    g.audio.flesh(g.panFor(this.x));
    if (this.hp <= 0) {
      if (fromPlayer) b.kills = (b.kills || 0) + 1;
      this.die(b.dx, b.dz, {
        cause: fromPlayer ? 'bullet' : 'friendly',
        split: b.split,
        ricochet: b.ricochet,
        bullet: b,
        knock,
      });
      return;
    }
    g.hud.hitMarker(false);
    if (!this.cfg.heavy && this.state === 'aim') this.aimT = Math.max(0, this.aimT - 0.22);
  }

  kick(dx, dz, power, cause = 'kick') {
    if (!this.alive) return;
    const heavy = this.cfg.heavy;
    this.stunT = heavy ? 0.35 : 0.85;
    this.stunCause = cause;
    const m = heavy ? 0.3 : 1;
    this.vx = dx * power * m;
    this.vz = dz * power * m;
    this.endAim();
    if (this.state !== 'enter') this.state = this.cfg.weapon === 'blade' ? 'chase' : 'move';
    this.repath = 0;
    this.hp -= 1;
    this.flash = 1;
    this.game.fx.blood(this.x, 1.2, this.z, dx, dz, 5);
    if (this.hp <= 0) this.die(dx, dz, { cause });
  }

  blast(dx, dz, dmg) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.flash = 1;
    this.vx += dx * 10;
    this.vz += dz * 10;
    if (this.hp <= 0) this.die(dx, dz, { cause: 'explosion' });
    else this.stunT = 0.5;
  }

  die(dx, dz, info) {
    if (!this.alive) return;
    const g = this.game;
    this.alive = false;
    this.dead = true;
    this.corpseT = 0;
    this.endAim();
    this.laser.hide();
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    this.dirX = dx;
    this.dirZ = dz;
    const power = info.cause === 'explosion' ? 15 : info.cause === 'kick' || info.cause === 'strike' ? 12 : 8 * Math.min(info.knock || 1, 1.8);
    this.vx = dx * power;
    this.vz = dz * power;
    this.corpseSpin = rand(-2.5, 2.5);
    this.rig.root.rotation.y = Math.atan2(-dx, -dz);
    this.rig.mats.accent.emissiveIntensity = 0.12;
    this.rig.ring.visible = false;
    g.fx.blood(this.x, 1.2, this.z, dx, dz, 24, 1.3);
    g.fx.decal(this.x + dx * 0.6, this.z + dz * 0.6, rand(0.6, 1), 0.2, 0.01, 0.02);
    this.dropWeapon();
    g.onEnemyKilled(this, info);
  }

  dropWeapon() {
    for (const [kind, chance] of DROPS[this.type] || []) {
      if (Math.random() >= chance) continue;
      for (const m of this.rig.weaponParts) m.visible = false;
      this.game.pickups.drop(kind, this.x, this.z, this.type === 'brute' ? 1 : 0.6);
      return;
    }
  }

  endAim() {
    this.mgr.releaseToken(this);
    this.laser.hide();
  }

  // --------------------------------------------------------------- AI

  muzzle() {
    const [lx, lz] = this.rig.muzzles[0];
    const f = this.facing;
    return { x: this.x + lx * Math.cos(f) + lz * Math.sin(f), z: this.z - lx * Math.sin(f) + lz * Math.cos(f) };
  }

  pickGoal() {
    const g = this.game;
    const p = g.player;
    const [rmin, rmax] = this.cfg.range;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const r = rand(rmin, rmax);
      const x = p.x + Math.sin(a) * r;
      const z = p.z + Math.cos(a) * r;
      const B = g.level.bounds;
      if (Math.abs(x) > B.halfW - 1 || Math.abs(z) > B.halfD - 1) continue;
      if (!g.level.nav.isWalkable(x, z)) continue;
      let score = g.level.hasLOS(x, z, p.x, p.z) ? 6 : 0;
      score -= Math.hypot(x - this.x, z - this.z) * 0.3;
      for (const o of this.mgr.list) {
        if (o === this || !o.alive) continue;
        if (Math.hypot(o.x - x, o.z - z) < 3) score -= 3;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x, z };
      }
    }
    return best || { x: p.x, z: p.z };
  }

  followPath(speed) {
    if (!this.path) return [0, 0];
    while (this.pathI < this.path.length) {
      const wp = this.path[this.pathI];
      const dx = wp.x - this.x;
      const dz = wp.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        this.pathI++;
        continue;
      }
      const sp = this.pathI === this.path.length - 1 ? Math.min(speed, d * 3) : speed;
      return [(dx / d) * sp, (dz / d) * sp];
    }
    return [0, 0];
  }

  /** Where to shoot: the player's position, led by a random fraction of their motion. */
  aimPoint() {
    const p = this.game.player;
    const w = WEAPONS[this.cfg.weapon];
    if (!w) return p;
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    const t = (d / w.speed) * this.lead;
    const vs = this.game.playerVelScale;
    _aim.x = p.x + p.vx * vs * t;
    _aim.z = p.z + p.vz * vs * t;
    return _aim;
  }

  startAim() {
    this.state = 'aim';
    this.aimT = 0;
    this.losLost = 0;
    this.lead = rand(this.cfg.lead[0], this.cfg.lead[1]);
    const a = this.aimPoint();
    this.aimAngle = turnTowards(this.facing, angleTo(this.x, this.z, a.x, a.z), 0.6);
    this.game.audio.aimWarn(this.game.panFor(this.x));
  }

  shoot() {
    const g = this.game;
    const w = WEAPONS[this.cfg.weapon];
    const m = this.muzzle();
    const ox = this.x + Math.sin(this.aimAngle) * 0.35;
    const oz = this.z + Math.cos(this.aimAngle) * 0.35;
    for (let i = 0; i < w.pellets; i++) {
      const a =
        w.pellets > 1 ? this.aimAngle + (i / (w.pellets - 1) - 0.5) * w.spread * 2 + rand(-0.03, 0.03) : this.aimAngle + rand(-w.spread, w.spread);
      g.bullets.spawn({
        x: ox,
        z: oz,
        dx: Math.sin(a),
        dz: Math.cos(a),
        speed: w.speed * rand(0.95, 1.05),
        owner: 'enemy',
        damage: w.dmg,
        range: w.range || 70,
        source: this,
      });
    }
    g.fx.muzzle(m.x, GUN_Y, m.z, Math.sin(this.aimAngle), Math.cos(this.aimAngle), [8, 2.2, 0.8]);
    g.fx.flash(m.x, GUN_Y + 0.4, m.z, 0xff6040, 14, 0.08, 8);
    g.audio.shot(w.sound, g.panFor(this.x));
  }

  update(dt) {
    if (this.dead) {
      this.updateCorpse(dt);
      return;
    }
    const g = this.game;
    const p = g.player;
    const cfg = this.cfg;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.fireCd -= dt;
    this.spawnLock -= dt;
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.12;
      this.los = p.alive && g.level.hasLOS(this.x, this.z, p.x, p.z);
    }
    const dxp = p.x - this.x;
    const dzp = p.z - this.z;
    const distP = Math.hypot(dxp, dzp) || 0.001;
    let want = [0, 0];
    let face = null;
    let collide = true;

    if (this.stunT > 0) {
      this.stunT -= dt;
      const f = Math.exp(-4 * dt);
      this.vx *= f;
      this.vz *= f;
      this.bowl();
      want = null;
    } else if (!p.alive && this.state !== 'enter') {
      this.endAim();
      this.state = 'idle';
    }

    if (want) {
      switch (this.state) {
        case 'enter': {
          this.enterT += dt;
          if (this.sp.climb) {
            collide = false;
            const t = this.enterT;
            if (t < 0.45) {
              const k = smoothstep(0, 1, t / 0.45);
              this.x = lerp(this.enterFrom.x, this.enterMid.x, k);
              this.z = lerp(this.enterFrom.z, this.enterMid.z, k);
              this.y = lerp(-1.8, 1.05, k);
            } else if (t < 0.8) {
              const k = smoothstep(0, 1, (t - 0.45) / 0.35);
              this.x = lerp(this.enterMid.x, this.sp.ex, k);
              this.z = lerp(this.enterMid.z, this.sp.ez, k);
              this.y = Math.sin((1 - k) * Math.PI * 0.5) * 1.05;
            } else {
              this.y = 0;
              this.state = cfg.weapon === 'blade' ? 'chase' : 'move';
            }
            this.vx = this.vz = 0;
            want = null;
          } else {
            const dx = this.sp.ex - this.x;
            const dz = this.sp.ez - this.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.3 || this.enterT > 2) this.state = cfg.weapon === 'blade' ? 'chase' : 'move';
            else want = [(dx / d) * cfg.speed, (dz / d) * cfg.speed];
          }
          break;
        }
        case 'idle':
          break;
        case 'move': {
          if (this.los && this.fireCd <= 0 && distP < cfg.range[1] + 3 && this.mgr.requestToken(this)) {
            this.startAim();
            break;
          }
          this.repath -= dt;
          if (this.repath <= 0 || !this.path || this.pathI >= this.path.length) {
            this.repath = rand(1.4, 2.6);
            const goal = this.pickGoal();
            this.path = g.level.nav.findPath(this.x, this.z, goal.x, goal.z);
            this.pathI = 0;
          }
          want = this.followPath(cfg.speed);
          if (this.los) face = angleTo(this.x, this.z, p.x, p.z);
          break;
        }
        case 'aim': {
          this.aimT += dt;
          const a = this.aimPoint();
          this.aimAngle = turnTowards(this.aimAngle, angleTo(this.x, this.z, a.x, a.z), cfg.turn * dt);
          face = this.aimAngle;
          if (!this.los) {
            this.losLost += dt;
            if (this.losLost > 0.35) {
              this.endAim();
              this.state = 'move';
              this.repath = 0;
              this.fireCd = 0.3;
              break;
            }
          } else this.losLost = 0;
          if (cfg.weapon === 'shotgun' && distP > 4) want = [(dxp / distP) * 1.2, (dzp / distP) * 1.2];
          if (this.aimT >= cfg.aimTime) {
            const w = WEAPONS[cfg.weapon];
            this.state = 'fire';
            this.burst = w.shots;
            this.burstT = 0;
          }
          break;
        }
        case 'fire': {
          const w = WEAPONS[cfg.weapon];
          if (w.track) {
            const a = this.aimPoint();
            this.aimAngle = turnTowards(this.aimAngle, angleTo(this.x, this.z, a.x, a.z), w.track * dt);
          }
          face = this.aimAngle;
          this.burstT -= dt;
          if (this.burstT <= 0 && this.burst > 0) {
            this.shoot();
            this.burst--;
            this.burstT = w.interval;
          }
          if (this.burst <= 0 && this.burstT <= 0) {
            this.endAim();
            this.state = 'recover';
            this.timer = 0.35;
            this.fireCd = rand(cfg.cooldown[0], cfg.cooldown[1]);
          }
          break;
        }
        case 'recover':
          this.timer -= dt;
          face = this.aimAngle;
          if (this.timer <= 0) {
            this.state = cfg.weapon === 'blade' ? 'chase' : 'move';
            this.repath = 0;
          }
          break;
        case 'chase': {
          this.repath -= dt;
          if (this.los && g.level.nav.lineWalkable(this.x, this.z, p.x, p.z)) {
            want = [(dxp / distP) * cfg.speed, (dzp / distP) * cfg.speed];
          } else {
            if (this.repath <= 0 || !this.path) {
              this.repath = 0.45;
              this.path = g.level.nav.findPath(this.x, this.z, p.x, p.z);
              this.pathI = 0;
            }
            want = this.followPath(cfg.speed);
          }
          if (distP < 1.7 && this.mgr.requestToken(this)) {
            this.state = 'windup';
            this.timer = 0.34;
            this.aimAngle = angleTo(this.x, this.z, p.x, p.z);
            g.audio.aimWarn(g.panFor(this.x));
          }
          break;
        }
        case 'windup':
          this.timer -= dt;
          this.aimAngle = turnTowards(this.aimAngle, angleTo(this.x, this.z, p.x, p.z), 8 * dt);
          face = this.aimAngle;
          want = [(dxp / distP) * 0.8, (dzp / distP) * 0.8];
          if (this.timer <= 0) {
            this.state = 'strike';
            this.timer = 0.16;
            this.struck = false;
            this.vx += Math.sin(this.aimAngle) * 9;
            this.vz += Math.cos(this.aimAngle) * 9;
            g.audio.slash();
          }
          break;
        case 'strike':
          this.timer -= dt;
          face = this.aimAngle;
          want = null;
          if (!this.struck && distP < 1.55 + this.radius) {
            this.struck = true;
            if (p.hurt(30, dxp / distP, dzp / distP)) g.shake(0.4);
            else if (p.spinning) g.score.style('DODGE', 40, true);
          }
          if (this.timer <= 0) {
            this.endAim();
            this.state = 'recover';
            this.timer = 0.7;
          }
          break;
      }
    }

    if (want) {
      this.vx = damp(this.vx, want[0], 10, dt);
      this.vz = damp(this.vz, want[1], 10, dt);
    }
    if (this.state !== 'enter' || !this.sp.climb) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
    }
    if (collide) {
      this.pushProps();
      g.level.collideCircle(this, this.radius);
    }

    const speed = Math.hypot(this.vx, this.vz);
    if (face === null && speed > 0.4) face = Math.atan2(this.vx, this.vz);
    if (face !== null) this.facing = dampAngle(this.facing, face, this.stunT > 0 ? 2 : 14, dt);
    this.moveAmt = damp(this.moveAmt, clamp(speed / Math.max(cfg.speed, 1), 0, 1), 10, dt);
    this.phase += speed * dt * 2.2;
    this.sync();
    this.updateLaser();
  }

  /** A kicked enemy slams into others like a bowling ball. */
  bowl() {
    const sp = Math.hypot(this.vx, this.vz);
    if (sp < 5) return;
    for (const o of this.mgr.list) {
      if (o === this || !o.alive || o.stunT > 0) continue;
      const dx = o.x - this.x;
      const dz = o.z - this.z;
      const rr = this.radius + o.radius + 0.1;
      if (dx * dx + dz * dz > rr * rr) continue;
      const d = Math.hypot(dx, dz) || 1;
      o.kick(dx / d, dz / d, sp * 0.75, 'strike');
      this.vx *= 0.5;
      this.vz *= 0.5;
      this.game.audio.kick(true);
      this.game.shake(0.2);
    }
  }

  pushProps() {
    for (const p of this.game.level.props) {
      if (!p.alive) continue;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const rr = this.radius + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = rr - d;
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 6 && this.stunT <= 0) {
        // a kicked barrel or pan bowls the enemy over
        this.kick(p.vx / sp, p.vz / sp, sp * 0.6, 'strike');
        p.vx *= 0.3;
        p.vz *= 0.3;
      }
    }
  }

  sync() {
    const r = this.rig;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.y = this.facing;
    animateRig(r, this.phase, this.moveAmt);
    setFlash(r, this.flash * 2.5);
    if (this.cfg.weapon === 'blade') {
      const raise = this.state === 'windup' ? -1.6 : this.state === 'strike' ? 0.9 : 0.5;
      r.armR.rotation.x = damp(r.armR.rotation.x, raise, 25, 1 / 60);
    }
    r.ring.material.color.setRGB(this.aiming ? 1.6 : 0.35, 0.05, 0.08);
  }

  updateLaser() {
    const w = WEAPONS[this.cfg.weapon];
    if (!w || (this.state !== 'aim' && this.state !== 'fire')) {
      this.laser.hide();
      return;
    }
    const g = this.game;
    const m = this.muzzle();
    const dx = Math.sin(this.aimAngle);
    const dz = Math.cos(this.aimAngle);
    const hit = g.level.raycast(m.x, m.z, m.x + dx * 40, m.z + dz * 40, true);
    const len = hit ? hit.t * 40 : 40;
    const k = this.state === 'fire' ? 1 : clamp(this.aimT / this.cfg.aimTime, 0, 1);
    let intensity = 0.35 + k * k * 2.8;
    if (k > 0.78 && this.state === 'aim') intensity *= Math.sin(performance.now() * 0.06) > 0 ? 1.7 : 0.5;
    this.laser.set(m.x, m.z, m.x + dx * len, m.z + dz * len, 0.035 + k * 0.05, intensity);
  }

  updateCorpse(dt) {
    this.corpseT += dt;
    const f = Math.exp(-3.2 * dt);
    this.vx *= f;
    this.vz *= f;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.game.level.collideCircle(this, 0.4)) {
      this.vx *= 0.4;
      this.vz *= 0.4;
    }
    this.y = Math.max(0, this.y - dt * 6);
    const r = this.rig;
    r.root.rotation.y += this.corpseSpin * dt * clamp(Math.hypot(this.vx, this.vz) / 5, 0, 1);
    const k = clamp(this.corpseT / 0.4, 0, 1);
    r.inner.rotation.x = -Math.PI / 2 * (1 - (1 - k) * (1 - k));
    r.inner.position.y = 0.2 * this.rig.scale * k;
    r.root.position.set(this.x, this.y, this.z);
    setFlash(r, Math.max(0, 1 - this.corpseT * 4) * 2);
    animateRig(r, 0, 0);
    if (!this.pooled && this.corpseT > 0.7) {
      this.pooled = true;
      // resting bodies stop casting shadows: halves their draw calls
      r.inner.traverse((m) => {
        if (m.isMesh) m.castShadow = false;
      });
      this.game.fx.decal(this.x - this.dirX * 0.4, this.z - this.dirZ * 0.4, rand(1, 1.5), 0.17, 0.005, 0.015);
    }
  }
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.corpses = [];
    this.tokens = 0;
  }

  get aliveCount() {
    let n = 0;
    for (const e of this.list) if (e.alive) n++;
    return n;
  }

  spawn(type, sp) {
    const e = new Enemy(this, type, sp);
    this.list.push(e);
    return e;
  }

  clear() {
    for (const e of this.list) e.dispose();
    for (const e of this.corpses) e.dispose();
    this.list = [];
    this.corpses = [];
    this.tokens = 0;
  }

  maxTokens() {
    return 2 + Math.floor(this.game.waves.wave / 2);
  }

  requestToken(e) {
    if (e.hasToken) return true;
    if (this.tokens >= this.maxTokens()) return false;
    e.hasToken = true;
    this.tokens++;
    return true;
  }

  releaseToken(e) {
    if (!e.hasToken) return;
    e.hasToken = false;
    this.tokens--;
  }

  closestTo(x, z, maxD) {
    let best = null;
    let bd = maxD * maxD;
    for (const e of this.list) {
      if (!e.alive || e.spawnLock > 0) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  nearestVisible(x, z, maxD) {
    let best = null;
    let bd = maxD * maxD;
    for (const e of this.list) {
      if (!e.alive || e.spawnLock > 0) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < bd && this.game.level.hasLOS(x, z, e.x, e.z)) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  update(dt) {
    for (const e of this.list) e.update(dt);
    for (const e of this.corpses) e.update(dt);

    // separation between living enemies
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive || (a.state === 'enter' && a.sp.climb)) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || (b.state === 'enter' && b.sp.climb)) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const ov = rr - d;
        const wa = b.radius / rr;
        a.x -= (dx / d) * ov * wa;
        a.z -= (dz / d) * ov * wa;
        b.x += (dx / d) * ov * (1 - wa);
        b.z += (dz / d) * ov * (1 - wa);
      }
    }

    if (L.some((e) => !e.alive)) {
      this.list = L.filter((e) => {
        if (e.alive) return true;
        this.corpses.push(e);
        return false;
      });
      while (this.corpses.length > 20) this.corpses.shift().dispose();
    }
  }
}
