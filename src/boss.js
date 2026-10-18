// The last wave's boss (頭目). When an arcade run ends on a map with a boss (maps.js `boss`,
// whose `kind` is one of BOSSES), its final wave is that boss instead of the big last wave.
// What every boss shares is in Boss: segments of health on the HUD bar, a HIT banner for each,
// and once it is down the BOSS bonus, the run's clip and the end of the wave (`downed`). Each
// kind brings its own moves. game.boss always stands for the boss of the moment
// (Bosses.view), so a test reads its fields whatever its kind.
//
// heli, the rooftop helicopter (頭目 ①②): it flies in from off the map and circles over the helipad, HELI.altitude m up, out of reach of
// bullets. Its searchlight sweeps the roof and follows a player it comes near; a player who
// stays in the light for light.lockAfter s draws a red line onto that spot for light.warn s and
// then a machine-gun burst there. Every rappel.every s two thugs rope down onto the pad.
// Only a blast right under it hurts it (頭目 ②): a thrown barrel (one that flies under it goes off
// there) or a grenade going off within hit.radius m of where it is over the roof takes one
// segment, and it reels for hit.reel s without firing. The fifth brings it down: it falls onto the
// pad and bursts (crash.radius m: get clear), the BOSS bonus is paid and the run is cleared.
// dj, the club's DJ (夜店頭目): behind bulletproof glass round the booth, out of reach. The
// dance floor works to the beat (DJ.beat s of world time, so bullet time slows it too): a
// pattern of tiles lights up red for DJ.floor.warn beats, then zaps whoever stands on a lit
// tile (a spin rides it out). The speakers by the booth are the way in: blow one (shots, or a
// blast next to it) and the glass slides down for DJ.open s; DJ.perSegment hits on the DJ then
// take a segment and the glass comes straight back up. A blown speaker is back after a while.
// Thugs come in through the doors every DJ.crew.every s. Shots fly over the booth while the DJ
// is on (`pass`, bullets.js), at the glass or the DJ.
//
// Logic: a boss runs in the fixed steps on game.rng and the world, and resets with the run.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BODY, buildCharacter, disposeRig, setFlash } from './characters.js';
import { GUN_Y } from './config.js';
import { addCutaway } from './cutaway.js';
import { Laser } from './fx.js';
import { clamp, lerp, segCircle, smoothstep } from './utils.js';

export const HELI = {
  label: 'HELICOPTER', // the HUD bar's English name; names its bullets in the notes, as an enemy's label does
  name: '天台直升機',
  short: '直升機', // in the banners and the notes
  downed: '擊落', // what bringing it down is called
  pull: true, // the camera pulls back and leans towards it (main.js, CAMERA.bossPull)
  altitude: 8, // m over the roof: no bullet reaches it
  enter: 3.5, // s to fly in from off the map
  orbit: { radius: 2.5, speed: 0.35 }, // m and rad/s, circling the pad
  // the searchlight: `radius` m across, sweeping at `sweep` m/s and following a player within
  // `notice` m at `chase` m/s; `lockAfter` s in it and the gun takes that spot, `warn` s later it
  // fires; then `cool` s before it looks again
  light: { radius: 2.2, sweep: 3.4, chase: 2.6, notice: 7, lockAfter: 1, warn: 0.5, cool: 1.8 },
  // the burst: `shots` rounds `interval` s apart at `speed` m/s for `dmg`, scattered `spread` m
  // around the spot, each coming in from `from` m short of it (fired from above: over all cover)
  gun: { shots: 12, interval: 0.06, speed: 34, dmg: 8, spread: 1.2, from: 3 },
  // `count` thugs rope down onto the pad `first` s in and every `every` s after, `drop` s on the rope, while fewer than `maxAlive` are about
  rappel: { first: 5, every: 20, count: 2, drop: 1.4, maxAlive: 6 },
  segments: 5, // its health bar
  // what hurts it: a blast of one of `kinds` within `radius` m of where it is over the roof; it then reels `reel` s without firing
  hit: { radius: 3, kinds: ['barrel', 'grenade'], reel: 3 },
  crash: { fall: 2.4, radius: 5.5 }, // brought down: s falling onto the pad, and the blast there
  bonus: 2000, // BOSS: score for bringing it down
};

