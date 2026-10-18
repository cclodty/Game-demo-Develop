// Largo do Senado's south edge (試玩回饋 ①): every shot fired more than 60 m
// from the centre used to end at once (bullets.js had the map's size fixed at
// 60 m; Senado is 74 m long), and the play area ends in the middle of the
// avenue. The edge stops people (and thrown things), not shots: a shot
// flies on into the street instead of dying at an invisible wall, and a white
// barrier marks where the edge is. The buildings across the avenue, between
// the camera and the square, are seen through above 1.2 m (maps.js `fade`).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** A quiet run on `map` with the player at (x, z), aiming at (ax, az). */
const setup = (page, map, x, z, ax, az, view = 1) =>
  page.evaluate(
    ([map, x, z, ax, az, view]) => {
      const g = window.game;
      g.frame = () => {};
      g.view = view;
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.player.x = x;
      g.player.z = z;
      g.player.vx = g.player.vz = 0;
      g.updateAim = () => {};
      g.aimPoint.set(ax, 1.2, az);
      g.killcamT = g.hitstopT = 0;
    },
    [map, x, z, ax, az, view],
  );

test('Senado: shots fly past the south edge; the player stops at it; the other maps keep their walls', async () => {
  const { page, logs } = await h.open('?seed=3');
  try {
    await setup(page, 3, 4, 70, 4, 90);
    const r = await page.evaluate(() => {
      const g = window.game;
      const D = g.level.bounds.halfD;
      // fire south for half a second, watching how far the shots get
      let far = 0;
      for (let i = 0; i < 60; i++) {
        g.player.hp = 100;
        g.input.mouse.left = i < 30;
        g.aimFresh = true;
        g.updatePlay(1 / 60);
        for (const b of g.bullets.list) if (b.alive && b.owner === 'player') far = Math.max(far, b.z);
      }
      g.input.mouse.left = false;
      // walk south for two seconds
      g.input.keys.add('KeyS');
      for (let i = 0; i < 120; i++) {
        g.player.hp = 100;
        g.updatePlay(1 / 60);
      }
      g.input.keys.delete('KeyS');
      const stood = g.player.z;
      const edges = (m) => {
        g.startRun(m);
        return g.level.solids.filter((s) => s.edge).length;
      };
      // across the south end, past the old 60 m line: east from x -10 at z 68
      g.player.x = -10;
      g.player.z = 68;
      g.aimPoint.set(20, 1.2, 68);
      let east = -99;
      for (let i = 0; i < 30; i++) {
        g.player.hp = 100;
        g.input.mouse.left = i < 10;
        g.aimFresh = true;
        g.updatePlay(1 / 60);
        for (const b of g.bullets.list) if (b.alive && b.owner === 'player') east = Math.max(east, b.x);
      }
      g.input.mouse.left = false;
      return { D, far, east, stood, laser: g.level.rayLength(4, 70, 0, 1, 40), edges: [0, 1, 2, 3].map(edges) };
    });
    assert.ok(r.far > r.D + 5, `a shot flew past the edge at z ${r.D} (to z ${r.far.toFixed(1)})`);
    assert.ok(r.east > 5, `a shot across the south end flies on (to x ${r.east.toFixed(1)})`);
    assert.ok(r.laser > r.D - 70 + 5, `the aim laser runs on past it (${r.laser.toFixed(1)} m)`);
    assert.ok(r.stood <= r.D && r.stood > r.D - 1.5, `the player walked up to the edge and stopped there (z ${r.stood.toFixed(2)})`);
    assert.deepEqual(r.edges, [0, 0, 0, 4], 'only Senado has invisible edges; the other maps have their walls');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('Senado: the buildings across the avenue are seen through in all three views; the other maps fade nothing', async () => {
  const { page, logs } = await h.open('?seed=3');
  try {
    const fades = [];
    for (const view of [0, 1, 2]) {
      await setup(page, 3, 4, 66, 4, 80, view);
      fades.push(
        await page.evaluate(() => {
          const g = window.game;
          for (let i = 0; i < 40; i++) {
            g.player.hp = 100;
            g.input.mouse.left = i < 20;
            g.aimFresh = true;
            g.updatePlay(1 / 60);
          }
          g.input.mouse.left = false;
          g.updateCamera(1, true);
          g.render();
          const c = g.level.cut;
          return { on: c.uFadeOn.value, y: c.uFadeY.value, box: c.uFadeBox.value.toArray(), dir: c.uFadeDir.value.toArray().map((v) => Math.round(v * 100) / 100) };
        }),
      );
      await page.screenshot({ path: new URL(`senado-south-v${view}.png`, OUT).pathname });
    }
    for (const f of fades) assert.deepEqual([f.on, f.y, f.box], [1, 1.2, [26, 74]]);
    assert.deepEqual(fades[0].dir, [0, 1], 'top view: the camera is to the south');
    assert.deepEqual(fades[2].dir, [-0.71, 0.71], 'side view: to the south and a little west');
    const others = await page.evaluate(() => {
      const g = window.game;
      return [0, 1, 2].map((m) => {
        g.startRun(m);
        g.updateCamera(1, true);
        return g.level.cut.uFadeOn.value;
      });
    });
    assert.deepEqual(others, [0, 0, 0]);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
