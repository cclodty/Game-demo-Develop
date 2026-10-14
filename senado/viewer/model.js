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
  contextRoof: 0xb3b6b9,
  frontage: 0xeee5d2,
  trim: 0xf6f3ec,      // white mouldings: seen on every colonial facade around the square
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

function shade(hex, k) {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(k);
}

// Order a triangle counter-clockwise in plan so its normal points up (+Y) after the y -> -Z flip.
function upward(verts, base, t) {
  const [a, b, c] = t.map((i) => verts[i]);
  const ccw = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) > 0;
  return ccw ? [base + t[0], base + t[1], base + t[2]] : [base + t[0], base + t[2], base + t[1]];
}

// ---------- prism (walls + flat roof) with UVs: walls u = perimeter m, v = height m ----------
// opts.bottom adds a downward face at minH (arcade ceilings); opts.roof = false drops the top face.
// Groups: 0 = walls (+ bottom), 1 = roof.
export function prismGeometry(outer, holes, h, minH = 0, opts = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  const walls = (ring) => {
    let run = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-3) continue;
      // outward normal for CCW outer rings (holes are CW, so this flips correctly)
      const nx = (b[1] - a[1]) / len, ny = -(b[0] - a[0]) / len;
      const base = pos.length / 3;
      for (const [p, z, u] of [[a, minH, run], [b, minH, run + len], [b, h, run + len], [a, h, run]]) {
        pos.push(p[0], z, -p[1]);
        nor.push(nx, 0, -ny);
        uv.push(u, z);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      run += len;
    }
  };
  walls(outer);
  holes.forEach(walls);
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
  const attrs = ['position', 'normal', 'uv'];
  const out = { position: [], normal: [], uv: [] };
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
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
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

