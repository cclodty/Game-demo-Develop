// Enemy tactics (敵人掩體與包抄): a gunner with a box of cover near goes
// behind it, ducks, and fights by stepping out; a pair of blades split up and
// arrive from two sides; brutes, shields, snipers, grenadiers and drones keep
// their old ways. Numbers in config.js AI. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=7'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    // a quiet rooftop: the run started, the waves parked, nobody else about, the player at the start
    window.setup = () => {
      g.setRules('normal', []);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = 0;
      p.z = 4;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    // one logic step; the player stays put and alive, no kill-cam or hit-stop slows the clock
    window.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.hp = 100;
        p.x = 0;
        p.z = 4;
        p.vx = p.vz = 0;
        g.aimPoint.set(0, g.aimPoint.y, -1);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
    };
    // an enemy already through its entrance
    window.spawnAt = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1 });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      return e;
    };
    window.los = (e) => g.level.hasLOS(e.x, e.z, g.player.x, g.player.z);
  });
});
after(async () => {
  await h.close();
});

test('the type table says who takes cover, who flanks and who just advances', async () => {
  const t = await page.evaluate(() => Object.fromEntries(Object.entries(window.game.enemyTypes).map(([k, v]) => [k, v.tactic || null])));
  assert.deepEqual(t, { grunt: 'cover', shotgun: 'cover', rifle: 'cover', rusher: 'flank', brute: 'advance', shield: 'advance', bomber: 'flank', grenadier: null, sniper: null, drone: null });
});

test('a rifleman with a box between him and the player goes behind it, ducks, and shoots only from a step out', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.setup();
    // a box of cover on the helipad, between the player (0, 4) and where the rifleman comes in
    const box = L.addBox(0, -1.5, 2.4, 1.2, 1.3, L.mat.concrete, 'wall');
    L.rebuildNav();
    // cover is for groups (the last man standing comes on): a second man, parked far off
    const other = window.spawnAt('grunt', 18, 10);
    other.update = () => {};
    const e = window.spawnAt('rifle', -3, -7);
    const los0 = window.los(e);
    let n = 0;
    while (e.state !== 'duck' && n < 360) {
      window.step();
      n++;
    }
    const reached = n / 120;
    // the cover he chose (the box, or another piece of the rooftop that hides him as well): he stands right behind it
    const s = e.cover ? e.cover.solid : null;
    const toBox = s ? Math.hypot(Math.max(s.minX - e.x, 0, e.x - s.maxX), Math.max(s.minZ - e.z, 0, e.z - s.maxZ)) : Infinity;
    const hiddenAtDuck = !window.los(e);
    // then: no line of sight while ducked, one while firing
    let duck = 0;
    let duckExposed = 0;
    let fired = null;
    let shots = 0;
    const states = new Set();
    n = 0;
    while (fired === null && n < 2400) {
      window.step();
      n++;
      states.add(e.state);
      const los = window.los(e);
      if (e.state === 'duck') {
        duck++;
        if (los) duckExposed++;
      }
      if (e.state === 'fire') fired = los;
    }
    // the shot itself follows a step later
    for (let i = 0; i < 12; i++) {
      window.step();
      shots = Math.max(shots, g.bullets.list.filter((b) => b.alive && b.source === e).length);
    }
    // three shots from one spot and he leaves it; alone, he comes on instead of hiding
    n = 0;
    while (e.cover && n++ < 3000) window.step();
    const left = { shots: e.coverShots, rest: e.coverRest, t: n / 120 };
    other.die(0, 1, { cause: 'bullet' });
    window.step(480);
    const alone = { state: e.state, cover: !!e.cover };
    // the test's box goes away again
    L.solids = L.solids.filter((x) => x !== box);
    box.mesh.removeFromParent();
    L.rebuildNav();
    return { los0, reached, toBox, hiddenAtDuck, duck, duckExposed, fired, shots, states: [...states], state: e.state, left, alone };
  });
  assert.equal(r.los0, true, 'he could see the player where he came in');
  assert.ok(r.reached < 3, `behind the box within 3 s (${r.reached.toFixed(2)} s)`);
  assert.ok(r.toBox < 1, `within 1 m of the box (${r.toBox.toFixed(2)} m)`);
  assert.equal(r.hiddenAtDuck, true, 'the box hides him when he ducks');
  assert.ok(r.duck > 0 && r.duckExposed === 0, `never in sight while ducked (${r.duckExposed}/${r.duck} steps)`);
  assert.equal(r.fired, true, `he fired with a line of sight (states: ${r.states})`);
  assert.ok(r.shots > 0, 'a bullet left his rifle');
  assert.ok(r.states.includes('peek'), `he stepped out to shoot (${r.states})`);
  assert.ok(r.left.rest > 0 && r.left.t < 25, `after three shots he left the spot (${r.left.t.toFixed(1)} s, rest ${r.left.rest.toFixed(1)})`);
  assert.ok(!r.alone.cover && !['duck', 'peek'].includes(r.alone.state), `alone he does not hide (${r.alone.state})`);
  await page.evaluate(() => {
    // back behind the box for the picture
    const e = window.game.enemies.list[0];
    let n = 0;
    while (e.alive && e.state !== 'duck' && n++ < 600) window.step();
  });
  await snap(page, 'tactics-cover.png');
  assert.deepEqual(problems(logs), []);
});

