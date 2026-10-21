// The boss route (頭目路線, 頭目每個場景一次): an arcade run goes start → next →
// the one after, four waves each, and each stage's last wave is the boss of
// its map (maps.js `boss`, one of boss.js BOSSES): waves 4 and 8 a shorter
// fight (3 segments, BOSS +1,000), wave 12 the last in full (5, +2,000).
// Down, the stage moves on at once, whoever is left. The title's maps note
// and the daily card name the route and its three bosses; the HUD bar names
// the boss and has its segments. Endless has no bosses.
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

test('each stage ends on its boss: waves 4 and 8 shorter (3 segments, +1,000), wave 12 in full (5, +2,000); down, the stage moves on; endless has none', { timeout: 180000 }, async () => {
  const { page, logs } = await h.open('?seed=7');
  try {
    const r = await page.evaluate(async () => {
      const { MODES } = await import('/src/waves.js');
      const { MAPS } = await import('/src/maps.js');
      const g = window.game;
      g.frame = () => {};
      g.setRules('normal', []);
      // the routes need no map built
      const routes = MAPS.map((_, start) => g.routeText(start, 'arcade'));
      const look = () => {
        g.hud.update(1 / 60);
        const bar = document.getElementById('boss-bar');
        return {
          map: g.level.map.id,
          boss: g.boss.active,
          kind: g.boss.active ? g.boss.def.kind : null,
          hp: g.boss.active ? g.boss.hp : 0,
          segs: bar.classList.contains('hidden') ? 0 : bar.querySelectorAll('.boss-segs i:not(.lost)').length,
          queue: g.waves.queue.length,
          level: g.audio.musicLevel,
          banner: document.getElementById('banner').textContent,
        };
      };
      const wave = (n) => {
        g.enemies.clear();
        g.waves.wave = n - 1;
        g.waves.startWave();
        return look();
      };
      /** The boss goes down: its BOSS bonus, and how long until the next stage is in (or the run is clear). */
      const down = () => {
        g.enemies.spawn('grunt', { x: g.player.x + 6, z: g.player.z, ex: g.player.x + 6, ez: g.player.z + 0.1, stay: true });
        const before = g.score.score;
        g.boss.finish();
        const bonus = g.score.score - before;
        const stage = g.stage;
        let t = 0;
        for (; t < 12 && g.stage === stage && g.state === 'playing' && g.waves.state !== 'done'; t += 1 / 60) {
          g.player.hp = 100;
          g.updatePlay(1 / 60);
        }
        return { bonus, seconds: Math.round(t * 10) / 10, stage: g.stage, map: g.level.map.id, current: g.bosses.current === g.bosses.none, state: g.waves.state };
      };
      g.setMode('arcade');
      g.startRun(0);
      const out = { routes, waves: {}, downs: [] };
      out.waves[3] = wave(3);
      out.waves[4] = wave(4);
      out.downs.push(down());
      out.waves[8] = wave(8);
      out.downs.push(down());
      out.waves[12] = wave(12);
      out.downs.push(down());
      // endless: no last wave and no stage bosses
      g.setMode('endless');
      g.startRun(0);
      out.endless = [3, 6].map((n) => wave(n).boss);
      out.endlessRoute = g.routeText(0, 'endless');
      out.modes = { arcade: MODES.arcade.midBoss, daily: MODES.daily.midBoss, endless: MODES.endless.midBoss || null };
      return out;
    });
    assert.deepEqual(r.routes, [
      '霓虹天台 → 脈衝夜店 → 七號碼頭（頭目：直升機、刀后、重炮）',
      '脈衝夜店 → 七號碼頭 → 議事亭前地（頭目：刀后、重炮、車隊）',
      '七號碼頭 → 議事亭前地 → 霓虹天台（頭目：重炮、車隊、直升機）',
      '議事亭前地 → 霓虹天台 → 脈衝夜店（頭目：車隊、直升機、刀后）',
    ]);
    const w = r.waves;
    assert.deepEqual([w[3].map, w[3].boss, w[3].level], ['rooftop', false, 1], 'wave 3: a wave');
    assert.deepEqual([w[4].map, w[4].boss, w[4].kind, w[4].hp, w[4].segs, w[4].queue, w[4].level], ['rooftop', true, 'heli', 3, 3, 0, 2], 'wave 4: the helicopter, three segments, no wave, the boss section');
    assert.match(w[4].banner, /BOSS.*天台直升機 · 打倒就轉場/);
    assert.deepEqual([w[8].map, w[8].kind, w[8].hp, w[8].segs, w[8].level], ['club', 'blade', 3, 3, 2], 'wave 8: the blade queen, three segments');
    assert.deepEqual([w[12].map, w[12].kind, w[12].hp, w[12].segs, w[12].level], ['docks', 'gunner', 5, 5, 2], 'wave 12: the heavy gunner in full');
    assert.match(w[12].banner, /BOSS.*碼頭重炮 · 最後一波/);
    const [d4, d8, d12] = r.downs;
    assert.deepEqual([d4.bonus, d8.bonus, d12.bonus], [1000, 1000, 2000], 'BOSS +1,000 a stage, +2,000 the last');
    assert.deepEqual([d4.stage, d4.map, d4.current, d8.stage, d8.map], [1, 'club', true, 2, 'docks'], 'down, the stage moves on, the boss gone with its map');
    assert.ok(d4.seconds < 6 && d8.seconds < 6, `the next stage is in ${d4.seconds} s and ${d8.seconds} s after the boss is down, a thug still standing`);
    assert.equal(d12.state, 'done', 'the last boss down: the run is clear');
    assert.deepEqual([r.endless, r.endlessRoute], [[false, false], ''], 'endless has no bosses and no route');
    assert.deepEqual(r.modes, { arcade: { segments: 3, bonus: 1000 }, daily: { segments: 3, bonus: 1000 }, endless: null });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('the title names the route of the map card picked or pointed at; the daily card names its route', async () => {
  const { page, logs } = await h.open('?seed=7');
  try {
    await page.evaluate(() => {
      const g = window.game;
      g.setMode('arcade');
      g.startMap = 2;
      g.markMapCard();
    });
    const note = () => page.evaluate(() => document.getElementById('maps-note').textContent);
    const picked = await note();
    assert.match(picked, /^每 4 波換一個場景，第 12 波完結：七號碼頭 → 議事亭前地 → 霓虹天台（頭目：重炮、車隊、直升機）$/);
    await page.hover('.map-card:nth-child(1)');
    assert.match(await note(), /：霓虹天台 → 脈衝夜店 → 七號碼頭/);
    await page.screenshot({ path: new URL('route-title.png', OUT).pathname });
    await page.mouse.move(5, 5);
    assert.equal(await note(), picked, 'pointing away: the picked card’s route again');
    await page.click('.mode-card[data-mode="endless"]');
    assert.equal(await note(), '每 3 波換一個場景');
    const daily = await page.evaluate(async () => {
      const { dailyFor, utcDay } = await import('/src/daily.js');
      const g = window.game;
      const d = dailyFor(utcDay(g.now()));
      return { what: document.getElementById('daily-what').textContent, route: g.routeText(d.map, 'daily') };
    });
    assert.ok(daily.route.includes(' → ') && daily.what.includes(daily.route), daily.what);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('a stage boss on screen: wave 4 on the rooftop, the helicopter over the pad, its bar three segments long', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open('?seed=7');
  try {
    const r = await page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.enemies.clear();
      g.waves.wave = 3;
      g.waves.startWave();
      // in over the roof, the light on the player
      for (let i = 0; i < 6 * 60; i++) {
        g.player.hp = 100;
        g.player.vx = g.player.vz = 0;
        g.updatePlay(1 / 60);
      }
      g.boss.hurt('中彈');
      g.hud.update(1 / 60);
      g.updateCamera(1, true);
      g.render();
      const bar = document.getElementById('boss-bar');
      return { segs: bar.querySelectorAll('.boss-segs i').length, lost: bar.querySelectorAll('.boss-segs i.lost').length, name: bar.querySelector('.boss-name').textContent, hp: g.boss.hp };
    });
    await page.screenshot({ path: new URL('boss-stage.png', OUT).pathname });
    assert.deepEqual(r, { segs: 3, lost: 1, name: '天台直升機 HELICOPTER', hp: 2 });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
