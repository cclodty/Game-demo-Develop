// The drone (無人機), from wave 8: a block quadcopter 2.5 m up that flies over
// any cover, circles the player and fires a burst of four every 2 s, seeing and
// shooting over anything lower than itself. Three hits bring it down; it falls
// and bursts with a small blast (1.5 m) that catches whoever is under it.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=51'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on `map` with the player at (x, z). */
    window.run = (map, x, z) => {
      g.setRules('normal', []);
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.player.x = x;
      g.player.z = z;
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.setFocus(false);
    };
    window.drone = (x, z) => {
      const e = g.enemies.spawn('drone', { x, z, ex: x, ez: z + 0.1 });
      e.spawnLock = 0;
      e.state = 'move';
      return e;
    };
    /** One logic step, the player held still and unhurt unless `hurt`. */
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /** A solid box of cover at least `size` m across and lower than the drone, with open floor around it. */
    window.lowCover = (size) =>
      g.level.solids.find((s) => !s.poly && s.kind !== 'glass' && s.h < 2.4 && s.maxX - s.minX >= size && s.maxZ - s.minZ >= size && g.level.nav.isWalkable(s.maxX + 2, (s.minZ + s.maxZ) / 2));
  });
});
after(async () => {
  await h.close();
});

test('it flies 2.5 m up, its shadow and ring on the floor below, outlined like any character, and its path crosses cover', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    let found = null;
    for (let map = 0; map < g.maps.length && !found; map++) {
      window.run(map, 0, 0);
      const s = window.lowCover(1.2);
      if (s) found = { map, s };
    }
    const { s } = found;
    // the player beside a block of cover, the drone circling 7 m out: its circle runs over the block
    const cx = (s.minX + s.maxX) / 2;
    const cz = (s.minZ + s.maxZ) / 2;
    window.run(found.map, cx + 7, cz);
    const e = window.drone(cx + 7, cz - 7);
    e.fireCd = 99; // just flying
    let over = 0;
    let lowest = Infinity;
    let highest = 0;
    for (let i = 0; i < 120 * 30 && !over; i++) {
      window.step();
      lowest = Math.min(lowest, e.y);
      highest = Math.max(highest, e.y);
      if (e.x > s.minX && e.x < s.maxX && e.z > s.minZ && e.z < s.maxZ) over++;
    }
    g.render();
    const r = e.rig;
    r.root.updateMatrixWorld(true);
    const wp = (o) => o.getWorldPosition(new o.position.constructor());
    const root = wp(r.root);
    const shadow = wp(r.shadow);
    let hulls = 0;
    let meshes = 0;
    r.inner.traverse((o) => {
      if (o.userData.hull) hulls++;
      else if (o.isMesh) meshes++;
    });
    return {
      map: g.level.map.id,
      over,
      height: [lowest, highest],
      root: [root.x - e.x, root.y - g.level.groundY(e.x, e.z), root.z - e.z],
      shadow: [shadow.x - e.x, shadow.y, shadow.z - e.z],
      ringY: wp(r.ring).y,
      hulls,
      meshes,
      solidH: s.h,
    };
  });
  assert.ok(r.over > 0, `on ${r.map} its circle took it over a block of cover ${r.solidH} m high`);
  assert.deepEqual(r.height, [2.5, 2.5], 'always 2.5 m up');
  assert.ok(Math.abs(r.root[0]) < 1e-6 && Math.abs(r.root[1] - 2.5) < 1e-6 && Math.abs(r.root[2]) < 1e-6, `drawn where it is (${r.root})`);
  assert.ok(Math.abs(r.shadow[0]) < 1e-6 && Math.abs(r.shadow[2]) < 1e-6 && r.shadow[1] < 0.1, `its shadow right below it on the floor (${r.shadow})`);
  assert.ok(r.ringY < 0.1, 'and its ring');
  assert.equal(r.meshes, 3, 'three meshes');
  assert.equal(r.hulls, 3, 'each with the style’s outline');
});

