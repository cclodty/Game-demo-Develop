// Every bullet is a real projectile with a glowing trail, so in bullet time
// you can read, dodge, deflect and ricochet them.

import * as THREE from 'three';
import { BULLET, GUN_Y, PLAYER } from './config.js';
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
    };
    this.looks = {
      player: { trail: additive(3.5, 2.4, 0.9, true), head: additive(7, 5.5, 3), headSize: 0.07, geo: this.geo.playerTrail },
      ricochet: { trail: additive(0.8, 3, 4.5, true), head: additive(3, 6, 8), headSize: 0.08, geo: this.geo.playerTrail },
      enemy: { trail: additive(5, 0.7, 0.35, true), head: additive(9, 2.6, 1.2), headSize: 0.13, geo: this.geo.enemyTrail },
      pellet: { trail: additive(3.5, 2, 0.7, true), head: additive(7, 4.5, 2), headSize: 0.05, geo: this.geo.playerTrail },
      sniper: { trail: additive(2.2, 3.6, 4.5, true), head: additive(8, 9, 10), headSize: 0.1, geo: this.geo.sniperTrail },
    };
  }

  acquire(look) {
    let b = this.pool.pop();
    if (!b) {
      const group = new THREE.Group();
      const trail = new THREE.Mesh(this.geo.playerTrail, this.looks.player.trail);
      const head = new THREE.Mesh(this.geo.head, this.looks.player.head);
      trail.frustumCulled = false;
      group.add(trail, head);
      b = { group, trail, head };
    }
    this.setLook(b, look);
    b.group.visible = true;
    this.game.scene.add(b.group);
    return b;
  }

  setLook(b, look) {
    const L = this.looks[look];
    b.trail.geometry = L.geo;
    b.trail.material = L.trail;
    b.head.material = L.head;
    b.head.scale.setScalar(L.headSize);
    b.look = look;
  }

  /**
   * o: { x, z, dx, dz, speed, owner: 'player'|'enemy', damage, range, split, source,
   *      look, trail, pierce, knock, weapon, spinShot }
   */
  spawn(o) {
    const b = this.acquire(o.look || (o.owner === 'player' ? 'player' : 'enemy'));
    b.x = o.x;
    b.z = o.z;
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
    b.scatter = false;
    b.kills = 0;
    b.hits = [];
    b.trailLen = 0;
    b.traveled = 0;
    b.split = !!o.split;
    b.ricochet = false;
    b.over = o.over || 0; // fired from this high: lower cover and the props are no obstacle
    b.ignore = null;
    b.alive = true;
    b.near = false;
    b.awarded = false;
    b.reflected = false;
    b.dodgedSpin = false;
    b.source = o.source || null;
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
    b.group.visible = false;
    this.game.scene.remove(b.group);
    this.pool.push(b);
  }

  updateVisual(b) {
    b.group.position.set(b.x, GUN_Y, b.z);
    b.group.rotation.y = Math.atan2(b.dx, b.dz);
    b.trail.scale.set(1, 1, Math.max(0.05, b.trailLen));
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

    if (b.owner === 'enemy') this.checkCloseCall(b, sx, sz);
    // off the map: 30 m past its edges (a fixed 60 m used to end every shot fired in Senado's south end, 74 m long)
    const { halfW, halfD } = this.game.level.bounds;
    if (b.traveled > b.range || Math.abs(b.x) > halfW + 30 || Math.abs(b.z) > halfD + 30) {
      if (b.traveled > b.range && b.owner === 'enemy') this.game.fx.sparks(b.x, GUN_Y, b.z, b.dx, b.dz, 3, [3, 0.6, 0.3], 3);
      b.alive = false;
    }
  }

  findHit(b, x0, z0, x1, z1) {
    const game = this.game;
    let best = null;
    const solid = game.level.raycast(x0, z0, x1, z1, false, b.over, false);
    if (solid) best = { t: solid.t, type: 'solid', solid: solid.solid, nx: solid.nx, nz: solid.nz };

    const prop = b.over ? null : game.level.raycastProps(x0, z0, x1, z1, b.ignore, b.hits);
    if (prop && (!best || prop.t < best.t)) best = { t: prop.t, type: prop.prop.kind, prop: prop.prop };

    if (b.owner === 'player') {
      for (const e of game.enemies.list) {
        if (!e.alive || e.spawnLock > 0 || (b.hits.length && b.hits.includes(e))) continue;
        const t = segCircle(x0, z0, x1, z1, e.x, e.z, e.radius + 0.16);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'enemy', enemy: e };
      }
      for (const o of this.list) {
        if (!o.alive || o.owner !== 'enemy') continue;
        const t = segCircle(x0, z0, x1, z1, o.x, o.z, 0.28);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'bullet', other: o };
      }
      // an enemy grenade in the air: met where it is over the floor, whatever its height
      for (const gr of game.grenades.list) {
        if (gr.owner !== 'enemy' || gr.landed) continue;
        const t = segCircle(x0, z0, x1, z1, gr.x, gr.z, gr.lob.hitRadius);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'grenade', grenade: gr };
      }
    } else {
      const p = game.player;
      if (p.alive && !p.spinning && !p.sliding) {
        const t = segCircle(x0, z0, x1, z1, p.x, p.z, PLAYER.hitRadius);
        if (t >= 0 && (!best || t < best.t)) best = { t, type: 'player' };
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
      case 'grenade':
        game.grenades.airburst(hit.grenade);
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

  checkCloseCall(b, sx, sz) {
    const p = this.game.player;
    if (!p.alive) return;
    const d2 = pointSegDist2(p.x, p.z, sx, sz, b.x, b.z);
    if (d2 < 1.1 * 1.1) {
      b.near = true;
      if ((p.spinning || p.sliding) && d2 < 0.5 * 0.5) b.dodgedSpin = true;
      return;
    }
    if (b.near && !b.awarded) {
      // The bullet has passed the player without hitting.
      const dot = (b.x - p.x) * b.dx + (b.z - p.z) * b.dz;
      if (dot > 0) {
        b.awarded = true;
        this.game.onCloseCall(b.dodgedSpin);
      }
    }
  }
}