export const DJ = {
  label: 'CLUB DJ',
  name: '夜店 DJ',
  short: 'DJ',
  downed: '擊倒',
  pull: false, // in the picture already: the camera stays on the player
  segments: 5,
  bonus: 2000,
  beat: 0.5, // world s per beat (120 BPM)
  // the dance floor: from beat `first`, every `every` beats a pattern of tiles lights up for `warn` beats, then zaps
  // for `zap` s: `dmg` to a player on a lit tile
  floor: { first: 6, every: 6, warn: 2, zap: 0.3, dmg: 18 },
  radius: 0.45, // the DJ, for shots
  shield: { radius: 2.2, height: 2.6, drop: 0.35 }, // the glass round the booth: m, and s to slide down or back up
  speaker: { hp: 10, back: 14, blast: 2.6, blastHits: 5 }, // hits to blow one, s until it is back; a blast within `blast` m counts as `blastHits`
  open: 4, // s the glass stays down after a speaker blows
  perSegment: 3, // hits on the DJ while the glass is down that take a segment (and bring the glass back up)
  crew: { first: 6, every: 16, count: 2, maxAlive: 6 }, // thugs through the doors: s in, then every s, while fewer than maxAlive are about
};

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** What every boss shares: its health in segments, the HIT banner, and the end (bonus, clip, the wave's end). No boss at all is a plain Boss. */
export class Boss {
  constructor(game, cfg = { label: '', name: '', short: '', downed: '', pull: false, segments: 0, bonus: 0 }) {
    this.game = game;
    this.cfg = cfg; // its numbers; cfg.label names the bullets that hit the player, as an enemy's does
    this.active = false;
    this.downed = false;
    this.hp = 0;
    this.x = this.z = 0;
    this.pass = null; // a solid player shots fly over while this boss is on (bullets.js)
  }

  /** The final wave: `def` is the map's (maps.js `boss`). */
  start(def) {
    this.def = def;
    this.active = true;
    this.downed = false;
    this.hp = this.cfg.segments;
    this.t = 0;
    this.game.notes.log(`頭目：${this.cfg.name}`);
  }

  reset() {
    this.active = false;
    this.downed = false;
    this.hp = 0;
  }

  update() {}

  /** A blast at (x, z) (main.js explode): whether it hurts depends on the kind. */
  blast() {}

  /** Whether (x, z) is where a blast would hurt it (a thrown barrel goes off there: thrown.js). */
  under() {
    return false;
  }

  /** Where a player shot from (x0, z0) to (x1, z1) first meets a part of it: { t, part }, or null. */
  shotAt() {
    return null;
  }

  /** A player shot met `part`; true if that stops it. */
  shot() {
    return true;
  }

  /** A player shot hit a level solid (bullets.js), in case it is one of the boss's. */
  shotSolid() {}

  /** One segment off; the last brings it down (goDown). */
  hurt() {
    const g = this.game;
    const c = this.cfg;
    this.hp--;
    g.notes.log(`${c.short}中彈（剩 ${this.hp} 段）`);
    if (this.hp <= 0) this.goDown();
    else g.hud.banner('HIT', `${c.short} · 剩 ${this.hp} 段`, 'clear');
  }

  goDown() {
    this.finish();
  }

  /** Down for good: the BOSS bonus, the run's clip, and the wave can end. */
  finish() {
    const g = this.game;
    const c = this.cfg;
    this.active = false;
    this.downed = true;
    g.score.bonus('BOSS', c.bonus);
    g.clip.kill(Number.MAX_SAFE_INTEGER); // the boss going down is the run's clip, whatever else it had
    g.notes.log(`${c.downed}${c.short}：BOSS +${c.bonus}`);
  }
}

/** The rooftop helicopter. */
class Heli extends Boss {
  constructor(game) {
    super(game, HELI);
    this.root = null;
    this.laser = new Laser(game.scene, new THREE.Color(1, 0.05, 0.05));
    this.reset();
  }

  /** Back to nothing: no boss on the roof (a new run, a restart, the title). */
  reset() {
    if (this.root) {
      this.game.scene.remove(this.root, this.cone, this.spotMesh, this.ropes, this.crashRing);
      for (const o of [this.root, this.cone, this.spotMesh, this.ropes, this.crashRing]) {
        o.traverse((m) => {
          if (m.geometry) m.geometry.dispose();
        });
      }
    }
    this.root = null;
    super.reset();
    this.laser.hide();
    this.climbers = [];
  }

  /** The final wave on the rooftop: `def` is the map's (maps.js `boss`: its pad and where it flies in from). */
  start(def) {
    this.reset();
    super.start(def);
    this.theta = 0;
    const [px, pz] = def.pad;
    this.pad = { x: px, z: pz };
    this.from = { x: def.from[0], z: def.from[1] };
    this.x = this.from.x;
    this.z = this.from.z;
    this.facing = 0;
    this.spot = { x: px, z: pz };
    this.state = 'search'; // search, warn, fire, cool
    this.litT = 0;
    this.timer = 0;
    this.lock = null;
    this.shots = 0;
    this.rappelT = HELI.rappel.first;
    this.reelT = 0;
    this.fallT = -1;
    this.build();
  }

  /** The look: a block helicopter, its rotor, the searchlight's cone and spot, the ropes. */
  build() {
    const g = this.game;
    const L = g.level;
    const std = (color, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...extra });
      addCutaway(m, L.cut); // it can be between the camera and the player
      return m;
    };
    const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const root = new THREE.Group();
    const hull = new THREE.Mesh(
      mergeGeometries([
        box(1.9, 1.5, 3.6), // cabin
        box(0.45, 0.45, 3.6, 0, 0.35, -3.4), // tail boom
        box(0.12, 1.1, 0.8, 0, 0.8, -5), // fin
        box(0.12, 0.12, 3.2, 0.85, -1.05, 0.1), // skids
        box(0.12, 0.12, 3.2, -0.85, -1.05, 0.1),
        box(0.5, 0.5, 0.6, 0, -0.55, 1.75), // the searchlight's housing
      ]),
      std(0x2a2d36),
    );
    const glass = new THREE.Mesh(box(1.7, 0.8, 1.2, 0, 0.2, 1.45), std(0x5fd0ff, { emissive: 0x2a8fff, emissiveIntensity: 0.6, roughness: 0.15 }));
    const rotor = new THREE.Mesh(mergeGeometries([box(9, 0.05, 0.3), box(0.3, 0.05, 9)]).translate(0, 0.95, 0), std(0x15161a));
    const tail = new THREE.Mesh(box(0.06, 1.3, 0.2).translate(0.12, 0.8, -5), std(0x15161a));
    root.add(hull, glass, rotor, tail);
    root.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    g.style.retone(root, 'char', L.cut);
    g.style.outline(root, 'char');
    this.rotor = rotor;
    // the light: a pale cone down to a bright disc on the roof
    this.cone = new THREE.Mesh(
      new THREE.ConeGeometry(HELI.light.radius, 1, 24, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.spotMesh = new THREE.Mesh(
      new THREE.CircleGeometry(HELI.light.radius, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.45, 1.1), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ropes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 4), 3)), new THREE.LineBasicMaterial({ color: 0xc8c8c8 }));
    this.ropes.frustumCulled = false;
    // where it will come down, once it is falling: a red ring of the crash's blast on the pad
    this.crashRing = new THREE.Mesh(
      new THREE.RingGeometry(HELI.crash.radius - 0.15, HELI.crash.radius, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.2, 0.2), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.crashRing.visible = false;
    this.root = root;
    g.scene.add(root, this.cone, this.spotMesh, this.ropes, this.crashRing);
    this.sync();
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const p = g.player;
    this.t += dt;
    if (this.fallT >= 0) {
      this.updateFall(dt);
      return;
    }
    if (this.reelT > 0) this.reelT -= dt;
    // flying in, then circling the pad
    if (this.t < HELI.enter) {
      const k = smoothstep(0, 1, this.t / HELI.enter);
      this.x = lerp(this.from.x, this.pad.x, k);
      this.z = lerp(this.from.z, this.pad.z + HELI.orbit.radius, k);
    } else {
      this.theta += HELI.orbit.speed * dt;
      this.x = this.pad.x + Math.sin(this.theta) * HELI.orbit.radius;
      this.z = this.pad.z + Math.cos(this.theta) * HELI.orbit.radius;
    }
    this.facing = Math.atan2(p.x - this.x, p.z - this.z);
    this.updateLight(dt);
    this.updateRappel(dt);
    this.sync();
  }

  updateLight(dt) {
    const g = this.game;
    const p = g.player;
    const L = HELI.light;
    const s = this.spot;
    if (this.t < HELI.enter) {
      // the light comes in with it
      s.x = this.x;
      s.z = this.z + 2;
      return;
    }
    if (this.state === 'search' || this.state === 'cool') {
      // follow a player it comes near, else sweep the roof
      const near = p.alive && Math.hypot(p.x - s.x, p.z - s.z) < L.notice;
      const B = g.level.bounds;
      const tx = near ? p.x : Math.sin(this.t * 0.23) * B.halfW * 0.7;
      const tz = near ? p.z : Math.sin(this.t * 0.31 + 1) * B.halfD * 0.7;
      const d = Math.hypot(tx - s.x, tz - s.z);
      const step = Math.min(d, (near ? L.chase : L.sweep) * dt);
      if (d > 1e-6) {
        s.x += ((tx - s.x) / d) * step;
        s.z += ((tz - s.z) / d) * step;
      }
    }
    // reeling from a hit: no locking on, no firing
    const lit = p.alive && Math.hypot(p.x - s.x, p.z - s.z) < L.radius && this.reelT <= 0;
    switch (this.state) {
      case 'search':
        this.litT = lit ? this.litT + dt : 0;
        if (this.litT >= L.lockAfter) {
          // caught: the gun takes the spot where the player stands, with a red line
          this.state = 'warn';
          this.timer = L.warn;
          this.lock = { x: p.x, z: p.z };
          s.x = p.x;
          s.z = p.z;
          g.audio.aimWarn(g.panFor(p.x));
          g.notes.log('直升機的探照燈鎖定你');
        }
        break;
      case 'warn':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'fire';
          this.shots = HELI.gun.shots;
          this.timer = 0;
        }
        break;
      case 'fire':
        this.timer -= dt;
        while (this.timer <= 0 && this.shots > 0) {
          this.fire();
          this.shots--;
          this.timer += HELI.gun.interval;
        }
        if (this.shots <= 0) {
          this.state = 'cool';
          this.timer = L.cool;
          this.litT = 0;
        }
        break;
      case 'cool':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'search';
        break;
    }
  }

  /** One round of the burst: onto the locked spot, scattered, coming in from the helicopter's side over all cover. */
  fire() {
    const g = this.game;
    const G = HELI.gun;
    const rng = g.rng;
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * G.spread;
    const tx = this.lock.x + Math.sin(a) * r;
    const tz = this.lock.z + Math.cos(a) * r;
    let dx = tx - this.x;
    let dz = tz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // the source is the boss as the game sees it (game.boss): its label names the bullets that hit
    g.bullets.spawn({ x: tx - dx * G.from, z: tz - dz * G.from, dx, dz, speed: G.speed, owner: 'enemy', damage: G.dmg, range: G.from + 1.5, source: g.boss, over: HELI.altitude });
    g.audio.shot('minigun', g.panFor(this.x));
  }

  /** Whether (x, z) is right under it, where a blast hurts it. */
  under(x, z) {
    return this.active && this.fallT < 0 && this.t >= HELI.enter && Math.hypot(x - this.x, z - this.z) <= HELI.hit.radius;
  }

  /** A blast at (x, z) (main.js explode, `opts.kind` what went off): right under it, a barrel or a grenade takes a segment. */
  blast(x, z, opts = {}) {
    if (!this.under(x, z) || !HELI.hit.kinds.includes(opts.kind) || this.reelT > 0) return;
    const g = this.game;
    this.reelT = HELI.hit.reel;
    this.state = 'search';
    this.litT = 0;
    this.lock = null;
    g.shake(0.5);
    g.hitstop(0.08);
    g.audio.explosion(g.panFor(this.x));
    this.hurt();
  }

  /** The last segment: it falls onto the pad, the ring shows where. */
  goDown() {
    const g = this.game;
    this.fallT = 0;
    this.fallFrom = { x: this.x, z: this.z };
    this.state = 'down';
    this.crashRing.position.set(this.pad.x, 0.05, this.pad.z);
    this.crashRing.visible = true;
    g.notes.log('直升機被擊落');
    g.hud.banner('BOSS DOWN', '快離開停機坪！', 'clear');
  }

  updateFall(dt) {
    const g = this.game;
    const C = HELI.crash;
    this.fallT += dt;
    const k = Math.min(1, this.fallT / C.fall);
    this.x = lerp(this.fallFrom.x, this.pad.x, k);
    this.z = lerp(this.fallFrom.z, this.pad.z, k);
    this.y = HELI.altitude * (1 - k * k);
    this.facing += dt * (2 + 6 * k); // spinning down
    this.climbers = [];
    if (k < 1) {
      this.sync();
      return;
    }
    // down: the blast, then the bonus, the clip, the end of the wave
    this.root.visible = this.cone.visible = this.spotMesh.visible = this.crashRing.visible = false;
    this.laser.hide();
    g.explode(this.pad.x, this.pad.z, C.radius, { source: '墜毀的直升機', kind: 'heli' });
    this.finish();
  }

  /** Every so often two thugs rope down onto the pad. */
  updateRappel(dt) {
    const g = this.game;
    const R = HELI.rappel;
    this.climbers = this.climbers.filter((e) => e.alive && e.rappelT > 0);
    if (this.t < HELI.enter) return;
    this.rappelT -= dt;
    if (this.rappelT > 0) return;
    this.rappelT = R.every;
    if (g.enemies.aliveCount + R.count > R.maxAlive) return;
    for (let i = 0; i < R.count; i++) {
      const x = this.x + (i - (R.count - 1) / 2) * 1.6;
      const z = this.z;
      this.climbers.push(g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, rappel: { height: HELI.altitude - 1, drop: R.drop } }));
    }
    g.notes.log(`直升機放下 ${R.count} 個打手`);
  }

  /** Where everything is drawn; the laser and ropes are only looks. */
  sync() {
    const y = this.fallT >= 0 ? this.y : HELI.altitude;
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.facing;
    // a hit makes it reel (looks only)
    this.root.rotation.z = this.reelT > 0 ? Math.sin(this.t * 14) * 0.25 * (this.reelT / HELI.hit.reel) : 0;
    this.rotor.rotation.y = this.t * 28;
    // the light: from under the nose to the spot
    _a.set(this.x, y - 0.6, this.z);
    _b.set(this.spot.x, 0.05, this.spot.z);
    this.spotMesh.position.copy(_b);
    const red = this.state === 'warn' || this.state === 'fire';
    this.spotMesh.material.color.setRGB(red ? 2.4 : 1.6, red ? 0.25 : 1.45, red ? 0.2 : 1.1);
    this.cone.position.copy(_a);
    const dir = _b.sub(_a);
    const len = dir.length();
    this.cone.scale.set(1, len, 1);
    this.cone.quaternion.setFromUnitVectors(UP, dir.normalize().negate());
    if (red && this.lock) this.laser.set(this.x, this.z, this.lock.x, this.lock.z, 0.06, this.state === 'warn' ? 1.5 + 2 * clamp(1 - this.timer / HELI.light.warn, 0, 1) : 3, GUN_Y);
    else this.laser.hide();
    // the ropes of the thugs still coming down
    const pos = this.ropes.geometry.attributes.position;
    for (let i = 0; i < 4; i++) {
      const e = this.climbers[i];
      pos.setXYZ(i * 2, e ? e.x : 0, e ? y - 0.8 : -50, e ? e.z : 0);
      pos.setXYZ(i * 2 + 1, e ? e.x : 0, e ? e.y + 1.7 : -50, e ? e.z : 0);
    }
    pos.needsUpdate = true;
  }
}

