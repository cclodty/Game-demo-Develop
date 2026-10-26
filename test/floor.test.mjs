// 彈幕試驗 ⑤: a floor of rooms. A 彈幕試驗 run is no longer one room but a floor of three (waves.js MODES.danmaku
// `floor`): the teahouse first (the floor's way in: Enter the Gungeon opens every floor in the same room), then two of
// the others in an order the run's seed draws, so the same seed builds the same floor. A room is fought behind shut
// doors: its exit (fixtures.js 'exit', a double door in a tall wall) stays locked until the room's waves (`perStage`)
// are down, then opens and lights; walking into it the screen fades and the next room stands, nobody and nothing
// flying in it, the player just inside its entry (a gate in the low wall the camera looks over, shut behind him).
// The last room's last wave ends the run. Every room is on one screen, as the teahouse is (test/rooms.test.mjs). The
// replay's revision byte counts the rooms' revisions as it counts the maps'.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS, MAPS_REV, PLAY_REV } from '../src/maps.js';
import { ROOMS } from '../src/rooms.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=37'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run from its start: the first room, its first wave not begun, nothing held down. */
    window.toFloor = () => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.enemies.clear();
      g.bullets.clear();
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    window.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
        g.updatePlay(1 / 120);
      }
    };
    /** The player stood at (x, z), still. */
    window.stand = (x, z) => {
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
    };
    /** The wave's men all down and none to come (as the bot would leave it), then a step for the wave to end. */
    window.clearWave = () => {
      g.waves.queue = [];
      g.waves.pending = [];
      g.enemies.clear();
      while (g.boss.active) g.boss.hurt('測試'); // the arena's boss (D①)
      window.step();
    };
    /** The intermission over: the next wave begins. */
    window.nextWave = () => {
      g.waves.timer = 0;
      window.step();
    };
    /** `key` held, step by step, until `until()` (the steps it took) or `max` steps (-1). */
    window.walk = (key, until, max = 720) => {
      for (let i = 0; i < max; i++) {
        g.input.keys.clear();
        g.input.keys.add(key);
        window.step();
        if (until()) {
          g.input.keys.clear();
          return i;
        }
      }
      g.input.keys.clear();
      return -1;
    };
    /** The fade to the next room played through. */
    window.throughFade = () => {
      for (let i = 0; i < 400 && g.transition; i++) window.step();
    };
  });
});
after(async () => {
  await h.close();
});

test('a run is three floors of three or four rooms (彈幕 ② C①): the first floor opens in the teahouse, no room twice on a floor; the same seed, the same floors; the menu says so', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { MODES } = await import('./src/waves.js');
    const seed0 = g.fixedSeed;
    const floors = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      g.fixedSeed = seed;
      window.toFloor();
      floors.push({ seed, floor: g.floor.slice(), floors: g.floors.map((f) => f.slice()), loaded: g.level.map.id, total: g.waves.totalWaves });
    }
    g.fixedSeed = 3;
    window.toFloor();
    const again = g.floor.slice();
    g.fixedSeed = seed0;
    g.setMode('danmaku');
    const note = document.getElementById('maps-note').textContent;
    return { floors, again, spec: MODES.danmaku.floor, waves: MODES.danmaku.waves, perStage: MODES.danmaku.perStage, rooms: Object.keys(g.rooms), route: g.routeText(0, 'danmaku'), note };
  });
  for (const f of r.floors) {
    assert.equal(f.floors.length, r.spec.floors, `seed ${f.seed}: ${r.spec.floors} floors (${f.floors.map((x) => x.join('>')).join(' | ')})`);
    for (const [i, ids] of f.floors.entries()) {
      assert.equal(ids[ids.length - 1], r.spec.boss, `seed ${f.seed}, floor ${i + 1}: ends in the boss room (D①)`);
      assert.ok(ids.length - 1 >= r.spec.rooms[0] && ids.length - 1 <= r.spec.rooms[1], `seed ${f.seed}, floor ${i + 1}: ${ids.length - 1} fight rooms before it`);
      assert.equal(new Set(ids).size, ids.length, `seed ${f.seed}, floor ${i + 1}: no room twice (${ids})`);
      assert.ok(ids.every((id) => r.rooms.includes(id)), `seed ${f.seed}: ${ids}`);
    }
    assert.equal(f.floors[0][0], 'teahouse', `seed ${f.seed}: the teahouse first`);
    assert.deepEqual(f.floor, f.floors.flat(), 'the run’s rooms are the floors in order');
    assert.equal(f.loaded, f.floor[0], 'the run starts in the first floor’s first room');
    assert.equal(f.total, f.floor.length * r.perStage, `the run’s waves: ${f.floor.length} rooms × ${r.perStage}`);
  }
  assert.deepEqual(r.again, r.floors[2].floor, 'the same seed, the same floors');
  assert.ok(new Set(r.floors.map((f) => f.floor.join())).size > 1, `other seeds, another order: ${r.floors.map((f) => f.floor.join('>')).join(' | ')}`);
  for (const id of [r.spec.first, ...r.spec.pool]) {
    assert.ok(r.route.includes(ROOMS[id].name), `the route names ${ROOMS[id].name}: ${r.route}`);
  }
  assert.match(r.note, /三層/, `the maps note: ${r.note}`);
});

