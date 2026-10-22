// 同一水平 ②: what the player sees is what the aim hits (DECISIONS 2026-10-22).
// On every map, in every zone (and on 大三巴's steps and landings, the way
// between its two), an enemy is put down at a spread of places near the player,
// and a drone, flying 2.5 m up; in each of the three camera views the middle of
// his body as drawn (his feet + 1.1 m, and the middle of the box round his rig;
// a drone's body) goes through the camera to a point on the screen, the mouse
// goes there, and the game's own mouse-to-aim (main.js updateAim) gives the aim
// point: it lies on him, within a shot's reach of his middle; the step's input
// (StepInput, what a replay reads) carries it; and a shot fired at it from the
// player hits him when nothing stands between. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=53'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on map `id`. */
    window.begin = (id) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(g.maps.findIndex((m) => m.id === id));
      g.waves.state = 'done';
      g.setFocus(false);
    };
    /** An enemy of `type` at (x, z), frozen there, drawn where he stands; the player at (px, pz). */
    window.place = (type, x, z, px, pz) => {
      const p = g.player;
      g.enemies.clear();
      g.bullets.clear();
      p.x = px;
      p.z = pz;
      p.vx = p.vz = 0;
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      if (e.cfg.fly) e.y = e.cfg.fly.height;
      e.update = () => {}; // frozen where he was put
      e.sync();
      if (p.sync) p.sync();
      g.updateCamera(1, true);
      g.camera.updateMatrixWorld(true);
      e.rig.root.updateMatrixWorld(true);
      return e;
    };
  });
});
after(async () => {
  await h.close();
});

/**
 * For map `id`: the player at each of `spots` ({ px, pz, at: [[x, z], …] }; by default the middle of each zone, or the
 * map's start when it is in that zone, and the walkable points of a grid round him in that zone), an enemy of `type`
 * at each place; for each view the mouse on the middle of his drawn body.
 */
async function sweep(id, type, spots = null) {
  return page.evaluate(
    async ({ id, type, spots }) => {
      const THREE = await import('three');
      const g = window.game;
      window.begin(id);
      const L = g.level;
      if (!spots) {
        spots = [];
        for (const zn of L.zones) {
          const [x0, z0, x1, z1] = zn.box;
          const [sx, sz] = L.map.start;
          const inZone = L.zoneAt(sx, sz) === zn;
          let px = inZone ? sx : (x0 + x1) / 2;
          let pz = inZone ? sz : (z0 + z1) / 2;
          if (!L.nav.isWalkable(px, pz)) {
            // the nearest walkable point of the zone to its middle
            let best = Infinity;
            for (let x = x0; x <= x1; x += 1) for (let z = z0; z <= z1; z += 1) if (L.nav.isWalkable(x, z) && Math.hypot(x - px, z - pz) < best) [best, px, pz] = [Math.hypot(x - px, z - pz), x, z];
          }
          const at = [];
          for (let dx = -10; dx <= 10; dx += 2.5) for (let dz = -6; dz <= 6; dz += 3) if ((dx || dz) && L.zoneAt(px + dx, pz + dz) === zn) at.push([px + dx, pz + dz]);
          spots.push({ zone: zn.id, px, pz, at });
        }
      }
      const out = { zones: spots.length, placed: {}, tried: 0, missed: [], unrecorded: [], shots: 0, shotMissed: [] };
      const box = new THREE.Box3();
      const mid = new THREE.Vector3();
      const cmd = new g.cmd.constructor(); // a step's input, as the game latches it (input.js StepInput)
      for (const { zone, px, pz, at } of spots) {
        for (let view = 0; view < 3; view++) {
          g.view = view;
          for (const [ex, ez] of at) {
            if (!L.nav.isWalkable(ex, ez)) continue;
            if (!view) out.placed[zone] = (out.placed[zone] || 0) + 1;
            const e = window.place(type, ex, ez, px, pz);
            box.setFromObject(e.rig.root).getCenter(mid);
            // the middle of his body: his feet + 1.1 m (a drone's: its body), and the middle of the box round his rig
            const middles = [e.cfg.fly ? mid.clone() : new THREE.Vector3(e.x, L.groundY(e.x, e.z) + 1.1, e.z), mid.clone()];
            let aimed = false;
            for (const [k, m] of middles.entries()) {
              const s = m.project(g.camera);
              if (Math.abs(s.x) > 0.95 || Math.abs(s.y) > 0.95 || s.z > 1) continue; // off the screen
              aimed = true;
              g.input.mouse.x = ((s.x + 1) / 2) * innerWidth;
              g.input.mouse.y = ((1 - s.y) / 2) * innerHeight;
              g.input.usingPad = false;
              g.updateAim();
              out.tried++;
              const reach = e.radius + 0.16; // a player shot meets an enemy this close to his middle (bullets.js)
              const off = Math.hypot(g.aimPoint.x - e.x, g.aimPoint.z - e.z);
              if (off > reach) out.missed.push({ zone, view, at: [ex, ez], by: k ? 'box' : 'body', off: Math.round(off * 100) / 100 });
              // the step's input carries it (2 cm steps): what is recorded, and what a replay plays
              const c = g.input.latch(cmd, g.aimPoint, px, pz, g.camYaw);
              if (Math.hypot(c.aim.x - e.x, c.aim.z - e.z) > reach + 0.03) out.unrecorded.push({ zone, view, at: [ex, ez] });
            }
            // a shot at the aim point from the player, when he was on the screen to aim at and nothing stands between them
            // (no cover, no barrel or pan)
            if (aimed && L.hasLOS(px, pz, ex, ez) && !L.raycastProps(px, pz, ex, ez, null, [])) {
              const len = Math.hypot(g.aimPoint.x - px, g.aimPoint.z - pz) || 1;
              const dirX = (g.aimPoint.x - px) / len;
              const dirZ = (g.aimPoint.z - pz) / len;
              e.hp = 99;
              const hp0 = e.hp;
              const b = g.bullets.spawn({ x: px + dirX * 0.5, z: pz + dirZ * 0.5, dx: dirX, dz: dirZ, speed: 60, owner: 'player', damage: 1 });
              for (let k = 0; k < 120 && b.alive; k++) g.bullets.update(1 / 120);
              out.shots++;
              if (e.hp >= hp0) out.shotMissed.push({ zone, view, at: [ex, ez] });
            }
          }
        }
      }
      g.enemies.clear();
      return out;
    },
    { id, type, spots },
  );
}

