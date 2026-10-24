// 澳門一夜 A NIGHT IN MACAU (澳門一夜 ①): a mode that plays the maps one after
// another by the hour of the night each is set at (maps.js `hour`: 20:00 the
// rooftop … 03:00 the Ruins of St. Paul's), three waves a stage, the third the
// map's boss where it has one; each stage opens with a line (maps.js `line`,
// Chinese and English) and the HUD shows the hour. A stage cleared is kept in
// this browser: the next night starts at the first one not yet cleared, and
// 由頭再來 starts it over. The mode is last in MODE_IDS, so old replays keep
// theirs; arcade, endless and the daily are as they were. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { nightRoute, NightStore } from '../src/night.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

test('the route: the maps with an hour, from the evening on (an hour before noon is after midnight)', () => {
  const maps = [{ hour: '01:00' }, { hour: '20:00' }, {}, { hour: '23:00' }, { hour: '03:00' }, { hour: '21:00' }];
  assert.deepEqual(nightRoute(maps), [1, 5, 3, 0, 4]);
});

test('the store: the first stage not yet cleared, kept across a reload; all cleared or 由頭再來, back to the start', () => {
  const m = new Map();
  const st = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
  const s = new NightStore(st);
  assert.equal(s.at, 0, 'a first night starts at the start');
  s.cleared(0, 7);
  s.cleared(1, 7);
  assert.equal(new NightStore(st).at, 2, 'two stages cleared: the next night starts at the third');
  s.cleared(6, 7);
  assert.equal(new NightStore(st).at, 0, 'the whole night cleared: the next starts at the start again');
  s.cleared(3, 7);
  s.reset();
  assert.equal(new NightStore(st).at, 0, '由頭再來');
  m.set('bullet-ballet.night', 'nonsense');
  assert.equal(new NightStore(st).at, 0, 'what cannot be read is a first night');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  const b = new NightStore(broken);
  b.cleared(0, 7);
  assert.equal(b.at, 1, 'storage that throws: the night still goes on, it is only not kept');
});

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=21'));
  await page.evaluate(() => {
    window.game.frame = () => {};
    localStorage.removeItem('bullet-ballet.night');
    window.game.night.reset();
  });
});
after(async () => {
  await h.close();
});

/** Up to `n` frames of play, until `what` ('left': the rooftop left behind, 'wave4': the fourth wave under way). */
const run = (n, what = '') =>
  page.evaluate(
    ([n, what]) => {
      const g = window.game;
      const done = { left: () => g.level.map.id !== 'rooftop' && !g.transition, wave4: () => g.waves.wave > 3 }[what] || (() => false);
      for (let i = 0; i < n && !done(); i++) {
        g.player.hp = 100;
        g.updatePlay(1 / 60);
      }
    },
    [n, what],
  );

test('the night in order of the hour: 20:00 the rooftop … 03:00 大三巴, every map with its hour and a line in Chinese and English; the mode last in MODE_IDS; three waves a stage', async () => {
  const r = await page.evaluate(async () => {
    const { MODE_IDS, MODES } = await import('/src/waves.js');
    const { nightRoute } = await import('/src/night.js');
    const g = window.game;
    const route = nightRoute(g.maps);
    return {
      ids: MODE_IDS,
      night: { waves: MODES.night.waves, perStage: MODES.night.perStage, midBoss: !!MODES.night.midBoss },
      route: route.map((i) => [g.maps[i].hour, g.maps[i].id]),
      lines: route.map((i) => g.maps[i].line),
      without: g.maps.filter((m) => !m.hour).map((m) => m.id),
    };
  });
  assert.deepEqual(r.ids, ['arcade', 'endless', 'daily', 'night', 'danmaku'], 'appended: an old replay’s mode is still the same mode (彈幕試驗 after it)');
  assert.deepEqual(r.route, [
    ['20:00', 'rooftop'],
    ['21:00', 'club'],
    ['22:00', 'senado'],
    ['23:00', 'felicidade'],
    ['01:00', 'docks'],
    ['02:00', 'guia'],
    ['03:00', 'ruins'],
  ]);
  assert.deepEqual(r.without, [], 'every map has its hour');
  for (const [zh, en] of r.lines) {
    assert.ok(/[一-鿿]/.test(zh) && zh.length >= 8 && zh.length <= 40, `a line in Chinese: ${zh}`);
    assert.ok(/^[A-Za-z]/.test(en) && en.length >= 12 && en.length <= 90 && !/[一-鿿]/.test(en), `and in English: ${en}`);
  }
  assert.deepEqual(r.night, { waves: 21, perStage: 3, midBoss: true }, 'seven stages of three waves, a boss at each stage’s end where there is one');
});

