// The best-kill clip (最佳片段錄影): overlapping screen recordings, a new one
// every 4 s; the run's best kill keeps the one that holds 6 s before it and
// 2 s after; the end screen plays it before the score and saves it as a
// .webm. The card asks the tests to check the buffer and the choice
// (ClipPlan, with a fake recorder and a fake clock); the browser tests check
// that a browser without MediaRecorder gets no button and no errors, and
// that the end screen plays a recording (a fixture) before the score.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ClipPlan } from '../src/clip.js';
import { CLIP } from '../src/config.js';
import { gameHarness, OUT, problems, snap } from './helpers.mjs';

/** A fake recorder: every recording it opens, with what became of it. */
function fakeRecorder() {
  const recs = [];
  const open = (t) => {
    const r = { start: t, state: 'recording', stoppedAt: null };
    recs.push(r);
    return {
      stop: () => {
        r.state = 'stopped';
        return Promise.resolve({ from: r.start });
      },
      drop: () => {
        r.state = 'dropped';
      },
    };
  };
  return { recs, open, running: () => recs.filter((r) => r.state === 'recording') };
}

/** Tick the plan every 1/30 s from t0 to t1 (seconds), calling each(t) after each tick. */
function run(plan, t0, t1, each = () => {}) {
  for (let t = t0; t <= t1 + 1e-9; t += 1 / 30) {
    plan.tick(t);
    each(t);
  }
}

test('a recording starts every 4 s; at most three run at once, and one always holds the last 6 s', () => {
  const f = fakeRecorder();
  const plan = new ClipPlan(f.open);
  let most = 0;
  let uncovered = 0;
  run(plan, 0, 58, (t) => {
    const live = f.running();
    most = Math.max(most, live.length);
    if (t >= CLIP.before && !live.some((r) => r.start <= t - CLIP.before + 1e-9)) uncovered++;
  });
  const starts = f.recs.map((r) => Math.round(r.start * 30) / 30);
  assert.equal(starts.length, 15, 'one every 4 s, from 0 to 56');
  for (let i = 1; i < starts.length; i++) assert.ok(Math.abs(starts[i] - starts[i - 1] - CLIP.every) < 0.05, `${starts[i - 1]} → ${starts[i]}`);
  assert.ok(most <= 3, `${most} at once`);
  assert.equal(uncovered, 0, 'a kill at any moment has its 6 s lead-in on tape');
  assert.equal(f.recs.filter((r) => r.state === 'stopped').length, 0, 'nothing kept without a kill');
});

test('the best kill keeps the recording started 6–10 s before it, stopped 2 s after; the clip is those 8 s', async () => {
  const f = fakeRecorder();
  const plan = new ClipPlan(f.open);
  run(plan, 0, 20);
  assert.equal(plan.kill(20, 500), true);
  run(plan, 20 + 1 / 30, 25);
  const kept = f.recs.filter((r) => r.state === 'stopped');
  assert.equal(kept.length, 1);
  assert.ok(kept[0].start <= 14 && kept[0].start > 10, `it started at ${kept[0].start}`);
  const clip = await plan.end(25);
  assert.equal(clip.blob.from, kept[0].start);
  assert.ok(Math.abs(clip.offset - (14 - kept[0].start)) < 1e-6, `starts ${clip.offset} s in`);
  assert.ok(Math.abs(clip.length - 8) < 1e-6, `${clip.length} s long`);
  assert.equal(clip.points, 500);
  assert.equal(f.running().length, 0, 'the end stops everything');
});

test('a better kill replaces the clip, a smaller one does not; early in a run the clip starts at the start', async () => {
  const f = fakeRecorder();
  const plan = new ClipPlan(f.open);
  run(plan, 0, 3);
  assert.equal(plan.kill(3, 300), true);
  run(plan, 3 + 1 / 30, 10);
  assert.equal(plan.kill(10, 200), false, 'a smaller kill');
  run(plan, 10 + 1 / 30, 30);
  let clip = await plan.end(30);
  assert.deepEqual([clip.points, clip.offset, Math.round(clip.length * 1e6) / 1e6], [300, 0, 5], 'the first 3 s and 2 s after');
  plan.reset();
  run(plan, 0, 20);
  plan.kill(20, 400);
  run(plan, 20 + 1 / 30, 21);
  assert.equal(plan.kill(21, 900), true, 'a better one while the first still records');
  run(plan, 21 + 1 / 30, 30);
  clip = await plan.end(30);
  assert.equal(clip.points, 900);
  assert.ok(Math.abs(clip.length - 8) < 1e-6);
});

