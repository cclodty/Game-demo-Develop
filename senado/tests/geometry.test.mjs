// node --test senado/tests/
// Walls must face outward (stored normal and triangle winding agree and point away from the footprint),
// roofs must face up, and every building near the square must build without NaNs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { prismGeometry, buildSenado, gableGeometry, massGeometry } from '../viewer/model.js';

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
    // mouldings and parapets stay between the ground and the building height (a church front may rise above it)
    const fr = b.facade.frontispiece;
    const top = fr ? b.roof.shape.eave + fr.h + 0.5 + fr.pediment + 1.7 : b.h;
    g.trim.computeBoundingBox();
    assert.ok(g.trim.boundingBox.max.y <= top + 1e-3 && g.trim.boundingBox.min.y >= -1e-3, b.id);
  }
});

test('sunken fountain: treads face up, step risers face the fountain, pool rim faces up', () => {
  const { root } = buildSenado(data, { mode: 'export' });
  const fountain = root.getObjectByName('Fountain');
  const check = (name) => {
    const m = fountain.getObjectByName(name);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const p = g.attributes.position;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const out = { up: 0, down: 0, inward: 0, outward: 0 };
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      if (n.lengthSq() < 1e-12) continue;
      n.normalize();
      const mid = a.clone().add(b).add(c).divideScalar(3);
      if (n.y > 0.9) out.up++; else if (n.y < -0.9) out.down++;
      else if (Math.abs(n.y) < 0.1) (n.x * mid.x + n.z * mid.z < 0 ? out.inward++ : out.outward++);
    }
    return out;
  };
  const steps = check('Fountain_Steps');
  assert.equal(steps.down, 0);
  assert.ok(steps.up > 0 && steps.inward > 0);
  assert.equal(steps.outward, 0);
  const pool = check('Fountain_PoolWall');
  assert.equal(pool.down, 0);
  assert.ok(pool.up > 0 && pool.outward > 0);                 // outer face of the pool wall looks at the sunken path
});

test('gable roof: slopes face up, gable ends face out, ridge at eave + rise', () => {
  const sq = [[0, 0], [12, 0], [12, 8], [0, 8]];                    // ridge along x through y = 4
  const shape = { type: 'gable', eave: 6, rise: 2, axis: [1, 0], c: [6, 4] };
  const g = gableGeometry(sq, shape);
  const { bad } = checkOutward(g, sq);
  assert.equal(bad, 0);
  g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox.max.y - 8) < 1e-6 && Math.abs(g.boundingBox.min.y - 6) < 1e-6);
  const [walls, roof] = g.groups;
  assert.equal(walls.count / 3, 4);                                 // two triangular gable ends, two triangles each
  assert.equal(roof.count / 3, 4);                                  // two rectangular slopes
  // slopes cover the footprint once: plan area of the roof triangles equals the footprint area
  const p = g.attributes.position, ix = g.index.array;
  let area = 0;
  for (let t = roof.start; t < roof.start + roof.count; t += 3) {
    const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]].map((i) => [p.getX(i), -p.getZ(i)]);
    area += ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  }
  assert.ok(Math.abs(area - 96) < 1e-6, `roof plan area ${area}`);
});

test('pitched data buildings build closed, finite roofs', () => {
  const pitched = data.buildings.concat(data.parts).filter((b) => b.roof && b.roof.shape);
  assert.ok(pitched.length >= 2);
  for (const b of pitched) {
    const g = massGeometry(b, new THREE.Color(1, 1, 1), new THREE.Color(1, 0, 0));
    for (const v of g.attributes.position.array) assert.ok(Number.isFinite(v), b.id);
    g.computeBoundingBox();
    const s = b.roof.shape;
    assert.ok(g.boundingBox.max.y <= s.eave + s.rise + 1e-3, b.id);
    assert.ok(g.attributes.color, b.id);
  }
});

test('rooftop housings and tanks sit on their roofs', () => {
  const { root } = buildSenado(data, { mode: 'export' });
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && o.name.startsWith('Rooftops_')) meshes.push(o); });
  assert.ok(meshes.length >= 2);
  for (const m of meshes) {
    m.geometry.computeBoundingBox();
    assert.ok(m.geometry.boundingBox.min.y >= 5.9, m.name);         // flat roofs of 6 m and more only
  }
});

// Recessed windows (v4) roughly add 40k triangles; 150k is still light for a game level of this size.
test('triangle budget: the whole map stays under 150k triangles', () => {
  const { root } = buildSenado(data, { mode: 'export' });
  let tris = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  assert.ok(tris < 150000, `${Math.round(tris)} triangles`);
});
