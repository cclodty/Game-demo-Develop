// Replays (重播 ①：存檔與播放). Every run's input record is kept in this
// browser (the last ten); the title's replay list plays one back (same seed,
// map, mode, rules, warm-up, every step's input from the record), downloads
// it as .bbr or imports one. During playback the HUD says REPLAY, 1 / 2 / 3
// set half, normal and double speed, Esc leaves, and the game's own keys do
// nothing. A broken or foreign file is refused with a message. A run recorded
// on maps since rebuilt (maps.js rev) is marked in the list and still plays,
// with a word that it will not be the same; one from before revisions, as not
// known.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { InputRecord, KEEP_REPLAYS, RecordReader, ReplayStore } from '../src/replay.js';
import { StepInput } from '../src/input.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

/** A stand-in for localStorage; `limit` makes setItem throw past that many characters, like a full disk. */
function memoryStorage(limit = Infinity) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (String(v).length > limit) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
  };
}

/** A small valid record: `steps` steps of a little input. */
function record(steps = 600, seed = 1) {
  const rec = new InputRecord({ seed, map: 1, mode: 0, rules: 0 });
  for (let i = 0; i < steps; i++) {
    const c = new StepInput();
    c.keys = i % 50 < 25 ? 1 : 2;
    c.aimQX = i % 7;
    rec.push(c);
  }
  return rec.encode();
}

test('the store keeps the newest ten, gives back the same bytes, and drops the oldest when storage is full', () => {
  const st = memoryStorage();
  const store = new ReplayStore(st);
  for (let i = 0; i < 12; i++) store.add({ at: `2026-10-18T0${i % 10}:00:00Z`, mapId: 'club', map: '脈衝夜店', score: i }, record(300 + i, i));
  assert.equal(store.list.length, KEEP_REPLAYS);
  assert.deepEqual(
    store.list.map((r) => r.score),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
    'newest first',
  );
  const again = new ReplayStore(st); // a reload
  assert.deepEqual(again.bytes(again.list[0]), record(311, 11), 'the same bytes back');
  assert.match(again.list[0].name, /^bullet-ballet-\d{8}-\d{4}-club\.bbr$/);
  // a full disk: the oldest go until the new one fits
  const small = new ReplayStore(memoryStorage(JSON.stringify([{ data: 'x'.repeat(4000) }]).length * 3));
  for (let i = 0; i < 5; i++) small.add({ at: '2026-10-18T00:00:00Z', mapId: 'club', score: i }, record(2000, i));
  assert.ok(small.list.length >= 1 && small.list.length < 5, `${small.list.length} kept`);
  assert.equal(small.list[0].score, 4, 'the newest is kept');
});

test('a cut-off or garbled record is refused, not read forever', () => {
  const ok = record(900);
  assert.doesNotThrow(() => RecordReader.check(ok));
  assert.throws(() => RecordReader.check(ok.subarray(0, ok.length - 7)), /cut short/);
  const garbled = ok.slice();
  garbled.fill(0xff, 20);
  assert.throws(() => RecordReader.check(garbled), /garbled|cut short/);
  assert.throws(() => RecordReader.check(new Uint8Array([0x42, 0x42])), /not an input record/);
});

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=19'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** Step 60 Hz frames until the run is over (or `max` frames), the player strafing and shooting north; `noise` also presses keys that must change nothing. */
    window.playToEnd = (max, noise = false) => {
      const inp = g.input;
      let f = 0;
      while ((g.state === 'playing' || g.state === 'dying') && f < max) {
        f++;
        inp.keys.clear();
        inp.keys.add(Math.floor(f / 40) % 2 ? 'KeyA' : 'KeyD');
        inp.mouse.left = f % 30 < 20;
        if (noise) {
          inp.keys.add('KeyW');
          if (f % 23 === 0) inp.pressed.add('Space');
          if (f % 31 === 0) inp.pressed.add('ShiftLeft');
        }
        g.updatePlay(1 / 60);
      }
      inp.keys.clear();
      inp.mouse.left = false;
      return f;
    };
    window.endScreen = () => ({
      state: g.state,
      title: document.getElementById('go-title').textContent,
      score: document.getElementById('go-score').textContent,
      grade: document.getElementById('go-grade').textContent,
      wave: g.waves.wave,
      kills: g.score.kills,
      replayClass: document.getElementById('gameover').classList.contains('replay'),
    });
  });
});
after(async () => {
  await h.close();
});

