// 彈幕試驗 ②: the trial's mode, 彈幕試驗 BULLET HELL, played in one room, a
// teahouse (茶樓: the kind found all over Macau, not a real one; no name on
// it). The whole room is on the screen whatever the view and wherever the
// player is (a bullet hell is unfair when the shots come from off the
// screen), one flat floor, dark and grey so the bullets stand out; round
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

test('the menu has 彈幕試驗; its run is in the teahouse whatever map card is picked; its route says so; the other modes keep their places', async () => {
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
  assert.ok(r.card && r.card.includes('彈幕試驗') && r.card.includes('BULLET HELL'), `the card: ${r.card}`);
  assert.deepEqual(r.runs, ['teahouse', 'teahouse', 'teahouse']);
  assert.equal(r.room, '茶樓');
  assert.match(r.route, /^茶樓 → /, 'the floor’s first room the teahouse (彈幕試驗 ⑤: test/floor.test.mjs)');
  assert.match(r.note, /茶樓/, `the maps note: ${r.note}`);
  assert.deepEqual(r.modes, ['arcade', 'endless', 'daily', 'night', 'danmaku'], 'the new mode last: a record’s mode number means what it did');
  assert.deepEqual(r.maps, ['rooftop', 'club', 'docks', 'senado', 'felicidade', 'guia', 'ruins'], 'MAPS as it was: the room is not one of them');
});

test('one screen: in every view, with the player anywhere in the room, in bullet time or not, its four inner corners are on the screen', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const L = g.level;
    const { halfW, halfD } = L.bounds;
    const w = halfW; // the walls stand just outside the bounds (level.js buildEdges)
    const d = halfD;
    const corners = [[-w, -d], [w, -d], [-w, d], [w, d]];
    const places = [[L.start.x, L.start.z], ...corners.map(([x, z]) => [x * 0.85, z * 0.85])];
    const V = g.camera.position.constructor;
    const out = [];
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
          let worst = 0;
          for (const [x, z] of corners) {
            const v = new V(x, 0, z).project(g.camera);
            worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y));
          }
          out.push({ view, at: [px, pz], focus, worst });
        }
      }
      g.focusAmt = 0;
    }
    g.view = 2;
    return out;
  });
  for (const o of r) assert.ok(o.worst <= 0.97, `view ${o.view}, the player at ${o.at.map((v) => v.toFixed(1))}${o.focus ? ', bullet time' : ''}: a corner at ${o.worst.toFixed(2)} of the screen’s half`);
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
