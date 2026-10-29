// 試玩回饋 ⑥b: the maze (rooms.js MAZE), a fight room in the floors' draw cut into 6 × 4 cells, the walls between them
// drawn afresh every run from the run's seed (rooms.js mazeWalls, level.js load): the same seed walks the same maze,
// any cell can be walked to from the entry without breaking a wall, and the exit too. Its walls are concrete, which
// nothing breaks, or boards: ENV.crateHits of the player's rounds, one kick or a blast bring one down (level.js
// BREAKABLE, breakSolid, kickBoards), and it stays down for the run. No posts: the men fight as in the arcade. The room
// validates as the others do (test/maps.test.mjs) and is drawn into floors (test/floor.test.mjs). Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=66'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run with the maze the first floor's second room (with `seed` the run's seed), the player at its start, nobody about. */
    window.toMaze = (seed = null) => {
      const seed0 = g.fixedSeed;
      if (seed !== null) g.fixedSeed = seed;
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.fixedSeed = seed0;
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'maze';
      g.floor = g.floors.flat();
      g.stage = 1;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.setFocus(false);
      g.player.placeAtStart();
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** 120 Hz steps holding `held`, `press` on the first, aiming at (ax, az); the player kept whole. */
    window.play = (n, { held = [], press = [], aim = null } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
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
    window.shoot = (x, z, dx, dz, owner = 'player') => g.bullets.spawn({ x, z, dx, dz, speed: 62, owner, damage: 1 });
    /** A wall's two sides, 1.5 m off its middle: [[x, z] one side, [x, z] the other, [dx, dz] the way from the first to the second]. */
    window.sides = (s) => (s.maxX - s.minX > s.maxZ - s.minZ ? [[s.x, s.maxZ + 1.5], [s.x, s.minZ - 1.5], [0, -1]] : [[s.minX - 1.5, s.z], [s.maxX + 1.5, s.z], [1, 0]]);
    /** The maze's boards, and its concrete walls (not the posts), standing. */
    window.walls = () => {
      const L = g.level;
      return { boards: L.boards.filter((s) => s.alive), concrete: L.solids.filter((s) => s.alive && s.matKey === 'mazeWall' && s.maxX - s.minX !== s.maxZ - s.minZ) };
    };
  });
});
after(async () => {
  await h.close();
});

test('the maze is in the floors’ draw, 6 × 4 cells, no posts; the same seed draws the same walls, other seeds others; every cell and the exit walk from the entry without breaking a wall; boards and concrete both; four lights; the budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      window.toMaze(seed);
      const L = g.level;
      const { cells, edges, solids } = L.maze;
      const st = L.start;
      const unreached = [];
      for (let c = 0; c < cells.cols; c++) {
        for (let k = 0; k < cells.rows; k++) {
          const x = cells.x0 + (c + 0.5) * cells.w;
          const z = cells.z0 + (k + 0.5) * cells.d;
          if (!L.nav.findPath(st.x, st.z, x, z)) unreached.push(`${c},${k}`);
        }
      }
      out.push({
        seed,
        key: JSON.stringify(solids),
        cells: [cells.cols, cells.rows],
        edges: edges.length,
        open: edges.filter((e) => e.open).length,
        boards: L.boards.length,
        concrete: window.walls().concrete.length,
        unreached,
        exit: !!L.nav.findPath(st.x, st.z, L.exit.at.x, L.exit.at.z),
        posts: L.posts.length,
      });
    }
    const again = (window.toMaze(3), JSON.stringify(g.level.maze.solids));
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return { out, again, pool: g.waves.rules.floor.pool, lights: g.level.points.length, calls: info.calls, tris: info.triangles, budget: g.level.map.budget, extra: g.level.map.room.maze.extra };
  });
  await page.screenshot({ path: new URL('maze-quiet.png', OUT).pathname });
  assert.ok(r.pool.includes('maze'), `in the draw: ${r.pool}`);
  for (const o of r.out) {
    const at = `seed ${o.seed}`;
    assert.deepEqual(o.cells, [6, 4], `${at}: 6 × 4 cells`);
    assert.equal(o.open, 6 * 4 - 1 + r.extra, `${at}: a way through every cell (23 openings) and ${r.extra} more`);
    assert.equal(o.boards + o.concrete, o.edges - o.open, `${at}: every other edge a wall`);
    assert.ok(o.boards > 0 && o.concrete > 0, `${at}: ${o.boards} boards, ${o.concrete} concrete walls`);
    assert.deepEqual(o.unreached, [], `${at}: every cell walks from the entry`);
    assert.equal(o.exit, true, `${at}: the exit walks from the entry`);
    assert.equal(o.posts, 0, `${at}: no posts to fire from`);
  }
  assert.equal(r.again, r.out[2].key, 'the same seed, the same maze');
  assert.ok(new Set(r.out.map((o) => o.key)).size >= 7, `other seeds, other mazes (${new Set(r.out.map((o) => o.key)).size} of 8)`);
  assert.equal(r.lights, 4, 'four point lights');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  console.log(`# the maze: ${r.out.map((o) => `${o.boards}+${o.concrete}`).join(', ')} boards + concrete walls (seeds 1–8); ${r.calls} draw calls, ${r.tris} triangles`);
  assert.deepEqual(problems(logs), []);
});