test('a run is kept when it ends, and playing it back gives the same score and end screen, whatever keys are pressed', { timeout: 300000 }, async () => {
  const run = await page.evaluate(() => {
    const g = window.game;
    g.setRules('ballet', []); // quicker to fall
    g.startRun(1);
    g.setRules('normal', []); // the title's pick; the record keeps the run's
    const frames = window.playToEnd(60 * 600);
    const shown = window.endScreen();
    const kept = g.replays.list.map((r) => ({ result: r.result, score: r.score, grade: r.grade, wave: r.wave, rules: r.rules, map: r.map }));
    return { frames, shown, kept, score: g.score.score };
  });
  assert.equal(run.shown.state, 'over', `the run ended (${run.frames} frames)`);
  assert.equal(run.kept.length, 1);
  assert.deepEqual(run.kept[0], { result: 'death', score: Math.round(run.score), grade: run.shown.grade, wave: run.shown.wave, rules: '芭蕾', map: '脈衝夜店' });
  assert.ok(run.shown.kills > 0, 'something happened worth replaying');

  const back = await page.evaluate(() => {
    const g = window.game;
    const err = g.playReplay(g.replays.bytes(g.replays.list[0]), g.replays.list[0]);
    const during = { err, badge: !document.getElementById('replay-badge').classList.contains('hidden'), aim: g.ruleset.aimMul, mode: g.mode };
    window.playToEnd(60 * 20, true); // twenty seconds in
    g.hud.update(1 / 60);
    g.render();
    return { during };
  });
  assert.deepEqual(back.during, { err: null, badge: true, aim: 0.7, mode: 'arcade' }, 'the record brought its rules');
  await page.screenshot({ path: new URL('replay-playing.png', OUT).pathname });
  const end = await page.evaluate(() => {
    window.playToEnd(60 * 600, true);
    return { shown: window.endScreen(), kept: window.game.replays.list.length };
  });
  assert.deepEqual({ ...end.shown, replayClass: false }, { ...run.shown, replayClass: false }, 'the same end, keys or no keys');
  assert.equal(end.shown.replayClass, true, 'the end screen says it was a replay');
  assert.equal(end.kept, 1, 'a replay is not kept again');
  // the end of a replay goes back to the title
  await page.click('#gameover');
  const back2 = await page.evaluate(() => ({ state: window.game.state, replay: window.game.replay, feed: window.game.feed, rules: window.game.difficulty }));
  assert.deepEqual(back2, { state: 'title', replay: null, feed: null, rules: 'normal' });
});

test('1 / 2 / 3 set the speed, Esc leaves for the title', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.playReplay(g.replays.bytes(g.replays.list[0]), g.replays.list[0]);
    return { speed: g.replay.speed };
  });
  assert.equal(r.speed, 1);
  const steps = async (key) => {
    await page.keyboard.press(key);
    return page.evaluate(() => {
      const g = window.game;
      g.updatePlay(g.playDt(1 / 60));
      return { speed: g.replay.speed, steps: g.frameSteps, shown: document.getElementById('replay-speed').textContent };
    });
  };
  assert.deepEqual(await steps('Digit3'), { speed: 2, steps: 4, shown: '2×' });
  assert.deepEqual(await steps('Digit2'), { speed: 1, steps: 2, shown: '1×' });
  const half = await steps('Digit1');
  assert.equal(half.speed, 0.5);
  assert.ok(half.steps <= 1, `${half.steps} steps a frame at half speed`);
  await page.keyboard.press('Escape');
  const after = await page.evaluate(() => ({ state: window.game.state, replay: window.game.replay, paused: !document.getElementById('pause').classList.contains('hidden') }));
  assert.deepEqual(after, { state: 'title', replay: null, paused: false });
});

