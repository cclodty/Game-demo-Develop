// The boss route (頭目路線): an arcade run goes start → next → the one after,
// four waves each, and its last wave is the boss of the map it ends on
// (maps.js `boss`, one of boss.js BOSSES), only then. The title's maps note
// and the daily card name the route and its boss; the HUD bar names the boss.
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

test('each start map: the route and its last map; a boss on the last wave of a map that has one, and only then', async () => {
  const { page, logs } = await h.open('?seed=7');
  try {
    const r = await page.evaluate(async () => {
      const { BOSSES } = await import('/src/boss.js');
      const { MAPS } = await import('/src/maps.js');
      const g = window.game;
      g.frame = () => {};
      g.setRules('normal', []);
      // the routes need no map built
      const routes = MAPS.map((_, start) => {
        const last = MAPS[(start + 2) % MAPS.length];
        return { route: g.routeText(start, 'arcade'), last: last.id, has: !!(last.boss && BOSSES[last.boss.kind]) };
      });
      // waves 11 and 12 on the third map: from the docks (ends on the rooftop) and from the rooftop (ends on the docks)
      const look = () => {
        g.hud.update(1 / 60);
        const bar = document.getElementById('boss-bar');
        return { map: g.level.map.id, boss: g.boss.active, kind: g.boss.active ? g.boss.def.kind : null, bar: !bar.classList.contains('hidden'), name: bar.querySelector('.boss-name').textContent, banner: document.getElementById('banner').textContent };
      };
      const finals = {};
      for (const start of [2, 0]) {
        g.setMode('arcade');
        g.startRun(start);
        g.waves.state = 'done';
        g.enemies.clear();
        g.stage = 2;
        g.level.load(g.stageMap);
        g.applyMapView();
        g.player.placeAtStart();
        g.waves.wave = 10;
        g.waves.startWave();
        const before = look();
        g.enemies.clear();
        g.waves.startWave();
        finals[start] = { before, final: look() };
      }
      // endless: no last wave, so no boss
      g.setMode('endless');
      g.startRun(0);
      g.waves.wave = 11;
      g.waves.startWave();
      return { routes, finals, endless: g.boss.active, endlessRoute: g.routeText(0, 'endless') };
    });
    const names = ['霓虹天台', '脈衝夜店', '七號碼頭', '議事亭前地'];
    r.routes.forEach((s, start) => {
      const maps = [0, 1, 2].map((i) => names[(start + i) % 4]);
      assert.ok(s.route.startsWith(maps.join(' → ')), `start ${start}: ${s.route}`);
      assert.equal(s.route.includes('頭目'), s.has, `start ${start}: the route names the boss when ${s.last} has one`);
    });
    const roof = r.finals[2];
    assert.equal(r.routes[2].last, 'rooftop');
    assert.ok(r.routes[2].route.endsWith('（頭目：天台直升機）'), r.routes[2].route);
    assert.deepEqual([roof.before.map, roof.before.boss, roof.before.bar], ['rooftop', false, false], 'wave 11 on the rooftop: no boss');
    assert.deepEqual([roof.final.boss, roof.final.kind, roof.final.bar, roof.final.name], [true, 'heli', true, '天台直升機 HELICOPTER'], 'wave 12: the helicopter, its name on the bar');
    assert.match(roof.final.banner, /BOSS/);
    const docks = r.finals[0];
    assert.equal(docks.final.map, 'docks');
    assert.equal(docks.final.boss, r.routes[0].has, 'the docks: a boss on wave 12 exactly when the map has one');
    assert.equal(docks.before.boss, false);
    assert.deepEqual([r.endless, r.endlessRoute], [false, ''], 'endless has no last wave and no boss');
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
    assert.match(picked, /^每 4 波換一個場景，第 12 波完結：七號碼頭 → 議事亭前地 → 霓虹天台（頭目：天台直升機）$/);
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
