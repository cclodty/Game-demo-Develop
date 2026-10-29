// 彈幕試驗 ②: the trial's mode, 彈幕試驗 BULLET HELL, played in one room, a
// teahouse (茶樓: the kind found all over Macau, not a real one; no name on
// it). The camera follows the player (試玩回饋 ⑥a: before, the whole room was on
// the screen; the rooms grew and the developer wanted the player bigger), one
// flat floor, dark and grey so the bullets stand out; round
// tables are low (they stop bodies; shots and sight pass over until one is
// kicked over: 彈幕試驗 ④, test/flip.test.mjs) and the dim-sum trolleys (the hand trolley's kind, a steamer stack on its
// deck) roll and bowl men over when kicked. The room is data in the room
// template format (src/rooms.js), so a later card can chain rooms. The other
// modes, the maps and the replays are as they were.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=23'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run (whatever map card is picked), nobody about; the player at the start. */
    window.toRoom = (map = 0) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
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
  });
});
after(async () => {
  await h.close();
});

test('the menu has the game’s own mode (子彈芭蕾, once 彈幕試驗); its run is in the teahouse whatever map card is picked; its route says so; the other modes keep their places', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { MODE_IDS } = await import('./src/waves.js');
    const card = document.querySelector('.mode-card[data-mode="danmaku"]');
    g.setMode('danmaku');
    const note = document.getElementById('maps-note').textContent;
    const runs = [0, 3, 6].map((m) => {
      window.toRoom(m);
      return g.level.map.id;
    });
    return {
      card: card && card.textContent,
      runs,
      route: g.routeText(0, 'danmaku'),
      modes: MODE_IDS,
      maps: g.maps.map((m) => m.id),
      room: g.level.map.name,
      note,
    };
  });
  assert.ok(r.card && r.card.includes('子彈芭蕾') && r.card.includes('BULLET BALLET'), `the card (C③: the game's own name): ${r.card}`);
  assert.deepEqual(r.runs, ['teahouse', 'teahouse', 'teahouse']);
  assert.equal(r.room, '茶樓');
  assert.match(r.route, /^茶樓起/, 'the first floor’s first room the teahouse (彈幕試驗 ⑤, C①: test/floor.test.mjs)');
  assert.match(r.note, /茶樓/, `the maps note: ${r.note}`);
  assert.deepEqual(r.modes, ['arcade', 'endless', 'daily', 'night', 'danmaku'], 'the new mode last: a record’s mode number means what it did');
  assert.deepEqual(r.maps, ['rooftop', 'club', 'docks', 'senado', 'felicidade', 'guia', 'ruins'], 'MAPS as it was: the room is not one of them');
});

test('the camera follows the player (試玩回饋 ⑥a): in every view, wherever he is in the room, in bullet time or not, he is near the middle of the screen; in a corner, the far one is off it, and a man there shows as an arrow at the screen’s edge', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const L = g.level;
    const { halfW: w, halfD: d } = L.bounds;
    const corners = [[-w, -d], [w, -d], [-w, d], [w, d]];
    const places = [[L.start.x, L.start.z], ...corners.map(([x, z]) => [x * 0.85, z * 0.85])];
    const V = g.camera.position.constructor;
    const out = [];
    const ndc = (x, z) => {
      const v = new V(x, 0, z).project(g.camera);
      return Math.max(Math.abs(v.x), Math.abs(v.y));
    };
    for (let view = 0; view < 3; view++) {
      g.view = view;
      for (const [px, pz] of places) {
        for (const focus of [0, 1]) {
          g.player.x = px;
          g.player.z = pz;
          g.aimPoint.set(px, 0, pz);
          g.focusAmt = focus; // bullet time zooms in elsewhere
          g.updateCamera(1, true);
          g.camera.updateMatrixWorld();
          out.push({ view, at: [px, pz], focus, player: ndc(px, pz) });
        }
      }
      g.focusAmt = 0;
    }
    // in the north-west corner: the south-east one is off the screen, and a man there is an arrow at its edge
    g.view = 2;
    const [px, pz] = [-w * 0.85, -d * 0.85];
    g.player.x = px;
    g.player.z = pz;
    g.aimPoint.set(px, 0, pz);
    g.updateCamera(1, true);
    g.camera.updateMatrixWorld();
    const far = ndc(w, d);
    const e = g.enemies.spawn('grunt', { x: w - 1, z: d - 1, ex: w - 1, ez: d - 1.1, stay: true });
    e.state = 'move';
    g.hud.update(1 / 60);
    const arrows = [...document.querySelectorAll('#indicators .arrow')].filter((a) => a.style.display === 'block').length;
    g.enemies.clear();
    return { out, far, arrows };
  });
  for (const o of r.out) assert.ok(o.player <= 0.45, `view ${o.view}, the player at ${o.at.map((v) => v.toFixed(1))}${o.focus ? ', bullet time' : ''}: at ${o.player.toFixed(2)} of the screen’s half`);
  assert.ok(r.far > 1, `the far corner off the screen (${r.far.toFixed(2)})`);
  assert.equal(r.arrows, 1, 'the man there an arrow at the edge');
});

