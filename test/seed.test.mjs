// Seeded runs: with ?seed=321 the bot plays 600 frames and gets the same wave
// rosters, the same spawn points and the same enemy shots, at the same moments,
// in a second page and after a restart in the same page. Without a seed every
// run differs. Effects have their own RNG: switching them all off and
// reseeding that RNG leaves the run exactly as it was.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, problems } from './helpers.mjs';

const FRAMES = 600;
let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** Record what the game's RNG decides: wave rosters, spawn points, enemy shots. */
async function installTrace(page) {
  await page.evaluate(() => {
    const g = window.game;
    window.trace = { waves: [], spawns: [], shots: [] };
    const compose0 = g.waves.compose.bind(g.waves);
    g.waves.compose = (n) => {
      const list = compose0(n);
      window.trace.waves.push(list.join(' '));
      return list;
    };
    const spawn0 = g.enemies.spawn.bind(g.enemies);
    g.enemies.spawn = (type, sp) => {
      window.trace.spawns.push(`${type}@${g.level.spawns.indexOf(sp)}`);
      return spawn0(type, sp);
    };
    const shot0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.owner === 'enemy') window.trace.shots.push([g.worldTime, o.x, o.z, o.dx, o.dz, o.speed]);
      return shot0(o);
    };
  });
}

/** Start a run on the rooftop and let the (seeded) bot play it; returns the trace and the end state. */
async function play(page) {
  await installBot(page, { map: 0, view: 2, seed: 7 });
  return page.evaluate((frames) => {
    const g = window.game;
    const t = (window.trace = { waves: [], spawns: [], shots: [] });
    const ok = window.simStep(frames);
    const p = g.player;
    return {
      ok,
      errors: window.stats.errors,
      seed: g.rng.seed,
      ...t,
      firstShot: t.shots.length ? t.shots[0][0] : null,
      end: {
        wave: g.waves.wave,
        kills: g.score.kills,
        score: g.score.score,
        player: [p.x, p.z, p.hp, p.ammo],
        enemies: g.enemies.list.map((e) => [e.type, e.state, e.x, e.z, e.hp]),
        pads: g.pickups.list.map((q) => q.kind),
      },
    };
  }, FRAMES);
}

const brief = (r) => `seed ${r.seed}: waves [${r.waves.join(' | ')}], spawns ${r.spawns.join(' ')}, ${r.shots.length} enemy shots, first at ${r.firstShot?.toFixed(3)} s`;

/** The trace must hold real decisions, or "the same" proves nothing. */
function assertEventful(r) {
  assert.ok(r.ok, r.errors[0]);
  assert.ok(r.waves.length >= 1, 'no wave started');
  assert.ok(r.spawns.length >= 3, `only ${r.spawns.length} spawns`);
  assert.ok(r.shots.length >= 1, `no enemy fired in ${FRAMES} frames`);
}

test('?seed=321 plays the same run in a second page and after a restart', { timeout: 10 * 60 * 1000 }, async () => {
  const a = await h.open('?seed=321');
  // stop the first page's frame loop (the bot would anyway): two SwiftShader pages
  // rendering at once starved the second one's load past the harness timeout
  await a.page.evaluate(() => {
    window.game.frame = () => {};
  });
  let b;
  try {
    b = await h.open('?seed=321');
    await installTrace(a.page);
    await installTrace(b.page);
    const a1 = await play(a.page);
    const b1 = await play(b.page);
    const a2 = await play(a.page); // R from the pause menu: same page, a fresh run
    console.log(brief(a1));
    assertEventful(a1);
    assert.equal(a1.seed, 321);
    assert.deepEqual(b1, a1, 'a second page with the same seed played a different run');
    assert.deepEqual(a2, a1, 'restarting with the same seed played a different run');
    assert.deepEqual(problems([...a.logs, ...b.logs]), []);
  } finally {
    await a.page.close();
    if (b) await b.page.close();
  }
});

test('without a seed every run is different', { timeout: 10 * 60 * 1000 }, async () => {
  const { page, logs } = await h.open();
  try {
    await installTrace(page);
    const r1 = await play(page);
    const r2 = await play(page);
    assert.ok(r1.ok && r2.ok, r1.errors[0] || r2.errors[0]);
    assert.notEqual(r1.seed, r2.seed);
    // the bot plays both runs the same way, so any difference comes from the game's RNG
    // (wave 1 is always four thugs, so compare where they came from and what they did)
    const run = ({ spawns, shots, end }) => ({ spawns, shots, end });
    assert.notDeepEqual(run(r1), run(r2));
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('effects have their own RNG: with every effect off the seeded run is unchanged', { timeout: 10 * 60 * 1000 }, async () => {
  const { page, logs } = await h.open('?seed=321');
  try {
    await installTrace(page);
    const reference = await play(page);
    assertEventful(reference);
    const stubbed = await page.evaluate(() => {
      const g = window.game;
      const fx = g.fx;
      const off = [];
      // every spawning method (sparks, blood, decals, flashes, explosions…) and every particle pool
      for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(fx))) {
        if (k === 'constructor' || k === 'update' || k === 'clear') continue;
        fx[k] = () => {};
        off.push(k);
      }
      for (const [k, v] of Object.entries(fx)) {
        if (v && typeof v.spawn === 'function') {
          v.spawn = () => {};
          off.push(`${k}.spawn`);
        }
      }
      g.vfxRng.reset(999); // and whatever still draws effect numbers (pigeons, sounds) gets other ones
      return off;
    });
    assert.ok(stubbed.includes('blood') && stubbed.includes('glow.spawn'), `stubbed only ${stubbed.join(', ')}`);
    const r = await play(page); // the same seed again, now without effects
    assert.deepEqual(r, reference, 'switching effects off changed the game');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
