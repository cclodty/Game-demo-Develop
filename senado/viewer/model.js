// Builds the Largo do Senado massing model from senado_massing.json.
// Shared by the browser viewer and the GLB exporter, so what you inspect is what you export.
//
// Units: 1 = 1 metre. Three.js axes: X = east, Y = up, Z = south (data y = north becomes -Z).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PALETTE = {
  ground: 0xd6d3cb,
  road: 0x7d7f80,
  footway: 0xc4c0b6,
  green: 0x8fa27a,
  water: 0x7fa7b5,
  stone: 0xe9e4d8,
  core: 0xe0dcd3,
  coreRoof: 0xcdc8be,
  context: 0xc4c7c9,
  trim: 0xf6f3ec,      // white mouldings: seen on every colonial facade around the square
  awning: 0xf3f0e8,    // canvas hoods over the MGTO windows (photos #10, #87)
  glass: 0x2e3539,
  granite: 0xbfa194,   // fountain steps (photos #87, #126)
  stoneGrey: 0x9a968f, // grey granite dressings where a facade spec names no stone colour
  poolGranite: 0xa97563, // pink granite pool wall
  figure: 0xff6a2a,
  calcadaLight: 0xede7d9,
  calcadaDark: 0x3b3b39,
};

// Calçada: bands run parallel to Av. de Almeida Ribeiro (measured from the aligned satellite mosaic).
export const CALCADA = {
  bandAngleDeg: -50,   // band direction, degrees from east (counter-clockwise, data axes); satellite reads 128–131°
  tileAlong: 6.0,      // m, one wave length along a band
  tileAcross: 2.25,    // m, one black + white band pair
};

const toV3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

// Order a triangle counter-clockwise in plan so its normal points up (+Y) after the y -> -Z flip.
function upward(verts, base, t) {
  const [a, b, c] = t.map((i) => verts[i]);
  const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
  return ccw ? [base + t[0], base + t[1], base + t[2]] : [base + t[0], base + t[2], base + t[1]];
}

// ---------- prism (walls + flat roof) with UVs: walls u = perimeter m, v = height m ----------
// opts.bottom adds a downward face at minH (arcade ceilings); opts.roof = false drops the top face;
// opts.skip (Set of outer-ring edge indices) leaves those wall faces out so a wall with window openings can replace them;
// opts.bays switches the wall UVs to the generic window grid (see bayUV).
// Groups: 0 = walls (+ bottom), 1 = roof.
export function prismGeometry(outer, holes, h, minH = 0, opts = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  const walls = (ring, skip) => {
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-3) continue;
      if (skip && skip.has(i)) { run += len; continue; }
      // outward normal for CCW outer rings (holes are CW, so this flips correctly)
      const nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len;
      const base = pos.length / 3;
      const ub = opts.bays ? bayU(len) : 0;
      for (const [p, z, u] of [[a, minH, run], [b, minH, run + len], [b, h, run + len], [a, h, run]]) {
        pos.push(p[0], z, -p[1]);
        nor.push(nx, 0, -ny);
        if (opts.bays) uv.push(u === run ? 0 : ub, bayV(z, h));
        else uv.push(u, z);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      run += len;
    }
  };
  walls(outer, opts.skip);
  holes.forEach((r) => walls(r));
  const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
  const holeV = holes.map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
  const tris = THREE.ShapeUtils.triangulateShape(contour, holeV);
  const all = contour.concat(...holeV);
  if (opts.bottom) {
    const base = pos.length / 3;
    for (const p of all) {
      pos.push(p.x, minH, -p.y);
      nor.push(0, -1, 0);
      uv.push(p.x, p.y);
    }
    for (const t of tris) { const [a, b, c] = upward(all, base, t); idx.push(a, c, b); }
  }
  const wallCount = idx.length;
  if (opts.roof !== false) {
    const base = pos.length / 3;
    for (const p of all) {
      pos.push(p.x, h, -p.y);
      nor.push(0, 1, 0);
      uv.push(p.x, p.y);
    }
    for (const t of tris) idx.push(...upward(all, base, t));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, wallCount, 0);
  g.addGroup(wallCount, idx.length - wallCount, 1);
  return g;
}

// Generic window grid (facade_generic.png): one texture tile is one bay across by one storey high. Each wall gets a
// whole number of bays (walls under 1.5 m show plain wall), and the storeys are counted down from 0.4 m under the
// roof line so the top floor is never cut; whatever is left at the bottom reads as a taller ground floor.
export const GRID = { bay: 3.0, storey: 3.2, top: 0.4 };
const bayU = (len) => { const n = Math.round(len / GRID.bay); return n || 0.1 * len; };
const bayV = (z, top) => (z - (top - GRID.top)) / GRID.storey;

