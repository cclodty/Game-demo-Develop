// Tools ⑤ (工具 ⑤): mahjong tiles. Beside one of Rua da Felicidade's
// mahjong tables, with nothing in the hands, G grabs a handful of tiles and
// throws it: six tiles fan out ENV.tiles.spread rad wide around the aim (two
// close either side of it, ENV.tiles.fan), each dazes the first man it meets for ENV.tiles.daze s (no
// damage); ENV.tiles.pong or more men dazed by one handful is PONG +150. A
// table has four handfuls, one wall of tiles each, back with a new run.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=31'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on Rua da Felicidade, the player at (x, z). */
    window.begin = (x, z) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(g.maps.findIndex((m) => m.id === 'felicidade'));
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** A thug keeping his post at (x, z). */
    window.thug = (x, z) => {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      return e;
    };
    /** Step 120 Hz frames, aiming at (ax, az): `keys` pressed on the first; the player kept alive and still. */
    window.play = (n, ax, az, keys = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.vx = p.vz = 0;
        p.hp = 100;
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        g.aimPoint.set(ax, g.aimPoint.y, az);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
    };
    /** The table at (-9, -1.2) on the north side of the road. */
    window.table = () => g.level.solids.find((s) => s.matKey === 'mahjong' && Math.abs((s.minX + s.maxX) / 2 + 9) < 0.1);
  });
});
after(async () => {
  await h.close();
});

test('the street has three mahjong tables; beside one with empty hands G throws a handful: six tiles fanned out around the aim; away from a table G throws nothing', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin(-9, 0.4); // just south of the table, on the road
    const tables = g.level.solids.filter((s) => s.matKey === 'mahjong').length;
    window.play(2, -9 + 8, 0.4); // settle the aim east
    const prompt0 = g.thrown.prompt;
    window.play(1, -9 + 8, 0.4, ['KeyG']);
    const tiles = g.thrown.tiles.map((t) => Math.atan2(t.vz, t.vx));
    const left = window.table().tiles;
    // away from every table: nothing
    window.begin(0, 0.4);
    window.play(2, 8, 0.4);
    window.play(1, 8, 0.4, ['KeyG']);
    return { tables, prompt0, tiles, left, away: g.thrown.tiles.length };
  });
  assert.equal(r.tables, 3);
  assert.match(r.prompt0, /麻雀牌/);
  assert.equal(r.tiles.length, 6, 'six tiles');
  const sorted = [...r.tiles].sort((a, b) => a - b);
  const width = sorted.at(-1) - sorted[0];
  assert.ok(width > 0.6 && width < 1.2, `a fan about 0.8 rad wide (${width.toFixed(2)})`);
  const mid = (sorted.at(-1) + sorted[0]) / 2;
  assert.ok(Math.abs(mid) < 0.05, `centred on the aim, east (${mid.toFixed(3)})`);
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] > 0.05, 'no two the same way');
  assert.equal(sorted.filter((a) => Math.abs(a) < 0.06).length, 2, 'two close either side of the aim');
  assert.equal(r.left, 3, 'one handful of the four gone');
  assert.equal(r.away, 0, 'no table near: no tiles');
  assert.deepEqual(problems(logs), []);
});

test('a tile dazes the man it meets for 0.4 s and does him no harm; he is himself again after', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin(-9, 0.4);
    const e = window.thug(-4, 0.4);
    const hp0 = e.hp;
    window.play(2, -4, 0.4);
    window.play(1, -4, 0.4, ['KeyG']);
    let t = 0;
    while (t < 1 && !(e.stunT > 0 && e.stunCause === 'tile')) {
      window.play(1, -4, 0.4);
      t += 1 / 120;
    }
    const dazed = e.stunCause === 'tile' ? Math.round(e.stunT * 100) / 100 : 0;
    let held = 0;
    while (e.stunT > 0 && held < 2) {
      window.play(1, -4, 0.4);
      held += 1 / 120;
    }
    return { dazed, held: Math.round(held * 100) / 100, hurt: hp0 - e.hp, alive: e.alive, log: g.notes.events.map((x) => x.text).filter((x) => x.includes('麻雀')) };
  });
  assert.ok(r.dazed > 0.35 && r.dazed <= 0.4, `dazed for 0.4 s (${r.dazed})`);
  assert.ok(r.held > 0.3 && r.held <= 0.42, `and then himself again (${r.held} s)`);
  assert.equal(r.hurt, 0, 'no damage');
  assert.equal(r.alive, true);
  assert.ok(r.log.length >= 1, `in the notes (${r.log})`);
});

test('three men dazed by one handful is PONG +150; two is not; four handfuls a table, back with a new run', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (ys) => {
      window.begin(-9, 0.4);
      for (const z of ys) window.thug(-3.5, z);
      const score0 = g.score.score;
      window.play(2, -3.5, 0.4);
      window.play(1, -3.5, 0.4, ['KeyG']);
      window.play(90, -3.5, 0.4);
      const events = g.notes.events.map((x) => x.text);
      return { pong: events.filter((x) => x.includes('PONG')).length, dazed: g.enemies.list.filter((e) => e.stunCause === 'tile' || e.stunT > 0).length, gained: g.score.score - score0 };
    };
    const three = run([-1.6, 0.4, 2.4]);
    const two = run([-1.6, 2.4]);
    // four handfuls, then the table is bare
    window.begin(-9, 0.4);
    const counts = [];
    for (let i = 0; i < 5; i++) {
      window.play(40, -1, 0.4);
      window.play(1, -1, 0.4, ['KeyG']);
      counts.push(g.thrown.tiles.length > 0 ? window.table().tiles : 'none');
      window.play(120, -1, 0.4);
    }
    const walls = window.table().tileWalls.filter((m) => m.visible).length;
    const bare = g.thrown.prompt;
    window.begin(-9, 0.4);
    return { three, two, counts, walls, bare, after: window.table().tiles, wallsAfter: window.table().tileWalls.filter((m) => m.visible).length };
  });
  assert.equal(r.three.pong, 1, 'three men: PONG');
  assert.ok(r.three.gained >= 150, `+150 (${r.three.gained})`);
  assert.equal(r.two.pong, 0, 'two men: no PONG');
  assert.deepEqual(r.counts, [3, 2, 1, 0, 'none'], 'four handfuls, then nothing');
  assert.equal(r.walls, 0, 'each handful takes one wall of tiles off the felt');
  assert.doesNotMatch(r.bare, /麻雀牌/, 'a bare table offers nothing');
  assert.equal(r.after, 4, 'a new run: four again');
  assert.equal(r.wallsAfter, 4);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: a handful in the air, fanning out at three thugs', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.begin(-9, 0.4);
    for (const z of [-1.6, 0.4, 2.4]) window.thug(-3.5, z);
    window.play(30, -3.5, 0.4);
    window.play(1, -3.5, 0.4, ['KeyG']);
    window.play(14, -3.5, 0.4);
    g.present(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('tiles.png', OUT).pathname });
});
