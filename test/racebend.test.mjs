// 彈幕 ② E②: the track bend (rooms.js RACEBEND), the circuit remade as a fight room in the floors' draw. Its own
// thing: a quarter bend of road through the room, in at the north wall and out at the east, that the racing cars
// (src/race.js) sweep on the room's timetable (its `track`: the first pass, then every so often, in world time),
// RACE.warn s after the lights turn red and a line glows along the road. A man on the road is run down (GRAND PRIX);
// the player on it loses RACE.damage HP, off it nothing; the exit is in the infield, across the road. The room
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
  ({ page, logs } = await h.open('?seed=52'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run in the track bend (the first floor's second room made the bend), the player at (x, z), nobody about. */
    window.toBend = (x = -5, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'racebend';
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
    /** The point `a` (degrees) round the bend, `r` m from its corner (rooms.js bendAt). */
    window.bend = (r, a) => {
      const [cx, cz] = g.rooms.racebend.room.track.at;
      const t = (a * Math.PI) / 180;
      return [cx - Math.sign(cx) * r * Math.cos(t), cz - Math.sign(cz) * r * Math.sin(t)];
    };
    /** A man of `type` standing at (x, z) who never fires. */
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
    /** 120 Hz steps holding `held`; the player kept whole unless `hurt`. */
    window.play = (n, { held = [], hurt = false } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        if (!hurt) {
          g.player.hp = 100;
          g.player.invuln = 0;
        }
        g.aimPoint.set(g.player.x + 5, g.aimPoint.y, g.player.z);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
    };
    /** Run the world until the race is `state` ('warn': the warning just came on; 'pass': the first car on the map). */
    window.until = (state, max = 120 * 40) => {
      const race = g.level.race;
      for (let i = 0; i < max; i++) {
        if (state === 'warn' && race.warning) return race.t;
        if (state === 'pass' && race.cars.some((c) => c.group.visible)) return race.t;
        window.play(1);
      }
      return null;
    };
  });
});
after(async () => {
  await h.close();
});

test('the track bend is in the floors’ draw; it loads with its race on two lanes, the road in through the north wall and out through the east; tyre walls that stop shots; the exit in the infield, the way to it across the road; four lights; the budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toBend();
    const L = g.level;
    const room = L.map;
    const t = room.room.track;
    const line = room.race.line;
    const [cx, cz] = t.at;
    const fromCorner = (x, z) => Math.hypot(x - cx, z - cz);
    const tyres = L.solids.filter((s) => s.matKey === 'tyres');
    const tyre = tyres[0];
    const tx = (tyre.minX + tyre.maxX) / 2;
    const tz = (tyre.minZ + tyre.maxZ) / 2;
    const shotStopped = !!L.raycast(tx - 1.5, tz, tx + 1.5, tz);
    const [rx, rz] = window.bend(t.r, 45);
    const path = L.nav.findPath(L.start.x, L.start.z, L.exit.at.x, L.exit.at.z);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return {
      pool: g.waves.rules.floor.pool,
      id: room.id,
      race: !!L.race,
      lanes: room.race.lanes,
      first: line[0],
      last: line[line.length - 1],
      half: [L.bounds.halfW, L.bounds.halfD],
      tyres: tyres.length,
      shotStopped,
      roadWalkable: L.nav.isWalkable(rx, rz),
      start: fromCorner(L.start.x, L.start.z),
      exit: fromCorner(L.exit.at.x, L.exit.at.z),
      road: [t.r - t.road / 2, t.r + t.road / 2],
      path: !!path && path.length > 0,
      lights: L.points.length,
      calls: info.calls,
      tris: info.triangles,
      budget: room.budget,
    };
  });
  await page.screenshot({ path: new URL('racebend-quiet.png', OUT).pathname });
  assert.ok(r.pool.includes('racebend'), `in the draw: ${r.pool}`);
  assert.equal(r.id, 'racebend');
  assert.ok(r.race, 'the race');
  assert.deepEqual(r.lanes, [-1.1, 1.1], 'two lanes');
  assert.ok(r.first[1] < -r.half[1], `the line comes in from beyond the north wall: ${r.first}`);
  assert.ok(r.last[0] > r.half[0], `and goes out beyond the east wall: ${r.last}`);
  assert.ok(r.tyres >= 12, `${r.tyres} tyre stacks`);
  assert.ok(r.shotStopped, 'a tyre stack stops a shot');
  assert.ok(r.roadWalkable, 'the road is open ground');
  assert.ok(r.start > r.road[1] && r.exit < r.road[0], `the start outside the bend (${r.start.toFixed(1)} m), the exit inside it (${r.exit.toFixed(1)} m), the road ${r.road}`);
  assert.ok(r.path, 'a way to the exit (the start outside the bend, the exit inside it: across the road)');
  assert.equal(r.lights, 4, 'four point lights');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the cars keep the room’s timetable in world time, the warning RACE.warn s before each pass, the lights red and a line along the road; the same seed, the same moments', async () => {
  const r = await page.evaluate(async () => {
    const { RACE } = await import('/src/config.js');
    const g = window.game;
    window.toBend();
    const race = g.level.race;
    const def = g.level.map.race;
    const times = [];
    for (let k = 0; k < 2; k++) {
      const warn = window.until('warn');
      const lights = g.level.points.map((p) => p.light.color.getHexString());
      const pass = window.until('pass');
      times.push({ warn, pass, line: race.line.visible, lights });
      while (race.warning) window.play(1);
    }
    const after = g.level.points.map((p) => p.light.color.getHexString());
    window.toBend();
    const again = [window.until('warn'), window.until('pass')];
    return { times, after, again, first: def.first, every: def.every, warn: RACE.warn, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('賽車')) };
  });
  const step = 1 / 120 + 1e-6;
  assert.ok(Math.abs(r.times[0].pass - r.first) <= step, `the first pass at ${r.first} s (${r.times[0].pass})`);
  assert.ok(Math.abs(r.times[0].pass - r.times[0].warn - r.warn) <= step, `warned ${r.warn} s before`);
  assert.ok(Math.abs(r.times[1].pass - r.times[0].pass - r.every) <= step, `the next ${r.every} s after the first (${r.times[1].pass})`);
  assert.equal(r.times[0].line, true, 'a line along the road');
  assert.ok(r.times[0].lights.every((c) => c.startsWith('ff')), `the lights red: ${r.times[0].lights}`);
  assert.ok(!r.after.every((c) => c.startsWith('ff') && c.slice(2, 4) < '40'), `the lights back after the pass: ${r.after}`);
  assert.deepEqual(r.again, [r.times[0].warn, r.times[0].pass], 'the room again: the same moments');
  assert.ok(r.notes.length >= 1, 'the notes say the cars are coming');
  assert.deepEqual(problems(logs), []);
});