// ---------- flat polygon at a given height, optional calçada UVs ----------
function flatGeometry(polys, y, uvFn) {
  const pos = [], uv = [], idx = [];
  for (const { outer, holes = [] } of polys) {
    const contour = outer.map((p) => new THREE.Vector2(p[0], p[1]));
    const holeV = holes.map((r) => r.map((p) => new THREE.Vector2(p[0], p[1])));
    const tris = THREE.ShapeUtils.triangulateShape(contour, holeV);
    const base = pos.length / 3;
    const verts = contour.concat(...holeV);
    for (const p of verts) {
      pos.push(p.x, y, -p.y);
      const [u, v] = uvFn ? uvFn(p.x, p.y) : [p.x, p.y];
      uv.push(u, v);
    }
    for (const t of tris) idx.push(...upward(verts, base, t));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function calcadaUV(x, y) {
  const a = (CALCADA.bandAngleDeg * Math.PI) / 180;
  const along = x * Math.cos(a) + y * Math.sin(a);
  const across = -x * Math.sin(a) + y * Math.cos(a);
  return [along / CALCADA.tileAlong, across / CALCADA.tileAcross];
}

// ---------- road strips ----------
function stripGeometry(lines, y) {
  const pos = [], idx = [];
  const push = (x, z) => { pos.push(x, y, -z); return pos.length / 3 - 1; };
  for (const { pts, w } of lines) {
    const r = w / 2;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1e-3) continue;
      const nx = (-(by - ay) / len) * r, ny = ((bx - ax) / len) * r;
      const a = push(ax + nx, ay + ny), b = push(bx + nx, by + ny), c = push(bx - nx, by - ny), d = push(ax - nx, ay - ny);
      idx.push(a, d, c, a, c, b);
    }
    // round joints so bends and junctions have no gaps
    for (const [px, py] of pts) {
      const c = push(px, py);
      const seg = 10;
      const first = pos.length / 3;
      for (let k = 0; k <= seg; k++) {
        const t = (k / seg) * Math.PI * 2;
        push(px + Math.cos(t) * r, py + Math.sin(t) * r);
      }
      for (let k = 0; k < seg; k++) idx.push(c, first + k, first + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // strips are wound inconsistently; force an upward normal
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
}

function mergePrisms(geoms) {
  // minimal merge keeping groups: all inputs share the same attribute layout and two groups (walls, roof)
  const attrs = Object.keys(geoms[0].attributes);
  const out = Object.fromEntries(attrs.map((a) => [a, []]));
  const wallIdx = [], roofIdx = [], ranges = [];
  let vOff = 0;
  for (const g of geoms) {
    for (const a of attrs) out[a].push(...g.attributes[a].array);
    const ix = g.index.array;
    const [gw, gr] = g.groups;
    const wStart = wallIdx.length, rStart = roofIdx.length;
    for (let i = gw.start; i < gw.start + gw.count; i++) wallIdx.push(ix[i] + vOff);
    for (let i = gr.start; i < gr.start + gr.count; i++) roofIdx.push(ix[i] + vOff);
    ranges.push({ wStart, wCount: gw.count, rStart, rCount: gr.count });
    vOff += g.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  for (const a of attrs) g.setAttribute(a, new THREE.Float32BufferAttribute(out[a], geoms[0].attributes[a].itemSize));
  g.setIndex(wallIdx.concat(roofIdx));
  g.addGroup(0, wallIdx.length, 0);
  g.addGroup(wallIdx.length, roofIdx.length, 1);
  // triangle -> building lookup for picking
  const triOwner = new Int32Array((wallIdx.length + roofIdx.length) / 3);
  ranges.forEach((r, i) => {
    triOwner.fill(i, r.wStart / 3, (r.wStart + r.wCount) / 3);
    triOwner.fill(i, (wallIdx.length + r.rStart) / 3, (wallIdx.length + r.rStart + r.rCount) / 3);
  });
  return { geometry: g, triOwner };
}

// Per-vertex colour by group (0 = walls, 1 = roof), so one material can carry many building colours.
function paint(g, cols) {
  const col = new Float32Array(g.attributes.position.count * 3);
  const ix = g.index.array;
  g.groups.forEach((grp, gi) => {
    const c = cols[Math.min(gi, cols.length - 1)];
    for (let i = grp.start; i < grp.start + grp.count; i++) col.set([c.r, c.g, c.b], ix[i] * 3);
  });
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// Stable per-building randomness (FNV-1a seed, mulberry32 stream): the same OSM id always gets the same result.
export function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
export function rng(seed) {
  let a = Math.floor(hash01(seed) * 4294967296);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- pitched roofs ----------
// Gable: the ridge runs along shape.axis through shape.c; the roof falls linearly from eave + rise at the ridge to the
// eave at halfWidth (default: the farthest footprint vertex on that side) and stays at the eave beyond it.
export function gableProfile(outer, shape) {
  const { eave, rise, axis, c } = shape;
  const n = [axis[1], -axis[0]];                               // across the ridge
  const dOf = (p) => (p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1];
  const ds = outer.map(dOf);
  const hwR = shape.halfWidth ?? Math.max(...ds), hwL = shape.halfWidth ?? -Math.min(...ds);
  const zAt = (d) => eave + rise * Math.max(0, d >= 0 ? 1 - d / hwR : 1 + d / hwL);
  return { n, dOf, zAt, cuts: [-hwL, 0, hwR], slope: [0, rise / hwL, -rise / hwR, 0] };
}

// Keep the part of a polygon where sign * (d - k) >= 0 (Sutherland–Hodgman against one line; keeps the winding).
function clipStrip(poly, dOf, k, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = sign * (dOf(a) - k), fb = sign * (dOf(b) - k);
    if (fa >= 0) out.push(a);
    if ((fa > 0 && fb < 0) || (fa < 0 && fb > 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out.filter((p, i) => Math.hypot(p[0] - out[(i + 1) % out.length][0], p[1] - out[(i + 1) % out.length][1]) > 1e-6);
}

// The footprint is cut into strips at the ridge and eave lines, so every strip is one plane. Footprint edges whose
// roof line rises above the eave get a vertical gable-end wall. Groups: 0 = gable ends, 1 = roof slopes.
export function gableGeometry(outer, shape) {
  const P = gableProfile(outer, shape);
  const { dOf, zAt, cuts } = P;
  const eave = shape.eave;
  const pos = [], nor = [], uv = [], wallIdx = [], roofIdx = [];
  const bounds = [-Infinity, ...cuts, Infinity];
  for (let k = 0; k < bounds.length - 1; k++) {
    let poly = outer;
    if (bounds[k] > -Infinity) poly = clipStrip(poly, dOf, bounds[k], 1);
    if (bounds[k + 1] < Infinity) poly = clipStrip(poly, dOf, bounds[k + 1], -1);
    if (poly.length < 3) continue;
    // roof plane of this strip
    const g = P.slope[k];
    const nl = Math.hypot(g, 1);
    const [nx, nyUp, nz] = [(-g * P.n[0]) / nl, 1 / nl, (g * P.n[1]) / nl];
    const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    let base = pos.length / 3;
    for (const p of poly) {
      pos.push(p[0], zAt(dOf(p)), -p[1]);
      nor.push(nx, nyUp, nz);
      uv.push(p[0], p[1]);
    }
    for (const t of tris) roofIdx.push(...upward(contour, base, t));
    // gable ends along the footprint boundary (edges lying on a cut line are inside the roof)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const da = dOf(a), db = dOf(b);
      if (cuts.some((c) => Math.abs(da - c) < 1e-6 && Math.abs(db - c) < 1e-6)) continue;
      const za = zAt(da), zb = zAt(db);
      if (Math.max(za, zb) - eave < 1e-3) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-4) continue;
      const tx = (b[0] - a[0]) / len, ty = (b[1] - a[1]) / len;
      base = pos.length / 3;
      for (const [p, z] of [[a, eave], [b, eave], [b, zb], [a, za]]) {
        pos.push(p[0], z, -p[1]);
        nor.push(ty, 0, tx);                                   // outward (ty, -tx) in data axes, Z flipped
        uv.push((p[0] * tx + p[1] * ty) / GRID.bay, bayV(z, eave));
      }
      if (zb - eave > 1e-3) wallIdx.push(base, base + 1, base + 2);
      if (za - eave > 1e-3) wallIdx.push(base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(wallIdx.concat(roofIdx));
  geo.addGroup(0, wallIdx.length, 0);
  geo.addGroup(wallIdx.length, roofIdx.length, 1);
  return geo;
}

// Walls and roof of a building without a facade spec: flat or gable roof, generic window grid UVs, vertex colours.
export function massGeometry(b, wallCol, roofCol) {
  const shape = b.roof && b.roof.shape;
  const body = prismGeometry(b.outer, b.holes, shape ? shape.eave : b.h, b.minH, { roof: !shape, bays: true });
  const g = shape ? mergePrisms([body, gableGeometry(b.outer, shape)]).geometry : body;
  return paint(g, [wallCol, roofCol]);
}

// ---------- rooftop clutter: stair/lift housings and water tanks on flat roofs ----------
// Not surveyed one by one: sizes follow the satellite image (most flat roofs carry a stair housing and one to three
// tanks); positions are random but stable per OSM id and keep clear of the roof edge.
const TANK_COLORS = [[0xb8bec3, 3], [0x4a78b0, 2], [0xe8e8e4, 2]];   // stainless, blue plastic, white plastic
const ringArea = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
export function pointIn(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function edgeClearance(p, rings) {
  let d = Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      d = Math.min(d, Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]));
    }
  }
  return d;
}

export const newColorSink = () => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
function sinkQuad(s, a, b, z0, z1, c) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len;
  const base = s.pos.length / 3;
  for (const [p, z] of [[a, z0], [b, z0], [b, z1], [a, z1]]) {
    s.pos.push(p[0], z, -p[1]); s.nor.push(nx, 0, -ny); s.uv.push(0, 0); s.col.push(c.r, c.g, c.b);
  }
  s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function sinkPrism(s, ring, z0, z1, side, top) {
  for (let i = 0; i < ring.length; i++) sinkQuad(s, ring[i], ring[(i + 1) % ring.length], z0, z1, side);
  const base = s.pos.length / 3;
  const v = ring.map((p) => new THREE.Vector2(p[0], p[1]));
  for (const p of ring) { s.pos.push(p[0], z1, -p[1]); s.nor.push(0, 1, 0); s.uv.push(0, 0); s.col.push(top.r, top.g, top.b); }
  for (let i = 1; i < ring.length - 1; i++) s.idx.push(...upward(v, base, [0, i, i + 1]));   // convex: fan
}

export function rooftopClutter(b, wallCol, roofCol, sink, tanks) {
  if ((b.roof && b.roof.shape) || b.h < 6) return;
  const rings = [b.outer, ...b.holes];
  const area = ringArea(b.outer) + b.holes.reduce((s, r) => s + ringArea(r), 0);
  if (area < (tanks ? 50 : 80)) return;
  const R = rng(`${b.id}:roof`);
  let lx = 0, ly = 0, best = 0;                                // align with the longest wall
  for (let i = 0; i < b.outer.length; i++) {
    const a = b.outer[i], q = b.outer[(i + 1) % b.outer.length];
    const L = Math.hypot(q[0] - a[0], q[1] - a[1]);
    if (L > best) { best = L; lx = (q[0] - a[0]) / L; ly = (q[1] - a[1]) / L; }
  }
  const xs = b.outer.map((p) => p[0]), ys = b.outer.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const placed = [];
  const spot = (clear) => {
    for (let k = 0; k < 24; k++) {
      const p = [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)];
      if (!pointIn(p, b.outer) || b.holes.some((h) => pointIn(p, h))) continue;
      if (edgeClearance(p, rings) < clear + 0.3) continue;
      if (placed.some(([q, r]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < clear + r + 0.3)) continue;
      return p;
    }
    return null;
  };
  // stair / lift housing, 2.6 x 3.6 m, 2.8 m high, in the wall colour
  const c = spot(2.2);
  if (c) {
    const hw = 1.3, hd = 1.8, vx = -ly, vy = lx;
    const ring = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => [c[0] + lx * u + vx * v, c[1] + ly * u + vy * v]);
    sinkPrism(sink, ring, b.h, b.h + 2.8, wallCol.clone().multiplyScalar(0.93), roofCol);
    placed.push([c, 2.2]);
  }
  if (!tanks || area < 80) return;
  const total = TANK_COLORS.reduce((s, [, w]) => s + w, 0);
  const n = 1 + Math.floor(R() * 3);
  for (let k = 0; k < n; k++) {
    const p = spot(0.7);
    if (!p) break;
    let t = R() * total, hex = TANK_COLORS[0][0];
    for (const [h, w] of TANK_COLORS) { t -= w; if (t <= 0) { hex = h; break; } }
    const col = new THREE.Color(hex);
    const ring = Array.from({ length: 8 }, (_, i) => [p[0] + 0.7 * Math.cos((i * Math.PI) / 4), p[1] + 0.7 * Math.sin((i * Math.PI) / 4)]);
    sinkPrism(sink, ring, b.h, b.h + 1.4, col, col);
    placed.push([p, 0.7]);
  }
}

export function colorSinkGeometry(s) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setIndex(s.idx);
  return g;
}

// ---------- facade periphery: arcades (騎樓), entablature, string courses, pilasters, cornice, parapet ----------
// Everything here is driven by b.facade, which build_data.py copies from the photo-based specs in landmarks.json.

export function edgeFrame(ring, i) {
  const a = ring[i], b = ring[(i + 1) % ring.length];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  return { a, b, L, u, n: [u[1], -u[0]] };   // n = outward normal of a counter-clockwise ring
}

// Move selected edges of a counter-clockwise ring inward by depth[i]; corners are re-intersected.
export function offsetEdges(ring, depth) {
  const n = ring.length;
  const line = (i) => {
    const { a, u, n: nv } = edgeFrame(ring, i);
    const d = depth.get(i) || 0;
    return { p: [a[0] - nv[0] * d, a[1] - nv[1] * d], u };
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const dp = depth.get(prev) || 0, dc = depth.get(i) || 0;
    if (!dp && !dc) { out.push(ring[i]); continue; }
    const l1 = line(prev), l2 = line(i);
    const cross = l1.u[0] * l2.u[1] - l1.u[1] * l2.u[0];
    if (Math.abs(cross) < 0.08) {
      // nearly straight corner: step between the two depths instead of a far-away intersection
      const v = ring[i];
      const n1 = edgeFrame(ring, prev).n, n2 = edgeFrame(ring, i).n;
      out.push([v[0] - n1[0] * dp, v[1] - n1[1] * dp], [v[0] - n2[0] * dc, v[1] - n2[1] * dc]);
      continue;
    }
    const t = ((l2.p[0] - l1.p[0]) * l2.u[1] - (l2.p[1] - l1.p[1]) * l2.u[0]) / cross;
    out.push([l1.p[0] + l1.u[0] * t, l1.p[1] + l1.u[1] * t]);
  }
  return out;
}

// Local frame for one wall: X along the wall, Y up, Z outward (right-handed, so windings survive).
function edgeMatrix(f, outShift = 0) {
  const u3 = new THREE.Vector3(f.u[0], 0, -f.u[1]);
  const o3 = new THREE.Vector3(f.n[0], 0, -f.n[1]);
  const m = new THREE.Matrix4().makeBasis(u3, new THREE.Vector3(0, 1, 0), o3);
  m.setPosition(f.a[0] + f.n[0] * outShift, 0, -(f.a[1] + f.n[1] * outShift));
  return m;
}

// Box along a wall: s0..s1 along it, z0..z1 high, from `inn` behind the wall line to `out` in front of it.
function wallBox(f, s0, s1, z0, z1, out, inn) {
  const g = new THREE.BoxGeometry(s1 - s0, z1 - z0, out + inn);
  g.translate((s0 + s1) / 2, (z0 + z1) / 2, (out - inn) / 2);
  return g.applyMatrix4(edgeMatrix(f));
}

// Bay layout shared by the arcade and the pilasters above it: end piers of width `pier`, n equal bays between
// (n from the bay width, or `count` when the photos give it).
export function bayLayout(L, bay, pier, count = 0) {
  const n = count || Math.max(1, Math.round((L - pier) / bay));
  const step = (L - pier) / n;
  return { n, step, piers: Array.from({ length: n + 1 }, (_, k) => pier / 2 + k * step), opening: step - pier };
}

// The arcade front: one wall with n arched openings, cut as a single comb-shaped outline (no holes),
// extruded `thick` m behind the facade line.
export function arcadeScreenGeometry(f, arc) {
  const { piers, opening: w } = bayLayout(f.L, arc.bay, arc.pier);
  const H = arc.height, crown = H - arc.crownMargin;
  const rise = arc.arch === 'flat' ? 0 : Math.min(w / 2, Math.max(0.3, crown - arc.minSpring));
  const spring = crown - rise;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  for (let k = 0; k < piers.length - 1; k++) {
    const l = piers[k] + arc.pier / 2, r = l + w;
    s.lineTo(l, 0);
    s.lineTo(l, spring);
    if (rise > 0) s.absellipse((l + r) / 2, spring, w / 2, rise, Math.PI, 0, true);
    else s.lineTo(r, spring);
    s.lineTo(r, 0);
  }
  s.lineTo(f.L, 0);
  s.lineTo(f.L, H);
  s.lineTo(0, H);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: arc.thick, bevelEnabled: false, curveSegments: 10 });
  return g.applyMatrix4(edgeMatrix(f, -arc.thick));
}

const toFlat = (g) => (g.index ? g.toNonIndexed() : g);
function mergeFlat(geoms) {
  const list = geoms.filter(Boolean).map((g) => {
    const h = toFlat(g);
    for (const k of Object.keys(h.attributes)) if (!['position', 'normal', 'uv'].includes(k)) h.deleteAttribute(k);
    h.clearGroups();
    return h;
  });
  return list.length ? mergeGeometries(list, false) : null;
}

// ---------- windows: openings cut into the facade walls, recessed panes, white dressings ----------
// Wall-local coordinates: s along the wall from its start corner, z up, o outward (negative = into the wall).
// Pane UVs: u counts shutter leaves (two per window), v is metres from the opening's bottom; the louvre and
// glazing textures tile on those.
export const WINDOW_DEFAULTS = { depth: 0.25, surround: 0.18, sill: 0.6 };

// Opening outline, counter-clockwise: flat bottom at z0, total height h, head given by shape. An oculus is a
// circle of diameter w centred at z0 + h / 2.
export function windowOutline(c, z0, w, h, shape, seg = 8, rise = headRise(w, h, shape)) {
  if (shape === 'oculus') {
    return Array.from({ length: 20 }, (_, k) => {
      const a = (k / 20) * Math.PI * 2 - Math.PI / 2;
      return [c + (w / 2) * Math.cos(a), z0 + h / 2 + (w / 2) * Math.sin(a)];
    });
  }
  const l = c - w / 2, r = c + w / 2;
  const spring = z0 + h - rise;
  const pts = [[l, z0], [r, z0], [r, spring]];
  if (rise > 0) {
    const R = (rise * rise + (w / 2) ** 2) / (2 * rise), cz = z0 + h - R;
    const a0 = Math.atan2(spring - cz, w / 2), a1 = Math.PI - a0;
    for (let k = 1; k < seg; k++) {
      const a = a0 + ((a1 - a0) * k) / seg;
      pts.push([c + R * Math.cos(a), cz + R * Math.sin(a)]);
    }
  }
  pts.push([l, spring]);
  return pts;
}
const headRise = (w, h, shape) => (shape === 'round' ? w / 2 : shape === 'segment' ? Math.min(w * 0.2, h * 0.2) : 0);

// Triangles of a counter-clockwise outline in (s, z), optionally with holes, wound to face +o.
function planarFace(contour, holes, o, uvFn, sink) {
  const V = (p) => new THREE.Vector2(p[0], p[1]);
  const all = contour.concat(...holes);
  const tris = THREE.ShapeUtils.triangulateShape(contour.map(V), holes.map((h) => h.map(V)));
  const base = sink.pos.length / 3;
  for (const p of all) {
    sink.pos.push(p[0], p[1], o);
    sink.nor.push(0, 0, 1);
    sink.uv.push(...uvFn(p[0], p[1]));
  }
  for (const t of tris) {
    const [a, b, c] = t.map((i) => all[i]);
    const ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
    sink.idx.push(base + t[0], base + (ccw ? t[1] : t[2]), base + (ccw ? t[2] : t[1]));
  }
}

const newSink = () => ({ pos: [], nor: [], uv: [], idx: [] });
function sinkGeometry(s, m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.setIndex(s.idx);
  return m ? g.applyMatrix4(m) : g;
}

// One facade wall from z0 to z1 (s0 to s1 along it) with its window openings: the wall face plus the reveals
// (jambs, sill, head) running `depth` into the wall. Returned with the prism's two groups (walls, empty roof) so it
// merges with the body.
function holedWall(f, z0, z1, openings, s0 = 0, s1 = f.L) {
  const s = newSink();
  planarFace([[s0, z0], [s1, z0], [s1, z1], [s0, z1]], openings.map((w) => w.pts), 0, (x, z) => [x, z], s);
  for (const w of openings) {
    const P = w.pts, d = w.depth;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const ds = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(ds, dz);
      if (len < 1e-4) continue;
      const nx = -dz / len, nz = ds / len;                  // faces into the opening
      const base = s.pos.length / 3;
      for (const [p, o] of [[a, 0], [b, 0], [b, -d], [a, -d]]) {
        s.pos.push(p[0], p[1], o);
        s.nor.push(nx, nz, 0);
        s.uv.push(p[0] + p[1], o);
      }
      s.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = sinkGeometry(s, edgeMatrix(f));
  g.addGroup(0, s.idx.length, 0);
  g.addGroup(s.idx.length, 0, 1);
  return g;
}

// Panes at the back of an opening: an optional lower panel (lattice or balcony leaf), then the fill. Shutters cover
// the rectangular part only; an arched head above them is glazed (fanlight), as in the photos.
function windowPanes(f, w, add) {
  const m = edgeMatrix(f);
  const { c, z0, wd, h, shape, depth } = w;
  const l = c - wd / 2;
  const uvFn = (x, z) => [((x - l) / wd) * 2, z - z0];
  const part = (key, pts) => {
    const s = newSink();
    planarFace(pts, [], -depth, uvFn, s);
    add(key, sinkGeometry(s, m));
  };
  const rect = (za, zb) => [[l, za], [l + wd, za], [l + wd, zb], [l, zb]];
  if (w.fill === 'shop') {
    const s = newSink();
    shopFace(s, l, l + wd, z0, z0 + h, -depth, w.kind || shopKind(`${f.a[0].toFixed(1)},${f.a[1].toFixed(1)}:${c.toFixed(1)}`));
    add('shop', sinkGeometry(s, m));
    return;
  }
  let zb = z0;
  if (w.panel && w.panel.h < h - 0.5) {
    part(w.panel.color, rect(z0, z0 + w.panel.h));
    zb = z0 + w.panel.h;
  }
  const rise = headRise(wd, h, shape), spring = z0 + h - rise;
  if (w.fill.startsWith('shutter') && rise > 0 && spring - zb > 0.3) {
    part(w.fill, rect(zb, spring));
    part('glass', windowOutline(c, spring, wd, rise, shape, 8, rise));
  } else {
    part(w.fill, windowOutline(c, zb, wd, z0 + h - zb, shape, 8, rise));
  }
}

// White dressings: surround (architrave), sill, keystone, hood or pediment, balustrade panel; awnings separately.
// A balconette may carry a flower box (仁慈堂, photo #87); an opening marked stone gets granite dressings.
function windowDressing(f, w, out) {
  const m = edgeMatrix(f);
  const { c, z0, wd, h, shape } = w;
  const trim = w.stone ? out.stone : out.trim, { awnings, railings } = out;
  const sw = w.surround;
  const l = c - wd / 2, r = c + wd / 2, topZ = z0 + h;
  if (shape === 'oculus') {
    if (sw > 0) {
      const ring = new THREE.Shape().absarc(c, z0 + h / 2, wd / 2 + sw, 0, Math.PI * 2);
      ring.holes.push(new THREE.Path().absarc(c, z0 + h / 2, wd / 2, 0, Math.PI * 2, true));
      trim.push(new THREE.ExtrudeGeometry(ring, { depth: 0.07, bevelEnabled: false, curveSegments: 20 }).applyMatrix4(m));
    }
    return;
  }
  if (sw > 0) {
    // inverted-U band around the opening, standing 7 cm proud of the wall
    const rise = headRise(wd, h, shape);
    const inner = windowOutline(c, z0, wd, h, shape, 8, rise).slice(1).reverse();          // up the left jamb, over, down to (r, z0)
    const outer = windowOutline(c, z0, wd + 2 * sw, h + sw, shape, 8, rise && rise + sw).slice(2);   // up the right side, back over
    const pts = [[l - sw, z0], [l, z0], ...inner, [r + sw, z0], ...outer];
    const shapeObj = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
    trim.push(new THREE.ExtrudeGeometry(shapeObj, { depth: 0.07, bevelEnabled: false }).applyMatrix4(m));
  }
  if (z0 > 0.3) trim.push(wallBox(f, l - sw - 0.08, r + sw + 0.08, z0 - 0.12, z0, 0.14, 0.02));    // sill (doors have none)
  if (w.keystone && shape !== 'rect') trim.push(wallBox(f, c - 0.17, c + 0.17, topZ - 0.15, topZ + sw + 0.2, 0.12, 0.02));
  const hoodZ = topZ + sw;
  if (w.hood === 'flat') trim.push(wallBox(f, l - sw - 0.15, r + sw + 0.15, hoodZ, hoodZ + 0.18, 0.18, 0.02));
  if (w.hood === 'pediment') {
    const half = wd / 2 + sw + 0.2;
    const tri = new THREE.Shape([new THREE.Vector2(c - half, hoodZ), new THREE.Vector2(c + half, hoodZ), new THREE.Vector2(c, hoodZ + 0.45)]);
    trim.push(new THREE.ExtrudeGeometry(tri, { depth: 0.16, bevelEnabled: false }).applyMatrix4(m));
  }
  if (w.balustrade) {
    const bh = w.balustrade.h;
    if (w.balustrade.railing) {
      // iron balconette: rails and bars on a shallow slab
      trim.push(wallBox(f, l - sw - 0.1, r + sw + 0.1, z0 - 0.14, z0, 0.42, 0.02));
      ironRailing(f, l - sw - 0.05, r + sw + 0.05, z0, bh, 0.4, railings);
      if (w.balustrade.flowers) {
        // terracotta trough behind the railing, clipped greenery and a row of red blooms on top
        out.planters.push(wallBox(f, l - sw + 0.05, r + sw - 0.05, z0, z0 + 0.26, 0.34, -0.12));
        out.leaves.push(wallBox(f, l - sw + 0.1, r + sw - 0.1, z0 + 0.26, z0 + 0.5, 0.32, -0.14));
        const n = Math.max(2, Math.round((r - l + 2 * sw) / 0.35));
        for (let k = 0; k < n; k++) {
          const x = l - sw + 0.2 + ((r - l + 2 * sw - 0.4) * k) / (n - 1);
          out.blooms.push(wallBox(f, x - 0.08, x + 0.08, z0 + 0.46, z0 + 0.6, 0.31, -0.2));
        }
      }
    } else {
      trim.push(wallBox(f, l - 0.04, r + 0.04, z0, z0 + bh, 0.1, 0.12));
    }
  }
  if (w.awning && shape === 'round') {
    // scalloped canvas hood over the arched head, ~0.6 m deep (photos #10, #87)
    const R = wd / 2 + 0.06;
    const g = new THREE.SphereGeometry(R, 12, 4, 0, Math.PI, 0, Math.PI / 2);
    g.scale(1, 1.05, 0.65);
    g.translate(c, topZ - wd / 2 - 0.2, 0.02);
    awnings.push(g.applyMatrix4(m));
  }
}

// Window openings for one wall, one per bay and storey. Returns [] when the wall is too short or has no windows.
export function windowLayout(f, W, storeys, bays, kind) {
  const spec = kind === 'street' && W.onStreet ? { ...W, ...W.onStreet } : W;
  const out = [];
  const { piers, step } = bays;
  for (const st of storeys) {
    const ws = st.k === 0 ? spec.ground : { ...spec, h: spec.h[Math.min(st.k - 1, spec.h.length - 1)] };
    if (!ws || st.skip) continue;
    const ground = st.k === 0;
    const full = ground ? { ...spec, ...ws, hood: ws.hood, balustrade: ws.balustrade, awning: false, panel: ws.panel } : ws;
    const sw = full.surround ?? WINDOW_DEFAULTS.surround;
    const z0 = st.floor + Math.max(0.05, full.sill ?? WINDOW_DEFAULTS.sill);
    const room = st.ceil - z0 - sw - (full.hood ? 0.65 : 0.2);
    let h = Math.min(full.h, room);
    let shape = full.shape;
    const wd = Math.min(full.w, step - 0.56 - 2 * sw - 0.15);
    if (wd < 0.7 || h < 1.2) continue;
    if (shape === 'round' && h < wd / 2 + 0.6) shape = 'segment';
    const depth = full.depth ?? WINDOW_DEFAULTS.depth;
    for (let k = 0; k < piers.length - 1; k++) {
      const c = (piers[k] + piers[k + 1]) / 2;
      out.push({
        c, z0, wd, h, shape, depth, surround: sw, storey: st.k, bay: k, floor: st.floor,
        fill: full.fill || 'glass', panel: full.panel || null, keystone: !!full.keystone, hood: full.hood || null,
        balustrade: full.balustrade || null, awning: !!full.awning,
        pts: windowOutline(c, z0, wd, h, shape),
      });
    }
  }
  return out;
}

// ---------- shopfronts (v7): glazed fronts with lit interiors behind the arcades and in ground-floor shop openings ----------
// viewer/assets/shops.png (scripts/make_shop_textures.py) is a 4 x 2 atlas with one kind of shop per cell, v running up
// the front. The same image is the emissive map, so the interiors stay lit inside the shaded arcades.
export const SHOP_KINDS = ['cosmetics', 'pharmacy', 'jewellery', 'bakery', 'fashion', 'cafe', 'jerky', 'shoes'];
export const SHOP = { frame: 0x3a3029, fascia: 0x2e2826, glow: 0.4, maxH: 3.6, frameW: 0.09 };

export function shopUV(kind) {
  const k = Math.max(0, SHOP_KINDS.indexOf(kind));
  const c = k % 4, r = Math.floor(k / 4);
  return (fu, fv) => [(c + fu) / 4, (r + fv) / 2];
}

// The same bay always gets the same kind of shop unless the shop data names one.
export function shopKind(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return SHOP_KINDS[(h >>> 0) % SHOP_KINDS.length];
}

// Kind of shop in bay k of facade edge i: data/shops.json gives one kind per edge or a list per bay.
function bayKind(b, i, k, seed) {
  const spec = b.shops && b.shops.kinds && b.shops.kinds[i];
  const kind = Array.isArray(spec) ? spec[k] : spec;
  return SHOP_KINDS.includes(kind) ? kind : shopKind(seed);
}

function shopFace(sink, l, r, z0, z1, o, kind) {
  const uv = shopUV(kind);
  planarFace([[l, z0], [r, z0], [r, z1], [l, z1]], [], o, (x, z) => uv((x - l) / (r - l), (z - z0) / (z1 - z0)), sink);
}

// Extent along facade edge i (in its own s) of the arcade's back wall, i.e. of edge i moved in by its depth and
// cut by its neighbours (themselves moved in when they are arcade edges too); see offsetEdges.
function recessRange(ring, i, depthMap) {
  const n = ring.length, f = edgeFrame(ring, i), d = depthMap.get(i) || 0;
  const cut = (j, fallback) => {
    const g = edgeFrame(ring, j), dj = depthMap.get(j) || 0;
    const cross = f.u[0] * g.u[1] - f.u[1] * g.u[0];
    if (Math.abs(cross) < 0.08) return fallback;
    const px = g.a[0] - g.n[0] * dj - (f.a[0] - f.n[0] * d), py = g.a[1] - g.n[1] * dj - (f.a[1] - f.n[1] * d);
    return (px * g.u[1] - py * g.u[0]) / cross;
  };
  return [cut((i - 1 + n) % n, 0), cut((i + 1) % n, f.L)];
}

// One shop per arcade bay on the back wall: glazing, a bronze frame and a fascia board above it for the sign.
function arcadeShops(b, ring, i, depthMap, arc, out) {
  const f = edgeFrame(ring, i);
  const [sa, sb] = recessRange(ring, i, depthMap);
  const { piers } = bayLayout(f.L, arc.bay, arc.pier);
  const d = arc.depth, fr = SHOP.frameW;
  const zg = Math.min(SHOP.maxH, arc.height - 1.3);
  const fz0 = zg + fr + 0.15, fz1 = Math.min(fz0 + 0.65, arc.height - 0.3);
  const sink = newSink();
  for (let k = 0; k < piers.length - 1; k++) {
    const l = Math.max(piers[k] + arc.pier / 2 + 0.15, sa + 0.3), r = Math.min(piers[k + 1] - arc.pier / 2 - 0.15, sb - 0.3);
    if (r - l < 1.2) continue;
    const kind = bayKind(b, i, k, `${b.id}:${i}:${k}`);
    shopFace(sink, l, r, 0, zg, -d + 0.03, kind);
    out.shopFrames.push(
      wallBox(f, l - fr, l, 0, zg + fr, -d + 0.1, d),
      wallBox(f, r, r + fr, 0, zg + fr, -d + 0.1, d),
      wallBox(f, l - fr, r + fr, zg, zg + fr, -d + 0.1, d),
    );
    if (fz1 - fz0 > 0.3) {
      out.fascias.push(wallBox(f, l - fr, r + fr, fz0, fz1, -d + 0.07, d));
      out.fasciaRects.push({ i, k, l, r, z0: fz0, z1: fz1, o: -d + 0.07, kind });
    }
  }
  if (sink.idx.length) out.shops.push(sinkGeometry(sink, edgeMatrix(f)));
}

// ---------- shop signs (v7, showcase): data/shops.json, drawn into viewer/assets/signs.png ----------
// Each sign is a quad in wall-local coordinates a little in front of what it hangs on, textured with its
// rectangle of the atlas; letters stand on a transparent ground (alpha mask). Placements: see the notes in
// shops.json. Plain bilingual signs (`generic`, one per kind of shop) go on every other arcade fascia and above
// ground-floor shop openings where there is room.
export const SIGN = { gap: 0.02, inset: 0.05, roofSetback: 1.5, roofLift: 0.9, awning: { proj: 0.85, drop: 0.5, valance: 0.22 } };

function signQuad(sink, s, z, w, h, o, uv) {
  const l = s - w / 2, b = z - h / 2;
  planarFace([[l, b], [l + w, b], [l + w, b + h], [l, b + h]], [], o,
    (x, y) => [uv[0] + ((x - l) / w) * (uv[2] - uv[0]), uv[1] + ((y - b) / h) * (uv[3] - uv[1])], sink);
}

// sign scaled down (never up) to fit a w x h box
const fitSign = (a, w, h) => Math.min(1, w / a.w, h / a.h);

// Canvas awning over an opening: sloped top, front valance and side cheeks, in wall-local coordinates.
function awningGeometry(f, l, r, zt) {
  const { proj, drop, valance } = SIGN.awning;
  const zf = zt - drop, zv = zf - valance;
  const quads = [
    [[l, zt, 0], [r, zt, 0], [r, zf, proj], [l, zf, proj]],
    [[l, zf, proj], [r, zf, proj], [r, zv, proj], [l, zv, proj]],
  ];
  const pos = [];
  for (const [a, b, c, d] of quads) pos.push(...a, ...d, ...c, ...a, ...c, ...b);
  for (const x of [l, r]) pos.push(x, zt, 0, x, zf, proj, x, zv, proj);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g.applyMatrix4(edgeMatrix(f));
}

// Framed sign standing on the roof behind wall f (Hotel Central, photo #99): letters on an iron frame.
function roofSign(f, s, top, a, out) {
  const o = -SIGN.roofSetback, z0 = top + SIGN.roofLift, z1 = z0 + a.h;
  const sink = newSink();
  signQuad(sink, s, (z0 + z1) / 2, a.w, a.h, o, a.uv);
  out.roofSigns.push(sinkGeometry(sink, edgeMatrix(f)));
  const back = o - 0.12;
  const n = Math.max(2, Math.round(a.w / 3) + 1);
  for (let k = 0; k < n; k++) {
    const x = s - a.w / 2 + 0.2 + (k * (a.w - 0.4)) / (n - 1);
    out.signBoards.push(wallBox(f, x - 0.07, x + 0.07, top, z1, back, -back + 0.14));
  }
  for (const z of [z0 + 0.1, z0 + a.h * 0.45, z1 - 0.1]) out.signBoards.push(wallBox(f, s - a.w / 2, s + a.w / 2, z - 0.05, z + 0.05, back, -back + 0.1));
}

function placeSigns(b, L, S, out) {
  const { ring, lines, bandH, corniceZ, arcadeEdges, windowed, roofH } = L;
  const sinks = new Map();
  const sinkFor = (i) => { if (!sinks.has(i)) sinks.set(i, newSink()); return sinks.get(i); };
  const taken = new Map();                       // edge -> [s0, s1, z0, z1] already holding a sign or awning
  const take = (i, s0, s1, z0, z1) => { if (!taken.has(i)) taken.set(i, []); taken.get(i).push([s0, s1, z0, z1]); };
  const free = (i, s0, s1, z0, z1) => !(taken.get(i) || []).some((t) => t[0] < s1 && s0 < t[1] && t[2] < z1 && z0 < t[3]);
  const fasciaDone = new Set();
  const bandZ = lines.length ? lines[0] + bandH(0) / 2 : null;
  const bandO = (arcadeEdges.length ? 0.2 : 0.12) + SIGN.gap;
  const zOf = (z) => {
    if (typeof z === 'number') return z;
    const m = /^(band|top)([+-][\d.]+)?$/.exec(z || 'band');
    return (m[1] === 'band' ? bandZ : corniceZ) + (m[2] ? parseFloat(m[2]) : 0);
  };
  const windowAt = (i, storey, bay) => (windowed.get(i) || { ws: [] }).ws.find((w) => w.storey === storey && w.bay === bay);
  const put = (i, s, z, a, k, o) => {
    const w = a.w * k, h = a.h * k;
    signQuad(sinkFor(i), s, z, w, h, o, a.uv);
    take(i, s - w / 2, s + w / 2, z - h / 2, z + h / 2);
  };

  for (const p of (b.shops && b.shops.signs) || []) {
    const i = p.edge, f = edgeFrame(ring, i);
    const ids = Array.isArray(p.sign) ? p.sign : [p.sign];
    const sign = (j) => S.signs[ids[j % ids.length]];
    const s = (p.s ?? 0.5) * f.L;
    if (p.at === 'band' && bandZ != null) put(i, s, bandZ, sign(0), 1, bandO);
    else if (p.at === 'wall') {
      const a = sign(0), z = zOf(p.z), o = p.o ?? SIGN.gap;
      put(i, s, z, a, 1, o);
      if (p.board) out.signBoards.push(wallBox(f, s - a.w / 2 - 0.04, s + a.w / 2 + 0.04, z - a.h / 2 - 0.04, z + a.h / 2 + 0.04, o - 0.004, 0.05));
    } else if (p.at === 'roof') {
      roofSign(f, s, b.h, sign(0), out);
    } else if (p.at === 'fascia') {
      p.bays.forEach((k, j) => {
        const r = out.fasciaRects.find((q) => q.i === i && q.k === k);
        if (!r) return;
        const a = sign(j);
        put(i, (r.l + r.r) / 2, (r.z0 + r.z1) / 2, a, fitSign(a, r.r - r.l - 2 * SIGN.inset, r.z1 - r.z0 - 2 * SIGN.inset), r.o + SIGN.gap);
        fasciaDone.add(`${i}:${k}`);
      });
    } else if (p.at === 'window' || p.at === 'lintel' || p.at === 'awning') {
      p.bays.forEach((k, j) => {
        const w = windowAt(i, p.at === 'window' ? p.storey : 0, k);
        if (!w) return;
        const top = w.z0 + w.h + w.surround;
        if (p.at === 'awning') {
          const l = w.c - w.wd / 2 - w.surround - 0.1, r = w.c + w.wd / 2 + w.surround + 0.1, zt = top + 0.3;
          const list = out.awningsByColor.get(p.color) || [];
          list.push(awningGeometry(f, l, r, zt));
          out.awningsByColor.set(p.color, list);
          take(i, l, r, top, zt + 0.6);
          return;
        }
        const a = sign(j);
        if (p.at === 'lintel') {
          const k2 = fitSign(a, w.wd + 2 * w.surround, 0.8);
          put(i, w.c, top + 0.1 + (a.h * k2) / 2, a, k2, SIGN.gap);
        } else if (a.fill === 'cover') {
          // banner over the whole opening, arched head included
          const l = w.c - w.wd / 2;
          const sink = sinkFor(i);
          planarFace(w.pts, [], -w.depth + SIGN.gap,
            (x, z) => [a.uv[0] + ((x - l) / w.wd) * (a.uv[2] - a.uv[0]), a.uv[1] + ((z - w.z0) / w.h) * (a.uv[3] - a.uv[1])], sink);
        } else {
          const k2 = fitSign(a, w.wd - 0.1, w.h - 0.1);
          signQuad(sinkFor(i), w.c, w.z0 + w.h * (p.zc ?? 0.5), a.w * k2, a.h * k2, -w.depth + SIGN.gap, a.uv);
        }
      });
    }
  }

  // plain signs for the remaining shops
  const generic = (kind, seed) => {
    const ids = S.generic[kind] || [];
    return ids.length ? S.signs[ids[Math.floor(hash01(seed) * ids.length)]] : null;
  };
  for (const r of out.fasciaRects) {
    if (fasciaDone.has(`${r.i}:${r.k}`)) continue;
    const a = generic(r.kind, `${b.id}:${r.i}:${r.k}:sign`);
    if (a) put(r.i, (r.l + r.r) / 2, (r.z0 + r.z1) / 2, a, fitSign(a, r.r - r.l - 2 * SIGN.inset, r.z1 - r.z0 - 2 * SIGN.inset), r.o + SIGN.gap);
  }
  for (const [i, { ws }] of windowed) {
    for (const w of ws) {
      if (w.fill !== 'shop' || w.storey !== 0) continue;
      const a = generic(w.kind, `${b.id}:${i}:${w.bay}:sign`);
      if (!a) continue;
      const k = fitSign(a, w.wd + 2 * w.surround, 0.6);
      const z0 = w.z0 + w.h + w.surround + 0.1, z1 = z0 + a.h * k;
      const ceiling = lines.length ? lines[0] - 0.05 : roofH - 0.3;
      if (z1 > ceiling || !free(i, w.c - (a.w * k) / 2, w.c + (a.w * k) / 2, z0, z1)) continue;
      put(i, w.c, (z0 + z1) / 2, a, k, SIGN.gap);
    }
  }
  for (const [i, sink] of sinks) if (sink.idx.length) out.signs.push(sinkGeometry(sink, edgeMatrix(edgeFrame(ring, i))));
}

// Roof signs on a building without a facade spec (only `roof` placements apply there).
export function roofSignGeometries(b, S) {
  const out = { roofSigns: [], signBoards: [] };
  for (const p of (b.shops && b.shops.signs) || []) {
    if (p.at !== 'roof') continue;
    const f = edgeFrame(b.outer, p.edge);
    roofSign(f, (p.s ?? 0.5) * f.L, b.h, S.signs[Array.isArray(p.sign) ? p.sign[0] : p.sign], out);
  }
  return { roofSigns: mergeFlat(out.roofSigns), signBoards: mergeFlat(out.signBoards) };
}

// Floor lines, storeys and window openings of a building with a facade spec; shared by the geometry and the signs.
export function facadeLayout(b) {
  const F = b.facade;
  const ring = b.outer;
  const parapetH = F.parapet ? F.parapet.h : 0;
  const pitched = b.roof && b.roof.shape;                      // gable: the walls stop at the eave
  const roofH = pitched ? pitched.eave : b.h - parapetH;
  const arcade = F.arcade && F.arcadeEdges.length ? F.arcade : null;
  const aH = arcade ? arcade.height : 0;
  const arcadeEdges = arcade ? F.arcadeEdges.filter((i) => edgeFrame(ring, i).L >= 2.5) : [];

  // floor lines: cumulative heights of the floors listed in the spec, entablature above the arcade
  const lines = [];
  let z = 0;
  for (const fh of F.floors.slice(0, -1)) { z += fh; lines.push(z); }
  const corniceZ = roofH - (F.cornice ? F.cornice.h : 0);
  // taller buildings in the same style get extra storeys at the top storey height
  const top = F.floors[F.floors.length - 1];
  while (z + top < corniceZ - top * 0.6) { z += top; lines.push(z); }
  const bandH = (k) => (k === 0 && arcadeEdges.length ? 0.6 : 0.28);
  const storeyTops = lines.filter((lz) => lz < corniceZ - 1).concat([corniceZ]);
  const storeys = storeyTops.map((ceil, k) => ({ k, floor: k ? storeyTops[k - 1] + bandH(k - 1) : 0, ceil, skip: k === 0 && arcadeEdges.length > 0 }));
  // bays of one wall; F.bayCounts fixes the count where the photos show it (市政署: four-bay wings, three-bay centre)
  const baysOf = (i) => bayLayout(edgeFrame(ring, i).L, F.arcade ? F.arcade.bay : F.bay || 3.8, F.arcade ? F.arcade.pier : 0.9,
    (F.bayCounts || {})[i] || 0);
  const detail = F.detail || [];

  // which walls get windows, and their openings: one per bay and storey, or listed one by one (F.openings, the Sé
  // front) where the bays are not regular; F.openingPatch then changes single openings (a door in a window row)
  const W = F.windows && F.windows.shape ? F.windows : null;
  const windowed = new Map();
  for (const i of F.edges) {
    const f = edgeFrame(ring, i);
    if (f.L < 2.5) continue;
    let ws = [];
    const listed = (F.openings || {})[i];
    if (listed) ws = listed.flatMap((o, k) => [].concat(o.s).map((c) => openingAt(o, c, k, lines)));
    else if (W) ws = windowLayout(f, W, storeys, baysOf(i), (F.edgeKinds || {})[i]);
    for (const p of (F.openingPatch || []).filter((q) => q.edge === i)) {
      const w = ws.find((q) => q.storey === p.storey && q.bay === p.bay);
      if (!w) continue;
      Object.assign(w, { ...p, wd: p.w ?? w.wd, h: p.h ?? w.h, z0: p.sill != null ? w.floor + p.sill : w.z0 });
      w.pts = windowOutline(w.c, w.z0, w.wd, w.h, w.shape);
    }
    // a continuous balcony replaces the balconettes of the windows it serves
    for (const d of detail.filter((q) => q.type === 'balcony' && q.edge === i)) {
      for (const w of ws) if (w.storey === (d.storey ?? 1)) w.balustrade = null;
    }
    if (ws.length) windowed.set(i, { f, ws });
  }
  // mouldings of the kinds listed in F.stone are granite (市政署: courses, cornice, pilasters, pediment)
  const mould = (kind, out) => ((F.stone || []).includes(kind) ? out.stone : out.trim);
  return { F, ring, pitched, roofH, arcade, aH, arcadeEdges, lines, corniceZ, bandH, storeys, baysOf, windowed, detail, mould };
}

// One opening listed in F.openings: s is its centre along the wall, z its sill height.
function openingAt(o, c, k, lines) {
  const shape = o.shape || 'rect', wd = o.w, h = shape === 'oculus' ? o.w : o.h;
  return {
    c, z0: o.z, wd, h, shape, depth: o.depth ?? 0.3, surround: o.surround ?? WINDOW_DEFAULTS.surround,
    storey: o.storey ?? (lines.length && o.z >= lines[0] ? 1 : 0), bay: k, floor: 0,
    fill: o.fill || 'glass', panel: null, keystone: !!o.keystone, hood: o.hood || null, balustrade: o.balustrade || null,
    awning: false, stone: !!o.stone, pts: windowOutline(c, o.z, wd, h, shape),
  };
}

// Returns { walls, trim, screens, panes, awnings, railings, ... } geometries for one building with a facade spec.
export function facadeGeometries(b, shopSigns = null) {
  const L = facadeLayout(b);
  const { F, ring, pitched, roofH, arcade, aH, arcadeEdges, lines, corniceZ, bandH, baysOf, windowed, detail, mould } = L;
  const skip = new Set(windowed.keys());

  const out = {
    walls: [], trim: [], stone: [], screens: [], panes: new Map(), awnings: [], railings: [], iron: [], glass: [], shops: [], shopFrames: [],
    fascias: [], fasciaRects: [], signs: [], signBoards: [], roofSigns: [], awningsByColor: new Map(),
    planters: [], leaves: [], blooms: [], bells: [], clockFace: [], emblems: [], flags: [], inscriptions: [],
  };
  const addPane = (key, g) => { if (!out.panes.has(key)) out.panes.set(key, []); out.panes.get(key).push(g); };
  if (arcadeEdges.length) {
    if (!F.passage) {                                          // a passage (lane under the building) has no ground floor
      const depth = new Map(arcadeEdges.map((i) => [i, arcade.depth]));
      const recessed = offsetEdges(ring, depth);
      out.walls.push(prismGeometry(recessed, b.holes, aH, 0, { roof: false }));
      for (const i of arcadeEdges) arcadeShops(b, ring, i, depth, arcade, out);
    }
    const upper = prismGeometry(ring, b.holes, roofH, aH, { bottom: true, skip, roof: !pitched });
    out.walls.push(upper);
    for (const i of arcadeEdges) out.screens.push(arcadeScreenGeometry(edgeFrame(ring, i), arcade));
  } else {
    out.walls.push(prismGeometry(ring, b.holes, roofH, 0, { skip, roof: !pitched }));
  }
  if (pitched) out.walls.push(gableGeometry(ring, pitched));
  for (const [i, { f, ws }] of windowed) {
    // F.wallSpans splits a wall into stretches of their own height (the Sé towers run on above the nave eave)
    for (const sp of (F.wallSpans || {})[i] || [{ s: [0, f.L] }]) {
      const s0 = Math.max(0, sp.s[0]), s1 = sp.s[1] >= f.L - 0.05 ? f.L : sp.s[1];
      out.walls.push(holedWall(f, arcadeEdges.length ? aH : 0, sp.top ?? roofH, ws.filter((w) => w.c >= s0 && w.c < s1), s0, s1));
    }
    for (const w of ws) {
      if (w.fill === 'shop') w.kind = bayKind(b, i, w.bay, `${f.a[0].toFixed(1)},${f.a[1].toFixed(1)}:${w.c.toFixed(1)}`);
      windowPanes(f, w, addPane);
      windowDressing(f, w, out);
    }
  }

  const columnEdges = new Set(detail.filter((d) => d.type === 'columns').flatMap((d) => d.edges));
  const pedimentEdges = new Map(detail.filter((d) => d.type === 'pediment').map((d) => [d.edge, d]));
  for (const i of F.edges) {
    const f = edgeFrame(ring, i);
    if (f.L < 1.5) continue;
    const ext = 0.25;                                          // run past the corner so bands meet
    if (F.courses !== false) {
      lines.forEach((lz, k) => {
        const main = k === 0 && arcadeEdges.length;
        const hBand = main ? 0.6 : 0.28, proj = main ? 0.2 : 0.12;
        if (lz + hBand < corniceZ) mould('courses', out).push(wallBox(f, -ext, f.L + ext, lz, lz + hBand, proj, 0.05));
      });
    }
    if (F.cornice) mould('cornice', out).push(wallBox(f, -ext - F.cornice.proj, f.L + ext + F.cornice.proj, corniceZ, roofH, F.cornice.proj, 0.05));
    if (F.pilasters && !columnEdges.has(i)) {
      // full-height pilasters on every pier, or only at the ends of the wall (市政署, photo #127)
      const { piers } = baysOf(i);
      const z0 = lines.length ? lines[0] + (arcadeEdges.length ? 0.6 : 0.28) : 0;
      const ends = F.pilasters === 'ends';
      for (const p of ends ? [0.45, f.L - 0.45] : piers) {
        mould('pilasters', out).push(ends ? wallBox(f, p - 0.45, p + 0.45, 0, corniceZ, 0.14, 0.05) : wallBox(f, p - 0.28, p + 0.28, z0, corniceZ, 0.1, 0.05));
      }
    }
    if (F.plinth) plinth(f, F.plinth, (windowed.get(i) || { ws: [] }).ws, mould('plinth', out));
  }
  if (pitched) {
    // white raking cornice along the gable ends of the facade walls (a pediment brings its own)
    const P = gableProfile(ring, pitched);
    for (const i of F.edges) {
      if (pedimentEdges.has(i)) continue;
      const f = edgeFrame(ring, i);
      const da = P.dOf(f.a), db = P.dOf(f.b);
      const ss = [0, f.L, ...P.cuts.filter((c) => (c - da) * (c - db) < 0).map((c) => ((c - da) / (db - da)) * f.L)].sort((x, y) => x - y);
      const line = ss.map((sv) => [sv, P.zAt(da + ((db - da) * sv) / f.L)]);
      for (let k = 0; k < line.length - 1; k++) {
        const [[s0, z0], [s1, z1]] = [line[k], line[k + 1]];
        if (Math.max(z0, z1) - roofH > 1e-3) out.trim.push(rakeGeometry(f, s0, z0, s1, z1, 0.4, 0.22));
      }
    }
  }
  // bracket lanterns on the walls facing the square, above the ground-floor line
  if (lines.length && F.lanterns !== false) {
    for (const i of F.edges) {
      const f = edgeFrame(ring, i);
      if ((F.edgeKinds || {})[i] === 'square' && f.L >= 5) wallLanterns(f, baysOf(i).piers, lines[0] + bandH(0) + 0.9, out);
    }
  }
  if (F.parapet) parapet(b, L, pedimentEdges, out);
  for (const d of detail) DETAIL[d.type](b, L, d, out, shopSigns);
  if (shopSigns) placeSigns(b, L, shopSigns, out);
  const paneKeys = [...out.panes.keys()];
  return {
    walls: mergeFlatGrouped(out.walls),
    trim: mergeFlat(out.trim),
    stone: mergeFlat(out.stone),
    screens: mergeFlat(out.screens),
    panes: paneKeys.length ? { keys: paneKeys, geometry: mergeGeometries(paneKeys.map((k) => mergeFlat(out.panes.get(k))), true) } : null,
    awnings: mergeFlat(out.awnings),
    railings: mergeFlat(out.railings),
    lanterns: mergeFlat(out.iron),
    lanternGlass: mergeFlat(out.glass),
    shops: mergeFlat(out.shops),
    shopFrames: mergeFlat(out.shopFrames),
    fascias: mergeFlat(out.fascias),
    signs: mergeFlat(out.signs),
    signBoards: mergeFlat(out.signBoards),
    roofSigns: mergeFlat(out.roofSigns),
    signAwnings: [...out.awningsByColor].map(([color, list]) => ({ color, geometry: mergeFlat(list) })),
    planters: mergeFlat(out.planters),
    leaves: mergeFlat(out.leaves),
    blooms: mergeFlat(out.blooms),
    bells: mergeFlat(out.bells),
    clockFace: mergeFlat(out.clockFace),
    emblems: mergeFlat(out.emblems),
    flags: mergeFlat(out.flags),
    inscriptions: mergeFlat(out.inscriptions),
    windowCount: [...windowed.values()].reduce((n, e) => n + e.ws.length, 0),
  };
}

// Sloped moulding under a roof line from (s0, z0) to (s1, z1) on wall f: `t` high, standing `proj` proud of the wall.
function rakeGeometry(f, s0, z0, s1, z1, t, proj) {
  const V = (x, z) => new THREE.Vector2(x, z);
  const shp = new THREE.Shape([V(s0, z0 - t), V(s1, z1 - t), V(s1, z1), V(s0, z0)]);
  return new THREE.ExtrudeGeometry(shp, { depth: proj, bevelEnabled: false }).applyMatrix4(edgeMatrix(f));
}

// Base course along a wall, broken at the openings that come down to the ground (doors).
function plinth(f, spec, ws, list) {
  const gaps = ws.filter((w) => w.z0 < spec.h).map((w) => [w.c - w.wd / 2 - w.surround, w.c + w.wd / 2 + w.surround]).sort((a, c) => a[0] - c[0]);
  let s = -0.05;
  for (const [g0, g1] of [...gaps, [f.L + 0.05, f.L + 0.05]]) {
    if (g0 - s > 0.05) list.push(wallBox(f, s, g0, 0, spec.h, spec.proj ?? 0.08, 0.05));
    s = Math.max(s, g1);
  }
}

// Parapet: a solid ring wall with a coping, or, for a turned balustrade, a low solid base all round with balusters,
// pedestals and a rail along the facade walls (仁慈堂, photos #0, #26, #40). Other parapets of type balustrade
// stay solid blocks to keep the triangle budget.
function parapet(b, L, pedimentEdges, out) {
  const { F, ring, roofH, baysOf, mould } = L;
  const t = F.parapet.t;
  const inner = offsetEdges(ring, new Map(ring.map((_, i) => [i, t])));
  const turned = F.parapet.type === 'balustrade' && F.parapet.turned
    ? new Set(F.edges.filter((i) => edgeFrame(ring, i).L >= 2 && !pedimentEdges.has(i))) : new Set();
  const base = turned.size ? roofH + 0.22 : b.h;
  out.trim.push(prismGeometry(ring, [inner.slice().reverse()], base, roofH));
  for (let i = 0; i < ring.length; i++) {
    const f = edgeFrame(ring, i);
    if (f.L <= 0.5) continue;
    if (turned.has(i)) {
      const posts = [0.25, f.L - 0.25, ...baysOf(i).piers.filter((p) => p > 0.8 && p < f.L - 0.8)];
      balustrade(f, 0, f.L, base, b.h - base, t, posts, out.trim);
      continue;
    }
    // an attic pediment stands in for the parapet over its width
    const p = pedimentEdges.get(i), cut = p && p.attic ? [p.s ? p.s[0] : 0, p.s ? Math.min(p.s[1], f.L) : f.L] : null;
    const spans = cut ? [[0, cut[0]], [cut[1], f.L]].filter(([s0, s1]) => s1 - s0 > 0.05) : [[0, f.L]];
    for (const [s0, s1] of spans) {
      if (base < b.h) out.trim.push(wallBox(f, s0, s1, base - 0.01, b.h, 0, t));
      mould('coping', out).push(wallBox(f, s0 ? s0 : -0.05, s1 < f.L ? s1 : f.L + 0.05, b.h - 0.14, b.h, 0.06, t));
    }
  }
}

// Balustrade along wall f from s0 to s1, standing on z0, h high, from t behind the wall line to it: pedestals at
// `posts`, square balusters (turned profile, four sides) between them, a moulded rail on top.
const BALUSTER = [[0.06, 0], [0.1, 0.4], [0.042, 0.8], [0.075, 1]];
function balustrade(f, s0, s1, z0, h, t, posts, list) {
  const rail = 0.16, bh = h - rail, pw = 0.25;
  list.push(wallBox(f, s0 - 0.04, s1 + 0.04, z0 + bh, z0 + h, 0.05, t + 0.05));
  const ps = [...new Set(posts.map((p) => Math.min(Math.max(p, s0 + pw), s1 - pw)))].sort((a, c) => a - c);
  for (const p of ps) list.push(wallBox(f, p - pw, p + pw, z0, z0 + bh, 0.03, t + 0.03));
  const prof = BALUSTER.map(([r, y]) => new THREE.Vector2(r, y * bh));
  const bounds = [s0, ...ps.flatMap((p) => [p - pw, p + pw]), s1];
  for (let k = 0; k < bounds.length - 1; k += 2) {
    const [x0, x1] = [bounds[k], bounds[k + 1]];
    const n = Math.floor((x1 - x0) / 0.3);
    for (let j = 0; j < n; j++) {
      const x = x0 + ((x1 - x0) * (j + 0.5)) / n;
      list.push(new THREE.LatheGeometry(prof, 4).rotateY(Math.PI / 4).translate(x, z0, -t / 2).applyMatrix4(edgeMatrix(f)));
    }
  }
}

// ---------- landmark detail (v8): the ornament of the four landmark fronts, from the photos ----------
// b.facade.detail lists features in wall-local metres on one footprint edge: s from the edge's start corner, z up,
// o outward. Mouldings go to the trim, or to the granite where F.stone names their kind; attic, pediment and tower
// walls take the wall colour (screens).
const V2 = (x, z) => new THREE.Vector2(x, z);
const onWall = (f, g, o = 0) => g.applyMatrix4(edgeMatrix(f, o));

// Counter-clockwise ring (data axes) of the rectangle s0..s1 x o0..o1 beside wall f; its edges face front, +s,
// back and -s, in that order.
function sideRing(f, s0, s1, o0, o1) {
  const P = (s, o) => [f.a[0] + f.u[0] * s + f.n[0] * o, f.a[1] + f.u[1] * s + f.n[1] * o];
  return [P(s0, o1), P(s1, o1), P(s1, o0), P(s0, o0)];
}

// Iron railing round a balcony from s0 to s1 standing d out from the wall, z0 to z0 + h: top and bottom rails and
// bars about 12 cm apart on the front and both sides, each a flat strip (the material is double-sided).
function ironRailing(f, s0, s1, z0, h, d, list) {
  const ring = sideRing(f, s0, s1, 0, d), bar = 0.0125;
  for (const k of [0, 1, 3]) {
    const g = edgeFrame(ring, k), sink = newSink();
    const strip = (x0, x1, za, zb) => planarFace([[x0, za], [x1, za], [x1, zb], [x0, zb]], [], 0, () => [0, 0], sink);
    strip(0, g.L, z0 + h - 0.05, z0 + h);
    strip(0, g.L, z0 + 0.04, z0 + 0.08);
    const n = Math.max(1, Math.round(g.L / 0.12)), ends = k === 0 ? 0 : 1;
    for (let j = ends; j <= n - ends; j++) {
      const x = Math.min(Math.max((g.L * j) / n, bar), g.L - bar);
      strip(x - bar, x + bar, z0, z0 + h - 0.05);
    }
    list.push(sinkGeometry(sink, edgeMatrix(g)));
  }
}

// Engaged column from z0 to z1 at s: plinth, torus, tapering shaft, echinus and abacus; square = a pilaster.
function column(f, s, z0, z1, r, square, list) {
  const h = z1 - z0, oc = r * 0.4, front = oc + r;
  const bh = Math.min(0.5, h * 0.07), ch = Math.min(0.55, h * 0.075);
  list.push(wallBox(f, s - r - 0.12, s + r + 0.12, z0, z0 + bh * 0.55, front + 0.12, 0.02));
  if (square) {
    list.push(wallBox(f, s - r - 0.05, s + r + 0.05, z0 + bh * 0.55, z0 + bh, front + 0.05, 0.02));
    list.push(wallBox(f, s - r, s + r, z0 + bh, z1 - ch, front, 0.02));
    list.push(wallBox(f, s - r - 0.08, s + r + 0.08, z1 - ch, z1 - ch * 0.45, front + 0.06, 0.02));
  } else {
    // only the part in front of the wall is built: 7 facets over 207 degrees, open ends (hidden by the blocks)
    const drum = (rt, rb, za, zb) => onWall(f, new THREE.CylinderGeometry(rt, rb, zb - za, 7, 1, true, -0.575 * Math.PI, 1.15 * Math.PI).translate(s, (za + zb) / 2, oc));
    list.push(drum(r + 0.07, r + 0.09, z0 + bh * 0.55, z0 + bh), drum(r * 0.86, r, z0 + bh, z1 - ch), drum(r + 0.1, r * 0.88, z1 - ch, z1 - ch * 0.45));
  }
  list.push(wallBox(f, s - r - 0.16, s + r + 0.16, z1 - ch * 0.45, z1, front + 0.16, 0.02));
}

// Urn on a pedestal (仁慈堂 parapet, 玫瑰堂 cornice ends), centred o in front of the wall line.
const URN = [[0, 0], [0.2, 0.06], [0.09, 0.16], [0.27, 0.5], [0.1, 0.78], [0.15, 0.86], [0, 1.08]];
function urn(f, s, z, o, ped, scale, list) {
  if (ped) list.push(wallBox(f, s - 0.3 * scale, s + 0.3 * scale, z, z + ped, o + 0.3 * scale, 0.3 * scale - o));
  list.push(onWall(f, new THREE.LatheGeometry(URN.map(([r, y]) => V2(r * scale, y * scale)), 6).translate(s, z + ped, o)));
}

// Round emblem in a tympanum or attic: oval frame (玫瑰堂), dark disc in a ring (市政署, 仁慈堂) or louvred oculus (Sé).
function emblem(f, c, z, e, out) {
  const ring = (r0, r1, rz0, rz1) => {
    const sh = new THREE.Shape().absellipse(c, z, r1, rz1, 0, Math.PI * 2);
    sh.holes.push(new THREE.Path().absellipse(c, z, r0, rz0, 0, Math.PI * 2, true));
    return onWall(f, new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false, curveSegments: 20 }), 0.02);
  };
  const r = e.r, rz = e.rz ?? r;
  if (e.kind === 'oval') { out.trim.push(ring(r - 0.3, r, rz - 0.3, rz)); return; }
  out.trim.push(ring(r, r + 0.18, rz, rz + 0.18));
  const face = new THREE.CircleGeometry(1, 24).scale(r, rz, 1).translate(c, z, 0.06);
  if (e.kind === 'oculus') {
    const uv = face.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 2, uv.getY(k) * 2 * rz);
    out.panes.has(e.fill || 'shutter_green') || out.panes.set(e.fill || 'shutter_green', []);
    out.panes.get(e.fill || 'shutter_green').push(onWall(f, face));
  } else {
    (e.face === 'trim' ? out.trim : out.emblems).push(onWall(f, face));
  }
}

