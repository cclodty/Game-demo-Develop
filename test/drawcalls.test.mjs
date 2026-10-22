// 合併繪製次數 ①: the rooftop (about 1,450 draw calls a frame) and the docks
// (about 1,950) down to 600 or fewer, so weaker machines and phones keep up.
// Most of it was made props: a crate, a container or a gas cylinder comes as
// dozens of meshes as exported, every one a draw call with its shadow and its
// outline. When a prop model loads (models.js) its meshes are merged into one
// a material, in the model's own space: it looks the same (its size is checked
// by test/calibration.test.mjs) and costs as many draw calls as it has
// materials. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=5'));
  await page.evaluate(() => (window.game.frame = () => {}));
});
after(async () => {
  await h.close();
});

test('a made prop is one mesh a material: what loads as dozens of meshes is merged when it loads', async () => {
  const r = await page.evaluate(async () => {
    const { ASSETS } = await import('/src/asset-manifest.js');
    const { propModel } = await import('/src/models.js');
    const rows = [];
    for (const [id, a] of Object.entries(ASSETS)) {
      if (a.kind !== 'prop') continue;
      const m = propModel(id);
      if (!m) continue;
      let meshes = 0;
      const mats = new Set();
      m.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        mats.add(o.material);
      });
      rows.push({ id, meshes, materials: mats.size });
    }
    return rows;
  });
  if (!r.length) return; // ?models=off or no prop models: nothing to merge
  for (const p of r) assert.equal(p.meshes, p.materials, `${p.id}: ${p.meshes} meshes for ${p.materials} materials`);
  assert.ok(r.some((p) => p.id === 'crate') && r.some((p) => p.id === 'container'), `the crate and the container are among them: ${r.map((p) => p.id)}`);
  assert.deepEqual(problems(logs), []);
});

test('the rooftop and the docks draw their first frame in 600 calls or fewer from the default camera', { timeout: 120000 }, async () => {
  const rows = [];
  for (const id of ['rooftop', 'docks']) {
    rows.push(
      await page.evaluate((id) => {
        const g = window.game;
        g.view = 2;
        g.setMode('arcade');
        g.setRules('normal', []);
        g.startRun(g.maps.findIndex((m) => m.id === id));
        g.waves.state = 'done';
        g.enemies.clear();
        g.updatePlay(1 / 60);
        g.updateCamera(1, true);
        g.hud.update(1 / 60);
        g.render();
        return { id, calls: g.renderer.info.render.calls, budget: g.level.map.budget.calls };
      }, id),
    );
    await page.screenshot({ path: new URL(`drawcalls-${id}.png`, OUT).pathname });
  }
  for (const r of rows) {
    assert.ok(r.calls <= 600, `${r.id}: ${r.calls} draw calls`);
    assert.ok(r.budget <= 600, `${r.id}: its budget (${r.budget}) is 600 or fewer`);
  }
  assert.deepEqual(problems(logs), []);
});
