// Copied unchanged from senado/viewer/model.js by scripts/senado-extract.mjs.
// Edit it in the Senado project and re-run the script.

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
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
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
function pointIn(p, ring) {
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

const newColorSink = () => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
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

function rooftopClutter(b, wallCol, roofCol, sink, tanks) {
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

function colorSinkGeometry(s) {
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

function edgeFrame(ring, i) {
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

// Bay layout shared by the arcade and the pilasters above it: end piers of width `pier`, n equal bays between.
export function bayLayout(L, bay, pier) {
  const n = Math.max(1, Math.round((L - pier) / bay));
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

// Opening outline, counter-clockwise: flat bottom at z0, total height h, head given by shape.
export function windowOutline(c, z0, w, h, shape, seg = 8, rise = headRise(w, h, shape)) {
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

// One facade wall from z0 to z1 with its window openings: the wall face plus the reveals (jambs, sill, head)
// running `depth` into the wall. Returned with the prism's two groups (walls, empty roof) so it merges with the body.
function holedWall(f, z0, z1, openings) {
  const s = newSink();
  planarFace([[0, z0], [f.L, z0], [f.L, z1], [0, z1]], openings.map((w) => w.pts), 0, (x, z) => [x, z], s);
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
function windowDressing(f, w, trim, awnings, railings) {
  const m = edgeMatrix(f);
  const { c, z0, wd, h, shape } = w;
  const sw = w.surround;
  const l = c - wd / 2, r = c + wd / 2, topZ = z0 + h;
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
      // iron balconette: thin dark railing on a shallow slab
      trim.push(wallBox(f, l - sw - 0.1, r + sw + 0.1, z0 - 0.14, z0, 0.42, 0.02));
      railings.push(wallBox(f, l - sw - 0.05, r + sw + 0.05, z0, z0 + bh, 0.4, -0.36));
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
        c, z0, wd, h, shape, depth, surround: sw, storey: st.k,
        fill: full.fill || 'glass', panel: full.panel || null, keystone: !!full.keystone, hood: full.hood || null,
        balustrade: full.balustrade || null, awning: !!full.awning,
        pts: windowOutline(c, z0, wd, h, shape),
      });
    }
  }
  return out;
}

// Returns { walls, trim, screens, panes, awnings, railings } geometries for one building with a facade spec.
export function facadeGeometries(b) {
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
  const bays = (f) => bayLayout(f.L, F.arcade ? F.arcade.bay : F.bay || 3.8, F.arcade ? F.arcade.pier : 0.9);

  // which walls get windows, and their openings
  const W = F.windows && F.windows.shape ? F.windows : null;
  const windowed = new Map();
  if (W) {
    for (const i of F.edges) {
      const f = edgeFrame(ring, i);
      if (f.L < 2.5) continue;
      const ws = windowLayout(f, W, storeys, bays(f), (F.edgeKinds || {})[i]);
      if (ws.length) windowed.set(i, { f, ws });
    }
  }
  const skip = new Set(windowed.keys());

  const out = { walls: [], trim: [], screens: [], panes: new Map(), awnings: [], railings: [] };
  const addPane = (key, g) => { if (!out.panes.has(key)) out.panes.set(key, []); out.panes.get(key).push(g); };
  if (arcadeEdges.length) {
    if (!F.passage) {                                          // a passage (lane under the building) has no ground floor
      const depth = new Map(arcadeEdges.map((i) => [i, arcade.depth]));
      const recessed = offsetEdges(ring, depth);
      out.walls.push(prismGeometry(recessed, b.holes, aH, 0, { roof: false }));
    }
    const upper = prismGeometry(ring, b.holes, roofH, aH, { bottom: true, skip, roof: !pitched });
    out.walls.push(upper);
    for (const i of arcadeEdges) out.screens.push(arcadeScreenGeometry(edgeFrame(ring, i), arcade));
  } else {
    out.walls.push(prismGeometry(ring, b.holes, roofH, 0, { skip, roof: !pitched }));
  }
  if (pitched) out.walls.push(gableGeometry(ring, pitched));
  for (const { f, ws } of windowed.values()) {
    out.walls.push(holedWall(f, arcadeEdges.length ? aH : 0, roofH, ws));
    for (const w of ws) {
      windowPanes(f, w, addPane);
      windowDressing(f, w, out.trim, out.awnings, out.railings);
    }
  }

  for (const i of F.edges) {
    const f = edgeFrame(ring, i);
    if (f.L < 1.5) continue;
    const ext = 0.25;                                          // run past the corner so bands meet
    lines.forEach((lz, k) => {
      const main = k === 0 && arcadeEdges.length;
      const hBand = main ? 0.6 : 0.28, proj = main ? 0.2 : 0.12;
      if (lz + hBand < corniceZ) out.trim.push(wallBox(f, -ext, f.L + ext, lz, lz + hBand, proj, 0.05));
    });
    if (F.cornice) out.trim.push(wallBox(f, -ext - F.cornice.proj, f.L + ext + F.cornice.proj, corniceZ, roofH, F.cornice.proj, 0.05));
    if (F.pilasters) {
      const { piers } = bayLayout(f.L, F.arcade ? F.arcade.bay : F.bay || 3.8, F.arcade ? F.arcade.pier : 0.9);
      const z0 = lines.length ? lines[0] + (arcadeEdges.length ? 0.6 : 0.28) : 0;
      for (const p of piers) out.trim.push(wallBox(f, p - 0.28, p + 0.28, z0, corniceZ, 0.1, 0.05));
    }
  }
  if (pitched) {
    // white raking cornice along the gable ends of the facade walls
    const P = gableProfile(ring, pitched);
    for (const i of F.edges) {
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
  if (F.frontispiece) frontispiece(F, edgeFrame(ring, F.edges[0]), roofH, out);
  if (F.parapet) {
    const inner = offsetEdges(ring, new Map(ring.map((_, i) => [i, F.parapet.t])));
    out.trim.push(prismGeometry(ring, [inner.slice().reverse()], b.h, roofH));
    for (let i = 0; i < ring.length; i++) {
      const f = edgeFrame(ring, i);
      if (f.L > 0.5) out.trim.push(wallBox(f, -0.05, f.L + 0.05, b.h - 0.14, b.h, 0.06, F.parapet.t));   // coping
    }
  }
  const paneKeys = [...out.panes.keys()];
  return {
    walls: mergeFlatGrouped(out.walls),
    trim: mergeFlat(out.trim),
    screens: mergeFlat(out.screens),
    panes: paneKeys.length ? { keys: paneKeys, geometry: mergeGeometries(paneKeys.map((k) => mergeFlat(out.panes.get(k))), true) } : null,
    awnings: mergeFlat(out.awnings),
    railings: mergeFlat(out.railings),
    windowCount: [...windowed.values()].reduce((n, e) => n + e.ws.length, 0),
  };
}

// Sloped moulding under a roof line from (s0, z0) to (s1, z1) on wall f: `t` high, standing `proj` proud of the wall.
function rakeGeometry(f, s0, z0, s1, z1, t, proj) {
  const V = (x, z) => new THREE.Vector2(x, z);
  const shp = new THREE.Shape([V(s0, z0 - t), V(s1, z1 - t), V(s1, z1), V(s0, z0)]);
  return new THREE.ExtrudeGeometry(shp, { depth: proj, bevelEnabled: false }).applyMatrix4(edgeMatrix(f));
}

// Church front above the main cornice (玫瑰堂, photo #23): an attic storey narrower than the facade with an oval
// medallion, its own cornice, a triangular pediment and a cross. Wall parts go with the arcade screens (wall colour).
function frontispiece(F, f, roofH, out) {
  const fr = F.frontispiece;
  const c = f.L / 2, s0 = c - fr.w / 2, s1 = c + fr.w / 2;
  const z1 = roofH + fr.h, zp = z1 + 0.5, apex = zp + fr.pediment;
  const V = (x, z) => new THREE.Vector2(x, z);
  out.screens.push(wallBox(f, s0, s1, roofH - 0.3, z1, 0.02, fr.t));
  for (const s of [s0 + 0.3, s1 - 0.3]) out.trim.push(wallBox(f, s - 0.3, s + 0.3, roofH, z1, 0.12, 0.05));
  out.trim.push(wallBox(f, s0 - 0.3, s1 + 0.3, z1, zp, 0.3, fr.t));
  const tri = new THREE.Shape([V(s0, zp), V(s1, zp), V(c, apex)]);
  out.screens.push(new THREE.ExtrudeGeometry(tri, { depth: fr.t, bevelEnabled: false }).applyMatrix4(edgeMatrix(f, -fr.t)));
  out.trim.push(rakeGeometry(f, s0 - 0.3, zp + 0.35, c, apex + 0.35, 0.4, 0.2), rakeGeometry(f, c, apex + 0.35, s1 + 0.3, zp + 0.35, 0.4, 0.2));
  const oval = new THREE.Shape().absellipse(c, roofH + fr.h / 2, 1.25, 1.7, 0, Math.PI * 2);
  oval.holes.push(new THREE.Path().absellipse(c, roofH + fr.h / 2, 0.95, 1.4, 0, Math.PI * 2, true));
  out.trim.push(new THREE.ExtrudeGeometry(oval, { depth: 0.1, bevelEnabled: false, curveSegments: 20 }).applyMatrix4(edgeMatrix(f)));
  out.trim.push(wallBox(f, c - 0.09, c + 0.09, apex + 0.2, apex + 1.6, 0.09, 0.09), wallBox(f, c - 0.45, c + 0.45, apex + 1.05, apex + 1.23, 0.09, 0.09));
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
    footway: named(std(PALETTE.footway), 'Footway'),
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
  const ground = new THREE.Mesh(
    flatGeometry([{ outer: [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad]], holes: sunk }], 0),
    mats.ground,
  );
  ground.name = 'Ground';
  ground.receiveShadow = true;
  root.add(ground);

  // streets
  const roadsKept = fc ? clipAroundFountain(data.roads, fc, FOUNTAIN.stepsOuter) : data.roads;
  const car = roadsKept.filter((r) => r.car);
  const foot = roadsKept.filter((r) => !r.car);
  const roads = new THREE.Group();
  roads.name = 'Streets';
  const carMesh = new THREE.Mesh(stripGeometry(car, 0.02), mats.road);
  carMesh.name = 'Streets_Vehicle';
  const footMesh = new THREE.Mesh(stripGeometry(foot, 0.012), mats.footway);
  footMesh.name = 'Streets_Pedestrian';
  for (const m of [carMesh, footMesh]) { m.receiveShadow = true; roads.add(m); }
  root.add(roads);

  const green = new THREE.Mesh(flatGeometry(data.green, 0.03), mats.green);
  green.name = 'Grass';
  green.receiveShadow = true;
  root.add(green);

  // squares (calçada)
  // the fountain hole goes into whichever square contains the fountain
  const squares = data.squares.map((s, i) => (i === 0 && fc ? { ...s, holes: [...(s.holes || []), ...sunk] } : s));
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
  const paneMats = new Map();
  const paneMat = (key) => {
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
      const g = facadeGeometries(b);
      const grp = new THREE.Group();
      grp.name = `B_${b.id}${b.key ? '_' + b.key : ''}`;
      grp.userData = { ...info(b), facadeStyle: b.facade.style, evidence: b.facade.evidence };
      const parts = [
        ['body', g.walls, [wallMat, colorMat(roofColor(b).getHex(), `Roof_${roofCls}`)]],
        ['arcade', g.screens, wallMat],
        ['trim', g.trim, trim],
        ['windows', g.panes && g.panes.geometry, g.panes && g.panes.keys.map(paneMat)],
        ['awnings', g.awnings, awningMat],
        ['railings', g.railings, paneMat('lattice')],
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
    const list = tierList.filter((q) => !q.facade);
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

  return { root, pickTables, info, materials: mats };
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
