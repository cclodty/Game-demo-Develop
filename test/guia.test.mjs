// 東望洋跑道 Guia Circuit (新地圖 ①): the sixth map, a hairpin of the street
// circuit at night, about 56 × 40 m, built by hand to the ROADMAP's size. The
// track comes in along the north, turns round the west end and goes back out
// along the south; inside the hairpin an infield behind blue-and-white tyre
// walls, outside it guardrails with marshals' gates, the grandstand to the
// north and a run-off past the bend. A tyre wall stops a shot but is low: a man
// up on the grandstand's front (its perches) sees over it. In MAPS (sixth,
// key 6), in the daily rotation, and taken by the back end. The teams and
// sponsors are made up. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=43'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.guia = () => g.maps.findIndex((m) => m.id === 'guia');
    /** The map loaded on its own (no run). */
    window.load = () => {
      g.level.load(g.maps[window.guia()]);
      return g.level;
    };
  });
});
after(async () => {
  await h.close();
});

test('the hairpin: about 56 × 40 m, a track round a bend between tyre walls and guardrails, open all the way round; spawns along the track, past the bend and from both sides; sixth in MAPS, in the daily rotation, and the back end takes it', async () => {
  const r = await page.evaluate(async () => {
    const { DAILY_ROTATION } = await import('/src/rules.js');
    const { LIMITS } = await import('/backend/worker.js');
    const g = window.game;
    const i = window.guia();
    const L = window.load();
    const { halfW, halfD } = L.bounds;
    const tyres = L.solids.filter((s) => s.matKey === 'tyres');
    const rails = L.solids.filter((s) => s.matKey === 'rail');
    // round the bend: the tyre stacks' distance from the hairpin's centre (the furthest west point of the inner wall, and its middle)
    const inner = tyres.filter((s) => s.maxX - s.minX < 1 && (s.minX + s.maxX) / 2 < -10);
    const cx = -10;
    const radii = inner.map((s) => Math.round(Math.hypot((s.minX + s.maxX) / 2 - cx, (s.minZ + s.maxZ) / 2) * 10) / 10);
    // along the track round the bend: from the north straight to the south one, both just east of the bend (going
    // round is shorter than through the infield's gaps)
    const track = L.nav.findPath(-15, -9, -15, 9);
    const westmost = track ? Math.min(...track.map((p) => p.x)) : 0;
    const spawns = L.spawns.map((s) => [s.ex, s.ez]);
    return {
      index: i,
      count: g.maps.length,
      name: [g.maps[i].name, g.maps[i].en],
      size: [halfW * 2, halfD * 2],
      tyres: tyres.length,
      tallestTyre: Math.max(...tyres.map((s) => s.h)),
      rails: rails.length,
      tallestRail: Math.max(...rails.map((s) => s.h)),
      bend: { inner: radii.filter((r) => Math.abs(r - 5.4) < 0.2).length, outer: radii.filter((r) => Math.abs(r - 13.1) < 0.2).length },
      track: !!track,
      westmost,
      east: spawns.filter(([x]) => x > halfW - 5).length,
      west: spawns.filter(([x]) => x < -15).length,
      north: L.spawns.filter((s) => s.z < -13).length,
      south: L.spawns.filter((s) => s.z > 13).length,
      perches: L.balconies.length,
      daily: DAILY_ROTATION.filter((d) => d.map === i).length,
      backend: LIMITS.maps,
    };
  });
  assert.equal(r.index, 5, 'the sixth map');
  assert.deepEqual(r.name, ['東望洋跑道', 'GUIA CIRCUIT']);
  assert.ok(r.size[0] >= 52 && r.size[0] <= 60 && r.size[1] >= 36 && r.size[1] <= 44, `about 56 × 40 m (${r.size})`);
  assert.ok(r.tyres >= 60 && r.tallestTyre <= 1, `${r.tyres} tyre stacks and runs, none over 1 m`);
  assert.ok(r.rails >= 4 && r.tallestRail <= 1.1, `${r.rails} lengths of guardrail, none over 1.1 m`);
  assert.ok(r.bend.inner >= 15 && r.bend.outer >= 30, `round the bend: ${r.bend.inner} stacks inside, ${r.bend.outer} outside`);
  assert.equal(r.track, true, 'the track is open from one straight round the bend to the other');
  assert.ok(r.westmost < -15.5, `the way round goes past the bend (${r.westmost.toFixed(1)})`);
  assert.ok(r.east >= 2 && r.west >= 2 && r.north >= 2 && r.south >= 2, `spawns: ${r.east} east, ${r.west} past the bend, ${r.north} north, ${r.south} south`);
  assert.equal(r.perches, 4, 'four places on the grandstand');
  assert.ok(r.daily >= 1, 'in the daily rotation');
  assert.equal(r.backend, r.count, 'the leaderboard back end takes every map');
  assert.deepEqual(problems(logs), []);
});