test('on the title 澳門一夜 is a mode; picked, it starts on the rooftop at 20:00 with its line, the HUD shows the hour, and the third wave is the helicopter', async () => {
  await page.evaluate(() => window.game.toTitle());
  if (await page.isVisible('#telemetry-ok')) await page.click('#telemetry-ok');
  await page.click('#mode-cards .mode-card[data-mode="night"]');
  const title = await page.evaluate(() => ({
    modes: [...document.querySelectorAll('#mode-cards .mode-card')].map((c) => c.dataset.mode),
    note: document.getElementById('maps-note').textContent,
    over: !document.getElementById('night-over').classList.contains('hidden'),
    scroll: document.getElementById('title').scrollHeight > document.getElementById('title').clientHeight + 1,
  }));
  await page.screenshot({ path: new URL('night-title.png', OUT).pathname });
  assert.deepEqual(title.modes, ['arcade', 'endless', 'night', 'danmaku']);
  assert.match(title.note, /20:00/);
  assert.equal(title.over, false, 'nothing to start over yet');
  assert.equal(title.scroll, false, `the title does not scroll at 1280 × 720: ${title.note}`);
  await page.keyboard.press('Enter');
  await run(30);
  const r = await page.evaluate(() => {
    const g = window.game;
    const line = document.getElementById('night-line');
    return {
      map: g.level.map.id,
      mode: g.mode,
      record: [g.record.mode, g.record.map],
      line: line.classList.contains('show') ? line.textContent : '',
      sub: document.getElementById('wave-sub').textContent,
      notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('20:00')),
    };
  });
  assert.equal(r.map, 'rooftop');
  assert.equal(r.mode, 'night');
  assert.deepEqual(r.record, [3, 0], 'the record keeps the mode’s place and the map the night started on');
  assert.match(r.line, /20:00/);
  assert.ok(r.line.includes(await page.evaluate(() => window.game.maps[0].line[0])), `the night’s first line: ${r.line}`);
  assert.match(r.sub, /20:00/, `the HUD shows the hour: ${r.sub}`);
  assert.ok(r.notes.length >= 1, 'the notes have the line');
  await page.evaluate(() => {
    const g = window.game;
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('night-start.png', OUT).pathname });
  const boss = await page.evaluate(() => {
    const g = window.game;
    g.waves.wave = 2;
    g.waves.startWave();
    return { wave: g.waves.wave, boss: g.waves.bossWave, kind: g.boss.active ? g.boss.cfg.short || g.boss.cfg.name : null };
  });
  assert.equal(boss.wave, 3);
  assert.equal(boss.boss, true, 'the stage’s third wave is its boss');
  assert.deepEqual(problems(logs), []);
});

test('a stage cleared is kept: on to 21:00 the club with its line; after a reload the night starts there, at wave 4; 由頭再來 takes it back to 20:00', async () => {
  // the rooftop's stage cleared, as waves.js clears one
  await page.evaluate(() => {
    const g = window.game;
    g.bosses.reset();
    g.enemies.clear();
    const w = g.waves;
    w.wave = 3;
    w.bossWave = false;
    w.state = 'intermission';
    w.timer = 0.2;
    w.stageNext = true;
    g.onWaveClear(3, true);
  });
  await run(600, 'left');
  const next = await page.evaluate(() => {
    const g = window.game;
    const line = document.getElementById('night-line');
    return { map: g.level.map.id, line: line.classList.contains('show') ? line.textContent : '', kept: localStorage.getItem('bullet-ballet.night') };
  });
  assert.equal(next.map, 'club', 'the next hour, the next map');
  assert.match(next.line, /21:00/);
  assert.deepEqual(JSON.parse(next.kept), { at: 1 }, 'the rooftop is cleared and kept');

  await page.reload();
  await page.waitForFunction(() => window.game && window.game.startRun);
  await page.evaluate(() => (window.game.frame = () => {}));
  const back = await page.evaluate(() => ({
    mode: window.game.mode,
    note: document.getElementById('maps-note').textContent,
    over: !document.getElementById('night-over').classList.contains('hidden'),
  }));
  assert.equal(back.mode, 'night', 'the title remembers the mode');
  assert.match(back.note, /21:00/, `the note says where the night goes on: ${back.note}`);
  assert.equal(back.over, true, '由頭再來 is offered');
  await page.keyboard.press('Enter');
  const resumed = await page.evaluate(() => ({ map: window.game.level.map.id, wave: window.game.waves.wave, record: window.game.record.map }));
  await run(600, 'wave4');
  const wave = await page.evaluate(() => window.game.waves.wave);
  assert.equal(resumed.map, 'club');
  assert.equal(resumed.record, 1, 'the record starts at the club (a replay of it plays from there)');
  assert.equal(wave, 4, 'the night’s fourth wave: it goes on where it was');

  await page.evaluate(() => window.game.toTitle());
  await page.click('#night-over');
  const over = await page.evaluate(() => ({
    note: document.getElementById('maps-note').textContent,
    over: !document.getElementById('night-over').classList.contains('hidden'),
    kept: localStorage.getItem('bullet-ballet.night'),
    state: window.game.state,
  }));
  assert.match(over.note, /20:00/);
  assert.equal(over.over, false);
  assert.deepEqual(JSON.parse(over.kept), { at: 0 });
  assert.equal(over.state, 'title', 'starting over does not start a run by itself');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.game.level.map.id), 'rooftop');
  // and arcade is as it was: the map picked, then the next in MAPS
  await page.evaluate(() => {
    const g = window.game;
    g.toTitle();
    g.setMode('arcade');
    g.startRun(2);
  });
  const arcade = await page.evaluate(() => ({ map: window.game.level.map.id, line: document.getElementById('night-line').classList.contains('show'), next: window.game.mapAt(1).id }));
  assert.deepEqual(arcade, { map: 'docks', line: false, next: 'senado' });
  assert.deepEqual(problems(logs), []);
});