test('a room is fought behind shut doors: standing at its exit does nothing while its waves go on; its last wave down, the exit opens and lights, a line in the notes and on the HUD; then nothing more comes', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFloor();
    const L = g.level;
    const ex = L.exit;
    const out = { exit: !!ex };
    if (!ex) return out;
    window.nextWave();
    out.w1 = { state: g.waves.state, wave: g.waves.wave };
    // at the exit through the first wave: it is locked, nothing happens
    window.stand(ex.at.x, ex.at.z);
    window.step(120);
    out.fought = { state: g.waves.state, room: L.map.id, same: g.level === L && g.level.map === L.map, locked: ex.locked, arrow: ex.arrow.visible, fade: !!g.transition };
    window.stand(L.start.x, L.start.z);
    window.clearWave();
    out.after1 = { state: g.waves.state, locked: ex.locked, wave: g.waves.wave }; // the room's first wave: one more to come
    window.nextWave();
    out.w2 = { state: g.waves.state, wave: g.waves.wave };
    window.clearWave();
    g.hud.update(1 / 60);
    out.after2 = { state: g.waves.state, locked: ex.locked, arrow: ex.arrow.visible, notes: g.notes.events.slice(-4).map((e) => e.text), hud: document.getElementById('wave-sub').textContent };
    // the open exit waits for the player: no wave starts, the room stays
    window.step(120 * 5);
    out.waits = { state: g.waves.state, wave: g.waves.wave, room: g.level.map.id, fade: !!g.transition };
    return out;
  });
  assert.equal(r.exit, true, 'the room has an exit (level.exit)');
  assert.deepEqual(r.w1, { state: 'active', wave: 1 });
  assert.equal(r.fought.locked, true, 'locked while the room is fought');
  assert.equal(r.fought.arrow, false, 'nothing lit on the floor');
  assert.equal(r.fought.state, 'active');
  assert.equal(r.fought.fade, false, 'standing at it goes nowhere');
  assert.equal(r.fought.room, 'teahouse');
  assert.deepEqual([r.after1.state, r.after1.locked, r.after1.wave], ['intermission', true, 1], 'the room’s first wave down: still locked, another to come');
  assert.deepEqual(r.w2, { state: 'active', wave: 2 });
  assert.equal(r.after2.state, 'exit', 'its last wave down: the way on is open');
  assert.equal(r.after2.locked, false, 'unlocked');
  assert.equal(r.after2.arrow, true, 'and lit on the floor before it');
  assert.ok(r.after2.notes.some((t) => t.includes('門開了')), r.after2.notes.join(' / '));
  assert.match(r.after2.hud, /門開了/, `the HUD under the wave count: ${r.after2.hud}`);
  assert.deepEqual(r.waits, { state: 'exit', wave: 2, room: 'teahouse', fade: false }, 'the open exit waits for the player');
});

