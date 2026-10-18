// Local play records (本機事件記錄): every run leaves a record in this
// browser (start, each wave, the end with its wave and cause, the time, and
// whether the player went again); the first visit shows a switch, on unless
// turned off; the feedback export from the pause menu carries the records;
// one run's record stays under 20 KB.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Telemetry } from '../src/telemetry.js';
import { gameHarness, problems, snap } from './helpers.mjs';

/** A stand-in for localStorage, shared by the Telemetry objects made on it (a reload). */
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m };
}

test('a death is recorded with its wave and cause, kept across a reload, and the next run marks it played again', () => {
  const store = memoryStorage();
  let clock = 1_000_000;
  const tel = new Telemetry(store, () => clock);
  assert.equal(tel.on, true, 'on unless turned off');
  assert.equal(tel.asked, false, 'the first visit shows the switch');
  tel.start({ map: '霓虹天台', mode: '街機', rules: '', view: '45° 側俯視', warmup: false });
  tel.event(41.5, { type: 'wave', n: 1, hurt: false });
  tel.event(97, { type: 'wave', n: 2, hurt: true });
  tel.end({ result: 'death', wave: 3, cause: 'SHOTGUNNER 的子彈', score: 4200, grade: 'D' }, 130.4);
  const again = new Telemetry(store, () => clock); // a reload
  const r = again.runs.at(-1);
  assert.deepEqual([r.end, r.wave, r.cause, r.seconds, r.again], ['death', 3, 'SHOTGUNNER 的子彈', 130, false]);
  assert.deepEqual(
    r.events.map((e) => [e.type, e.n, e.t]),
    [
      ['wave', 1, 41.5],
      ['wave', 2, 97],
    ],
  );
  clock += 12_000;
  again.start({ map: '霓虹天台', mode: '街機', rules: '芭蕾', view: '45° 側俯視', warmup: false });
  const first = new Telemetry(store).runs[0];
  assert.deepEqual([first.again, first.gap], [true, 12], 'went again 12 s later');
  // a restart from the pause menu: the open run ends as a quit
  again.start({ map: '脈衝夜店', mode: '無盡', rules: '', view: '正上方', warmup: false }, 0);
  assert.equal(again.runs.at(-2).end, 'quit');
});

test('turned off, nothing is written; the switch is asked once', () => {
  const store = memoryStorage();
  const tel = new Telemetry(store);
  tel.setOn(false);
  tel.start({ map: 'x', mode: 'y' });
  tel.event(1, { type: 'wave', n: 1 });
  tel.end({ result: 'death', wave: 1, cause: 'z' }, 5);
  assert.equal(store.map.get('bullet-ballet.telemetry.runs'), undefined, 'no record');
  const later = new Telemetry(store);
  assert.deepEqual([later.on, later.asked], [false, true], 'remembered, and not asked again');
  const fresh = new Telemetry(memoryStorage());
  fresh.confirm();
  assert.deepEqual([fresh.on, fresh.asked], [true, true], 'left as it was: on');
});

test('one run stays under 20 KB, however long', () => {
  const tel = new Telemetry(memoryStorage());
  tel.start({ map: '議事亭前地', mode: '無盡', rules: '芭蕾 · 雙槍主義 · 沒有慢鏡 · 玻璃之城', view: '45° 側俯視', warmup: true });
  for (let i = 0; i < 2000; i++) tel.event(i * 3, i % 2 ? { type: 'view', view: '低角度跟隨' } : { type: 'wave', n: i, hurt: i % 3 === 0 });
  tel.end({ result: 'death', wave: 1000, cause: 'BRUTE 的子彈', score: 98765432, grade: 'C' }, 6000);
  const bytes = Telemetry.size(tel.runs[0]);
  assert.ok(bytes < 20 * 1024, `${bytes} bytes`);
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

test('in the game: the first visit shows the switch; a death is recorded; the pause menu export carries the records', { timeout: 180000 }, async () => {
  const { page, logs } = await h.open('?seed=11');
  try {
    const first = await page.evaluate(() => ({ shown: !document.getElementById('telemetry-switch').classList.contains('hidden'), on: document.getElementById('telemetry-on').checked }));
    assert.deepEqual(first, { shown: true, on: true }, 'a first visit sees the switch, on');
    await page.evaluate(() => document.getElementById('telemetry-switch').scrollIntoView({ block: 'center' }));
    await snap(page, 'telemetry-switch.png');
    const r = await page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      g.startRun(1);
      g.waves.state = 'done';
      g.enemies.clear();
      for (let i = 0; i < 30; i++) g.updatePlay(1 / 60);
      g.player.invuln = 0;
      g.player.hurt(500, 0, 1, false, 'THUG 的子彈'); // the end
      for (let i = 0; i < 200 && g.state !== 'over'; i++) g.updatePlay(1 / 60);
      const runs = JSON.parse(localStorage.getItem('bullet-ballet.telemetry.runs'));
      return { state: g.state, run: runs.at(-1), hidden: document.getElementById('telemetry-switch').classList.contains('hidden'), pref: localStorage.getItem('bullet-ballet.telemetry') };
    });
    assert.equal(r.state, 'over');
    assert.deepEqual([r.run.end, r.run.wave, r.run.cause, r.run.map], ['death', 0, 'THUG 的子彈', '脈衝夜店']);
    assert.ok(r.run.seconds >= 0 && r.run.view, JSON.stringify(r.run));
    assert.deepEqual([r.hidden, r.pref], [true, 'on'], 'playing leaves the switch as it was, and it is not shown again');
    // a second run, left from the pause menu, then the export from that menu
    await page.evaluate(() => {
      const g = window.game;
      g.startRun(0);
      for (let i = 0; i < 30; i++) g.updatePlay(1 / 60);
      g.setPaused(true);
    });
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pause [data-act="export"]')]);
    const text = fs.readFileSync(await download.path(), 'utf8');
    assert.match(text, /## 事件記錄/);
    assert.match(text, /\| 脈衝夜店 \| 街機 \| 正常 \|.*\| 倒下 \| 0 \| THUG 的子彈 \|.*\| 是/, 'the death, played again');
    assert.match(text, /\| 霓虹天台 \| 街機 \|.*\| （進行中） \|/, 'the run still open');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