test('a run that ends right after its best kill keeps what there is; a new run starts clean', async () => {
  const f = fakeRecorder();
  const plan = new ClipPlan(f.open);
  run(plan, 0, 20);
  plan.kill(20, 700);
  run(plan, 20 + 1 / 30, 20.5);
  const clip = await plan.end(20.5);
  assert.ok(Math.abs(clip.length - 6.5) < 1e-6, `6 s before and the 0.5 s after: ${clip.length}`);
  assert.equal(f.running().length, 0);
  plan.reset();
  assert.deepEqual([plan.clip, plan.best, plan.running], [null, 0, 0]);
  run(plan, 0, 1);
  assert.equal(await plan.end(1), null, 'no kill, no clip');
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

test('without MediaRecorder: no recording, no button, the score at once, no errors', async () => {
  const { page, logs } = await h.open('?seed=7');
  try {
    await page.addInitScript(() => {
      delete window.MediaRecorder;
    });
    await page.reload();
    await page.waitForFunction(() => window.game && window.game.startRun, null, { timeout: 120000 });
    const r = await page.evaluate(async () => {
      const g = window.game;
      g.startRun(1);
      for (let i = 0; i < 30; i++) g.updatePlay(1 / 60);
      const e = g.enemies.spawn('grunt', { x: g.player.x, z: g.player.z - 5, ex: g.player.x, ez: g.player.z - 4.9, stay: true });
      e.die(0, -1, { cause: 'bullet' });
      g.gameOver();
      await new Promise((res) => setTimeout(res, 300));
      const go = document.getElementById('gameover');
      return { supported: g.clip.supported, playing: go.classList.contains('clip-on'), save: document.getElementById('go-clip-save').classList.contains('hidden') };
    });
    assert.deepEqual(r, { supported: false, playing: false, save: true });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('the end screen plays the best kill first, then the score; a click skips it; the button saves a .webm', { timeout: 180000 }, async () => {
  const { page, logs } = await h.open('?seed=8');
  try {
    // the recording is what a recorder hands over: a short webm of the game (test/fixtures/clip.webm;
    // SwiftShader's canvas capture is too uneven to record one in the test itself)
    const setUp = () =>
      page.evaluate(async () => {
        const g = window.game;
        g.frame = () => {};
        window.seen = [];
        g.clip.kill = (pts) => window.seen.push(pts); // the run's kills reach the recorder with their points
        g.startRun(1);
        g.waves.state = 'done';
        g.enemies.clear();
        const e = g.enemies.spawn('grunt', { x: g.player.x, z: g.player.z - 4, ex: g.player.x, ez: g.player.z - 3.9, stay: true });
        e.spawnLock = 0;
        e.die(0, -1, { cause: 'bullet' });
        const blob = await (await fetch('/test/fixtures/clip.webm')).blob();
        g.clip.finish = () => Promise.resolve({ blob, offset: 0.4, length: 60, points: window.seen[0] }); // to the end of the fixture
        g.gameOver();
      });
    const look = () =>
      page.evaluate(() => {
        const go = document.getElementById('gameover');
        const save = document.getElementById('go-clip-save');
        const v = document.getElementById('go-clip-video');
        return {
          state: window.game.state,
          seen: window.seen,
          playing: go.classList.contains('clip-on'),
          panel: getComputedStyle(go.querySelector('.panel')).display,
          href: save.href.slice(0, 5),
          file: save.download,
          saveShown: !save.classList.contains('hidden'),
          at: v.currentTime,
        };
      });
    await setUp();
    await page.waitForFunction(() => document.getElementById('go-clip-video').currentTime > 0.45, null, { timeout: 20000 });
    const during = await look();
    assert.ok(during.seen.length === 1 && during.seen[0] > 0, `the kill reached the recorder: ${during.seen}`);
    assert.equal(during.playing, true, 'the clip plays first');
    assert.equal(during.panel, 'none', 'the score waits');
    assert.ok(during.at >= 0.4, `from 6 s before the kill (${during.at})`);
    assert.deepEqual([during.href, during.saveShown], ['blob:', true]);
    assert.match(during.file, /^bullet-ballet-.*\.webm$/);
    await page.screenshot({ path: new URL('clip-playing.png', OUT).pathname });
    await page.waitForFunction(() => !document.getElementById('gameover').classList.contains('clip-on'), null, { timeout: 60000 });
    const done = await look();
    assert.deepEqual([done.state, done.playing, done.saveShown], ['over', false, true], 'then the score, with the button');
    assert.notEqual(done.panel, 'none');
    await snap(page, 'clip-saved.png');
    // again, and a click skips the clip instead of starting a new run
    await setUp();
    await page.waitForFunction(() => document.getElementById('gameover').classList.contains('clip-on'), null, { timeout: 20000 });
    await page.click('#gameover');
    const skipped = await look();
    assert.deepEqual([skipped.state, skipped.playing], ['over', false]);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
