// Every map must be playable as data: the start and spawns clear of cover,
// props not inside walls or each other, pads reachable, and nearly all open
// ground connected. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open());
});
after(async () => {
  await h.close();
});

const mapCount = () => page.evaluate(() => window.game.maps.length);

function validate(i) {
  return page.evaluate((i) => {
    const g = window.game;
    g.frame = () => {};
    g.level.load(g.maps[i]);
    g.applyMapView();
    const L = g.level;
    const issues = [];
    const overlapsSolid = (x, z, r) => {
      for (const s of L.solids) {
        if (!s.alive) continue;
        let hit;
        if (s.poly) hit = L.collideCircle.call({ solids: [s] }, { x, z }, r);
        else {
          const cx = Math.max(s.minX, Math.min(x, s.maxX));
          const cz = Math.max(s.minZ, Math.min(z, s.maxZ));
          hit = (cx - x) ** 2 + (cz - z) ** 2 < r * r;
        }
        if (hit) return s;
      }
      return null;
    };
    const st = L.start;
    if (overlapsSolid(st.x, st.z, 0.5)) issues.push('start overlaps a solid');
    for (const sp of L.spawns) {
      if (!L.nav.isWalkable(sp.ex, sp.ez)) issues.push(`spawn entry blocked at ${sp.ex},${sp.ez}`);
      if (!sp.climb && overlapsSolid(sp.x, sp.z, 0.4)) issues.push(`spawn origin overlaps a solid at ${sp.x},${sp.z}`);
      if (!sp.climb && !L.nav.findPath(sp.x, sp.z, sp.ex, sp.ez)) issues.push(`spawn ${sp.x},${sp.z} cannot walk to its entry`);
      if (!L.nav.findPath(st.x, st.z, sp.ex, sp.ez)) issues.push(`no path from the start to the spawn at ${sp.ex},${sp.ez}`);
    }
    for (const p of L.props) {
      const s = overlapsSolid(p.x, p.z, p.r);
      if (s) issues.push(`${p.kind} at ${p.x},${p.z} overlaps ${s.kind} at ${s.minX.toFixed(1)},${s.minZ.toFixed(1)}`);
    }
    for (let a = 0; a < L.props.length; a++) {
      for (let b = a + 1; b < L.props.length; b++) {
        const A = L.props[a];
        const B = L.props[b];
        if (Math.hypot(A.x - B.x, A.z - B.z) < A.r + B.r) issues.push(`props overlap at ${A.x},${A.z} and ${B.x},${B.z}`);
      }
    }
    for (const pad of L.pads) {
      if (overlapsSolid(pad.x, pad.z, 0.8)) issues.push(`pad ${pad.x},${pad.z} overlaps a solid`);
      for (const p of L.props) if (Math.hypot(p.x - pad.x, p.z - pad.z) < 0.8 + p.r) issues.push(`pad ${pad.x},${pad.z} overlaps a prop at ${p.x},${p.z}`);
      if (!L.nav.findPath(st.x, st.z, pad.x, pad.z)) issues.push(`no path to the pad at ${pad.x},${pad.z}`);
    }
    // how much of the open ground can be reached from the start
    const nav = L.nav;
    const total = nav.cols * nav.rows;
    const seen = new Uint8Array(total);
    const s0 = nav.row(st.z) * nav.cols + nav.col(st.x);
    const queue = [s0];
    seen[s0] = 1;
    let reach = 0;
    while (queue.length) {
      const c = queue.pop();
      reach++;
      const cc = c % nav.cols;
      const rr = (c / nav.cols) | 0;
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nc = cc + dc;
        const nr = rr + dr;
        if (nc < 0 || nr < 0 || nc >= nav.cols || nr >= nav.rows) continue;
        const ni = nr * nav.cols + nc;
        if (seen[ni] || nav.blocked[ni]) continue;
        seen[ni] = 1;
        queue.push(ni);
      }
    }
    let open = 0;
    for (let k = 0; k < total; k++) if (!nav.blocked[k]) open++;
    g.player.placeAtStart();
    g.updateCamera(1, true);
    g.render();
    const info = g.renderer.info.render;
    const rendered = { tris: info.triangles, calls: info.calls };
    let tris = 0;
    L.root.traverse((o) => {
      if (!o.isMesh) return;
      tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    });
    return { map: L.map.id, issues, solids: L.solids.length, reach, open, tris: Math.round(tris), rendered, budget: L.map.budget };
  }, i);
}