// Classical pediment over s0..s1 of a wall, standing on z (default the cornice top): an optional attic (with
// pilasters, oval medallion, inscription and side volutes), a horizontal cornice, the triangular tympanum with its
// raking cornices and emblem, then a cross or a flagpole at the apex.
function pedimentDetail(b, L, p, out, S) {
  const f = edgeFrame(L.ring, p.edge), mould = L.mould('pediment', out);
  const s0 = p.s ? p.s[0] : 0, s1 = p.s ? Math.min(p.s[1], f.L) : f.L, c = (s0 + s1) / 2;
  const z = p.z === 'top' ? b.h : p.z ?? L.roofH, t = p.t ?? 0.6;
  let zc = z;
  if (p.attic) {
    zc = z + p.attic;
    out.screens.push(wallBox(f, s0, s1, z - 0.3, zc, 0.02, t));
    for (const sp of [s0 + 0.3, s1 - 0.3]) mould.push(wallBox(f, sp - 0.3, sp + 0.3, z, zc, 0.12, 0.05));
    if (p.atticEmblem) emblem(f, c, z + p.attic / 2, p.atticEmblem, out);
    if (p.volutes) {
      // scrolls sweeping down from the attic sides to the cornice (玫瑰堂, photo #23)
      const vw = p.volutes.w, vh = Math.min(p.volutes.h, p.attic);
      for (const sg of [-1, 1]) {
        const x0 = sg < 0 ? s0 : s1;
        const pts = [V2(x0, z), V2(x0 + sg * vw, z)];
        for (let k = 1; k < 10; k++) {
          const a = (k / 10) * Math.PI / 2;
          pts.push(V2(x0 + sg * vw * (1 - Math.sin(a)), z + vh * (1 - Math.cos(a))));
        }
        pts.push(V2(x0, z + vh));
        out.screens.push(onWall(f, new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: t * 0.7, bevelEnabled: false }), 0.02 - t * 0.7));
        mould.push(onWall(f, new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14).rotateX(Math.PI / 2).translate(x0 + sg * (vw - 0.3), z + 0.3, 0.06)));
      }
    }
    if (p.sign && S && S.signs[p.sign]) {
      const a = S.signs[p.sign], k = fitSign(a, s1 - s0 - 1.6, p.attic * 0.8);
      const sink = newSink();
      signQuad(sink, c, p.signZ ?? z + p.attic / 2, a.w * k, a.h * k, 0.03, a.uv);
      out.inscriptions.push(sinkGeometry(sink, edgeMatrix(f)));
    }
  }
  const zp = zc + 0.5, apex = zp + p.rise;
  mould.push(wallBox(f, s0 - 0.3, s1 + 0.3, zc, zp, 0.3, t));
  out.screens.push(onWall(f, new THREE.ExtrudeGeometry(new THREE.Shape([V2(s0, zp), V2(s1, zp), V2(c, apex)]), { depth: t, bevelEnabled: false }), 0.02 - t));
  mould.push(rakeGeometry(f, s0 - 0.3, zp + 0.35, c, apex + 0.35, 0.4, 0.2), rakeGeometry(f, c, apex + 0.35, s1 + 0.3, zp + 0.35, 0.4, 0.2));
  if (p.emblem) emblem(f, c, zp + p.rise * (p.emblem.at ?? 0.4), p.emblem, out);
  if (p.cross) {
    const k = p.cross;
    mould.push(wallBox(f, c - 0.09, c + 0.09, apex + 0.2, apex + 0.2 + k, 0.09, 0.09), wallBox(f, c - 0.32 * k, c + 0.32 * k, apex + 0.2 + 0.62 * k, apex + 0.2 + 0.75 * k, 0.09, 0.09));
  }
  if (p.flag) {
    // flagpole on the apex with the flag hanging along the wall (仁慈堂, photos #26, #40, #87)
    const top = apex + 0.35 + p.flag;
    out.iron.push(onWall(f, new THREE.CylinderGeometry(0.04, 0.06, p.flag, 6).translate(c, apex + 0.35 + p.flag / 2, -0.1)),
      onWall(f, new THREE.SphereGeometry(0.09, 6, 4).translate(c, top + 0.05, -0.1)));
    out.flags.push(onWall(f, new THREE.PlaneGeometry(1.8, 1.2).translate(c + 0.95, top - 0.7, -0.1)));
  }
}

