// The massing studies (massing/README.md): the projection is exact to the
// millimetre, the builder turns OSM into outlines and heights the same way every
// time, the checks measure the game's export, every study folder is complete,
// and a map marked as rebuilt from its study passes the study's checks. No test
// here touches the network: the studies' data is in git.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildMassing, LEVEL_H } from '../scripts/massing/build.mjs';
import { measure, runChecks } from '../scripts/massing/checks.mjs';
import { placement, projection, radii, readSite, stringifyLines } from '../scripts/massing/geo.mjs';
import { drawPlan } from '../scripts/massing/plan.mjs';
import { trim } from '../scripts/massing/fetch.mjs';
import { MAPS } from '../src/maps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIES = path.join(ROOT, 'massing');
const studies = fs.readdirSync(STUDIES).filter((d) => fs.statSync(path.join(STUDIES, d)).isDirectory());
const RAD = Math.PI / 180;

test('projection: a millimetre there and back, a centimetre over 500 m', () => {
  const origin = { lat: 22.1972618, lon: 113.5408602 };
  const { toLocal, toLatLon } = projection(origin);
  assert.deepEqual(toLocal(origin.lat, origin.lon).map((v) => Math.round(v * 1e6) || 0), [0, 0]);
  const [M, N] = radii(origin.lat);
  // 0.0045° (about 500 m) north and east: the radii of curvature give the distance to well under a centimetre
  const [, north] = toLocal(origin.lat + 0.0045, origin.lon);
  const [east] = toLocal(origin.lat, origin.lon + 0.0045);
  assert.ok(Math.abs(north - M * 0.0045 * RAD) < 0.01, `north ${north}`);
  assert.ok(Math.abs(east - N * Math.cos(origin.lat * RAD) * 0.0045 * RAD) < 0.01, `east ${east}`);
  for (const [x, y] of [[480, -350], [-500, 500], [3.2, 0.7]]) {
    const [lat, lon] = toLatLon(x, y);
    const [x2, y2] = toLocal(lat, lon);
    assert.ok(Math.hypot(x2 - x, y2 - y) < 0.001, `${x}, ${y} came back as ${x2}, ${y2}`);
  }
});

test('placement: north is up the screen at 0°, and a turn goes there and back', () => {
  assert.deepEqual(placement(0).toGame(0, 10).map((v) => Math.round(v) || 0), [0, -10]);
  assert.deepEqual(placement(0).toGame(10, 0).map((v) => Math.round(v) || 0), [10, 0]);
  const p = placement(38);
  const [X, Z] = p.toGame(12.5, -40);
  const [x, y] = p.toData(X, Z);
  assert.ok(Math.hypot(x - 12.5, y + 40) < 1e-9);
});

// a block of OSM a few metres across: two buildings, one with a height and one with levels, a third with
// neither (estimated), a kiosk, a street, a flight of steps, a lamp, and a shop whose name must go
const O = { lat: 22.2, lon: 113.54 };
function rawSample() {
  const { toLatLon } = projection(O);
  const nodes = [];
  const node = (id, x, y, tags) => {
    const [lat, lon] = toLatLon(x, y);
    nodes.push({ type: 'node', id, lat, lon, ...(tags ? { tags } : {}) });
    return id;
  };
  const box = (base, x, y, w, d) => [node(base, x, y), node(base + 1, x + w, y), node(base + 2, x + w, y + d), node(base + 3, x, y + d), base];
  const ways = [
    { type: 'way', id: 1, nodes: box(100, 0, 0, 10, 10), tags: { building: 'yes', height: '18.5', name: '甲' } },
    { type: 'way', id: 2, nodes: box(200, 20, 0, 10, 10), tags: { building: 'yes', 'building:levels': '4' } },
    { type: 'way', id: 3, nodes: box(300, 40, 0, 10, 10), tags: { building: 'yes' } },
    { type: 'way', id: 4, nodes: box(400, 60, 0, 3, 3), tags: { building: 'kiosk' } },
    { type: 'way', id: 5, nodes: [node(500, -50, -20), node(501, 50, -20)], tags: { highway: 'residential', name: '街' } },
    { type: 'way', id: 6, nodes: [node(600, 0, -30), node(601, 0, -50)], tags: { highway: 'steps', step_count: '20', width: '6' } },
  ];
  node(700, 5, -25, { highway: 'street_lamp' });
  return { fetched: '2026-10-22', attribution: 'test', elements: [...nodes, ...ways] };
}