test('men on the road, either lane, anywhere round the bend, are run down: GRAND PRIX +200 each; one in the infield and one on the run-off live', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const kills = [];
    const kill0 = g.score.kill.bind(g.score);
    g.score.kill = (t) => {
      kills.push(t.map((x) => `${x.label}:${x.pts}`));
      return kill0(t);
    };
    window.toBend(-8, 5);
    const t = g.rooms.racebend.room.track;
    window.until('warn');
    const onRoad = [window.post('grunt', ...window.bend(t.r - 1.1, 20)), window.post('grunt', ...window.bend(t.r + 1.1, 45)), window.post('grunt', ...window.bend(t.r, 70))];
    const infield = window.post('grunt', 5.5, -5.5);
    const runOff = window.post('grunt', -3, 3);
    for (let i = 0; i < 120 * 6 && g.level.race.warning; i++) window.play(1);
    g.score.kill = kill0;
    return { dead: onRoad.map((e) => !e.alive), infield: infield.alive, runOff: runOff.alive, tags: kills.flat(), notes: g.notes.events.map((e) => e.text).filter((x) => x.includes('GRAND PRIX')) };
  });
  assert.deepEqual(r.dead, [true, true, true], 'all three on the road, kerb to kerb, round the bend');
  assert.equal(r.infield, true, 'the one in the infield lives');
  assert.equal(r.runOff, true, 'the one on the run-off lives');
  assert.equal(r.tags.filter((x) => x === 'GRAND PRIX:200').length, 3, r.tags.join(','));
  assert.deepEqual(problems(logs), []);
});

test('the player on the road loses RACE.damage HP once a pass, in a lane or in the road’s middle where two cars go over him; in the infield or on the run-off, nothing', async () => {
  const r = await page.evaluate(async () => {
    const { RACE } = await import('/src/config.js');
    const g = window.game;
    const p = g.player;
    /** At (x, z) as the cars pass; how much HP the pass cost. */
    const pass = (x, z) => {
      window.toBend(x, z);
      window.until('warn');
      p.x = x;
      p.z = z;
      p.hp = 100;
      p.invuln = 0;
      const race = g.level.race;
      for (let i = 0; i < 120 * 6 && race.warning; i++) window.play(1, { hurt: true });
      return 100 - p.hp;
    };
    const t = g.rooms.racebend.room.track;
    // a lane's middle, under one or two of the three cars; the road's middle, where the two lanes' cars overlap
    return { damage: RACE.damage, lane: pass(...window.bend(t.r + 1.1, 45)), other: pass(...window.bend(t.r - 1.1, 45)), middle: pass(...window.bend(t.r, 45)), infield: pass(7, -4), runOff: pass(-3, 3) };
  });
  assert.deepEqual([r.lane, r.other, r.middle], [r.damage, r.damage, r.damage], `on the road, once a pass: ${r.lane}, ${r.other}, ${r.middle} HP`);
  assert.equal(r.infield, 0, 'in the infield: nothing');
  assert.equal(r.runOff, 0, 'on the run-off: nothing');
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the lights red and the cars sweeping the bend, a man on the road about to go, the player on the run-off', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toBend(-3.5, 3);
    const t = g.rooms.racebend.room.track;
    window.until('warn');
    window.post('grunt', ...window.bend(t.r + 1.1, 78));
    window.post('rifle', 5.5, -5.5);
    window.post('grunt', -8.5, -5);
    window.until('pass');
    const race = g.level.race;
    // on until the pack's lead car is halfway round the bend, the next coming in through the north wall
    for (let i = 0; i < 120 && !(race.cars[0].group.visible && race.cars[0].z > -1.5); i++) window.play(1);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { cars: race.cars.filter((c) => c.group.visible).map((c) => [+c.x.toFixed(1), +c.z.toFixed(1)]), red: race.warning };
  });
  await page.screenshot({ path: new URL('racebend.png', OUT).pathname });
  assert.ok(r.cars.length >= 1 && r.red, `cars in the room under red lights: ${JSON.stringify(r)}`);
  assert.deepEqual(problems(logs), []);
});
