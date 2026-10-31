// 彈幕試驗 ④: flipping a table, Enter the Gungeon's own move. An upright round
// table in the teahouse is low: it stops bodies, and shots and sight pass
// over it. The player's kick flips it onto its side: the top stands up as a
// wall across the way the kick went, beyond the table's middle, and stops
// shots (everyone's) and sight; paths go round it. Bullets wear it: after
// ENV.table.hp it breaks, and shots fly on. A new run stands them all up.
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
    /** A 彈幕試驗 run, nobody about; the middle table of the south row (room to the north of it to shoot from), and the player just south of it, facing it. */
    window.toTable = () => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      const L = g.level;
      const t = L.fixtures.filter((f) => f.kind === 'table').sort((a, b) => Math.hypot(a.x, a.z - 3) - Math.hypot(b.x, b.z - 3))[0];
      const p = g.player;
      p.x = t.x;
      p.z = t.z + t.w + 0.6;
      p.facing = Math.PI; // north, at the table
      return t;
    };
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /** An enemy bullet from 4 m north of the table, flying south through its middle at the player: where it ended. */
    window.shootThrough = (t, owner = 'enemy') => {
      const b = g.bullets.spawn({ x: t.x, z: t.z - 4, dx: 0, dz: 1, speed: 30, owner, damage: 0 });
      for (let i = 0; i < 40 && b.alive; i++) g.bullets.update(1 / 120);
      return { alive: b.alive, z: b.z };
    };
  });
});
after(async () => {
  await h.close();
});

test('upright, a round table stops bodies; shots and sight pass over it', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    const t = window.toTable();
    const shot = window.shootThrough(t);
    const sight = L.hasLOS(t.x, t.z - 3, t.x, t.z + 3);
    const walk = !L.nav.isWalkable(t.x, t.z);
    // a body walked into it is pushed out
    const body = { x: t.x, z: t.z + 0.2 };
    L.collideCircle(body, 0.3);
    return { flipped: t.flipped, passed: shot.alive || shot.z > t.z + t.w, sight, walk, out: Math.hypot(body.x - t.x, body.z - t.z) };
  });
  assert.equal(r.flipped, false);
  assert.equal(r.passed, true, 'a shot flies over it');
  assert.equal(r.sight, true, 'and sight');
  assert.equal(r.walk, true, 'not a way through on foot');
  assert.ok(r.out > 0.8, `a body is pushed out of it (${r.out.toFixed(2)} m from its middle)`);
});

test('kicked, it flips: a wall across the kick’s way, beyond its middle, that stops shots and sight; paths go round; FLIP and a line in the notes', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    const t = window.toTable();
    const styles = [];
    const style0 = g.score.style.bind(g.score);
    g.score.style = (l, ...a) => {
      styles.push(l);
      return style0(l, ...a);
    };
    g.player.kickCd = 0;
    g.player.kick();
    g.score.style = style0;
    for (let i = 0; i < 60; i++) window.step();
    const wall = L.solids.find((s) => s.table === t);
    const shot = window.shootThrough(t);
    const shot2 = window.shootThrough(t, 'player');
    return {
      flipped: t.flipped,
      wall: !!wall,
      // the wall north of the table's middle (the kick went north), and across: east-west
      at: wall ? [(wall.minX + wall.maxX) / 2 - t.x, (wall.minZ + wall.maxZ) / 2 - t.z, wall.maxX - wall.minX, wall.maxZ - wall.minZ] : null,
      stopped: !shot.alive && shot.z < t.z,
      stopped2: !shot2.alive && shot2.z < t.z,
      sight: L.hasLOS(t.x, t.z - 3, t.x, t.z + 3),
      path: L.nav.findPath(t.x, t.z - 2.5, t.x, t.z + 2.5),
      styles,
      notes: g.notes.events.slice(-5).map((e) => e.text),
    };
  });
  assert.equal(r.flipped, true);
  assert.equal(r.wall, true, 'a wall stands');
  assert.ok(r.at[1] < -0.2, `beyond the middle, the way the kick went (${r.at[1].toFixed(2)})`);
  assert.ok(r.at[2] > 1.4 && r.at[3] < 0.6, `across the kick’s way: ${r.at[2].toFixed(2)} × ${r.at[3].toFixed(2)} m`);
  assert.equal(r.stopped, true, 'an enemy shot stops at it');
  assert.equal(r.stopped2, true, 'so does the player’s');
  assert.equal(r.sight, false, 'no sight through');
  assert.ok(r.path && r.path.length > 1, 'a path goes round');
  assert.ok(r.styles.includes('FLIP'), `FLIP (${r.styles})`);
  assert.ok(r.notes.some((n) => n.includes('翻枱')), r.notes.join(' / '));
});

