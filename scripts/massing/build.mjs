#!/usr/bin/env node
// Turns a study's OSM data into its massing (massing/README.md):
//
//   npm run massing:build -- <id>
//
// Reads massing/<id>/site.json and data/osm_raw.json, writes data/massing.json:
// every building with its outline and a height and where the height came from,
// the streets and footpaths with a width, the steps with their length and step
// count, walls and fences, areas (squares, parks, water, piers) and street
// furniture, in metres on the study's plane (x east, y north; scripts/massing/
// geo.mjs). Heights without an OSM tag are estimated the way senado/ does it:
// the median of the known heights in the same footprint class. The same input
// always writes the same file.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { projection, readSite, round, stringifyLines, studyDir } from './geo.mjs';

export const LEVEL_H = 3.2; // m a storey, when OSM gives building:levels and no height (senado/: 3.2 m a storey)
const SMALL = 15; // m²: a kiosk or a shed, 3.5 m tall (senado/)
const CLASSES = [50, 150, 400, 1000, Infinity]; // footprint classes, m²
const FALLBACK_H = 9.6; // three storeys, when no building in the class has a known height

// default carriageway or path widths, m, when OSM has no width tag
const WIDTH = { motorway: 14, trunk: 12, primary: 10, secondary: 9, tertiary: 8, unclassified: 6, residential: 6, living_street: 5, service: 4, pedestrian: 5, footway: 2, path: 1.5, cycleway: 2, steps: 3, track: 3 };
const AREA_KEYS = ['leisure', 'landuse', 'natural', 'amenity', 'place', 'man_made', 'waterway', 'water', 'tourism', 'historic'];
const POINT_KINDS = {
  'highway=street_lamp': 'lamp',
  'highway=traffic_signals': 'signals',
  'highway=crossing': 'crossing',
  'highway=bus_stop': 'bus_stop',
  'amenity=bench': 'bench',
  'amenity=waste_basket': 'bin',
  'amenity=fountain': 'fountain',
  'amenity=post_box': 'post_box',
  'amenity=bicycle_parking': 'bike_rack',
  'barrier=bollard': 'bollard',
  'natural=tree': 'tree',
  'man_made=flagpole': 'flagpole',
  'man_made=street_cabinet': 'cabinet',
  'leisure=picnic_table': 'table',
};

const num = (v) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(m)?\s*$/.exec(v || '');
  return m ? +m[1] : null;
};

function areaOf(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

const lengthOf = (line) => line.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - line[i][0], p[1] - line[i][1]), 0);
const centroid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/** Joins a relation's member ways into closed rings (each a list of node ids), outer ones first. */
function joinRings(members, ways) {
  const rings = [];
  for (const role of ['outer', 'inner']) {
    const parts = members.filter((m) => m.type === 'way' && (m.role || 'outer') === role && ways.has(m.ref)).map((m) => ways.get(m.ref).nodes.slice());
    while (parts.length) {
      let ring = parts.shift();
      let grew = true;
      while (ring[0] !== ring[ring.length - 1] && grew) {
        grew = false;
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          const end = ring[ring.length - 1];
          if (p[0] === end) ring = ring.concat(p.slice(1));
          else if (p[p.length - 1] === end) ring = ring.concat(p.slice(0, -1).reverse());
          else continue;
          parts.splice(i, 1);
          grew = true;
          break;
        }
      }
      if (ring[0] === ring[ring.length - 1]) rings.push({ role, nodes: ring });
    }
  }
  return rings;
}

