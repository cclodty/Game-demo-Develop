// The 60-second warm-up (60 秒新手熱身, 彈幕 ② C③: bullet time, the human shield, the table). On a first run (nothing stored) three
// enemies come one at a time: the first one's aim brings up the Shift hint,
// the second stands behind a pan, the third beside a barrel. Clearing them
// goes straight to wave 1; Esc skips; after 60 s it ends anyway; a second run
// does not play it; ?tutorial=1 plays it again. The harness marks the warm-up
// as seen for every other test (helpers.mjs), so they start at wave 1.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** Start a run with the real loop stopped; window.play(n) steps n 60 Hz frames, window.press(code) presses a control for the next step. */
const begin = (page) =>
  page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    g.startRun(0);
    window.play = (n) => {
      for (let i = 0; i < n; i++) {
        g.time += 1 / 60;
        g.updateAim();
        g.updatePlay(1 / 60);
        g.player.hp = 100; // the warm-up is about the steps, not surviving them
      }
    };
    window.press = (code) => g.input.pressed.add(code);
    window.look = () => {
      const t = g.tutorial;
      const e = t.enemy;
      const near = (list) => (e ? Math.min(...list.filter((q) => q.alive).map((q) => Math.hypot(q.x - e.x, q.z - e.z))) : Infinity);
      return {
        active: t.active,
        step: t.step,
        hint: t.hint,
        shown: document.getElementById('tutorial').textContent,
        enemy: e ? { type: e.type, alive: e.alive, state: e.state } : null,
        alive: g.enemies.list.filter((x) => x.alive).length,
        toTable: near(g.level.fixtures.filter((f) => f.kind === 'table' && !f.flipped)),
        toPlayer: e ? Math.hypot(e.x - g.player.x, e.z - g.player.z) : Infinity,
        holdable: !!(e && e.holdable),
        wave: g.waves.wave,
        waves: g.waves.state,
        paused: g.state === 'paused',
        stored: localStorage.getItem('bullet-ballet.tutorial'),
        log: g.notes.events.map((x) => x.text).filter((x) => x.includes('熱身')),
      };
    };
    window.killStep = () => {
      const e = g.tutorial.enemy;
      e.die(0, 1, { cause: 'bullet' });
    };
  });

test('a first run plays the three warm-up steps, then wave 1 starts at once', { timeout: 180000 }, async () => {
  const { page, logs } = await h.open('?tutorial=0&seed=17&mode=danmaku'); // nothing stored: a first visit, the game's own mode (the teahouse)
  await begin(page);
  await page.evaluate(() => window.play(1));
  let s = await page.evaluate(() => window.look());
  assert.equal(s.active, true, 'the first run starts with the warm-up');
  assert.equal(s.step, 0);
  assert.equal(s.enemy.type, 'grunt');
  assert.equal(s.wave, 0, 'no wave yet');
  // step 1: the Shift hint waits for the enemy to aim. Frame by frame: empty while he
  // is not aiming, there from the step he starts (when that is depends on his random cooldown)
  const watch = await page.evaluate(() => {
    const t = window.game.tutorial;
    const aiming = () => ['aim', 'fire'].includes(t.enemy.state);
    let early = 0;
    let frames = 0;
    while (!aiming() && frames < 600) {
      if (t.hint) early++;
      window.play(1);
      frames++;
    }
    window.game.hud.update(1 / 60);
    return { early, frames, hint: t.hint };
  });
  assert.equal(watch.early, 0, 'no hint before he aims');
  assert.ok(watch.frames < 600, 'he aims within ten seconds');
  assert.ok(watch.hint, 'the hint comes up as he aims');
  s = await page.evaluate(() => window.look());
  assert.ok(['aim', 'fire'].includes(s.enemy.state), s.enemy.state);
  assert.match(s.shown, /Shift/);
  await snap(page, 'warmup-1.png');

  // step 2: close in front, to be held up as a human shield (once he is in: a second)
  await page.evaluate(() => {
    window.killStep();
    window.play(60);
    window.game.hud.update(1 / 60);
  });
  s = await page.evaluate(() => window.look());
  assert.equal(s.step, 1);
  assert.ok(s.toPlayer < 3.5, `the second enemy stands ${s.toPlayer.toFixed(1)} m from the player`);
  assert.ok(s.holdable, 'and can be held');
  assert.match(s.shown, /人盾/);
  assert.match(s.shown, /E/);
  await snap(page, 'warmup-2.png');

  // step 3: behind a table
  await page.evaluate(() => {
    window.killStep();
    window.play(2);
    window.game.hud.update(1 / 60);
  });
  s = await page.evaluate(() => window.look());
  assert.equal(s.step, 2);
  assert.ok(s.toTable < 3.5, `the third enemy stands ${s.toTable.toFixed(1)} m from a table`);
  assert.match(s.shown, /翻枱/);
  assert.match(s.shown, /F/);
  await snap(page, 'warmup-3.png');

  // done: wave 1 straight away, and it is remembered
  await page.evaluate(() => {
    window.killStep();
    window.play(2);
  });
  s = await page.evaluate(() => window.look());
  assert.equal(s.active, false);
  assert.equal(s.stored, 'done');
  await page.evaluate(() => window.play(150));
  s = await page.evaluate(() => window.look());
  assert.equal(s.wave, 1, 'wave 1 follows within a few seconds');
  assert.deepEqual(s.log, ['熱身開始', '熱身 1／3：快彈與紅線', '熱身 2／3：人盾', '熱身 3／3：翻枱', '熱身完成']);

  // the next run starts at wave 1 without the warm-up
  await page.evaluate(() => {
    window.game.startRun(0);
    window.play(30);
  });
  s = await page.evaluate(() => window.look());
  assert.equal(s.active, false, 'the warm-up plays once');
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('Esc skips the warm-up without pausing; ?tutorial=1 plays it again', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open('?tutorial=1&mode=danmaku'); // forced, although the harness marked it seen
  await begin(page);
  await page.evaluate(() => window.play(30));
  let s = await page.evaluate(() => window.look());
  assert.equal(s.active, true, '?tutorial=1 plays it again');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.play(2));
  s = await page.evaluate(() => window.look());
  assert.equal(s.active, false);
  assert.equal(s.paused, false, 'Esc skipped instead of pausing');
  assert.equal(s.alive, 0, 'the warm-up enemy left');
  assert.ok(s.log.includes('跳過熱身'));
  await page.evaluate(() => window.play(150));
  s = await page.evaluate(() => window.look());
  assert.equal(s.wave, 1);
  // after the warm-up Esc pauses again
  await page.keyboard.press('Escape');
  s = await page.evaluate(() => window.look());
  assert.equal(s.paused, true);
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('after 60 seconds the warm-up ends anyway and wave 1 starts', { timeout: 180000 }, async () => {
  const { page, logs } = await h.open('?tutorial=1&mode=danmaku');
  await begin(page);
  await page.evaluate(() => window.play(59 * 60));
  let s = await page.evaluate(() => window.look());
  assert.equal(s.active, true, 'still on at 59 s');
  await page.evaluate(() => window.play(2 * 60));
  s = await page.evaluate(() => window.look());
  assert.equal(s.active, false);
  assert.ok(s.log.includes('熱身時間到'));
  await page.evaluate(() => window.play(150));
  s = await page.evaluate(() => window.look());
  assert.equal(s.wave, 1);
  assert.deepEqual(problems(logs), []);
  await page.close();
});
