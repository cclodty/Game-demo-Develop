// Fixtures (環境互動件): things in a map that play along, named by kind in the
// map's `fixtures` data, their behaviour here, never in a map's own code. A
// fixture stands in level.props as a fixed circle (bullets find it; nothing
// pushes, kicks or picks it up). ENV in config.js holds the numbers.
//
//   lamp  [x, z, 'lamp']           a street lamp: ENV.lampHits player bullets put it out for ENV.darkTime s;
//                                  in the dark pool (ENV.darkRadius) enemies cannot aim, and a kill is BLACKOUT
//   sign  [x, z, 'sign', facing]   a shop sign hung from a post at (x, z), out `facing` degrees (0 south, 90 east);
//                                  ENV.signHits bullets on the bracket drop it: whoever stands under it is CRUSHED,
//                                  and the board stays on the floor as low cover
//   door  [x, z, 'door', facing, w, h]  a closed door across an opening, its width across `facing`: it blocks
//                                  sight and bodies but not paths; the player's kick swings it away from him
//                                  (whoever stands behind it is SLAMmed), an enemy walking into it pushes it
//                                  open; it swings shut ENV.doorOpen s later when nobody stands in it
//   shutter [x, z, 'shutter', facing, w, h]  a roller shutter rolled up over an opening that runs `w` m from
//                                  the lock post at (x, z) along `facing`: a bullet or a kick on the post drops
//                                  it, whoever is under it is crushed (SHUTTER), and the opening stays shut
//                                  until the wave is cleared

import * as THREE from 'three';
import { ENV, GUN_Y } from './config.js';
import { rand } from './utils.js';

const SIGN_W = 2.0;
const SIGN_H = 0.9;
const SIGN_T = 0.14;
const SIGN_OUT = 1.6; // m the board hangs out from its post
const SIGN_Y = 3.0; // height of the board's centre

export class Fixture {
  constructor(level, x, z, kind, facing = 0, w = 1.2, h = 2.2) {
    this.level = level;
    this.game = level.game;
    this.kind = kind;
    this.fixed = true; // never moves: pushes, kicks and pickups pass it by
    this.x = x;
    this.z = z;
    this.vx = this.vz = 0;
    this.y = 0;
    this.carried = false;
    this.thrown = false;
    this.facing = facing;
    this.w = w;
    this.h = h;
    this.r = kind === 'sign' ? 0.28 : kind === 'door' ? 0 : kind === 'shutter' ? 0.25 : 0.3; // a door has no post to shoot: its panel is a solid
    this.mesh = new THREE.Group();
    if (kind === 'lamp') this.buildLamp();
    else if (kind === 'sign') this.buildSign();
    else if (kind === 'door') this.buildDoor();
    else this.buildShutter();
    level.add(this.mesh);
    this.reset();
  }

  /** Unit vector of `facing` (0 south, 90 east) and the one across it. */
  get dir() {
    const a = (this.facing * Math.PI) / 180;
    return { x: Math.sin(a), z: Math.cos(a), ax: Math.cos(a), az: -Math.sin(a) };
  }

  // ------------------------------------------------------------ looks

  deco(w, h, d, mat, px = 0, py = 0, pz = 0) {
    const m = new THREE.Mesh(this.level.geo.unit, mat);
    m.position.set(px, py + h / 2, pz);
    m.scale.set(w, h, d);
    m.receiveShadow = true;
    this.mesh.add(m);
    return m;
  }

