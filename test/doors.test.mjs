// F③a: two doors (rooms.js exit2, drawBranches; main.js setExits, takeExit). Every fight room has a second exit in a
// tall wall; for each room of a floor but its first and its boss's the run draws a second room (its own stream, so the
// floors stay as drawn), and the room before it opens both doors when it is cleared, each with the room it leads to
// over it (hud.js updateExits). Walking into one goes to its room, and the floor holds that room from then on; a floor
// never has a room twice whichever way it is walked. The last fight room before the boss has one door. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=73'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run (with `seed` the run's seed) at its start, the teahouse. */
    window.toStart = (seed = null) => {
      const keep = g.fixedSeed;
      if (seed !== null) g.fixedSeed = seed;
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.fixedSeed = keep;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** 120 Hz steps, the player kept whole. */
    window.play = (n) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
        g.updatePlay(1 / 120);
      }
    };
    /** The room's waves down at once, its exits open. */
    window.clearRoom = () => {
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 120 * 10 && g.waves.state !== 'active'; i++) window.play(1);
        g.waves.queue.length = 0;
        g.waves.pending.length = 0;
        g.enemies.clear();
        g.bullets.clear();
        window.play(2);
      }
      return g.waves.state;
    };
    /** The player into exit `x` and on through the change of room; the room he is in after. */
    window.walkInto = (x) => {
      g.player.x = x.at.x;
      g.player.z = x.at.z;
      for (let i = 0; i < 120 * 3 && !(g.transition === null && g.stage > 0 && g.level.exits.every((e) => e.locked)); i++) window.play(1);
      return g.level.map.id;
    };
  });
});
after(async () => {
  await h.close();
});

test('every fight room has a second exit in a tall wall, apart from its first and from the men’s doors, walkable to from the start; a boss room has one; loaded on its own, a room shows only the first', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toStart(1);
    const out = [];
    for (const id of Object.keys(g.rooms)) {
      g.level.load(g.rooms[id]);
      const L = g.level;
      const t = L.map.room;
      const st = L.start;
      const [a, b] = L.exits;
      const o = { id, boss: !!t.boss, exits: L.exits.length };
      if (b) {
        const along = (x) => (t.exit2[0] === 'n' || t.exit2[0] === 's' ? x.x : x.z);
        o.low = t.low[1].includes(t.exit2[0]);
        o.apart = Math.hypot(a.x - b.x, a.z - b.z);
        o.spawnGap = Math.min(...L.spawns.filter((sp) => Math.hypot(sp.x - b.x, sp.z - b.z) < 3).map((sp) => Math.abs((t.exit2[0] === 'n' || t.exit2[0] === 's' ? sp.x : sp.z) - along(b))), 99);
        o.path = !!L.nav.findPath(st.x, st.z, b.at.x, b.at.z);
        o.spare = b.spare && !b.mesh.visible;
      }
      out.push(o);
    }
    return out;
  });
  for (const o of r) {
    if (o.boss) {
      assert.equal(o.exits, 1, `${o.id}: a boss room has one exit`);
      continue;
    }
    assert.equal(o.exits, 2, `${o.id}: two exits`);
    assert.equal(o.low, false, `${o.id}: the second in a tall wall`);
    assert.ok(o.apart >= 2.5, `${o.id}: the two ${o.apart.toFixed(1)} m apart`);
    assert.ok(o.spawnGap >= 2, `${o.id}: ${o.spawnGap.toFixed(1)} m from the nearest of the men’s doors`);
    assert.equal(o.path, true, `${o.id}: walkable to from the start`);
    assert.equal(o.spare, true, `${o.id}: loaded on its own, the second is hidden`);
  }
  assert.deepEqual(problems(logs), []);
});

test('a run draws a second room for every place on a floor but its first and its boss’s: the same seed the same, the floors as before; no room twice on a floor counting both; the notes write the tree', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const runs = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      window.toStart(seed);
      runs.push({ seed, floors: g.floors.map((f) => f.slice()), branches: g.branches.map((f) => f.slice()), tree: g.notes.events.map((e) => e.text).filter((t) => /^第 \d 層：/.test(t)) });
    }
    window.toStart(5);
    return { runs, again: { floors: g.floors, branches: g.branches }, boss: g.waves.rules.floor.boss };
  });
  for (const run of r.runs) {
    run.floors.forEach((ids, f) => {
      const alts = run.branches[f];
      assert.equal(alts.length, ids.length, `seed ${run.seed}, floor ${f + 1}: a place each`);
      assert.equal(alts[0], null, `seed ${run.seed}, floor ${f + 1}: none for its first room`);
      assert.equal(alts[alts.length - 1], null, `seed ${run.seed}, floor ${f + 1}: none for the boss’s`);
      assert.ok(alts.slice(1, -1).every((a) => a && !r.boss.includes(a)), `seed ${run.seed}, floor ${f + 1}: a fight room for each between (${alts})`);
      const all = [...ids, ...alts.filter(Boolean)];
      assert.equal(new Set(all).size, all.length, `seed ${run.seed}, floor ${f + 1}: no room twice (${ids} / ${alts})`);
    });
    assert.equal(run.tree.length, run.floors.length, 'a line a floor in the notes');
    assert.ok(run.tree.every((t) => t.includes('／')), `the choices in it: ${run.tree[0]}`);
  }
  assert.deepEqual(r.again.floors, r.runs[4].floors, 'the same seed, the same floors');
  assert.deepEqual(r.again.branches, r.runs[4].branches, 'and the same second rooms');
  assert.deepEqual(problems(logs), []);
});