test('walking out of the open exit: the floor’s next room, nobody and no bullets in it, the player just inside its entry, its exit locked; its waves come; the last room’s last wave ends the run', { timeout: 10 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.view = 1; // W is north (the 45° tilt has no yaw)
    window.toFloor();
    const floor = g.floor.slice();
    const out = { floor, rooms: [] };
    for (let room = 0; room < floor.length; room++) {
      const L = g.level;
      const ex = L.exit;
      const entry = L.map.entry;
      const at = { id: L.map.id, stage: g.stage, start: Math.hypot(g.player.x - L.start.x, g.player.z - L.start.z), toEntry: Math.hypot(L.start.x - entry[0], L.start.z - entry[1]), locked: ex.locked };
      at.alive = g.enemies.list.filter((e) => e.alive).length;
      at.flying = g.bullets.list.filter((b) => b.alive).length;
      for (let w = 0; w < 2; w++) {
        window.nextWave();
        at[`wave${w}`] = g.waves.wave;
        at[`state${w}`] = g.waves.state;
        window.clearWave();
      }
      at.then = g.waves.state;
      at.lockedAtEnd = ex.locked;
      out.rooms.push(at);
      if (g.waves.state !== 'exit') break;
      // bullets still flying and a man about as the player goes: the room change takes them all
      g.bullets.spawn({ x: 4, z: 0, dx: 1, dz: 0, speed: 1, owner: 'enemy', damage: 0 });
      g.bullets.spawn({ x: -4, z: 2, dx: 0, dz: 1, speed: 1, owner: 'enemy', damage: 0 });
      const man = g.enemies.spawn('grunt', { x: 6, z: 0, ex: 6, ez: 0.1, stay: true });
      man.spawnLock = 0;
      // walk into it from 2.5 m short, as a player would: W for a door in the north wall, D in the east, A in the west
      const { x: dx, z: dz } = ex.dir; // into the room
      window.stand(ex.at.x + dx * 2.5, ex.at.z + dz * 2.5);
      at.walk = window.walk(dz > 0.5 ? 'KeyW' : dx < -0.5 ? 'KeyD' : 'KeyA', () => !!g.transition);
      window.throughFade();
      at.notes = g.notes.events.slice(-6).map((e) => e.text);
    }
    out.done = g.waves.state;
    out.wave = g.waves.wave;
    out.lastLocked = g.level.exit.locked;
    g.view = 2;
    return out;
  });
  assert.equal(r.rooms.length, r.floor.length, `every room played: ${r.rooms.map((x) => `${x.id} → ${x.then}`).join(', ')}`);
  r.rooms.forEach((x, i) => {
    assert.equal(x.id, r.floor[i], `room ${i + 1} is the floor’s (${r.floor})`);
    assert.equal(x.stage, i);
    assert.equal(x.locked, true, `${x.id}: its exit locked as it is entered`);
    assert.equal(x.alive, 0, `${x.id}: nobody in it`);
    assert.equal(x.flying, 0, `${x.id}: no bullets in it`);
    assert.ok(x.start < 0.3, `${x.id}: the player at its start (${x.start.toFixed(2)} m off)`);
    assert.ok(x.toEntry < 2, `${x.id}: its start just inside its entry (${x.toEntry.toFixed(2)} m)`);
    assert.deepEqual([x.wave0, x.state0, x.wave1, x.state1], [i * 2 + 1, 'active', i * 2 + 2, 'active'], `${x.id}: its two waves`);
    if (i < r.floor.length - 1) {
      assert.equal(x.then, 'exit', `${x.id}: cleared, its exit open`);
      assert.ok(x.walk >= 0, `${x.id}: walking into the exit goes on`);
    }
    if (i > 0) assert.ok(r.rooms[i - 1].notes.some((t) => t.includes(`第 ${i + 1} 間房`)), r.rooms[i - 1].notes.join(' / '));
  });
  assert.equal(r.done, 'done', 'the last room’s last wave: the run is cleared');
  assert.equal(r.wave, r.floor.length * 2, 'every wave of every room');
  assert.equal(r.lastLocked, true, 'the last room’s exit stays shut (the floor ends there)');
});