test('a board takes ENV.crateHits of the player’s rounds and goes down: the way through it opens and the player walks through; the men’s rounds wear it not at all; concrete takes any number and stands', async () => {
  const r = await page.evaluate(async () => {
    const { ENV } = await import('./src/config.js');
    const g = window.game;
    window.toMaze(4);
    const L = g.level;
    const { boards, concrete } = window.walls();
    const s = boards[0];
    const [a, b, [dx, dz]] = window.sides(s);
    g.player.x = a[0] - dx * 3;
    g.player.z = a[1] - dz * 3;
    for (let i = 0; i < 10; i++) {
      window.shoot(a[0], a[1], dx, dz, 'enemy');
      window.play(6, { aim: a });
    }
    const afterMen = { hp: s.hp, alive: s.alive };
    const hp = [];
    let before = null;
    for (let i = 0; i < ENV.crateHits; i++) {
      window.shoot(a[0], a[1], dx, dz);
      window.play(6, { aim: a });
      hp.push(s.hp);
      if (i === ENV.crateHits - 2) before = { alive: s.alive, walkable: L.nav.isWalkable(s.x, s.z), path: !!L.nav.findPath(a[0], a[1], b[0], b[1]) && L.nav.findPath(a[0], a[1], b[0], b[1]).length };
    }
    const path = L.nav.findPath(a[0], a[1], b[0], b[1]);
    // the player walks straight through where it stood
    g.player.x = a[0];
    g.player.z = a[1];
    const key = dx > 0 ? 'KeyD' : 'KeyW';
    window.play(120, { held: [key], aim: [b[0] + dx * 5, b[1] + dz * 5] });
    const crossed = dx > 0 ? g.player.x > s.maxX + 0.5 : g.player.z < s.minZ - 0.5;
    // concrete: twenty of the player's rounds
    const c = concrete[0];
    const [ca, , [cdx, cdz]] = window.sides(c);
    g.player.x = ca[0] - cdx * 3;
    g.player.z = ca[1] - cdz * 3;
    for (let i = 0; i < 20; i++) {
      window.shoot(ca[0], ca[1], cdx, cdz);
      window.play(6, { aim: ca });
    }
    return {
      hits: ENV.crateHits,
      afterMen,
      hp,
      before,
      alive: s.alive,
      walkable: L.nav.isWalkable(s.x, s.z),
      los: L.hasLOS(a[0], a[1], b[0], b[1]),
      path: path && path.length,
      crossed,
      concrete: { alive: c.alive, hp: c.hp, walkable: L.nav.isWalkable((c.minX + c.maxX) / 2, (c.minZ + c.maxZ) / 2) },
      notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('薄牆')),
    };
  });
  assert.deepEqual(r.afterMen, { hp: r.hits, alive: true }, 'ten of the men’s rounds: not a scratch');
  assert.deepEqual(r.hp, Array.from({ length: r.hits }, (_, i) => r.hits - 1 - i), 'one off a shot');
  assert.equal(r.before.alive, true, 'one round short: still standing');
  assert.equal(r.before.walkable, false, 'and in the way');
  assert.equal(r.alive, false, `the ${r.hits}th brings it down`);
  assert.equal(r.walkable, true, 'where it stood walks');
  assert.equal(r.los, true, 'and sight passes');
  assert.ok(r.path && (!r.before.path || r.path < r.before.path), `the way through it is shorter (${r.before.path} → ${r.path} cells)`);
  assert.equal(r.crossed, true, 'the player walks through');
  assert.deepEqual(r.concrete, { alive: true, hp: undefined, walkable: false }, 'concrete stands');
  assert.deepEqual(r.notes, ['薄牆被打爛'], 'a line in the notes');
  assert.deepEqual(problems(logs), []);
});

