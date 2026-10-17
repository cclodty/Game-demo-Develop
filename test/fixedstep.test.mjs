// Fixed logic steps and the input record. A seeded bot plays 30 s at 60 Hz
// (pressing V halfway, so the camera swings) while every step's input is
// recorded; the record is then fed back at 60 Hz, at 144 Hz and at uneven
// frame times, and each time the score and the player's position match the
// original run step for step and the replay records the very same input.
// Also: a press in a frame that runs no logic step waits for the next step
// and counts once; the stats panel shows the step count; a ten-minute run's
// record stays under 100 KB.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, problems } from './helpers.mjs';

const HZ = 120;
const HEADER = 13;
let h;
let page;
let logs;
let live;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=123'));
  // every logic step appends [score, x, z] to window.trace
  await page.evaluate(() => {
    const g = window.game;
    window.trace = [];
    const step0 = g.step.bind(g);
    g.step = () => {
      step0();
      window.trace.push([g.score.score, g.player.x, g.player.z]);
    };
  });
});
after(async () => {
  await h.close();
});

/** Feed the recorded bytes back, one display frame of `dt` seconds at a time ('uneven': 4-40 ms, seeded). */
function replay(bytes, dt) {
  return page.evaluate(
    async ([bytes, dt]) => {
      const g = window.game;
      const { RecordReader } = await import('/src/replay.js');
      const rd = new RecordReader(Uint8Array.from(bytes));
      g.fixedSeed = rd.seed;
      g.startRun(rd.map);
      g.feed = (game) => rd.next(game.player.x, game.player.z);
      window.trace = [];
      const frames = new g.rng.constructor(99);
      let maxSteps = 0;
      let idleFrames = 0;
      // stop a few steps short: one frame runs up to six, and the record must not run dry mid-frame
      while (g.stepCount < rd.steps - 8 && (g.state === 'playing' || g.state === 'dying')) {
        g.updateAim();
        g.updatePlay(dt === 'uneven' ? frames.range(0.004, 0.04) : dt);
        maxSteps = Math.max(maxSteps, g.frameSteps);
        if (g.frameSteps === 0) idleFrames++;
      }
      g.feed = null;
      return { trace: window.trace, bytes: Array.from(g.record.encode()), steps: g.stepCount, maxSteps, idleFrames };
    },
    [bytes, dt],
  );
}

test('the same seed and input record play the same run at 60 Hz, 144 Hz and uneven frame times', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 7 });
  await page.evaluate(() => (window.trace = []));
  for (let c = 0; c < 6; c++) {
    assert.ok(await page.evaluate(() => window.simStep(300)), 'the bot run threw');
    if (c === 2) await page.evaluate(() => window.game.cycleView()); // V: the camera swings, WASD turn with it
  }
  live = await page.evaluate(() => {
    const g = window.game;
    return { trace: window.trace, bytes: Array.from(g.record.encode()), steps: g.stepCount, kills: g.score.kills, size: g.record.size };
  });
  assert.equal(live.steps, 1800 * 2, 'two logic steps per 60 Hz frame');
  assert.equal(live.trace.length, live.steps);
  assert.ok(live.kills >= 1 && live.trace.at(-1)[0] > 0, `the run should score (kills ${live.kills})`);
  console.log(`live: ${live.steps} steps, ${live.kills} kills, ${live.trace.at(-1)[0]} points, record ${live.size} B`);

  for (const dt of [1 / 60, 1 / 144, 'uneven']) {
    const r = await replay(live.bytes, dt);
    const n = r.trace.length;
    assert.ok(n >= live.steps - 8, `${dt}: replay stopped at step ${n}`);
    for (let i = 0; i < n; i++) {
      if (r.trace[i][0] !== live.trace[i][0] || r.trace[i][1] !== live.trace[i][1] || r.trace[i][2] !== live.trace[i][2]) {
        assert.fail(`${dt}: step ${i + 1} differs: replay ${JSON.stringify(r.trace[i])} vs run ${JSON.stringify(live.trace[i])}`);
      }
    }
    // the replay records exactly the input it was fed (its entries are the start of the original's)
    assert.deepEqual(r.bytes.slice(HEADER), live.bytes.slice(HEADER, r.bytes.length), `${dt}: the replay recorded different input`);
    if (dt === 1 / 144) assert.ok(r.maxSteps === 1 && r.idleFrames > 0, `144 Hz: up to ${r.maxSteps} steps a frame, ${r.idleFrames} frames with none`);
    console.log(`replay at ${typeof dt === 'number' ? `${Math.round(1 / dt)} Hz` : dt}: ${n} steps identical, at most ${r.maxSteps} a frame`);
  }
  assert.deepEqual(problems(logs), []);
});

test('a press in a frame that runs no logic step is taken by the next step, once', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const frame = Object.getPrototypeOf(g).frame; // the real frame loop (the bot stubbed g.frame)
    g.startRun(0);
    for (let i = 0; i < 30; i++) g.updatePlay(1 / 60);
    const before = g.focusActive;
    g.acc = 0;
    g.last = 0;
    g.input.pressed.add('ShiftLeft'); // Shift toggles bullet time: taken twice it would switch straight back off
    frame.call(g, 4); // a 4 ms frame: no logic step
    const first = { steps: g.frameSteps, on: g.focusActive };
    frame.call(g, 4 + 1000 / 60); // a 60 Hz frame: two steps
    return { before, first, second: { steps: g.frameSteps, on: g.focusActive } };
  });
  assert.equal(r.before, false);
  assert.deepEqual(r.first, { steps: 0, on: false }, 'nothing happens in a frame without a step');
  assert.deepEqual(r.second, { steps: 2, on: true }, 'the next step takes the press, and only once');
});

test('the stats panel shows the logic rate and step count', async () => {
  const text = await page.evaluate(() => {
    const g = window.game;
    g.notes.togglePanel();
    g.notes.renderStats();
    const t = document.getElementById('dbg-stats').textContent;
    g.notes.togglePanel();
    return { t, steps: g.stepCount.toLocaleString('en-US') };
  });
  assert.match(text.t, new RegExp(`邏輯 ${HZ} Hz · 第 ${text.steps} 步`), text.t);
});

test('a ten-minute run records under 100 KB of input', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 11 });
  // keep the player standing so one run lasts the whole ten minutes (waves, stage changes and all)
  const r = await page.evaluate(() => {
    const g = window.game;
    const hurt0 = g.player.hurt.bind(g.player);
    g.player.hurt = (d, x, z, e, s) => {
      const hit = hurt0(d, x, z, e, s);
      g.player.hp = 100;
      return hit;
    };
    for (let i = 0; i < 120; i++) if (!window.simStep(300)) break;
    g.player.hurt = hurt0;
    return { steps: g.stepCount, size: g.record.size, wave: g.waves.wave, map: g.level.map.id, errors: window.stats.errors, deaths: window.stats.deaths };
  });
  assert.deepEqual(r.errors, []);
  assert.equal(r.deaths, 0, 'one run, start to finish');
  assert.equal(r.steps, 10 * 60 * HZ);
  console.log(`ten minutes: wave ${r.wave} on ${r.map}, record ${(r.size / 1024).toFixed(1)} KB`);
  assert.ok(r.size < 100 * 1024, `${(r.size / 1024).toFixed(1)} KB`);
});
