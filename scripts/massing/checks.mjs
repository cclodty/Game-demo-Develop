// A study's checks against the game (massing/README.md, test/massing.test.mjs).
//
// massing/<id>/checks.json lists what the study measured and how close the
// rebuilt map has to come: { id, what, real, tol, source, game: { type, ... } }.
// Each `game` measurement reads the map's export (assets/maps/<id>.json, plain
// data, kept in step with src/maps.js by test/assets.test.mjs):
//
//   gap     { at: [x, z], axis: 'x' | 'z', water?, over? }  wall to wall through a point: a street's width; with
//           `water` the map's water (export `water`, boxes) is an edge too: a quay from a wall to the harbour;
//           with `over` only walls taller than that many metres count: a street across the guardrails in it
//   height  { at: [x, z] }                   the tallest solid or building over a point
//   ground  { at: [x, z] }                   the ground's height there (the steps' profile; 0 elsewhere)
//   span    { kind, axis }                   how far the solids of one kind reach along an axis (a façade's width)
//   size    { axis: 'w' | 'd' }              the playable area's width or depth
//   value   { path }                         a number in the export, e.g. "fountain.stepsOuter"; an array is summed

const EPS = 1e-9;

function boxes(map) {
  return map.solids.map((s) => ({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2, h: s.h, kind: s.kind }));
}

/** The map's water as boxes (export `water`: { x, z, w, d }). */
function waterBoxes(map) {
  return (map.water || []).map((s) => ({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2 }));
}

function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi + EPS) + xi) inside = !inside;
  }
  return inside;
}

/** How far along (dx, dz) from (x, z) the first wall is: a box side or a building's outline (and the water, `water`), taller than `over`. */
function rayDistance(map, x, z, dx, dz, max = 400, water = false, over = -Infinity) {
  let best = max;
  const walls = boxes(map).filter((b) => b.h > over);
  for (const b of water ? [...walls, ...waterBoxes(map)] : walls) {
    // slab test, from a point outside the box
    let t0 = -Infinity;
    let t1 = Infinity;
    for (const [p, d, lo, hi] of [[x, dx, b.minX, b.maxX], [z, dz, b.minZ, b.maxZ]]) {
      if (Math.abs(d) < EPS) {
        if (p < lo || p > hi) t0 = Infinity;
      } else {
        const a = (lo - p) / d;
        const c = (hi - p) / d;
        t0 = Math.max(t0, Math.min(a, c));
        t1 = Math.min(t1, Math.max(a, c));
      }
    }
    if (t0 <= t1 && t0 > 0) best = Math.min(best, t0);
  }
  for (const bld of map.buildings || []) {
    if (over > -Infinity && !(bld.height > over)) continue;
    const p = bld.footprint;
    for (let i = 0; i < p.length; i++) {
      const [ax, az] = p[i];
      const [bx, bz] = p[(i + 1) % p.length];
      const ex = bx - ax;
      const ez = bz - az;
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < EPS) continue;
      const t = ((ax - x) * ez - (az - z) * ex) / den;
      const u = ((ax - x) * dz - (az - z) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
    }
  }
  return best;
}

function groundAt(map, z) {
  const P = map.steps && map.steps.profile;
  if (!P || !P.length || z >= P[0].z) return 0;
  for (let i = 1; i < P.length; i++) if (z >= P[i].z) return P[i - 1].height + ((P[i].height - P[i - 1].height) * (P[i - 1].z - z)) / (P[i - 1].z - P[i].z);
  return P[P.length - 1].height;
}

/** One measurement on a map's export. */
export function measure(map, g) {
  switch (g.type) {
    case 'gap': {
      const [x, z] = g.at;
      const [dx, dz] = g.axis === 'x' ? [1, 0] : [0, 1];
      const over = g.over ?? -Infinity;
      return rayDistance(map, x, z, dx, dz, 400, g.water, over) + rayDistance(map, x, z, -dx, -dz, 400, g.water, over);
    }
    case 'height': {
      const [x, z] = g.at;
      let h = 0;
      for (const b of boxes(map)) if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) h = Math.max(h, b.h);
      for (const b of map.buildings || []) if (inPoly(x, z, b.footprint)) h = Math.max(h, b.height);
      return h;
    }
    case 'ground':
      return groundAt(map, g.at[1]);
    case 'span': {
      const of = boxes(map).filter((b) => b.kind === g.kind);
      if (!of.length) return 0;
      const [lo, hi] = g.axis === 'x' ? ['minX', 'maxX'] : ['minZ', 'maxZ'];
      return Math.max(...of.map((b) => b[hi])) - Math.min(...of.map((b) => b[lo]));
    }
    case 'size':
      return g.axis === 'w' ? map.playable.width : map.playable.depth;
    case 'value': {
      const v = g.path.split('.').reduce((o, k) => (o == null ? o : o[k]), map);
      return Array.isArray(v) ? v.reduce((a, b) => a + b, 0) : v;
    }
    default:
      throw new Error(`unknown check type ${g.type}`);
  }
}

/** Every check against the map: [{ id, what, real, tol, value, ok }]. */
export function runChecks(map, checks) {
  return checks.map((c) => {
    const value = measure(map, c.game);
    return { id: c.id, what: c.what, real: c.real, tol: c.tol, value: Math.round(value * 100) / 100, ok: Number.isFinite(value) && Math.abs(value - c.real) <= c.tol + 1e-6 };
  });
}
