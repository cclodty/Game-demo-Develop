// 同一水平 ① (DECISIONS 2026-10-22): the player and the enemies fight on one
// level. Every map lists its zones (maps.js `zones`): flat floors, each at one
// height; what lies between them (大三巴's steps) is a way from one to another.
// Two people are on one level when the ground under them differs by at most
// LEVELS.tol (config.js; Senado's sunk fountain ring is within it). Across more,
// an enemy neither aims nor fires nor throws: he walks to the player's level.
// A bullet, the player's or an enemy's, stops where the ground under it has
// risen or fallen more than that from where it was fired (the edge of a step).
// No map sends a man up to a balcony or a grandstand any more (perches), and a
// beat plays out on the player's level. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../src/config.js';
import { MAPS } from '../src/maps.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

const groundOf = (m) => (m.ground ? (x, z) => m.ground(x, z) : () => 0);
const inBox = ([x0, z0, x1, z1], x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const zoneOf = (m, x, z) => m.zones.find((zn) => inBox(zn.box, x, z));

test('every map has its zones, each one flat at its height; doors, stages, the boss and the weapon pads are in one; no perches anywhere', () => {
  for (const m of MAPS) {
    assert.ok(Array.isArray(m.zones) && m.zones.length >= 1, `${m.id}: zones`);
    const g = groundOf(m);
    for (const zn of m.zones) {
      const [x0, z0, x1, z1] = zn.box;
      assert.ok(x1 > x0 && z1 > z0 && zn.name && zn.en, `${m.id}/${zn.id}: a box and a name`);
      let worst = 0;
      for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) worst = Math.max(worst, Math.abs(g(x, z) - zn.y));
      assert.ok(worst <= LEVELS.tol, `${m.id}/${zn.id}: the floor is ${zn.y} m within ${LEVELS.tol} (off by ${worst.toFixed(2)})`);
    }
    const where = (what, x, z) => assert.ok(zoneOf(m, x, z), `${m.id}: ${what} (${x}, ${z}) is in a zone`);
    for (const s of m.spawns) where('the way in from a door', s.ex, s.ez);
    for (const st of m.stages || []) where(`the stage ${st.name}`, ...st.at);
    for (const [x, z] of m.pads || []) where('a weapon pad', x, z);
    if (m.boss) {
      for (const p of m.boss.perches || []) {
        where('a boss perch', p[0], p[1]);
        assert.ok((p[2] || 0) <= LEVELS.tol, `${m.id}: the boss's perch at (${p[0]}, ${p[1]}) is on the floor, not ${p[2]} m up`);
      }
      if (m.boss.at) where('where the boss stands', ...m.boss.at);
      if (m.boss.pad) where('the boss pad', ...m.boss.pad);
    }
    assert.ok(!m.perches || !m.perches.length, `${m.id}: nobody is sent up to a balcony or a grandstand`);
  }
});

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=51'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on map `id`, the player at (x, z). */
    window.begin = (id, x, z) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(g.maps.findIndex((m) => m.id === id));
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** 120 Hz steps, the player held still and kept alive, aiming at (ax, az); `fire` holds the left button. */
    window.play = (n, ax, az, fire = false) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.vx = p.vz = 0;
        p.hp = 100;
        g.input.pressed.clear();
        g.input.mouse.left = fire;
        g.aimPoint.set(ax, g.aimPoint.y, az);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.mouse.left = false;
    };
    /** An enemy of `type` at (x, z), out of his door, ready to fire. */
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1 });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = 0;
      return e;
    };
    window.enemyShots = () => g.bullets.list.filter((b) => b.alive && b.owner === 'enemy').length;
  });
});
after(async () => {
  await h.close();
});

test('大三巴: a man on the forecourt neither aims at nor fires on the player up on the terrace, and comes up the steps; on one level he fires', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin('ruins', -4, -12);
    const e = window.post('grunt', -2, 46);
    let aimed = 0;
    let shots = 0;
    let nearest = e.z;
    for (let i = 0; i < 120 * 6; i++) {
      window.play(1, -4, -16);
      if (e.aiming) aimed++;
      shots = Math.max(shots, window.enemyShots());
      nearest = Math.min(nearest, e.z);
    }
    const apart = { aimed, shots, los: e.los, nearest, same: g.level.sameLevel(e.x, e.z, -4, -12) };
    // the same man on the forecourt with the player: he fires
    window.begin('ruins', -4, 56);
    const f = window.post('grunt', -2, 46);
    let fired = 0;
    for (let i = 0; i < 120 * 4 && !fired; i++) {
      window.play(1, -4, 52);
      fired = window.enemyShots();
    }
    return { apart, fired, losTogether: f.los };
  });
  assert.equal(r.apart.same, false, 'the forecourt and the terrace are two levels');
  assert.equal(r.apart.los, false, 'he does not see the player up there');
  assert.equal(r.apart.aimed, 0, 'no laser on the player');
  assert.equal(r.apart.shots, 0, 'no shot');
  assert.ok(r.apart.nearest < 38, `he comes up the steps (z ${r.apart.nearest.toFixed(1)})`);
  assert.ok(r.fired > 0, 'on the forecourt together, he fires');
  assert.deepEqual(problems(logs), []);
});

