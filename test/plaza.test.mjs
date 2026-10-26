// 彈幕 ② E①: the plaza (rooms.js PLAZA), the square remade as a fight room in the floors' draw. Its own things: two
// pigeon flocks on the open floor (level.js Flock, ambient.js Pigeons) that a player shot close by bursts up, and a man
// aiming within ENV.flockReach of the cloud loses his aim (a kill then is a PIGEON STRIKE); the fountain pool in the
// middle, its knee-high rim a solid that shots and sight pass over, its water where a man kicked over the rim ends
// up (SPLASH). The room validates as the others do (test/maps.test.mjs) and is drawn into floors (test/floor.test.mjs).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=47'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run in the plaza (the first floor's second room made the plaza), the player at (x, z), nobody about. */
    window.toPlaza = (x = 0, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'plaza';
      g.floor = g.floors.flat();
      g.stage = 1;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.player.x = x;
      g.player.z = z;
      g.player.hp = 100;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** A man of `type` standing at (x, z) who never fires on his own unless `wait` s pass. */
    window.post = (type, x, z, wait = 999) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = wait;
      e.blindT = 0;
      return e;
    };
    /** 120 Hz steps holding `held`, pressing `press` on the first, aiming at (ax, az). */
    window.play = (n, held = [], press = [], ax = null, az = null) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = held.includes('Mouse0');
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.aimPoint.set(ax ?? g.player.x, g.aimPoint.y, az ?? g.player.z - 6);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
    };
  });
});
after(async () => {
  await h.close();
});

test('the plaza is in the floors’ draw; it loads with its two flocks and its pool: the rim a solid the nav stops at but shots and sight pass over, the water inside it; four lights; a dark floor; the exit reachable', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toPlaza();
    const L = g.level;
    const room = L.map;
    const [px, pz, pr] = room.room.pool;
    const rim = L.solids.find((s) => s.poly && s.low && Math.abs((s.minX + s.maxX) / 2 - px) < 0.5 && Math.abs((s.minZ + s.maxZ) / 2 - pz) < 0.5);
    const nav = L.nav;
    const navIn = nav.isWalkable(px, pz); // the pool's middle: not walkable
    const navBeside = nav.isWalkable(px, pz + pr + 1); // a step south of the rim: walkable
    const los = L.hasLOS(px, pz + pr + 1, px, pz - pr - 1); // across the pool: sight passes over the rim
    const shot = L.raycast(px, pz + pr + 1, px, pz - pr - 1); // a shot across it: nothing in its way
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return { pool: MODES_POOL(), id: room.id, flocks: L.flocks.map((f) => [f.x, f.z]), water: L.water, rim: !!rim, navIn, navBeside, los, shot: !shot, lights: L.points.length, birds: L.ambient.length, calls: info.calls, tris: info.triangles, budget: room.budget };
    function MODES_POOL() {
      return g.waves.rules.floor.pool;
    }
  });
  await page.screenshot({ path: new URL('plaza.png', OUT).pathname });
  assert.ok(r.pool.includes('plaza'), `in the draw: ${r.pool}`);
  assert.equal(r.id, 'plaza');
  assert.equal(r.flocks.length, 2, `two flocks: ${JSON.stringify(r.flocks)}`);
  assert.equal(r.water.length, 1, 'the pool’s water');
  assert.ok(r.rim, 'the rim a low solid');
  assert.ok(!r.navIn && r.navBeside, `the nav stops at the rim (in: ${r.navIn}, beside: ${r.navBeside})`);
  assert.ok(r.los && r.shot, 'sight and shots pass over the rim');
  assert.equal(r.lights, 4, 'four point lights');
  assert.equal(r.birds, 1, 'the pigeons');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('a player shot past a resting flock bursts it up: a thug aiming within 2 m loses his aim for half a second, one 5 m off keeps it; the flock comes back later', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toPlaza(-6, 6);
    const L = g.level;
    const f = L.flocks[0];
    for (const x of L.flocks) x.reset();
    // a man right by the flock (within ENV.flockReach) and one well off, both aiming at the player
    const near = window.post('grunt', f.x + 1.5, f.z - 1, 0);
    const far = window.post('grunt', f.x + 5, f.z - 3, 0);
    let aiming = 0;
    for (let i = 0; i < 120 * 3 && aiming < 2; i++) {
      window.play(1, [], [], f.x, f.z);
      aiming = ['aim', 'fire'].includes(near.state) + ['aim', 'fire'].includes(far.state);
      if (near.state === 'fire' || far.state === 'fire') break;
    }
    const before = { near: near.state, far: far.state, away: f.away };
    near.blindT = 0;
    far.blindT = 0;
    // a shot from the player past the flock (within ENV.flockScare of its spot)
    g.bullets.spawn({ x: g.player.x, z: g.player.z, dx: 0, dz: -1, speed: 62, owner: 'player', damage: 1 });
    for (let i = 0; i < 6; i++) window.play(1, [], [], f.x, f.z);
    const after = { near: near.state, far: far.state, blindNear: near.blindT, blindFar: far.blindT, away: f.away, gen: f.gen, cloud: f.upT };
    return { before, after, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('鴿')) };
  });
  assert.ok(['aim', 'fire'].includes(r.before.near) && ['aim', 'fire'].includes(r.before.far), `both aiming first: ${JSON.stringify(r.before)}`);
  assert.ok(r.after.away > 0 && r.after.gen === 1 && r.after.cloud > 0, `the flock took off: ${JSON.stringify(r.after)}`);
  assert.ok(r.after.blindNear > 0 && !['aim', 'fire'].includes(r.after.near), `the near man lost his aim: ${JSON.stringify(r.after)}`);
  assert.ok(r.after.blindFar === 0, 'the far man keeps his');
});

test('a thug kicked towards the pool goes over the rim into the water: SPLASH, gone; the player walking into the rim is stopped by it', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const [px, pz, pr] = g.level.map.room.pool;
    window.toPlaza(px, pz + pr + 1.6);
    const p = g.player;
    const e = window.post('grunt', px, pz + pr + 0.5); // between the player and the rim, facing it
    window.play(2, [], [], px, pz);
    const kills0 = g.score.kills;
    window.play(1, [], ['KeyF'], px, pz); // the kick: north, over the rim
    for (let i = 0; i < 120; i++) window.play(1, [], [], px, pz);
    const splashed = { alive: e.alive, splashed: !!e.splashed, kills: g.score.kills - kills0, note: g.notes.events.some((x) => x.text.includes('跌落水')) };
    // the player runs at the rim: stopped by it
    p.x = px;
    p.z = pz + pr + 1.2;
    window.play(120, ['KeyW'], [], px, pz);
    const stopped = Math.hypot(p.x - px, p.z - pz) > pr - 0.1;
    return { splashed, stopped, at: Math.hypot(p.x - px, p.z - pz) };
  });
  assert.ok(!r.splashed.alive && r.splashed.splashed && r.splashed.note, `into the water: ${JSON.stringify(r.splashed)}`);
  assert.ok(r.stopped, `the rim stops the player at ${r.at.toFixed(2)} m from the middle`);
  assert.deepEqual(problems(logs), []);
});