test('a burst of four every 2 s at an aim of ×1 (sooner as the difficulty aims faster), over low cover', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    let found = null;
    for (let map = 0; map < g.maps.length && !found; map++) {
      window.run(map, 0, 0);
      const s = window.lowCover(1);
      if (s) found = { map, s };
    }
    const { s } = found;
    const cz = (s.minZ + s.maxZ) / 2;
    // the player crouched right behind the cover, the drone hovering on the far side
    window.run(found.map, s.maxX + 0.6, cz);
    const e = window.drone(s.minX - 4, cz);
    e.orbitDir = 0; // held on its side of the cover (circling would take it round to the open side)
    const shots = [];
    let t = 0;
    let lowLOS = null;
    for (let i = 0; i < 120 * 7; i++) {
      const before = new Set(g.bullets.list.filter((b) => b.alive && b.source === e));
      window.step();
      t += 1 / 120;
      for (const b of g.bullets.list) if (b.alive && b.source === e && !before.has(b)) shots.push(Math.round(t * 120));
      if (lowLOS === null) lowLOS = g.level.hasLOS(e.x, e.z, g.player.x, g.player.z);
    }
    return { shots, lowLOS, hp: g.player.hp, map: g.level.map.id, aim: e.aimTime, cd: e.cfg.cooldown };
  });
  assert.equal(r.lowLOS, false, `on ${r.map}, from the ground the cover is in the way`);
  // group the shots into bursts: a gap of more than 0.2 s starts a new one
  const bursts = [];
  for (const s of r.shots) {
    if (!bursts.length || s - bursts.at(-1).at(-1) > 24) bursts.push([s]);
    else bursts.at(-1).push(s);
  }
  assert.ok(bursts.length >= 3, `${bursts.length} bursts in 7 s`);
  for (const b of bursts.slice(0, -1)) {
    assert.equal(b.length, 4, `four shots a burst (${b})`);
    for (let i = 1; i < b.length; i++) assert.ok(Math.abs(b[i] - b[i - 1] - 0.09 * 120) <= 1, `0.09 s apart (${b})`);
  }
  // its aim (0.45 s × the difficulty's, rules.js: 正常 ×0.85), the four shots 0.09 s apart and its cooldown: 2 s at ×1;
  // each of the three timers ends on the step it runs out in, up to a step late
  assert.equal(r.cd[0], r.cd[1], 'a fixed cooldown');
  const want = r.aim + 4 * 0.09 + r.cd[0];
  assert.ok(Math.abs(0.45 + 4 * 0.09 + r.cd[0] - 2) < 1e-9, 'at an aim of ×1: 2 s');
  for (let i = 1; i < bursts.length; i++) {
    const gap = (bursts[i][0] - bursts[i - 1][0]) / 120;
    assert.ok(gap >= want - 1e-9 && gap <= want + 3 / 120 + 1e-9, `a burst every ${want.toFixed(3)} s (${gap})`);
  }
});

test('shot down, it falls and bursts: the thug under it dies, the player 8 m off is fine', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.run(1, 0, 3);
    const e = window.drone(0, -5);
    e.fireCd = 99;
    window.step();
    e.vx = e.vz = 0;
    const thug = g.enemies.spawn('grunt', { x: 0.6, z: -5, ex: 0.6, ez: -4.9, stay: true });
    thug.spawnLock = 0;
    thug.fireCd = 99;
    // a player bullet for each point of its health (config.js ENEMY_HP) straight up at it (a drone is hit where it is over the floor)
    for (let i = 0; i < Math.ceil(e.hp); i++) g.bullets.spawn({ x: 0, z: 2.6 - i * 0.4, dx: 0, dz: -1, speed: 62, owner: 'player', damage: 1 });
    let n = 0;
    while (e.alive && n++ < 120) window.step();
    const shotDown = !e.alive;
    const ys = [];
    n = 0;
    while (!e.crashed && n++ < 240) {
      window.step();
      ys.push(e.y);
    }
    window.step();
    return {
      shotDown,
      fell: ys.length > 3 && ys.every((y, i) => i === 0 || y <= ys[i - 1]),
      crashed: !!e.crashed,
      hidden: !e.rig.root.visible,
      thug: thug.dead,
      hp: g.player.hp,
      log: g.notes.events.map((x) => x.text).filter((t) => t.includes('無人機墜毀') || t.startsWith('擊殺 THUG')),
    };
  });
  assert.equal(r.shotDown, true, 'a hit for each point of its health');
  assert.equal(r.fell, true, 'it drops');
  assert.equal(r.crashed, true);
  assert.equal(r.hidden, true, 'nothing left of it');
  assert.equal(r.thug, true, 'the blast got the thug under it');
  assert.equal(r.hp, 100, 'the player 8 m off is untouched');
  assert.ok(r.log.some((t) => t === '無人機墜毀'));
  assert.ok(r.log.some((t) => /BOOM/.test(t)), r.log.join(' | '));
});

test('from wave 8, two at most a wave; two drones keep every map in its render budget', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { Rng } = await import('/src/rng.js');
    g.setMode('arcade');
    const per = {};
    let max = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (let n = 1; n <= 12; n++) {
        const k = g.waves.compose(n, new Rng(seed * 100 + n)).filter((t) => t === 'drone').length;
        per[n] = (per[n] || 0) + k;
        max = Math.max(max, k);
      }
    }
    const frames = [];
    for (let map = 0; map < g.maps.length; map++) {
      window.run(map, 0, 0);
      g.player.placeAtStart();
      for (const dx of [-3, 3]) window.drone(g.player.x + dx, g.player.z - 4).fireCd = 99;
      window.step();
      g.updateCamera(1, true);
      g.render();
      const info = g.renderer.info.render;
      frames.push({ map: g.level.map.id, calls: info.calls, tris: info.triangles, budget: g.level.map.budget });
    }
    window.run(1, 0, 3);
    window.drone(-2.5, -1).fireCd = 99;
    window.drone(2.5, -2).fireCd = 99;
    for (let i = 0; i < 30; i++) window.step();
    g.hud.update(1 / 60);
    g.render();
    return { per, max, frames };
  });
  await page.screenshot({ path: new URL('drone.png', OUT).pathname });
  for (let n = 1; n <= 7; n++) assert.equal(r.per[n], 0, `none in wave ${n}`);
  for (let n = 8; n <= 12; n++) assert.ok(r.per[n] > 0, `some in wave ${n}`);
  assert.equal(r.max, 2);
  for (const f of r.frames) assert.ok(f.calls <= f.budget.calls && f.tris <= f.budget.tris, `${f.map}: ${f.calls} draw calls, ${f.tris} triangles, budget ${f.budget.calls} / ${f.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});
