// Enemy types and AI. Gunners telegraph every shot with a laser sight that
// brightens while they aim, so a quick read (or bullet time) lets you dodge.

import * as THREE from 'three';
import { AI, ENEMY_HP, ENV, FIREPOWER, GUN_Y, LOGIC_HZ, PLAYER } from './config.js';
import { animateRig, buildCharacter, buildDrone, deathPose, disposeRig, finishRig, keyPose, setFlash } from './characters.js';
import { Laser } from './fx.js';
import { angleTo, clamp, damp, dampAngle, lerp, rand, smoothstep, TAU, turnTowards } from './utils.js';

export const TYPES = {
  grunt: {
    label: 'THUG',
    hp: 3,
    speed: 3.6,
    radius: 0.32,
    aimTime: 0.7,
    cooldown: [1.2, 2.2],
    range: [6, 13],
    weapon: 'pistol',
    score: 100,
    lead: [0.2, 0.9],
    turn: 5,
    tactic: 'cover', // how he closes in (config.js AI): behind cover, stepping out to shoot
    look: { body: 0x2a2a33, pants: 0x1b1b22, accent: 0xff2d4a, hair: 0x8a1020, weapon: 'pistol' },
    spawn: { from: 1, weight: 6 },
    perch: true, // a beat may send him up to a balcony (waves.js; config.js BEATS.perch)
  },
  shotgun: {
    label: 'SHOTGUNNER',
    hp: 4,
    speed: 3.3,
    radius: 0.34,
    aimTime: 0.8,
    cooldown: [2.0, 2.8],
    range: [3.5, 8],
    weapon: 'shotgun',
    score: 150,
    lead: [0.3, 0.8],
    turn: 4.5,
    tactic: 'cover',
    look: { body: 0x3a2a1e, pants: 0x1e1a18, accent: 0xff8a1f, hair: 0xd06a10, weapon: 'shotgun' },
    spawn: { from: 2, weight: 2.5 },
  },
  rifle: {
    label: 'RIFLEMAN',
    hp: 3,
    speed: 3.2,
    radius: 0.32,
    aimTime: 0.95,
    cooldown: [2.2, 3.2],
    range: [10, 18],
    weapon: 'rifle',
    score: 150,
    lead: [0.5, 1.0],
    turn: 3.5,
    tactic: 'cover',
    look: { body: 0x2a2440, pants: 0x1a1830, accent: 0xb36bff, hair: 0x3a2466, weapon: 'rifle' },
    spawn: { from: 2, weight: 2 },
    perch: true,
  },
  rusher: {
    label: 'BLADE',
    hp: 2,
    speed: 6.6,
    radius: 0.3,
    weapon: 'blade',
    score: 120,
    turn: 10,
    tactic: 'flank', // a pair of them split up and come from two sides
    look: { body: 0x141418, pants: 0x101014, accent: 0xff2bd0, hair: 0x0a0a0a, weapon: 'blade' },
    spawn: { from: 3, weight: 2.2 },
  },
  brute: {
    label: 'BRUTE',
    hp: 20,
    speed: 2.1,
    radius: 0.48,
    aimTime: 1.1,
    cooldown: [2.6, 3.4],
    range: [5, 11],
    weapon: 'minigun',
    score: 400,
    lead: [0.3, 0.8],
    turn: 2.2,
    heavy: true,
    tactic: 'advance', // straight at you, as ever
    look: { body: 0x3b3e48, pants: 0x22242c, accent: 0xff3a2a, hair: 0x55585f, weapon: 'minigun', scale: 1.25 },
  },
  shield: {
    label: 'SHIELD',
    model: 'grunt', // the thug's model behind a riot shield
    hp: 4,
    speed: 2.3, // walks in slowly behind the shield
    radius: 0.4,
    aimTime: 0.9,
    cooldown: [1.8, 2.6],
    range: [2.5, 6],
    weapon: 'pistol',
    score: 200,
    lead: [0.2, 0.7],
    turn: 3,
    shield: { arc: 60, down: 1.5 }, // stops bullets coming from within ±arc degrees of his facing; a kick drops it for `down` s
    tactic: 'advance',
    look: { body: 0x1f2a36, pants: 0x161c24, accent: 0xffc21a, hair: 0x2a2a2a, weapon: 'pistol' },
    spawn: { from: 3, weight: 1.6, max: 2 },
  },
  bomber: {
    label: 'BOMBER',
    model: 'rusher', // the blade's lean runner, in a vest of charges
    hp: 2,
    speed: 5.4, // slower than the player (7.4): you can outrun him, not ignore him
    radius: 0.32,
    weapon: 'detonator',
    score: 150,
    turn: 8,
    // lights up within `reach` m of the player and goes off `fuse` s later with a barrel's `blast`;
    // shot dead he goes off `delay` s later; a kick sends his charge that way for `turned` s
    bomb: { reach: 1.5, fuse: 0.4, blast: 4.4, delay: 0.08, turned: 1.2 },
    tactic: 'flank',
    look: { body: 0x2c2a1e, pants: 0x1c1a14, accent: 0xff5a1a, hair: 0x1a1a1a, weapon: 'detonator' },
    spawn: { from: 6, weight: 1.5, max: 2 },
  },
  grenadier: {
    label: 'GRENADIER',
    model: 'rifle', // the rifleman's model, with a bag of grenades on his back
    hp: 3,
    speed: 3.0,
    radius: 0.32,
    aimTime: 0.6, // the wind-up before a throw (no laser: the ring where it lands is the warning)
    cooldown: [3.4, 4.6],
    range: [8, 15], // he keeps this far off and needs no line of sight: the grenade goes over cover
    weapon: 'grenade',
    score: 200,
    lead: [0, 0],
    turn: 4,
    // lobbed onto where the player stands: `flight` s in the air (`apex` m high), then `fuse` s on
    // the ground, when a kick sends it `kickDistance` m back in `kickFlight` s; a blast of `radius` m.
    // A player's bullet within `hitRadius` m of its shadow (where it is over the floor) sets it off
    // in the air: AIRBURST, `airburst` points
    lob: { flight: 2.5, apex: 3, fuse: 0.5, radius: 3, kickDistance: 10, kickFlight: 0.55, hitRadius: 0.6, airburst: 150 },
    look: { body: 0x2e3324, pants: 0x1c2016, accent: 0x9be22a, hair: 0x3a4422, weapon: 'grenade' },
    spawn: { from: 5, weight: 1.4, max: 2 },
  },
  sniper: {
    label: 'SNIPER',
    model: 'rifle', // the rifleman's model with a long rifle
    hp: 3,
    speed: 3.0,
    radius: 0.32,
    aimTime: 2.4, // a long red line before the one shot
    cooldown: [0.4, 0.8], // after the reload window
    range: [18, 30], // he keeps his distance; standing still while he can see the player
    weapon: 'sniper',
    score: 250,
    lead: [0, 0.25],
    turn: 1.4, // slow to follow: moving while the line is on you throws it off
    reload: 2, // s after the shot with the rifle down: the moment to get him
    look: { body: 0x23262e, pants: 0x16181e, accent: 0xff2a2a, hair: 0x101216, weapon: 'sniper' },
    spawn: { from: 7, weight: 1.2, max: 2, minDist: 18 }, // comes in by a door at least minDist m from the player
    perch: true,
  },
  drone: {
    label: 'DRONE',
    hp: 3,
    speed: 4.4,
    radius: 0.42,
    aimTime: 0.45,
    cooldown: [1.19, 1.19], // with the aim and the burst itself: a burst every 2 s
    range: [5, 9],
    weapon: 'drone',
    score: 200,
    lead: [0.2, 0.6],
    turn: 7,
    // flies `height` m up, over any cover lower than that (it sees and shoots over it), circling the
    // player `radius` m off at `orbit` rad/s; shot down it falls and bursts with a `crash` m blast
    fly: { height: 2.5, radius: 7, orbit: 0.5, crash: 1.5 },
    look: { body: 0x23262e, accent: 0xff3aa0, gun: 0x2b2b33 },
    spawn: { from: 8, weight: 1.2, max: 2 },
  },
};