test('大三巴: the player’s shot from the forecourt stops at the edge of the steps; from up on the terrace it stops where the steps fall away; on one level it flies on', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    const fly = (x, z, dx, dz) => {
      const b = g.bullets.spawn({ x, z, dx, dz, speed: 60, owner: 'player', damage: 1 });
      let n = 0;
      while (b.alive && n++ < 240) g.bullets.update(1 / 120);
      return { alive: b.alive, z: b.z, ground: L.groundY(b.x, b.z) };
    };
    window.begin('ruins', -4, 50);
    const up = fly(-4, 42, 0, -1); // north, at the steps
    window.begin('ruins', -4, -12);
    const down = fly(-4, -8, 0, 1); // south, off the terrace
    window.begin('ruins', -4, 50);
    const across = fly(-11, 40, 1, 0); // east, along the forecourt
    return { up, down, across, tol: window.game.level.tol };
  });
  assert.equal(r.up.alive, false);
  assert.ok(r.up.z > 34 && r.up.z < 38.1, `up the steps it stopped at the first flight (z ${r.up.z.toFixed(2)}, ${r.up.ground.toFixed(2)} m up)`);
  assert.equal(r.down.alive, false);
  assert.ok(r.down.z > -4.6 && r.down.z < 0, `off the terrace it stopped at the top flight (z ${r.down.z.toFixed(2)})`);
  assert.ok(r.across.alive === false && Math.abs(r.across.ground) < 0.01, 'along the forecourt it flies until it meets something on that level');
  assert.deepEqual(problems(logs), []);
});

test('議事亭: in the sunk ring round the fountain (0.48 m down) a man still fires at the player on the square: one level', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const [fx, fz] = [0.19, 37.71]; // the fountain's middle in the game (assets/maps/senado.json)
    window.begin('senado', fx + 14, fz);
    const e = window.post('grunt', fx + 5.3, fz);
    let fired = 0;
    for (let i = 0; i < 120 * 4 && !fired; i++) {
      window.play(1, fx + 10, fz);
      fired = window.enemyShots();
    }
    return { fired, ground: g.level.groundY(e.x, e.z), same: g.level.sameLevel(e.x, e.z, g.player.x, g.player.z) };
  });
  assert.ok(r.ground < -0.3, `he stands in the ring (${r.ground.toFixed(2)} m)`);
  assert.equal(r.same, true);
  assert.ok(r.fired > 0, 'and fires');
  assert.deepEqual(problems(logs), []);
});

test('a beat plays out on the player’s level: on the terrace of 大三巴 its stage and its doors are up there', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    const seen = [];
    // on the terrace, on the forecourt, and on the steps (at the top flight, nearest the terrace; at the foot, the forecourt)
    for (const [x, z] of [[-4, -12], [-4, 50], [-4, -2], [-4, 34]]) {
      window.begin('ruins', x, z);
      g.waves.wave = 1;
      g.waves.startWave(); // wave 2: beats, no boss
      for (let k = 0; k < 3; k++) {
        const spots = g.waves.pickSpots(g.waves.beats[k] || g.waves.beats[0]);
        g.waves.beatI++;
        seen.push({ at: [x, z], player: L.nearestZone(x, z).id, stage: g.waves.stage ? L.zoneAt(...g.waves.stage.at).id : null, doors: spots.map((s) => L.zoneAt(s.ex, s.ez).id) });
      }
      // and a man in the wave's stream (not a beat) comes in through a door on the player's level too
      for (let k = 0; k < 4; k++) {
        const sp = g.waves.pickSpawn('grunt');
        seen.push({ at: [x, z], player: L.nearestZone(x, z).id, stage: L.nearestZone(x, z).id, doors: [L.zoneAt(sp.ex, sp.ez).id, L.zoneAt(sp.ex, sp.ez).id], stream: true });
      }
    }
    return seen;
  });
  assert.ok(r.some((s) => s.player === 'terrace' && s.at[1] === -2) && r.some((s) => s.player === 'forecourt' && s.at[1] === 34), 'on the steps, the nearest zone');
  for (const s of r) {
    assert.equal(s.stage, s.player, `the stage is on the player's level (${JSON.stringify(s)})`);
    assert.deepEqual(s.doors, [s.player, s.player], `and so are its doors (${JSON.stringify(s)})`);
  }
  assert.deepEqual(problems(logs), []);
});