// Engaged columns (or pilasters) in pairs at the piers or at listed s, one per storey between the string courses.
function columnsDetail(b, L, p, out) {
  const list = L.mould('columns', out);
  const spans = p.storeys || L.storeys.map((st) => [st.k ? st.floor : (p.z0 ?? 0), st.ceil]);
  for (const i of p.edges) {
    const f = edgeFrame(L.ring, i);
    const half = (p.pair || 0) / 2, margin = half + p.r + 0.15;
    for (const s0 of p.at && p.at !== 'piers' ? p.at : L.baysOf(i).piers) {
      const s = Math.min(Math.max(s0, margin), f.L - margin);
      for (const [z0, z1] of spans) for (const ds of half ? [-half, half] : [0]) column(f, s + ds, z0, z1, p.r, !!p.square, list);
    }
  }
}

// Continuous balcony on brackets under one storey's windows (市政署 centre, photo #127).
function balconyDetail(b, L, p, out) {
  const { f, ws } = L.windowed.get(p.edge) || {};
  const row = (ws || []).filter((w) => w.storey === (p.storey ?? 1));
  if (!row.length) return;
  const list = L.mould('balcony', out), d = p.depth ?? 0.9, h = p.h ?? 1.0;
  const l = Math.min(...row.map((w) => w.c - w.wd / 2 - w.surround)) - 0.35;
  const r = Math.max(...row.map((w) => w.c + w.wd / 2 + w.surround)) + 0.35;
  const z = Math.min(...row.map((w) => w.z0));
  list.push(wallBox(f, l, r, z - 0.22, z, d, 0.02), wallBox(f, l - 0.06, r + 0.06, z - 0.3, z - 0.22, d + 0.06, 0.02));
  for (const w of row) {
    for (const x of [w.c - w.wd / 2 - 0.15, w.c + w.wd / 2 + 0.15]) {
      list.push(wallBox(f, x - 0.13, x + 0.13, z - 0.62, z - 0.3, d * 0.8, 0.02), wallBox(f, x - 0.1, x + 0.1, z - 0.95, z - 0.62, d * 0.4, 0.02));
    }
  }
  ironRailing(f, l + 0.03, r - 0.03, z, h, d - 0.03, out.railings);
}

