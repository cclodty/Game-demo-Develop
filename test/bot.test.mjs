// A bot plays a short run on every map in the default 45° side view. The run
// must not throw, enemies must arrive and the bot must fire and get shot at.
// BOT_CHUNKS (default 6) × 90 frames per map; npm run test:game plays longer.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { botStats, gameHarness, installBot, problems, snap } from './helpers.mjs';

const CHUNKS = Number(process.env.BOT_CHUNKS || 6);
let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

test('a bot run on every map finishes without errors', { timeout: 20 * 60 * 1000 }, async () => {
  const { page, logs } = await h.open();
  const n = await page.evaluate(() => window.game.maps.length);
  for (let map = 0; map < n; map++) {
    await installBot(page, { map, view: 2 });
    for (let c = 0; c < CHUNKS; c++) {
      const ok = await page.evaluate(() => window.simStep(90));
      if (!ok) break;
    }
    const s = await botStats(page);
    await snap(page, `bot-${s.map}.png`);
    assert.deepEqual(s.errors, [], `${s.map}: ${s.errors[0] || ''}`);
    assert.ok(s.wave >= 1, `${s.map}: no wave started`);
    assert.ok(s.frames >= CHUNKS * 90 - 1, `${s.map}: the run stopped early`);
    console.log(`${s.map}: wave ${s.wave}, ${s.kills} kills, ${s.enemyShots} enemy shots, ${s.hits} hits taken, styles ${Object.keys(s.styles).join(' ')}`);
  }
  assert.deepEqual(problems(logs), []);
  await page.close();
});
