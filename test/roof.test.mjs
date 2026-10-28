// 彈幕 ② E⑥: the rooftop (rooms.js ROOF), the old roof remade as a fight room in the floors' draw. Its own things:
// washing hung out on bamboo poles across the middle (rooms.js `laundry`, level.js veils), so a gunner cannot see the
// player through a sheet and does not aim, though a shot goes through it (a kill through one: LAUNDRY DAY); and LPG
// cylinders on the player's side (level.js Barrel.rocket), kicked, jetting off at the gunners (ROCKET CAN). The room
// validates as the others do (test/maps.test.mjs, test/hell.test.mjs) and is drawn into floors (test/floor.test.mjs).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=56'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on the roof (the first floor's second room made the roof), the player at (x, z), nobody about. */
    window.toRoof = (x = -5, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'roof';
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
    /** A man of `type` standing at (x, z); `fires` false: he never fires. */
    window.post = (type, x, z, fires = false) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      if (!fires) e.fireCd = 999;
      return e;
    };
    /** 120 Hz steps holding `held` (and the trigger with `fire`), `press` on the first, aiming at `aim`; the player kept whole. */
    window.play = (n, { held = [], press = [], aim = null, fire = false } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
        g.input.pressed.clear();
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = fire;
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = false;
    };
    /** The tags of each kill from now on. */
    window.tags = () => {
      const seen = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        seen.push(t.map((x) => x.label));
        return kill0(t);
      };
      return seen;
    };
  });
});
after(async () => {
  await h.close();
});

test('the roof is in the floors’ draw; washing on three lines across the middle, a veil to sight at each sheet and none at the gaps; three LPG cylinders on the player’s side; the parapet low; rain; four lights; the budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoof();
    const L = g.level;
    const room = L.map;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return {
      pool: g.waves.rules.floor.pool,
      id: room.id,
      sheets: L.veils.length,
      across: L.veiled(-4.6, -5, -4.6, 0), // through the east sheet of the west line
      gap: L.veiled(-5.55, -5, -5.55, 0), // through the gap beside it
      shotsPass: L.hasLOS(-4.6, -5, -4.6, 0), // a sheet is no solid: shots (and the posts' test) go through
      lpg: L.barrels.filter((b) => b.variant === 'lpg').map((b) => [b.x, b.z]),
      edges: [room.edges.s, room.edges.w],
      rain: L.rain.lines.visible,
      exit: [L.exit.at.x, L.exit.at.z],
      lights: L.points.length,
      calls: info.calls,
      tris: info.triangles,
      budget: room.budget,
    };
  });
  await page.screenshot({ path: new URL('roof-quiet.png', OUT).pathname });
  assert.ok(r.pool.includes('roof'), `in the draw: ${r.pool}`);
  assert.equal(r.id, 'roof');
  assert.equal(r.sheets, 10, 'ten sheets on three lines');
  assert.equal(r.across, true, 'sight stops at a sheet');
  assert.equal(r.gap, false, 'and goes through a gap');
  assert.equal(r.shotsPass, true, 'a shot goes through a sheet');
  assert.equal(r.lpg.length, 3, `three LPG cylinders: ${JSON.stringify(r.lpg)}`);
  assert.ok(r.lpg.every(([, z]) => z > 0), 'on the player’s side');
  assert.deepEqual(r.edges, [[1, 'parapet', 'neonCyan'], [1, 'parapet', 'neonCyan']], 'the parapet along the south and west');
  assert.equal(r.rain, true, 'rain');
  assert.ok(r.exit[1] < -6, `the exit in the north wall: ${r.exit}`);
  assert.equal(r.lights, 4, 'four point lights');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('a gunner beyond a sheet cannot see the player behind it and fires nothing; stepped out past the line’s end, he sees him and aims', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoof(-4.6, 0);
    const p = g.player;
    const e = window.post('grunt', -4.6, -5, true); // north of the west line's east sheet, the player south of it
    const shots0 = g.bullets.list.filter((b) => b.owner !== 'player').length;
    let saw = false;
    let aimed = false;
    for (let i = 0; i < 240; i++) {
      window.play(1, { aim: [-4.6, -5] });
      p.x = -4.6;
      p.z = 0;
      saw ||= e.los;
      aimed ||= e.state === 'aim' || e.state === 'fire';
    }
    const hidden = { saw, aimed, shots: g.bullets.list.filter((b) => b.owner !== 'player').length - shots0 };
    // out past the line's end: nothing between them
    let seen = -1;
    for (let i = 0; i < 240 && seen < 0; i++) {
      window.play(1, { aim: [-4.6, -5] });
      p.x = -2.4;
      p.z = 0;
      if (e.los) seen = i;
    }
    let aimedOut = false;
    for (let i = 0; i < 480 && !aimedOut; i++) {
      window.play(1, { aim: [-4.6, -5] });
      p.x = -2.4;
      p.z = 0;
      aimedOut = e.state === 'aim' || e.state === 'fire' || g.bullets.list.some((b) => b.owner !== 'player');
    }
    return { hidden, seen, aimedOut };
  });
  assert.deepEqual(r.hidden, { saw: false, aimed: false, shots: 0 }, 'behind the sheet: unseen, no aim, no shot');
  assert.ok(r.seen >= 0 && r.seen < 30, `in sight past the line’s end (${r.seen} steps)`);
  assert.equal(r.aimedOut, true, 'and he aims');
  assert.deepEqual(problems(logs), []);
});