test('shots wear it: after ENV.table.hp it breaks, and shots fly on; a new run stands every table up again', async () => {
  const r = await page.evaluate(async () => {
    const { ENV } = await import('./src/config.js');
    const g = window.game;
    const L = g.level;
    const t = window.toTable();
    g.player.kickCd = 0;
    g.player.kick();
    for (let i = 0; i < 60; i++) window.step();
    const held = [];
    for (let i = 0; i < ENV.table.hp; i++) held.push(window.shootThrough(t, i % 2 ? 'player' : 'enemy').alive === false);
    const after = window.shootThrough(t);
    const broken = { broken: t.broken, wall: L.solids.some((s) => s.table === t && s.alive), passes: after.alive || after.z > t.z + t.w, notes: g.notes.events.slice(-4).map((e) => e.text) };
    g.startRun(0);
    const L2 = g.level;
    const tables = L2.fixtures.filter((f) => f.kind === 'table');
    return { hp: ENV.table.hp, held, broken, again: tables.every((f) => !f.flipped && !f.broken && f.mesh.visible) && !L2.solids.some((s) => s.table) };
  });
  assert.ok(r.hp >= 4, `ENV.table.hp ${r.hp}`);
  assert.ok(r.held.every(Boolean), 'each of its shots stopped at it');
  assert.equal(r.broken.broken, true, 'then it breaks');
  assert.equal(r.broken.wall, false, 'no wall left');
  assert.equal(r.broken.passes, true, 'shots fly on');
  assert.ok(r.broken.notes.some((n) => n.includes('圓枱被打爛')), r.broken.notes.join(' / '));
  assert.equal(r.again, true, 'a new run: every table upright');
});

test('the teahouse with its tables as fixtures stays within its draw-call budget, flipped or not', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const draw = () => {
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      g.render();
      return g.renderer.info.render.calls;
    };
    window.toTable();
    const upright = draw();
    for (const f of g.level.fixtures) if (f.kind === 'table') f.flip(f.x, f.z + 2);
    for (let i = 0; i < 60; i++) window.step();
    const flipped = draw();
    return { upright, flipped, budget: g.level.map.budget.calls };
  });
  assert.ok(r.upright <= r.budget && r.flipped <= r.budget, `${r.upright} upright, ${r.flipped} flipped; budget ${r.budget}`);
});

test('screenshot: a fan of rounds breaking on a flipped table, the player behind it', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    const t = window.toTable();
    g.player.kickCd = 0;
    g.player.kick();
    for (let i = 0; i < 40; i++) window.step();
    // a fan of fast rounds from 5 m north at the player, three volleys a few steps apart: the first breaking on the table
    // (every round fast since 試玩回饋 ⑦)
    const p = g.player;
    for (const [k, at] of [[0, 0], [1, 4], [2, 4]]) {
      for (let i = 0; i < at; i++) window.step();
      for (let i = -9; i <= 9; i++) {
        const a = i * 0.07 + k * 0.035;
        g.bullets.spawn({ x: t.x, z: t.z - 5, dx: Math.sin(a), dz: Math.cos(a), speed: 20, owner: 'enemy', damage: 0 });
      }
    }
    for (let i = 0; i < 12; i++) window.step();
    p.facing = Math.PI;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('flip-table.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
