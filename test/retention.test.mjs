// Coming back (回訪統計): the local play records also count the days played
// (UTC, as the daily challenge does): the first day, runs and daily challenges
// per day. The feedback export says whether the player came back the next day
// and on the seventh, how many days of the first week, and the daily challenges
// played. With a back end, the daily card shows the world's daily challenges
// today and yesterday from /stats; without one, nothing is asked.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Telemetry } from '../src/telemetry.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

const DAY = 86400000;
const T0 = Date.parse('2026-10-18T10:00:00Z');

/** A browser that played on these days after T0 (UTC days), with the runs listed: true for a daily. */
function played(schedule, nowDay) {
  const st = memoryStorage();
  let now = T0;
  const t = new Telemetry(st, () => now);
  t.setOn(true);
  for (const [day, runs] of schedule) {
    for (const daily of runs) {
      now = T0 + day * DAY + 60000;
      t.start({ map: '霓虹天台', mode: daily ? '每日挑戰' : '街機', rules: '', view: '45°', warmup: false, daily });
      t.end({ result: 'death', wave: 2, score: 1000 }, 60);
    }
  }
  now = T0 + nowDay * DAY;
  return { t, st, set: (d) => (now = T0 + d * DAY) };
}

test('the first week over a fake clock: back the next day, on the seventh, how many days, the dailies', () => {
  // day 0: two runs (one daily); days 1, 3 and 7; day 9 after the first week
  const a = played(
    [
      [0, [false, true]],
      [1, [true]],
      [3, [false]],
      [7, [true, false]],
      [9, [false]],
    ],
    9,
  );
  assert.deepEqual(a.t.retention(), { first: '2026-10-18', today: '2026-10-27', since: 9, days: 5, d1: true, d7: true, week: 3, runs: 7, daily: 3, daily7: 1 });
  // a new start on the same storage remembers it all
  const again = new Telemetry(a.st, () => T0 + 9 * DAY);
  assert.equal(again.retention().days, 5);
  // back on days 2 and 5 only: not the next day, not the seventh
  const b = played(
    [
      [0, [false]],
      [2, [false]],
      [5, [true]],
    ],
    8,
  );
  assert.deepEqual([b.t.retention().d1, b.t.retention().d7, b.t.retention().week], [false, false, 2]);
  // before the seventh day has come there is no answer yet
  const c = played([[0, [false]]], 3);
  assert.deepEqual([c.t.retention().d1, c.t.retention().d7], [false, null]);
  // the UTC day: 23:30 UTC on day 0 and 00:30 UTC the next are two days
  const d = played([], 0);
  d.set(0);
  const t = new Telemetry(memoryStorage(), () => Date.parse('2026-10-18T23:30:00Z'));
  t.setOn(true);
  t.start({ map: 'x', mode: '街機', daily: false });
  t.now = () => Date.parse('2026-10-19T00:30:00Z');
  t.start({ map: 'x', mode: '街機', daily: false });
  assert.deepEqual([t.retention().days, t.retention().d1], [2, true]);
  // switched off: no days counted
  const off = new Telemetry(memoryStorage(), () => T0);
  off.setOn(false);
  off.start({ map: 'x', mode: '街機' });
  assert.equal(off.retention(), null);
  // the export's lines
  const text = a.t.retentionText();
  for (const line of ['第一次玩：2026-10-18（9 天前）', '玩過的日數：5 天，共 7 局', '第 1 天回來：有', '第 7 天回來：有', '第一週（第 1–7 天）回來了 3 天', '每日挑戰：共 3 局，最近 7 天 1 局']) assert.ok(text.includes(line), line);
  assert.ok(c.t.retentionText().includes('第 7 天回來：未到'));
  // clearing the records clears the days too
  a.t.clear();
  assert.equal(a.t.retention(), null);
  assert.equal(new Telemetry(a.st, () => T0 + 9 * DAY).retention(), null);
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

test('in the game: a daily counts as one; the export carries the lines; the daily card shows the world’s counts only with a back end', async () => {
  const { page, logs } = await h.open('?seed=91');
  try {
    const r = await page.evaluate(async () => {
      const g = window.game;
      g.frame = () => {};
      const now = Date.parse('2026-10-18T09:00:00Z');
      g.now = () => now;
      g.telemetry.now = () => now;
      g.telemetry.setOn(true);
      g.startDaily();
      for (let i = 0; i < 30; i++) g.updatePlay(1 / 60);
      g.toTitle();
      g.startRun(0);
      for (let i = 0; i < 30; i++) g.updatePlay(1 / 60);
      g.toTitle();
      const ret = g.telemetry.retention();
      const md = g.notes.exportText();
      // no back end: the card shows nothing and nothing is asked
      const asked = [];
      window.fetch = async (u) => {
        asked.push(String(u));
        return new Response(JSON.stringify({ ok: true, days: [{ day: '2026-10-18', daily: 37, arcade: 120, players: 41 }, { day: '2026-10-17', daily: 52, arcade: 98, players: 60 }] }), { headers: { 'content-type': 'application/json' } });
      };
      g.refreshGlobal();
      const offline = { hidden: document.getElementById('daily-global').classList.contains('hidden'), asked: asked.length };
      const { BACKEND } = await import('/src/config.js');
      BACKEND.url = 'https://board.example';
      g.globalAt = 0;
      g.refreshGlobal();
      await new Promise((res) => setTimeout(res, 50));
      const el = document.getElementById('daily-global');
      const online = { hidden: el.classList.contains('hidden'), text: el.textContent, asked: [...asked] };
      g.refreshGlobal(); // within the minute: not asked again
      const again = asked.length;
      BACKEND.url = '';
      return { ret, md, offline, online, again };
    });
    await page.screenshot({ path: new URL('retention.png', OUT).pathname });
    assert.deepEqual([r.ret.runs, r.ret.daily, r.ret.days], [2, 1, 1], 'two runs today, one of them the daily');
    assert.match(r.md, /## 回訪（這部電腦，按 UTC 日）/);
    assert.match(r.md, /每日挑戰：共 1 局，最近 7 天 1 局/);
    assert.deepEqual(r.offline, { hidden: true, asked: 0 }, 'no back end: nothing shown, nothing asked');
    assert.deepEqual(r.online, { hidden: false, text: '全球：今天 37 局 · 昨天 52 局', asked: ['https://board.example/stats'] });
    assert.equal(r.again, 1, 'asked at most once a minute');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