const WEAPONS = {
  pistol: { shots: 1, interval: 0.1, speed: 20, dmg: 20, pellets: 1, spread: 0.02, sound: 'pistol' },
  shotgun: { shots: 1, interval: 0.1, speed: 17, dmg: 13, pellets: 6, spread: 0.28, range: 13, sound: 'shotgun' },
  rifle: { shots: 3, interval: 0.11, speed: 28, dmg: 16, pellets: 1, spread: 0.035, sound: 'rifle' },
  minigun: { shots: 14, interval: 0.09, speed: 18, dmg: 11, pellets: 1, spread: 0.07, sound: 'minigun', track: 1.1 },
  sniper: { shots: 1, interval: 0.1, speed: 72, dmg: 40, pellets: 1, spread: 0, sound: 'sniper' },
  drone: { shots: 4, interval: 0.09, speed: 24, dmg: 9, pellets: 1, spread: 0.05, sound: 'smg' },
};

const _aim = { x: 0, z: 0 };

const LASER_COLOR = { pistol: [1, 0.08, 0.12], shotgun: [1, 0.35, 0.05], rifle: [0.7, 0.15, 1], minigun: [1, 0.1, 0.05], sniper: [1, 0.02, 0.02], drone: [1, 0.15, 0.6] };

class Enemy {
  constructor(mgr, type, sp) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    this.cfg = TYPES[type];
    const cfg = this.cfg;
    this.rig = cfg.fly ? buildDrone({ ...cfg.look, ring: 0.35, height: cfg.fly.height }) : buildCharacter({ ...cfg.look, ring: 0.35, model: cfg.model || type });
    this.orbitDir = cfg.fly ? (this.game.rng.next() < 0.5 ? -1 : 1) : 0; // which way a drone circles
    this.tactic = cfg.tactic || null; // 'cover' | 'flank' | 'advance' (config.js AI): how he closes in
    this.cover = null; // a 'cover' gunner's spot to hide at and where he steps out from (findCover)
    this.coverCheck = 0;
    this.coverLogged = false;
    this.peekAim = false; // aiming from behind the cover: he steps out to fire the moment the aim is done
    this.coverShots = 0; // shots from the cover he has now (AI.peeks)
    this.coverRest = 0; // s before he may look for cover again
    this.flankSide = this.tactic === 'flank' ? (mgr.flankSeq++ % 2 ? 1 : -1) : 0; // flankers take turns at the two sides
    this.shieldDownT = 0;
    this.held = false; // held up by the player as a human shield (player.js grab): moved by the player, does nothing
    if (cfg.shield) this.buildShield();
    this.fuseT = -1; // a bomber's lit vest: seconds left, or -1
    this.bombT = -1; // a dead bomber's charges: seconds until they go off, or -1
    this.turnT = 0; // a kicked bomber charges along (dashX, dashZ) this long
    this.dashX = this.dashZ = 0;
    if (cfg.bomb) this.buildVest();
    if (cfg.lob) this.buildBag();
    this.idleOffset = rand(0, 10);
    this.game.scene.add(this.rig.root);
    const lc = LASER_COLOR[cfg.weapon] || LASER_COLOR.pistol;
    this.laser = new Laser(this.game.scene, new THREE.Color(lc[0], lc[1], lc[2]));
    this.radius = cfg.radius;
    // thicker each stage of the run (config.js ENEMY_HP); what is not a bullet is made as much stronger (harm)
    this.hp = Math.round(cfg.hp * ENEMY_HP.base * (1 + ENEMY_HP.perStage * this.game.waves.stageIndex));
    this.tough = this.hp / cfg.hp;
    this.flinchT = 0; // s left of being rocked back by a shot (AI.flinch)
    this.alive = true;
    this.dead = false;
    this.sp = sp;
    this.x = sp.x;
    this.z = sp.z;
    this.y = cfg.fly ? cfg.fly.height : 0;
    this.perch = sp.perch || 0; // sent up to a balcony (level.js balconies): this high, and there he stays
    if (this.perch) this.y = this.perch;
    this.vx = this.vz = 0;
    this.facing = angleTo(sp.x, sp.z, sp.ex, sp.ez);
    this.aimAngle = this.facing;
    this.state = 'enter';
    this.enterT = 0;
    this.spawnLock = sp.climb ? 0.35 : 0.1;
    this.path = null;
    this.pathI = 0;
    this.repath = 0;
    this.fireCd = this.game.rng.range(0.2, 0.8);
    this.aimT = 0;
    this.losLost = 0;
    this.los = false;
    this.losT = 0;
    this.burst = 0;
    this.burstT = 0;
    this.lead = 0.5;
    this.timer = 0;
    this.stunT = 0;
    this.blindT = 0; // a flock burst in his face: no aiming, and a kill now is a PIGEON STRIKE
    this.netT = 0; // under a fishing net (level.js Net): held, and a kill now is NETTED
    this.stunCause = 'kick';
    this.flash = 0;
    this.phase = rand(0, TAU);
    this.moveAmt = 0;
    this.hasToken = false;
    this.struck = false;
    this.corpseT = 0;
    this.pooled = false;
    if (sp.rappel) {
      // roped down from the helicopter: untouchable on the rope, his own man once down
      this.y = sp.rappel.height;
      this.rappelT = sp.rappel.drop;
      this.spawnLock = sp.rappel.drop;
    }
    if (sp.climb && !cfg.fly) {
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

  /** Up off the ground, a drone in the air or a man on a balcony: nothing on the street reaches him (a kick, a net, a body). */
  get aloft() {
    return !!this.cfg.fly || this.perch > 0;
  }

  /** Can the player grab him as a human shield: on the street, in the fight, no riot shield, not heavy, no vest of charges. */
  get holdable() {
    const c = this.cfg;
    return this.alive && !this.held && !this.aloft && !c.shield && !c.heavy && !c.bomb && this.state !== 'enter' && this.spawnLock <= 0;
  }

  /** Grabbed as a human shield: whatever he was doing, he stops. */
  hold() {
    this.held = true;
    this.endAim();
    this.stunT = 0;
    this.vx = this.vz = 0;
    this.state = 'move';
    this.repath = 0;
  }

  /** Let go: shoved out along (dx, dz), flying like a kicked man (bowl knocks over whoever he meets) but unhurt. */
  letGo(dx, dz) {
    this.held = false;
    this.kick(dx, dz, PLAYER.humanShield.shove, 'shove', 0);
  }

  /** A bullet of his own side's, meant for the player behind him (bullets.js): PLAYER.humanShield.hit of his hp. */
  shieldHit(b) {
    if (!this.alive) return;
    const g = this.game;
    this.harm(PLAYER.humanShield.hit);
    this.flash = 1;
    g.fx.blood(this.x, 1.3, this.z, b.dx, b.dz, 7);
    g.audio.flesh(g.panFor(this.x));
    if (this.hp <= 0) this.die(b.dx, b.dz, { cause: 'shield' });
  }

  /**
   * How high over the floor he sees and shoots from: lower cover is no obstacle to his sight or his bullets. A drone's
   * flight, a balcony (a test's: no map has perches); 0 on his feet, wherever the ground is (同一水平: he fights only on
   * the player's level, where the cover stands on the same floor as he does).
   */
  get over() {
    return this.cfg.fly ? this.cfg.fly.height : this.perch;
  }

  /** The riot shield, held in front on the left: a dark clear panel with a yellow rim. */
  buildShield() {
    const g = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.04), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.82 }));
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0xffc21a, emissive: 0xffa400, emissiveIntensity: 0.8 }));
    rim.position.y = 0.5;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), rim.material);
    band.position.y = -0.1;
    g.add(panel, rim, band);
    for (const m of g.children) m.castShadow = true;
    g.position.set(0.1, 0.95, 0.42);
    this.rig.inner.add(g);
    this.game.style.dress(g);
    this.shieldMesh = g;
  }

  /** Seconds from the laser coming on to the shot: the type's, times the difficulty's (rules.js aimMul). */
  get aimTime() {
    return this.cfg.aimTime * this.game.ruleset.aimMul;
  }

  /** Those who run at the player instead of keeping a range: blades and bombers. */
  get rushes() {
    return this.cfg.weapon === 'blade' || !!this.cfg.bomb;
  }

  /** The bomber's vest: a dark harness, a row of red charges and a lamp that blinks faster once he is lit. */
  buildVest() {
    const g = new THREE.Group();
    const harness = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.32), new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.8 }));
    g.add(harness);
    const red = new THREE.MeshStandardMaterial({ color: 0xb8241a, roughness: 0.6 });
    for (const x of [-0.15, -0.05, 0.05, 0.15]) {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 8), red);
      stick.position.set(x, -0.02, 0.18);
      g.add(stick);
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.04), new THREE.MeshStandardMaterial({ color: 0xff3a1a, emissive: 0xff3a1a, emissiveIntensity: 0.5 }));
    lamp.position.set(0, 0.16, 0.19);
    g.add(lamp);
    for (const m of g.children) m.castShadow = true;
    g.position.set(0, 1.16, 0);
    this.rig.inner.add(g);
    this.game.style.dress(g);
    this.vest = g;
    this.lamp = lamp;
  }

  /** The grenadier's bag: an olive canvas box on his back with two grenades strapped to it. */
  buildBag() {
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.2), new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.9 }));
    g.add(bag);
    const shell = new THREE.MeshStandardMaterial({ color: 0x2c3328, roughness: 0.5, metalness: 0.4 });
    for (const x of [-0.11, 0.11]) {
      const nade = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), shell);
      nade.position.set(x, -0.08, -0.13);
      g.add(nade);
    }
    for (const m of g.children) m.castShadow = true;
    g.position.set(0, 1.12, -0.24);
    this.rig.inner.add(g);
    this.game.style.dress(g);
    this.bag = g;
  }

  get shieldUp() {
    return !!this.cfg.shield && this.alive && this.shieldDownT <= 0;
  }

  /** True when a bullet travelling along (dx, dz) meets the raised shield: it comes from within the arc in front. */
  blocks(dx, dz) {
    if (!this.shieldUp) return false;
    const fx = Math.sin(this.facing);
    const fz = Math.cos(this.facing);
    return -(dx * fx + dz * fz) >= Math.cos((this.cfg.shield.arc * Math.PI) / 180);
  }

  dispose() {
    for (const part of [this.shieldMesh, this.vest, this.bag]) {
      for (const m of part ? part.children : []) {
        m.geometry.dispose();
        m.material.dispose();
      }
    }
    this.game.scene.remove(this.rig.root);
    disposeRig(this.rig);
    this.laser.dispose(this.game.scene);
  }

  // ----------------------------------------------------------- damage

  /** A bullet arrives; returns 'blocked' when the shield stopped it. */
  hit(b) {
    if (!this.alive) return undefined;
    const g = this.game;
    if (this.blocks(b.dx, b.dz)) {
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 10, [7, 6, 3], 7);
      g.audio.deflect(g.panFor(this.x));
      return 'blocked';
    }
    const fromPlayer = b.owner === 'player';
    if (fromPlayer && !b.homeRun) this.hp -= b.damage;
    else this.harm(fromPlayer ? b.damage : 3); // a round the pan batted back (HOME RUN), a gunman's stray one: as many as they ever took
    this.flash = 1;
    const knock = b.knock || 1;
    const push = (this.cfg.heavy ? 0.6 : 2.5) * knock;
    this.vx += b.dx * push;
    this.vz += b.dz * push;
    if (this.cfg.fly) g.fx.sparks(this.x, this.y, this.z, -b.dx, -b.dz, 8, [5, 4, 3], 6);
    else g.fx.blood(this.x, 1.3, this.z, b.dx, b.dz, 7);
    g.audio.flesh(g.panFor(this.x));
    if (this.hp <= 0) {
      if (fromPlayer) b.kills = (b.kills || 0) + 1;
      this.die(b.dx, b.dz, {
        cause: fromPlayer ? 'bullet' : 'friendly',
        split: b.split,
        ricochet: b.ricochet,
        bullet: b,
        knock,
        juggle: this.stunT > 0 && (this.stunCause === 'kick' || this.stunCause === 'throw'), // shot while still flying from the player's kick or throw
      });
      return;
    }
    g.hud.hitMarker(false);
    this.flinchT = AI.flinch; // rocked back, so a shot that does not kill shows
    if (!this.cfg.heavy && this.state === 'aim') this.aimT = Math.max(0, this.aimT - 0.22);
  }

  /**
   * Damage that is not the player's bullet (a kick, a throw, a blast, a door, a stray round) made as strong as he is
   * thick (`tough`, config.js ENEMY_HP): it takes as many to kill him as it always did.
   */
  harm(dmg) {
    this.hp -= dmg * this.tough;
    if (this.hp < 1e-6) this.hp = Math.min(0, this.hp); // no sliver left by the rounding of the multiple
  }

  /** Pigeons in the face: the aim breaks off and cannot start again for `t` seconds. */
  blind(t) {
    this.endAim();
    if (this.state === 'aim' || this.state === 'fire') this.state = 'move';
    this.repath = 0;
    this.blindT = t;
    this.fireCd = Math.max(this.fireCd, t);
  }

  kick(dx, dz, power, cause = 'kick', dmg = 1) {
    if (!this.alive) return;
    if (this.perch) {
      // up on a balcony only a thing thrown up at him reaches him: off he goes
      if (cause === 'throw') this.fallOff(dx, dz);
      return;
    }
    if (this.cfg.shield) {
      if (this.shieldDownT <= 0) this.game.notes.log('盾牌手的盾被踢開');
      this.shieldDownT = this.cfg.shield.down;
    }
    if (this.cfg.bomb && cause === 'kick') {
      // his charge goes where the kick sent him, for a while
      const l = Math.hypot(dx, dz) || 1;
      this.dashX = dx / l;
      this.dashZ = dz / l;
      this.turnT = this.cfg.bomb.turned;
      this.game.notes.log('踢中炸彈客，衝刺轉向');
    }
    const heavy = this.cfg.heavy;
    this.stunT = heavy ? 0.35 : 0.85;
    this.stunCause = cause;
    const m = heavy ? 0.3 : 1;
    this.vx = dx * power * m;
    this.vz = dz * power * m;
    this.endAim();
    if (this.state !== 'enter') this.state = this.rushes ? 'chase' : 'move';
    this.repath = 0;
    this.harm(dmg);
    this.flash = 1;
    if (dmg > 0) this.game.fx.blood(this.x, 1.2, this.z, dx, dz, 5); // a shove (the human shield let go) draws none
    if (this.hp <= 0) this.die(dx, dz, { cause });
  }

  /** A mahjong tile hits him (thrown.js throwTiles): dazed for `t` s where he stands, no harm done. */
  daze(t) {
    if (!this.alive || this.aloft) return false;
    this.stunT = Math.max(this.stunT, t);
    this.stunCause = 'tile';
    this.endAim();
    if (this.state !== 'enter') this.state = this.rushes ? 'chase' : 'move';
    return true;
  }

  /** A fishing net falls over him (level.js Net): held where he stands, dazed for `t` s (F executes him). */
  netted(t) {
    if (!this.alive || this.aloft) return;
    this.stunT = Math.max(this.stunT, t);
    this.stunCause = 'net';
    this.netT = t;
    this.vx = this.vz = 0;
    this.endAim();
    if (this.state !== 'enter') this.state = this.rushes ? 'chase' : 'move';
  }

  /**
   * Caught in an explosion; `chain` when a bomber's charges set it off (a kill then is a CHAIN), `rocket` when a kicked
   * LPG cylinder did (ROCKET CAN), `gun` when the player's grenade launcher did (not a kill without a gun: 鑊氣).
   */
  blast(dx, dz, dmg, chain = false, rocket = false, gun = false) {
    if (!this.alive) return;
    if (this.perch) {
      this.fallOff(dx, dz); // a blast shakes him off his balcony, however hard
      return;
    }
    this.harm(dmg);
    this.flash = 1;
    this.vx += dx * 10;
    this.vz += dz * 10;
    if (this.hp <= 0) this.die(dx, dz, { cause: 'explosion', chain, rocket, gun });
    else {
      this.stunT = 0.5;
      this.stunCause = 'blast';
    }
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
    this.vx = dx * power * (this.cfg.fly ? 0.15 : 1); // a drone drops more than it flies
    this.vz = dz * power * (this.cfg.fly ? 0.15 : 1);
    this.corpseSpin = rand(-2.5, 2.5);
    this.rig.root.rotation.y = Math.atan2(-dx, -dz);
    this.rig.mats.accent.emissiveIntensity = 0.12;
    this.rig.ring.visible = false;
    if (this.cfg.fly) g.fx.sparks(this.x, this.y, this.z, dx, dz, 18, [6, 4, 2], 8);
    else {
      g.fx.blood(this.x, 1.2, this.z, dx, dz, 24, 1.3);
      g.fx.decal(this.x + dx * 0.6, this.z + dz * 0.6, rand(0.6, 1), 0.2, 0.01, 0.02);
    }
    this.dropWeapon();
    this.fuseT = -1;
    if (info.cause === 'self') return; // his own fuse: no kill for anyone (goOff follows)
    if (this.cfg.bomb) this.bombT = this.cfg.bomb.delay; // killed: the charges go off a moment later
    g.onEnemyKilled(this, info);
  }

  /** Over the edge into water: gone, whatever he had left. */
  splash() {
    const g = this.game;
    const sp = Math.hypot(this.vx, this.vz) || 1;
    this.hp = 0;
    this.splashed = true;
    g.fx.smokePuff(this.x, 0.2, this.z, 10, 0.6, 0.8, 1.6);
    g.notes.log(`${this.cfg.label} 跌落水`);
    this.die(this.vx / sp, this.vz / sp, { cause: 'splash' });
  }

  /** A drone shot down: it tips and drops, and bursts where it hits the floor. */
  fall(dt) {
    if (this.crashed) return;
    const g = this.game;
    this.vy = (this.vy || 0) - 20 * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.y > 0.25) {
      this.rig.root.position.set(this.x, this.y + g.level.groundY(this.x, this.z), this.z);
      this.rig.inner.rotation.z += dt * 5;
      this.rig.shadow.position.y = -this.y + 0.03;
      return;
    }
    this.crashed = true;
    this.rig.root.visible = false;
    g.notes.log('無人機墜毀');
    g.explode(this.x, this.z, this.cfg.fly.crash, { source: `${this.cfg.label} 墜毀` });
  }

  /** Another living enemy within d m. */
  nearAlly(d) {
    return this.mgr.list.some((o) => o !== this && o.alive && Math.hypot(o.x - this.x, o.z - this.z) < d);
  }

  /** Within reach of the player (or, kicked, of his own people): the vest is lit, he plants himself and beeps. */
  light() {
    const g = this.game;
    this.fuseT = this.cfg.bomb.fuse;
    g.audio.fuse(g.panFor(this.x));
    g.notes.log('炸彈客點火');
  }

  /** The charges go off with a barrel's blast: his fuse ran out (he goes with them), or a moment after he was killed. */
  goOff() {
    const g = this.game;
    if (this.alive) {
      g.notes.log('炸彈客自爆');
      this.die(0, 0, { cause: 'self' });
    }
    this.bombT = -1;
    this.rig.root.visible = false; // nothing left of him
    g.explode(this.x, this.z, this.cfg.bomb.blast, { chain: true, source: '炸彈客爆炸' });
  }

  dropWeapon() {
    if (!this.game.ruleset.drops) return; // a variant: only the pistols
    for (const [kind, chance] of FIREPOWER.drops[this.type] || []) {
      if (this.game.rng.next() >= chance) continue;
      for (const m of this.rig.weaponParts) m.visible = false;
      this.game.pickups.drop(kind, this.x, this.z, FIREPOWER.dropAmmo);
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

  /**
   * A spot to hide behind (tactic 'cover'): by a face of a box of cover that stands between it and
   * the player, walkable, within AI.coverSearch m of him and at a sensible distance from the player,
   * with a place beside it to step out to that sees the player (peekFrom). Null when there is none.
   */
  findCover() {
    const g = this.game;
    const p = g.player;
    const L = g.level;
    const [rmin, rmax] = this.cfg.range;
    const dmin = Math.max(2, rmin * 0.6);
    const dmax = rmax + 3;
    const ideal = (rmin + rmax) / 2;
    const gap = AI.coverGap + this.radius;
    let best = null;
    let bestScore = -Infinity;
    for (const s of L.solids) {
      if (!s.alive || s.poly || s.kind === 'glass' || s.h < AI.coverHeight) continue;
      const w = s.maxX - s.minX;
      const d = s.maxZ - s.minZ;
      if (w > 12 || d > 12) continue; // the walls of the map are not cover to hide behind
      const cx = (s.minX + s.maxX) / 2;
      const cz = (s.minZ + s.maxZ) / 2;
      if (Math.hypot(cx - this.x, cz - this.z) > AI.coverSearch + Math.max(w, d) / 2) continue;
      // the middle of each face, pushed out, and the quarter points of a long one
      const spots = [];
      for (const x of [s.minX - gap, s.maxX + gap]) {
        spots.push([x, cz]);
        if (d > 3) spots.push([x, cz - d / 4], [x, cz + d / 4]);
      }
      for (const z of [s.minZ - gap, s.maxZ + gap]) {
        spots.push([cx, z]);
        if (w > 3) spots.push([cx - w / 4, z], [cx + w / 4, z]);
      }
      for (const [x, z] of spots) {
        if (!L.nav.isWalkable(x, z) || L.hasLOS(x, z, p.x, p.z) || !L.sameLevel(x, z, p.x, p.z)) continue; // cover on the player's level
        const dp = Math.hypot(x - p.x, z - p.z);
        if (dp < dmin || dp > dmax) continue;
        const dm = Math.hypot(x - this.x, z - this.z);
        if (dm > AI.coverSearch) continue;
        let score = -dm * 0.5 - Math.abs(dp - ideal) * 0.15;
        for (const o of this.mgr.list) if (o !== this && o.alive && o.cover && Math.hypot(o.cover.x - x, o.cover.z - z) < 1.5) score -= 4; // one man per spot
        if (score <= bestScore) continue;
        const peek = this.peekFrom(x, z, s, gap);
        if (!peek) continue;
        bestScore = score;
        best = { x, z, peekX: peek.x, peekZ: peek.z, solid: s };
      }
    }
    return best;
  }

  /** Where to step out from a cover spot to see the player: the nearest walkable point around it, or a corner of the cover, with a line of sight. */
  peekFrom(x, z, s, gap) {
    const g = this.game;
    const p = g.player;
    const L = g.level;
    const cands = [];
    for (const r of [1, 1.6, 2.2]) for (let i = 0; i < 8; i++) cands.push([x + Math.sin((i / 8) * TAU) * r, z + Math.cos((i / 8) * TAU) * r]);
    for (const cx of [s.minX - gap, s.maxX + gap]) for (const cz of [s.minZ - gap, s.maxZ + gap]) cands.push([cx, cz]);
    let best = null;
    let bd = Infinity;
    for (const [px, pz] of cands) {
      const d = Math.hypot(px - x, pz - z);
      if (d >= bd || !L.nav.isWalkable(px, pz) || !L.hasLOS(px, pz, p.x, p.z)) continue;
      bd = d;
      best = { x: px, z: pz };
    }
    return best;
  }

  /** The cover still hides him from where the player stands now. */
  coverValid() {
    const c = this.cover;
    if (!c || !c.solid.alive) return false;
    const p = this.game.player;
    return Math.hypot(c.x - p.x, c.z - p.z) > Math.max(2, this.cfg.range[0] * 0.6) - 1 && !this.game.level.hasLOS(c.x, c.z, p.x, p.z);
  }

  pickGoal() {
    if (this.sp.stay) return { x: this.sp.ex, z: this.sp.ez }; // a warm-up enemy keeps its post
    const g = this.game;
    const p = g.player;
    const [rmin, rmax] = this.cfg.range;
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 14; i++) {
      const a = g.rng.range(0, TAU);
      const r = g.rng.range(rmin, rmax);
      const x = p.x + Math.sin(a) * r;
      const z = p.z + Math.cos(a) * r;
      const B = g.level.bounds;
      if (Math.abs(x) > B.halfW - 1 || Math.abs(z) > B.halfD - 1) continue;
      if (!g.level.nav.isWalkable(x, z)) continue;
      // a place on the player's level that sees him; one on another level (大三巴's steps) is no place to fight from
      let score = g.level.sameLevel(x, z, p.x, p.z) ? (g.level.hasLOS(x, z, p.x, p.z) ? 6 : 0) : -10;
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
    this.peekAim = false;
    this.aimT = 0;
    this.losLost = 0;
    this.lead = this.game.rng.range(this.cfg.lead[0], this.cfg.lead[1]);
    const a = this.aimPoint();
    this.aimAngle = turnTowards(this.facing, angleTo(this.x, this.z, a.x, a.z), 0.6);
    this.game.audio.aimWarn(this.game.panFor(this.x));
  }

  /** A grenadier's throw: over any cover, onto where the player stands now. */
  throwGrenade() {
    const g = this.game;
    const p = g.player;
    const m = this.muzzle();
    g.grenades.lob(m.x, m.z, p.x, p.z, this.cfg.lob, this);
    g.audio.toss();
    this.endAim();
    this.state = 'recover';
    this.timer = 0.5;
    this.fireCd = g.rng.range(this.cfg.cooldown[0], this.cfg.cooldown[1]);
  }

  /** For a man on a balcony: his gun's height, and how far a shot drops a metre to come to the player's chest. {} on the street. */
  fromAbove() {
    if (!this.perch) return {};
    const a = this.aimPoint();
    const d = Math.max(1, Math.hypot(a.x - this.x, a.z - this.z));
    return { y: GUN_Y + this.perch, drop: this.perch / d };
  }

  /** Knocked off his balcony (a blast, a thing thrown up at him): down to the street, dead. A kill tagged FALL. */
  fallOff(dx, dz) {
    if (!this.alive) return;
    this.endAim();
    this.hp = 0;
    this.die(dx, dz, { cause: 'fall' });
  }

  shoot() {
    const g = this.game;
    const rng = g.rng;
    const w = WEAPONS[this.cfg.weapon];
    const m = this.muzzle();
    const ox = this.x + Math.sin(this.aimAngle) * 0.35;
    const oz = this.z + Math.cos(this.aimAngle) * 0.35;
    for (let i = 0; i < w.pellets; i++) {
      const a =
        w.pellets > 1 ? this.aimAngle + (i / (w.pellets - 1) - 0.5) * w.spread * 2 + rng.range(-0.03, 0.03) : this.aimAngle + rng.range(-w.spread, w.spread);
      g.bullets.spawn({
        x: ox,
        z: oz,
        dx: Math.sin(a),
        dz: Math.cos(a),
        speed: w.speed * rng.range(0.95, 1.05),
        owner: 'enemy',
        damage: w.dmg,
        range: w.range || 70,
        source: this,
        over: this.over, // a drone's or a balcony's bullets pass over lower cover
        ...this.fromAbove(),
      });
    }
    const my = GUN_Y + this.perch;
    g.fx.muzzle(m.x, my, m.z, Math.sin(this.aimAngle), Math.cos(this.aimAngle), [8, 2.2, 0.8]);
    g.fx.flash(m.x, my + 0.4, m.z, 0xff6040, 14, 0.08, 8);
    g.audio.shot(w.sound, g.panFor(this.x));
    g.level.noise(this.x, this.z, 9);
  }

  update(dt) {
    if (this.dead) {
      if (this.cfg.fly) {
        this.fall(dt);
        return;
      }
      if (this.bombT >= 0) {
        this.bombT -= dt;
        if (this.bombT < 0) this.goOff();
      }
      this.updateCorpse(dt);
      return;
    }
    if (this.fuseT >= 0) {
      // lit: nothing stops it now, a kick only moves where it happens
      this.fuseT -= dt;
      if (this.fuseT < 0) {
        this.goOff();
        return;
      }
    }
    const g = this.game;
    const p = g.player;
    const cfg = this.cfg;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.flinchT = Math.max(0, this.flinchT - dt);
    if (this.held) {
      // a human shield: the player moves him (player.js holdHostage); he neither moves nor aims
      this.moveAmt = 0;
      this.sync();
      this.updateLaser();
      return;
    }
    this.fireCd -= dt;
    this.blindT = Math.max(0, this.blindT - dt);
    this.shieldDownT = Math.max(0, this.shieldDownT - dt);
    this.spawnLock -= dt;
    this.losT -= dt;
    if (this.losT <= 0) {
      this.losT = 0.12;
      // 同一水平: the player on another level (up or down 大三巴's steps) is out of his reach, whatever is between
      this.los = p.alive && g.level.sameLevel(this.x, this.z, p.x, p.z) && g.level.hasLOS(this.x, this.z, p.x, p.z, this.over);
    }
    // in the dark under a lamp shot out (fixtures.js) or in an extinguisher's cloud: no aiming from there
    if (g.level.darkAt(this.x, this.z) || g.level.smokeAt(this.x, this.z)) {
      if (this.state === 'aim' || this.state === 'fire') this.blind(0.3);
      this.fireCd = Math.max(this.fireCd, 0.15);
    }
    const dxp = p.x - this.x;
    const dzp = p.z - this.z;
    const distP = Math.hypot(dxp, dzp) || 0.001;
    let want = [0, 0];
    let face = null;
    let collide = true;

    if (this.netT > 0) this.netT -= dt;
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
          if (this.perch) {
            // out of the building onto his balcony
            collide = false;
            const k = smoothstep(0, 1, this.enterT / AI.perchStep);
            this.x = lerp(this.sp.x, this.sp.ex, k);
            this.z = lerp(this.sp.z, this.sp.ez, k);
            this.vx = this.vz = 0;
            want = null;
            if (this.enterT >= AI.perchStep) this.state = 'move';
            break;
          }
          if (this.rappelT > 0) {
            this.rappelT -= dt;
            this.y = Math.max(0, this.sp.rappel.height * (this.rappelT / this.sp.rappel.drop));
            this.vx = this.vz = 0;
            want = null;
            if (this.rappelT <= 0) this.state = 'move';
            break;
          }
          if (this.enterFrom) {
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
              this.state = this.rushes ? 'chase' : 'move';
            }
            this.vx = this.vz = 0;
            want = null;
          } else {
            const dx = this.sp.ex - this.x;
            const dz = this.sp.ez - this.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.3 || this.enterT > 2) this.state = this.rushes ? 'chase' : 'move';
            else want = [(dx / d) * cfg.speed, (dz / d) * cfg.speed];
          }
          break;
        }
        case 'idle':
          break;
        case 'move': {
          if (cfg.fly) {
            // a drone circles the player over everything, and bursts when it can see him
            if (this.los && this.fireCd <= 0 && distP < cfg.range[1] + 3 && this.mgr.requestToken(this)) {
              this.startAim();
              break;
            }
            const a = Math.atan2(this.x - p.x, this.z - p.z) + this.orbitDir * cfg.fly.orbit;
            const tx = p.x + Math.sin(a) * cfg.fly.radius;
            const tz = p.z + Math.cos(a) * cfg.fly.radius;
            const d = Math.hypot(tx - this.x, tz - this.z) || 1;
            const sp = Math.min(cfg.speed, d * 2);
            want = [((tx - this.x) / d) * sp, ((tz - this.z) / d) * sp];
            face = angleTo(this.x, this.z, p.x, p.z);
            break;
          }
          this.coverRest -= dt;
          if (this.tactic === 'cover' && !this.sp.stay && this.blindT <= 0 && this.coverRest <= 0 && this.mgr.aliveCount > 1) {
            // a gunner with cover near goes there first, ducks, and fights by stepping out (peek); one holding
            // a post keeps it, and the last man standing comes on instead of hiding
            this.coverCheck -= dt;
            if (this.coverCheck <= 0) {
              this.coverCheck = 0.5;
              if (!this.coverValid()) {
                this.cover = this.findCover();
                this.coverShots = 0;
              }
            }
            if (this.cover) {
              const c = this.cover;
              const dx = c.x - this.x;
              const dz = c.z - this.z;
              const dc = Math.hypot(dx, dz);
              if (dc < 0.3) {
                this.state = 'duck';
                this.timer = g.rng.range(AI.duck[0], AI.duck[1]);
                this.path = null;
                if (!this.coverLogged) {
                  this.coverLogged = true;
                  g.notes.log(`${cfg.label} 躲到掩體後`);
                }
                break;
              }
              if (dc < 1.2) {
                // the last step is straight to the spot (a path only reaches the cell it is in)
                const sp = Math.min(cfg.speed, dc * 4 + 0.4);
                want = [(dx / dc) * sp, (dz / dc) * sp];
              } else {
                this.repath -= dt;
                if (this.repath <= 0 || !this.path || this.pathI >= this.path.length) {
                  this.repath = 0.6;
                  this.path = g.level.nav.findPath(this.x, this.z, c.x, c.z);
                  this.pathI = 0;
                }
                want = this.followPath(cfg.speed);
              }
              if (this.los) face = angleTo(this.x, this.z, p.x, p.z);
              break;
            }
          }
          // a grenadier throws over cover: he needs the distance and the player on his level, not a line of sight; a man
          // up on a balcony (a test's) cannot come closer, so he fires at whatever distance he sees the player
          const inReach = cfg.lob
            ? distP < cfg.range[1] + 3 && distP > cfg.lob.radius + 1 && g.level.sameLevel(this.x, this.z, p.x, p.z)
            : this.los && (distP < cfg.range[1] + 3 || this.perch > 0);
          if (inReach && this.fireCd <= 0 && this.mgr.requestToken(this)) {
            this.startAim();
            break;
          }
          this.repath -= dt;
          if (this.repath <= 0 || !this.path || this.pathI >= this.path.length) {
            this.repath = g.rng.range(1.4, 2.6);
            const goal = this.pickGoal();
            this.path = g.level.nav.findPath(this.x, this.z, goal.x, goal.z);
            this.pathI = 0;
          }
          want = this.followPath(cfg.speed);
          if (this.los) face = angleTo(this.x, this.z, p.x, p.z);
          if (this.los && cfg.reload) want = [0, 0]; // a sniper who can see the player stands his ground
          break;
        }
        case 'duck': {
          // hidden: still behind the cover until it is time to step out, unless the cover stopped working
          this.timer -= dt;
          want = [0, 0];
          face = angleTo(this.x, this.z, p.x, p.z);
          if (!this.coverValid() || distP < AI.flankClose || this.mgr.aliveCount <= 1) {
            this.cover = null;
            this.state = 'move';
            this.repath = 0;
            break;
          }
          if (this.timer <= 0 && this.fireCd <= 0 && distP < cfg.range[1] + 3 && g.level.sameLevel(this.x, this.z, p.x, p.z) && this.mgr.requestToken(this)) {
            // the aim happens behind the cover (its laser shows on the box: the warning); he steps out to fire
            this.startAim();
            this.peekAim = true;
          }
          break;
        }
        case 'peek': {
          // aimed and stepping out beside the cover: fire the moment the player is in sight, else give the spot up
          this.timer -= dt;
          const c = this.cover;
          face = this.aimAngle;
          if (c && this.los) {
            const w = WEAPONS[cfg.weapon];
            this.aimAngle = angleTo(this.x, this.z, this.aimPoint().x, this.aimPoint().z);
            this.coverShots++;
            this.state = 'fire';
            this.burst = w.shots;
            this.burstT = 0;
            want = [0, 0];
            break;
          }
          if (c) {
            const dx = c.peekX - this.x;
            const dz = c.peekZ - this.z;
            const d = Math.hypot(dx, dz);
            const sp = Math.min(cfg.speed, d * 4 + 0.4);
            want = d > 0.05 ? [(dx / d) * sp, (dz / d) * sp] : [0, 0];
          }
          if (!c || this.timer <= 0) {
            this.endAim();
            this.state = 'move';
            this.coverCheck = 0;
            this.cover = null; // the spot showed nothing: find another
            this.repath = 0;
          }
          break;
        }
        case 'aim': {
          this.aimT += dt;
          const a = this.aimPoint();
          this.aimAngle = turnTowards(this.aimAngle, angleTo(this.x, this.z, a.x, a.z), cfg.turn * dt);
          face = this.aimAngle;
          if (!this.los && !cfg.lob && !this.peekAim) {
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
          if (this.aimT >= this.aimTime && cfg.lob) {
            this.throwGrenade();
            break;
          }
          if (this.aimT >= this.aimTime && this.peekAim) {
            this.peekAim = false;
            this.state = 'peek';
            this.timer = AI.peekTimeout;
            break;
          }
          if (this.aimT >= this.aimTime) {
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
            this.timer = cfg.reload || (this.cover ? AI.peek : 0.35); // a sniper's reload: rifle down, the window to get him; a cover gunner's moment out
            this.fireCd = g.rng.range(cfg.cooldown[0], cfg.cooldown[1]);
          }
          break;
        }
        case 'recover':
          this.timer -= dt;
          face = this.aimAngle;
          if (this.timer <= 0) {
            this.state = this.rushes ? 'chase' : 'move';
            this.repath = 0;
            if (this.cover && this.coverShots >= AI.peeks) {
              // enough from this spot: leave it and come on for a while
              this.cover = null;
              this.coverShots = 0;
              this.coverRest = AI.rest;
            }
          }
          break;
        case 'chase': {
          this.repath -= dt;
          const bomb = cfg.bomb;
          if (bomb && this.fuseT >= 0) {
            want = [0, 0];
            break;
          }
          if (bomb && this.turnT > 0) {
            this.turnT -= dt;
            want = [this.dashX * cfg.speed, this.dashZ * cfg.speed];
          } else if (this.tactic === 'flank' && distP > AI.flankClose && this.mgr.hasPartner(this)) {
            // two of them split up: each closes in along an arc on his own side, so they arrive from two directions
            const b = Math.atan2(this.x - p.x, this.z - p.z) + (this.flankSide * AI.flankAngle * Math.PI) / 180;
            const r = clamp(distP * AI.flankSwing, 1.2, 7);
            const tx = p.x + Math.sin(b) * r;
            const tz = p.z + Math.cos(b) * r;
            const dx = tx - this.x;
            const dz = tz - this.z;
            const d = Math.hypot(dx, dz) || 1;
            if (g.level.nav.lineWalkable(this.x, this.z, tx, tz)) want = [(dx / d) * cfg.speed, (dz / d) * cfg.speed];
            else {
              if (this.repath <= 0 || !this.path) {
                this.repath = 0.45;
                const i = g.level.nav.nearestOpen(tx, tz);
                this.path = g.level.nav.findPath(this.x, this.z, i >= 0 ? g.level.nav.centerX(i) : p.x, i >= 0 ? g.level.nav.centerZ(i) : p.z);
                this.pathI = 0;
              }
              want = this.followPath(cfg.speed);
            }
          } else if (this.los && g.level.nav.lineWalkable(this.x, this.z, p.x, p.z)) {
            want = [(dxp / distP) * cfg.speed, (dzp / distP) * cfg.speed];
          } else {
            if (this.repath <= 0 || !this.path) {
              this.repath = 0.45;
              this.path = g.level.nav.findPath(this.x, this.z, p.x, p.z);
              this.pathI = 0;
            }
            want = this.followPath(cfg.speed);
          }
          if (bomb) {
            if (distP < bomb.reach) this.light();
            break;
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
            if (p.hurt(30, dxp / distP, dzp / distP, false, `${this.cfg.label} 近身`)) g.shake(0.4);
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

    if (this.perch) {
      // up on his balcony he never moves from it, and nothing on the street is in his way
      want = null;
      this.vx = this.vz = 0;
      collide = false;
      if (this.state !== 'enter') {
        this.x = this.sp.ex;
        this.z = this.sp.ez;
      }
    }
    if (want) {
      this.vx = damp(this.vx, want[0], 10, dt);
      this.vz = damp(this.vz, want[1], 10, dt);
    }
    if (this.state !== 'enter' || !this.enterFrom) {
      this.x += this.vx * dt;
      this.z += this.vz * dt;
    }
    // knocked over and flying at water (the harbour's edge, the fountain's rim): in he goes
    if (this.stunT > 0 && !cfg.fly && g.level.water.length) {
      const sp = Math.hypot(this.vx, this.vz);
      if (sp >= ENV.splashSpeed && g.level.waterAt(this.x + (this.vx / sp) * (this.radius + ENV.splashReach), this.z + (this.vz / sp) * (this.radius + ENV.splashReach))) {
        this.splash();
        return;
      }
    }
    if (cfg.fly) {
      // in the air: no walls, only the edge of the map
      const B = g.level.bounds;
      this.x = clamp(this.x, -B.halfW + 1, B.halfW - 1);
      this.z = clamp(this.z, -B.halfD + 1, B.halfD - 1);
    } else if (collide) {
      this.pushProps();
      if (this.state !== 'enter') g.level.openDoorsFor(this); // a closed door in his way opens
      // a kicked bomber charging into a wall gives up the turn and comes for the player again
      if (g.level.collideCircle(this, this.radius) && this.turnT > 0 && this.stunT <= 0) this.turnT = 0;
    }
    // kicked into his own people: he lights up among them
    if (cfg.bomb && this.turnT > 0 && this.fuseT < 0 && this.nearAlly(cfg.bomb.reach)) this.light();

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
      if (o === this || !o.alive || o.stunT > 0 || o.aloft || o.held) continue;
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
      if (!p.alive || p.carried || p.fixed) continue;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const rr = this.radius + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = rr - d;
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      if (p.knock && p.knock(this)) continue; // a rolling trolley or barrel bowls him over and rolls on (level.js)
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 6 && this.stunT <= 0 && !p.thrown) {
        // a kicked barrel or pan bowls the enemy over (a thrown one is thrown.js's business)
        this.kick(p.vx / sp, p.vz / sp, sp * 0.6, 'strike');
        p.vx *= 0.3;
        p.vz *= 0.3;
      }
    }
  }

  sync() {
    const r = this.rig;
    r.root.position.set(this.x, this.y + this.game.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    setFlash(r, this.flash * 2.5);
    r.ring.material.color.setRGB(this.aiming || this.fuseT >= 0 ? 1.6 : 0.35, 0.05, 0.08);
    if (r.drone) {
      // looks only: the rotors spin and it leans into its flight
      r.rotors.rotation.y = this.game.worldTime * 40;
      if (this.game.style.poseDue(r, this.game.worldTime + this.idleOffset)) r.inner.rotation.x = clamp(Math.hypot(this.vx, this.vz) * 0.05, 0, 0.3);
      return;
    }
    if (this.lamp) {
      // the vest's lamp: a slow blink, fast once lit
      const lit = this.fuseT >= 0;
      const on = Math.sin(this.game.worldTime * (lit ? 80 : 12)) > 0;
      this.lamp.material.emissiveIntensity = on ? (lit ? 5 : 1.6) : 0.15;
      if (lit && on) setFlash(r, 1.2);
    }
    if (!this.game.style.poseDue(r, this.game.worldTime + this.idleOffset)) return; // the pose holds between the style's steps
    animateRig(r, this.phase, this.moveAmt, Math.atan2(this.vx, this.vz));
    keyPose(r, this.flinchT > 0 ? 'flinch' : null, this.flinchT / AI.flinch); // rocked back by a shot, fading
    if (this.shieldMesh) {
      // kicked aside: the shield swings down and out
      const down = this.shieldDownT > 0;
      this.shieldMesh.rotation.set(down ? 1.1 : 0, down ? 0.9 : 0, 0);
      this.shieldMesh.position.set(down ? 0.35 : 0.1, down ? 0.55 : 0.95, down ? 0.2 : 0.42);
    }
    if (this.cfg.weapon === 'blade') {
      const raise = this.state === 'windup' ? -1.6 : this.state === 'strike' ? 0.9 : 0.5;
      r.armR.rotation.x = damp(r.armR.rotation.x, raise, 25, 1 / LOGIC_HZ); // once per logic step
    }
    finishRig(r, this.game.worldTime + this.idleOffset);
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
    const hit = g.level.raycast(m.x, m.z, m.x + dx * 40, m.z + dz * 40, true, this.cfg.fly ? 0 : this.over, false);
    let len = hit ? hit.t * 40 : 40;
    const k = this.state === 'fire' ? 1 : clamp(this.aimT / this.aimTime, 0, 1);
    let intensity = 0.35 + k * k * 2.8;
    if (k > 0.78 && this.state === 'aim') intensity *= Math.sin(performance.now() * 0.06) > 0 ? 1.7 : 0.5;
    // from a balcony the line comes down from his gun through the player's chest, and stops at the floor; up a flight
    // of steps it runs level at his gun's height there
    const { y, drop } = this.fromAbove();
    const y0 = (y ?? GUN_Y) + g.level.groundY(this.x, this.z);
    if (drop) len = Math.min(len, y0 / drop);
    this.laser.set(m.x, m.z, m.x + dx * len, m.z + dz * len, 0.035 + k * 0.05, intensity, y0, y0 - (drop || 0) * len);
  }

  updateCorpse(dt) {
    this.corpseT += dt;
    const f = Math.exp(-3.2 * dt);
    this.vx *= f;
    this.vz *= f;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    if (this.splashed) {
      // into the water: through the rim, under the surface, and gone
      this.y -= dt * 2.5;
      if (this.y < -2 && this.rig.root.visible) this.rig.root.visible = false;
    } else if (this.game.level.collideCircle(this, 0.4)) {
      this.vx *= 0.4;
      this.vz *= 0.4;
    }
    if (!this.splashed) this.y = Math.max(0, this.y - dt * 6);
    const r = this.rig;
    r.root.rotation.y += this.corpseSpin * dt * clamp(Math.hypot(this.vx, this.vz) / 5, 0, 1);
    r.root.position.set(this.x, this.y + this.game.level.groundY(this.x, this.z), this.z);
    setFlash(r, Math.max(0, 1 - this.corpseT * 4) * 2);
    if (this.game.style.poseDue(r, this.game.worldTime + this.idleOffset)) {
      const k = clamp(this.corpseT / 0.4, 0, 1);
      const clip = deathPose(r, this.corpseT);
      if (!clip) {
        r.inner.rotation.x = -Math.PI / 2 * (1 - (1 - k) * (1 - k));
        r.inner.position.y = 0.12 * this.rig.scale * k;
      }
      animateRig(r, 0, 0);
      if (!clip) finishRig(r, this.idleOffset);
    }
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
    this.flankSeq = 0; // flankers spawned so far: they take the two sides in turn
  }

  /** Another living flanker for `e` to split up with. */
  hasPartner(e) {
    return this.list.some((o) => o !== e && o.alive && o.tactic === 'flank');
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

  /** Take a live enemy away without a death (the warm-up ending early). */
  remove(e) {
    e.endAim();
    e.alive = false;
    this.list = this.list.filter((x) => x !== e);
    this.game.fx.ring(e.x, e.z, 1.2, 0.4, 0xff3355, 2);
    e.dispose();
  }

  clear() {
    for (const e of this.list) e.dispose();
    for (const e of this.corpses) e.dispose();
    this.list = [];
    this.corpses = [];
    this.tokens = 0;
    this.flankSeq = 0;
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

  /** Up to n alive, visible enemies within maxD, nearest first. */
  nearestVisibleN(x, z, maxD, n) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive || e.spawnLock > 0) continue;
      const d = (e.x - x) ** 2 + (e.z - z) ** 2;
      if (d < maxD * maxD && this.game.level.hasLOS(x, z, e.x, e.z)) out.push({ e, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, n).map((o) => o.e);
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
      if (!a.alive || a.held || (a.state === 'enter' && a.sp.climb)) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || b.held || (b.state === 'enter' && b.sp.climb) || ((a.aloft || b.aloft) && a.over !== b.over)) continue; // a drone, a man on a balcony: no one on the street to bump (men up and down the steps do); the human shield is held
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