/** The club's DJ. */
class Dj extends Boss {
  constructor(game) {
    super(game, DJ);
    this.rig = null;
    this.reset();
  }

  reset() {
    if (this.rig) {
      const g = this.game;
      g.scene.remove(this.rig.root, this.glass, this.tiles, ...this.leds);
      disposeRig(this.rig);
      for (const o of [this.glass, this.tiles, ...this.leds]) {
        o.geometry.dispose();
        o.material.dispose();
      }
      this.rig = null;
    }
    super.reset();
    this.game.level.floorTaken = false;
    this.pass = null;
    this.speakers = [];
    this.lit = null;
    this.state = 'idle';
  }

  /** The final wave in the club: `def` is the map's (maps.js `boss`: where the DJ stands, the booth, the speakers, the dance floor). */
  start(def) {
    this.reset();
    super.start(def);
    const g = this.game;
    const L = g.level;
    [this.x, this.z] = def.at;
    const at = (x, z) => L.solids.find((s) => s.alive && Math.abs((s.minX + s.maxX) / 2 - x) < 0.05 && Math.abs((s.minZ + s.maxZ) / 2 - z) < 0.05);
    this.pass = at(...def.booth) || null;
    this.speakers = def.speakers.map(([x, z]) => ({ x, z, solid: at(x, z), hp: DJ.speaker.hp, backT: 0, flash: 0 }));
    // nobody squeezes past the speakers to the DJ's side of the glass
    for (const [x, z, w, d] of def.gaps) L.addBox(x, z, w, d, DJ.shield.height, null, 'wall', { visible: false });
    L.rebuildNav();
    const [x0, z0, cols, rows] = def.floor;
    this.floor = { x0, z0, cols, rows };
    this.lit = new Uint8Array(cols * rows);
    L.floorTaken = true; // the club's own light show dims, so the warnings read (maps.js)
    this.state = 'idle'; // the floor: idle, warn, zap
    this.nextBeat = DJ.floor.first; // the beat the next pattern lights up on
    this.zapBeat = 0;
    this.zapT = 0;
    this.openT = 0; // s the glass stays down
    this.down = 0; // 0 the glass up, 1 down (slides between)
    this.taken = 0; // hits on the DJ in this opening
    this.crewT = DJ.crew.first;
    this.flash = 0;
    this.build();
  }