test('a tyre wall stops a shot along the ground and hides a man crouched behind it from the street, but not from the grandstand', async () => {
  const r = await page.evaluate(() => {
    const L = window.load();
    // the inner tyre wall on the north straight: the infield behind it at z -4, the track in front at z -8
    const shot = L.raycast(4, -8, 4, -3, false, 0, false);
    const perch = L.balconies[1];
    const from = { x: perch.ex, z: perch.ez };
    return {
      wall: shot ? shot.solid.matKey : null,
      street: L.hasLOS(4, -9, 4, -3.8, 0),
      stand: L.hasLOS(from.x, from.z, 4, -3.8, perch.perch),
      standHigh: perch.perch,
    };
  });
  assert.equal(r.wall, 'tyres', 'a shot along the ground stops at the tyres');
  assert.equal(r.street, false, 'from the track, no line of sight over the tyre wall');
  assert.equal(r.stand, true, `from the grandstand, ${r.standHigh} m up, over it`);
  assert.deepEqual(problems(logs), []);
});

test('a man sent up to the grandstand shoots at the player in the infield however far off he is: up there he cannot come closer', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.setRules('normal', []);
    g.setMode('arcade');
    g.startRun(window.guia());
    g.waves.state = 'done';
    g.enemies.clear();
    g.setFocus(false);
    const L = g.level;
    const p = g.player;
    [p.x, p.z] = L.map.start; // in the infield, behind the tyre walls
    const far = (b) => Math.hypot(b.ex - p.x, b.ez - p.z);
    const sp = L.balconies.reduce((a, b) => (far(b) > far(a) ? b : a));
    const e = g.enemies.spawn('grunt', sp);
    e.spawnLock = 0;
    const hits = [];
    const hurt0 = p.hurt.bind(p);
    p.hurt = (...a) => {
      const hit = hurt0(...a);
      if (hit) hits.push(a[4] || 'hit');
      p.hp = 100;
      return hit;
    };
    g.input.keys.clear();
    g.input.mouse.left = false;
    for (let i = 0; i < 120 * 15 && !hits.length; i++) {
      g.killcamT = 0;
      g.hitstopT = 0;
      p.x = L.map.start[0];
      p.z = L.map.start[1];
      g.updatePlay(1 / 120);
    }
    return { d: far(sp), reach: e.cfg.range[1] + 3, perch: e.perch, los: e.los, hits: hits.length };
  });
  assert.ok(r.perch > 0 && r.d > r.reach, `up ${r.perch} m, ${r.d.toFixed(1)} m off: past where a grunt on the street would fire (${r.reach} m)`);
  assert.equal(r.los, true, 'he sees the player over the tyre wall');
  assert.ok(r.hits >= 1, 'and fires at him');
  assert.deepEqual(problems(logs), []);
});

