// Every map must be playable as data: the start and spawns clear of cover,
// props not inside walls or each other, pads reachable, and nearly all open
// ground connected. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

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
    let tris = 0;
    L.root.traverse((o) => {
      if (!o.isMesh) return;
      tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    });
    return { map: L.map.id, issues, solids: L.solids.length, reach, open, tris: Math.round(tris) };
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
  }
  assert.deepEqual(problems(logs), []);
});
