// The daily challenge (每日挑戰 ①，離線): every UTC day the whole world plays
// the same run (the seed hashes the date; map and rules rotate on a fixed
// table); one try a day per browser, then only its replay; a countdown to the
// next UTC midnight; the end screen shows the day's score, the last fourteen
// days and a share code that reads back and fails if any character changes.
// The date is injected (game.now), never the test machine's clock.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { countdown, dailyFor, dayBefore, DailyStore, msToNextDay, readShareCode, ROTATION, shareCode, utcDay } from '../src/daily.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

const at = (iso) => Date.parse(iso);

test('a day is a seed, a map and rules; the next day another; the table turns over every week', () => {
  const a = dailyFor('2026-10-18');
  assert.deepEqual(dailyFor('2026-10-18'), a, 'the same day, the same run');
  const b = dailyFor('2026-10-19');
  assert.notEqual(b.seed, a.seed);
  assert.equal(dailyFor(dayBefore('2026-10-18', -ROTATION.length)).map, a.map, 'the table repeats after a week');
  assert.equal(new Set(Array.from({ length: 7 }, (_, i) => dailyFor(dayBefore('2026-10-18', -i)).seed)).size, 7, 'seven days, seven seeds');
  // the day is UTC
  assert.equal(utcDay(at('2026-10-18T23:59:59Z')), '2026-10-18');
  assert.equal(utcDay(at('2026-10-19T00:00:00Z')), '2026-10-19');
  assert.equal(utcDay(at('2026-10-19T07:30:00+08:00')), '2026-10-18', 'Macau morning is still yesterday in UTC');
  assert.equal(msToNextDay(at('2026-10-18T23:59:30Z')), 30000);
  assert.equal(countdown(msToNextDay(at('2026-10-18T20:15:05Z'))), '03:44:55');
});

test('a share code reads back, and changing any character breaks it', () => {
  const code = shareCode({ day: '2026-10-18', score: 48250, grade: 'B' });
  assert.match(code, /^BB-20261018-48250-B-[0-9A-Z]{4}$/);
  assert.deepEqual(readShareCode(code), { day: '2026-10-18', score: 48250, grade: 'B' });
  assert.deepEqual(readShareCode(code.toLowerCase()), { day: '2026-10-18', score: 48250, grade: 'B' }, 'case does not matter');
  let broken = 0;
  for (let i = 3; i < code.length; i++) {
    if (code[i] === '-') continue;
    const swap = /\d/.test(code[i]) ? String((Number(code[i]) + 1) % 10) : code[i] === 'A' ? 'B' : 'A';
    const bad = code.slice(0, i) + swap + code.slice(i + 1);
    assert.equal(readShareCode(bad), null, `${bad} should fail`);
    broken++;
  }
  assert.ok(broken >= 18);
  assert.equal(readShareCode('BB-nonsense'), null);
});