test('builder: outlines, heights and where they came from, streets, steps, lamps', () => {
  const m = buildMassing({ id: 't', origin: O, rotDeg: 0, half: 200 }, rawSample());
  const b = Object.fromEntries(m.buildings.map((x) => [x.id, x]));
  assert.equal(b.w1.height, 18.5);
  assert.equal(b.w1.heightSource, 'osm:height');
  assert.equal(b.w1.name, '甲');
  assert.equal(b.w2.height, 4 * LEVEL_H);
  assert.equal(b.w2.heightSource, 'osm:levels');
  assert.equal(b.w3.heightSource, 'estimate');
  assert.equal(b.w3.height, Math.round(((18.5 + 4 * LEVEL_H) / 2) * 10) / 10, 'the median of the known heights in its class, to 10 cm');
  assert.equal(b.w4.heightSource, 'default:small');
  assert.ok(Math.abs(b.w1.area - 100) < 0.05);
  // anticlockwise seen from above (x east, y north)
  const r = b.w1.ring;
  const signed = r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0) / 2;
  assert.ok(signed > 0);
  assert.equal(m.roads.length, 1);
  assert.equal(m.roads[0].width, 6);
  assert.equal(m.roads[0].widthSource, 'default');
  assert.equal(m.steps[0].width, 6);
  assert.equal(m.steps[0].step_count, '20');
  assert.ok(Math.abs(m.steps[0].length - 20) < 0.02);
  assert.deepEqual(m.points.map((p) => p.kind), ['lamp']);
  // the same input writes the same file
  assert.equal(stringifyLines(m), stringifyLines(buildMassing({ id: 't', origin: O, rotDeg: 0, half: 200 }, rawSample())));
  // a height the study measured wins
  const m2 = buildMassing({ id: 't', origin: O, rotDeg: 0, half: 200, heights: { w3: { height: 7, source: 'photo #3' } } }, rawSample());
  assert.equal(m2.buildings.find((x) => x.id === 'w3').heightSource, 'override: photo #3');
});

test('fetch keeps no editors and no business names', () => {
  const t = trim([
    { type: 'node', id: 2, lat: 1, lon: 2, user: 'someone', uid: 7, tags: { shop: 'bakery', name: '某餅家', brand: 'X' } },
    { type: 'way', id: 1, nodes: [2], user: 'someone', tags: { building: 'yes', height: '9', name: '大樓', 'addr:street': 'Rua' } },
  ]);
  assert.deepEqual(t[0], { type: 'node', id: 2, lat: 1, lon: 2, tags: { shop: 'bakery' } });
  assert.deepEqual(t[1], { type: 'way', id: 1, nodes: [2], tags: { building: 'yes', height: '9', name: '大樓' } });
});

