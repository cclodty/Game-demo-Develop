#!/usr/bin/env node
// Fetches a study's OpenStreetMap data (massing/README.md):
//
//   npm run massing:fetch -- <id>
//
// The box is site.json's origin ± half metres. The OSM API's map call comes
// first; if it fails, the Overpass mirrors that answered on 2026-10-22. Only
// the tags a study uses are kept, and nothing about who edited what. Writes
// massing/<id>/data/osm_raw.json with the date, the box and the attribution.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ATTRIBUTION, projection, readSite, round, stringifyLines, studyDir, USER_AGENT } from './geo.mjs';

const OVERPASS = ['https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter'];

// the keys a study reads (build.mjs); everything else is dropped
const KEEP = new Set([
  'building', 'building:part', 'building:levels', 'building:min_level', 'height', 'min_height', 'roof:shape', 'roof:levels', 'roof:height',
  'name', 'name:zh', 'name:pt', 'name:en', 'alt_name',
  'highway', 'area', 'width', 'est_width', 'lanes', 'surface', 'step_count', 'incline', 'handrail', 'layer', 'level', 'bridge', 'tunnel', 'covered', 'oneway', 'sidewalk', 'kerb', 'footway',
  'barrier', 'wall', 'fence_type', 'amenity', 'leisure', 'landuse', 'natural', 'water', 'waterway', 'man_made', 'place', 'historic', 'ruins', 'tourism', 'railway', 'ele', 'entrance', 'door', 'shop', 'type', 'wikidata', 'wikimedia_commons',
]);
// real business names never reach the game; the study keeps a shop's kind, not its name
const COMMERCIAL = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bank', 'pharmacy', 'casino', 'nightclub', 'fuel', 'atm', 'bureau_de_change', 'ice_cream', 'money_transfer', 'clinic', 'dentist']);

function trimTags(tags) {
  if (!tags) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(tags)) if (KEEP.has(k)) out[k] = v;
  if (tags.shop || tags.office || tags.brand || tags.craft || COMMERCIAL.has(tags.amenity)) for (const k of ['name', 'name:zh', 'name:pt', 'name:en', 'alt_name']) delete out[k];
  return Object.keys(out).length ? out : undefined;
}

/** The elements, trimmed: nodes with lat/lon, ways with node lists, relations with members, the kept tags. */
export function trim(elements) {
  const out = [];
  for (const e of elements) {
    const t = { type: e.type, id: e.id };
    if (e.type === 'node') Object.assign(t, { lat: round(e.lat, 7), lon: round(e.lon, 7) });
    if (e.type === 'way') t.nodes = e.nodes;
    if (e.type === 'relation') t.members = e.members.map(({ type, ref, role }) => ({ type, ref, role }));
    const tags = trimTags(e.tags);
    if (tags) t.tags = tags;
    out.push(t);
  }
  const order = { node: 0, way: 1, relation: 2 };
  return out.sort((a, b) => order[a.type] - order[b.type] || a.id - b.id);
}

async function get(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchBox([s, w, n, e]) {
  const tried = [];
  try {
    const j = await get(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`);
    return { source: 'api.openstreetmap.org /api/0.6/map', elements: j.elements };
  } catch (err) {
    tried.push(`OSM API: ${err.message}`);
  }
  const q = `[out:json][timeout:90];(nwr(${s},${w},${n},${e}););out body;>;out body qt;`;
  for (const url of OVERPASS) {
    try {
      const j = await get(url, { method: 'POST', body: new URLSearchParams({ data: q }) });
      const seen = new Set();
      const elements = j.elements.filter((x) => !seen.has(`${x.type}${x.id}`) && seen.add(`${x.type}${x.id}`));
      return { source: `Overpass ${new URL(url).host}`, elements };
    } catch (err) {
      tried.push(`${new URL(url).host}: ${err.message}`);
    }
  }
  throw new Error(`no OSM source answered (massing/README.md: never build a map by hand instead):\n  ${tried.join('\n  ')}`);
}

async function main() {
  const id = process.argv[2];
  const site = readSite(id);
  const { toLatLon } = projection(site.origin);
  const [s, w] = toLatLon(-site.half, -site.half);
  const [n, e] = toLatLon(site.half, site.half);
  const box = [s, w, n, e].map((v) => round(v, 7));
  if ((box[2] - box[0]) * (box[3] - box[1]) > 0.25) throw new Error('the box is over the OSM API limit of 0.25 square degrees');
  const { source, elements } = await fetchBox(box);
  const raw = {
    format: 1,
    id,
    fetched: new Date().toISOString().slice(0, 10),
    source,
    bbox: { south: box[0], west: box[1], north: box[2], east: box[3] },
    attribution: ATTRIBUTION,
    elements: trim(elements),
  };
  const file = path.join(studyDir(id), 'data', 'osm_raw.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringifyLines(raw));
  const count = (t) => raw.elements.filter((x) => x.type === t).length;
  console.log(`${id}: ${count('node')} nodes, ${count('way')} ways, ${count('relation')} relations from ${source} → ${path.relative(process.cwd(), file)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