// Returns { walls, roof, trim, screens } geometries for one building with a facade spec.
export function facadeGeometries(b) {
  const F = b.facade;
  const ring = b.outer;
  const parapetH = F.parapet ? F.parapet.h : 0;
  const roofH = b.h - parapetH;
  const arcade = F.arcade && F.arcadeEdges.length ? F.arcade : null;
  const aH = arcade ? arcade.height : 0;
  const arcadeEdges = arcade ? F.arcadeEdges.filter((i) => edgeFrame(ring, i).L >= 2.5) : [];

  const out = { walls: [], roof: [], trim: [], screens: [] };
  if (arcadeEdges.length) {
    if (!F.passage) {                                          // a passage (lane under the building) has no ground floor
      const depth = new Map(arcadeEdges.map((i) => [i, arcade.depth]));
      const recessed = offsetEdges(ring, depth);
      out.walls.push(prismGeometry(recessed, b.holes, aH, 0, { roof: false }));
    }
    const upper = prismGeometry(ring, b.holes, roofH, aH, { bottom: true });
    out.walls.push(upper);
    for (const i of arcadeEdges) out.screens.push(arcadeScreenGeometry(edgeFrame(ring, i), arcade));
  } else {
    out.walls.push(prismGeometry(ring, b.holes, roofH, 0));
  }

  // floor lines: cumulative heights of the floors listed in the spec, entablature above the arcade
  const lines = [];
  let z = 0;
  for (const fh of F.floors.slice(0, -1)) { z += fh; lines.push(z); }
  const corniceZ = roofH - (F.cornice ? F.cornice.h : 0);
  // taller buildings in the same style get extra storeys at the top storey height
  const top = F.floors[F.floors.length - 1];
  while (z + top < corniceZ - top * 0.6) { z += top; lines.push(z); }
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
  if (F.parapet) {
    const inner = offsetEdges(ring, new Map(ring.map((_, i) => [i, F.parapet.t])));
    out.trim.push(prismGeometry(ring, [inner.slice().reverse()], b.h, roofH));
    for (let i = 0; i < ring.length; i++) {
      const f = edgeFrame(ring, i);
      if (f.L > 0.5) out.trim.push(wallBox(f, -0.05, f.L + 0.05, b.h - 0.14, b.h, 0.06, F.parapet.t));   // coping
    }
  }
  return {
    walls: mergeFlatGrouped(out.walls),
    trim: mergeFlat(out.trim),
    screens: mergeFlat(out.screens),
  };
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
function buildFountain(f, mats) {
  const g = new THREE.Group();
  g.name = 'Fountain';
  const { x, y, r } = f;
  const wallH = 0.55, wallT = 0.35;
  const lathe = new THREE.LatheGeometry(
    [new THREE.Vector2(r - wallT, 0.05), new THREE.Vector2(r - wallT, wallH), new THREE.Vector2(r, wallH), new THREE.Vector2(r, 0)],
    48,
  );
  const basin = new THREE.Mesh(lathe, mats.stone);
  basin.name = 'Fountain_Basin';
  const water = new THREE.Mesh(new THREE.CircleGeometry(r - wallT, 48).rotateX(-Math.PI / 2), mats.water);
  water.position.y = 0.38;
  water.name = 'Fountain_Water';
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 1.9, 24), mats.stone);
  ped.position.y = 0.95;
  ped.name = 'Fountain_Pedestal';
  const sphere = new THREE.Group();
  sphere.name = 'Fountain_ArmillarySphere';
  const ringGeo = new THREE.TorusGeometry(0.85, 0.05, 8, 40);
  for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2], [Math.PI / 3, Math.PI / 5]]) {
    const ring = new THREE.Mesh(ringGeo, mats.bronze);
    ring.rotation.set(rx, ry, 0);
    sphere.add(ring);
  }
  sphere.position.y = 2.8;
  g.add(basin, water, ped, sphere);
  g.position.copy(toV3(x, y));
  g.userData = { kind: 'fountain', name: '噴水池 Fountain', note: '池徑取自 OSM；中央渾天儀為示意' };
  return g;
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
    bronze: named(std(0x5d5a4a, { metalness: 0.4, roughness: 0.5 }), 'Bronze'),
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

  // ground
  const [x0, y0, x1, y1] = data.meta.bounds;
  const pad = 30;
  const ground = new THREE.Mesh(
    flatGeometry([{ outer: [[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad]] }], 0),
    mats.ground,
  );
  ground.name = 'Ground';
  ground.receiveShadow = true;
  root.add(ground);

  // streets
  const car = data.roads.filter((r) => r.car);
  const foot = data.roads.filter((r) => !r.car);
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
  const sq = new THREE.Mesh(flatGeometry(data.squares, 0.04, calcadaUV), mats.calcada);
  sq.name = 'Calcada_Squares';
  sq.receiveShadow = true;
  sq.userData = { kind: 'square', name: '議事亭前地／板樟堂前地', note: '葡式碎石波浪地磚' };
  root.add(sq);

  // buildings
  const lmByKey = Object.fromEntries(data.landmarks.map((l) => [l.key, l]));
  const tierColor = (b) => {
    if (b.tier === 'landmark' && lmByKey[b.key].colorSrc !== 'pending') {
      const lm = lmByKey[b.key];
      const c = new THREE.Color(lm.facade).getHex();
      return [c, shade(c, 0.86).getHex()];
    }
    if (b.tier === 'landmark' || b.tier === 'frontage' || b.tier === 'avenue') return [PALETTE.frontage, shade(PALETTE.frontage, 0.86).getHex()];
    if (b.tier === 'core' || b.tier === 'part') return [PALETTE.core, PALETTE.coreRoof];
    return [PALETTE.context, PALETTE.contextRoof];
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
  for (const tier of tiers) {
    const tierList = all.filter((b) => b.tier === tier);
    if (!tierList.length) continue;
    const tg = new THREE.Group();
    tg.name = `Buildings_${tier}`;
    buildingsGroup.add(tg);
    // buildings with a photo-based facade spec get arcades, bands, cornice and parapet
    for (const b of tierList.filter((q) => q.facade)) {
      const [wc, rc] = tierColor(b);
      const label = tier === 'landmark' ? b.key : tier;
      const wallMat = colorMat(wc, `Wall_${label}`);
      const g = facadeGeometries(b);
      const grp = new THREE.Group();
      grp.name = `B_${b.id}${b.key ? '_' + b.key : ''}`;
      grp.userData = { ...info(b), facadeStyle: b.facade.style, evidence: b.facade.evidence };
      const parts = [
        ['body', g.walls, [wallMat, colorMat(rc, `Roof_${label}`)]],
        ['arcade', g.screens, wallMat],
        ['trim', g.trim, trimMat],
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
    const individual = mode === 'export' ? tier !== 'context' : tier === 'landmark' || tier === 'frontage' || tier === 'avenue';
    if (individual) {
      for (const b of list) {
        const [wc, rc] = tierColor(b);
        const mesh = new THREE.Mesh(prismGeometry(b.outer, b.holes, b.h, b.minH), [
          colorMat(wc, tier === 'landmark' ? `Facade_${b.key}` : `Facade_${tier}`),
          colorMat(rc, tier === 'landmark' ? `Roof_${b.key}` : `Roof_${tier}`),
        ]);
        mesh.name = `B_${b.id}${b.key ? '_' + b.key : ''}`;
        mesh.userData = info(b);
        mesh.castShadow = mesh.receiveShadow = true;
        tg.add(mesh);
      }
    } else {
      const [wc, rc] = tierColor(list[0]);
      const { geometry, triOwner } = mergePrisms(list.map((b) => prismGeometry(b.outer, b.holes, b.h, b.minH)));
      const mesh = new THREE.Mesh(geometry, [colorMat(wc, `Facade_${tier}`), colorMat(rc, `Roof_${tier}`)]);
      mesh.name = `Buildings_${tier}_merged`;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData = { kind: 'merged', tier };
      pickTables.push({ mesh, triOwner, list });
      tg.add(mesh);
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
