// node --test senado/tests/
// v9 streetscape (viewer only): which buildings it takes over, that it builds the same every time, that its faces
// point the way their normals say, and that it stays within a budget a browser can draw. v10: the culling tiles,
// the street plaques and the eye-level details.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildSenado } from '../viewer/model.js';
import { STREETSCAPE, streetscapeSelection, buildStreetscape, plaqueText, plaqueWidth } from '../viewer/streetscape.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/senado_massing.json', import.meta.url), 'utf8'));
const sel = streetscapeSelection(data);
const built = buildSenado(data, { mode: 'viewer', skip: sel.ids });
const street = buildStreetscape(data, sel, built);
const part = (name) => street.group.getObjectByName(`Streetscape_${name}`);
// every tile's mesh of one part
const parts = (name) => { const out = []; street.group.traverse((o) => { if (o.isMesh && o.name === `Streetscape_${name}`) out.push(o); }); return out; };

test('selection: generic buildings inside the detail radius only', () => {
  assert.ok(sel.list.length > 300, `only ${sel.list.length} buildings`);
  const [cx, cy] = STREETSCAPE.centre;
  for (const b of sel.list) {
    assert.ok(!b.facade && b.tier !== 'landmark' && !(b.minH > 0), `${b.id} has its own model`);
    const x = b.outer.reduce((s, p) => s + p[0], 0) / b.outer.length, y = b.outer.reduce((s, p) => s + p[1], 0) / b.outer.length;
    assert.ok(Math.hypot(x - cx, y - cy) < STREETSCAPE.radius);
  }
});

test('the generic merged meshes leave out the buildings the streetscape rebuilds', () => {
  for (const t of built.pickTables) for (const b of t.list) assert.ok(!sel.ids.has(b.id), `${b.id} built twice`);
  // one pick table per tile; together they hold every rebuilt building once
  assert.equal(street.pickTables.length, street.stats.tiles);
  assert.equal(street.pickTables.reduce((n, t) => n + t.list.length, 0), sel.list.length);
  assert.equal(new Set(street.pickTables.flatMap((t) => t.list.map((b) => b.id))).size, sel.list.length);
  for (const t of street.pickTables) {
    assert.equal(t.triOwner.length, t.mesh.geometry.index.count / 3);
    assert.ok(t.triOwner.every((i) => i >= 0 && i < t.list.length));
  }
});

test('tiles: every building in the tile its centroid falls in, each tile with its own meshes', () => {
  const T = STREETSCAPE.tile;
  assert.ok(street.stats.tiles > 10, `${street.stats.tiles} tiles`);
  for (const t of street.pickTables) {
    const name = t.mesh.parent.name;
    for (const b of t.list) {
      const x = b.outer.reduce((s, p) => s + p[0], 0) / b.outer.length, y = b.outer.reduce((s, p) => s + p[1], 0) / b.outer.length;
      assert.equal(name, `Streetscape_tile_${Math.floor(x / T)}_${Math.floor(y / T)}`);
    }
  }
  // materials are shared between the tiles
  for (const n of ['walls', 'glass', 'frames']) assert.equal(new Set(parts(n).map((m) => m.material)).size, 1);
});

test('builds the same every time (choices are seeded by OSM id)', () => {
  const again = buildStreetscape(data, sel, built);
  assert.deepEqual(again.stats, street.stats);
  const a = part('frames').geometry.attributes.position.array;
  const b = again.group.getObjectByName('Streetscape_frames').geometry.attributes.position.array;
  assert.equal(a.length, b.length);
  for (let k = 0; k < a.length; k += 997) assert.equal(a[k], b[k]);
});

test('every face is wound the way its normal points, with finite positions', () => {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const meshes = [];
  street.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position, nor = mesh.geometry.attributes.normal, idx = mesh.geometry.index.array;
    assert.ok(pos.array.every(Number.isFinite), `${mesh.name}: NaN`);
    let bad = 0, n0 = 0;
    for (let t = 0; t < idx.length; t += 3) {
      a.fromBufferAttribute(pos, idx[t]); b.fromBufferAttribute(pos, idx[t + 1]); c.fromBufferAttribute(pos, idx[t + 2]);
      const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (face.lengthSq() < 1e-12) continue;
      n0++;
      n.fromBufferAttribute(nor, idx[t]);
      if (face.normalize().dot(n) < 0.5) bad++;
    }
    assert.equal(bad, 0, `${mesh.name}: ${bad} of ${n0} faces wound against their normal`);
  }
});