test('the teahouse cleared opens both doors, each named over it (dim before, lit after); the second goes to its room and the floor holds it; the first to the room drawn; the last fight room before the boss has one door', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const tags = () => [...document.querySelectorAll('#indicators .exit-tag')].filter((t) => t.style.display === 'block').map((t) => ({ text: t.textContent, open: t.classList.contains('open') }));
    // the second door
    window.toStart(6);
    const drawn = g.floors[0][1];
    const alt = g.branches[0][1];
    const L = g.level;
    window.play(1);
    g.hud.update(1 / 60);
    const before = { tags: tags(), to: L.exits.map((x) => x.to), shown: L.exits.map((x) => x.mesh.visible) };
    const state = window.clearRoom();
    g.hud.update(1 / 60);
    const open = { state, locked: L.exits.map((x) => x.locked), tags: tags(), banner: g.hud.el.banner.textContent };
    const went = window.walkInto(L.exits[1]);
    const held = { floor1: g.floors[0][1], flat: g.floor[1], notes: g.notes.events.map((e) => e.text).filter((t) => t.startsWith('揀咗門')) };
    // the first door
    window.toStart(6);
    window.clearRoom();
    const first = window.walkInto(g.level.exits[0]);
    // the floor's last fight room
    window.toStart(6);
    g.stage = g.floors[0].length - 2;
    g.level.load(g.stageMap);
    g.setExits();
    const last = { exits: g.level.exits.filter((x) => !x.spare).length, to: g.level.exit.to, boss: g.floors[0][g.floors[0].length - 1] };
    return { drawn, alt, before, open, went, held, first, last, names: { drawn: g.rooms[drawn].name, alt: g.rooms[alt].name } };
  });
  assert.deepEqual(r.before.to, [r.drawn, r.alt], 'the first door to the room drawn, the second to the other');
  assert.deepEqual(r.before.shown, [true, true], 'both drawn');
  assert.equal(r.before.tags.length, 2, `a name over each: ${JSON.stringify(r.before.tags)}`);
  assert.ok(r.before.tags.every((t) => !t.open), 'dim while the room is fought');
  assert.ok(r.before.tags.some((t) => t.text.includes(r.names.drawn)) && r.before.tags.some((t) => t.text.includes(r.names.alt)), JSON.stringify(r.before.tags));
  assert.equal(r.open.state, 'exit');
  assert.deepEqual(r.open.locked, [false, false], 'both open');
  assert.ok(r.open.tags.every((t) => t.open && t.text.startsWith('→ ')), `lit: ${JSON.stringify(r.open.tags)}`);
  assert.ok(r.open.banner.includes(r.names.drawn) && r.open.banner.includes(r.names.alt), `the banner names both: ${r.open.banner}`);
  assert.equal(r.went, r.alt, 'the second door: its room');
  assert.deepEqual([r.held.floor1, r.held.flat], [r.alt, r.alt], 'the floor holds it');
  assert.ok(r.held.notes.some((t) => t.includes(r.names.alt)), r.held.notes.join(' / '));
  assert.equal(r.first, r.drawn, 'the first door: the room drawn');
  assert.deepEqual([r.last.exits, r.last.to], [1, r.last.boss], 'before the boss: one door, to the boss room');
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the plaza cleared, its two doors open side by side, each named', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.toStart(6);
    g.waves.state = 'done';
    g.enemies.clear();
    g.floors[0][1] = 'plaza';
    g.floor = g.floors.flat();
    g.stage = 1;
    g.level.load(g.stageMap);
    g.setExits();
    g.applyMapView();
    const L = g.level;
    g.waves.state = 'exit';
    for (const x of L.exits) x.unlock();
    g.challenge.offer = null; // the teahouse's sign, from the run's start
    g.player.x = (L.exits[0].x + L.exits[1].x) / 2;
    g.player.z = L.exits[0].z + 3.5;
    g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
    g.aimFresh = true;
    window.play(120); // the leaves swing open; the player stands
    g.view = 0;
    g.hud.el.banner.className = '';
    g.updateCamera(1, true);
    g.camera.updateMatrixWorld();
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('doors.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
