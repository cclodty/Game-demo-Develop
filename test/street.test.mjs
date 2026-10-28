// 彈幕 ② E④: the shop street (rooms.js STREET), a row of three shophouses and the street before them, remade as a fight
// room in the floors' draw. Its own things, both 福隆新街's (fixtures.js): the end shops' wooden doors, kicked open
// onto whoever stands behind them (SLAM), and the middle shop's roller shutter, dropped by a shot on its lock post onto
// whoever is under it (SHUTTER) and shutting the shop till the wave is down; with a door in each wall between the
// shops the row is a way through the houses. The room validates as the others do (test/maps.test.mjs,
// test/hell.test.mjs) and is drawn into floors (test/floor.test.mjs). Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=54'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on the street (the first floor's second room made the street), the player at (x, z), nobody about. */
    window.toStreet = (x = 0, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'shopstreet';
      g.floor = g.floors.flat();
      g.stage = 1;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.setFocus(false);
      g.player.placeAtStart();
      g.player.x = x;
      g.player.z = z;
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** The room's doors and its shutter: the end shops' fronts (west, east), the walls between the shops (west, east), the middle shop's shutter. */
    window.parts = () => {
      const f = g.level.fixtures;
      const doors = f.filter((x) => x.kind === 'door');
      const fronts = doors.filter((d) => d.facing === 0).sort((a, b) => a.x - b.x);
      const inner = doors.filter((d) => d.facing === 90).sort((a, b) => a.x - b.x);
      return { fronts, inner, shutter: f.find((x) => x.kind === 'shutter') };
    };
    /** 120 Hz steps, `press` on the first, `held` throughout, aiming at (ax, az); the player kept whole unless `hurt`. */
    window.play = (n, { held = [], press = [], aim = null, hurt = false } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        if (!hurt) {
          g.player.hp = 100;
          g.player.invuln = 0;
        }
        g.input.pressed.clear();
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.keys.clear();
      g.input.pressed.clear();
    };
    window.shoot = (x, z, tx, tz) => {
      const d = Math.hypot(tx - x, tz - z) || 1;
      return g.bullets.spawn({ x, z, dx: (tx - x) / d, dz: (tz - z) / d, speed: 62, owner: 'player', damage: 1 });
    };
    window.post = (type, x, z, state = 'move') => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = state;
      e.fireCd = 999;
      return e;
    };
    window.tags = () => {
      const tags = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        tags.push(t.map((x) => x.label));
        return kill0(t);
      };
      return tags;
    };
  });
});
after(async () => {
  await h.close();
});

test('the street is in the floors’ draw; three shops along the north, the end ones shut by doors, the middle one under a shutter with the exit in its back wall, a door between each two; a shut door stops sight and bodies but not paths; the camera cuts through; four lights; the budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toStreet();
    const L = g.level;
    const room = L.map;
    const { fronts, inner, shutter } = window.parts();
    const [west] = fronts;
    const shops = room.room.shops.list;
    const mid = shops[1].x;
    const inShop = (x, z) => z < room.room.shops.depth - 7.5;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return {
      pool: g.waves.rules.floor.pool,
      id: room.id,
      fronts: fronts.map((d) => [d.x, d.z]),
      inner: inner.map((d) => [d.x, d.z]),
      shutter: shutter ? [shutter.x, shutter.z, shutter.w] : null,
      exit: { x: L.exit.at.x, inMiddle: L.exit.at.x > mid[0] && L.exit.at.x < mid[1], inShop: inShop(L.exit.at.x, L.exit.at.z) },
      // through the west shop's shut door, from the street to its room: no sight, a path
      shut: { los: L.hasLOS(west.x, west.z + 1.5, west.x, west.z - 1.5), path: !!L.nav.findPath(west.x, west.z + 1.5, west.x, west.z - 1.5) },
      // from the street through the middle shop and the door between into the east shop
      through: !!L.nav.findPath(0, 1, 7.4, -5.2),
      toExit: !!L.nav.findPath(L.start.x, L.start.z, L.exit.at.x, L.exit.at.z),
      cutaway: !!room.cutaway,
      lights: L.points.length,
      calls: info.calls,
      tris: info.triangles,
      budget: room.budget,
    };
  });
  await page.screenshot({ path: new URL('street-quiet.png', OUT).pathname });
  assert.ok(r.pool.includes('shopstreet'), `in the draw: ${r.pool}`);
  assert.equal(r.id, 'shopstreet');
  assert.equal(r.fronts.length, 2, `two shop doors: ${JSON.stringify(r.fronts)}`);
  assert.equal(r.inner.length, 2, `two doors between the shops: ${JSON.stringify(r.inner)}`);
  assert.ok(r.shutter && r.shutter[2] > 3, `a shutter over the middle shop: ${r.shutter}`);
  assert.ok(r.exit.inMiddle && r.exit.inShop, `the exit in the middle shop: ${JSON.stringify(r.exit)}`);
  assert.deepEqual(r.shut, { los: false, path: true }, 'a shut door: no sight through it, a path through it');
  assert.ok(r.through && r.toExit, 'the way through the houses, and to the exit');
  assert.ok(r.cutaway, 'the camera cuts through the shops');
  assert.equal(r.lights, 4, 'four point lights');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('kicked from the street, the west shop’s door swings in onto the man behind it: SLAM; the player goes in and kicks the door between onto the middle shop', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toStreet();
    const { fronts, inner } = window.parts(); // this load's
    const door = fronts[0];
    [g.player.x, g.player.z] = [door.x, door.z + 1.1];
    const behind = window.post('rusher', door.x, door.z - 1.3);
    behind.update = () => {};
    const tags = window.tags();
    window.play(2, { aim: [door.x, door.z - 5] }); // turned to it
    window.play(1, { press: ['KeyF'], aim: [door.x, door.z - 5] });
    window.play(10, { aim: [door.x, door.z - 5] });
    const slam = { open: door.open, dead: behind.dead, tags: tags.flat() };
    // in through it, to the door between the west and the middle shop, and a kick east (the kick's cooldown run out)
    const mid = inner[0];
    const p = g.player;
    p.x = mid.x - 1.1;
    p.z = mid.z;
    window.play(80, { aim: [mid.x + 5, mid.z] });
    window.play(1, { press: ['KeyF'], aim: [mid.x + 5, mid.z] });
    window.play(10, { aim: [mid.x + 5, mid.z] });
    const innerOpen = mid.open;
    for (let i = 0; i < 120 && p.x < mid.x + 1; i++) window.play(1, { held: ['KeyD'], aim: [mid.x + 5, mid.z] });
    return { slam, innerOpen, through: p.x > mid.x + 1, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('門')) };
  });
  assert.equal(r.slam.open, true, 'F opens the shop door');
  assert.equal(r.slam.dead, true, 'the man behind it is down');
  assert.ok(r.slam.tags.includes('SLAM'), `SLAM: ${r.slam.tags}`);
  assert.equal(r.innerOpen, true, 'the door between the shops kicks open too');
  assert.equal(r.through, true, 'and the player walks through into the middle shop');
  assert.ok(r.notes.some((t) => t.includes('踢開門')), r.notes.join(' / '));
  assert.deepEqual(problems(logs), []);
});

