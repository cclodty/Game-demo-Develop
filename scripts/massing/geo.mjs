// Where a massing study sits on the earth and in the game (massing/README.md).
//
// A study's data is in metres on the local tangent plane at the site's origin
// (massing/<id>/site.json `origin`): x east, y north, the WGS84 ellipsoid turned
// into east-north-up coordinates, so a building 500 m away is still placed to
// the millimetre. The game turns that plane `rotDeg` degrees anticlockwise (the
// way src/senado/transform.js turns the Senado model) and flips north to -Z:
// the game's +X is east and +Z south when rotDeg is 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const STUDIES = path.join(ROOT, 'massing');
export const USER_AGENT = 'bullet-ballet-massing/1 (https://github.com/cclodty/Game-demo-Develop)';
export const ATTRIBUTION = '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)';

const A = 6378137; // WGS84 semi-major axis
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const RAD = Math.PI / 180;

function ecef(lat, lon) {
  const p = lat * RAD;
  const l = lon * RAD;
  const n = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
  return [n * Math.cos(p) * Math.cos(l), n * Math.cos(p) * Math.sin(l), n * (1 - E2) * Math.sin(p)];
}

/** The radii of curvature at a latitude: [meridian, prime vertical], in metres. */
export function radii(lat) {
  const s = Math.sin(lat * RAD) ** 2;
  return [(A * (1 - E2)) / (1 - E2 * s) ** 1.5, A / Math.sqrt(1 - E2 * s)];
}

/** A projection about an origin: lat/lon to [x east, y north] metres and back. */
export function projection(origin) {
  const { lat: lat0, lon: lon0 } = origin;
  const o = ecef(lat0, lon0);
  const sp = Math.sin(lat0 * RAD);
  const cp = Math.cos(lat0 * RAD);
  const sl = Math.sin(lon0 * RAD);
  const cl = Math.cos(lon0 * RAD);
  const [M, N] = radii(lat0);
  const toLocal = (lat, lon) => {
    const [x, y, z] = ecef(lat, lon);
    const dx = x - o[0];
    const dy = y - o[1];
    const dz = z - o[2];
    return [-sl * dx + cl * dy, -sp * cl * dx - sp * sl * dy + cp * dz];
  };
  const toLatLon = (x, y) => {
    // Newton steps on the forward projection, started from the local radii: three are well under a millimetre
    let lat = lat0 + y / M / RAD;
    let lon = lon0 + x / (N * cp) / RAD;
    for (let i = 0; i < 4; i++) {
      const [ex, ey] = toLocal(lat, lon);
      lat += (y - ey) / M / RAD;
      lon += (x - ex) / (N * cp) / RAD;
    }
    return [lat, lon];
  };
  return { toLocal, toLatLon };
}

/** Study plane (x east, y north) to game [X, Z], and back, for a site turned rotDeg anticlockwise. */
export function placement(rotDeg = 0) {
  const t = rotDeg * RAD;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return {
    toGame: (x, y) => [x * c - y * s, -(x * s + y * c)],
    toData: (X, Z) => [X * c - Z * s, -(X * s) - Z * c],
  };
}

export function studyDir(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) throw new Error(`a study id is lower-case letters, digits and dashes, not ${JSON.stringify(id)}`);
  return path.join(STUDIES, id);
}

/** A study's site.json, checked: { id, name, en, origin: { lat, lon }, rotDeg, half, ... }. */
export function readSite(id) {
  const file = path.join(studyDir(id), 'site.json');
  const site = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { origin, half } = site;
  if (site.id !== id) throw new Error(`${file}: id is ${site.id}, not ${id}`);
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) throw new Error(`${file}: origin needs lat and lon`);
  if (!Number.isFinite(half) || half <= 0 || half > 1000) throw new Error(`${file}: half is the data box's half size in metres (up to 1,000)`);
  return { rotDeg: 0, ...site };
}

export const round = (v, d = 2) => {
  const k = 10 ** d;
  return Math.round(v * k) / k || 0;
};

/** JSON with each top-level key on a line and each element of a top-level array on its own line: small, and a diff shows what moved. */
export function stringifyLines(obj) {
  const keys = Object.keys(obj);
  const lines = keys.map((k, i) => {
    const v = obj[k];
    const end = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(v) && v.length) return ` ${JSON.stringify(k)}: [\n${v.map((x) => `  ${JSON.stringify(x)}`).join(',\n')}\n ]${end}`;
    return ` ${JSON.stringify(k)}: ${JSON.stringify(v)}${end}`;
  });
  return `{\n${lines.join('\n')}\n}\n`;
}
