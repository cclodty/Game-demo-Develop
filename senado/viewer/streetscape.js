// v9 streetscape (viewer only). The buildings without a facade spec near the square are rebuilt with what makes a
// street read as real from above and from the pavement: window openings with glass, frames and sills, floor bands and
// corner piers, iron window cages and air conditioners on the residential blocks, glazed curtain walls on the towers,
// shops with fascia boards and projecting signs on the street fronts, concrete canopies, parapets on the flat roofs.
//
// None of it is surveyed building by building. The rules follow what the photos show of the old town in general
// (README, v9), and every choice is seeded by the OSM id, so a building always comes out the same. Walls against a
// neighbour stay blank up to the neighbour's height. The GLB keeps the v8 massing: scripts/export_glb.mjs does not run
// this file, so the game asset is unchanged.
//
// Wall-local coordinates as in model.js: s along the wall from its start corner, z up, o outward.
import * as THREE from 'three';
import { edgeFrame, gableGeometry, hash01, rng, pointIn, rooftopClutter, shopUV, shopKind } from './model.js';

export const STREETSCAPE = {
  centre: [40, 30], radius: 175,   // detail zone (data metres from the fountain): the plaza, the Sé and São Domingos
  probe: 1.0,                      // m out from a wall: a point inside another building there makes it a party wall
  street: 4.0,                     // m out from a wall: within this of a carriageway or footway edge = street front
  minEdge: 1.8,                    // shorter walls stay plain
  reveal: 0.16,                    // window recess
  glassFloor: 2.5,                 // panes above this may be lit at night (night.js)
};

// Building families. ground / storey: floor heights (m); bay: window spacing; win: width, height, sill;
// pier: corner pier width; band: floor-band height (0 = none); parapet: m above the roof; grille / ac: share of the
// buildings with iron window cages, and of their windows with an air conditioner; canopy: share with a concrete
// canopy over the shops.
const FAMILY = {
  shophouse: { ground: 4.2, storey: 3.3, bay: 2.5, win: [1.1, 1.75, 0.7], pier: 0.25, band: 0.2, parapet: 0.9, grille: 0.45, ac: 0.3, canopy: 0.5, shopBay: 3.6 },
  residential: { ground: 4.6, storey: 2.95, bay: 3.0, win: [1.45, 1.3, 0.95], pier: 0.3, band: 0.16, parapet: 1.0, grille: 0.6, ac: 0.4, canopy: 0.6, shopBay: 4.0 },
  office: { ground: 5.0, storey: 3.5, bay: 1.9, win: [1.6, 1.85, 0.85], pier: 0.4, band: 0.3, parapet: 1.1, grille: 0, ac: 0.08, canopy: 0.3, shopBay: 5.0 },
  tower: { ground: 5.5, storey: 3.6, bay: 1.5, curtain: true, pier: 0.5, band: 0, parapet: 1.3, grille: 0, ac: 0, canopy: 0.2, shopBay: 6.0 },
};

// Colours (sRGB). Glass runs from the bottom colour to the top one, as it reflects more sky higher up.
const FRAMES = ['#c9ccd0', '#efeee9', '#d8d6cf', '#5b5148', '#9aa3a8'];
const GLASS = {
  plain: [['#3a4957', '#5d7690'], ['#3d4e4c', '#6a8784'], ['#43454d', '#6c7486']],
  tower: [['#5f84aa', '#a7c0d8'], ['#4f6f7f', '#8fb3bf'], ['#5b5a58', '#9c958c']],
};
const GRILLES = ['#3a3d40', '#e6e6e2', '#6b4a3a', '#3e5a4a', '#8d9296'];
const ACS = ['#ecebe6', '#d9dad6', '#c9cbc8'];
const BOARDS = ['#c8423b', '#e8d36a', '#2f6fb3', '#3f8a52', '#e07b2a', '#1f2a44', '#f2f0e8', '#8a2b2b', '#2a6b6b'];
// Vertical signboards: generic trades only (no shop names), drawn at run time in the browser's CJK font.
const VSIGNS = [
  { text: '大押', bg: '#7a1f1f', fg: '#f3d36b' }, { text: '金行', bg: '#c8423b', fg: '#fff3c4' },
  { text: '藥房', bg: '#f2f0e8', fg: '#2f6fb3' }, { text: '茶餐廳', bg: '#1f2a44', fg: '#f2f0e8' },
  { text: '餅家', bg: '#e8d36a', fg: '#8a2b2b' }, { text: '海味', bg: '#3f8a52', fg: '#fff8e0' },
  { text: '錶行', bg: '#2a6b6b', fg: '#f2f0e8' }, { text: '涼茶', bg: '#e07b2a', fg: '#2b1a10' },
];
const SHUTTER = '#9ea3a5';
const SHOP_FRAME = '#3a3029';