// Horizontal band (entablature, cornice) over part of a wall.
function bandDetail(b, L, p, out) {
  const f = edgeFrame(L.ring, p.edge);
  const s0 = p.s ? p.s[0] : 0, s1 = p.s ? Math.min(p.s[1], f.L) : f.L;
  L.mould('bands', out).push(wallBox(f, s0, s1, p.z[0], p.z[1], p.proj ?? 0.3, 0.05));
  if (p.lip) L.mould('bands', out).push(wallBox(f, s0 - p.lip, s1 + p.lip, p.z[1] - 0.18, p.z[1], (p.proj ?? 0.3) + p.lip, 0.05));
}

function urnsDetail(b, L, p, out) {
  const list = L.mould('urns', out);
  const z = p.z === 'top' ? b.h : p.z === 'roof' ? L.roofH : p.z;
  const o = p.o ?? (p.z === 'top' && L.F.parapet ? -L.F.parapet.t / 2 : -0.1);
  for (const i of [].concat(p.edges ?? p.edge)) {
    const f = edgeFrame(L.ring, i);
    for (const s of p.at === 'piers' ? L.baysOf(i).piers : p.at) urn(f, Math.min(Math.max(s, 0.3), f.L - 0.3), z, o, p.pedestal ?? 0, p.scale ?? 1, list);
  }
}