test('windows, cages, air conditioners, shops and signs are all there', () => {
  const s = street.stats;
  assert.ok(s.windows > 10000 && s.grilles > 2000 && s.ac > 2000 && s.shops > 300 && s.signs > 50 && s.roofAC > 100, JSON.stringify(s));
});

test('night: upper panes carry a light tag, about the share night.js lights, ground floors none', () => {
  let tagged = 0, low = 0, all = 0, on = 0, n = 0;
  for (const m of parts('glass')) {
    const g = m.geometry, lit = g.attributes.ntLit.array, y = g.attributes.position.array;
    all += lit.length;
    for (let v = 0; v < lit.length; v++) {
      if (lit[v] > 1) tagged++;
      if (lit[v] > 1 && y[v * 3 + 1] < STREETSCAPE.glassFloor - 0.01) low++;
    }
    // neighbouring windows must not share their draw: under 0.3 for about 30 %, not whole rows at once
    for (let v = 0; v < lit.length; v += 4) if (lit[v] > 1) { n++; if (lit[v] - 1 < 0.3) on++; }
  }
  assert.equal(low, 0);
  assert.ok(tagged > all * 0.5, `${tagged} of ${all}`);
  assert.ok(on / n > 0.25 && on / n < 0.35, `${on} of ${n}`);
});

test('street plaques: real names from OSM, at the corners, at eye height, readable', () => {
  assert.ok(street.plaques.size > 40, `${street.plaques.size} plaques`);
  const named = new Set(data.roads.map((r) => r.name).filter(Boolean));
  for (const q of street.plaques.values()) {
    assert.ok(named.has(q.name), q.name);
    assert.ok(q.zh && !/[()（）]/.test(q.zh) && q.pt, JSON.stringify(q));
    assert.ok(q.w >= 0.6 && q.w <= 1.5);
  }
  assert.deepEqual(plaqueText('商人巷(十八間) Travessa dos Mercadores'), { zh: '商人巷', pt: 'Travessa dos Mercadores' });
  assert.deepEqual(plaqueText('亞美打利庇盧大馬路 (新馬路) Avenida de Almeida Ribeiro'), { zh: '亞美打利庇盧大馬路', pt: 'Avenida de Almeida Ribeiro' });
  assert.ok(plaqueWidth({ zh: '大堂巷', pt: 'Travessa da Sé' }) < plaqueWidth({ zh: '公局新市西街', pt: 'Rua Oeste do Mercado de S. Domingos' }));
  // plaque faces sit between 2.4 and 2.9 m, a little proud of the wall
  for (const m of parts('plaques')) {
    const y = m.geometry.attributes.position.array;
    for (let k = 1; k < y.length; k += 3) assert.ok(y[k] > 2.4 && y[k] < 2.9, `${y[k]}`);
  }
});

test('eye level: laundry, pots, pipes and stair-hall gates, only on the older blocks', () => {
  const s = street.stats;
  assert.ok(s.laundry > 500 && s.clothes > s.laundry && s.pots > 500 && s.pipes > 200 && s.gates > 50, JSON.stringify(s));
  // the clothes hang below their poles, above the street
  for (const m of parts('cloth')) {
    const y = m.geometry.attributes.position.array;
    for (let k = 1; k < y.length; k += 3) assert.ok(y[k] > 2.5, `cloth at ${y[k]} m`);
  }
});

test('triangle budget: streetscape under 800k, the viewer under 1M in all', () => {
  let base = 0;
  built.root.traverse((o) => { if (o.isMesh) base += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  assert.ok(street.stats.triangles < 800000, `${street.stats.triangles}`);
  assert.ok(base + street.stats.triangles < 1000000, `${base} + ${street.stats.triangles}`);
});