test('the teahouse: one flat floor, dark and grey (its mean luminance under 0.2); four point lights; the round tables stop bodies, shots and sight pass over them upright; its doors are where the men come in', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const L = g.level;
    // the floor's texture, as drawn: its mean relative luminance (linear), times the material's colour
    const mat = L.floorMesh.material;
    const img = mat.map.image;
    const px = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * lin(px[i] / 255) + 0.7152 * lin(px[i + 1] / 255) + 0.0722 * lin(px[i + 2] / 255);
    const c = mat.color;
    const lum = (sum / (px.length / 4)) * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    // a table, upright: an enemy bullet fired at it from 3 m flies over it; sight passes; a body does not
    const t = L.map.room.tables[0];
    const [tx, tz, tr] = t;
    const b = g.bullets.spawn({ x: tx - tr - 3, z: tz, dx: 1, dz: 0, speed: 30, owner: 'enemy', damage: 0 });
    for (let i = 0; i < 60 && b.alive; i++) g.bullets.update(1 / 120);
    const over = b.alive || b.x > tx + tr;
    const sight = L.hasLOS(tx - tr - 2, tz, tx + tr + 2, tz);
    const body = !L.nav.isWalkable(tx, tz);
    return {
      zones: L.zones.length,
      flat: [[-5, -4], [5, 4], [0, 0]].every(([x, z]) => L.groundY(x, z) === 0),
      lum,
      lights: L.map.theme.points.length,
      tables: L.map.room.tables.length,
      over,
      body,
      at: b.x,
      sight,
      doors: L.spawns.map((s) => s.kind),
    };
  });
  assert.equal(r.zones, 1);
  assert.equal(r.flat, true);
  assert.ok(r.lum < 0.2, `the floor’s luminance ${r.lum.toFixed(3)}`);
  assert.equal(r.lights, 4, 'four map point lights, as every map (no shader recompiles)');
  assert.ok(r.tables >= 4, `${r.tables} round tables`);
  assert.equal(r.over, true, `a bullet flies over an upright table (at x ${r.at})`);
  assert.equal(r.sight, true, 'so does sight');
  assert.equal(r.body, true, 'a body does not');
  assert.ok(r.doors.length >= 3 && r.doors.every((k) => k === 'door'), `doors: ${r.doors}`);
});

test('a dim-sum trolley: kicked, it rolls across the room and bowls over a man in its way', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const L = g.level;
    const cart = L.tools.find((t) => t.kind === 'trolley');
    const x0 = cart.x;
    const z0 = cart.z;
    // a thug 4 m along the way it goes; the cart kicked at him
    const dir = x0 < 0 ? 1 : -1;
    g.waves.state = 'done';
    const thug = g.enemies.spawn('grunt', { x: x0 + dir * 4, z: z0, ex: x0 + dir * 4, ez: z0 + 0.1, stay: true });
    thug.spawnLock = 0;
    cart.kick(dir, 0);
    let knocked = false;
    for (let i = 0; i < 240; i++) {
      window.step();
      knocked = knocked || thug.stunT > 0 || !thug.alive;
    }
    return { variant: cart.variant, moved: Math.hypot(cart.x - x0, cart.z - z0), knocked, notes: g.notes.events.slice(-6).map((n) => n.text) };
  });
  assert.equal(r.variant, 'dimsum');
  assert.ok(r.moved > 3, `it rolled ${r.moved.toFixed(1)} m`);
  assert.equal(r.knocked, true, 'and bowled him over');
  assert.ok(r.notes.some((t) => t.includes('點心車')), r.notes.join(' / '));
});

test('a wave in 彈幕試驗: the men come in at the teahouse’s doors; two waves in it, six in the run', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    g.waves.wave = 0;
    g.waves.startWave();
    const seen = [];
    for (let i = 0; i < 120 * 8 && seen.length < 3; i++) {
      window.step();
      for (const e of g.enemies.list) if (!seen.includes(e)) seen.push(e);
    }
    const doors = g.level.spawns.map((s) => [s.x, s.z]);
    const fromDoor = seen.every((e) => doors.some(([x, z]) => Math.hypot(e.sp.x - x, e.sp.z - z) < 0.5));
    return { n: seen.length, fromDoor, waves: g.waves.rules.waves, perStage: g.waves.rules.perStage, map: g.level.map.id };
  });
  assert.ok(r.n >= 1, 'men come in');
  assert.equal(r.fromDoor, true, 'at the doors');
  assert.deepEqual([r.waves, r.perStage, r.map], [6, 2, 'teahouse'], 'six waves, two in each room of the floor (test/floor.test.mjs), the teahouse first');
});

