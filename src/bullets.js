// Every bullet is a real projectile with a glowing trail, so in bullet time
// you can read, dodge, deflect and ricochet them. They are drawn instanced
// (彈幕試驗 ①): each look of bullet is two instanced meshes, its trails and its
// heads, however many bullets there are (draw, from main.js render).

import * as THREE from 'three';
import { BULLET, GRAZE, GUN_Y, LEVELS, PAN, PLAYER } from './config.js';
import { pointSegDist2, segCircle } from './utils.js';

function trailGeometry(headW, tailW) {
  const g = new THREE.BufferGeometry();
  const h = headW / 2;
  const t = tailW / 2;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-h, 0, 0, h, 0, 0, -t, 0, -1, t, 0, -1]), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0]), 3));
  g.setIndex([0, 1, 2, 1, 3, 2]);
  return g;
}

const _m = new THREE.Matrix4();
const _s = new THREE.Vector3();

/** A bullet hell's bullets (彈幕試驗 ③): solid colour, not added light, so a dense pattern still shows every one. */
const solid = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });

const additive = (r, g, b, vertexColors = false) =>
  new THREE.MeshBasicMaterial({
    color: new THREE.Color(r, g, b),
    vertexColors,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

export class Bullets {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pool = [];
    this.geo = {
      playerTrail: trailGeometry(0.11, 0.01),
      enemyTrail: trailGeometry(0.26, 0.02),
      sniperTrail: trailGeometry(0.2, 0.03),
      head: new THREE.SphereGeometry(1, 8, 6),
      rim: new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), // a pattern bullet's dark rim, flat round its head
    };
    this.looks = {
      player: { trail: additive(3.5, 2.4, 0.9, true), head: additive(7, 5.5, 3), headSize: 0.07, geo: this.geo.playerTrail },
      ricochet: { trail: additive(0.8, 3, 4.5, true), head: additive(3, 6, 8), headSize: 0.08, geo: this.geo.playerTrail },
      enemy: { trail: additive(5, 0.7, 0.35, true), head: additive(9, 2.6, 1.2), headSize: 0.13, geo: this.geo.enemyTrail },
      pellet: { trail: additive(3.5, 2, 0.7, true), head: additive(7, 4.5, 2), headSize: 0.05, geo: this.geo.playerTrail },
      sniper: { trail: additive(2.2, 3.6, 4.5, true), head: additive(8, 9, 10), headSize: 0.1, geo: this.geo.sniperTrail },
      // a pattern's (enemies.js WEAPONS `pattern`): a solid pink-red head on a dark rim `rim` times its size, no trail
      danmaku: { trail: solid(0.1, 0, 0.03), head: solid(1, 0.32, 0.52), headSize: 0.15, geo: this.geo.rim, rim: 1.5 },
    };
    this.batches = {}; // look -> { trail, head, cap }: its instanced meshes (meshesOf)
  }

  /** A bullet of the pool, or a new one: `group` is where it is drawn (a transform only, not in the scene: draw). */
  acquire(look) {
    const b = this.pool.pop() || { group: new THREE.Object3D() };
    this.setLook(b, look);
    return b;
  }

  setLook(b, look) {
    b.look = look;
  }

  /** The instanced meshes that draw look `look`, room for `n` bullets at least (made, or made again bigger, on demand). */
  meshesOf(look, n = 1) {
    let bt = this.batches[look];
    if (bt && bt.cap >= n) return bt;
    const scene = this.game.scene;
    if (bt) {
      scene.remove(bt.trail, bt.head);
      bt.trail.dispose();
      bt.head.dispose();
    }
    const L = this.looks[look];
    const cap = Math.max(256, 2 ** Math.ceil(Math.log2(n)));
    const trail = new THREE.InstancedMesh(L.geo, L.trail, cap);
    const head = new THREE.InstancedMesh(this.geo.head, L.head, cap);
    for (const mesh of [trail, head]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false; // the bullets are all over the map: the bounds of one instance say nothing
      mesh.count = 0;
      mesh.visible = false;
      scene.add(mesh);
    }
    bt = this.batches[look] = { trail, head, cap };
    return bt;
  }

  /** Every live bullet into its look's instanced meshes: its head at its place and its look's size, its trail its length behind it. */
  draw() {
    const counts = {};
    for (const look in this.looks) counts[look] = 0;
    for (const b of this.list) counts[b.look]++;
    for (const look in counts) {
      const bt = this.meshesOf(look, counts[look]);
      bt.trail.count = bt.head.count = 0;
    }
    for (const b of this.list) {
      const bt = this.batches[b.look];
      const i = bt.head.count++;
      bt.trail.count++;
      b.group.updateMatrix();
      const L = this.looks[b.look];
      if (L.rim) bt.trail.setMatrixAt(i, _m.copy(b.group.matrix).scale(_s.setScalar(L.headSize * L.rim)));
      else bt.trail.setMatrixAt(i, _m.copy(b.group.matrix).scale(_s.set(1, 1, Math.max(0.05, b.trailLen))));
      bt.head.setMatrixAt(i, _m.copy(b.group.matrix).scale(_s.setScalar(L.headSize)));
    }
    for (const look in counts) {
      const bt = this.batches[look];
      bt.trail.visible = bt.head.visible = bt.head.count > 0;
      bt.trail.instanceMatrix.needsUpdate = bt.head.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * o: { x, z, dx, dz, speed, owner: 'player'|'enemy', damage, range, split, source,
   *      look, trail, pierce, knock, weapon, spinShot, diveShot }
   */
  spawn(o) {
    const b = this.acquire(o.look || (o.owner === 'player' ? 'player' : 'enemy'));
    b.x = o.x;
    b.z = o.z;
    b.ground0 = this.game.level.groundY(o.x, o.z); // the level it was fired on (同一水平: it does not leave it)
    b.dx = o.dx;
    b.dz = o.dz;
    b.speed = o.speed;
    b.owner = o.owner;
    b.damage = o.damage ?? 1;
    b.range = o.range ?? BULLET.maxRange;
    b.trailMax = o.trail || (o.owner === 'player' ? BULLET.playerTrail : BULLET.enemyTrail);
    b.pierce = o.pierce || 0;
    b.knock = o.knock || 1;
    b.weapon = o.weapon || null;
    b.spinShot = !!o.spinShot;
    b.diveShot = !!o.diveShot; // fired in the air on a dive: its kill is a DIVE KILL whenever it lands
    b.scatter = false;
    b.kills = 0;
    b.hits = [];
    b.trailLen = 0;
    b.traveled = 0;
    b.split = !!o.split;
    b.ricochet = false;
    b.over = o.over || 0; // fired from this high: lower cover and the props are no obstacle
    b.y0 = o.y ?? GUN_Y; // drawn from this high (a balcony's: enemies.js fromAbove)…
    b.drop = o.drop || 0; // …coming down this much a metre (only the look: the logic is on the floor plan)
    b.ignore = null;
    b.alive = true;
    b.near = false;
    b.awarded = false;
    b.reflected = false;
    b.dodgedSpin = false;
    b.source = o.source || null;
    b.homeRun = false; // set by batBack: a bullet of the pool keeps nothing from its last life
    b.hostageFire = o.hostageFire || false; // a held heavy gun's round, the player's own (player.js hostageFire): a kill is HOSTAGE FIRE
    this.list.push(b);
    this.updateVisual(b);
    return b;
  }

  clear() {
    for (const b of this.list) this.release(b);
    this.list.length = 0;
  }

  release(b) {
    b.alive = false;
    this.pool.push(b);
  }

  /** Where it is drawn (draw), after a step: over the ground below it (steps: 大三巴), turned along its way. */
  updateVisual(b) {
    b.group.position.set(b.x, Math.max(0.05, b.y0 - b.drop * b.traveled) + this.game.level.groundY(b.x, b.z), b.z);
    b.group.rotation.y = Math.atan2(b.dx, b.dz);
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const b = list[i];
      if (b.alive) this.step(b, dt);
      if (!b.alive) {
        this.release(b);
        list[i] = list[list.length - 1];
        list.pop();
      } else {
        this.updateVisual(b);
      }
    }
  }

  step(b, dt) {
    let remaining = b.speed * dt;
    let iter = 0;
    const sx = b.x;
    const sz = b.z;
    while (remaining > 1e-5 && b.alive && iter++ < 5) {
      const x1 = b.x + b.dx * remaining;
      const z1 = b.z + b.dz * remaining;
      const hit = this.findHit(b, b.x, b.z, x1, z1);
      if (!hit) {
        b.x = x1;
        b.z = z1;
        b.traveled += remaining;
        b.trailLen = Math.min(b.trailMax, b.trailLen + remaining);
        remaining = 0;
        break;
      }
      const d = remaining * hit.t;
      b.x += b.dx * d;
      b.z += b.dz * d;
      b.traveled += d;
      b.trailLen = Math.min(b.trailMax, b.trailLen + d);
      remaining -= d;
      this.handleHit(b, hit);
      if (b.alive) {
        b.x += b.dx * 0.01;
        b.z += b.dz * 0.01;
      }
    }
    if (!b.alive) return;
    if (this.offLevel(b, sx, sz)) return;

    if (b.owner === 'enemy') this.checkCloseCall(b, sx, sz);
    // off the map: 30 m past its edges (a fixed 60 m used to end every shot fired in Senado's south end, 74 m long)
    const { halfW, halfD } = this.game.level.bounds;
    if (b.traveled > b.range || Math.abs(b.x) > halfW + 30 || Math.abs(b.z) > halfD + 30) {
      if (b.traveled > b.range && b.owner === 'enemy') this.game.fx.sparks(b.x, GUN_Y, b.z, b.dx, b.dz, 3, [3, 0.6, 0.3], 3);
      b.alive = false;
    }
  }

  /**
   * 同一水平 (DECISIONS 2026-10-22): a shot does not leave the level it was fired on. Where the ground under it has
   * risen or fallen more than LEVELS.tol from where it was fired (the edge of a flight of 大三巴's steps) it stops, in a
   * puff of stone; found between where this step began (sx, sz) and where it is. True when it stopped.
   */
  offLevel(b, sx, sz) {
    const L = this.game.level;
    if (!L.groundFn) return false;
    const off = (x, z) => Math.abs(L.groundY(x, z) - b.ground0) > LEVELS.tol;
    if (!off(b.x, b.z)) return false;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 10; i++) {
      const m = (lo + hi) / 2;
      if (off(sx + (b.x - sx) * m, sz + (b.z - sz) * m)) hi = m;
      else lo = m;
    }
    b.x = sx + (b.x - sx) * lo;
    b.z = sz + (b.z - sz) * lo;
    this.game.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 5, [2.2, 2, 1.7], 5); // drawn over the ground there (fx.js)
    b.alive = false;
    return true;
  }

  findHit(b, x0, z0, x1, z1) {
    const game = this.game;
    let best = null;
    const solid = game.level.raycast(x0, z0, x1, z1, false, b.over, false, b.owner === 'player' ? game.boss.pass : null);
    if (solid) best = { t: solid.t, type: 'solid', solid: solid.solid, nx: solid.nx, nz: solid.nz };

    // from up high an enemy's shot flies over the props to the player; the player's own, aimed, still meets them
    const prop = b.over && b.owner !== 'player' ? null : game.level.raycastProps(x0, z0, x1, z1, b.ignore, b.hits);
    if (prop && (!best || prop.t < best.t)) best = { t: prop.t, type: prop.prop.kind, prop: prop.prop };

    if (b.owner === 'player') {
      for (const e of game.enemies.list) {
        if (!e.alive || e.spawnLock > 0 || e.held || e.untouchable || (b.hits.length && b.hits.includes(e))) continue; // the human shield is the player's own; a tumbler mid-roll lets it through
        const t = segCircle(x0, z0, x1, z1, e.x, e.z, e.radius + 0.16);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'enemy', enemy: e };
      }
      for (const o of this.list) {
        if (!o.alive || o.owner !== 'enemy') continue;
        const t = segCircle(x0, z0, x1, z1, o.x, o.z, 0.28);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'bullet', other: o };
      }
      // the boss: its glass, its body (boss.js)
      const bh = game.boss.shotAt(x0, z0, x1, z1);
      if (bh && (!best || bh.t <= best.t)) best = { t: bh.t, type: 'boss', part: bh.part };
      // an enemy grenade in the air: met where it is over the floor, whatever its height
      for (const gr of game.grenades.list) {
        if (gr.owner !== 'enemy' || gr.landed) continue;
        const t = segCircle(x0, z0, x1, z1, gr.x, gr.z, gr.lob.hitRadius);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'grenade', grenade: gr };
      }
    } else {
      const p = game.player;
      if (p.alive && !p.spinning && !p.sliding && !p.diving) {
        const t = segCircle(x0, z0, x1, z1, p.x, p.z, PLAYER.hitRadius);
        // from the front, where the human shield is held, it meets him instead (player.js grab)
        if (t >= 0 && (!best || t < best.t)) best = p.shieldedFrom(b.dx, b.dz) ? { t, type: 'hostage', enemy: p.hostage } : { t, type: 'player' };
      }
      const hs = p.hostage;
      if (hs && hs.alive) {
        const t = segCircle(x0, z0, x1, z1, hs.x, hs.z, hs.radius);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'hostage', enemy: hs };
      }
      // a human shield just shoved out, still flying (enemies.js shoved): his own side's rounds meet him as when held (彈幕 ② B①)
      for (const e of game.enemies.list) {
        if (!e.shoved || e === hs) continue;
        const t = segCircle(x0, z0, x1, z1, e.x, e.z, e.radius);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'hostage', enemy: e };
      }
      // one of a duo's bullets can meet the other of the two (CROSSFIRE, boss.js)
      if (b.source && b.source.team && game.boss.members) {
        const bh = game.boss.shotAt(x0, z0, x1, z1, b.source);
        if (bh && (!best || bh.t <= best.t)) best = { t: bh.t, type: 'boss', part: bh.part };
      }
      // Enemy bullets can also hit other enemies (friendly fire after a ricochet).
      if (b.reflected) {
        for (const e of game.enemies.list) {
          if (!e.alive) continue;
          const t = segCircle(x0, z0, x1, z1, e.x, e.z, e.radius);
          if (t >= 0 && (!best || t < best.t)) best = { t, type: 'enemy', enemy: e };
        }
      }
    }
    return best;
  }

  handleHit(b, hit) {
    const game = this.game;
    const fx = game.fx;
    const pan = game.panFor(b.x);
    switch (hit.type) {
      case 'solid': {
        const s = hit.solid;
        if (b.owner === 'player') game.boss.shotSolid(s, b); // one of the boss's (the DJ's speakers)
        if (s.table) s.table.shot(b); // a flipped table wears (fixtures.js), whoever's the shot
        if (s.kind === 'glass') {
          game.level.breakGlass(s, b.dx, b.dz);
          return;
        }
        let rx = b.dx;
        let rz = b.dz;
        if (hit.nx) rx = -rx;
        if (hit.nz) rz = -rz;
        const col = b.owner === 'player' ? [6, 4.5, 1.8] : [6, 1.4, 0.6];
        fx.sparks(b.x, GUN_Y, b.z, rx, rz, 6, col, 7);
        if (s.kind === 'crate') {
          fx.debris(b.x, GUN_Y, b.z, rx, rz, 3, [0.42, 0.29, 0.17], 0.08);
          if (s.hp !== undefined && --s.hp <= 0) game.level.breakCrate(s, b.dx, b.dz);
        }
        else fx.debris(b.x, GUN_Y, b.z, rx, rz, 2, [0.3, 0.3, 0.34], 0.06);
        game.audio.impact(pan);
        b.alive = false;
        return;
      }
      case 'net':
      case 'trolley':
        // low on the floor: shots fly over a net's bundle and a trolley
        b.hits.push(hit.prop);
        return;
      case 'extinguisher':
        hit.prop.hit(1, b.dx, b.dz);
        fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 6, [7, 7, 7], 6);
        game.audio.impact(pan);
        b.alive = false;
        return;
      case 'barrel':
        hit.prop.hit(b.owner === 'player' ? Math.max(1, b.damage) : 0.5, b.dx, b.dz);
        fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 8, [7, 3, 1], 6);
        game.audio.impact(pan);
        if (b.pierce > 0) {
          b.pierce--;
          b.hits.push(hit.prop);
        } else b.alive = false;
        return;
      case 'pan':
        if (b.owner === 'player' && hit.prop.y > 0.6) this.scatter(b, hit.prop);
        else this.ricochet(b, hit.prop);
        return;
      case 'lamp':
      case 'sign':
      case 'shutter':
        // a fixture (fixtures.js): the player's bullets work it, anyone else's just stop
        if (b.owner === 'player') hit.prop.shot(b);
        else fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 4, [6, 1.4, 0.6], 5);
        b.alive = false;
        return;
      case 'enemy':
        if (hit.enemy.hit(b) === 'blocked') {
          b.alive = false;
          return;
        }
        if (b.pierce > 0) {
          b.pierce--;
          b.hits.push(hit.enemy);
        } else b.alive = false;
        return;
      case 'boss':
        if (game.boss.shot(b, hit.part)) b.alive = false;
        return;
      case 'grenade':
        game.grenades.airburst(hit.grenade);
        b.alive = false;
        return;
      case 'hostage':
        hit.enemy.shieldHit(b);
        b.alive = false;
        return;
      case 'player':
        game.player.hurt(b.damage, b.dx, b.dz, false, b.source && b.source.cfg ? `${b.source.cfg.label} 的子彈` : '子彈');
        b.alive = false;
        return;
      case 'bullet': {
        const o = hit.other;
        o.alive = false;
        b.alive = false;
        fx.sparks(b.x, GUN_Y, b.z, b.dx, b.dz, 14, [7, 6, 4], 8, Math.PI);
        fx.flash(b.x, GUN_Y, b.z, 0xffeecc, 20, 0.2, 6);
        game.audio.deflect(pan);
        game.score.style('DEFLECT', 30, true);
        game.addFocus(0.03);
        return;
      }
    }
  }

  /**
   * The pan's swing meets an enemy bullet (player.js parry): it turns round as the player's own, aimed at
   * the nearest enemy in sight (else straight back), fast; a kill by it is a HOME RUN. A sniper's shot
   * batted back is a GONG.
   */
  batBack(b) {
    const game = this.game;
    const sniper = !!(b.source && b.source.cfg && b.source.cfg.weapon === 'sniper');
    const target = game.enemies.nearestVisible(b.x, b.z, 32);
    let nx = -b.dx;
    let nz = -b.dz;
    if (target) {
      nx = target.x - b.x;
      nz = target.z - b.z;
    }
    const l = Math.hypot(nx, nz) || 1;
    b.dx = nx / l;
    b.dz = nz / l;
    b.owner = 'player';
    b.damage = PAN.batDamage;
    b.speed = Math.max(b.speed, PAN.batSpeed);
    b.homeRun = true;
    b.hits = [];
    b.trailLen = 0;
    b.range = b.traveled + 40;
    this.setLook(b, 'ricochet');
    game.fx.sparks(b.x, GUN_Y, b.z, b.dx, b.dz, 14, [7, 7, 5], 10, 0.8);
    game.fx.flash(b.x, GUN_Y, b.z, 0xfff0c0, 30, 0.2, 7);
    game.audio.ricochet(game.panFor(b.x));
    if (sniper) {
      game.score.style('GONG', 150, true);
      game.notes.log('鑊擋下狙擊彈（GONG）');
    } else game.notes.log('鑊打回子彈');
  }

  ricochet(b, panProp) {
    const game = this.game;
    panProp.hit(b.dx, b.dz, 1.6);
    let nx;
    let nz;
    const target = b.owner === 'player' ? game.enemies.nearestVisible(b.x, b.z, 32) : null;
    if (target) {
      nx = target.x - b.x;
      nz = target.z - b.z;
    } else {
      // plain reflection off the pan's round edge
      const ux = b.x - panProp.x;
      const uz = b.z - panProp.z;
      const ul = Math.hypot(ux, uz) || 1;
      const dot = b.dx * (ux / ul) + b.dz * (uz / ul);
      nx = b.dx - 2 * dot * (ux / ul);
      nz = b.dz - 2 * dot * (uz / ul);
      if (b.owner === 'enemy') b.reflected = true;
    }
    const l = Math.hypot(nx, nz) || 1;
    b.dx = nx / l;
    b.dz = nz / l;
    b.ignore = panProp;
    b.trailLen = 0;
    b.range = b.traveled + 40;
    if (b.owner === 'player') {
      b.ricochet = true;
      b.speed = Math.max(b.speed, 70);
      this.setLook(b, 'ricochet');
    }
    game.fx.sparks(b.x, GUN_Y, b.z, b.dx, b.dz, 12, [3, 6, 8], 10, 0.9);
    game.fx.flash(b.x, GUN_Y, b.z, 0x88ddff, 30, 0.25, 7);
    game.audio.ricochet(game.panFor(b.x));
  }

  /**
   * A player bullet meets a pan in the air (thrown or kicked up): it becomes
   * three, one at each of the nearest visible enemies, fanning out where
   * there are fewer than three to aim at.
   */
  scatter(b, panProp) {
    const game = this.game;
    panProp.hit(b.dx, b.dz, 1.2);
    const dirs = game.enemies.nearestVisibleN(b.x, b.z, 32, 3).map((e) => [e.x - b.x, e.z - b.z]);
    const base = Math.atan2(b.dx, b.dz);
    for (let k = dirs.length; k < 3; k++) {
      const a = base + (k - 1) * 0.45;
      dirs.push([Math.sin(a), Math.cos(a)]);
    }
    dirs.forEach(([nx, nz], k) => {
      const l = Math.hypot(nx, nz) || 1;
      const t = k === 0 ? b : this.spawn({ x: b.x, z: b.z, dx: nx / l, dz: nz / l, speed: b.speed, owner: 'player', damage: b.damage, weapon: b.weapon, knock: b.knock, range: 40 });
      t.dx = nx / l;
      t.dz = nz / l;
      t.ignore = panProp;
      t.trailLen = 0;
      if (t === b) t.range = b.traveled + 40;
      t.ricochet = true;
      t.scatter = true;
      t.speed = Math.max(t.speed, 70);
      this.setLook(t, 'ricochet');
    });
    game.fx.sparks(b.x, GUN_Y, b.z, b.dx, b.dz, 18, [3, 6, 8], 11, 1.4);
    game.fx.flash(b.x, GUN_Y, b.z, 0x88ddff, 40, 0.3, 8);
    game.audio.ricochet(game.panFor(b.x));
    game.hitstop(0.04);
  }

  /** An enemy bullet that passed the player close without hitting: a CLOSE CALL, or in a mode with `graze` a GRAZE (GRAZE). */
  checkCloseCall(b, sx, sz) {
    const p = this.game.player;
    if (!p.alive) return;
    const graze = !!this.game.waves.rules.graze;
    const near = graze ? GRAZE.radius : 1.1;
    const d2 = pointSegDist2(p.x, p.z, sx, sz, b.x, b.z);
    if (d2 < near * near) {
      b.near = true;
      if ((p.spinning || p.sliding) && d2 < 0.5 * 0.5) b.dodgedSpin = true;
      return;
    }
    if (b.near && !b.awarded) {
      // The bullet has passed the player without hitting.
      const dot = (b.x - p.x) * b.dx + (b.z - p.z) * b.dz;
      if (dot > 0) {
        b.awarded = true;
        if (graze) this.game.onGraze();
        else this.game.onCloseCall(b.dodgedSpin);
      }
    }
  }
}