for (const id of ['rooftop', 'club', 'docks', 'senado', 'felicidade', 'guia', 'ruins']) {
  test(`${id}: a man and a drone, wherever they stand near the player in each zone, are hit where they are drawn, in all three views`, { timeout: 240000 }, async () => {
    const rs = {};
    for (const type of ['grunt', 'drone']) rs[type] = await sweep(id, type);
    const off = (r) => `${r.missed.length} of ${r.tried} aimed off him, ${r.shotMissed.length} of ${r.shots} shots missed`;
    for (const [type, r] of Object.entries(rs)) {
      assert.equal(Object.keys(r.placed).length, r.zones, `${type}: in every zone`);
      for (const [zone, n] of Object.entries(r.placed)) assert.ok(n >= 8, `${type}: enough places in ${zone} (${n})`);
      assert.ok(r.tried >= 8 * 3, `${type}: and on the screen (${r.tried})`);
      assert.ok(r.shots > 0);
    }
    for (const [type, r] of Object.entries(rs)) {
      assert.deepEqual(r.missed, [], `${type}: the aim point lies on him every time (grunt: ${off(rs.grunt)}; drone: ${off(rs.drone)})`);
      assert.deepEqual(r.unrecorded, [], `${type}: and the step's input carries it`);
      assert.deepEqual(r.shotMissed, [], `${type}: and the shot hits (grunt: ${off(rs.grunt)}; drone: ${off(rs.drone)})`);
    }
    assert.deepEqual(problems(logs), []);
  });
}

test('大三巴’s steps and landings, the way between its two zones: a man beside the player on them is hit where he is drawn', { timeout: 240000 }, async () => {
  // on the lower flight, on each landing and on the top flight (the ground there rises with z only: one level across)
  const spots = [6.5, 2.5, -1.5, -5.5, -9.5].map((pz) => ({ zone: `steps z ${pz}`, px: 0, pz, at: [-8, -4, 4, 8].map((dx) => [dx, pz]) }));
  const rs = {};
  for (const type of ['grunt', 'drone']) rs[type] = await sweep('ruins', type, spots);
  const off = (r) => `${r.missed.length} of ${r.tried} aimed off him, ${r.shotMissed.length} of ${r.shots} shots missed`;
  for (const [type, r] of Object.entries(rs)) {
    assert.ok(Object.values(r.placed).reduce((a, b) => a + b, 0) >= 16, `${type}: places on the steps (${JSON.stringify(r.placed)})`);
    assert.ok(r.tried >= 16 * 3, `${type}: and on the screen (${r.tried})`);
  }
  for (const [type, r] of Object.entries(rs)) {
    assert.deepEqual(r.missed, [], `${type}: the aim point lies on him every time (grunt: ${off(rs.grunt)}; drone: ${off(rs.drone)})`);
    assert.deepEqual(r.unrecorded, [], `${type}: and the step's input carries it`);
    assert.deepEqual(r.shotMissed, [], `${type}: and the shot hits (grunt: ${off(rs.grunt)}; drone: ${off(rs.drone)})`);
  }
  assert.deepEqual(problems(logs), []);
});

/** Put the mouse on the middle of `e` as drawn, aim, and draw the frame. */
async function aimAndShow(setup) {
  await page.evaluate(async (setup) => {
    const THREE = await import('three');
    const g = window.game;
    window.begin('ruins');
    g.view = setup.view;
    const e = window.place(setup.type, setup.x, setup.z, setup.px, setup.pz);
    const mid = new THREE.Box3().setFromObject(e.rig.root).getCenter(new THREE.Vector3()).project(g.camera);
    g.input.mouse.x = ((mid.x + 1) / 2) * innerWidth;
    g.input.mouse.y = ((1 - mid.y) / 2) * innerHeight;
    g.updateAim();
    g.updatePlay(1 / 60);
    g.present(1 / 60);
    g.render();
  }, setup);
}

test('screenshots: the mouse on a drone over 大三巴’s terrace, and on a man on its steps', async () => {
  await aimAndShow({ type: 'drone', view: 2, x: 4, z: -18, px: -2, pz: -16 });
  await page.screenshot({ path: new URL('aim-drone.png', OUT).pathname });
  await aimAndShow({ type: 'grunt', view: 0, x: 5, z: 2.5, px: -1, pz: 2.5 });
  await page.screenshot({ path: new URL('aim-steps.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
