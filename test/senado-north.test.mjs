// Largo do Senado's north end (試玩回饋 ②): up the square the player went
// behind the buildings. The fade across the avenue covers only what stands
// outside the play area, and the cut-away's hole is sized for cover, not for
// 17 m facades. Now every building is numbered (its vertices carry the
// number), and each frame the ones that come within 6 m of the line from the
// player to the camera, on the camera's side and taller than that line, are
// seen through whole above 1.2 m (maps.js `fade.follow`, level.js updateFade).
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

// north of the fountain, up the narrow part, and Largo de S. Domingos at the top
const POINTS = { fountain: [0, 24], narrow: [1, -30], domingos: [-6, -62] };

/**
 * With the player at each point in each view: the buildings faded, and every building the line
 * from the camera to the player's chest crosses above the fade height, with whether it is faded.
 */
const look = (page, shoot = null) =>
  (async () => {
    const out = {};
    for (const [name, [x, z]] of Object.entries(POINTS)) {
      for (const view of [0, 1, 2]) {
        out[`${name}/${view}`] = await page.evaluate(
          ([x, z, view]) => {
            const g = window.game;
            g.frame = () => {};
            g.view = view;
            if (g.level.map.id !== 'senado') g.startRun(3);
            g.waves.state = 'done';
            g.enemies.clear();
            g.player.x = x;
            g.player.z = z;
            g.player.vx = g.player.vz = 0;
            g.updatePlay(1 / 60);
            g.updateCamera(1, true);
            g.render();
            const info = g.renderer.info.render;
            const cam = g.camera.position.clone();
            const chest = cam.clone().set(x, g.level.groundY(x, z) + 1.2, z);
            const dir = chest.clone().sub(cam);
            const rc = g.raycaster;
            rc.set(cam, dir.clone().normalize());
            rc.far = dir.length();
            const faded = g.level.fadedNow.slice();
            const crossed = rc
              .intersectObject(g.level.root, true)
              .filter((hit) => hit.point.y > g.level.map.fade.above && hit.object.geometry.attributes.aFade)
              .map((hit) => {
                const n = hit.object.geometry.attributes.aFade.getX(hit.face.a);
                return { n, faded: faded.includes(n) && g.level.cut.uFadeSet.value[n] === 1 };
              });
            return { faded, crossed, calls: info.calls, tris: info.triangles, budget: g.level.map.budget };
          },
          [x, z, view],
        );
        if (shoot !== null && view === 2) await page.screenshot({ path: new URL(`senado-north-${name}${shoot}.png`, OUT).pathname });
      }
    }
    return out;
  })();

let styled = null;

test('Senado north: in all three views the line from the camera to the player crosses only buildings seen through, whole; the frame stays in budget', { timeout: 300000 }, async () => {
  const { page, logs } = await h.open('?seed=3');
  try {
    styled = await look(page, '');
    let crossings = 0;
    for (const [where, r] of Object.entries(styled)) {
      assert.deepEqual(r.crossed.filter((c) => !c.faded), [], `${where}: the camera's line to the player crosses a building that is not seen through`);
      crossings += r.crossed.length;
      assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${where}: ${r.calls} draw calls, ${r.tris} triangles (budget ${r.budget.calls} / ${r.budget.tris})`);
    }
    // the line does run through buildings up there (the test is not empty), and they are the ones faded
    assert.ok(crossings >= 5, `${crossings} crossings`);
    assert.ok(styled['domingos/0'].faded.length > 0 && styled['narrow/2'].faded.length > 0);
    // in the open south of the square nothing stands between: nothing fades
    const south = await page.evaluate(() => {
      const g = window.game;
      g.view = 0;
      g.player.x = 2;
      g.player.z = 54;
      g.updateCamera(1, true);
      return g.level.fadedNow.length;
    });
    assert.equal(south, 0);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('Senado north: every building taller than 1.2 m is numbered, all its parts alike; the other maps number nothing and fade nothing', async () => {
  const { page, logs } = await h.open('?seed=3');
  try {
    const r = await page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      g.startRun(3);
      const L = g.level;
      const parts = {}; // building id -> the numbers its meshes carry
      const merged = [];
      let unnumbered = 0;
      L.root.traverse((o) => {
        if (!o.isMesh) return;
        const a = o.geometry.attributes.aFade;
        const u = o.userData;
        if (u.kind === 'building') {
          const set = new Set(a ? Array.from(a.array) : [0]);
          parts[u.id] = [...(parts[u.id] || []), ...set];
          if (u.height > L.map.fade.above && set.has(0)) unnumbered++;
        } else if (u.kind === 'merged' || u.kind === 'rooftops') merged.push({ kind: u.kind, numbered: Array.from(a.array).filter((n) => n > 0).length / a.count });
      });
      const count = L.fadeables.length; // before the other maps load over it
      const others = [0, 1, 2].map((m) => {
        g.startRun(m);
        g.updateCamera(1, true);
        return { fadeables: g.level.fadeables.length, set: Array.from(g.level.cut.uFadeSet.value).filter((v) => v).length };
      });
      return { count, parts: Object.values(parts).map((ns) => new Set(ns).size), unnumbered, merged, others };
    });
    assert.ok(r.count > 60, `${r.count} buildings numbered`);
    assert.deepEqual([...new Set(r.parts)], [1], 'each building: one number on every part');
    assert.equal(r.unnumbered, 0);
    // the merged blocks: every vertex belongs to a building; the rooftop clutter nearly all (a few overhang a footprint)
    for (const m of r.merged) assert.ok(m.numbered > (m.kind === 'merged' ? 0.99 : 0.9), `${m.kind}: ${m.numbered}`);
    assert.deepEqual(r.others, [0, 1, 2].map(() => ({ fadeables: 0, set: 0 })));
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('Senado north: ?style=off sees through the same buildings', { timeout: 300000 }, async () => {
  const { page, logs } = await h.open('?seed=3&style=off');
  try {
    const plain = await look(page, '-plain');
    for (const [where, r] of Object.entries(plain)) {
      assert.deepEqual(r.crossed.filter((c) => !c.faded), [], where);
      if (styled) assert.deepEqual(r.faded, styled[where].faded, `${where}: the same buildings as with the look`);
    }
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
