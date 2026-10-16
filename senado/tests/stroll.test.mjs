// node --test senado/tests/
// v10 stroll (viewer only): the walker cannot go through buildings, posts or the fountain pool, can walk under the
// arcades and along the streets, follows the kerbs and the fountain steps, and knows which street it is in. Also
// the sun's place through the day and the ambience's traffic level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSenado, pointIn } from '../viewer/model.js';
import { STROLL, buildCollider, groundIndex, placeNames, splitName } from '../viewer/stroll.js';
import { solarPosition, daySet, SOLAR, LIGHT } from '../viewer/lighting.js';
import { createAmbience } from '../viewer/ambience.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/senado_massing.json', import.meta.url), 'utf8'));
const collider = buildCollider(data);
const centroid = (r) => [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
// walk towards each point of a path in 10 cm steps, sliding along whatever is in the way
const follow = (pts, from = pts[0]) => {
  let p = from.slice();
  for (const q of pts.slice(1)) {
    for (let it = 0; it < 5000; it++) {
      const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy);
      if (d < 0.3) break;
      p = collider.move(p, [(dx / d) * Math.min(0.1, d), (dy / d) * Math.min(0.1, d)]);
    }
  }
  return p;
};

test('the walker starts on open ground at the square mouth', () => {
  assert.equal(collider.blocked(STROLL.spawn.slice(0, 2)), false);
  assert.ok(collider.stats.walls > 1500 && collider.stats.piers > 50 && collider.stats.things > 100, JSON.stringify(collider.stats));
});

test('no way into a building: walking at one from the street stops at its wall', () => {
  let checked = 0;
  for (const b of data.buildings) {
    if (b.minH > 0.3 || b.facade || checked >= 60) continue;
    const c = centroid(b.outer);
    if (!pointIn(c, b.outer)) continue;
    assert.ok(collider.blocked(c), `${b.id}: inside is open`);
    // from 12 m south (if that is open), straight at the centroid
    const s = [c[0], c[1] - 12];
    if (collider.blocked(s)) continue;
    const end = follow([s, c]);
    assert.ok(!pointIn(end, b.outer), `${b.id}: walked in to ${end}`);
    checked++;
  }
  assert.ok(checked > 30, `${checked} buildings tried`);
});

test('the arcades are open to walk in, their back walls and piers are not', () => {
  // the 騎樓內 preset stands under the Tourism Office arcade
  assert.equal(collider.blocked([-3.5, 16.2]), false);
  let piers = 0, open = 0;
  for (let t = 0; t <= 20; t += 0.25) {
    const p = [-3.5 + t * 0.72, 16.2 + t * 0.69];
    if (collider.blocked(p, 0.05)) piers++; else open++;
  }
  assert.ok(open > piers, `${open} open, ${piers} in piers`);
  // straight at the back wall (the arcade is 3 m deep): stopped within it
  const a = [-3.5, 16.2], dir = [Math.cos(2.33), Math.sin(2.33)];
  const end = follow([a, [a[0] + dir[0] * 10, a[1] + dir[1] * 10]]);
  assert.ok(Math.hypot(end[0] - a[0], end[1] - a[1]) < 3, `${end}`);
});

test('streets and the square can be walked end to end along their centre lines', () => {
  const ways = ['w192573694', 'w402086252', 'w713100572', 'w490717776', 'w770271483'];
  for (const id of ways) {
    const r = data.roads.find((q) => q.id === id);
    assert.ok(r, id);
    const end = follow(r.pts);
    assert.ok(Math.hypot(end[0] - r.pts.at(-1)[0], end[1] - r.pts.at(-1)[1]) < 0.6, `${r.name}: stuck at ${end}`);
  }
});

test('the fountain pool, the furniture and the railings stop the walker', () => {
  const f = data.fountain;
  assert.ok(collider.blocked([f.x + 2, f.y]));
  const end = follow([[f.x + 9, f.y], [f.x, f.y]]);
  assert.ok(Math.hypot(end[0] - f.x, end[1] - f.y) > 4.5, `${end}`);
  const lamp = data.streets.furniture.lamp[0];
  assert.ok(collider.blocked([lamp[0] + 0.1, lamp[1]]));
});

test('the ground: kerbs a step down to the road, the fountain steps down to the sunken path', () => {
  const built = buildSenado(data, { mode: 'viewer' });
  built.root.updateMatrixWorld(true);
  const names = ['Ground', 'Carriageway', 'Kerbs', 'Footways', 'Road_Markings', 'Grass', 'Calcada_Squares', 'Fountain_Steps', 'Fountain_SunkenPath'];
  const meshes = [];
  built.root.traverse((o) => { if (o.isMesh && names.some((n) => o.name === n || o.name.startsWith(`${n}_`))) meshes.push(o); });
  const g = groundIndex(meshes);
  const at = (x, y, cap = 0.5) => g.at(x, -y, cap)[0];
  assert.ok(Math.abs(at(-18, -30) + 0.15) < 0.02, 'Avenida carriageway');
  assert.ok(at(-18, -20) > -0.01, 'square');
  const f = data.fountain;
  const steps = [7.2, 6.9, 6.6, 6.3, 5.5].map((r) => at(f.x + r, f.y));
  for (let k = 1; k < steps.length; k++) assert.ok(steps[k] <= steps[k - 1] + 1e-6, `${steps}`);
  assert.ok(steps[0] - steps.at(-1) > 0.4 && steps[0] - steps.at(-1) < 0.6, `${steps}`);
  for (let k = 1; k < steps.length; k++) assert.ok(steps[k - 1] - steps[k] <= STROLL.stepUp, 'each step within one stride');
});

test('the name of the street or square underfoot', () => {
  const name = placeNames(data);
  assert.deepEqual(splitName(name([-12, -14])), { zh: '議事亭前地', pt: 'Largo do Senado' });
  assert.equal(splitName(name([128, 40])).zh, '大堂巷');
  assert.deepEqual(splitName('亞美打利庇盧大馬路 (新馬路) Avenida de Almeida Ribeiro'), { zh: '亞美打利庇盧大馬路 (新馬路)', pt: 'Avenida de Almeida Ribeiro' });
});

test('the sun: the v9 sun at 9:54, south at noon, low at both ends of the slider', () => {
  const v9 = solarPosition(SOLAR.start);
  assert.ok(Math.abs(v9.el - LIGHT.sunEl) < 0.5 && Math.abs(v9.az - LIGHT.sunAz) < 6, JSON.stringify(v9));
  assert.ok(Math.abs(solarPosition(SOLAR.noon).az - 180) < 0.01);
  for (const h of [SOLAR.min, SOLAR.max]) { const p = solarPosition(h); assert.ok(p.el > 0 && p.el < 6, `${h}: ${p.el}`); }
  // at 44° the day set is the v9 one
  const D = daySet(44);
  assert.equal(D.sun.getHex(), new (D.sun.constructor)(LIGHT.sunColor).getHex());
  assert.equal(D.sunI, LIGHT.sunIntensity);
});

test('ambience: traffic loud by the avenue, quiet in the square, faint in the lanes', () => {
  const amb = createAmbience(data);
  const kerb = amb.trafficAt([-18, -27]).level, square = amb.trafficAt([20, 30]).level, lane = amb.trafficAt([128, 40]).level;
  assert.ok(kerb > 0.8 && square < 0.15 && lane < 0.15, `${kerb} ${square} ${lane}`);
});
