// The title screen (標題畫面整理): logo, the daily challenge, mode, the rules
// line, the maps and the start fit a 1280×720 window without scrolling. The
// difficulty, variant and coat picks fold away under the rules line, which
// says what is picked; the controls and tips are a page of their own (HOW TO
// PLAY), opened from the row with the boards, achievements and replays.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** Where the title's parts are, and whether the title scrolls. */
const look = (page) =>
  page.evaluate(() => {
    const t = document.getElementById('title');
    const shown = (sel) => {
      const e = document.querySelector(sel);
      const r = e.getBoundingClientRect();
      return e.offsetParent !== null && r.top >= 0 && r.bottom <= innerHeight;
    };
    return {
      scrolls: t.scrollHeight > t.clientHeight,
      inView: Object.fromEntries(['.logo', '#daily-start', '#mode-cards', '#open-rules', '#map-cards', '#title .start', '#open-help', '#open-boards', '#open-achievements', '#open-replays'].map((s) => [s, shown(s)])),
      fold: !document.getElementById('rules-fold').classList.contains('hidden'),
      expanded: document.getElementById('open-rules').getAttribute('aria-expanded'),
      summary: document.getElementById('rules-summary').textContent,
      help: !document.getElementById('help').classList.contains('hidden'),
      title: !t.classList.contains('hidden'),
      state: window.game.state,
    };
  });