// Per-window choices: model.js's FNV hash, finished with a murmur3 mix. FNV alone gives nearly the same value
// for keys that differ only in the last digit (window j, j + 1), which lit and caged whole rows together.
function h01(key) {
  let h = Math.floor(hash01(key) * 4294967296);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const lin = new Map();
const C = (hex) => { if (!lin.has(hex)) lin.set(hex, new THREE.Color(hex)); return lin.get(hex); };
const pick = (list, R) => list[Math.floor(R() * list.length) % list.length];

// ---------- selection ----------
const centroid = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];

export function streetscapeSelection(data) {
  const [cx, cy] = STREETSCAPE.centre;
  const list = data.buildings.filter((b) => {
    if (b.facade || b.tier === 'landmark' || b.minH > 0 || b.h < 3) return false;
    const [x, y] = centroid(b.outer);
    return Math.hypot(x - cx, y - cy) < STREETSCAPE.radius;
  });
  return { ids: new Set(list.map((b) => b.id)), list };
}

// ---------- lookups: which building is at a point, is a point by a street ----------
function grid(cell) {
  const m = new Map();
  const key = (i, j) => i * 100003 + j;
  return {
    add(x0, y0, x1, y1, v) {
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
        for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
          const k = key(i, j);
          if (!m.has(k)) m.set(k, []);
          m.get(k).push(v);
        }
      }
    },
    at: (p) => m.get(key(Math.floor(p[0] / cell), Math.floor(p[1] / cell))) || [],
  };
}

function lookups(data) {
  const G = grid(16);
  for (const b of data.buildings) {
    const xs = b.outer.map((p) => p[0]), ys = b.outer.map((p) => p[1]);
    G.add(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), b);
  }
  const buildingAt = (p, self) => {
    for (const b of G.at(p)) {
      if (b !== self && pointIn(p, b.outer) && !b.holes.some((h) => pointIn(p, h))) return b;
    }
    return null;
  };
  // road segments, padded by half their width plus the street margin
  const S = grid(16);
  for (const r of data.roads) {
    const pad = r.w / 2 + STREETSCAPE.street;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const [a, c] = [r.pts[k], r.pts[k + 1]];
      S.add(Math.min(a[0], c[0]) - pad, Math.min(a[1], c[1]) - pad, Math.max(a[0], c[0]) + pad, Math.max(a[1], c[1]) + pad, { a, c, pad });
    }
  }
  const squares = (data.squares || []).map((q) => q.outer);
  const byStreet = (p) => {
    if (squares.some((r) => pointIn(p, r))) return true;
    for (const { a, c, pad } of S.at(p)) {
      const dx = c[0] - a[0], dy = c[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
      if (Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]) < pad) return true;
    }
    return false;
  };
  return { buildingAt, byStreet };
}

// Exposure of one wall: `open` is the height up to which a neighbour covers it (median of three probes), `street`
// whether it faces a street or the square.
function exposure(b, f, L) {
  if (f.L < STREETSCAPE.minEdge) return { open: Infinity, street: false };
  const at = (t, d) => [f.a[0] + f.u[0] * f.L * t + f.n[0] * d, f.a[1] + f.u[1] * f.L * t + f.n[1] * d];
  const hs = [0.2, 0.5, 0.8].map((t) => { const o = L.buildingAt(at(t, STREETSCAPE.probe), b); return o ? o.h : 0; }).sort((x, y) => x - y);
  let votes = 0;
  for (const t of [0.2, 0.5, 0.8]) {
    const p = at(t, STREETSCAPE.street);
    if (!L.buildingAt(p, b) && L.byStreet(p)) votes++;
  }
  return { open: hs[1], street: votes >= 2 };
}

// ---------- geometry sinks ----------
class Sink {
  constructor({ uv = false, lit = false } = {}) {
    this.pos = []; this.nor = []; this.col = []; this.idx = [];
    this.uv = uv ? [] : null;
    this.lit = lit ? [] : null;
  }
  get tris() { return this.idx.length / 3; }
  geometry() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv || new Array((this.pos.length / 3) * 2).fill(0), 2));
    if (this.lit) g.setAttribute('ntLit', new THREE.Float32BufferAttribute(this.lit, 1));
    g.setIndex(this.idx);
    return g;
  }
}