test('checks: a street between two walls, a height, the steps, a façade', () => {
  const map = {
    playable: { width: 40, depth: 60 },
    solids: [
      { kind: 'brick', x: -6, z: 0, w: 4, d: 20, h: 6.6 },
      { kind: 'brick', x: 6, z: 0, w: 4, d: 20, h: 9 },
      { kind: 'facade', x: -5, z: -20, w: 6, d: 1, h: 20 },
      { kind: 'facade', x: 5, z: -20, w: 6, d: 1, h: 20 },
    ],
    buildings: [{ footprint: [[20, -5], [30, -5], [30, 5], [20, 5]], height: 12 }],
    steps: { profile: [{ z: 9, height: 0 }, { z: 4, height: 1.6 }], flights: [23, 23, 22] },
  };
  assert.equal(measure(map, { type: 'gap', at: [0, 0], axis: 'x' }), 8);
  assert.equal(measure(map, { type: 'gap', at: [14, 0], axis: 'x' }), 12, 'a building outline is a wall too');
  assert.equal(measure(map, { type: 'height', at: [6, 0] }), 9);
  assert.equal(measure(map, { type: 'height', at: [25, 0] }), 12);
  assert.equal(measure(map, { type: 'ground', at: [0, 6.5] }), 0.8);
  assert.equal(measure(map, { type: 'span', kind: 'facade', axis: 'x' }), 16);
  assert.equal(measure(map, { type: 'value', path: 'steps.flights' }), 68);
  assert.equal(measure(map, { type: 'size', axis: 'd' }), 60);
  const r = runChecks(map, [
    { id: 'street', what: '街闊', real: 8.2, tol: 0.3, game: { type: 'gap', at: [0, 0], axis: 'x' } },
    { id: 'steps', what: '級數', real: 66, tol: 0, game: { type: 'value', path: 'steps.flights' } },
  ]);
  assert.deepEqual(r.map((c) => c.ok), [true, false]);
});

test('plan: the game map is drawn over the real one, north arrow and scale', () => {
  const m = buildMassing({ id: 't', origin: O, rotDeg: 0, half: 200 }, rawSample());
  const svg = drawPlan({ id: 't', name: '測試', en: 'Test', rotDeg: 0 }, m, { playable: { width: 40, depth: 60 }, solids: [{ x: 0, z: 0, w: 2, d: 2, h: 1 }], start: { x: 0, z: 0 } });
  assert.match(svg, /^<svg /);
  for (const id of ['areas', 'roads', 'steps', 'buildings', 'game', 'north', 'scale']) assert.match(svg, new RegExp(`id="${id}"`));
});

test('checks: with `water` the harbour is an edge too (a quay from a wall to the water); without, it is not', () => {
  const map = { solids: [{ x: 0, z: 0, w: 10, d: 4, h: 5 }], water: [{ x: 0, z: -20, w: 50, d: 10 }], playable: { width: 50, depth: 40 } };
  assert.equal(measure(map, { type: 'gap', at: [0, -8], axis: 'z', water: true }), 13, 'the wall at z -2 to the water at z -15');
  assert.ok(measure(map, { type: 'gap', at: [0, -8], axis: 'z' }) > 400, 'the water is no wall to a plain gap');
});

test('plan: an area larger than the view, every corner outside it (a harbour), is still drawn, in its colour', () => {
  const m = buildMassing({ id: 't', origin: O, rotDeg: 0, half: 200 }, rawSample());
  m.areas.push({ kind: 'natural=bay', name: 'bay', ring: [[-900, -900], [900, -900], [900, 900], [-900, 900], [-900, -900]] });
  const svg = drawPlan({ id: 't', name: '測試', en: 'Test', rotDeg: 0, plan: { view: [-50, -50, 50, 50] } }, m, null);
  assert.match(svg, /<polygon points="-900,900 900,900 900,-900 -900,-900 -900,900" fill="#b9d3e6"\/>/);
});