test('a gunner who finds no cover fights as before', { timeout: 120000 }, async () => {
  const r = await page.evaluate(async () => {
    const { AI } = await import('/src/config.js');
    window.setup();
    // nothing to hide behind (the search radius is zero): the old approach-and-aim
    const search = AI.coverSearch;
    AI.coverSearch = 0;
    const e = window.spawnAt('grunt', 0, -4);
    let n = 0;
    const states = new Set();
    let fired = false;
    while (!fired && n < 1200) {
      window.step();
      n++;
      states.add(e.state);
      if (e.state === 'fire') fired = true;
    }
    AI.coverSearch = search;
    return { fired, states: [...states], cover: !!e.cover };
  });
  assert.equal(r.fired, true, `he shot (${r.states})`);
  assert.ok(!r.states.includes('duck'), `no cover to duck behind (${r.states})`);
  assert.deepEqual(problems(logs), []);
});

test('two blades split up and reach 5 m from two sides; one alone comes straight', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const bearing = (e) => Math.atan2(e.x - p.x, e.z - p.z);
    const diff = (a, b) => {
      let d = Math.abs(a - b) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      return (d * 180) / Math.PI;
    };
    window.setup();
    const a = window.spawnAt('rusher', 10, 0);
    const b = window.spawnAt('rusher', 10, 0.6);
    const at5 = {};
    let n = 0;
    while ((at5.a === undefined || at5.b === undefined) && n < 1200) {
      window.step();
      n++;
      if (at5.a === undefined && Math.hypot(a.x - p.x, a.z - p.z) <= 5) at5.a = bearing(a);
      if (at5.b === undefined && Math.hypot(b.x - p.x, b.z - p.z) <= 5) at5.b = bearing(b);
    }
    const pair = { sides: [a.flankSide, b.flankSide], diff: diff(at5.a, at5.b), t: n / 120 };
    // alone: the bearing hardly changes on the way in
    window.setup();
    const c = window.spawnAt('rusher', 10, 0);
    const b0 = bearing(c);
    let drift = 0;
    n = 0;
    while (Math.hypot(c.x - p.x, c.z - p.z) > 5 && n < 1200) {
      window.step();
      n++;
      drift = Math.max(drift, diff(bearing(c), b0));
    }
    return { pair, alone: { drift, t: n / 120 } };
  });
  assert.deepEqual([...r.pair.sides].sort(), [-1, 1], 'the pair took opposite sides');
  assert.ok(r.pair.diff >= 90, `seen from the player, ${r.pair.diff.toFixed(0)}° apart at 5 m`);
  assert.ok(r.pair.t < 6, `both arrived (${r.pair.t.toFixed(1)} s)`);
  assert.ok(r.alone.drift < 25, `alone he came straight (drift ${r.alone.drift.toFixed(0)}°)`);
  assert.deepEqual(problems(logs), []);
});

test('bullets live to the edge of the map, not a fixed 60 m: a shot at the far end of the Senado strip flies', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.setRules('normal', []);
    g.startRun(3); // the Senado strip: 148 m long
    g.waves.state = 'done';
    g.enemies.clear();
    const B = g.level.bounds;
    const z0 = B.halfD - 8; // well past 60 m from the centre
    const b = g.bullets.spawn({ x: 0, z: z0, dx: 0, dz: -1, speed: 20, owner: 'enemy', damage: 1, range: 70 });
    for (let i = 0; i < 12; i++) g.updatePlay(1 / 120);
    return { halfD: B.halfD, z0, alive: b.alive, flew: z0 - b.z };
  });
  assert.ok(r.z0 > 60, `the test stands beyond 60 m (${r.z0.toFixed(1)} of ${r.halfD})`);
  assert.equal(r.alive, true, 'the bullet is still flying');
  assert.ok(r.flew > 1, `it flew ${r.flew.toFixed(2)} m`);
  assert.deepEqual(problems(logs), []);
});