// Faces in the local frame of wall f. P: four (s, z, o) corners, counter-clockwise seen from the normal n (local).
// cols: one colour or four; uvs: four [u, v] or none; lit: night tag for the four vertices.
function wallOps(f) {
  const W = (s, z, o) => [f.a[0] + f.u[0] * s + f.n[0] * o, z, -(f.a[1] + f.u[1] * s + f.n[1] * o)];
  const N = (ns, nz, no) => [f.u[0] * ns + f.n[0] * no, nz, -(f.u[1] * ns + f.n[1] * no)];
  const face = (sk, P, n, cols, uvs = null, lit = 0) => {
    const base = sk.pos.length / 3, nw = N(...n);
    P.forEach((p, k) => {
      const c = Array.isArray(cols) ? cols[k] : cols;
      sk.pos.push(...W(...p));
      sk.nor.push(...nw);
      sk.col.push(c.r, c.g, c.b);
      if (sk.uv) sk.uv.push(...(uvs ? uvs[k] : [0, 0]));
      if (sk.lit) sk.lit.push(lit);
    });
    sk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const ops = {
    front: (sk, s0, s1, z0, z1, o, c, uvs, lit) => { if (s1 - s0 > 1e-3 && z1 - z0 > 1e-3) face(sk, [[s0, z0, o], [s1, z0, o], [s1, z1, o], [s0, z1, o]], [0, 0, 1], c, uvs, lit); },
    back: (sk, s0, s1, z0, z1, o, c) => { if (s1 - s0 > 1e-3 && z1 - z0 > 1e-3) face(sk, [[s1, z0, o], [s0, z0, o], [s0, z1, o], [s1, z1, o]], [0, 0, -1], c); },
    // side faces at s, spanning o0..o1: facing -s (left end of a box) or +s (right end)
    left: (sk, s, z0, z1, o0, o1, c, uvs) => face(sk, [[s, z0, o0], [s, z0, o1], [s, z1, o1], [s, z1, o0]], [-1, 0, 0], c, uvs),
    right: (sk, s, z0, z1, o0, o1, c, uvs) => face(sk, [[s, z0, o1], [s, z0, o0], [s, z1, o0], [s, z1, o1]], [1, 0, 0], c, uvs),
    top: (sk, s0, s1, z, o0, o1, c, uvs) => face(sk, [[s0, z, o1], [s1, z, o1], [s1, z, o0], [s0, z, o0]], [0, 1, 0], c, uvs),
    bottom: (sk, s0, s1, z, o0, o1, c, uvs) => face(sk, [[s0, z, o0], [s1, z, o0], [s1, z, o1], [s0, z, o1]], [0, -1, 0], c, uvs),
    // box faces: 1 front, 2 left end, 4 right end, 8 top, 16 bottom, 32 back
    box(sk, s0, s1, z0, z1, o0, o1, c, mask = 31) {
      if (s1 - s0 < 1e-3 || z1 - z0 < 1e-3 || o1 - o0 < 1e-3) return;
      if (mask & 1) ops.front(sk, s0, s1, z0, z1, o1, c);
      if (mask & 32) ops.back(sk, s0, s1, z0, z1, o0, c);
      if (mask & 2) ops.left(sk, s0, z0, z1, o0, o1, c);
      if (mask & 4) ops.right(sk, s1, z0, z1, o0, o1, c);
      if (mask & 8) ops.top(sk, s0, s1, z1, o0, o1, c);
      if (mask & 16) ops.bottom(sk, s0, s1, z0, o0, o1, c);
    },
  };
  return ops;
}

// ---------- one building ----------
function storeys(b, H, F) {
  let n = b.levels && H / b.levels >= 2.5 && H / b.levels <= 5 ? Math.round(b.levels) : 0;
  if (!n) n = H < F.ground + 1.5 ? 1 : 1 + Math.max(1, Math.round((H - F.ground) / F.storey));
  if (n === 1) return [0, H];
  let g = Math.min(F.ground, H - (n - 1) * 2.6);
  g = Math.max(g, Math.min(3.2, H / n));
  const up = (H - g) / (n - 1);
  return [0, ...Array.from({ length: n - 1 }, (_, k) => g + k * up), H];
}

function familyOf(H, R) {
  if (H < 13.5) return 'shophouse';
  if (H >= 60) return R() < 0.65 ? 'tower' : 'office';
  return R() < 0.84 || H < 28 ? 'residential' : 'office';
}

function buildOne(b, ctx) {
  const R = rng(`${b.id}:v9`);
  const shape = b.roof && b.roof.shape;
  const H = shape ? shape.eave : b.h;
  const fam = familyOf(H, R), F = FAMILY[fam];
  const fl = storeys(b, H, F);
  const wall = ctx.wallColor(b), roof = ctx.roofColor(b);
  const P = {
    b, F, fam, H, fl, wall, roof,
    bay: F.bay * (0.9 + 0.25 * R()),
    win: [F.win ? F.win[0] * (0.85 + 0.3 * R()) : 0, F.win ? F.win[1] * (0.9 + 0.2 * R()) : 0, F.win ? F.win[2] : 0],
    frame: C(fam === 'tower' ? pick(['#c9ccd0', '#9aa3a8', '#4a4f55'], R) : pick(FRAMES, R)),
    glass: pick(fam === 'tower' ? GLASS.tower : GLASS.plain, R).map(C),
    grille: R() < F.grille ? C(pick(GRILLES, R)) : null,
    ac: F.ac * (0.5 + R()),
    acWindow: R() < 0.35,                                         // window units in the opening instead of split units under it
    canopy: R() < F.canopy,
    shops: H >= 6 && R() < 0.9,
    band: F.band ? (R() < 0.5 ? wall.clone().multiplyScalar(1.07) : C('#efede6')) : null,
    seed: b.id,
  };
  const ring0 = ctx.walls.tris;
  const rings = [b.outer, ...b.holes];
  rings.forEach((ring, ri) => {
    for (let i = 0; i < ring.length; i++) {
      const f = edgeFrame(ring, i);
      if (!(f.L > 1e-3)) continue;
      const ex = exposure(b, f, ctx.L);
      const ops = wallOps(f);
      if (ex.open >= H - 0.5 || f.L < STREETSCAPE.minEdge) ops.front(ctx.walls, 0, f.L, 0, H, 0, wall);
      else facadeWall(f, ops, ex, P, ctx, `${ri}:${i}`);
      if (!shape && ex.open < H) parapet(f, ops, P, ctx);
    }
  });
  // roof
  if (shape) {
    const g = gableGeometry(b.outer, shape);
    appendGeometry(ctx.walls, g, [wall, roof]);
  } else {
    roofFace(ctx.walls, b, H, roof);
    rooftopClutter(b, wall, roof, ctx.walls, true);
    rooftopExtras(b, P, ctx, R);
  }
  ctx.owner.push([ring0, ctx.walls.tris]);
}

// What else stands on the flat roofs: air-conditioner condensers along the parapets, TV aerials, and on the bigger
// roofs a sheet-metal hut (the rooftop additions common on the old blocks). Placed along the outer walls, inside.
const TIN = ['#8c9ea6', '#a7aaa5', '#8a5a44', '#6f8a7c'];
function rooftopExtras(b, P, ctx, R) {
  const { H } = P;
  if (H < 6) return;
  const edges = b.outer.map((_, i) => edgeFrame(b.outer, i)).filter((f) => f.L > 3.5);
  if (!edges.length) return;
  const inside = (f, s, o) => pointIn([f.a[0] + f.u[0] * s + f.n[0] * o, f.a[1] + f.u[1] * s + f.n[1] * o], b.outer);
  const nAC = Math.min(8, Math.floor(edges.reduce((t, f) => t + f.L, 0) / 14 * R()));
  for (let k = 0; k < nAC; k++) {
    const f = edges[Math.floor(R() * edges.length)], ops = wallOps(f);
    const s = 1.2 + R() * (f.L - 2.4), o0 = -0.6 - 0.45;
    if (!inside(f, s, o0 - 0.2)) continue;
    const ac = C(pick(ACS, R));
    ops.box(ctx.frames, s - 0.42, s + 0.42, H, H + 0.68, o0, o0 + 0.36, ac, 1 | 2 | 4 | 8 | 32);
    ops.back(ctx.frames, s - 0.32, s + 0.32, H + 0.1, H + 0.58, o0 - 0.005, ac.clone().multiplyScalar(0.55));
    ctx.count.roofAC++;
  }
  if (R() < 0.45) {
    const f = edges[Math.floor(R() * edges.length)], ops = wallOps(f), s = 0.8 + R() * (f.L - 1.6), o = -0.9;
    if (inside(f, s, o)) {
      const g = C('#5d6266'), top = H + 3 + R() * 2.5;
      ops.box(ctx.frames, s - 0.03, s + 0.03, H, top, o - 0.03, o + 0.03, g, 1 | 2 | 4 | 32);
      for (const z of [top - 0.15, top - 0.75]) ops.box(ctx.frames, s - 0.7, s + 0.7, z - 0.02, z + 0.02, o - 0.02, o + 0.02, g, 1 | 8 | 16 | 32);
    }
  }
  const big = edges.filter((f) => f.L > 6);
  if (big.length && R() < 0.3) {
    const f = big[Math.floor(R() * big.length)], ops = wallOps(f);
    const w = 3 + R() * 2.5, d = 2.5 + R() * 2, s = 0.8 + R() * (f.L - w - 1.6), o1 = -0.7, o0 = o1 - d;
    if ([[s, o0], [s + w, o0], [s, o1], [s + w, o1]].every(([a, c]) => inside(f, a, c))) {
      const tin = C(pick(TIN, R)), h = 2.3 + R() * 0.4;
      ops.box(ctx.walls, s, s + w, H, H + h, o0, o1, tin, 1 | 2 | 4 | 32);
      ops.box(ctx.walls, s - 0.15, s + w + 0.15, H + h, H + h + 0.08, o0 - 0.15, o1 + 0.15, tin.clone().multiplyScalar(0.85), 31 | 32);
      ops.back(ctx.frames, s + w * 0.3, s + w * 0.3 + 0.85, H, H + 2.0, o0 - 0.01, C('#4a4440'));   // door, facing the roof
      ctx.count.huts++;
    }
  }
}

function appendGeometry(sk, g, cols) {
  const pos = g.attributes.position.array, nor = g.attributes.normal.array, ix = g.index.array, base = sk.pos.length / 3;
  for (let k = 0; k < pos.length; k++) { sk.pos.push(pos[k]); sk.nor.push(nor[k]); }
  const colOf = new Array(pos.length / 3).fill(cols[0]);
  g.groups.forEach((grp, gi) => { for (let k = grp.start; k < grp.start + grp.count; k++) colOf[ix[k]] = cols[Math.min(gi, cols.length - 1)]; });
  for (const c of colOf) { sk.col.push(c.r, c.g, c.b); if (sk.uv) sk.uv.push(0, 0); if (sk.lit) sk.lit.push(0); }
  for (const k of ix) sk.idx.push(base + k);
}

function roofFace(sk, b, H, c) {
  const V = (p) => new THREE.Vector2(p[0], p[1]);
  const contour = b.outer.map(V), holes = b.holes.map((r) => r.map(V));
  const all = contour.concat(...holes);
  const base = sk.pos.length / 3;
  for (const p of all) { sk.pos.push(p.x, H, -p.y); sk.nor.push(0, 1, 0); sk.col.push(c.r, c.g, c.b); if (sk.uv) sk.uv.push(0, 0); }
  for (const t of THREE.ShapeUtils.triangulateShape(contour, holes)) {
    const [a, q, r] = t.map((i) => all[i]);
    const ccw = (q.x - a.x) * (r.y - a.y) - (q.y - a.y) * (r.x - a.x) > 0;
    sk.idx.push(base + t[0], base + (ccw ? t[1] : t[2]), base + (ccw ? t[2] : t[1]));
  }
}

function parapet(f, ops, P, ctx) {
  const { H, wall } = P, h = P.F.parapet, t = 0.2;
  const cap = C('#e9e7e0');
  ops.front(ctx.walls, 0, f.L, H, H + h - 0.07, 0, wall);
  ops.back(ctx.walls, 0, f.L, H, H + h - 0.07, -t, wall.clone().multiplyScalar(0.92));
  ops.box(ctx.frames, -0.03, f.L + 0.03, H + h - 0.07, H + h, -t - 0.04, 0.05, cap, 1 | 8 | 16 | 32);
}

// One exposed wall: storey rows from the ground up; below the neighbour's height it stays plain.
function facadeWall(f, ops, ex, P, ctx, wallKey) {
  const { F, fl, H, wall } = P, L = f.L;
  const wc = L > 2 * F.pier + 1.6 ? F.pier : 0;
  const s0 = wc, s1 = L - wc;
  const from = ex.open > 0.3 ? ex.open : 0;
  if (from > 0) ops.front(ctx.walls, 0, L, 0, Math.min(from, H), 0, wall);
  const n = fl.length - 1;
  for (let k = 0; k < n; k++) {
    const va = fl[k], vb = fl[k + 1];
    if (va < from - 0.2) {                                       // covered, or partly covered: plain
      if (vb > from) ops.front(ctx.walls, s0, s1, from, vb, 0, wall);
      continue;
    }
    const ground = k === 0 && n > 1;
    if (ground && ex.street && P.shops) shopRow(f, ops, va, vb, s0, s1, P, ctx, wallKey);
    else if (F.curtain) curtainRow(f, ops, va, vb, s0, s1, P, ctx, `${wallKey}:${k}`, ground);
    else windowRow(f, ops, va, vb, s0, s1, P, ctx, `${wallKey}:${k}`, ground);
  }
  // corner piers, floor bands, a canopy over the shops, projecting signs
  if (wc > 0) for (const [a, c] of [[0, wc], [L - wc, L]]) ops.box(ctx.walls, a, c, from, H, 0, 0.05, wall, 1 | 2 | 4);
  if (P.band) {
    for (let k = 1; k < n; k++) {
      if (fl[k] < from + 0.5) continue;
      const h = F.band;
      ops.box(ctx.frames, 0, L, fl[k] - h * 0.4, fl[k] + h * 0.6, 0, 0.07, P.band, 1 | 8 | 16);
    }
  }
  if (ex.street && n > 1 && from === 0) {
    const g = fl[1];
    if (P.canopy && P.shops && !F.curtain) ops.box(ctx.walls, 0, L, g - 0.22, g, 0, 1.1, wall.clone().multiplyScalar(0.96), 31);
    if (P.shops && n > 2) projectingSigns(f, ops, P, ctx, wallKey);
  }
}

// Window bays across one storey: the wall between the openings, recessed glass with a gradient, a mullion, a sill,
// an iron cage or an air conditioner.
function windowRow(f, ops, va, vb, s0, s1, P, ctx, key, ground) {
  const { wall } = P, span = s1 - s0;
  const nb = Math.max(1, Math.round(span / P.bay)), bw = span / nb;
  const [ww, wh, wsill] = P.win;
  const sill = ground ? Math.max(wsill, 1.1) : wsill;
  const w = Math.min(ww, bw - 0.5), h = Math.min(wh, vb - va - sill - 0.35);
  if (span < 1.2 || w < 0.5 || h < 0.6) { ops.front(ctx.walls, s0, s1, va, vb, 0, wall); return; }
  const v0 = va + sill, v1 = v0 + h, d = STREETSCAPE.reveal;
  ops.front(ctx.walls, s0, s1, va, v0, 0, wall);
  ops.front(ctx.walls, s0, s1, v1, vb, 0, wall);
  let s = s0;
  for (let j = 0; j < nb; j++) {
    const c = s0 + bw * (j + 0.5), u0 = c - w / 2, u1 = c + w / 2;
    ops.front(ctx.walls, s, u0, v0, v1, 0, wall);
    s = u1;
    // reveals
    const rv = wall.clone().multiplyScalar(0.9);
    ops.right(ctx.walls, u0, v0, v1, -d, 0, rv);
    ops.left(ctx.walls, u1, v0, v1, -d, 0, rv);
    ops.top(ctx.walls, u0, u1, v0, -d, 0, rv);
    ops.bottom(ctx.walls, u0, u1, v1, -d, 0, rv);
    // glass, lit at night by its own tag
    const lit = v0 > STREETSCAPE.glassFloor ? 1 + h01(`${P.seed}:${key}:${j}`) : 0;
    const [ga, gb] = P.glass;
    ops.front(ctx.glass, u0, u1, v0, v1, -d, [ga, ga, gb, gb], null, lit);
    ctx.count.windows++;
    // frame: mullion and transom
    // (front faces only: the sides of a 5 cm bar are not seen from the street, and there are 20 000 windows)
    ops.front(ctx.frames, c - 0.025, c + 0.025, v0, v1, -d + 0.05, P.frame);
    if (h > 1.45) ops.box(ctx.frames, u0, u1, v0 + h * 0.72 - 0.025, v0 + h * 0.72 + 0.025, -d, -d + 0.05, P.frame, 1 | 8);
    // sill
    if (!ground || sill > 0.5) ops.box(ctx.frames, u0 - 0.05, u1 + 0.05, v0 - 0.06, v0, 0, 0.07, C('#e9e7e0'), 1 | 8);
    const r = h01(`${P.seed}:${key}:${j}:x`);
    const caged = P.grille && !ground && r < 0.8;
    if (caged) grille(f, ops, u0 - 0.06, u1 + 0.06, v0 - 0.08, v1 + 0.1, P.grille, ctx);
    const rac = h01(`${P.seed}:${key}:${j}:ac`);
    if (!ground && rac < P.ac) {
      const ac = C(ACS[Math.floor(rac * 97) % ACS.length]);
      if (P.acWindow && !caged) {
        ops.box(ctx.frames, u0 + 0.05, u0 + Math.min(0.75, w - 0.1), v0, v0 + 0.45, -d, 0.32, ac, 1 | 2 | 4 | 8 | 16);
      } else if (sill > 0.75) {
        const side = rac * 13 % 1 < 0.5 ? u0 : u1 - 0.8, z0 = Math.max(va + 0.08, v0 - 0.7);
        ops.box(ctx.frames, side, side + 0.8, z0, z0 + 0.52, caged ? 0.36 : 0, caged ? 0.8 : 0.44, ac, 1 | 2 | 4 | 8 | 16);
        ops.front(ctx.frames, side + 0.06, side + 0.74, z0 + 0.06, z0 + 0.46, (caged ? 0.8 : 0.44) + 0.005, ac.clone().multiplyScalar(0.72));
      }
      ctx.count.ac++;
    }
  }
  ops.front(ctx.walls, s, s1, v0, v1, 0, wall);
}

// Iron window cage (鐵窗): barred front, ends and floor in the alpha-masked grille; a solid sheet on top.
function grille(f, ops, l, r, z0, z1, col, ctx) {
  const d = 0.34, bar = 0.11, rail = 0.45;
  const uvF = [[l / bar, z0 / rail], [r / bar, z0 / rail], [r / bar, z1 / rail], [l / bar, z1 / rail]];
  ops.front(ctx.grilles, l, r, z0, z1, d, col, uvF);
  ops.left(ctx.grilles, l, z0, z1, 0, d, col, [[0, z0 / rail], [d / bar, z0 / rail], [d / bar, z1 / rail], [0, z1 / rail]]);
  ops.right(ctx.grilles, r, z0, z1, 0, d, col, [[d / bar, z0 / rail], [0, z0 / rail], [0, z1 / rail], [d / bar, z1 / rail]]);
  ops.bottom(ctx.grilles, l, r, z0, 0, d, col, [[l / bar, 0], [r / bar, 0], [r / bar, d / rail], [l / bar, d / rail]]);
  ops.box(ctx.frames, l - 0.03, r + 0.03, z1, z1 + 0.04, 0, d + 0.05, col, 1 | 8);
  ctx.count.grilles++;
}

// Curtain wall: a glass cell between mullions on every storey, opaque spandrels at the floors.
function curtainRow(f, ops, va, vb, s0, s1, P, ctx, key, ground) {
  const span = s1 - s0, nb = Math.max(1, Math.round(span / P.bay)), bw = span / nb;
  const [ga, gb] = P.glass;
  const spand = P.glass[0].clone().multiplyScalar(0.55);
  const z0 = ground ? va : va + 0.35, z1 = vb - 0.55;
  for (let j = 0; j < nb; j++) {
    const a = s0 + bw * j, c = a + bw;
    const lit = !ground ? 1 + h01(`${P.seed}:${key}:${j}`) : 0;
    ops.front(ctx.glass, a, c, z0, z1, -0.02, [ga, ga, gb, gb], null, lit);
    ctx.count.windows++;
  }
  if (!ground) ops.front(ctx.walls, s0, s1, va, z0, 0.0, spand);
  ops.front(ctx.walls, s0, s1, z1, vb, 0.0, spand);
  for (let j = 0; j <= nb; j++) {
    const x = s0 + bw * j;
    ops.box(ctx.frames, x - 0.035, x + 0.035, va, vb, -0.02, 0.09, P.frame, 1 | 2 | 4);
  }
}

// Ground-floor shops on a street front: an opening per shop with the shop interior (v7 atlas) behind glass, a dark
// frame, a coloured fascia board with a plain sign; some shops have their shutters down.
function shopRow(f, ops, va, vb, s0, s1, P, ctx, key) {
  const { wall } = P, span = s1 - s0, d = 0.32;
  const nb = Math.max(1, Math.round(span / P.F.shopBay)), bw = span / nb;
  const zg = Math.max(2.4, vb - 1.05);                          // top of the openings; the fascia above
  if (span < 2.2) { ops.front(ctx.walls, s0, s1, va, vb, 0, wall); return; }
  ops.front(ctx.walls, s0, s1, zg, vb, 0, wall);
  const pier = 0.35;
  let s = s0;
  for (let j = 0; j < nb; j++) {
    const l = s0 + bw * j + pier / 2, r = s0 + bw * (j + 1) - pier / 2;
    ops.front(ctx.walls, s, l, va, zg, 0, wall);
    s = r;
    const rv = wall.clone().multiplyScalar(0.88);
    ops.right(ctx.walls, l, va, zg, -d, 0, rv);
    ops.left(ctx.walls, r, va, zg, -d, 0, rv);
    ops.bottom(ctx.walls, l, r, zg, -d, 0, rv);
    const seed = `${P.seed}:${key}:${j}`;
    const shut = h01(`${seed}:shut`) < 0.18;
    if (shut) {
      // roller shutter: slats as a gradient of thin bands
      const g = C(SHUTTER), n = Math.max(4, Math.round((zg - va) / 0.25));
      for (let k = 0; k < n; k++) {
        const za = va + ((zg - va) * k) / n, zb = va + ((zg - va) * (k + 1)) / n;
        ops.front(ctx.frames, l, r, za, zb, -d + 0.05, [g, g, g.clone().multiplyScalar(0.86), g.clone().multiplyScalar(0.86)]);
      }
    } else {
      const kind = shopKind(seed);
      const uv = shopUV(kind);
      ops.front(ctx.shops, l, r, va, zg, -d + 0.02, C('#ffffff'), [uv(0, 0), uv(1, 0), uv(1, 1), uv(0, 1)]);
      const fr = C(SHOP_FRAME);
      ops.box(ctx.frames, l, l + 0.08, va, zg, -d + 0.02, -d + 0.1, fr, 1 | 4);
      ops.box(ctx.frames, r - 0.08, r, va, zg, -d + 0.02, -d + 0.1, fr, 1 | 2);
      ops.box(ctx.frames, l, r, zg - 0.1, zg, -d + 0.02, -d + 0.1, fr, 1 | 16);
      ctx.count.shops++;
      // fascia board and its sign
      const board = C(BOARDS[Math.floor(h01(`${seed}:board`) * BOARDS.length)]);
      const fz0 = zg + 0.12, fz1 = Math.min(vb - 0.08, zg + 0.9);
      if (fz1 - fz0 > 0.35) {
        ops.box(ctx.frames, l - 0.1, r + 0.1, fz0, fz1, 0, 0.12, board, 1 | 2 | 4 | 8 | 16);
        const ids = (ctx.signs.generic[kind] || []);
        const a = ids.length ? ctx.signs.signs[ids[Math.floor(h01(`${seed}:sign`) * ids.length)]] : null;
        if (a) {
          const k = Math.min(1, (r - l - 0.1) / a.w, (fz1 - fz0 - 0.08) / a.h), sw = a.w * k, sh = a.h * k;
          const c = (l + r) / 2, zc = (fz0 + fz1) / 2;
          const [u0, w0, u1, w1] = a.uv;
          ops.front(ctx.signQuads, c - sw / 2, c + sw / 2, zc - sh / 2, zc + sh / 2, 0.135, C('#ffffff'), [[u0, w0], [u1, w0], [u1, w1], [u0, w1]]);
        }
      }
    }
  }
  ops.front(ctx.walls, s, s1, va, zg, 0, wall);
}

// Projecting signboards (招牌) above the shops: boards standing out from the wall on brackets, in shop colours.
function projectingSigns(f, ops, P, ctx, key) {
  const { fl, H } = P, L = f.L;
  const n = Math.floor((L - 2) / 7);
  for (let j = 0; j < n; j++) {
    const r = h01(`${P.seed}:${key}:ps${j}`);
    if (r < 0.35) continue;
    const s = 1.5 + (L - 3) * ((j + 0.5) / n) + (r - 0.5) * 1.5;
    const z0 = fl[1] + 0.4, z1 = Math.min(H - 0.8, z0 + 2.2 + r * 4.5);
    if (z1 - z0 < 1.6) continue;
    const w = 0.8 + r * 0.7, o0 = 0.35;
    const k = Math.floor(r * 57) % VSIGNS.length, board = C(VSIGNS[k].bg);
    ops.box(ctx.frames, s - 0.07, s + 0.07, z0, z1, o0, o0 + w, board, 1 | 8 | 16 | 32);
    // both faces lettered from the sign atlas (one column per trade)
    const uv = [[k / VSIGNS.length, 0], [(k + 1) / VSIGNS.length, 0], [(k + 1) / VSIGNS.length, 1], [k / VSIGNS.length, 1]];
    ops.left(ctx.vsigns, s - 0.07, z0, z1, o0, o0 + w, C('#ffffff'), uv);
    ops.right(ctx.vsigns, s + 0.07, z0, z1, o0, o0 + w, C('#ffffff'), uv);
    for (const z of [z0 + 0.3, z1 - 0.3]) ops.box(ctx.frames, s - 0.03, s + 0.03, z - 0.03, z + 0.03, 0, o0, C('#3a3d40'), 1 | 2 | 4 | 8 | 16);
    ctx.count.signs++;
  }
}

// ---------- the vertical sign atlas: one 128 x 512 column per trade, characters stacked top to bottom ----------
function vsignTexture() {
  if (typeof document === 'undefined') return null;
  const cw = 128, ch = 512, cv = document.createElement('canvas');
  cv.width = cw * VSIGNS.length; cv.height = ch;
  const g = cv.getContext('2d');
  VSIGNS.forEach(({ text, bg, fg }, k) => {
    const x = k * cw;
    g.fillStyle = bg; g.fillRect(x, 0, cw, ch);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 9, 9, cw - 18, ch - 18);
    const chars = [...text], step = Math.min(cw * 0.95, (ch - 50) / chars.length);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(Math.min(cw * 0.66, step * 0.78))}px "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
    chars.forEach((c, i) => g.fillText(c, x + cw / 2, ch / 2 + (i - (chars.length - 1) / 2) * step));
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- the iron-cage texture: vertical bars every 11 cm, a rail every 45 cm ----------
function grilleTexture() {
  const W = 32, Hh = 128, px = new Uint8Array(W * Hh * 4);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const bar = x < 4 || y < 6;
      const i = (y * W + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = bar ? 255 : 0;
    }
  }
  const t = new THREE.DataTexture(px, W, Hh, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Builds the detail zone. `built` is buildSenado's result (materials and colours), `sel` streetscapeSelection's.
export function buildStreetscape(data, sel, built) {
  const ctx = {
    L: lookups(data),
    wallColor: built.wallColor, roofColor: built.roofColor,
    signs: data.shopSigns || { signs: {}, generic: {} },
    walls: new Sink({ uv: true }), frames: new Sink(), glass: new Sink({ lit: true }), grilles: new Sink({ uv: true }),
    shops: new Sink({ uv: true }), signQuads: new Sink({ uv: true }), vsigns: new Sink({ uv: true }),
    owner: [], count: { buildings: 0, windows: 0, grilles: 0, ac: 0, roofAC: 0, huts: 0, shops: 0, signs: 0 },
  };
  for (const b of sel.list) { buildOne(b, ctx); ctx.count.buildings++; }

  const std = (name, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...extra });
    m.name = name;
    return m;
  };
  const M = built.materials;
  const parts = [
    ['walls', ctx.walls, std('Facade_street')],
    ['frames', ctx.frames, std('Street_frame', { roughness: 0.6 })],
    ['glass', ctx.glass, std('Glass_street', { roughness: 0.12 })],
    ['grilles', ctx.grilles, std('Street_grille', { map: grilleTexture(), alphaTest: 0.35, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.6 })],
    ['shops', ctx.shops, M.shop],
    ['signs', ctx.signQuads, M.sign],
    // named like the v7 signs: no AO, and lit at night (night.js)
    ['vsigns', ctx.vsigns, std('Shop_sign', { map: vsignTexture(), roughness: 0.5 })],
  ];
  const group = new THREE.Group();
  group.name = 'Streetscape';
  const pickTables = [];
  let tris = 0;
  for (const [part, sk, mat] of parts) {
    const g = sk.geometry();
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = `Streetscape_${part}`;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData = { kind: part === 'walls' ? 'merged' : 'streetscape', tier: 'streetscape' };
    if (part === 'grilles' || part === 'signs' || part === 'vsigns') mesh.userData.noAO = true;
    if (part === 'walls') {
      const triOwner = new Int32Array(sk.tris);
      ctx.owner.forEach(([a, c], i) => triOwner.fill(i, a, c));
      pickTables.push({ mesh, triOwner, list: sel.list });
    }
    tris += sk.tris;
    group.add(mesh);
  }
  return { group, pickTables, stats: { ...ctx.count, triangles: tris } };
}
