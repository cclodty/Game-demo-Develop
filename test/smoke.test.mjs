// The page loads, a run starts, the pause menu works, maps can be switched
// and game over returns to the title. Run: npm test
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

const state = (page) =>
  page.evaluate(() => {
    const g = window.game;
    const vis = (id) => !document.getElementById(id).classList.contains('hidden');
    return { state: g.state, map: g.level.map.id, view: g.view, title: vis('title'), pause: vis('pause'), over: vis('gameover'), hud: vis('hud'), enemies: g.enemies.list.length, hp: g.player.hp, playing: document.body.classList.contains('playing') };
  });

test('the title screen loads with no errors and the 45° side view as default', async () => {
  const { page, logs } = await h.open();
  const s = await state(page);
  assert.equal(s.state, 'title');
  assert.equal(s.view, 2, 'fresh storage should default to the 45° side view');
  assert.equal(s.title, true);
  assert.deepEqual(problems(logs), []);
  await snap(page, 'smoke-title.png');
  await page.close();
});

test('start, pause menu, back to title, pick another map, restart', async () => {
  const { page, logs } = await h.open();
  await page.click('.map-card >> nth=0');
  await page.waitForTimeout(3000);
  let s = await state(page);
  assert.equal(s.state, 'playing');
  assert.equal(s.map, 'rooftop');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  s = await state(page);
  assert.equal(s.state, 'paused');
  assert.equal(s.pause, true);
  assert.match(await page.textContent('#pause-info'), /第 \d+ 波/);

  await page.click('#pause button[data-act=title]');
  await page.waitForTimeout(500);
  s = await state(page);
  assert.equal(s.state, 'title');
  assert.equal(s.enemies, 0, 'quitting clears the enemies');
  assert.equal(s.hud, false);
  assert.equal(s.playing, false);

  await page.keyboard.press('Digit4');
  await page.waitForTimeout(3000);
  s = await state(page);
  assert.equal(s.state, 'playing');
  assert.equal(s.map, 'senado');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.game.player.hp = 37;
  });
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(300);
  s = await state(page);
  assert.equal(s.state, 'playing', 'R on the pause menu restarts');
  assert.equal(s.hp, 100);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(400);
  s = await state(page);
  assert.equal(s.state, 'title', 'T on the pause menu goes back to the title');
  assert.deepEqual(problems(logs), []);
  await page.close();
});

test('dying shows the game over screen and T returns to the title', async () => {
  const { page, logs } = await h.open();
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const p = window.game.player;
    p.invuln = 0;
    p.spinT = 0;
    p.hurt(500, 0, 1);
  });
  await page.waitForFunction(() => window.game.state === 'over', null, { timeout: 30000 });
  await page.waitForTimeout(900);
  let s = await state(page);
  assert.equal(s.over, true);
  await snap(page, 'smoke-gameover.png');
  await page.click('#gameover button[data-act=title]');
  await page.waitForTimeout(400);
  s = await state(page);
  assert.equal(s.state, 'title');
  assert.equal(s.over, false);
  assert.deepEqual(problems(logs), []);
  await page.close();
});