// Bell tower over s0..s1 of the front, `depth` deep (Sé, photos #S1–#S3): the shaft's back and side faces from the
// ground (inside the nave where the footprint covers them; the front is the facade wall, see F.wallSpans), a
// cornice, the belfry with an arched opening on each face and a bell inside, a second cornice, a balustrade with
// corner finials.
const BELL = [[0, 0.1], [0.56, 0], [0.5, 0.18], [0.4, 0.55], [0.34, 0.9], [0.2, 1.06], [0, 1.1]];
function towerDetail(b, L, p, out) {
  const f = edgeFrame(L.ring, p.edge), mould = L.mould('tower', out);
  const [s0, s1] = p.s, d = p.depth, e = 0.03, sc = (s0 + s1) / 2, i = p.inset ?? 0.4;
  const plane = (w, h, rot, x, z, o) => onWall(f, new THREE.PlaneGeometry(w, h).rotateY(rot).translate(x, z, o));
  out.screens.push(plane(s1 - s0 - 2 * e, p.body, Math.PI, sc, p.body / 2, -d + e),
    plane(d - e, p.body, -Math.PI / 2, s0 + e, p.body / 2, -(d - e) / 2), plane(d - e, p.body, Math.PI / 2, s1 - e, p.body / 2, -(d - e) / 2));
  mould.push(wallBox(f, s0 - 0.35, s1 + 0.35, p.body - 0.55, p.body + 0.12, 0.4, d + 0.35));
  // belfry: four walls with an arched opening each; the side walls fit between the front and back ones
  const zb0 = p.body + 0.12, zb1 = p.belfry - 0.5, tw = 0.5, op = p.opening;
  const ring = sideRing(f, s0 + i, s1 - i, -d + i, -i);
  for (let k = 0; k < 4; k++) {
    const g = edgeFrame(ring, k);
    const a0 = k % 2 ? tw : 0, a1 = k % 2 ? g.L - tw : g.L, oz = zb0 + op.z;
    const wall = new THREE.Shape([V2(a0, zb0), V2(a1, zb0), V2(a1, zb1), V2(a0, zb1)]);
    wall.holes.push(new THREE.Path(windowOutline(g.L / 2, oz, op.w, op.h, 'round', 10).map(([x, z]) => V2(x, z))));
    out.screens.push(onWall(g, new THREE.ExtrudeGeometry(wall, { depth: tw, bevelEnabled: false }), -tw));
    for (const [x0, x1] of [[0, 0.55], [g.L - 0.55, g.L]]) mould.push(wallBox(g, x0, x1, zb0, zb1, 0.1, 0.02));
    mould.push(wallBox(g, g.L / 2 - op.w / 2 - 0.2, g.L / 2 + op.w / 2 + 0.2, oz - 0.16, oz, 0.14, 0.02));
    if (k === 0 && p.frontFill) {
      // the front opening of the clock tower is shuttered (photos #S1, #S2)
      const s = newSink();
      planarFace(windowOutline(g.L / 2, oz, op.w, op.h, 'round', 10), [], -0.3, (x, z) => [((x - g.L / 2 + op.w / 2) / op.w) * 2, z - oz], s);
      out.panes.has(p.frontFill) || out.panes.set(p.frontFill, []);
      out.panes.get(p.frontFill).push(sinkGeometry(s, edgeMatrix(g)));
    }
  }
  const top = p.top;
  mould.push(wallBox(f, s0 + i - 0.35, s1 - i + 0.35, zb1, p.belfry, -i + 0.35, d - i + 0.35));
  if (p.clock) {
    // dials on the shaft faces listed (0 = front, 1 = +s side, 2 = back, 3 = -s side)
    const shaft = sideRing(f, s0 + e, s1 - e, -d + e, 0);
    for (const k of p.clock.faces) {
      const g = edgeFrame(shaft, k);
      clockOn(g, { ...p.clock, s: g.L / 2 }, out, mould);
    }
  }
  if (p.bell) {
    const zb = zb0 + op.z + op.h - 0.35;
    out.bells.push(onWall(f, new THREE.LatheGeometry(BELL.map(([r, y]) => V2(r * p.bell, y * p.bell)), 12).translate(sc, zb - 1.1 * p.bell, -d / 2)),
      wallBox(f, s0 + i + 0.2, s1 - i - 0.2, zb, zb + 0.25, -d / 2 + 0.15, d / 2 + 0.15));
  }
  // balustrade along the cornice edge, finials on the corner pedestals
  const ring2 = sideRing(f, s0 + i - 0.25, s1 - i + 0.25, -d + i - 0.25, -i + 0.25);
  for (let k = 0; k < 4; k++) {
    const g = edgeFrame(ring2, k);
    balustrade(g, 0, g.L, p.belfry, top - p.belfry, 0.3, [0.25, g.L / 2, g.L - 0.25], mould);
    urn(g, 0.25, top, -0.15, 0, p.finial ?? 0.65, mould);
  }
}

// Clock dial in a stone ring with hour marks and hands (Sé west tower, photos #S1, #S2).
function clockOn(f, p, out, ringList) {
  const r = p.r, m = edgeMatrix(f);
  const ring = new THREE.Shape().absarc(p.s, p.z, r + 0.3, 0, Math.PI * 2);
  ring.holes.push(new THREE.Path().absarc(p.s, p.z, r, 0, Math.PI * 2, true));
  ringList.push(onWall(f, new THREE.ExtrudeGeometry(ring, { depth: 0.14, bevelEnabled: false, curveSegments: 28 })));
  out.clockFace.push(onWall(f, new THREE.CircleGeometry(r, 32).translate(p.s, p.z, 0.05)));
  const hand = (w, len, a, o) => new THREE.BoxGeometry(w, len, 0.02).translate(0, len / 2 - 0.1, 0).rotateZ(-a).translate(p.s, p.z, o).applyMatrix4(m);
  for (let k = 0; k < 12; k++) {
    const big = k % 3 === 0, len = r * (big ? 0.2 : 0.12);
    out.iron.push(new THREE.BoxGeometry(big ? 0.09 : 0.05, len, 0.02).translate(0, r * 0.9 - len / 2, 0).rotateZ(-(k / 12) * Math.PI * 2).translate(p.s, p.z, 0.07).applyMatrix4(m));
  }
  const [hh, mm] = p.time || [10, 10];
  out.iron.push(hand(0.1, r * 0.55, ((hh % 12) + mm / 60) / 12 * Math.PI * 2, 0.08), hand(0.07, r * 0.8, (mm / 60) * Math.PI * 2, 0.09));
}
function clockDetail(b, L, p, out) {
  clockOn(edgeFrame(L.ring, p.edge), p, out, L.mould('clock', out));
}

// Lettering on a wall (市政署 frieze, photo #127), from the sign atlas.
function inscriptionDetail(b, L, p, out, S) {
  if (!S || !S.signs[p.sign]) return;
  const f = edgeFrame(L.ring, p.edge), a = S.signs[p.sign];
  const sink = newSink();
  signQuad(sink, p.s ?? f.L / 2, p.z, a.w, a.h, p.o ?? 0.02, a.uv);
  out.inscriptions.push(sinkGeometry(sink, edgeMatrix(f)));
}

const DETAIL = { pediment: pedimentDetail, columns: columnsDetail, balcony: balconyDetail, band: bandDetail, urns: urnsDetail, tower: towerDetail, clock: clockDetail, inscription: inscriptionDetail };

// Highest point a facade's mouldings may reach: the parapet, or the top of a pediment's cross or flag, or a tower's
// finials (used by the tests).
export function facadeTop(b) {
  const F = b.facade;
  const roofH = b.roof && b.roof.shape ? b.roof.shape.eave : b.h - (F.parapet ? F.parapet.h : 0);
  let top = b.h;
  for (const d of F.detail || []) {
    if (d.type === 'pediment') top = Math.max(top, (d.z === 'top' ? b.h : d.z ?? roofH) + (d.attic || 0) + 0.5 + d.rise + 0.35 + Math.max(0.2 + (d.cross || 0), d.flag ? d.flag + 0.15 : 0));
    if (d.type === 'tower') top = Math.max(top, d.top + 1.08 * (d.finial ?? 0.65));
    if (d.type === 'urns') top = Math.max(top, (d.z === 'top' ? b.h : d.z === 'roof' ? roofH : d.z) + (d.pedestal ?? 0) + 1.08 * (d.scale ?? 1));
  }
  return top;
}

// Merge prisms but keep the wall/roof split as two material groups.
function mergeFlatGrouped(geoms) {
  const walls = [], roofs = [];
  for (const g of geoms) {
    const [gw, gr] = g.groups;
    const take = (grp) => {
      if (!grp || !grp.count) return null;
      const h = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'uv']) h.setAttribute(k, g.attributes[k]);
      h.setIndex(Array.from(g.index.array.slice(grp.start, grp.start + grp.count)));
      return h.toNonIndexed();
    };
    walls.push(take(gw));
    roofs.push(take(gr));
  }
  const w = mergeFlat(walls), r = mergeFlat(roofs);
  const merged = mergeGeometries([w, r].filter(Boolean), true);
  return merged;
}

// ---------- fountain (approximate: basin + pedestal + armillary sphere) ----------
// The fountain sits in a sunken ring: three granite steps down from the square to a paved ring path,
// then a pink granite pool wall, an outer pool, a raised dark inner basin and the armillary sphere.
// Radii from the satellite radial profile, heights from photos #87 and #126 (people as scale).
// Heights are relative to the square (0); the OSM ring footway at r ≈ 5.7 m runs along the sunken path.
export const FOUNTAIN = {
  stepsOuter: 7.1, steps: 3, stepRun: 0.33, stepRise: 0.16,
  poolOuter: 4.5, poolInner: 4.0, poolTop: 0.42, poolWater: 0.27,
  basinOuter: 2.9, basinInner: 2.65, basinTop: 0.9, basinWater: 0.75,
  pedestal: { w: 0.8, bottom: 0.4, top: 1.05 },
  sphere: { r: 0.85, cz: 1.85, tube: 0.05 },
};
export const fountainFloor = () => -FOUNTAIN.steps * FOUNTAIN.stepRise;

export function circleRing(cx, cy, r, n = 64, clockwise = false) {
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = ((clockwise ? -k : k) / n) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

function buildFountain(f, mats) {
  const F = FOUNTAIN;
  const g = new THREE.Group();
  g.name = 'Fountain';
  const floor = fountainFloor();
  const V = (r, z) => new THREE.Vector2(r, z);
  const lathe = (pts, mat, name) => {
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), mat);
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  // steps: risers and treads from the square edge down to the ring path (profile listed outside-in, top-down)
  const stepPts = [V(F.stepsOuter, 0)];
  for (let k = 1; k <= F.steps; k++) {
    const r = F.stepsOuter - (k - 1) * F.stepRun;
    stepPts.push(V(r, -k * F.stepRise), V(r - F.stepRun, -k * F.stepRise));
  }
  const steps = lathe(stepPts, mats.granite, 'Fountain_Steps');
  // ring path at the bottom, paved like the square
  const pathR0 = F.poolOuter, pathR1 = F.stepsOuter - F.steps * F.stepRun;
  const ring = new THREE.RingGeometry(pathR0, pathR1, 72, 1).rotateX(-Math.PI / 2);
  const uv = ring.attributes.uv, pos = ring.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = calcadaUV(f.x + pos.getX(i), f.y - pos.getZ(i));
    uv.setXY(i, u, v);
  }
  const path = new THREE.Mesh(ring, mats.calcada);
  path.position.y = floor;
  path.name = 'Fountain_SunkenPath';
  path.receiveShadow = true;
  // pink granite pool wall and the outer pool
  const pool = lathe([V(F.poolInner, F.poolWater - 0.3), V(F.poolInner, F.poolTop), V(F.poolOuter, F.poolTop), V(F.poolOuter, floor)].reverse(), mats.poolGranite, 'Fountain_PoolWall');
  const water = new THREE.Mesh(new THREE.RingGeometry(F.basinOuter, F.poolInner, 72, 1).rotateX(-Math.PI / 2), mats.water);
  water.position.y = F.poolWater;
  water.name = 'Fountain_Water';
  // raised dark inner basin
  const basin = lathe([V(F.basinInner, F.pedestal.bottom), V(F.basinInner, F.basinTop), V(F.basinOuter, F.basinTop), V(F.basinOuter, F.poolWater - 0.05)].reverse(), mats.bronze, 'Fountain_InnerBasin');
  const inner = new THREE.Mesh(new THREE.CircleGeometry(F.basinInner, 72).rotateX(-Math.PI / 2), mats.water);
  inner.position.y = F.basinWater;
  inner.name = 'Fountain_InnerWater';
  const pedH = F.pedestal.top - F.pedestal.bottom;
  const ped = new THREE.Mesh(new THREE.BoxGeometry(F.pedestal.w, pedH, F.pedestal.w), mats.bronze);
  ped.position.y = F.pedestal.bottom + pedH / 2;
  ped.name = 'Fountain_Pedestal';
  ped.castShadow = true;
  // armillary sphere: meridian, horizon and equator rings, a broad ecliptic band, polar axis at Macau's latitude
  const S = F.sphere;
  const sphere = new THREE.Group();
  sphere.name = 'Fountain_ArmillarySphere';
  // local frame: X = north (after the group turns), Y = up; the polar axis rises toward north by the latitude
  const lat = THREE.MathUtils.degToRad(22.2), obliq = THREE.MathUtils.degToRad(23.4);
  const dir = (a) => new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
  const add = (geo, from, to) => {
    const m = new THREE.Mesh(geo, mats.bronze);
    m.quaternion.setFromUnitVectors(from, to);
    m.castShadow = true;
    sphere.add(m);
  };
  const Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
  add(new THREE.TorusGeometry(S.r, S.tube, 8, 64), Z, Z);                                   // meridian ring
  add(new THREE.TorusGeometry(S.r, S.tube, 8, 64), Z, Y);                                   // horizon ring
  add(new THREE.TorusGeometry(S.r * 0.97, S.tube, 8, 64), Z, dir(lat));                     // equator, square to the polar axis
  add(new THREE.CylinderGeometry(S.r * 0.95, S.r * 0.95, 0.16, 64, 1, true), Y, dir(lat + obliq)); // ecliptic band
  add(new THREE.CylinderGeometry(0.03, 0.03, S.r * 2.3, 8), Y, dir(lat));                   // polar axis
  sphere.rotation.y = Math.PI / 2;                              // local X -> world north (-Z)
  sphere.position.y = S.cz;
  g.add(steps, path, pool, water, basin, inner, ped, sphere);
  g.position.copy(toV3(f.x, f.y));
  g.userData = { kind: 'fountain', name: '噴水池 Fountain', note: '下沉台階、花崗岩池壁、內池及渾天儀按衛星圖和照片量度' };
  return g;
}

// Drop the parts of street strips that would float over the sunken fountain ring.
function clipAroundFountain(roads, f, R) {
  const out = [];
  for (const r of roads) {
    let cur = [];
    const flush = () => { if (cur.length > 1) out.push({ ...r, pts: cur }); cur = []; };
    const clear = R + r.w / 2 + 0.5;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, ay] = r.pts[i], [bx, by] = r.pts[i + 1];
      // segments that stay clear of the ring keep their own vertices; only nearby ones are subdivided
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((f.x - ax) * dx + (f.y - ay) * dy) / L2)) : 0;
      const far = Math.hypot(ax + dx * t - f.x, ay + dy * t - f.y) > clear;
      const n = far ? 1 : Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.5));
      for (let k = 0; k <= n; k++) {
        if (k === 0 && i > 0) continue;
        const p = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n];
        if (Math.hypot(p[0] - f.x, p[1] - f.y) < R + r.w / 2) flush();
        else cur.push(p);
      }
    }
    flush();
  }
  return out;
}