test('the title fits 1280×720 without scrolling; on a first visit the records switch pushes only the links row down', async () => {
  const { page, logs } = await h.open('?seed=1');
  try {
    const first = await look(page);
    assert.equal(first.inView['#title .start'], true, 'first visit: the start prompt is on the first screen');
    await page.click('#telemetry-ok');
    const r = await look(page);
    assert.equal(r.scrolls, false, 'the title does not scroll');
    assert.deepEqual(Object.entries(r.inView).filter(([, v]) => !v), [], 'everything is on the first screen');
    assert.deepEqual([r.fold, r.expanded, r.summary], [false, 'false', '正常 · 沒有變體'], 'the picks are folded; the line says what is picked');
    await page.screenshot({ path: new URL('title.png', OUT).pathname });
    // every control the title had is still on the page
    const ids = await page.evaluate(() =>
      ['daily-card', 'daily-start', 'daily-replay', 'mode-cards', 'difficulty-cards', 'variant-cards', 'coat-row', 'coat-cards', 'maps-note', 'map-cards', 'telemetry-switch', 'telemetry-on', 'open-boards', 'open-achievements', 'open-replays', 'view-name', 'pad-name'].filter((id) => !document.getElementById(id)),
    );
    assert.deepEqual(ids, []);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('a new player’s title (彈幕 ② C③): one mode card, the game’s own; no daily card, no map cards; it fits 1280×720; ?modes=all brings the older four back', async () => {
  const { page, logs } = await h.open('?seed=1&mode=danmaku'); // nothing remembered: the harness stores no mode when one is named
  try {
    await page.click('#telemetry-ok');
    const r = await look(page);
    const t = await page.evaluate(() => ({
      mode: window.game.mode,
      cards: [...document.querySelectorAll('#mode-cards .mode-card')].filter((c) => c.offsetParent !== null).map((c) => c.dataset.mode),
      hiddenCards: [...document.querySelectorAll('#mode-cards .mode-card')].filter((c) => c.offsetParent === null).map((c) => c.dataset.mode),
      daily: document.getElementById('daily-start').offsetParent !== null,
      maps: document.getElementById('map-cards').offsetParent !== null,
      head: document.querySelector('.maps-title').textContent,
    }));
    assert.equal(t.mode, 'danmaku');
    assert.deepEqual(t.cards, ['danmaku'], `one card: ${t.cards}`);
    assert.deepEqual(t.hiddenCards, ['arcade', 'endless', 'night'], 'the older ones still on the page, off it');
    assert.ok(!t.daily && !t.maps, 'no daily card, no map cards');
    assert.ok(!t.head.includes('選擇起點場景') && t.head.includes('茶樓'), `the maps line says the rooms: ${t.head}`);
    assert.equal(r.scrolls, false, 'the title does not scroll');
    assert.deepEqual(Object.entries(r.inView).filter(([k, v]) => !v && !['#daily-start', '#map-cards'].includes(k)), [], 'everything else is on the first screen');
    await page.screenshot({ path: new URL('title-new.png', OUT).pathname });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
  const all = await h.open('?seed=1&modes=all');
  try {
    const t = await all.page.evaluate(() => ({
      mode: window.game.mode,
      cards: [...document.querySelectorAll('#mode-cards .mode-card')].filter((c) => c.offsetParent !== null).map((c) => c.dataset.mode),
      daily: document.getElementById('daily-start').offsetParent !== null,
      maps: document.getElementById('map-cards').offsetParent !== null,
    }));
    assert.deepEqual(t, { mode: 'danmaku', cards: ['arcade', 'endless', 'night', 'danmaku'], daily: true, maps: true });
    const asked = await h.open('?seed=1&mode=night');
    const n = await asked.page.evaluate(() => ({ mode: window.game.mode, cards: [...document.querySelectorAll('#mode-cards .mode-card')].filter((c) => c.offsetParent !== null).length }));
    assert.deepEqual(n, { mode: 'night', cards: 4 }, '?mode= picks an older mode and shows them');
    await asked.page.close();
  } finally {
    await all.page.close();
  }
});

test('the rules line opens and folds the picks, says what is picked, and starts nothing', async () => {
  const { page, logs } = await h.open('?seed=1');
  try {
    await page.click('#telemetry-ok');
    await page.click('#open-rules');
    const open = await look(page);
    assert.deepEqual([open.fold, open.expanded, open.state], [true, 'true', 'title']);
    await page.click('#difficulty-cards [data-rule="ballet"]');
    await page.click('#variant-cards [data-rule="dualist"]');
    await page.click('#variant-cards [data-rule="glassCity"]');
    // a gap in the fold is not a start either
    const box = await page.locator('#rules-fold').boundingBox();
    await page.mouse.click(box.x + 2, box.y + box.height / 2);
    const picked = await look(page);
    assert.deepEqual([picked.state, picked.summary], ['title', '芭蕾 · 雙槍主義、玻璃之城']);
    await page.screenshot({ path: new URL('title-rules.png', OUT).pathname });
    await page.click('#open-rules');
    const folded = await look(page);
    assert.deepEqual([folded.fold, folded.expanded, folded.summary, folded.scrolls], [false, 'false', '芭蕾 · 雙槍主義、玻璃之城', false]);
    // the coat, once open, joins the line
    const coat = await page.evaluate(() => {
      const g = window.game;
      g.achievements.done.closeShave = true;
      g.achievements.setCoat('gold');
      g.setRules('normal', []);
      return document.getElementById('rules-summary').textContent;
    });
    assert.equal(coat, '正常 · 沒有變體 · 金色外套');
    // what was picked is what the next run plays
    await page.keyboard.press('Enter');
    const run = await page.evaluate(() => ({ state: window.game.state, rules: [window.game.ruleset.difficulty, window.game.ruleset.variants] }));
    assert.deepEqual(run, { state: 'playing', rules: ['normal', []] });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('HOW TO PLAY: opens from the title, Enter and 1–4 start nothing there, Esc, Enter and the back button return', async () => {
  const { page, logs } = await h.open('?seed=1');
  try {
    await page.click('#telemetry-ok');
    await page.click('#open-help');
    const opened = await look(page);
    assert.deepEqual([opened.help, opened.title, opened.state], [true, false, 'title']);
    const fits = await page.evaluate(() => {
      const e = document.getElementById('help');
      return e.scrollHeight <= e.clientHeight;
    });
    assert.ok(fits, 'the help page fits 1280×720');
    await page.screenshot({ path: new URL('title-help.png', OUT).pathname });
    await page.keyboard.press('Digit2');
    assert.equal((await look(page)).state, 'title', '1–4 start nothing on the help page');
    await page.keyboard.press('Enter');
    const entered = await look(page);
    assert.deepEqual([entered.state, entered.help, entered.title], ['title', false, true], 'Enter there presses the back button (it has the focus): the title, no run');
    await page.click('#open-help');
    await page.locator('#help .col h3').first().click(); // the focus off the back button: Enter is just Enter
    await page.keyboard.press('Enter');
    assert.equal((await look(page)).state, 'title', 'Enter starts nothing on the help page');
    await page.keyboard.press('Escape');
    const back = await look(page);
    assert.deepEqual([back.help, back.title, back.state], [false, true, 'title']);
    await page.click('#open-help');
    await page.click('#help-close');
    const closed = await look(page);
    assert.deepEqual([closed.help, closed.title], [false, true]);
    // the other pages' back buttons (they used to throw: the pause menu's click handler took them too)
    for (const [open, close] of [['#open-achievements', '#achievements-close'], ['#open-boards', '#boards-close'], ['#open-replays', '#replays-close']]) {
      await page.click(open);
      await page.click(close);
      assert.equal((await look(page)).title, true, `${close} returns to the title`);
    }
    // the camera view's name is kept up to date on the help page
    await page.keyboard.press('KeyV');
    const view = await page.evaluate(() => [document.getElementById('view-name').textContent, window.game.view]);
    assert.ok(view[0].length > 0);
    await page.keyboard.press('Enter');
    assert.equal((await look(page)).state, 'playing', 'Enter on the title still starts a run');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