  buildLamp() {
    const M = this.level.mat;
    const L = this.level;
    this.mesh.position.set(this.x, 0, this.z);
    this.deco(0.24, 0.5, 0.24, M.streetlamp);
    this.deco(0.11, 4.2, 0.11, M.streetlamp);
    this.deco(0.55, 0.06, 0.08, M.streetlamp, 0, 4.2);
    this.glassMat = L.own(M.lampGlass.clone());
    for (const o of [-0.26, 0.26]) this.deco(0.18, 0.4, 0.18, this.glassMat, o, 3.75);
    // the pool of light on the ground, and the dark that takes its place when the lamp is shot out
    this.poolMat = L.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.75, 0.4), transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.darkMat = L.own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    const disc = L.own(new THREE.CircleGeometry(ENV.darkRadius, 40).rotateX(-Math.PI / 2));
    this.pool = new THREE.Mesh(disc, this.poolMat);
    this.pool.position.y = 0.015;
    this.pool.userData.noOutline = true;
    this.mesh.add(this.pool);
  }

  buildSign() {
    const M = this.level.mat;
    const L = this.level;
    const a = (this.facing * Math.PI) / 180;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = a;
    // the post and its arm; the board hangs from the arm's end, out along +z of this group
    this.deco(0.14, SIGN_Y + 0.6, 0.14, M.darkMetal);
    this.deco(0.08, 0.08, SIGN_OUT, M.darkMetal, 0, SIGN_Y + 0.5, SIGN_OUT / 2);
    const board = new THREE.Group();
    board.position.set(0, SIGN_Y, SIGN_OUT);
    const face = new THREE.Mesh(L.geo.unit, L.own(new THREE.MeshStandardMaterial({ color: 0x1a1230, roughness: 0.7 })));
    face.scale.set(SIGN_W, SIGN_H, SIGN_T);
    face.castShadow = true;
    const edge = new THREE.Mesh(L.geo.unit, M.neonPink);
    edge.scale.set(SIGN_W + 0.08, 0.06, SIGN_T + 0.04);
    edge.position.y = SIGN_H / 2;
    const edge2 = edge.clone();
    edge2.position.y = -SIGN_H / 2;
    const glyph = new THREE.Mesh(L.geo.unit, M.neonCyan);
    glyph.scale.set(SIGN_W * 0.6, SIGN_H * 0.35, 0.02);
    glyph.position.z = SIGN_T / 2 + 0.01;
    board.add(face, edge, edge2, glyph);
    this.mesh.add(board);
    this.board = board;
    // where the board lands: out along the facing from the post
    this.landX = this.x + Math.sin(a) * SIGN_OUT;
    this.landZ = this.z + Math.cos(a) * SIGN_OUT;
  }

  buildDoor() {
    const L = this.level;
    const M = L.mat;
    const { ax, az } = this.dir;
    const a = (this.facing * Math.PI) / 180;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = a;
    // the frame posts at the two ends of the opening, and the panel on a hinge at one of them
    for (const s of [-1, 1]) this.deco(0.1, this.h + 0.1, 0.14, M.darkMetal, (s * this.w) / 2, 0, 0);
    this.hinge = new THREE.Group();
    this.hinge.position.set(-this.w / 2, 0, 0);
    const panel = new THREE.Mesh(L.geo.unit, M.door);
    panel.scale.set(this.w - 0.08, this.h - 0.04, 0.1);
    panel.position.set(this.w / 2, this.h / 2, 0);
    panel.castShadow = true;
    this.hinge.add(panel);
    this.mesh.add(this.hinge);
    // the solid across the opening: bodies and bullets stop at it while it is shut, paths pass (nav skips passable solids)
    const across = Math.abs(ax) > Math.abs(az);
    this.solid = L.addBox(this.x, this.z, across ? this.w : 0.14, across ? 0.14 : this.w, this.h, null, 'wall', { visible: false });
    this.solid.passable = true;
    this.solid.door = this;
  }

  buildShutter() {
    const L = this.level;
    const M = L.mat;
    const a = (this.facing * Math.PI) / 180;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = a;
    // the opening runs from the lock post along +z of this group; posts at both ends, the lintel over it, the curtain under the lintel
    this.deco(0.22, this.h + 0.2, 0.22, M.darkMetal);
    this.deco(0.16, this.h + 0.2, 0.16, M.darkMetal, 0, 0, this.w);
    this.deco(0.2, 0.45, this.w, M.darkMetal, 0, this.h - 0.1, this.w / 2);
    this.lock = this.deco(0.26, 0.2, 0.2, M.neonOrange, 0, 1.1, 0);
    this.curtain = new THREE.Mesh(L.geo.unit, L.own(M.metal.clone()));
    this.curtain.position.set(0, this.h, this.w / 2);
    this.curtain.scale.set(0.1, 0.01, this.w - 0.2);
    this.mesh.add(this.curtain);
    const { x: dx, z: dz } = this.dir;
    this.midX = this.x + (dx * this.w) / 2;
    this.midZ = this.z + (dz * this.w) / 2;
    this.endX = this.x + dx * this.w;
    this.endZ = this.z + dz * this.w;
  }

  // ------------------------------------------------------------ logic

  reset() {
    this.alive = true;
    if (this.kind === 'door') {
      this.open = false;
      this.openT = 0;
      this.openK = 0;
      this.swing = 1;
      this.solid.alive = true;
      this.hinge.rotation.y = 0;
      return;
    }
    if (this.kind === 'shutter') {
      this.fallT = -1;
      this.raise();
      return;
    }
    if (this.kind === 'lamp') {
      this.hp = ENV.lampHits;
      this.dark = 0;
      this.relight();
    } else {
      this.hp = ENV.signHits;
      this.fallen = false;
      this.fallT = -1;
      this.landed = false;
      if (this.solid) {
        this.solid.alive = false;
        this.level.solids = this.level.solids.filter((s) => s !== this.solid);
        this.solid = null;
      }
      this.board.position.set(0, SIGN_Y, SIGN_OUT);
      this.board.rotation.set(0, 0, 0);
      this.board.visible = true;
    }
  }

  relight() {
    this.glassMat.emissiveIntensity = 0.6;
    this.pool.material = this.poolMat;
    this.pool.visible = true;
  }

  /** In the dark pool of this lamp. */
  darkAt(x, z) {
    return this.kind === 'lamp' && this.dark > 0 && Math.hypot(x - this.x, z - this.z) < ENV.darkRadius;
  }

  // ------------------------------------------------------------ door

  /** Kicked from (kx, kz): it swings away from the kicker, and whoever stands behind it is slammed. */
  kick(kx, kz) {
    if (this.open) return false;
    const g = this.game;
    const { x: dx, z: dz } = this.dir;
    const side = (kx - this.x) * dx + (kz - this.z) * dz < 0 ? -1 : 1; // which side of the opening the kicker is on
    this.swing = -side;
    const sx = dx * this.swing;
    const sz = dz * this.swing;
    let n = 0;
    for (const e of g.enemies.list) {
      if (!e.alive || e.cfg.fly) continue;
      const ex = e.x - this.x;
      const ez = e.z - this.z;
      if (ex * sx + ez * sz < 0.1 || Math.hypot(ex, ez) > this.w + e.radius) continue;
      e.kick(sx, sz, ENV.slamPower, 'slam', ENV.doorSlam);
      n++;
    }
    this.setOpen(true);
    g.audio.kick(n > 0);
    g.fx.sparks(this.x, 1.2, this.z, sx, sz, 6, [4, 4, 4], 5);
    g.shake(0.2);
    g.notes.log(n ? `踢開門，甩中 ${n} 人` : '踢開門');
    return true;
  }

  /** An enemy walks into it: it opens, no slam. */
  push() {
    if (this.open) return;
    this.setOpen(true);
    this.game.audio.impact(this.game.panFor(this.x));
  }

  setOpen(open) {
    this.open = open;
    this.solid.alive = !open;
    if (open) this.openT = ENV.doorOpen;
  }

  /** Someone stands in the doorway: it cannot swing shut on them. */
  doorwayBusy() {
    const g = this.game;
    const near = (o, r) => Math.hypot(o.x - this.x, o.z - this.z) < this.w / 2 + r;
    if (g.player.alive && near(g.player, 0.5)) return true;
    for (const e of g.enemies.list) if (e.alive && !e.cfg.fly && near(e, e.radius + 0.2)) return true;
    return false;
  }

  // ------------------------------------------------------------ shutter

  /** The lock gives (a bullet, or a kick on the post): the shutter comes down. */
  drop(how = 'shot') {
    if (this.down || this.fallT >= 0) return false;
    this.fallT = 0;
    this.game.audio.impact(this.game.panFor(this.x));
    this.game.notes.log(how === 'kick' ? '踢斷鐵閘的鏈，鐵閘落下' : '鐵閘的鎖被打斷，鐵閘落下');
    return true;
  }

  /** On the ground: whoever stood under it is crushed, and the opening is shut until the wave is cleared. */
  slam() {
    const g = this.game;
    this.down = true;
    const { x: dx, z: dz, ax, az } = this.dir;
    const under = (o, r) => {
      const ox = o.x - this.x;
      const oz = o.z - this.z;
      const along = ox * dx + oz * dz;
      const acrossD = Math.abs(ox * ax + oz * az);
      return along > -r && along < this.w + r && acrossD < 0.35 + r;
    };
    for (const e of g.enemies.list) {
      if (!e.alive || e.cfg.fly || !under(e, e.radius)) continue;
      e.hp = 0;
      e.die(ax, az, { cause: 'shutter' });
    }
    const p = g.player;
    if (p.alive && under(p, 0.3)) p.hurt(ENV.shutterDamage, ax, az, true, '鐵閘');
    const across = Math.abs(ax) > Math.abs(az);
    this.solid = this.level.addBox(this.midX, this.midZ, across ? this.w : 0.3, across ? 0.3 : this.w, this.h, null, 'wall', { visible: false });
    this.level.nav.buildRect(this.level.solids, 0.5, Math.min(this.x, this.endX) - 1, Math.min(this.z, this.endZ) - 1, Math.max(this.x, this.endX) + 1, Math.max(this.z, this.endZ) + 1);
    g.fx.debris(this.midX, 0.2, this.midZ, 0, 0, 8, [0.3, 0.3, 0.34], 0.08);
    g.shake(0.35);
    g.audio.impact(g.panFor(this.midX));
    g.level.noise(this.midX, this.midZ, 8);
  }

  /** Rolled back up (a new run, or the wave cleared): the opening is open again. */
  raise() {
    const was = this.down;
    this.down = false;
    this.fallT = -1;
    if (this.solid) {
      this.solid.alive = false;
      this.level.solids = this.level.solids.filter((s) => s !== this.solid);
      this.solid = null;
      this.level.nav.buildRect(this.level.solids, 0.5, Math.min(this.x, this.endX) - 1, Math.min(this.z, this.endZ) - 1, Math.max(this.x, this.endX) + 1, Math.max(this.z, this.endZ) + 1);
    }
    this.curtain.scale.y = 0.01;
    this.curtain.position.y = this.h;
    this.lock.visible = true;
    if (was) this.game.notes.log('鐵閘捲起');
  }

  /** The wave is cleared: shutters roll back up. */
  waveEnd() {
    if (this.kind === 'shutter' && (this.down || this.fallT >= 0)) this.raise();
  }

  /** A player bullet lands on it. */
  shot(b) {
    const g = this.game;
    if (this.kind === 'shutter') {
      this.drop('shot');
      g.fx.sparks(this.x, 1.1, this.z, -b.dx, -b.dz, 8, [7, 5, 2], 7);
      return;
    }
    if (this.kind === 'lamp') {
      if (this.dark > 0) return;
      this.hp--;
      g.fx.sparks(this.x, GUN_Y + 1.6, this.z, -b.dx, -b.dz, 6, [7, 6, 3], 6);
      if (this.hp > 0) return;
      this.dark = ENV.darkTime;
      this.glassMat.emissiveIntensity = 0;
      this.pool.material = this.darkMat;
      g.fx.shards(this.x, 3.8, this.z, -b.dx, -b.dz, 10);
      g.fx.flash(this.x, 3.8, this.z, 0xfff0c8, 12, 0.12, 8);
      g.audio.glass(g.panFor(this.x));
      g.level.noise(this.x, this.z, 6);
      g.notes.log('街燈被打熄');
      return;
    }
    if (this.fallT >= 0) return;
    this.hp--;
    g.fx.sparks(this.x, GUN_Y, this.z, -b.dx, -b.dz, 8, [7, 6, 3], 7);
    g.audio.impact(g.panFor(this.x));
    if (this.hp > 0) return;
    this.fallT = 0;
    g.notes.log('招牌支架斷了');
  }

  /** The board hits the floor: whoever is under it is crushed, and it stays there as cover. */
  land() {
    const g = this.game;
    this.landed = true;
    this.fallen = true;
    const cx = this.landX;
    const cz = this.landZ;
    for (const e of g.enemies.list) {
      if (!e.alive || e.cfg.fly) continue;
      if (Math.hypot(e.x - cx, e.z - cz) < ENV.signBlast + e.radius) {
        const dx = e.x - cx;
        const dz = e.z - cz;
        e.hp = 0;
        e.die(dx, dz, { cause: 'crushed' });
      }
    }
    const p = g.player;
    if (p.alive && Math.hypot(p.x - cx, p.z - cz) < ENV.signBlast) p.hurt(ENV.signDamage, p.x - cx, p.z - cz, true, '招牌');
    // the board lies along its width, across the facing
    const a = (this.facing * Math.PI) / 180;
    const across = Math.abs(Math.sin(a)) > 0.5; // facing east/west: the board's width runs north-south
    const w = across ? SIGN_H : SIGN_W;
    const d = across ? SIGN_W : SIGN_H;
    this.solid = this.level.addBox(cx, cz, w, d, 0.5, null, 'wall', { visible: false });
    this.level.nav.buildRect(this.level.solids, 0.5, cx - w, cz - d, cx + w, cz + d);
    g.fx.debris(cx, 0.3, cz, 0, 0, 10, [0.3, 0.3, 0.34], 0.1);
    g.shake(0.3);
    g.audio.impact(g.panFor(cx));
    g.level.noise(cx, cz, 7);
    g.notes.log('招牌掉下');
  }

  update(dt) {
    if (this.kind === 'door') {
      if (this.open) {
        this.openT -= dt;
        if (this.openT <= 0 && !this.doorwayBusy()) this.setOpen(false);
      }
      // the panel swings (looks only)
      const target = this.open ? this.swing * 1.45 : 0;
      this.openK += (target - this.openK) * Math.min(1, dt * 9);
      this.hinge.rotation.y = this.openK;
      return;
    }
    if (this.kind === 'shutter') {
      if (this.fallT >= 0 && !this.down) {
        this.fallT += dt;
        const k = Math.min(1, this.fallT / ENV.shutterFall);
        this.curtain.scale.y = Math.max(0.01, this.h * k);
        this.curtain.position.y = this.h - (this.h * k) / 2;
        this.lock.visible = false;
        if (k >= 1) this.slam();
      }
      return;
    }
    if (this.kind === 'lamp') {
      if (this.dark > 0) {
        this.dark -= dt;
        if (this.dark <= 0) {
          this.dark = 0;
          this.hp = ENV.lampHits;
          this.relight();
          this.game.notes.log('街燈復亮');
        } else this.darkMat.opacity = 0.45 + 0.1 * Math.sin(this.game.worldTime * 9);
      }
      return;
    }
    if (this.fallT >= 0 && !this.landed) {
      this.fallT += dt;
      const k = Math.min(1, this.fallT / ENV.signFall);
      // the board drops, swinging down from the arm: what shows between the shot and the landing
      this.board.position.y = SIGN_Y - (SIGN_Y - SIGN_H / 2) * k * k;
      this.board.rotation.x = -1.3 * k;
      if (k >= 1) {
        this.board.position.y = SIGN_H * 0.08;
        this.board.rotation.set(-Math.PI / 2, 0, rand(-0.2, 0.2));
        this.land();
      }
    }
  }
}

/** The fixtures of a map: `fixtures: [[x, z, kind, facing?, w?, h?], …]`. */
export function buildFixtures(level, data) {
  return (data || []).map(([x, z, kind, facing, w, h]) => new Fixture(level, x, z, kind, facing, w, h));
}

