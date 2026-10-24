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
//   table [x, z, 'table', 0, r]    a round table of radius r (彈幕試驗 ④): upright it is low cover that stops
//                                  bodies, shots and sight pass over it; the player's kick (or a pan) flips it
//                                  onto its side, its top a wall across the kick's way (ENV.table: FLIP), which
//                                  stops shots and sight until ENV.table.hp shots, anyone's, break it
//   exit  [x, z, 'exit', facing, w, h]  a room's way on (彈幕試驗 ⑤): a double door w × h in its wall at (x, z),
//                                  facing into the room, its sign over it; locked (shut, the sign dull red) while
//                                  the room is fought, unlock() opens it (the leaves swing in, the sign green, an
//                                  arrow on the floor); the player walking into it (reached, ENV.exit.reach m of
//                                  the wall) goes on to the floor's next room (waves.js 'exit')

import * as THREE from 'three';
import { ENV, GUN_Y } from './config.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { exitSignTexture } from './textures.js';
import { rand } from './utils.js';

const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();

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
    this.r = kind === 'sign' ? 0.28 : kind === 'door' || kind === 'table' || kind === 'exit' ? 0 : kind === 'shutter' ? 0.25 : 0.3; // a door, a table or an exit has no post to shoot: what stops shots is a solid (the exit's, the wall it is in)
    this.mesh = new THREE.Group();
    if (kind === 'lamp') this.buildLamp();
    else if (kind === 'sign') this.buildSign();
    else if (kind === 'door') this.buildDoor();
    else if (kind === 'table') this.buildTable();
    else if (kind === 'exit') this.buildExit();
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

  /** A round table: its top (the cloth, the turntable) on a pedestal; it turns over as one, about its middle. */
  buildTable() {
    const L = this.level;
    const M = L.mat;
    const T = ENV.table;
    const r = this.w;
    this.mesh.position.set(this.x, 0, this.z);
    // the top's own middle is its origin: upright it sits `low` up, flipped it stands on its edge
    this.slab = new THREE.Group();
    const cloth = new THREE.Mesh(L.own(new THREE.CylinderGeometry(r + 0.05, r + 0.12, 0.1, 20)), M.teaCloth);
    cloth.castShadow = true;
    const turn = new THREE.Mesh(L.own(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.04, 16)), M.teaWood);
    turn.position.y = 0.07;
    const leg = new THREE.Mesh(L.own(new THREE.CylinderGeometry(0.12, 0.3, T.low - 0.1, 8)), M.teaWood);
    leg.position.y = -(T.low - 0.1) / 2 - 0.05;
    leg.castShadow = true;
    this.slab.add(cloth, turn, leg);
    this.mesh.add(this.slab);
    this.upright = null; // its octagon (setUpright), and the wall it is on its side (flip)
    this.wall = null;
  }

  /** A room's exit: the frame, a dark doorway behind two leaves on hinges at its posts, the sign over it, the arrow on the floor before it (shown when open). */
  buildExit() {
    const L = this.level;
    const { w, h } = this;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = (this.facing * Math.PI) / 180; // its +z into the room, +x along the wall
    const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.5, ...o }));
    const frame = std({ color: 0xc9a24a, roughness: 0.4, metalness: 0.6 });
    const lacquer = std({ color: 0xa8261a, roughness: 0.4 }); // brighter than the wall it is in: the way on stands out
    for (const s of [-1, 1]) this.deco(0.14, h + 0.08, 0.18, frame, s * (w / 2 + 0.07), 0, 0.09);
    this.deco(w + 0.28, 0.16, 0.18, frame, 0, h, 0.09);
    const dark = new THREE.Mesh(L.geo.door, L.mat.door);
    dark.scale.set(w, h, 1);
    dark.position.set(0, h / 2, 0.02);
    this.mesh.add(dark);
    // the leaves, each on a hinge at its post; open, they swing into the room (out through the wall they would show over its top)
    this.leaves = [-1, 1].map((s) => {
      const hinge = new THREE.Group();
      hinge.position.set((s * w) / 2, 0, 0.06);
      const leaf = new THREE.Mesh(L.geo.unit, lacquer);
      leaf.scale.set(w / 2 - 0.03, h - 0.04, 0.07);
      leaf.position.set((-s * w) / 4, h / 2, 0);
      leaf.castShadow = true;
      hinge.add(leaf);
      hinge.userData.side = s;
      this.mesh.add(hinge);
      return hinge;
    });
    // the sign: 出口 EXIT, unlit (its colour says locked or open)
    this.signMat = L.own(new THREE.MeshBasicMaterial({ map: L.own(exitSignTexture()) }));
    const sign = new THREE.Mesh(L.geo.door, this.signMat);
    sign.scale.set(w, 0.42, 1);
    sign.position.set(0, h + 0.36, 0.1);
    this.mesh.add(sign);
    // two chevrons on the floor pointing at it, pulsing while it is open
    const chevron = (y) =>
      new THREE.ShapeGeometry(
        new THREE.Shape([
          new THREE.Vector2(-0.5, y - 0.25),
          new THREE.Vector2(0, y + 0.25),
          new THREE.Vector2(0.5, y - 0.25),
          new THREE.Vector2(0.5, y - 0.47),
          new THREE.Vector2(0, y + 0.03),
          new THREE.Vector2(-0.5, y - 0.47),
        ]),
      );
    const arrow = L.own(mergeGeometries([chevron(0), chevron(0.6)]));
    arrow.rotateX(-Math.PI / 2); // flat on the floor, pointing at the door (its +y to the room's −z)
    this.arrowMat = L.own(new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.arrow = new THREE.Mesh(arrow, this.arrowMat);
    this.arrow.position.set(0, 0.04, 1.7);
    this.mesh.add(this.arrow);
  }

  /** Where the player stands to go on: just inside the doorway. */
  get at() {
    const { x: dx, z: dz } = this.dir;
    return { x: this.x + dx * 0.6, z: this.z + dz * 0.6 };
  }

  /** The room is cleared: the exit opens (the sign green, the arrow on). */
  unlock() {
    if (!this.locked) return;
    this.locked = false;
    this.signMat.color.setHex(0x7dffa8);
    this.arrow.visible = true;
    this.game.audio.padSpawn();
  }

  /** (x, z) is in the open doorway's mouth: across it, and within ENV.exit.reach m of the wall. */
  reached(x, z) {
    if (this.locked) return false;
    const { x: dx, z: dz, ax, az } = this.dir;
    const u = (x - this.x) * ax + (z - this.z) * az;
    const v = (x - this.x) * dx + (z - this.z) * dz;
    return Math.abs(u) < this.w / 2 && v < ENV.exit.reach;
  }

  /** Upright: the low octagon that stops bodies (shots and sight pass over it: level.js `low`). */
  setUpright() {
    const L = this.level;
    const r = this.w;
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      return [this.x + Math.cos(a) * r, this.z + Math.sin(a) * r];
    });
    if (this.wall) this.dropSolid(this.wall);
    this.wall = null;
    if (!this.upright || !L.solids.includes(this.upright)) {
      this.upright = L.addPoly(pts, ENV.table.low, 'wall');
      this.upright.low = true;
      this.upright.of = this; // its own (test/maps.test.mjs: a prop is not in the way of itself)
      // stood up again (a new run): its cells shut once more (while the map loads, the grid is built after)
      if (L.nav) L.nav.buildRect(L.solids, 0.5, this.x - r - 1, this.z - r - 1, this.x + r + 1, this.z + r + 1);
    }
    this.upright.alive = true;
    this.flipped = false;
    this.broken = false;
    this.flipK = 0;
    this.hp = ENV.table.hp;
    this.mesh.visible = true;
    this.slab.position.set(0, ENV.table.low, 0);
    this.slab.quaternion.identity();
  }

  /** Take solid `s` away and open the nav grid round it. */
  dropSolid(s) {
    const L = this.level;
    s.alive = false;
    L.solids = L.solids.filter((o) => o !== s);
    if (L.nav) L.nav.buildRect(L.solids, 0.5, s.minX - 1, s.minZ - 1, s.maxX + 1, s.maxZ + 1);
  }

  /** Kicked from (px, pz): over onto its side, away from the kicker; its top a wall across the way. True if it went. */
  flip(px, pz) {
    if (this.flipped || this.broken || !this.alive) return false;
    const g = this.game;
    const L = this.level;
    const T = ENV.table;
    let dx = this.x - px;
    let dz = this.z - pz;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    this.flipDir = { x: dx, z: dz };
    this.flipped = true;
    this.flipK = 0;
    this.dropSolid(this.upright);
    // the wall: a box turned to the kick's way, `out` m beyond the middle, as wide as the table
    const cx = this.x + dx * T.out;
    const cz = this.z + dz * T.out;
    const ax = dz;
    const az = -dx;
    const hw = this.w;
    const ht = T.thick / 2;
    const pts = [
      [cx + ax * hw + dx * ht, cz + az * hw + dz * ht],
      [cx - ax * hw + dx * ht, cz - az * hw + dz * ht],
      [cx - ax * hw - dx * ht, cz - az * hw - dz * ht],
      [cx + ax * hw - dx * ht, cz + az * hw - dz * ht],
    ];
    this.wall = L.addPoly(pts, T.height, 'wall');
    this.wall.table = this; // shots on it wear it (bullets.js)
    this.wall.of = this;
    L.nav.buildRect(L.solids, 0.5, this.x - this.w - 1, this.z - this.w - 1, this.x + this.w + 1, this.z + this.w + 1);
    g.score.style('FLIP', T.pts);
    g.audio.kick(true);
    g.shake(0.2);
    g.fx.debris(this.x, 0.6, this.z, dx, dz, 8, [0.48, 0.29, 0.26], 0.06);
    g.level.noise(this.x, this.z, 6);
    g.notes.log('翻枱：圓枱翻起擋子彈');
    return true;
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
    if (this.kind === 'table') {
      this.setUpright();
      return;
    }
    if (this.kind === 'exit') {
      this.locked = true;
      this.openK = 0;
      for (const hinge of this.leaves) hinge.rotation.y = 0;
      this.signMat.color.setHex(0x8a2a22);
      this.arrow.visible = false;
      return;
    }
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
    if (this.kind === 'table') {
      // on its side (its wall is what the shot met): each shot, anyone's, wears it; then it breaks
      if (!this.flipped || this.broken) return;
      g.fx.debris(b.x, GUN_Y, b.z, -b.dx, -b.dz, 2, [0.48, 0.29, 0.26], 0.05);
      if (--this.hp > 0) return;
      this.broken = true;
      this.mesh.visible = false;
      this.dropSolid(this.wall);
      this.wall = null;
      g.fx.debris(this.x, 0.8, this.z, b.dx, b.dz, 16, [0.48, 0.29, 0.26], 0.1);
      g.audio.impact(g.panFor(this.x));
      g.notes.log('圓枱被打爛');
      return;
    }
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
    if (this.kind === 'table') {
      // over it goes (looks only: the wall stood the moment it was kicked)
      if (!this.flipped || this.broken || this.flipK >= 1) return;
      this.flipK = Math.min(1, this.flipK + dt / ENV.table.flipTime);
      const k = this.flipK;
      const { x: dx, z: dz } = this.flipDir;
      _axis.set(dz, 0, -dx); // across the kick: turning about it by a quarter turn takes the top's up to the kick's way
      _q.setFromAxisAngle(_axis, (Math.PI / 2) * k);
      this.slab.quaternion.copy(_q);
      const out = ENV.table.out * k;
      this.slab.position.set(dx * out, ENV.table.low + (this.w + 0.05 - ENV.table.low) * k, dz * out);
      return;
    }
    if (this.kind === 'exit') {
      // looks only: the leaves swing out in ENV.exit.open s, the arrow pulses
      if (this.locked) return;
      this.openK = Math.min(1, this.openK + dt / ENV.exit.open);
      const k = 1 - (1 - this.openK) ** 2;
      for (const hinge of this.leaves) hinge.rotation.y = hinge.userData.side * 1.35 * k;
      this.arrowMat.opacity = 0.45 + 0.35 * Math.sin(this.game.worldTime * 5);
      return;
    }
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