  /** The look: a block DJ at the decks, the glass, a light on each speaker, the floor's warning tiles. */
  build() {
    const g = this.game;
    const L = g.level;
    this.rig = buildCharacter({ body: 0x5b25d9, pants: 0x1a1030, hair: 0xff3fa4, accent: 0x2ee8ff, ring: 0.35 });
    for (const m of this.rig.weaponParts) m.visible = false;
    this.rig.root.traverse((o) => {
      o.castShadow = false; // behind the booth, against the wall: a shadow would cost draw calls and show nothing
    });
    this.rig.root.position.set(this.x, 0, this.z);
    // the glass: half a cylinder round the front of the booth, open at the back (the wall)
    const S = DJ.shield;
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a8fff, emissiveIntensity: 0.5, roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    addCutaway(glassMat, L.cut);
    this.glass = new THREE.Mesh(new THREE.CylinderGeometry(S.radius, S.radius, S.height, 32, 1, true, -Math.PI / 2, Math.PI).translate(0, S.height / 2, 0), glassMat);
    this.glass.position.set(this.x, 0, this.z);
    // a light on top of each speaker: green while it stands, out once blown
    this.leds = this.speakers.map((sp) => {
      const top = sp.solid ? sp.solid.h : 2.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2, 0.6) }));
      m.position.set(sp.x, top + 0.04, sp.z);
      return m;
    });
    // the floor's warning and zap: one tile per floor tile, adding light on top of the club's own
    const { x0, z0, cols, rows } = this.floor;
    this.tiles = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      cols * rows,
    );
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols * rows * 3), 3);
    const m = new THREE.Matrix4();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        m.makeTranslation(x0 + 0.5 + c, 0.02, z0 + 0.5 + r);
        this.tiles.setMatrixAt(r * cols + c, m);
      }
    }
    g.style.retone(this.glass, 'char', L.cut);
    g.scene.add(this.rig.root, this.glass, this.tiles, ...this.leds);
    this.sync();
  }

  /** The floor tile under (x, z) as [column, row], or null off the floor. */
  tileAt(x, z) {
    const { x0, z0, cols, rows } = this.floor;
    const c = Math.floor(x - x0);
    const r = Math.floor(z - z0);
    return c >= 0 && c < cols && r >= 0 && r < rows ? [c, r] : null;
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    // the glass: down while a blown speaker's opening lasts
    if (this.openT > 0) {
      this.openT -= dt;
      if (this.openT <= 0) this.taken = 0;
    }
    this.down = clamp(this.down + ((this.openT > 0 ? 1 : -1) * dt) / DJ.shield.drop, 0, 1);
    for (const sp of this.speakers) {
      sp.flash = Math.max(0, sp.flash - dt * 4);
      if (sp.hp > 0) continue;
      sp.backT -= dt;
      if (sp.backT <= 0) {
        sp.hp = DJ.speaker.hp;
        g.notes.log('DJ 的喇叭箱又響起來');
      }
    }
    this.updateFloor(dt);
    this.updateCrew(dt);
    this.sync();
  }

  /** The beat: light a pattern, zap it two beats on, then rest until the next. */
  updateFloor(dt) {
    const g = this.game;
    const F = DJ.floor;
    const beat = this.t / DJ.beat;
    if (this.state === 'idle' && beat >= this.nextBeat) {
      this.light();
      this.state = 'warn';
      this.zapBeat = this.nextBeat + F.warn;
      this.nextBeat += F.every;
      g.audio.aimWarn(g.panFor(this.x));
    } else if (this.state === 'warn' && beat >= this.zapBeat) {
      this.state = 'zap';
      this.zapT = F.zap;
      this.zap();
    } else if (this.state === 'zap') {
      this.zapT -= dt;
      if (this.zapT <= 0) {
        this.state = 'idle';
        this.lit.fill(0);
      }
    }
  }

  /** A new pattern on the floor, drawn from the run's stream: a checkerboard, bands of rows or columns, or rings round the player. */
  light() {
    const g = this.game;
    const rng = g.rng;
    const { cols, rows } = this.floor;
    const kind = rng.int(0, 3);
    const k = rng.int(0, 3);
    const [pc, pr] = this.tileAt(g.player.x, g.player.z) || [-9, -9];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ring = Math.max(Math.abs(c - pc), Math.abs(r - pr));
        const on = kind === 0 ? (r + c + k) % 2 === 0 : kind === 1 ? (r + k) % 4 < 2 : kind === 2 ? (c + k) % 4 < 2 : ring <= 1 || ring === 3;
        this.lit[r * cols + c] = on ? 1 : 0;
      }
    }
  }

  /** The lit tiles go off: the player on one is hurt (a spin rides it out). */
  zap() {
    const g = this.game;
    const p = g.player;
    const tile = p.alive ? this.tileAt(p.x, p.z) : null;
    g.audio.impact(g.panFor(this.x));
    g.shake(0.12);
    if (tile && this.lit[tile[1] * this.floor.cols + tile[0]]) {
      if (p.hurt(DJ.floor.dmg, 0, 0, false, 'DJ 的電擊地板')) g.fx.sparks(p.x, 0.3, p.z, 0, 0, 14, [3, 5, 9], 6, Math.PI);
    }
  }

  /** Every so often the DJ calls in two thugs through the doors. */
  updateCrew(dt) {
    const g = this.game;
    const C = DJ.crew;
    this.crewT -= dt;
    if (this.crewT > 0) return;
    this.crewT = C.every;
    if (g.enemies.aliveCount + g.waves.pending.length + C.count > C.maxAlive) return;
    for (let i = 0; i < C.count; i++) g.waves.pending.push({ type: 'grunt', sp: g.waves.pickSpawn('grunt'), t: 0.9 });
    g.notes.log(`DJ 叫來 ${C.count} 個打手`);
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active) return null;
    // the glass while it is up (more than half way), the DJ once it is down
    if (this.down < 0.5) {
      const t = segCircle(x0, z0, x1, z1, this.x, this.z, DJ.shield.radius);
      return t >= 0 ? { t, part: 'glass' } : null;
    }
    const t = segCircle(x0, z0, x1, z1, this.x, this.z, DJ.radius);
    return t >= 0 ? { t, part: 'dj' } : null;
  }

  shot(b, part) {
    const g = this.game;
    if (part === 'glass') {
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 6, [2, 5, 8], 7);
      g.audio.impact(g.panFor(b.x));
      return true;
    }
    this.flash = 1;
    g.fx.blood(b.x, GUN_Y, b.z, b.dx, b.dz, 8);
    g.audio.flesh(g.panFor(b.x));
    if (++this.taken >= DJ.perSegment) {
      // a segment: the DJ ducks and the glass comes back up
      this.taken = 0;
      this.openT = 0;
      this.hurt();
    }
    return true;
  }

  shotSolid(s) {
    const sp = this.speakers.find((x) => x.solid === s);
    if (sp) this.hitSpeaker(sp, 1);
  }

  /** A blast next to a speaker counts as a few hits. */
  blast(x, z) {
    if (!this.active) return;
    for (const sp of this.speakers) if (Math.hypot(sp.x - x, sp.z - z) <= DJ.speaker.blast) this.hitSpeaker(sp, DJ.speaker.blastHits);
  }

  hitSpeaker(sp, n) {
    if (!this.active || sp.hp <= 0) return;
    const g = this.game;
    sp.hp -= n;
    sp.flash = 1;
    if (sp.hp > 0) return;
    // blown: the glass slides down
    sp.backT = DJ.speaker.back;
    this.openT = DJ.open;
    this.taken = 0;
    const top = sp.solid ? sp.solid.h : 2.2;
    g.fx.flash(sp.x, top, sp.z, 0x88ddff, 30, 0.25, 8);
    g.fx.sparks(sp.x, top, sp.z, 0, 1, 24, [3, 6, 9], 8, Math.PI);
    g.audio.explosion(g.panFor(sp.x));
    g.shake(0.3);
    g.notes.log('射爆 DJ 的喇叭箱：玻璃降下');
    g.hud.banner('GLASS DOWN', `射 DJ！${DJ.open} 秒`, 'clear');
  }

  /** The last segment: the DJ goes down behind the decks, the floor goes dark. */
  goDown() {
    const g = this.game;
    this.lit.fill(0);
    g.level.floorTaken = false;
    this.state = 'idle';
    g.fx.flash(this.x, 1.5, this.z, 0xff3fa4, 40, 0.4, 10);
    g.notes.log('DJ 倒下');
    g.hud.banner('BOSS DOWN', 'DJ 倒下了', 'clear');
    this.finish();
    this.sync();
  }

  /** Where everything is drawn: the DJ bobbing to the beat, the glass, the speakers' lights, the floor. */
  sync() {
    const g = this.game;
    const r = this.rig;
    const beat = this.t / DJ.beat;
    const frac = beat - Math.floor(beat);
    r.root.rotation.y = 0;
    r.root.rotation.x = this.active ? 0 : -1.2; // down: over the decks
    r.root.position.y = this.active ? 0 : -0.6;
    if (g.style.poseDue(r, g.worldTime)) {
      const bob = Math.abs(Math.sin(frac * Math.PI));
      r.torso.position.y = BODY.torsoY + bob * 0.04;
      r.head.position.y = BODY.headY + bob * 0.06;
      r.armL.rotation.x = r.armR.rotation.x = -1.2 + bob * 0.25; // hands on the decks
    }
    setFlash(r, this.flash * 2);
    this.glass.position.y = -DJ.shield.height * this.down;
    this.glass.visible = this.active && this.down < 1;
    this.speakers.forEach((sp, i) => {
      const on = sp.hp > 0;
      const k = on ? 1 + sp.flash * 2 : 0.05;
      this.leds[i].material.color.setRGB(on ? 0.3 * k : 0.6 * k, on ? 2 * k : 0.1, on ? 0.6 * k : 0.1);
    });
    const warnK = 0.5 + 0.9 * (1 - frac) * (1 - frac);
    for (let i = 0; i < this.lit.length; i++) {
      const on = this.lit[i] && this.active;
      const c = !on ? [0, 0, 0] : this.state === 'zap' ? [1.6, 2.2, 3] : [1.4 * warnK, 0.08 * warnK, 0.12 * warnK];
      this.tiles.instanceColor.setXYZ(i, c[0], c[1], c[2]);
    }
    this.tiles.instanceColor.needsUpdate = true;
  }
}