test('a shot on the shutter’s lock drops it on the man under it: SHUTTER; the middle shop is shut to sight and bodies, and a man in it comes out by the door between and the end shop’s; the wave clear rolls it up', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.toStreet(-3, 3);
    const { shutter: sh } = window.parts();
    const p = g.player;
    const across = () => ({ ray: !!L.raycast(sh.midX, sh.midZ + 2, sh.midX, sh.midZ - 2), walkable: L.nav.isWalkable(sh.midX, sh.midZ) });
    const up = across();
    const under = window.post('grunt', sh.midX, sh.midZ);
    under.update = () => {};
    const tags = window.tags();
    window.shoot(p.x, p.z, sh.x, sh.z);
    window.play(90, { aim: [sh.x, sh.z] });
    const down = { down: sh.down, dead: under.dead, ...across(), tags: tags.flat() };
    // a blade shut in the middle shop goes for the player on the street: out by a door between and an end shop's door
    p.x = 0;
    p.z = 4;
    const blade = window.post('rusher', 0, -5.5, 'chase');
    let out = false;
    for (let i = 0; i < 120 * 12 && !out; i++) {
      window.play(1, { aim: [blade.x, blade.z] });
      out = blade.z > -2;
    }
    const way = { out, x: blade.x };
    // the wave is down: the shutter rolls up
    g.level.waveEnd();
    const after = { down: sh.down, ...across() };
    return { up, down, way, after };
  });
  assert.deepEqual(r.up, { ray: false, walkable: true }, 'rolled up: open to sight and paths');
  assert.deepEqual({ down: r.down.down, dead: r.down.dead, ray: r.down.ray, walkable: r.down.walkable }, { down: true, dead: true, ray: true, walkable: false }, 'down: the man under it is dead, the opening shut');
  assert.ok(r.down.tags.includes('SHUTTER'), `SHUTTER: ${r.down.tags}`);
  assert.ok(r.way.out && Math.abs(r.way.x) > 3.75, `the blade came out onto the street by an end shop (x ${r.way.x.toFixed(1)})`);
  assert.deepEqual(r.after, { down: false, ray: false, walkable: true }, 'the wave down, it rolls up');
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the shutter dropping on the middle shop, the west door kicked open onto the man behind it, gunners on the street', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toStreet();
    const { fronts, shutter: sh } = window.parts(); // this load's
    const door = fronts[0];
    [g.player.x, g.player.z] = [door.x + 0.3, door.z + 1.1];
    window.post('grunt', 2.4, -1.6);
    window.post('rifle', 9.5, -1.4);
    window.post('grunt', sh.midX, sh.midZ).update = () => {};
    const behind = window.post('rusher', door.x, door.z - 1.3);
    behind.update = () => {};
    window.play(2, { aim: [door.x, door.z - 5] }); // turned to the door
    window.shoot(sh.x + 0.5, sh.z + 4, sh.x, sh.z);
    window.play(4, { aim: [door.x, door.z - 5] });
    window.play(1, { press: ['KeyF'], aim: [door.x, door.z - 5] });
    for (let i = 0; i < 120 && !sh.down; i++) window.play(1, { aim: [door.x, door.z - 5] });
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { falling: sh.fallT >= 0 || sh.down, open: door.open };
  });
  await page.screenshot({ path: new URL('street.png', OUT).pathname });
  assert.ok(r.falling && r.open, `the shutter coming down, the door open: ${JSON.stringify(r)}`);
  assert.deepEqual(problems(logs), []);
});
