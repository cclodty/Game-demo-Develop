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

import * as THREE from 'three';
import { ENV, GUN_Y } from './config.js';
import { rand } from './utils.js';

const SIGN_W = 2.0;
const SIGN_H = 0.9;
const SIGN_T = 0.14;
const SIGN_OUT = 1.6; // m the board hangs out from its post
const SIGN_Y = 3.0; // height of the board's centre

export class Fixture {
  constructor(level, x, z, kind, facing = 0) {
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
    this.r = kind === 'sign' ? 0.28 : 0.3;
    this.mesh = new THREE.Group();
    if (kind === 'lamp') this.buildLamp();
    else this.buildSign();
    level.add(this.mesh);
    this.reset();
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

  // ------------------------------------------------------------ logic

  reset() {
    this.alive = true;
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

  /** A player bullet lands on it. */
  shot(b) {
    const g = this.game;
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

/** The fixtures of a map: `fixtures: [[x, z, kind, facing?], …]`. */
export function buildFixtures(level, data) {
  return (data || []).map(([x, z, kind, facing]) => new Fixture(level, x, z, kind, facing));
}