test('彈幕試驗 ⑥: the dai pai dong (大排檔) is in the floors’ draw: some floors have it, some do not, never the run’s first room', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { MODES } = await import('./src/waves.js');
    const seed0 = g.fixedSeed;
    const floors = [];
    for (let seed = 1; seed <= 16; seed++) {
      g.fixedSeed = seed;
      window.toRoom();
      floors.push(...g.floors.map((f) => f.slice()));
    }
    g.fixedSeed = seed0;
    return { floors, first: g.floor[0], pool: MODES.danmaku.floor.pool, route: g.routeText(0, 'danmaku'), room: g.rooms.daipaidong && { name: g.rooms.daipaidong.name, en: g.rooms.daipaidong.en } };
  });
  assert.deepEqual(r.room, { name: '大排檔', en: 'DAI PAI DONG' });
  assert.ok(r.pool.includes('daipaidong'), `the pool: ${r.pool}`);
  const withIt = r.floors.filter((f) => f.includes('daipaidong')).length;
  assert.ok(withIt > 0 && withIt < r.floors.length, `${withIt} of ${r.floors.length} floors have it: ${r.floors.map((f) => f.join('>')).join(' | ')}`);
  assert.ok(r.floors.every((f) => f.length - 1 >= 3 && f.length - 1 <= 4), 'three or four fight rooms a floor, before its boss room (D①)');
  assert.equal(r.first, 'teahouse', 'the run’s first room the teahouse');
  assert.match(r.route, /大排檔/, r.route);
});

test('彈幕試驗 ⑥: the dai pai dong: a street floor, dark (its mean luminance under 0.2); folding tables that flip as the teahouse’s do, plastic stools round them; LPG cylinders that jet off when kicked; the stall’s counter, solid, under an iron roof; four point lights', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    g.level.load(g.rooms.daipaidong);
    g.applyMapView();
    g.player.placeAtStart();
    const L = g.level;
    const mat = L.floorMesh.material;
    // the floor's texture copied to a canvas of the test's own (the asphalt's own canvas has been read once already,
    // when its grain was drawn: a second read of it makes Chrome warn)
    const img = mat.map.image;
    const copy = document.createElement('canvas');
    copy.width = img.width;
    copy.height = img.height;
    const cx = copy.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const px = cx.getImageData(0, 0, img.width, img.height).data;
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * lin(px[i] / 255) + 0.7152 * lin(px[i + 1] / 255) + 0.0722 * lin(px[i + 2] / 255);
    const c = mat.color;
    const lum = (sum / (px.length / 4)) * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    const tables = L.fixtures.filter((f) => f.kind === 'table');
    // a folding table, kicked over: a wall, as the teahouse's
    const t = tables[0];
    const flipped = t.flip(t.x, t.z + 2);
    const wall = L.solids.some((s) => s.table === t && s.alive);
    // an LPG cylinder, kicked by the player: it jets off
    const can = L.barrels.find((b) => b.variant === 'lpg' && b.alive);
    const p = g.player;
    p.x = can.x;
    p.z = can.z + can.r + 0.5;
    p.facing = Math.PI; // north, at it
    p.kickCd = 0;
    p.kick();
    const jet = can.rocketT > 0;
    const counter = L.solids.find((s) => s.matKey === 'counter' && !s.low);
    return {
      id: L.map.id,
      floor: L.map.floor,
      lum,
      looks: tables.map((f) => f.look),
      flipped,
      wall,
      lpg: L.barrels.filter((b) => b.variant === 'lpg').length,
      jet,
      counter: counter ? { h: counter.h, w: counter.maxX - counter.minX } : null,
      roof: !!L.root.getObjectByName('stall-roof'),
      stools: !!L.root.getObjectByName('plastic-stools'),
      lights: L.map.theme.points.length,
      zones: L.zones.length,
    };
  });
  assert.equal(r.id, 'daipaidong');
  assert.equal(r.zones, 1, 'one flat floor');
  assert.ok(r.lum < 0.2, `the floor’s luminance ${r.lum.toFixed(3)}`);
  assert.ok(r.looks.length >= 4 && r.looks.every((l) => l === 'folding'), `folding tables: ${r.looks}`);
  assert.equal(r.flipped, true, 'kicked over');
  assert.equal(r.wall, true, 'a wall where it fell');
  assert.ok(r.lpg >= 2, `${r.lpg} LPG cylinders`);
  assert.equal(r.jet, true, 'kicked, one jets off');
  assert.ok(r.counter && r.counter.w >= 4, `the stall’s counter: ${JSON.stringify(r.counter)}`);
  assert.equal(r.roof, true, 'its iron roof');
  assert.equal(r.stools, true, 'plastic stools');
  assert.equal(r.lights, 4, 'four map point lights, as every map');
});

test('screenshot: the dai pai dong in a wave', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom();
    g.level.load(g.rooms.daipaidong);
    g.applyMapView();
    g.player.placeAtStart();
    g.waves.wave = 3;
    g.waves.startWave();
    for (let i = 0; i < 120 * 4; i++) window.step();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('room-daipaidong.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the teahouse in 彈幕試驗', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom();
    g.waves.wave = 2;
    g.waves.startWave();
    for (let i = 0; i < 120 * 4; i++) window.step();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('room-teahouse.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