test('a kick at a board in front brings it down at once; a kick at concrete does nothing to it; a blast beside a board brings it down', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toMaze(5);
    const L = g.level;
    const p = g.player;
    const kickAt = (s, back) => {
      const [a, , [dx, dz]] = window.sides(s);
      const off = 1.5 - back; // from the side's spot 1.5 m out, to `back` m out
      p.x = a[0] + dx * off;
      p.z = a[1] + dz * off;
      p.vx = p.vz = 0;
      p.kickCd = 0;
      const aim = [a[0] + dx * 6, a[1] + dz * 6];
      window.play(2, { aim });
      window.play(1, { press: ['KeyF'], aim });
      window.play(30, { aim });
    };
    const { boards, concrete } = window.walls();
    const [near, far] = [boards[0], boards[1]];
    kickAt(far, 2.6); // out of reach: stands
    const farStands = far.alive;
    kickAt(near, 0.8);
    const kicked = { alive: near.alive, walkable: L.nav.isWalkable(near.x, near.z) };
    kickAt(concrete[0], 0.8);
    const concreteStands = concrete[0].alive && !L.nav.isWalkable((concrete[0].minX + concrete[0].maxX) / 2, (concrete[0].minZ + concrete[0].maxZ) / 2);
    // a blast against a board: one metre off it
    const [a] = window.sides(far);
    p.x = a[0] + 8;
    p.z = a[1] + 8;
    g.explode((far.minX + far.maxX) / 2 + (far.maxX - far.minX > 1 ? 0 : -1), (far.minZ + far.maxZ) / 2 + (far.maxX - far.minX > 1 ? 1 : 0), 4.4, { source: 'test' });
    window.play(4);
    return { farStands, kicked, concreteStands, blasted: !far.alive, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('薄牆')) };
  });
  assert.equal(r.farStands, true, 'a board out of reach stands');
  assert.deepEqual(r.kicked, { alive: false, walkable: true }, 'kicked down, the way through open');
  assert.equal(r.concreteStands, true, 'concrete takes a kick');
  assert.equal(r.blasted, true, 'a blast a metre off a board brings it down');
  assert.deepEqual(r.notes, ['踢爛薄牆', '薄牆被炸爛']);
  assert.deepEqual(problems(logs), []);
});