test('the list keeps each run; a broken or foreign file is refused with a message', async () => {
  // two short runs left from the pause menu join the list
  await page.evaluate(() => {
    const g = window.game;
    for (const map of [0, 3]) {
      g.startRun(map);
      window.playToEnd(60 * 4);
      g.setPaused(true);
      g.toTitle();
    }
    g.showReplays(true);
  });
  const rows = await page.evaluate(() => [...document.querySelectorAll('#replay-list .replay-row')].map((r) => r.textContent));
  assert.equal(rows.length, 3);
  assert.match(rows[0], /議事亭前地.*中途離開/);
  assert.match(rows[2], /脈衝夜店.*芭蕾.*倒下/);
  await page.screenshot({ path: new URL('replay-list.png', OUT).pathname });
  const bytes = await page.evaluate(() => [...window.game.replays.bytes(window.game.replays.list[2])]);
  const files = {
    'noise.bbr': Buffer.from(Array.from({ length: 400 }, (_, i) => (i * 37) % 256)),
    'old.bbr': Buffer.from(bytes.map((b, i) => (i === 2 ? 3 : b))),
    'cut.bbr': Buffer.from(bytes.slice(0, bytes.length - 9)),
  };
  for (const [name, buffer] of Object.entries(files)) {
    await page.setInputFiles('#replay-file', { name, mimeType: 'application/octet-stream', buffer });
    await page.waitForFunction(() => document.getElementById('replay-msg').textContent !== '');
    const r = await page.evaluate(() => ({ msg: document.getElementById('replay-msg').textContent, state: window.game.state, replay: window.game.replay }));
    assert.equal(r.state, 'title', name);
    assert.equal(r.replay, null, name);
    assert.match(r.msg, new RegExp(`無法播放 ${name.replace('.', '\\.')}`), r.msg);
    await page.evaluate(() => (document.getElementById('replay-msg').textContent = ''));
  }
  // and a good one plays
  await page.setInputFiles('#replay-file', { name: 'good.bbr', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => window.game.replay !== null);
  const good = await page.evaluate(() => ({ state: window.game.state, map: window.game.level.map.id }));
  assert.deepEqual(good, { state: 'playing', map: 'club' });
  await page.keyboard.press('Escape');
  assert.deepEqual(problems(logs), []);
});

test('a replay of a run on maps since rebuilt (another maps’ revision) is marked in the list, and still plays, with a word that it will not be the same; one from before revisions, as not known', async () => {
  const r = await page.evaluate(async () => {
    const { MAPS_REV } = await import('/src/maps.js');
    const g = window.game;
    g.toTitle();
    const entry = g.replays.list[0];
    const bytes = g.replays.bytes(entry);
    // the same run as if recorded on the maps before their last rebuild
    const old = { ...entry, mapsRev: (MAPS_REV + 255) % 256 };
    g.replays.list.unshift(old);
    g.showReplays(true);
    const rows = [...document.querySelectorAll('#replay-list .replay-row')].map((x) => x.textContent);
    g.replays.list.shift();
    const stale = bytes.slice();
    stale[15] = (MAPS_REV + 255) % 256;
    const err = g.playReplay(stale, old);
    const out = { rows, err, stale: g.replay && g.replay.stale, said: g.notes.events.some((e) => e.text.includes('遊戲已改版')) };
    g.toTitle();
    const same = g.playReplay(bytes, entry);
    out.fresh = { err: same, stale: g.replay && g.replay.stale };
    g.toTitle();
    // one kept from before the maps had revisions: a version 4 record (no revision byte), a list entry without one
    const v4 = new Uint8Array(bytes.length - 1);
    v4.set(bytes.subarray(0, 15));
    v4.set(bytes.subarray(16), 15);
    v4[2] = 4;
    const before = { ...entry };
    delete before.mapsRev;
    g.replays.list.unshift(before);
    g.showReplays(true);
    out.unknownRow = document.querySelector('#replay-list .replay-row').textContent;
    g.replays.list.shift();
    g.notes.events.length = 0;
    const errV4 = g.playReplay(v4, before);
    out.unknown = { err: errV4, stale: g.replay && g.replay.stale, said: g.notes.events.some((e) => e.text.includes('遊戲版本未知')) };
    g.toTitle();
    return out;
  });
  assert.match(r.rows[0], /遊戲已改版/, 'the old run is marked');
  assert.doesNotMatch(r.rows[1], /遊戲已改版|遊戲版本未知/, 'a run on these maps is not');
  assert.equal(r.err, null, 'it still plays');
  assert.equal(r.stale, true);
  assert.equal(r.said, true, 'and the notes say it will not be the same');
  assert.deepEqual(r.fresh, { err: null, stale: false });
  assert.match(r.unknownRow, /遊戲版本未知/, 'a run from before the maps had revisions is marked as not known');
  assert.deepEqual(r.unknown, { err: null, stale: 'unknown', said: true }, 'it plays, and the notes say it may not be the same');
  // the list with one of each on top
  await page.evaluate(async () => {
    const { MAPS_REV } = await import('/src/maps.js');
    const g = window.game;
    const entry = g.replays.list[0];
    const before = { ...entry };
    delete before.mapsRev;
    g.replays.list.unshift({ ...entry, mapsRev: (MAPS_REV + 255) % 256 }, before);
    g.showReplays(true);
    g.replays.list.splice(0, 2);
  });
  await page.screenshot({ path: new URL('replays-rev.png', OUT).pathname });
  await page.keyboard.press('Escape');
  assert.deepEqual(problems(logs), []);
});
