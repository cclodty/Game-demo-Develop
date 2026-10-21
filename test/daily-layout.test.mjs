// The daily's layout (每日挑戰 ②: 道具重排). A daily run moves each map's
// barrels, pans and tools among their spots: the places the map gives them and
// a few spare ones of each kind (maps.js `spots`), dealt from the day's seed
// (main.js layoutFor, level.js dealProps). So the same day is the same layout
// everywhere (another page, another hour, a replay of it), another day another;
// the walls and spawns never move, and arcade keeps the map's own places. That
// every layout passes the map validator is test/maps.test.mjs.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** A page whose clock says `iso`, with helpers that read where the props stand. */
async function dayPage(iso) {
  const { page, logs } = await h.open('?seed=1'); // the daily ignores ?seed
  await page.evaluate((iso) => {
    const g = window.game;
    g.frame = () => {};
    g.now = () => Date.parse(iso);
    const loose = () => g.level.props.filter((p) => !p.fixed);
    /** Every prop that can move: kind, variant and place, sorted (the order they were built in makes no difference). */
    window.layout = () => loose().map((p) => `${p.kind}/${p.variant || ''}@${p.x.toFixed(2)},${p.z.toFixed(2)}`).sort();
    /** Just the places, and the map's own places for its barrels, pans and tools. */
    window.places = () => loose().map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`).sort();
    window.own = () => {
      const m = g.level.map;
      return [...(m.barrels || []), ...(m.pans || []), ...(m.tools || [])].map(([x, z]) => `${x.toFixed(2)},${z.toFixed(2)}`).sort();
    };
  }, iso);
  return { page, logs };
}

/** Start the day's run (a fresh store: the one try a day is test/daily.test.mjs) and read its layout, walls and spawns. */
const dailyLayout = (page) =>
  page.evaluate(() => {
    const g = window.game;
    g.daily.days = {};
    g.daily.replay = null;
    g.startDaily();
    g.updatePlay(1 / 60);
    const L = g.level;
    return { map: L.map.id, layout: window.layout(), places: window.places(), own: window.own(), walls: L.solids.length, spawns: L.spawns.map((s) => `${s.ex},${s.ez}`) };
  });

test('a daily deals the props out among their spots: the same day the same layout in another page at another hour; the next time the table comes round to the map another; walls and spawns stay; the title and arcade keep the map’s own places; the next stage is dealt too', { timeout: 300000 }, async () => {
  const { dailyFor, ROTATION } = await import('../src/daily.js');
  const day = '2026-10-18';
  const later = new Date(Date.parse(`${day}T00:00:00Z`) + ROTATION.length * 86400000).toISOString().slice(0, 10);
  assert.equal(dailyFor(later).map, dailyFor(day).map, 'the same map again');
  const a = await dayPage(`${day}T09:00:00Z`);
  const b = await dayPage(`${day}T22:30:00Z`);
  const c = await dayPage(`${later}T12:00:00Z`);
  try {
    const ra = await dailyLayout(a.page);
    const rb = await dailyLayout(b.page);
    const rc = await dailyLayout(c.page);
    assert.deepEqual(rb.layout, ra.layout, 'another page, another hour: the same layout');
    assert.equal(rc.map, ra.map);
    assert.notDeepEqual(rc.layout, ra.layout, 'another day on the same map: another layout');
    assert.notDeepEqual(ra.places, ra.own, 'the props are not where the map has them');
    assert.deepEqual([rc.walls, rc.spawns], [ra.walls, ra.spawns], 'the walls and spawns stay');

    // the next stage of the day's run is dealt from the day too, its own way
    const next = await a.page.evaluate(() => {
      const g = window.game;
      g.beginStageTransition();
      g.updateTransition(1);
      return { map: g.level.map.id, places: window.places(), own: window.own(), layout: window.layout() };
    });
    assert.notEqual(next.map, ra.map);
    assert.notDeepEqual(next.places, next.own, 'stage 2 is dealt as well');
    const nextB = await b.page.evaluate(() => {
      const g = window.game;
      g.beginStageTransition();
      g.updateTransition(1);
      return window.layout();
    });
    assert.deepEqual(nextB, next.layout, 'and the same in another page');

    // back to the title, then an arcade run on the same map: the map's own places
    const arcade = await a.page.evaluate((map) => {
      const g = window.game;
      g.toTitle();
      const title = { places: window.places(), own: window.own() };
      g.setMode('arcade');
      g.startRun(g.maps.findIndex((m) => m.id === map));
      g.updatePlay(1 / 60);
      return { title, places: window.places(), own: window.own() };
    }, ra.map);
    assert.deepEqual(arcade.title.places, arcade.title.own, 'the title: where the map has them');
    assert.deepEqual(arcade.places, arcade.own, 'arcade: where the map has them');
    // and the daily again after it: the day's layout comes back
    const again = await dailyLayout(a.page);
    assert.deepEqual(again.layout, ra.layout);
    for (const p of [a, b, c]) assert.deepEqual(problems(p.logs), []);
  } finally {
    for (const p of [a, b, c]) await p.page.close();
  }
});

test('a replay of a daily plays on the day’s layout', { timeout: 300000 }, async () => {
  const a = await dayPage('2026-10-19T08:00:00Z');
  try {
    const r = await a.page.evaluate(() => {
      const g = window.game;
      g.daily.days = {};
      g.startDaily();
      g.updatePlay(1 / 60);
      const live = window.layout();
      for (let i = 0; i < 120; i++) g.updatePlay(1 / 60);
      const bytes = g.record.encode();
      g.toTitle();
      // an arcade run on the same map in between
      g.setMode('arcade');
      g.startRun(g.startMap);
      g.updatePlay(1 / 60);
      const between = window.layout();
      const err = g.playReplay(bytes);
      g.updatePlay(1 / 60);
      return { err, live, between, replay: window.layout(), replaying: !!g.replay, mode: g.mode };
    });
    assert.equal(r.err, null);
    assert.deepEqual([r.replaying, r.mode], [true, 'daily']);
    assert.notDeepEqual(r.between, r.live);
    assert.deepEqual(r.replay, r.live, 'the replay sees what the run saw');
    assert.deepEqual(problems(a.logs), []);
  } finally {
    await a.page.close();
  }
});
