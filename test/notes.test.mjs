// Playtest notes: gameplay events are logged, N pauses and opens a note with
// the moment's context, Enter keeps it and resumes, the pause menu exports a
// Markdown file, the stats panel toggles with Backquote, and live tuning is
// remembered across a reload until reset. Run: npm test
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

const shown = (page, id) => page.evaluate((id) => !document.getElementById(id).classList.contains('hidden'), id);

test('N records this moment with its context, and the export lists it', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(300);
  // step a few frames by hand and take a hit, so there is something to report
  const r = await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    for (let i = 0; i < 30; i++) {
      g.time += 1 / 60;
      g.updateAim();
      g.updatePlay(1 / 60);
      g.notes.update(1 / 60, 1 / 60);
    }
    const p = g.player;
    p.invuln = 0;
    p.spinT = 0;
    p.hurt(20, 0, 1, false, '測試用散彈');
    return { state: g.state, events: g.notes.events.map((e) => e.text) };
  });
  assert.equal(r.state, 'playing');
  assert.ok(r.events[0].startsWith('開局：脈衝夜店'), r.events[0]);
  assert.ok(r.events.some((t) => t.includes('被測試用散彈打中 −20')), r.events.join(' | '));

  await page.keyboard.press('KeyN');
  await page.waitForTimeout(100);
  let s = await page.evaluate(() => ({ state: window.game.state, context: document.getElementById('note-context').textContent, focused: document.activeElement && document.activeElement.id }));
  assert.equal(s.state, 'paused', 'N pauses the game');
  assert.equal(await shown(page, 'pause'), true);
  assert.equal(await shown(page, 'note-box'), true);
  assert.equal(s.focused, 'note-text');
  assert.match(s.context, /^脈衝夜店 · 第 \d+ 波 · 開局後 00:0\d · HP 80 /);
  await snap(page, 'notes-box.png');

  await page.keyboard.type('旋轉閃避的無敵時間太短 被打中兩次');
  // typing must not leak into the game's input or its menu keys
  const leak = await page.evaluate(() => ({ space: window.game.input.keys.has('Space'), text: document.getElementById('note-text').value, state: window.game.state }));
  assert.equal(leak.space, false);
  assert.equal(leak.text, '旋轉閃避的無敵時間太短 被打中兩次');
  assert.equal(leak.state, 'paused');

  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  s = await page.evaluate(() => ({ state: window.game.state, n: window.game.notes.list.length, stored: JSON.parse(localStorage.getItem('bullet-ballet.notes')).length }));
  assert.equal(s.state, 'playing', 'Enter keeps the note and goes back to the game');
  assert.equal(await shown(page, 'note-box'), false);
  assert.equal(s.n, 1);
  assert.equal(s.stored, 1);

  const md = await page.evaluate(() => window.game.notes.exportText());
  assert.match(md, /^# Bullet Ballet 試玩回饋\n/);
  assert.ok(md.includes('## 1 · 脈衝夜店 · 第 '), md);
  assert.ok(md.includes('> 旋轉閃避的無敵時間太短 被打中兩次'), md);
  assert.ok(md.includes('被測試用散彈打中 −20'), md);
  assert.ok(md.includes('無（全部預設）'), md);

  // the pause menu button downloads the same text as a .md file
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.equal(await shown(page, 'pause'), true);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#pause button[data-act=export]')]);
  assert.match(download.suggestedFilename(), /^bullet-ballet-feedback-\d{8}-\d{4}\.md$/);
  const count = await page.evaluate(() => document.querySelector('#pause .notes-count').textContent);
  assert.equal(count, '1 條');
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('the stats panel toggles with ` and live tuning survives a reload until reset', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  assert.equal(await shown(page, 'debug'), false);
  await page.keyboard.press('Backquote');
  assert.equal(await shown(page, 'debug'), true);
  const stats = await page.evaluate(() => document.getElementById('dbg-stats').textContent);
  assert.match(stats, /fps/);
  assert.match(stats, /\ntitle · /);
  await snap(page, 'notes-panel.png');

  // change a feel number through the panel like a person would
  await page.fill('#debug input[data-path="FOCUS.worldScale"]', '0.3');
  await page.keyboard.press('Tab');
  let v = await page.evaluate(() => ({ v: window.game.notes.value('FOCUS.worldScale'), diff: window.game.notes.tuningDiff() }));
  assert.equal(v.v, 0.3);
  assert.deepEqual(v.diff, [{ path: 'FOCUS.worldScale', from: 0.2, to: 0.3 }]);
  assert.equal(await shown(page, 'tuned'), true, 'the HUD says the numbers are tuned');

  // remembered across a reload, together with the open panel
  await page.reload();
  await page.waitForFunction(() => window.game && typeof window.game.startRun === 'function', null, { timeout: 120000 });
  v = await page.evaluate(() => ({ v: window.game.notes.value('FOCUS.worldScale'), md: window.game.notes.exportText() }));
  assert.equal(v.v, 0.3);
  assert.equal(await shown(page, 'debug'), true);
  assert.ok(v.md.includes('FOCUS.worldScale 0.2 → 0.3'), v.md);

  await page.click('#dbg-reset');
  v = await page.evaluate(() => ({ v: window.game.notes.value('FOCUS.worldScale'), stored: localStorage.getItem('bullet-ballet.tune') }));
  assert.equal(v.v, 0.2);
  assert.equal(v.stored, '{}');
  assert.equal(await shown(page, 'tuned'), false);

  await page.keyboard.press('Backquote');
  assert.equal(await shown(page, 'debug'), false);
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('the fps badge, the run perf line and the low quality switch', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  assert.equal(await shown(page, 'fps'), false);
  await page.keyboard.press('Backquote');
  await page.check('#dbg-fps');
  assert.equal(await shown(page, 'fps'), true);
  await page.waitForFunction(() => /^[1-9]\d* fps · \d+ ms$/.test(document.getElementById('fps').textContent), null, { timeout: 20000 });
  // a run records its frame times; the export carries them with the GPU name
  await page.keyboard.press('Backquote');
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    // a second of slow frames, by hand: the drop event fires
    for (let i = 0; i < 25; i++) g.notes.update(0.05, 0.05);
    return { run: g.notes.run, line: g.notes.perfLine(), md: g.notes.exportText(), events: g.notes.events.map((e) => e.text), quality: g.quality, bloom: g.post.bloom.enabled, shadows: g.renderer.shadowMap.enabled };
  });
  assert.ok(r.run.frames >= 25, `frames counted: ${r.run.frames}`);
  assert.ok(r.run.below50 >= 1.2, `slow time counted: ${r.run.below50}`);
  assert.match(r.line, /^平均 \d+ fps · 低於 50 fps [\d.]+ 秒（\d+%）.*GPU .+ · 畫質 高$/);
  assert.ok(r.md.includes('- 效能（這局到此刻）：平均'), r.md);
  assert.ok(r.events.some((t) => t.startsWith('掉幀：一秒平均')), r.events.join(' | '));
  assert.equal(r.quality, 'high');
  assert.equal(r.bloom, true);
  assert.equal(r.shadows, true);
  // low quality, remembered: no bloom, no shadows, pixel ratio 1; the badge is remembered too
  await page.evaluate(() => localStorage.setItem('bullet-ballet.quality', 'low'));
  await page.reload();
  await page.waitForFunction(() => window.game && typeof window.game.startRun === 'function', null, { timeout: 120000 });
  const low = await page.evaluate(() => ({ quality: window.game.quality, bloom: window.game.post.bloom.enabled, shadows: window.game.renderer.shadowMap.enabled, ratio: window.game.renderer.getPixelRatio(), line: window.game.notes.perfLine(), sel: document.getElementById('dbg-quality').value }));
  assert.equal(low.quality, 'low');
  assert.equal(low.bloom, false);
  assert.equal(low.shadows, false);
  assert.equal(low.ratio, 1);
  assert.match(low.line, /畫質 低$/);
  assert.equal(low.sel, 'low');
  assert.equal(await shown(page, 'fps'), true, 'the fps badge survives a reload');
  assert.deepEqual(problems(logs), []);
  await page.close();
});