test('every study folder is complete: README, site, data with its attribution, photo credits, no photo over 640 px', async () => {
  assert.ok(fs.existsSync(path.join(STUDIES, 'README.md')), 'massing/README.md: the method');
  assert.ok(studies.length >= 1);
  for (const id of studies) {
    const dir = path.join(STUDIES, id);
    const site = readSite(id);
    assert.ok(site.name && site.en, `${id}: site.json names the place`);
    assert.ok(fs.existsSync(path.join(dir, 'README.md')), `${id}: README.md`);
    if (id === 'senado') continue; // its data is senado/'s (massing/senado/README.md)
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'osm_raw.json'), 'utf8'));
    assert.match(raw.attribution, /OpenStreetMap contributors/);
    assert.ok(raw.elements.every((e) => !('user' in e) && !('uid' in e)), `${id}: no editors' names`);
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'massing.json'), 'utf8'));
    assert.equal(m.id, id);
    assert.ok(m.buildings.length > 0 && m.buildings.every((b) => b.height > 0 && b.heightSource), `${id}: every building has a height and its source`);
    assert.ok(fs.existsSync(path.join(dir, 'plan.svg')), `${id}: plan.svg`);
    const photos = path.join(dir, 'reference', 'photos');
    if (fs.existsSync(photos)) {
      const credits = JSON.parse(fs.readFileSync(path.join(photos, 'credits.json'), 'utf8'));
      for (const f of fs.readdirSync(photos).filter((x) => /\.(jpe?g|png|webp)$/i.test(x))) {
        const c = credits.find((x) => x.file === f);
        assert.ok(c && c.author && c.licence && c.url, `${id}: ${f} has its author, licence and address in credits.json`);
        const { width, height } = await sharp(path.join(photos, f)).metadata();
        assert.ok(Math.max(width, height) <= 640, `${id}: ${f} is ${width} × ${height}, over 640 px`);
      }
    }
  }
});

test('a study’s checks are well formed: at least 8, each with what it measures, the real value, its tolerance and source, and measurable on its map’s export now', () => {
  for (const id of studies) {
    const file = path.join(STUDIES, id, 'checks.json');
    if (!fs.existsSync(file)) continue;
    const checks = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.ok(checks.length >= 8, `${id}: at least 8 checks (${checks.length})`);
    assert.equal(new Set(checks.map((c) => c.id)).size, checks.length, `${id}: the ids are distinct`);
    const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'maps', `${id}.json`), 'utf8'));
    for (const c of checks) {
      assert.ok(c.id && c.what && c.source && Number.isFinite(c.real) && c.tol > 0, `${id}/${c.id}: what, real, tol, source`);
      assert.ok(Number.isFinite(measure(map, c.game)), `${id}/${c.id}: measurable on assets/maps/${id}.json`);
    }
  }
});

test('a map rebuilt from its study passes the study’s checks', () => {
  for (const m of MAPS.filter((x) => x.massing)) {
    const dir = path.join(STUDIES, m.massing);
    const checks = JSON.parse(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8'));
    assert.ok(checks.length >= 8, `${m.id}: at least 8 checks`);
    const map = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'maps', `${m.id}.json`), 'utf8'));
    const failed = runChecks(map, checks).filter((c) => !c.ok);
    assert.deepEqual(failed, [], `${m.id}: ${failed.map((c) => `${c.what} ${c.value} (real ${c.real} ± ${c.tol})`).join('; ')}`);
  }
});

test('Senado: the study’s real values are measured on senado/ itself, the city model the game was cut from (not copied from the game)', async () => {
  const { toGame } = await import('../src/senado/transform.js');
  const checks = JSON.parse(fs.readFileSync(path.join(STUDIES, 'senado', 'checks.json'), 'utf8'));
  const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'senado', 'data', 'senado_massing.json'), 'utf8'));
  const readme = fs.readFileSync(path.join(ROOT, 'senado', 'README.md'), 'utf8');
  // the study's outlines in the game's frame, measured the way the checks measure the export
  const real = { solids: [], buildings: model.buildings.map((b) => ({ footprint: b.outer.map(([x, y]) => toGame(x, y)), height: b.h })) };
  for (const c of checks) {
    if (c.game.type === 'value') assert.ok(readme.includes(`| ${c.real} → `), `${c.id}: ${c.real} m is a radius in senado/README.md's fountain table`);
    else assert.ok(Math.abs(measure(real, c.game) - c.real) < 0.01, `${c.id}: ${measure(real, c.game).toFixed(2)} on senado/'s outlines, the study says ${c.real}`);
  }
});