/** The massing of a study from its site and raw OSM data (pure: tests call it). */
export function buildMassing(site, raw) {
  const { toLocal } = projection(site.origin);
  const nodes = new Map();
  const ways = new Map();
  for (const e of raw.elements) {
    if (e.type === 'node') nodes.set(e.id, e);
    else if (e.type === 'way') ways.set(e.id, e);
  }
  const xy = new Map();
  const at = (id) => {
    if (!xy.has(id)) {
      const n = nodes.get(id);
      xy.set(id, n ? toLocal(n.lat, n.lon).map((v) => round(v)) : null);
    }
    return xy.get(id);
  };
  const line = (ids) => {
    const pts = ids.map(at);
    return pts.every(Boolean) ? pts : null;
  };
  const H = site.half;
  const inBox = (pts) => pts.some(([x, y]) => Math.abs(x) <= H && Math.abs(y) <= H);
  const closed = (ids) => ids.length > 3 && ids[0] === ids[ids.length - 1];

  // every closed outline: a way's, or a multipolygon's outer rings (inner rings are courtyards: kept as `holes`)
  const shapes = [];
  for (const w of ways.values()) if (w.tags && closed(w.nodes)) shapes.push({ id: `w${w.id}`, tags: w.tags, rings: [{ role: 'outer', nodes: w.nodes }] });
  for (const r of raw.elements) if (r.type === 'relation' && r.tags && r.tags.type === 'multipolygon') shapes.push({ id: `r${r.id}`, tags: r.tags, rings: joinRings(r.members, ways) });

  const buildings = [];
  const areas = [];
  for (const s of shapes) {
    const outer = s.rings.filter((r) => r.role === 'outer').map((r) => line(r.nodes.slice(0, -1))).filter(Boolean);
    const holes = s.rings.filter((r) => r.role === 'inner').map((r) => line(r.nodes.slice(0, -1))).filter(Boolean);
    for (const [k, ring] of outer.entries()) {
      if (!inBox(ring)) continue;
      const ccw = areaOf(ring) < 0 ? ring.slice().reverse() : ring; // anticlockwise, seen from above with north up
      const t = s.tags;
      const id = outer.length > 1 ? `${s.id}.${k}` : s.id;
      if (t.building || t['building:part']) {
        const b = { id, ring: ccw, area: round(Math.abs(areaOf(ring)), 1) };
        if (holes.length) b.holes = holes;
        if (t.name) b.name = t.name;
        if (t['building:part']) b.part = true;
        const h = num(t.height);
        const levels = num(t['building:levels']);
        if (levels != null) b.levels = levels;
        if (h != null) Object.assign(b, { height: h, heightSource: 'osm:height' });
        else if (levels != null) Object.assign(b, { height: round(levels * LEVEL_H + (num(t['roof:height']) || 0), 1), heightSource: 'osm:levels' });
        const mh = num(t.min_height) ?? (num(t['building:min_level']) != null ? num(t['building:min_level']) * LEVEL_H : null);
        if (mh) b.minHeight = mh;
        for (const k2 of ['historic', 'amenity', 'tourism', 'roof:shape', 'building']) if (t[k2] && t[k2] !== 'yes') b[k2.replace(':', '_')] = t[k2];
        buildings.push(b);
      } else {
        const key = AREA_KEYS.find((k2) => t[k2]) || (t.highway && t.area === 'yes' ? 'highway' : null);
        if (!key) continue;
        const a = { id, kind: `${key}=${t[key]}`, ring: ccw };
        if (holes.length) a.holes = holes;
        if (t.name) a.name = t.name;
        if (t.surface) a.surface = t.surface;
        areas.push(a);
      }
    }
  }

  // heights the study measured or corrected, by id (site.json `heights`), win over everything
  for (const b of buildings) {
    const o = site.heights && site.heights[b.id];
    if (o) Object.assign(b, { height: o.height, heightSource: `override: ${o.source}` });
  }
  // the rest: the median of the known heights in the same footprint class
  const known = CLASSES.map(() => []);
  const cls = (a) => CLASSES.findIndex((c) => a < c);
  for (const b of buildings) if (b.height != null && !b.part) known[cls(b.area)].push(b.height);
  const median = known.map((h) => {
    if (!h.length) return null;
    const s = h.slice().sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  });
  for (const b of buildings) {
    if (b.height != null) continue;
    if (b.area < SMALL) Object.assign(b, { height: 3.5, heightSource: 'default:small' });
    else Object.assign(b, { height: round(median[cls(b.area)] ?? FALLBACK_H, 1), heightSource: 'estimate' });
  }

  // streets, paths, steps, walls: the open ways
  const roads = [];
  const steps = [];
  const barriers = [];
  for (const w of ways.values()) {
    const t = w.tags;
    if (!t) continue;
    const pts = line(w.nodes);
    if (!pts || !inBox(pts)) continue;
    const base = { id: `w${w.id}`, line: pts, length: round(lengthOf(pts), 1) };
    if (t.name) base.name = t.name;
    if (t.highway && !(t.area === 'yes' && closed(w.nodes))) {
      const width = num(t.width) ?? num(t.est_width);
      const r = { ...base, kind: t.highway, width: width ?? WIDTH[t.highway] ?? 3, widthSource: width != null ? 'osm:width' : 'default' };
      for (const k of ['surface', 'layer', 'incline', 'step_count', 'lanes', 'tunnel', 'bridge', 'oneway']) if (t[k]) r[k] = t[k];
      if (t.highway === 'steps') steps.push(r);
      else roads.push(r);
    } else if (t.barrier || t.historic === 'citywalls' || t.man_made === 'embankment' || t.natural === 'coastline' || t.natural === 'cliff') {
      barriers.push({ ...base, kind: t.barrier ? `barrier=${t.barrier}` : t.historic ? 'historic=citywalls' : t.man_made ? `man_made=${t.man_made}` : `natural=${t.natural}` });
    } else if (t.waterway || (t.man_made === 'pier' && !closed(w.nodes))) {
      barriers.push({ ...base, kind: t.waterway ? `waterway=${t.waterway}` : 'man_made=pier' });
    }
  }

  // street furniture and the named points
  const points = [];
  for (const n of nodes.values()) {
    const t = n.tags;
    if (!t) continue;
    const kind = Object.entries(t).map(([k, v]) => POINT_KINDS[`${k}=${v}`]).find(Boolean) || (t.historic || t.tourism || t.amenity === 'place_of_worship' ? Object.entries(t).filter(([k]) => ['historic', 'tourism', 'amenity'].includes(k)).map(([k, v]) => `${k}=${v}`)[0] : null);
    if (!kind) continue;
    const p = at(n.id);
    if (!inBox([p])) continue;
    const o = { id: `n${n.id}`, kind, x: p[0], y: p[1] };
    if (t.name) o.name = t.name;
    points.push(o);
  }

  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const landmarks = [...buildings, ...areas]
    .filter((b) => b.name && (b.historic || b.tourism || b.amenity === 'place_of_worship' || /historic|tourism|leisure|place/.test(b.kind || '')))
    .map((b) => ({ id: b.id, name: b.name, at: centroid(b.ring).map((v) => round(v)) }))
    .sort(byId);
  const count = (src) => buildings.filter((b) => b.heightSource.startsWith(src)).length;
  return {
    format: 1,
    id: site.id,
    origin: site.origin,
    rotDeg: site.rotDeg || 0,
    half: H,
    fetched: raw.fetched,
    attribution: raw.attribution,
    note: 'Metres on the study plane: x east, y north from the origin (scripts/massing/geo.mjs). Rings anticlockwise. heightSource: osm:height, osm:levels (levels x levelHeight), override (site.json heights, with its source), default:small (under 15 m², 3.5 m), estimate (median of the known heights in the same footprint class).',
    levelHeight: LEVEL_H,
    heights: { 'osm:height': count('osm:height'), 'osm:levels': count('osm:levels'), override: count('override'), 'default:small': count('default:small'), estimate: count('estimate') },
    buildings: buildings.sort(byId),
    areas: areas.sort(byId),
    roads: roads.sort(byId),
    steps: steps.sort(byId),
    barriers: barriers.sort(byId),
    points: points.sort(byId),
    landmarks,
  };
}

function main() {
  const id = process.argv[2];
  const site = readSite(id);
  const dir = studyDir(id);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'osm_raw.json'), 'utf8'));
  const m = buildMassing(site, raw);
  fs.writeFileSync(path.join(dir, 'data', 'massing.json'), stringifyLines(m));
  const h = Object.entries(m.heights).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`${id}: ${m.buildings.length} buildings (${h}), ${m.roads.length} roads, ${m.steps.length} steps, ${m.areas.length} areas, ${m.barriers.length} walls and lines, ${m.points.length} points`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