test('the zones of a map are joined: from each one a man can walk to every other (大三巴: up the steps or round through the arches)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = [];
    for (const m of g.maps) {
      if (!m.zones || m.zones.length < 2) continue;
      window.begin(m.id, ...m.start);
      const L = g.level;
      // a walkable point near the middle of each zone
      const mids = L.zones.map((zn) => {
        const [x0, z0, x1, z1] = zn.box;
        const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
        let best = null;
        for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) if (L.nav.isWalkable(x, z) && (!best || Math.hypot(x - cx, z - cz) < Math.hypot(best[0] - cx, best[1] - cz))) best = [x, z];
        return { id: zn.id, at: best };
      });
      for (const a of mids) {
        for (const b of mids) {
          if (a === b) continue;
          const path = L.nav.findPath(...a.at, ...b.at);
          const end = path && path[path.length - 1];
          out.push({ map: m.id, from: a.id, to: b.id, ok: !!end && L.zoneAt(end.x, end.z) && L.zoneAt(end.x, end.z).id === b.id });
        }
      }
    }
    return out;
  });
  assert.ok(r.length >= 2, `maps with more than one zone checked (${r.length} pairs)`);
  for (const p of r) assert.ok(p.ok, `${p.map}: from ${p.from} to ${p.to} on foot`);
  assert.deepEqual(problems(logs), []);
});

test('a boss’s perches are places to stand: on the walkable grid, which leaves room for a body (one inside a wall’s margin has her circling it)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = [];
    for (const m of g.maps) {
      const defs = m.boss ? (m.boss.pair || [m.boss]) : [];
      if (!defs.some((d) => d.perches)) continue;
      window.begin(m.id, ...m.start);
      const L = g.level;
      for (const d of defs) for (const [x, z] of d.perches || []) out.push({ map: m.id, at: [x, z], clear: L.nav.isWalkable(x, z) });
    }
    return out;
  });
  assert.ok(r.length >= 4, `perches checked (${r.length})`);
  for (const p of r) assert.ok(p.clear, `${p.map}: the perch at (${p.at}) is clear`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the player’s burst from 大三巴’s forecourt stops in a puff of stone at the foot of the steps', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin('ruins', -4, 44);
    g.view = 0;
    let stopped = 0;
    let fired = 0;
    let flying = new Set();
    for (let i = 0; i < 120 && stopped < 2; i++) {
      window.play(1, -4, 30, true); // north, up the steps
      const now = new Set(g.bullets.list.filter((b) => b.owner === 'player' && b.alive));
      for (const b of now) if (!flying.has(b)) fired++;
      for (const b of flying) if (!b.alive && b.z > 33 && b.z < 39) stopped++;
      flying = now;
    }
    g.present(1 / 60);
    g.render();
    return { fired, stopped };
  });
  await page.screenshot({ path: new URL('levels-step-edge.png', OUT).pathname });
  assert.ok(r.fired > 0 && r.stopped > 0, `the shots stopped at the steps (${r.stopped} of ${r.fired})`);
  assert.deepEqual(problems(logs), []);
});

test('福隆新街 and 東望洋跑道: three waves, and nobody goes up to a balcony or the grandstand', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = {};
    for (const id of ['felicidade', 'guia']) {
      window.begin(id, 0, 0);
      let up = 0;
      for (let w = 1; w <= 3; w++) {
        g.enemies.clear();
        g.waves.wave = w - 1;
        g.waves.startWave();
        for (let i = 0; i < 120 * 20; i++) {
          window.play(1, 0, -5);
          up = Math.max(up, g.enemies.list.filter((e) => e.alive && e.perch > 0).length);
          if (g.waves.state !== 'active') break;
        }
      }
      out[id] = { up, balconies: g.level.balconies.length };
    }
    return out;
  });
  for (const id of ['felicidade', 'guia']) {
    assert.equal(r[id].balconies, 0, `${id}: no balcony to send a man to`);
    assert.equal(r[id].up, 0, `${id}: nobody up`);
  }
  await page.screenshot({ path: new URL('levels.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