/** Every kind of boss, by the name a map's `boss.kind` uses. */
export const BOSSES = { heli: { make: (game) => new Heli(game), cfg: HELI }, dj: { make: (game) => new Dj(game), cfg: DJ } };

/** The run's boss: none until a final wave starts one; each kind is built once and reused. */
export class Bosses {
  constructor(game) {
    this.game = game;
    this.none = new Boss(game);
    this.made = {};
    this.current = this.none;
    // game.boss: one object that is always the current boss (its fields and methods), so whoever holds it
    // (a test, from before the final wave) sees the boss of the moment
    this.view = new Proxy(
      {},
      {
        get: (_, key) => {
          const v = this.current[key];
          return typeof v === 'function' ? v.bind(this.current) : v;
        },
        set: (_, key, value) => {
          this.current[key] = value;
          return true;
        },
      },
    );
  }

  /** The final wave on a map with a boss: `def` is the map's (maps.js `boss`). */
  start(def) {
    this.reset();
    const kind = BOSSES[def.kind];
    if (!kind) return;
    this.current = this.made[def.kind] || (this.made[def.kind] = kind.make(this.game));
    this.current.start(def);
  }

  /** No boss (a new run, a restart, the title). */
  reset() {
    this.current.reset();
    this.current = this.none;
  }
}