test('every map validates', async () => {
  const n = await mapCount();
  assert.ok(n >= 4);
  for (let i = 0; i < n; i++) {
    const r = await validate(i);
    await snap(page, `map-${r.map}.png`);
    assert.deepEqual(r.issues, [], `${r.map}: ${r.issues.join('; ')}`);
    assert.ok(r.reach / r.open >= 0.95, `${r.map}: only ${r.reach}/${r.open} open cells reachable from the start`);
    // Senado's own geometry is ~200k (see senado/tests); the web models add
    // 20–60k of props per map (counted per instance, not instanced).
    assert.ok(r.tris < 300000, `${r.map}: ${r.tris} triangles is over the budget`);
    // the render budget in the map data: what one frame costs, all passes included
    console.log(`# ${r.map}: ${r.rendered.tris.toLocaleString('en-US')} triangles, ${r.rendered.calls} draw calls per frame (budget ${r.budget && r.budget.tris.toLocaleString('en-US')} / ${r.budget && r.budget.calls})`);
    assert.ok(r.budget && r.budget.tris > 0 && r.budget.calls > 0, `${r.map} has no render budget in maps.js`);
    assert.ok(r.rendered.tris <= r.budget.tris, `${r.map}: ${r.rendered.tris} rendered triangles per frame, budget ${r.budget.tris}`);
    assert.ok(r.rendered.calls <= r.budget.calls, `${r.map}: ${r.rendered.calls} draw calls per frame, budget ${r.budget.calls}`);
  }
  assert.deepEqual(problems(logs), []);
});

test('a map’s first frame costs the same every load, as it is and under 玻璃之城: no draw call hangs on the effects’ dice (set dressing laid out at random)', { timeout: 600000 }, async () => {
  const n = await mapCount();
  const r = await page.evaluate((n) => {
    const g = window.game;
    g.frame = () => {};
    const out = [];
    for (const variants of [[], ['glassCity']]) {
      for (let i = 0; i < n; i++) {
        g.setRules('normal', variants);
        g.startRun(i);
        g.waves.state = 'done';
        g.enemies.clear();
        const calls = [];
        for (let k = 0; k < 4; k++) {
          g.level.load(g.maps[i]);
          g.applyMapView();
          g.player.placeAtStart();
          g.updateCamera(1, true);
          g.render();
          calls.push(g.renderer.info.render.calls);
        }
        out.push({ map: `${g.maps[i].id} ${variants.join('')}`, calls });
      }
    }
    // the picks take hold at a run's start: one more, without the variant, so the maps load as they are again
    g.setRules('normal', []);
    g.startRun(0);
    g.toTitle();
    return out;
  }, n);
  for (const m of r) assert.equal(new Set(m.calls).size, 1, `${m.map}: ${m.calls.join(', ')} draw calls in four loads`);
  assert.deepEqual(problems(logs), []);
});

/** Solids inside the arena (not the edge walls), as centres and sizes. */
const authoredSolids = (i) =>
  page.evaluate((i) => {
    const g = window.game;
    g.frame = () => {};
    g.level.load(g.maps[i]);
    const { halfW: W, halfD: D } = g.level.bounds;
    return g.level.solids
      .filter((s) => !s.poly && !s.door && s.kind !== 'glass' && s.minX > -W + 0.1 && s.maxX < W - 0.1 && s.minZ > -D + 0.1 && s.maxZ < D - 0.1)
      .map((s) => ({ x: (s.minX + s.maxX) / 2, z: (s.minZ + s.maxZ) / 2, w: s.maxX - s.minX, d: s.maxZ - s.minZ }));
  }, i);

test('the maps with stages are not mirror images of themselves, and each stage is a real, open spot', async () => {
  const n = await mapCount();
  let staged = 0;
  for (let i = 0; i < n; i++) {
    const info = await page.evaluate((i) => {
      const m = window.game.maps[i];
      return { id: m.id, stages: m.stages || null };
    }, i);
    if (!info.stages) continue;
    staged++;
    const solids = await authoredSolids(i);
    // a solid with a twin across the map's centre line (same place mirrored in x, same size) counts as symmetric
    let twins = 0;
    for (const a of solids) {
      if (solids.some((b) => b !== a && Math.abs(a.x + b.x) < 0.3 && Math.abs(a.z - b.z) < 0.3 && Math.abs(a.w - b.w) < 0.3 && Math.abs(a.d - b.d) < 0.3)) twins++;
    }
    assert.ok(twins / solids.length < 0.3, `${info.id}: ${twins} of ${solids.length} pieces of cover have a mirror twin`);
    assert.ok(info.stages.length >= 3, `${info.id}: ${info.stages.length} stages`);
    for (const st of info.stages) {
      assert.ok(st.name && st.en && st.move && Array.isArray(st.at), `${info.id}: a stage has a name, an English name, a move and a spot`);
      const open = await page.evaluate(([x, z]) => {
        const L = window.game.level;
        return Math.abs(x) < L.bounds.halfW && Math.abs(z) < L.bounds.halfD && L.nav.isWalkable(x, z);
      }, st.at);
      assert.ok(open, `${info.id}: the stage ${st.en} at ${st.at} is open ground inside the map`);
    }
    await page.evaluate(() => {
      const g = window.game;
      const { halfW, halfD } = g.level.bounds;
      const cam = g.camera;
      cam.position.set(0, Math.max(halfW, halfD) * 2.35, 0.01);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      g.renderer.render(g.scene, cam);
    });
    await page.screenshot({ path: new URL(`top-${info.id}.png`, OUT).pathname });
  }
  assert.ok(staged >= 2, `${staged} maps carry stages`);
  assert.deepEqual(problems(logs), []);
});