test('a card on the title, no scrolling at 1280 × 720; key 6 starts here', async () => {
  await page.evaluate(() => window.game.toTitle());
  if (await page.isVisible('#telemetry-ok')) await page.click('#telemetry-ok'); // the first visit's records switch, as test/title.test.mjs
  const r = await page.evaluate(() => ({
    cards: document.querySelectorAll('#map-cards .map-card').length,
    scroll: document.scrollingElement.scrollHeight > innerHeight + 1,
    title: document.getElementById('title').scrollHeight <= document.getElementById('title').clientHeight + 1,
    note: document.querySelector('.start span').textContent,
  }));
  assert.equal(r.cards, 7, 'a card for every map (大三巴 the seventh)');
  assert.equal(r.scroll, false, 'the page does not scroll');
  assert.equal(r.title, true, 'nor does the title');
  assert.match(r.note, /1–7/);
  await page.screenshot({ path: new URL('guia-title.png', OUT).pathname });
  await page.keyboard.press('Digit6');
  const started = await page.evaluate(() => ({ state: window.game.state, map: window.game.level.map.id, start: window.game.startMap }));
  assert.deepEqual(started, { state: 'playing', map: 'guia', start: 5 });
  await page.evaluate(() => window.game.toTitle());
  assert.deepEqual(problems(logs), []);
});

test('an arcade run from 東望洋跑道: a god-mode bot plays it to the end of wave 4 and on to the next stage', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 5, view: 0, seed: 6, mode: 'arcade', restart: false });
  const r = await page.evaluate(() => {
    const g = window.game;
    const hurt0 = g.player.hurt.bind(g.player);
    g.player.hurt = (...a) => {
      const hit = hurt0(...a);
      g.player.hp = 100;
      return hit;
    };
    const seen = { spawns: new Set(), stages: [] };
    const spawn0 = g.enemies.spawn.bind(g.enemies);
    g.enemies.spawn = (type, sp, ...a) => {
      seen.spawns.add(`${sp.ex},${sp.ez}`);
      return spawn0(type, sp, ...a);
    };
    const begin0 = g.beginStageTransition.bind(g);
    g.beginStageTransition = () => {
      seen.stages.push(g.waves.wave);
      return begin0();
    };
    for (let chunk = 0; chunk < 90 && g.level.map.id === 'guia' && g.state === 'playing'; chunk++) window.simStep(600);
    return { map: g.level.map.id, stages: seen.stages, spawns: seen.spawns.size, minutes: g.stepCount / 120 / 60, errors: window.stats.errors };
  });
  console.log(`東望洋跑道: waves 1-4 in ${r.minutes.toFixed(1)} min, ${r.spawns} spawn points used`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.stages, [4], 'the stage moves on after wave 4');
  assert.equal(r.map, 'ruins', 'to the next map (大三巴)');
  assert.ok(r.spawns >= 4, `enemies came in at ${r.spawns} of the spawn points`);
  assert.deepEqual(problems(logs), []);
});

test('screenshots: the hairpin from the default camera (45° side); the whole map from above', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    g.setRules('normal', []);
    g.setMode('arcade');
    g.startRun(window.guia());
    g.waves.state = 'done';
    g.enemies.clear();
    const p = g.player;
    p.x = -12;
    p.z = 2.5;
    for (const [x, z] of [
      [-18, 6],
      [-20, -3],
      [-15.5, -8],
    ]) {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
    }
    for (let i = 0; i < 40; i++) {
      p.hp = 100;
      g.aimPoint.set(-18, g.aimPoint.y, 6);
      g.aimFresh = true;
      g.updatePlay(1 / 60);
    }
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('guia-hairpin.png', OUT).pathname });
  await page.evaluate(() => {
    const g = window.game;
    document.getElementById('hud').style.visibility = 'hidden';
    g.level.cut.uFadeSet.value.fill(0);
    g.level.cut.uCutR.value = 0;
    const cam = g.camera;
    cam.position.set(0, 60, 0.01);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    g.renderer.render(g.scene, cam);
  });
  await page.screenshot({ path: new URL('guia-top.png', OUT).pathname });
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = '';
    window.game.camera.up.set(0, 1, 0);
  });
  assert.deepEqual(problems(logs), []);
});