test('the store: one try a day, the last fourteen days, kept across a reload', () => {
  const m = new Map();
  const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  const s = new DailyStore(st);
  assert.equal(s.canPlay('2026-10-18'), true);
  s.begin('2026-10-18');
  assert.equal(new DailyStore(st).canPlay('2026-10-18'), false, 'starting takes the try, even if the page closes');
  s.finish('2026-10-18', { score: 1200, grade: 'C', wave: 5, cleared: false }, 'QkI=');
  s.finish('2026-10-12', { score: 800, grade: 'D', wave: 3, cleared: false });
  const again = new DailyStore(st);
  const days = again.last14('2026-10-18');
  assert.equal(days.length, 14);
  assert.equal(days[0].day, '2026-10-05');
  assert.equal(days[13].result.score, 1200);
  assert.equal(days[7].result.score, 800);
  assert.equal(days.filter((d) => d.result).length, 2);
  assert.deepEqual(again.replay, { day: '2026-10-18', data: 'QkI=' });
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** A page whose clock says `iso`, with some past days already played (for the fourteen-day record). */
async function dayPage(iso, history = {}) {
  const { page, logs } = await h.open('?seed=1'); // the daily ignores ?seed
  await page.evaluate(
    ([iso, history]) => {
      const g = window.game;
      g.frame = () => {};
      g.now = () => Date.parse(iso);
      for (const [d, r] of Object.entries(history)) g.daily.days[d] = r;
      g.renderDaily();
    },
    [iso, history],
  );
  return { page, logs };
}

/** Start the day's run and step until wave 1 has started; what it is. */
const startAndLook = (page) =>
  page.evaluate(() => {
    const g = window.game;
    const started = g.startDaily();
    let n = 0;
    while (g.waves.wave < 1 && n++ < 600) g.updatePlay(1 / 60);
    return { started, seed: g.rng.seed, map: g.level.map.id, rules: g.ruleset.label, mode: g.mode, roster: [...g.waves.queue], warmup: g.tutorial.active };
  });

test('two pages on the same day meet the same run; the next day differs; a second try is refused but the replay plays', { timeout: 300000 }, async () => {
  const a = await dayPage('2026-10-18T09:00:00Z', {
    '2026-10-08': { score: 15200, grade: 'C', wave: 7, cleared: false },
    '2026-10-11': { score: 31000, grade: 'B', wave: 12, cleared: true },
    '2026-10-14': { score: 9800, grade: 'D', wave: 4, cleared: false },
    '2026-10-16': { score: 24400, grade: 'C', wave: 9, cleared: false },
    '2026-10-17': { score: 27100, grade: 'B', wave: 12, cleared: true },
  });
  const b = await dayPage('2026-10-18T22:30:00Z');
  const c = await dayPage('2026-10-19T00:00:01Z');
  try {
    await a.page.evaluate(() => document.getElementById('daily-card').scrollIntoView({ block: 'center' }));
    await a.page.screenshot({ path: new URL('daily-card.png', OUT).pathname });
    const ra = await startAndLook(a.page);
    const rb = await startAndLook(b.page);
    const rc = await startAndLook(c.page);
    const want = dailyFor('2026-10-18');
    assert.equal(ra.started, true);
    assert.equal(ra.seed, want.seed, 'the seed is the day');
    assert.deepEqual(rb, ra, 'another page, another hour, the same day: the same run and the same first wave');
    assert.equal(ra.mode, 'daily');
    assert.equal(ra.warmup, false, 'no warm-up in the daily');
    assert.notEqual(rc.seed, ra.seed, 'the next day, another seed');

    // play the day to its end in page a: the player falls
    const end = await a.page.evaluate(() => {
      const g = window.game;
      let n = 0;
      while (g.state !== 'over' && n++ < 60 * 400) {
        g.input.mouse.left = n % 30 < 20;
        const near = g.enemies.nearestVisible(g.player.x, g.player.z, 30); // aim at whoever is there
        if (near) g.aimPoint.set(near.x, g.aimPoint.y, near.z);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
        if (n === 60 * 45) g.player.hp = 1; // and soon after
      }
      g.input.mouse.left = false;
      return {
        state: g.state,
        daily: document.getElementById('gameover').classList.contains('daily'),
        code: document.getElementById('go-daily-code').textContent,
        bars: document.querySelectorAll('#go-daily-days .go-daily-bar:not(.none)').length,
        score: Math.round(g.score.score),
        grade: document.getElementById('go-grade').textContent,
      };
    });
    assert.equal(end.state, 'over');
    assert.equal(end.daily, true, 'the end screen has the daily block');
    assert.deepEqual(readShareCode(end.code), { day: '2026-10-18', score: end.score, grade: end.grade }, 'the share code says the day, the score and the grade');
    assert.equal(end.bars, 6, 'five earlier days and today in the last fourteen');
    await a.page.screenshot({ path: new URL('daily-end.png', OUT).pathname });

    // back to the title: the day is spent, its replay is there, and the countdown runs to UTC midnight
    await a.page.click('#gameover');
    const title = await a.page.evaluate(() => {
      const g = window.game;
      const again = g.startDaily();
      return {
        state: g.state,
        again,
        mode: g.mode,
        msg: document.getElementById('daily-msg').textContent,
        done: document.getElementById('daily-done').textContent,
        startShown: !document.getElementById('daily-start').classList.contains('hidden'),
        replayShown: !document.getElementById('daily-replay').classList.contains('hidden'),
        next: document.getElementById('daily-next').textContent,
      };
    });
    assert.equal(title.state, 'title');
    assert.equal(title.again, false, 'a second try is refused');
    assert.equal(title.mode, 'arcade', "the title's mode is back");
    assert.match(title.msg, /今天已經打過/);
    assert.match(title.done, new RegExp(`${end.score.toLocaleString('en-US')} 分`));
    assert.deepEqual([title.startShown, title.replayShown], [false, true]);
    assert.equal(title.next, `下一局 ${countdown(msToNextDay(Date.parse('2026-10-18T09:00:00Z')))}`);
    await a.page.click('#daily-replay');
    const watching = await a.page.evaluate(() => ({ replay: !!window.game.replay, seed: window.game.rng.seed, mode: window.game.mode }));
    assert.deepEqual(watching, { replay: true, seed: want.seed, mode: 'daily' }, 'the replay is the day');
    for (const p of [a, b, c]) assert.deepEqual(problems(p.logs), []);
  } finally {
    for (const p of [a, b, c]) await p.page.close();
  }
});