test('one screen in every room: its four inner corners on the screen in every view, the player at its entry, at its exit or in a corner, in bullet time or not; the exit reachable from the start', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFloor();
    const V = g.camera.position.constructor;
    const out = [];
    for (const id of Object.keys(g.rooms)) {
      g.level.load(g.rooms[id]);
      g.applyMapView();
      const L = g.level;
      const { halfW: w, halfD: d } = L.bounds;
      const corners = [[-w, -d], [w, -d], [-w, d], [w, d]];
      const places = [[L.start.x, L.start.z], [L.exit.at.x, L.exit.at.z], ...corners.map(([x, z]) => [x * 0.85, z * 0.85])];
      let worst = 0;
      let where = '';
      for (let view = 0; view < 3; view++) {
        g.view = view;
        for (const [px, pz] of places) {
          for (const focus of [0, 1]) {
            g.player.x = px;
            g.player.z = pz;
            g.aimPoint.set(px, 0, pz);
            g.focusAmt = focus;
            g.updateCamera(1, true);
            g.camera.updateMatrixWorld();
            for (const [x, z] of corners) {
              const v = new V(x, 0, z).project(g.camera);
              const m = Math.max(Math.abs(v.x), Math.abs(v.y));
              if (m > worst) {
                worst = m;
                where = `view ${view}, the player at ${px.toFixed(1)},${pz.toFixed(1)}${focus ? ', bullet time' : ''}`;
              }
            }
          }
        }
      }
      g.focusAmt = 0;
      const path = L.nav.findPath(L.start.x, L.start.z, L.exit.at.x, L.exit.at.z);
      out.push({ id, worst, where, path: !!path && path.length > 0, tables: L.fixtures.filter((f) => f.kind === 'table').map((f) => `${f.x},${f.z}`).join(' ') });
    }
    g.view = 2;
    window.toFloor();
    return out;
  });
  assert.ok(r.length >= 3, `${r.length} rooms`);
  for (const o of r) {
    assert.ok(o.worst <= 0.97, `${o.id}: a corner at ${o.worst.toFixed(2)} of the screen’s half (${o.where})`);
    assert.equal(o.path, true, `${o.id}: a way from its start to its exit`);
  }
  assert.equal(new Set(r.map((o) => o.tables)).size, r.length, `each room its own tables: ${r.map((o) => `${o.id}: ${o.tables}`).join(' | ')}`);
});

test('the replay’s revision byte counts the rooms’ revisions with the maps’ (maps.js MAPS_REV)', () => {
  const rooms = Object.values(ROOMS).reduce((s, m) => s + m.rev, 0);
  assert.ok(rooms >= 3, `the rooms’ revisions: ${rooms}`);
  assert.equal(MAPS_REV, (MAPS.reduce((s, m) => s + m.rev, 0) + rooms + PLAY_REV) % 256);
});

test('screenshots: the teahouse cleared, its exit open and the player on his way to it; the floor’s other two rooms in a wave', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toFloor();
    window.nextWave();
    window.clearWave();
    window.nextWave();
    window.clearWave();
    const ex = g.level.exit;
    window.stand(ex.at.x + 1.5, ex.at.z + 3.5);
    g.player.facing = Math.PI;
    window.step(30);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('floor-exit.png', OUT).pathname });
  for (let room = 0; room < 2; room++) {
    // out of the open exit, into the next room, a wave on
    const id = await page.evaluate(() => {
      const g = window.game;
      const ex = g.level.exit;
      window.stand(ex.at.x, ex.at.z);
      window.step();
      window.throughFade();
      window.nextWave();
      window.step(120 * 4);
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      g.render();
      return g.level.map.id;
    });
    await page.screenshot({ path: new URL(`floor-${id}.png`, OUT).pathname });
    // its two waves down: its exit open for the next
    await page.evaluate(() => {
      window.clearWave();
      window.nextWave();
      window.clearWave();
    });
  }
  assert.deepEqual(problems(logs), []);
});