test('a board down stays down for the run: through the room’s next wave; a new run stands every board up again, and the same seed draws the same maze', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toMaze(6);
    const L = g.level;
    const key = JSON.stringify(L.maze.solids);
    const s = L.boards[0];
    L.breakSolid(s, 1, 0);
    // the room's first wave (the run's third) comes in, is cleared, and its second comes in: the board still down
    Object.assign(g.waves, { wave: 2, state: 'intermission', timer: 0, stageNext: false });
    const seen = [];
    for (let i = 0; i < 120 * 8 && !(g.waves.wave === 4 && g.waves.state === 'active'); i++) {
      window.play(1);
      if (g.waves.state === 'active' && !seen.includes(g.waves.wave)) seen.push(g.waves.wave);
      if (g.waves.wave === 3 && g.waves.state === 'active') {
        g.waves.queue.length = 0;
        g.waves.pending.length = 0;
        g.enemies.clear();
      }
    }
    const down = { waves: seen, alive: s.alive, walkable: L.nav.isWalkable(s.x, s.z), mesh: s.mesh.visible };
    // again with the seed: the run starts in the teahouse and comes to the maze anew
    window.toMaze(6);
    const L2 = g.level;
    return { down, again: JSON.stringify(L2.maze.solids) === key, whole: L2.boards.every((b) => b.alive && b.hp === b.breaks.hits() && b.mesh.visible && !L2.nav.isWalkable(b.x, b.z)) };
  });
  assert.deepEqual(r.down, { waves: [3, 4], alive: false, walkable: true, mesh: false }, 'the room’s two waves, the board down through both');
  assert.equal(r.again, true, 'the same seed, the same maze');
  assert.equal(r.whole, true, 'every board standing again');
  assert.deepEqual(problems(logs), []);
});

test('the bot plays the maze: it clears the first room, comes into the maze, clears its two waves and goes out by the exit', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 9, mode: 'danmaku', restart: false, god: true });
  const r = await page.evaluate(() => {
    const g = window.game;
    g.floors[0][1] = 'maze';
    g.floor = g.floors.flat();
    let frames = 0;
    let inMaze = 0;
    let broken = 0;
    while (g.state === 'playing' && g.stage < 2 && frames < 60 * 60 * 8) {
      window.simStep(60);
      frames += 60;
      if (g.stage === 1) {
        inMaze += 1;
        broken = g.level.boards.filter((s) => !s.alive).length;
      }
    }
    return { stage: g.stage, wave: g.waves.wave, s: frames / 60, inMaze, broken, errors: window.stats.errors, room: g.stageMap.id };
  });
  assert.deepEqual(r.errors, [], 'nothing thrown on the way');
  assert.equal(r.stage, 2, `out of the maze into the next room (stage ${r.stage}, wave ${r.wave}, ${r.s} s)`);
  assert.ok(r.wave >= 4, `the maze’s two waves down (wave ${r.wave})`);
  console.log(`# the bot: through the maze in ${r.inMaze} s (${r.s} s from the start), ${r.broken} boards down on the way`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the maze in a wave, a board going down to the player’s shots', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toMaze(7);
    const L = g.level;
    const p = g.player;
    // the nearest board to the start
    const s = L.boards.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const [a, b, [dx, dz]] = window.sides(s);
    p.x = a[0] - dx * 1.2;
    p.z = a[1] - dz * 1.2;
    // men beyond it and about the maze
    const man = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = 999;
      return e;
    };
    man('grunt', b[0] + dx * 1.5, b[1] + dz * 1.5);
    man('rifle', b[0] + dx * 2 + dz * 1.5, b[1] + dz * 2 + dx * 1.5);
    for (let i = 0; i < 5; i++) {
      window.shoot(p.x + dx * 0.6, p.z + dz * 0.6, dx, dz);
      window.play(4, { aim: [b[0] + dx * 4, b[1] + dz * 4] });
    }
    window.shoot(p.x + dx * 0.6, p.z + dz * 0.6, dx, dz);
    window.play(5, { aim: [b[0] + dx * 4, b[1] + dz * 4] });
    g.hurtFx = 0;
    g.hud.el.banner.className = '';
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { down: !s.alive };
  });
  await page.screenshot({ path: new URL('maze.png', OUT).pathname });
  assert.equal(r.down, true, 'the board went down');
  assert.deepEqual(problems(logs), []);
});
