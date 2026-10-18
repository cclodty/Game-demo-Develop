// Forked streams (確定性 ③：分流播種). Each wave's roster, spawn order, pacing
// and weapon pads come from a stream forked off the run's seed and the wave
// number, so the same seed played two different ways meets the same twelve
// waves (the daily challenge needs that). Enemy decisions, bullet spread and
// drops stay on the main stream, which the two ways of playing pull apart.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../src/rng.js';
import { gameHarness, problems } from './helpers.mjs';

test('fork: a named stream from the seed alone, however far the main stream has been drawn', () => {
  const seq = (r, n = 6) => Array.from({ length: n }, () => r.next());
  const a = new Rng(5);
  const before = seq(a.fork('wave', 3));
  for (let i = 0; i < 1000; i++) a.next();
  assert.deepEqual(seq(a.fork('wave', 3)), before, 'the main stream does not move it');
  assert.deepEqual(seq(new Rng(5).fork('wave', 3)), before, 'another Rng with the seed forks the same');
  assert.notDeepEqual(seq(new Rng(5).fork('wave', 4)), before, 'another wave, another stream');
  assert.notDeepEqual(seq(new Rng(6).fork('wave', 3)), before, 'another seed, another stream');
  assert.notDeepEqual(seq(new Rng(5).fork('pads', 3)), before, 'another name, another stream');
  // forking does not draw from the main stream
  const b = new Rng(9);
  const c = new Rng(9);
  b.fork('wave', 1);
  assert.equal(b.next(), c.next());
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/**
 * Play an arcade run on the rooftop to the end of wave 12 in god mode, every enemy shot down as it
 * arrives, and collect what each wave brought: its roster, spawn order, the points enemies came
 * through (with where the player stood when each was picked), and the pads. 'still' does nothing;
 * 'shooter' shoots on the spot; 'busy' shoots, spins (a spin carries the player along) and strafes.
 */
const playRun = (page, style) =>
  page.evaluate(async (style) => {
    const { TYPES } = await import('/src/enemies.js');
    const g = window.game;
    g.frame = () => {};
    g.startRun(0);
    const waves = [];
    const start0 = g.waves.startWave.bind(g.waves);
    g.waves.startWave = () => {
      start0();
      const w = g.waves;
      waves.push({ n: w.wave, map: g.level.map.id, roster: [...w.queue], order: [...w.order], doors: g.level.spawns.map((sp) => [sp.ex, sp.ez]), picks: [], pads: g.level.pads.map((p) => p.pickup && p.pickup.kind) });
    };
    const pick0 = g.waves.pickSpawn.bind(g.waves);
    g.waves.pickSpawn = (type) => {
      const from = g.waves.orderI;
      const sp = pick0(type);
      const min = (TYPES[type] && TYPES[type].spawn && TYPES[type].spawn.minDist) || 9; // a sniper wants a far door
      waves.at(-1).picks.push({ from, min, at: g.level.spawns.indexOf(sp), px: g.player.x, pz: g.player.z });
      return sp;
    };
    const inp = g.input;
    let frame = 0;
    while (g.waves.state !== 'done' && frame < 60 * 60 * 12) {
      frame++;
      g.player.hp = 100;
      g.player.invuln = 1;
      inp.keys.clear();
      if (style !== 'still') {
        if (style === 'busy') inp.keys.add(Math.floor(frame / 12) % 2 ? 'KeyA' : 'KeyD'); // a small strafe, back and forth
        inp.mouse.left = frame % 40 < 25;
        if (style === 'busy' && frame % 150 === 0) inp.pressed.add('Space');
      }
      for (const e of g.enemies.list) if (e.alive && e.spawnLock <= 0) e.die(0, 1, { cause: 'bullet' });
      g.updatePlay(1 / 60);
    }
    inp.mouse.left = false;
    return { waves, frames: frame, state: g.waves.state, main: g.rng.state };
  }, style);

test('the same seed played three ways meets the same twelve waves: rosters, spawn order, pads; the same doors unless the player walks up to one', { timeout: 900000 }, async () => {
  const { page, logs } = await h.open('?seed=77');
  try {
    const still = await playRun(page, 'still');
    const shooter = await playRun(page, 'shooter');
    const busy = await playRun(page, 'busy');
    for (const r of [still, shooter, busy]) assert.equal(r.state, 'done', `the run reached the end (${r.frames} frames)`);
    assert.notEqual(shooter.main, still.main, 'shooting pulled the main stream apart');
    assert.notEqual(busy.main, still.main);
    assert.equal(still.waves.length, 12);
    const doors = (r) => r.waves.map((w) => w.picks.map((p) => p.at));
    for (const r of [shooter, busy]) {
      for (let i = 0; i < 12; i++) {
        const a = r.waves[i];
        const b = still.waves[i];
        assert.equal(a.map, b.map, `wave ${i + 1}: map`);
        assert.deepEqual(a.roster, b.roster, `wave ${i + 1}: roster`);
        assert.deepEqual(a.order, b.order, `wave ${i + 1}: spawn order`);
        assert.deepEqual(a.pads, b.pads, `wave ${i + 1}: pads`);
      }
    }
    // standing still or shooting on the spot: the very same doors, in the wave's order
    assert.deepEqual(doors(shooter), doors(still), 'the same doors when the player stays put');
    for (const w of still.waves.slice(0, 4)) {
      // the rooftop (waves 1-4): every door suits a player at the start, so the doors are the order itself
      assert.deepEqual(
        w.picks.map((p) => p.at),
        w.picks.map((_, k) => w.order[k % w.order.length]),
        `wave ${w.n}: the order, door by door`,
      );
    }
    // walking about: each enemy takes the next door in the order that is 9–45 m from the player (a sniper: 18–45 m)
    let moved = 0;
    for (const w of busy.waves) {
      for (const p of w.picks) {
        const d = (i) => Math.hypot(w.doors[i][0] - p.px, w.doors[i][1] - p.pz);
        let want = -1;
        for (let k = 0; k < w.order.length && want < 0; k++) {
          const i = w.order[(p.from + k) % w.order.length];
          if (d(i) > p.min && d(i) < 45) want = i;
        }
        if (want >= 0) assert.equal(p.at, want, `wave ${w.n}: the next door that suits`);
        if (p.at !== w.order[p.from % w.order.length]) moved++;
      }
    }
    assert.ok(moved > 0, 'walking up to a door did move an enemy on to the next one');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