test('a shot through a sheet kills the gunner beyond it, who could not see the player: LAUNDRY DAY', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoof(-4.6, 0);
    const p = g.player;
    const e = window.post('grunt', -4.6, -5);
    const tags = window.tags();
    window.play(2, { aim: [-4.6, -5] }); // turned to him
    let n = 0;
    while (e.alive && n++ < 600) {
      window.play(1, { aim: [-4.6, -5], fire: true });
      p.x = -4.6;
      p.z = 0;
    }
    return { alive: e.alive, veiled: g.level.veiled(-4.6, 0, -4.6, -5), tags, s: n / 120 };
  });
  assert.equal(r.veiled, true, 'a sheet between them');
  assert.equal(r.alive, false, `shot through it (${r.s.toFixed(2)} s)`);
  assert.ok(r.tags.length === 1 && r.tags[0].includes('LAUNDRY DAY'), `the kill tags: ${JSON.stringify(r.tags)}`);
  assert.deepEqual(problems(logs), []);
});

test('an LPG cylinder kicked north jets off across the roof and bursts on the gunner at the post in its way: ROCKET CAN', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoof();
    const L = g.level;
    const lpg = L.barrels.find((b) => b.variant === 'lpg' && Math.abs(b.x - 0.5) < 0.01); // the middle one
    const post = L.posts.find((q) => Math.abs(q.x - lpg.x) < 0.01); // the post north of it
    const p = g.player;
    p.x = lpg.x;
    p.z = lpg.z + 1.1;
    const e = window.post('grunt', post.x, post.z);
    const tags = window.tags();
    window.play(2, { aim: [lpg.x, lpg.z - 5] }); // turned to it
    window.play(1, { press: ['KeyF'], aim: [lpg.x, lpg.z - 5] });
    const lit = lpg.rocketT > 0;
    for (let i = 0; i < 360 && lpg.alive; i++) window.play(1, { aim: [lpg.x, lpg.z - 5] });
    return { lit, burst: !lpg.alive, dead: !e.alive, tags };
  });
  assert.equal(r.lit, true, 'the kick lit the jet');
  assert.equal(r.burst, true, 'it burst');
  assert.equal(r.dead, true, 'on the gunner');
  assert.ok(r.tags.some((t) => t.includes('ROCKET CAN')), `the kill tags: ${JSON.stringify(r.tags)}`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the player behind the washing shooting through a sheet at the gunners beyond, an LPG cylinder jetting off', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoof(-4.6, 0.2);
    const L = g.level;
    const p = g.player;
    window.post('grunt', -4.6, -5);
    window.post('rifle', 4.5, -6);
    window.post('grunt', 0.5, -5.6);
    window.post('grunt', 8.6, -5.4);
    const lpg = L.barrels.find((b) => b.variant === 'lpg' && Math.abs(b.x - 5.5) < 0.01);
    lpg.rocket(-0.1, -1);
    window.play(2, { aim: [-4.6, -5] });
    for (let i = 0; i < 20; i++) {
      window.play(1, { aim: [-4.6, -5], fire: true });
      p.x = -4.6;
      p.z = 0.2;
    }
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { shots: g.bullets.list.filter((b) => b.owner === 'player').length, jet: lpg.rocketT > 0 };
  });
  await page.screenshot({ path: new URL('roof.png', OUT).pathname });
  assert.ok(r.shots > 0, 'shots in the air');
  assert.equal(r.jet, true, 'the cylinder jetting off');
  assert.deepEqual(problems(logs), []);
});