function buildTree(x, y, mats) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 2.6, 8), mats.trunk);
  trunk.position.y = 1.3;
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), mats.leaf);
  crown.position.y = 4.1;
  crown.scale.set(1, 0.85, 1);
  t.add(trunk, crown);
  t.position.copy(toV3(x, y));
  return t;
}

// 1.75 m reference person: 0.44 m shoulders, head top at 1.75 m.
export function buildFigure(color = PALETTE.figure) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.86, 0.2), m);
  legs.position.y = 0.43;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.24), m);
  torso.position.y = 0.86 + 0.31;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), m);
  head.position.y = 1.63;
  for (const p of [legs, torso, head]) { p.castShadow = true; g.add(p); }
  g.userData = { kind: 'figure', name: '比例人 1.75 m' };
  return g;
}

// ---------- streets (scripts/build_streets.py): lowered carriageways, granite kerbs, markings, furniture ----------
// Surface colours are multiplied by the greyscale detail maps (scripts/make_street_textures.py); tile sizes in metres.
export const STREET = {
  road: { asphalt: 0x6f7273, concrete: 0xbab9b3, setts: 0xa39d93 },   // concrete: the light roadway in #047, #263
  paving: 0xf0ece3,     // pavements: 0.4 m slabs
  footway: 0xf6efe0,    // side streets: plain calçada setts
  kerb: 0xd3cfc6,       // granite kerb (#047)
  marking: 0xf1f0ea,
  iron: 0x1d201f,       // cast-iron lamp posts, signal poles, bollards (#263, #047)
  railing: 0x2d4a37,    // dark green kerbside railings (#263)
  tile: { asphalt: 4, paving: 2, setts: 1.5, railing: 2 },
  markingLift: 0.01,
  kerbTop: 0.02,
};

