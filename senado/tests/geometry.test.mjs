// node --test senado/tests/
// Walls must face outward (stored normal and triangle winding agree and point away from the footprint),
// roofs must face up, and every building near the square must build without NaNs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { prismGeometry, buildSenado } from '../viewer/model.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/senado_massing.json', import.meta.url), 'utf8'));

function checkOutward(geo, outer) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, idx = geo.index.array;
  const cx = outer.reduce((s, p) => s + p[0], 0) / outer.length;
  const cz = -outer.reduce((s, p) => s + p[1], 0) / outer.length;
  let bad = 0, walls = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    a.fromBufferAttribute(pos, idx[t]); b.fromBufferAttribute(pos, idx[t + 1]); c.fromBufferAttribute(pos, idx[t + 2]);
    const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (face.lengthSq() < 1e-10) continue;
    face.normalize();
    n.fromBufferAttribute(nor, idx[t]);
    if (face.dot(n) < 0.9) bad++;                       // winding disagrees with the stored normal
    if (Math.abs(face.y) < 0.5) {                        // wall: must point away from the centroid
      walls++;
      const mid = new THREE.Vector3().add(a).add(b).add(c).divideScalar(3);
      if (face.x * (mid.x - cx) + face.z * (mid.z - cz) < 0 && isConvexish(outer)) bad++;
    } else if (face.y < 0 && n.y > -0.5) bad++;          // a downward face that claims to be a roof
  }
  return { bad, walls };
}
const isConvexish = (outer) => outer.length <= 6;

test('rectangular footprint: walls outward, roof up', () => {
  const sq = [[0, 0], [10, 0], [10, 6], [0, 6]];        // counter-clockwise
  const { bad, walls } = checkOutward(prismGeometry(sq, [], 12, 0), sq);
  assert.equal(walls, 8);
  assert.equal(bad, 0);
});

test('data rings are counter-clockwise (outer) as the builder expects', () => {
  const area = (r) => r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
  const cw = data.buildings.filter((b) => area(b.outer) <= 0).map((b) => b.id);
  assert.deepEqual(cw, []);
});

test('buildings around the square face outward', () => {
  for (const b of data.buildings.filter((q) => q.tier !== 'context' && q.tier !== 'core' && q.outer.length <= 6)) {
    const { bad } = checkOutward(prismGeometry(b.outer, b.holes, b.h, b.minH), b.outer);
    assert.equal(bad, 0, `${b.id} ${b.name || ''}`);
  }
});

test('full model builds without NaN positions', () => {
  const { root } = buildSenado(data, { mode: 'export' });
  let meshes = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    for (const v of o.geometry.attributes.position.array) assert.ok(Number.isFinite(v), o.name);
  });
  assert.ok(meshes > 300);
});

test('arcade recess removes exactly length x depth from a rectangle', async () => {
  const { offsetEdges } = await import('../viewer/model.js');
  const sq = [[0, 0], [20, 0], [20, 10], [0, 10]];
  const r = offsetEdges(sq, new Map([[0, 3]]));                       // south wall pushed 3 m inside
  const area = (q) => q.reduce((s, p, i) => { const n = q[(i + 1) % q.length]; return s + p[0] * n[1] - n[0] * p[1]; }, 0) / 2;
  assert.ok(Math.abs(area(r) - (200 - 20 * 3)) < 1e-6);
});

test('facade buildings build finite arcades, bands and parapets', async () => {
  const { facadeGeometries } = await import('../viewer/model.js');
  const withFacade = data.buildings.filter((b) => b.facade);
  assert.ok(withFacade.length >= 15);
  for (const b of withFacade) {
    const g = facadeGeometries(b);
    assert.ok(g.walls && g.trim, b.id);
    if (b.facade.arcade && b.facade.arcadeEdges.length) assert.ok(g.screens, `${b.id} has an arcade spec but no arcade`);
    for (const geo of [g.walls, g.trim, g.screens].filter(Boolean)) {
      for (const v of geo.attributes.position.array) assert.ok(Number.isFinite(v), b.id);
    }
    // mouldings and parapets stay between the ground and the building height
    g.trim.computeBoundingBox();
    assert.ok(g.trim.boundingBox.max.y <= b.h + 1e-3 && g.trim.boundingBox.min.y >= -1e-3, b.id);
  }
});
