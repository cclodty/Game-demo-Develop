// The rooftop boss, part one (頭目 ①): an arcade run whose last stage is the
// rooftop gets a helicopter as its final wave instead of the big last wave. It
// flies in and circles 8 m over the helipad, out of reach of bullets; its
// searchlight sweeps the roof, and a player who stays in the light for 1 s
// draws a red line onto that spot for 0.5 s and then a machine-gun burst there.
// Every 20 s two thugs rope down onto the pad. A five-segment bar shows its health.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=61'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** An arcade run from `startMap`, moved on to its third stage and the start of wave 12. */
    window.toFinal = (startMap) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(startMap);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.waves.wave = 11;
      g.waves.startWave();
    };
    /** One logic step; the player kept alive (and still, unless `still` is false). */
    window.step = (still = true) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      if (still) g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /** Steps until the helicopter has flown in. */
    window.arrive = () => {
      let n = 0;
      while (g.boss.t < 3.5 && n++ < 1000) window.step();
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 on the rooftop is the helicopter; on a last stage with no boss the big last wave stays', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { MAPS } = await import('/src/maps.js');
    const out = {};
    // every map has its boss now (boss.js): the docks' is taken away here, to see what a map without one gets
    const docksBoss = MAPS[2].boss;
    for (const start of [2, 0]) {
      if (start === 0) delete MAPS[2].boss;
      window.toFinal(start);
      g.hud.update(1 / 60);
      const bar = document.getElementById('boss-bar');
      out[g.level.map.id] = {
        boss: g.boss.active,
        queue: g.waves.queue.length,
        brutes: g.waves.queue.filter((t) => t === 'brute').length,
        bar: !bar.classList.contains('hidden'),
        segs: bar.querySelectorAll('.boss-segs i:not(.lost)').length,
        banner: document.getElementById('banner').textContent,
      };
    }
    MAPS[2].boss = docksBoss;
    return out;
  });
  assert.deepEqual(r.rooftop, { boss: true, queue: 0, brutes: 0, bar: true, segs: 5, banner: r.rooftop.banner });
  assert.match(r.rooftop.banner, /BOSS/);
  assert.equal(r.docks.boss, false, 'a run ending on a map without a boss has none');
  assert.ok(r.docks.queue > 20 && r.docks.brutes >= 1, `the big last wave (${r.docks.queue})`);
  assert.equal(r.docks.bar, false);
  assert.doesNotMatch(r.docks.banner, /BOSS/);
});

test('caught in the light for 1 s: a red line on the spot for 0.5 s, then a burst there; leave the light in time and nothing comes', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal(2);
    window.arrive();
    // walk into the light and stand
    const p = g.player;
    p.x = b.spot.x;
    p.z = b.spot.z;
    const at = { x: p.x, z: p.z };
    let n = 0;
    while (b.state === 'search' && n++ < 400) window.step();
    const caught = n;
    const lock = { ...b.lock };
    const laser = b.laser.mesh.visible;
    n = 0;
    while (b.state === 'warn' && n++ < 400) window.step();
    const warned = n;
    const shots = [];
    n = 0;
    while (b.state === 'fire' && n++ < 400) {
      const before = new Set(g.bullets.list);
      window.step();
      for (const x of g.bullets.list) if (!before.has(x) && x.source === b) shots.push(x);
    }
    const ends = shots.map((x) => {
      const ex = x.x + x.dx * (x.range - x.traveled);
      const ez = x.z + x.dz * (x.range - x.traveled);
      return Math.hypot(ex - lock.x, ez - lock.z);
    });
    // a second time: in the light for 0.6 s, then away
    n = 0;
    while (b.state !== 'search' && n++ < 1000) window.step();
    p.x = b.spot.x;
    p.z = b.spot.z;
    for (let i = 0; i < 72; i++) window.step();
    const litBefore = b.litT;
    p.x = b.spot.x + (b.spot.x > 0 ? -12 : 12);
    let warnedAgain = false;
    for (let i = 0; i < 120; i++) {
      window.step();
      if (b.state !== 'search') warnedAgain = true;
    }
    return { caught: caught / 120, lock, at, laser, warned: warned / 120, shots: shots.length, over: shots.every((x) => x.over >= 8), far: Math.max(...ends), litBefore, litAfter: b.litT, warnedAgain };
  });
  assert.ok(Math.abs(r.caught - 1) <= 1 / 120 + 1e-9, `1 s in the light (${r.caught})`);
  assert.ok(Math.hypot(r.lock.x - r.at.x, r.lock.z - r.at.z) < 0.01, 'the gun takes the spot where the player stood');
  assert.equal(r.laser, true, 'a red line on it');
  assert.ok(Math.abs(r.warned - 0.5) <= 1 / 120 + 1e-9, `0.5 s of warning (${r.warned})`);
  assert.equal(r.shots, 12, 'then a burst of 12');
  assert.equal(r.over, true, 'fired from above: over all cover');
  assert.ok(r.far < 1.2 + 1.6, `all of it around the spot (${r.far.toFixed(2)} m)`);
  assert.ok(r.litBefore > 0.55 && r.litBefore < 1, `0.6 s in the light (${r.litBefore})`);
  assert.equal(r.litAfter, 0, 'out of it, the count starts over');
  assert.equal(r.warnedAgain, false, 'and nothing comes');
});