// Pavement UVs follow the calçada band direction (Av. de Almeida Ribeiro), so slab joints run with the street.
const alignedUV = (tile) => {
  const a = (CALCADA.bandAngleDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (x, y) => [(x * c + y * s) / tile, (-x * s + y * c) / tile];
};
const worldUV = (tile) => (x, y) => [x / tile, y / tile];

// Vertical kerb faces along rings that keep the carriageway on their left, from the roadway up to the kerb top.
function kerbFaceGeometry(rings, y0, y1) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const ring of rings) {
    let s = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;   // left of a -> b, into the carriageway
      const base = pos.length / 3;
      for (const [p, y, u] of [[a, y0, s], [b, y0, s + L], [b, y1, s + L], [a, y1, s]]) {
        pos.push(p[0], y, -p[1]);
        nor.push(nx, 0, -ny);
        uv.push(u, y - y0);
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      s += L;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Railing panels along polylines, `h` high, u = metres / tile so the alpha-masked bars keep their spacing.
function railingGeometry(lines, h, tile) {
  const pos = [], nor = [], uv = [], idx = [];
  for (const line of lines) {
    let s = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i], b = line[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 1e-3) continue;
      const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
      const base = pos.length / 3;
      for (const [p, y, u] of [[a, 0, s], [b, 0, s + L], [b, h, s + L], [a, h, s]]) {
        pos.push(p[0], y, -p[1]);
        nor.push(nx, 0, -ny);
        uv.push(u / tile, y / h);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      s += L;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// ---------- street furniture: low-poly kit, built facing +X (the item's front) and placed by heading ----------
// heading: radians from east, counter-clockwise in data axes; makeRotationY(h) turns +X to (cos h, -sin h) in three.js,
// which is data (cos h, sin h).
const cyl = (rTop, rBot, h, y0, seg = 8, x = 0, z = 0) => new THREE.CylinderGeometry(rTop, rBot, h, seg).translate(x, y0 + h / 2, z);
const boxAt = (dx, dy, dz, x, y0, z) => new THREE.BoxGeometry(dx, dy, dz).translate(x, y0 + dy / 2, z);
const disc = (r, x, y, z) => new THREE.CircleGeometry(r, 10).rotateY(Math.PI / 2).translate(x, y, z);
const placeAt = (g, x, y, heading = 0) => g.applyMatrix4(new THREE.Matrix4().makeRotationY(heading).setPosition(x, 0, -y));
const tintGeo = (g, hex) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
  return g;
};

// Lantern on a post or bracket (#263, #087): tapered square glass body, pyramid cap, finial; `y0` is its foot.
function lantern(y0, x = 0, z = 0, scale = 1) {
  const k = scale;
  return {
    iron: [cyl(0.13 * k, 0.05 * k, 0.1 * k, y0, 4, x, z), cyl(0.02 * k, 0.24 * k, 0.2 * k, y0 + 0.54 * k, 4, x, z), cyl(0.02 * k, 0.035 * k, 0.16 * k, y0 + 0.74 * k, 6, x, z)],
    glass: [cyl(0.19 * k, 0.14 * k, 0.44 * k, y0 + 0.1 * k, 4, x, z)],
  };
}

export const FURNITURE = {
  // double-lantern cast-iron post of Av. de Almeida Ribeiro (#263, #047): lanterns either side along the kerb
  lampDouble() {
    const iron = [cyl(0.2, 0.25, 0.5, 0), cyl(0.12, 0.16, 0.3, 0.5), cyl(0.065, 0.09, 3.55, 0.8), cyl(0.04, 0.07, 0.35, 4.35, 6),
      boxAt(0.07, 0.07, 1.2, 0, 4.05, 0), cyl(0.03, 0.03, 0.28, 3.85, 6, 0, 0.55), cyl(0.03, 0.03, 0.28, 3.85, 6, 0, -0.55)];
    const glass = [];
    for (const z of [0.55, -0.55]) { const l = lantern(4.12, 0, z); iron.push(...l.iron); glass.push(...l.glass); }
    return { iron, glass };
  },
  // single-lantern post at the edge of the square (#087, #049)
  lamp() {
    const l = lantern(3.6, 0, 0, 1.1);
    return { iron: [cyl(0.17, 0.21, 0.45, 0), cyl(0.06, 0.085, 3.15, 0.45), ...l.iron], glass: l.glass };
  },
  // vehicle signal: black pole, head facing the oncoming traffic, red lit (#047); `faces` 2 adds a head facing back
  signal(faces = 1) {
    const iron = [cyl(0.06, 0.075, 3.3, 0)], lights = [];
    for (const sgn of faces === 2 ? [1, -1] : [1]) {
      iron.push(boxAt(0.24, 0.95, 0.34, 0.16 * sgn, 2.3, 0));
      const head = [disc(0.1, 0.285, 3.0, 0), disc(0.1, 0.285, 2.75, 0), disc(0.1, 0.285, 2.5, 0)];
      [0xff3b2f, 0x4a3a12, 0x173a22].forEach((c, i) => { tintGeo(head[i], c); if (sgn < 0) head[i].rotateY(Math.PI); });
      lights.push(...head);
    }
    return { iron, lights };
  },
  // pedestrian signal at a signalled crossing, facing across the road
  pedSignal() {
    const lights = [tintGeo(disc(0.09, 0.2, 2.42, 0), 0xff3b2f), tintGeo(disc(0.09, 0.2, 2.18, 0), 0x173a22)];
    return { iron: [cyl(0.05, 0.065, 2.65, 0), boxAt(0.2, 0.55, 0.3, 0.11, 2.02, 0)], lights };
  },
  // bus stop pole with a route board standing out over the kerb (OSM bus_stop nodes)
  busStop() {
    return { metal: [cyl(0.04, 0.045, 2.9, 0)], sign: [boxAt(0.48, 0.62, 0.04, 0.26, 2.2, 0), boxAt(0.04, 0.55, 0.32, 0.06, 1.15, 0)] };
  },
  bollard() { return { iron: [cyl(0.09, 0.11, 0.82, 0), cyl(0.03, 0.1, 0.1, 0.82)] }; },
  block() { return { stone: [boxAt(0.5, 0.6, 0.5, 0, 0, 0)] }; },
  postBox() { return { post: [cyl(0.22, 0.22, 1.05, 0, 12), cyl(0.12, 0.25, 0.16, 1.05, 12)] }; },
  // large urn with a two-tier clipped shrub (#105, #028, #031)
  pot() {
    const prof = [[0, 0], [0.28, 0], [0.31, 0.08], [0.26, 0.16], [0.4, 0.55], [0.46, 0.62], [0.44, 0.7], [0, 0.7]].map(([r, h]) => new THREE.Vector2(r, h));
    return {
      planter: [new THREE.LatheGeometry(prof, 10)],
      topiary: [cyl(0.04, 0.05, 1.3, 0.7, 6), new THREE.IcosahedronGeometry(0.55, 1).translate(0, 1.25, 0), new THREE.IcosahedronGeometry(0.38, 1).translate(0, 1.98, 0)],
    };
  },
  // wooden bench with black iron ends, facing +X (#105)
  bench() {
    return {
      wood: [boxAt(0.44, 0.05, 1.8, 0, 0.42, 0), boxAt(0.05, 0.36, 1.8, -0.21, 0.52, 0)],
      iron: [boxAt(0.5, 0.86, 0.06, -0.02, 0, 0.84), boxAt(0.5, 0.86, 0.06, -0.02, 0, -0.84)],
    };
  },
  bin() { return { bin: [cyl(0.24, 0.21, 0.88, 0, 10), cyl(0.255, 0.255, 0.07, 0.88, 10)] }; },
};

// Bracket lanterns on the square facades (#049, #105, #031): on every other pier above the ground-floor line.
function wallLanterns(f, piers, z, out) {
  for (let k = 1; k < piers.length - 1; k += 2) {
    const m = edgeMatrix(f);
    const s = piers[k];
    out.iron.push(boxAt(0.05, 0.05, 0.6, s, z + 0.55, 0.3).applyMatrix4(m), boxAt(0.04, 0.4, 0.04, s, z + 0.2, 0.02).applyMatrix4(m));
    const l = lantern(z - 0.25, s, 0.6, 0.85);
    out.iron.push(cyl(0.015, 0.015, 0.2, z + 0.4, 4, s, 0.6).applyMatrix4(m), ...l.iron.map((g) => g.applyMatrix4(m)));
    out.glass.push(...l.glass.map((g) => g.applyMatrix4(m)));
  }
}

function buildStreets(data, mats) {
  const st = data.streets;
  const drop = -st.kerb.drop;
  const group = new THREE.Group();
  group.name = 'Streets';
  const add = (geo, mat, name, userData = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.receiveShadow = true;
    m.userData = { kind: 'street', ...userData };
    group.add(m);
    return m;
  };
  for (const [surface, polys] of Object.entries(st.carriageway)) {
    if (!polys.length) continue;
    const uvFn = surface === 'setts' ? alignedUV(STREET.tile.setts) : worldUV(STREET.tile.asphalt);
    add(flatGeometry(polys, drop, uvFn), mats[`road_${surface}`], `Carriageway_${surface}`, { name: `車路（${surface}）` });
  }
  const kerb = mergeFlat([kerbFaceGeometry(st.kerbs, drop, STREET.kerbTop), flatGeometry(st.kerbBand, STREET.kerbTop, alignedUV(STREET.tile.paving))]);
  add(kerb, mats.kerb, 'Kerbs', { name: '花崗岩路緣石' }).castShadow = true;
  add(flatGeometry(st.footways, 0.012, alignedUV(STREET.tile.setts)), mats.footway, 'Footways', { name: '行人路' });
  add(flatGeometry(st.markings.map((r) => ({ outer: r })), drop + STREET.markingLift), mats.marking, 'Road_Markings', { name: '行車線及斑馬線' });
  add(railingGeometry(st.furniture.railing, 1.0, STREET.tile.railing), mats.railing, 'Railings', { name: '路邊欄杆' }).castShadow = true;

  // furniture: one merged mesh per material
  const F = st.furniture;
  const buckets = {};
  const put = (parts, x, y, h) => {
    for (const [k, list] of Object.entries(parts)) for (const g of list) (buckets[k] ??= []).push(placeAt(toFlat(g), x, y, h));
  };
  for (const [x, y, h] of F.lampDouble) put(FURNITURE.lampDouble(), x, y, h);
  for (const [x, y] of F.lamp) put(FURNITURE.lamp(), x, y, 0);
  for (const [x, y, h, faces] of F.signal) put(FURNITURE.signal(faces), x, y, h);
  for (const [x, y, h] of F.pedSignal) put(FURNITURE.pedSignal(), x, y, h);
  for (const [x, y, h] of F.busStop) put(FURNITURE.busStop(), x, y, h);
  for (const [x, y] of F.bollard) put(FURNITURE.bollard(), x, y, 0);
  for (const [x, y] of F.block) put(FURNITURE.block(), x, y, 0);
  for (const [x, y, h] of F.postBox) put(FURNITURE.postBox(), x, y, h);
  for (const [x, y] of F.pot) put(FURNITURE.pot(), x, y, hash01(`${x},${y}`) * Math.PI);
  for (const [x, y, h] of F.bench) put(FURNITURE.bench(), x, y, h);
  for (const [x, y] of F.bin) put(FURNITURE.bin(), x, y, 0);
  const furniture = new THREE.Group();
  furniture.name = 'StreetFurniture';
  for (const [k, list] of Object.entries(buckets)) {
    const geo = k === 'lights' ? mergeGeometries(list.map((g) => { g.clearGroups(); return g; }), false) : mergeFlat(list);
    const m = new THREE.Mesh(geo, mats[`f_${k}`]);
    m.name = `Furniture_${k}`;
    m.castShadow = k !== 'lights' && k !== 'glass';
    m.receiveShadow = true;
    m.userData = { kind: 'furniture', part: k };
    furniture.add(m);
  }
  return { group, furniture };
}

// ---------- main ----------
// opts.mode: 'viewer' (merged meshes + picking tables) | 'export' (one node per building near the square)
// opts.calcadaTexture: THREE.Texture for the square paving (viewer); export injects it afterwards
export function buildSenado(data, opts = {}) {
  const mode = opts.mode || 'viewer';
  const root = new THREE.Group();
  root.name = 'LargoDoSenado';
  root.userData = { units: 'metres', origin: data.meta.origin, source: data.meta.source };

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra });
  const named = (m, n) => { m.name = n; return m; };
  const mats = {
    ground: named(std(PALETTE.ground), 'Ground'),
    road: named(std(PALETTE.road), 'Road'),
    green: named(std(PALETTE.green), 'Grass'),
    water: named(std(PALETTE.water, { roughness: 0.2 }), 'Water'),
    stone: named(std(PALETTE.stone), 'Stone'),
    bronze: named(std(0x4a4038, { metalness: 0.4, roughness: 0.55 }), 'Bronze'),
    granite: named(std(PALETTE.granite), 'Granite'),
    poolGranite: named(std(PALETTE.poolGranite), 'PoolGranite'),
    trunk: named(std(0x6b5a48), 'Trunk'),
    leaf: named(std(0x5f7a4c), 'Foliage'),
    calcada: named(std(0xffffff, { map: opts.calcadaTexture || null, color: opts.calcadaTexture ? 0xffffff : PALETTE.calcadaLight }), 'Calcada'),
  };
  // streets and furniture; the detail maps (opts.streetTextures) are injected by the GLB exporter
  const T = opts.streetTextures || {};
  Object.assign(mats, {
    paving: named(std(STREET.paving, { map: T.paving || null }), 'Paving'),
    road_asphalt: named(std(STREET.road.asphalt, { map: T.asphalt || null }), 'Road_asphalt'),
    road_concrete: named(std(STREET.road.concrete, { map: T.asphalt || null }), 'Road_concrete'),
    road_setts: named(std(STREET.road.setts, { map: T.setts || null }), 'Road_setts'),
    footway: named(std(STREET.footway, { map: T.setts || null }), 'Footway'),
    kerb: named(std(STREET.kerb), 'Kerb'),
    marking: named(std(STREET.marking, { roughness: 0.7 }), 'Road_marking'),
    // alpha-masked bars; the low cutoff keeps them visible in the far mip levels
    railing: named(std(STREET.railing, { map: T.railing || null, alphaTest: 0.3, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.6 }), 'Railing'),
    f_iron: named(std(STREET.iron, { roughness: 0.55, metalness: 0.3 }), 'Iron'),
    f_glass: named(std(0xfff4dc, { emissive: new THREE.Color(0xffe2a8).multiplyScalar(0.25), roughness: 0.3 }), 'Lamp_glass'),   // faint glow, baked into the colour
    f_lights: named(new THREE.MeshBasicMaterial({ vertexColors: true }), 'Signal_lights'),
    f_metal: named(std(0x8c9196, { roughness: 0.5, metalness: 0.4 }), 'Metal'),
    f_sign: named(std(0xe9e6dc), 'Sign'),
    f_stone: named(std(STREET.kerb), 'Concrete_block'),
    f_post: named(std(0xb3302b, { roughness: 0.6 }), 'Post_box'),
    f_planter: named(std(0x9d7458), 'Planter'),
    f_topiary: named(std(0x4c7637), 'Topiary'),
    f_wood: named(std(0x8a6847), 'Bench_wood'),
    f_bin: named(std(0x2f5f9a, { roughness: 0.6 }), 'Bin'),
    // shopfronts: the atlas is both colour and emissive map (export_glb.mjs injects it into both slots)
    shop: named(std(0xffffff, { map: opts.shopTexture || null, emissiveMap: opts.shopTexture || null, emissive: new THREE.Color(SHOP.glow, SHOP.glow, SHOP.glow), roughness: 0.18 }), 'Shopfront'),
    shopFrame: named(std(SHOP.frame, { roughness: 0.45, metalness: 0.35 }), 'Shop_frame'),
    fascia: named(std(SHOP.fascia, { roughness: 0.6 }), 'Shop_fascia'),
    // shop signs: one alpha-masked atlas (export_glb.mjs injects signs.png); a faint glow keeps fascias legible in the arcades
    sign: named(std(0xffffff, { map: opts.signTexture || null, emissiveMap: opts.signTexture || null, emissive: new THREE.Color(0.12, 0.12, 0.12), alphaTest: 0.5, alphaToCoverage: true, roughness: 0.5 }), 'Shop_sign'),
  });
  const awningMats = new Map();
  const signAwningMat = (hex) => {
    if (!awningMats.has(hex)) awningMats.set(hex, named(std(new THREE.Color(hex).getHex(), { side: THREE.DoubleSide, roughness: 0.85 }), `Awning_${hex.replace('#', '')}`));
    return awningMats.get(hex);
  };
  const matCache = new Map();
  const colorMat = (hex, name) => {
    const key = `${name}:${hex}`;
    if (!matCache.has(key)) matCache.set(key, named(std(hex), name));
    return matCache.get(key);
  };

  // ground, with a hole where the fountain ring is sunk below the square
  const fc = data.fountain;
  const sunk = fc ? [circleRing(fc.x, fc.y, FOUNTAIN.stepsOuter, 72, true)] : [];
  const [x0, y0, x1, y1] = data.meta.bounds;
  const pad = 30;
  const st = data.streets;
  // the fountain hole goes into whichever polygon contains the fountain
  const withSunk = (list) => {
    if (!fc) return list;
    const k = list.findIndex((q) => pointIn([fc.x, fc.y], q.outer) && !(q.holes || []).some((h) => pointIn([fc.x, fc.y], h)));
    return list.map((q, i) => (i === k ? { ...q, holes: [...(q.holes || []), ...sunk] } : q));
  };
  const ground = st
    ? new THREE.Mesh(flatGeometry(withSunk(st.ground), 0, alignedUV(STREET.tile.paving)), mats.paving)
    : new THREE.Mesh(
      flatGeometry([{ outer: [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad]], holes: sunk }], 0),
      mats.ground,
    );
  ground.name = 'Ground';
  ground.receiveShadow = true;
  root.add(ground);

  // streets: lowered carriageways, kerbs, markings and furniture (build_streets.py); plain strips without that data
  if (st) {
    const { group, furniture } = buildStreets(data, mats);
    root.add(group, furniture);
  } else {
    const roadsKept = fc ? clipAroundFountain(data.roads, fc, FOUNTAIN.stepsOuter) : data.roads;
    const roads = new THREE.Group();
    roads.name = 'Streets';
    const carMesh = new THREE.Mesh(stripGeometry(roadsKept.filter((r) => r.car), 0.02), mats.road);
    carMesh.name = 'Streets_Vehicle';
    const footMesh = new THREE.Mesh(stripGeometry(roadsKept.filter((r) => !r.car), 0.012), named(std(PALETTE.footway), 'Footway'));
    footMesh.name = 'Streets_Pedestrian';
    for (const m of [carMesh, footMesh]) { m.receiveShadow = true; roads.add(m); }
    root.add(roads);
  }

  const green = new THREE.Mesh(flatGeometry(data.green, 0.03), mats.green);
  green.name = 'Grass';
  green.receiveShadow = true;
  root.add(green);

  // squares (calçada); with street data the paving runs on to the facades and the avenue kerb
  const squares = withSunk(st && st.plaza ? st.plaza : data.squares);
  const sq = new THREE.Mesh(flatGeometry(squares, 0.04, calcadaUV), mats.calcada);
  sq.name = 'Calcada_Squares';
  sq.receiveShadow = true;
  sq.userData = { kind: 'square', name: '議事亭前地／板樟堂前地', note: '葡式碎石波浪地磚' };
  root.add(sq);

  // buildings
  // Walls: photo-sampled colour (facade spec), the landmark's listed colour, else the weighted generic palette.
  // Roofs: the satellite roof class. Generic colours vary by a few percent per building so neighbours separate.
  const lmByKey = Object.fromEntries(data.landmarks.map((l) => [l.key, l]));
  const generic = (data.genericWalls || []).map((c) => new THREE.Color(c.hex));
  const roofPal = Object.fromEntries(Object.entries(data.roofPalette || {}).map(([k, v]) => [k, new THREE.Color(v.hex)]));
  const wallColor = (b) => {
    if (b.facade && b.facade.wallColor) return new THREE.Color(b.facade.wallColor.hex);
    if (b.tier === 'landmark') return new THREE.Color(lmByKey[b.key].facade);
    if (b.wallGeneric != null && generic[b.wallGeneric]) return generic[b.wallGeneric].clone().multiplyScalar(0.95 + 0.08 * hash01(`${b.id}:tone`));
    return new THREE.Color(b.tier === 'context' ? PALETTE.context : PALETTE.core);
  };
  const roofColor = (b) => {
    const c = roofPal[b.roof && b.roof.cls] || new THREE.Color(PALETTE.coreRoof);
    return b.facade ? c.clone() : c.clone().multiplyScalar(0.94 + 0.12 * hash01(`${b.id}:roof`));
  };
  const info = (b) => ({
    kind: 'building', id: b.id, name: b.name, key: b.key, tier: b.tier,
    height: b.h, heightSource: b.hSrc, minHeight: b.minH, distToSquare: b.dSquare,
  });

  const buildingsGroup = new THREE.Group();
  buildingsGroup.name = 'Buildings';
  root.add(buildingsGroup);
  const all = data.buildings.concat(data.parts);
  const tiers = ['landmark', 'frontage', 'avenue', 'core', 'part', 'context'];
  const pickTables = [];
  const trimMat = named(std(PALETTE.trim), 'Trim');
  // vertex-coloured materials shared by all buildings without a facade spec; Facade_generic carries the window grid
  const vcol = (n, extra = {}) => named(std(0xffffff, { vertexColors: true, ...extra }), n);
  const gridMat = vcol('Facade_generic', { map: opts.facadeTexture || null });
  gridMat.userData.windowGrid = true;
  const plainMat = vcol('Facade_plain');
  const roofMat = vcol('Roof');
  const rooftopMat = vcol('Rooftop');
  const awningMat = named(std(PALETTE.awning, { side: THREE.DoubleSide }), 'Awning');
  // landmark detail (v8)
  const ornamentMats = {
    blooms: named(std(0xc8324a, { roughness: 0.8 }), 'Flowers'),
    clockFace: named(std(0xf3f0e6, { roughness: 0.5 }), 'Clock_face'),
    emblems: named(std(0x2c3a33, { roughness: 0.6 }), 'Emblem'),
    flags: named(std(0x0b7a5c, { side: THREE.DoubleSide, roughness: 0.9 }), 'Flag'),   // Macau SAR flag green
    railing: named(std(((data.windowColors || {}).lattice || {}).hex || 0x2c2a2d, { side: THREE.DoubleSide, roughness: 0.6 }), 'Railing_iron'),
  };
  const paneMats = new Map();
  const paneMat = (key) => {
    if (key === 'shop') return mats.shop;
    if (!paneMats.has(key)) {
      const wc = (data.windowColors || {})[key] || {};
      const shutter = key.startsWith('shutter');
      const glazed = key === 'glass' || key.startsWith('glaze');
      const map = (shutter ? opts.louvreTexture : glazed ? opts.glazingTexture : null) || null;
      // with the glazing map the colour is the bar colour and the map darkens the panes; without it, the mean colour
      const color = glazed && (map || opts.mode === 'export') && wc.frame ? wc.frame : wc.hex || PALETTE.glass;
      const m = std(color, { roughness: glazed ? 0.3 : 0.85, map });
      m.userData.detailMap = shutter ? 'louvre' : glazed ? 'glazing' : null;
      paneMats.set(key, named(m, `Window_${key}`));
    }
    return paneMats.get(key);
  };
  for (const tier of tiers) {
    const tierList = all.filter((b) => b.tier === tier);
    if (!tierList.length) continue;
    const tg = new THREE.Group();
    tg.name = `Buildings_${tier}`;
    buildingsGroup.add(tg);
    // buildings with a photo-based facade spec get arcades, bands, cornice and parapet
    for (const b of tierList.filter((q) => q.facade)) {
      const label = tier === 'landmark' ? b.key : tier;
      const wcol = b.facade.wallColor;
      const wallMat = colorMat(wallColor(b).getHex(), `Wall_${wcol ? wcol.key : label}`);
      const roofCls = (b.roof && b.roof.cls) || 'grey';
      const trim = wcol && wcol.trim ? colorMat(new THREE.Color(wcol.trim).getHex(), `Trim_${wcol.key}`) : trimMat;
      const stone = colorMat(new THREE.Color((wcol && wcol.stone) || PALETTE.stoneGrey).getHex(), `Stone_${wcol ? wcol.key : label}`);
      const g = facadeGeometries(b, data.shopSigns || null);
      const grp = new THREE.Group();
      grp.name = `B_${b.id}${b.key ? '_' + b.key : ''}`;
      grp.userData = { ...info(b), facadeStyle: b.facade.style, evidence: b.facade.evidence };
      const parts = [
        ['body', g.walls, [wallMat, colorMat(roofColor(b).getHex(), `Roof_${roofCls}`)]],
        ['arcade', g.screens, wallMat],
        ['trim', g.trim, trim],
        ['stone', g.stone, stone],
        ['windows', g.panes && g.panes.geometry, g.panes && g.panes.keys.map(paneMat)],
        ['awnings', g.awnings, awningMat],
        ['railings', g.railings, ornamentMats.railing],
        ['lanterns', g.lanterns, mats.f_iron],
        ['lanternGlass', g.lanternGlass, mats.f_glass],
        ['shops', g.shops, mats.shop],
        ['shopFrames', g.shopFrames, mats.shopFrame],
        ['fascias', g.fascias, mats.fascia],
        ['signs', g.signs, mats.sign],
        ['signBoards', g.signBoards, mats.shopFrame],
        ['roofSigns', g.roofSigns, mats.sign],
        ...g.signAwnings.map((a, k) => [`signAwnings${k || ''}`, a.geometry, signAwningMat(a.color)]),
        ['planters', g.planters, mats.f_planter],
        ['leaves', g.leaves, mats.f_topiary],
        ['blooms', g.blooms, ornamentMats.blooms],
        ['bells', g.bells, mats.bronze],
        ['clockFace', g.clockFace, ornamentMats.clockFace],
        ['emblems', g.emblems, ornamentMats.emblems],
        ['flag', g.flags, ornamentMats.flags],
        ['inscriptions', g.inscriptions, mats.sign],
      ];
      for (const [part, geo, mat] of parts) {
        if (!geo) continue;
        const m = new THREE.Mesh(geo, mat);
        m.name = `${grp.name}_${part}`;
        m.userData = { ...info(b), facadeStyle: b.facade.style };
        m.castShadow = m.receiveShadow = true;
        grp.add(m);
      }
      tg.add(grp);
    }
    // opts.skip: buildings the viewer rebuilds itself (v9 streetscape, viewer/streetscape.js)
    const list = tierList.filter((q) => !q.facade && !(opts.skip && opts.skip.has(q.id)));
    if (!list.length) continue;
    const cols = new Map(list.map((b) => [b, [wallColor(b), roofColor(b)]]));
    const individual = mode === 'export' ? tier !== 'context' : tier === 'landmark' || tier === 'frontage' || tier === 'avenue';
    if (individual) {
      for (const b of list) {
        const plain = tier === 'landmark' && lmByKey[b.key].windowGrid === false;   // churches: no window grid
        const mesh = new THREE.Mesh(massGeometry(b, ...cols.get(b)), [plain ? plainMat : gridMat, roofMat]);
        mesh.name = `B_${b.id}${b.key ? '_' + b.key : ''}`;
        mesh.userData = info(b);
        mesh.castShadow = mesh.receiveShadow = true;
        tg.add(mesh);
        if (b.shops && data.shopSigns) {
          // rooftop signs (Hotel Central) on a building without a facade spec
          const rs = roofSignGeometries(b, data.shopSigns);
          for (const [part, geo, mat] of [['roofSigns', rs.roofSigns, mats.sign], ['signBoards', rs.signBoards, mats.shopFrame]]) {
            if (!geo) continue;
            const m = new THREE.Mesh(geo, mat);
            m.name = `${mesh.name}_${part}`;
            m.userData = info(b);
            m.castShadow = m.receiveShadow = true;
            tg.add(m);
          }
        }
      }
    } else {
      const { geometry, triOwner } = mergePrisms(list.map((b) => massGeometry(b, ...cols.get(b))));
      const mesh = new THREE.Mesh(geometry, [gridMat, roofMat]);
      mesh.name = `Buildings_${tier}_merged`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { kind: 'merged', tier };
      pickTables.push({ mesh, triOwner, list });
      tg.add(mesh);
    }
    // rooftop housings and tanks, one mesh per tier (the far context gets housings only)
    const sink = newColorSink();
    for (const b of list) rooftopClutter(b, ...cols.get(b), sink, tier !== 'context');
    if (sink.idx.length) {
      const m = new THREE.Mesh(colorSinkGeometry(sink), rooftopMat);
      m.name = `Rooftops_${tier}`;
      m.castShadow = m.receiveShadow = true;
      m.userData = { kind: 'rooftops', tier };
      tg.add(m);
    }
  }

  if (data.fountain) root.add(buildFountain(data.fountain, mats));

  const trees = new THREE.Group();
  trees.name = 'Trees';
  for (const [x, y] of data.trees) trees.add(buildTree(x, y, mats));
  trees.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.add(trees);

  return { root, pickTables, info, materials: mats, wallColor, roofColor };
}

export function landmarkAnchors(data) {
  const out = [];
  for (const b of data.buildings) {
    if (b.tier !== 'landmark') continue;
    const lm = data.landmarks.find((l) => l.key === b.key);
    let cx = 0, cy = 0;
    for (const p of b.outer) { cx += p[0]; cy += p[1]; }
    cx /= b.outer.length; cy /= b.outer.length;
    out.push({ key: b.key, label: lm.short || lm.zh, sub: lm.pt, x: cx, y: cy, h: b.h, lm, b });
  }
  return out;
}
