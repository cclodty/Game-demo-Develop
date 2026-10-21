// Stages ② (舞台 ②：碼頭與議事亭): the docks and Largo do Senado carry named
// stages for the beats too, laid clear of the boss vehicles' roads; the
// loading-bay shutter stands across the armoured truck's road, so a shutter
// dropped there is smashed open when the truck drives through.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=13'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** One logic step, the player kept whole and out of the way, nobody else about. */
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.enemies.clear();
      g.waves.pending.length = 0;
    };
  });
});
after(async () => {
  await h.close();
});

test('every map carries stages now, each off the boss vehicles’ roads by more than the vehicle’s half width', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const segDist = (px, pz, [ax, az], [bx, bz]) => {
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
    };
    return g.maps.map((m) => {
      const roads = [];
      if (m.boss && m.boss.loop) roads.push({ pts: m.boss.loop, loop: true });
      if (m.boss && m.boss.entry) roads.push({ pts: m.boss.entry, loop: false });
      let nearest = Infinity;
      for (const st of m.stages || []) {
        for (const r of roads) {
          const n = r.loop ? r.pts.length : r.pts.length - 1;
          for (let i = 0; i < n; i++) nearest = Math.min(nearest, segDist(st.at[0], st.at[1], r.pts[i], r.pts[(i + 1) % r.pts.length]));
        }
      }
      return { id: m.id, stages: (m.stages || []).map((s) => s.en), roads: roads.length, nearest };
    });
  });
  assert.equal(r.length, 5);
  for (const m of r) {
    assert.ok(m.stages.length >= 3, `${m.id}: ${m.stages.length} stages`);
    if (m.roads) assert.ok(m.nearest > 1.1, `${m.id}: a stage ${m.nearest.toFixed(2)} m from a vehicle's road`);
  }
  assert.deepEqual(r.find((m) => m.id === 'docks').stages, ['CONTAINER ALLEY', 'LOADING BAY', 'QUAYSIDE', 'WAREHOUSE FRONT']);
  assert.deepEqual(r.find((m) => m.id === 'senado').stages, ['THE FOUNTAIN', 'ST DOMINIC’S', 'THE NARROWS', 'POST OFFICE']);
});

test('the armoured truck smashes through the loading-bay shutter dropped across its road, and the opening is open again', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    // the truck is a kind the docks can ask for (boss.js; the map's default is the heavy gunner now): put it back for this run
    g.maps.find((m) => m.id === 'docks').boss = { kind: 'truck', from: [-30, 0.8], loop: [[-16, 0.8], [16, 0.8], [13, 4.6], [13, 11.3], [-11, 11.3], [-12.5, 8.8], [-16, 5]] };
    g.setRules('normal', []);
    g.setMode('arcade');
    g.startRun(0);
    g.waves.state = 'done';
    g.enemies.clear();
    g.stage = 2;
    g.level.load(g.stageMap);
    g.applyMapView();
    g.player.placeAtStart();
    g.player.x = -20; // by the west fence, off the road
    g.player.z = -11;
    g.waves.wave = 11;
    g.waves.startWave();
    const b = g.boss;
    const L = g.level;
    const shutter = L.fixtures.find((f) => f.kind === 'shutter');
    // the shutter comes down before the truck arrives
    shutter.drop();
    let n = 0;
    while (!shutter.down && n++ < 300) window.step();
    const down = { down: shutter.down, solid: !!shutter.solid, walkable: L.nav.isWalkable(shutter.midX, shutter.midZ) };
    b.chargeT = b.unloadT = b.gunT = 999; // it only drives
    // the truck drives its loop through the loading bay; the shutter is in its way at (13, 7.2)
    n = 0;
    let smashedAt = null;
    while (shutter.down && n++ < 120 * 40) {
      window.step();
      if (!shutter.down) smashedAt = { x: b.x, z: b.z };
    }
    return { map: L.map.id, kind: b.def && b.def.kind, down, after: { down: shutter.down, solid: !!shutter.solid, walkable: L.nav.isWalkable(shutter.midX, shutter.midZ) }, smashedAt, logged: g.notes.events.some((e) => e.text.includes('貨車撞開落下的鐵閘')) };
  });
  assert.deepEqual([r.map, r.kind], ['docks', 'truck']);
  assert.deepEqual(r.down, { down: true, solid: true, walkable: false }, 'the shutter came down and shut the opening');
  assert.deepEqual(r.after, { down: false, solid: false, walkable: true }, 'the truck drove through and the shutter is up');
  assert.ok(r.smashedAt && Math.abs(r.smashedAt.x - 13) < 2 && Math.abs(r.smashedAt.z - 7.2) < 4, `smashed as the truck reached it (${JSON.stringify(r.smashedAt)})`);
  assert.equal(r.logged, true, 'the notes say so');
  assert.deepEqual(problems(logs), []);
});