test('two thugs rope down every 20 s; bullets go under the helicopter', { timeout: 300000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal(2);
    window.arrive();
    const t0 = b.t;
    const drops = [];
    const seen = new Set();
    let descent = null;
    for (let i = 0; i < 120 * 46; i++) {
      window.step(false);
      for (const e of g.enemies.list) {
        if (seen.has(e) || !e.sp.rappel) continue;
        seen.add(e);
        drops.push(Math.round((b.t - t0) * 120) / 120);
        if (!descent) descent = { e, y0: e.y, lock: e.spawnLock, ys: [] };
      }
      if (descent && descent.ys.length < 200) descent.ys.push([descent.e.y, descent.e.state]);
      // they land and are dealt with, so the cap never holds them back
      for (const e of g.enemies.list) if (e.alive && e.sp.rappel && e.rappelT <= 0) e.die(0, 1, { cause: 'bullet' });
    }
    const landed = descent.ys.findIndex(([y]) => y === 0);
    // a bullet straight through where the helicopter is, over the floor
    const hp = b.hp;
    g.enemies.clear();
    const bx = b.x;
    const shot = g.bullets.spawn({ x: bx - 2, z: b.z, dx: 1, dz: 0, speed: 62, owner: 'player', damage: 1 });
    // follow it while it lives (the pool reuses a spent bullet)
    let furthest = -Infinity;
    for (let i = 0; i < 30 && shot.alive; i++) {
      window.step();
      if (shot.alive) furthest = Math.max(furthest, shot.x - bx);
    }
    return { drops, y0: descent.y0, lock: descent.lock, landed: landed / 120, stateAfter: descent.ys[landed + 2][1], hp, hpAfter: b.hp, passed: furthest > 0.5 };
  });
  assert.deepEqual(r.drops.length, 6, `two at a time (${r.drops})`);
  const times = [...new Set(r.drops)];
  assert.equal(times.length, 3);
  assert.ok(Math.abs(times[0] - 5) <= 1 / 60, `the first 5 s after it arrives (${times[0]})`);
  assert.ok(Math.abs(times[1] - times[0] - 20) <= 1 / 60 && Math.abs(times[2] - times[1] - 20) <= 1 / 60, `then every 20 s (${times})`);
  assert.equal(r.y0, 7, 'from just under it');
  assert.ok(Math.abs(r.landed - 1.4) <= 1 / 60, `1.4 s on the rope (${r.landed})`);
  assert.equal(r.lock, 1.4, 'untouchable on the rope');
  assert.equal(r.stateAfter, 'move', 'then on his way');
  assert.deepEqual([r.hp, r.hpAfter], [5, 5], 'a bullet does nothing to it');
  assert.equal(r.passed, true, 'and goes on under it');
});

test('the helicopter over the roof stays inside the render budget; a screenshot of the light on the player', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal(2);
    window.arrive();
    g.player.x = b.spot.x;
    g.player.z = b.spot.z;
    let n = 0;
    while (b.state !== 'warn' && n++ < 400) window.step();
    for (let i = 0; i < 30; i++) window.step();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return { calls: info.calls, tris: info.triangles, budget: g.level.map.budget, state: b.state };
  });
  await page.screenshot({ path: new URL('boss-heli.png', OUT).pathname });
  assert.equal(r.state, 'warn');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});
