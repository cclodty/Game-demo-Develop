// The flat look (統一畫風試作): a map with `look: 'flat'` (議事亭前地) is drawn
// like the characters: toon twins on the flat ramp with banded colours, ink
// lines from the edge pass (postfx.js) and a clean cutaway rim. The stats
// panel's 平塗地圖 switch swaps it live; the other maps and ?style=off are
// as before; the lines cost one draw call.
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

/** Load `map` quietly and describe how its world is drawn. */
const lookAt = (page, map, view = 1) =>
  page.evaluate(
    ([map, view]) => {
      const g = window.game;
      g.frame = () => {};
      g.view = view;
      g.startRun(map);
      g.player.hp = 100;
      g.updatePlay(1 / 60);
      g.updateCamera(1, true);
      g.render();
      const st = g.style;
      const kinds = { flat: 0, world: 0, lit: 0 };
      g.level.root.traverse((o) => {
        if (!o.isMesh || o.userData.hull) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m.gradientMap === st.ramps.flat) kinds.flat++;
          else if (m.gradientMap === st.ramps.world) kinds.world++;
          else if (m.isMeshStandardMaterial) kinds.lit++;
        }
      });
      return { flat: st.flatOn, edges: g.post.edges.enabled, soft: g.level.cut.uCutSoft.value, kinds, calls: g.renderer.info.render.calls };
    },
    [map, view],
  );

test('議事亭前地 is drawn flat with ink lines; the other maps keep the world toon', async () => {
  const { page, logs } = await h.open('?seed=5');
  try {
    const shots = [];
    for (const view of [0, 1, 2]) {
      const r = await lookAt(page, 3, view);
      assert.deepEqual([r.flat, r.edges, r.soft], [true, true, 0], `view ${view}: flat, lines on, a clean cutaway rim`);
      assert.ok(r.kinds.flat > 20 && r.kinds.world === 0 && r.kinds.lit === 0, `view ${view}: every lit material has its flat twin (${JSON.stringify(r.kinds)})`);
      await page.screenshot({ path: new URL(`look-senado-v${view}.png`, OUT).pathname });
      shots.push(r.calls);
    }
    for (const map of [0, 1, 2]) {
      const r = await lookAt(page, map);
      assert.deepEqual([r.flat, r.edges, r.soft, r.kinds.flat], [false, false, 1, 0], `map ${map} keeps its look`);
      assert.ok(r.kinds.world > 0);
    }
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('the 平塗地圖 switch swaps the look live; the lines cost one draw call', async () => {
  const { page, logs } = await h.open('?seed=5');
  try {
    const on = await lookAt(page, 3);
    const off = await page.evaluate(() => {
      const g = window.game;
      g.style.set('flatWorld', false);
      g.render();
      return { flat: g.style.flatOn, edges: g.post.edges.enabled, soft: g.level.cut.uCutSoft.value, calls: g.renderer.info.render.calls };
    });
    assert.deepEqual([off.flat, off.edges, off.soft], [false, false, 1]);
    assert.equal(on.calls - off.calls, 1, `the edge pass is one draw call (${on.calls} with it, ${off.calls} without)`);
    const back = await lookAt(page, 3);
    assert.equal(back.kinds.flat, 0, 'a new run with the switch off: the world toon');
    assert.ok(back.kinds.world > 20);
    const again = await page.evaluate(() => {
      const g = window.game;
      g.style.set('flatWorld', true);
      g.render();
      return { flat: g.style.flatOn, edges: g.post.edges.enabled };
    });
    assert.deepEqual(again, { flat: true, edges: true });
    const live = await lookAt(page, 3);
    assert.equal(live.kinds.world, 0);
    await page.evaluate(() => window.game.style.set('flatWorld', true)); // leave the stored choice as it was
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('?style=off: 議事亭前地 in its lit materials, no lines, the soft cutaway rim', async () => {
  const { page, logs } = await h.open('?seed=5&style=off');
  try {
    const r = await lookAt(page, 3);
    assert.deepEqual([r.flat, r.edges, r.soft, r.kinds.flat, r.kinds.world], [false, false, 1, 0, 0]);
    assert.ok(r.kinds.lit > 20);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
