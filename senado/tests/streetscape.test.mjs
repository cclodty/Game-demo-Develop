// node --test senado/tests/
// v9 streetscape (viewer only): which buildings it takes over, that it builds the same every time, that its faces
// point the way their normals say, and that it stays within a budget a browser can draw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildSenado } from '../viewer/model.js';
import { STREETSCAPE, streetscapeSelection, buildStreetscape } from '../viewer/streetscape.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/senado_massing.json', import.meta.url), 'utf8'));
const sel = streetscapeSelection(data);
const built = buildSenado(data, { mode: 'viewer', skip: sel.ids });
const street = buildStreetscape(data, sel, built);
const part = (name) => street.group.getObjectByName(`Streetscape_${name}`);

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
  const owners = street.pickTables[0];
  assert.equal(owners.list.length, sel.list.length);
  assert.equal(owners.triOwner.length, part('walls').geometry.index.count / 3);
  assert.ok(owners.triOwner.every((i) => i >= 0 && i < sel.list.length));
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
  for (const mesh of street.group.children) {
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
  const g = part('glass').geometry, lit = g.attributes.ntLit.array, y = g.attributes.position.array;
  let tagged = 0, low = 0;
  for (let v = 0; v < lit.length; v++) {
    if (lit[v] > 1) tagged++;
    if (lit[v] > 1 && y[v * 3 + 1] < STREETSCAPE.glassFloor - 0.01) low++;
  }
  assert.equal(low, 0);
  assert.ok(tagged > lit.length * 0.5, `${tagged} of ${lit.length}`);
  // neighbouring windows must not share their draw: under 0.3 for about 30 %, not whole rows at once
  let on = 0, n = 0;
  for (let v = 0; v < lit.length; v += 4) if (lit[v] > 1) { n++; if (lit[v] - 1 < 0.3) on++; }
  assert.ok(on / n > 0.25 && on / n < 0.35, `${on} of ${n}`);
});

test('triangle budget: streetscape under 800k, the viewer under 1M in all', () => {
  let base = 0;
  built.root.traverse((o) => { if (o.isMesh) base += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  assert.ok(street.stats.triangles < 800000, `${street.stats.triangles}`);
  assert.ok(base + street.stats.triangles < 1000000, `${base} + ${street.stats.triangles}`);
});
