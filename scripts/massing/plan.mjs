#!/usr/bin/env node
// Draws a study's plan (massing/README.md):
//
//   npm run massing:plan -- <id>
//
// massing/<id>/plan.svg, in game metres (X right, Z down the page, north as the
// arrow shows): the real buildings shaded by height (taller is darker, the
// height written on the ones near the play area), streets at their width,
// steps hatched tread by tread, squares, parks and water, street furniture;
// and over it in red the game map as it is now (assets/maps/<id>.json: its
// solids, its buildings, its playable area, its steps and zones), so the gap
// between the real place and the map shows at a glance.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { placement, readSite, ROOT, round, studyDir } from './geo.mjs';

const AREA_FILL = [
  [/^leisure=(park|garden|playground)/, '#d9e7c9'],
  [/^(place=square|highway=)/, '#e9e3d6'],
  [/^(natural=(water|bay|strait|coastline)|water=|waterway=)/, '#b9d3e6'],
  [/^man_made=(pier|bridge)/, '#cfc6b4'],
  [/^amenity=parking/, '#e2e2e2'],
  [/^natural=(wood|scrub|grassland)/, '#cfe0bf'],
  [/^landuse=(grass|forest)/, '#cfe0bf'],
  [/./, '#ece7de'],
];
const POINT_STYLE = { lamp: ['#e0a800', 0.45], tree: ['#7aa95c', 1.6], bollard: ['#4a4038', 0.25], bench: ['#8a6a48', 0.5], bin: ['#4a4038', 0.3], signals: ['#c03030', 0.4] };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f = (v) => round(v, 2);

function shade(h) {
  const l = Math.round(92 - (Math.min(h, 60) / 60) * 52);
  return `hsl(30 8% ${l}%)`;
}

/** The plan's SVG text: the study's massing, and the game map on top when there is one. */
export function drawPlan(site, massing, map = null) {
  const { toGame } = placement(site.rotDeg);
  const G = (p) => toGame(p[0], p[1]);
  const pts = (ring) => ring.map((p) => G(p).map(f).join(',')).join(' ');
  const W = map ? map.playable.width / 2 : 40;
  const D = map ? map.playable.depth / 2 : 40;
  const [x0, z0, x1, z1] = (site.plan && site.plan.view) || [-W - 40, -D - 40, W + 40, D + 40];
  const vw = x1 - x0;
  const vh = z1 - z0;
  const S = Math.min(8, 1600 / Math.max(vw, vh)); // px a metre
  const inView = (ring) => ring.some((p) => {
    const [X, Z] = G(p);
    return X >= x0 && X <= x1 && Z >= z0 && Z <= z1;
  });
  const near = (ring) => ring.some((p) => {
    const [X, Z] = G(p);
    return Math.abs(X) <= W + 12 && Math.abs(Z) <= D + 12;
  });
  const out = [];
  const add = (s) => out.push(s);
  add(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vw * S)}" height="${Math.round(vh * S + 110)}" viewBox="${f(x0)} ${f(z0)} ${f(vw)} ${f(vh + 110 / S)}" font-family="'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif">`);
  add(`<rect x="${f(x0)}" y="${f(z0)}" width="${f(vw)}" height="${f(vh + 110 / S)}" fill="#f5f2eb"/>`);

  // the real place, clipped to the view so the key below stays clear
  add(`<clipPath id="view"><rect x="${f(x0)}" y="${f(z0)}" width="${f(vw)}" height="${f(vh)}"/></clipPath><g clip-path="url(#view)">`);
  add('<g id="areas">');
  for (const a of massing.areas) {
    if (!inView(a.ring)) continue;
    const fill = AREA_FILL.find(([re]) => re.test(a.kind))[1];
    add(`<polygon points="${pts(a.ring)}" fill="${fill}"/>`);
  }
  add('</g><g id="roads" fill="none" stroke-linecap="round" stroke-linejoin="round">');
  for (const r of massing.roads) {
    if (!inView(r.line) || r.tunnel) continue;
    add(`<polyline points="${pts(r.line)}" stroke="#cbc2b1" stroke-width="${f(r.width + 0.5)}"/>`);
  }
  for (const r of massing.roads) {
    if (!inView(r.line) || r.tunnel) continue;
    add(`<polyline points="${pts(r.line)}" stroke="#fdfcf8" stroke-width="${f(r.width)}"/>`);
  }
  add('</g><g id="steps" fill="none">');
  for (const s of massing.steps) {
    if (!inView(s.line) || s.tunnel) continue;
    // a thick line dashed every 0.3 m: one stripe a tread (the real tread depth is the study's to measure)
    add(`<polyline points="${pts(s.line)}" stroke="#e7d6b0" stroke-width="${f(s.width)}"/>`);
    add(`<polyline points="${pts(s.line)}" stroke="#a08a60" stroke-width="${f(s.width)}" stroke-dasharray="0.06 0.24"/>`);
  }
  add('</g><g id="barriers" fill="none" stroke="#6b5f50" stroke-width="0.35">');
  for (const b of massing.barriers) if (inView(b.line)) add(`<polyline points="${pts(b.line)}"/>`);
  add('</g><g id="buildings" stroke="#4f473e" stroke-width="0.14">');
  const labels = [];
  for (const b of massing.buildings) {
    if (!inView(b.ring)) continue;
    const mark = b.historic || b.tourism || b.amenity === 'place_of_worship';
    add(`<polygon points="${pts(b.ring)}" fill="${shade(b.height)}"${mark ? ' stroke="#c8641e" stroke-width="0.5"' : ''}${b.heightSource === 'estimate' ? ' fill-opacity="0.75" stroke-dasharray="0.6 0.4"' : ''}/>`);
    if (near(b.ring) && b.area > 40) {
      const c = b.ring.reduce((s, p) => [s[0] + p[0] / b.ring.length, s[1] + p[1] / b.ring.length], [0, 0]);
      labels.push([G(c), `${b.height}${b.heightSource === 'estimate' ? '?' : ''}`]);
    }
  }
  add('</g><g id="points">');
  for (const p of massing.points) {
    const [X, Z] = G([p.x, p.y]);
    if (X < x0 || X > x1 || Z < z0 || Z > z1) continue;
    const [c, r] = POINT_STYLE[p.kind] || ['#7a6a5a', 0.4];
    add(`<circle cx="${f(X)}" cy="${f(Z)}" r="${r}" fill="${c}" fill-opacity="${p.kind === 'tree' ? 0.6 : 1}"/>`);
  }
  add('</g><g id="heights" font-size="1.6" fill="#2a241e" text-anchor="middle">');
  for (const [[X, Z], t] of labels) add(`<text x="${f(X)}" y="${f(Z + 0.55)}">${t}</text>`);
  add('</g><g id="names" font-size="2.4" fill="#8a3c0c" text-anchor="middle" font-weight="bold">');
  for (const l of massing.landmarks) {
    const [X, Z] = G(l.at);
    if (X >= x0 && X <= x1 && Z >= z0 && Z <= z1) add(`<text x="${f(X)}" y="${f(Z)}">${esc(l.name.split(' ')[0])}</text>`);
  }
  add('</g>');

  // the game map as it is now
  if (map) {
    add('<g id="game" fill="#e6283c" fill-opacity="0.16" stroke="#e6283c" stroke-width="0.3">');
    for (const s of map.solids) add(`<rect x="${f(s.x - s.w / 2)}" y="${f(s.z - s.d / 2)}" width="${f(s.w)}" height="${f(s.d)}"/>`);
    for (const b of map.buildings || []) add(`<polygon points="${b.footprint.map((p) => p.map(f).join(',')).join(' ')}"/>`);
    add('</g>');
    add(`<rect x="${f(-W)}" y="${f(-D)}" width="${f(2 * W)}" height="${f(2 * D)}" fill="none" stroke="#0090c0" stroke-width="0.45" stroke-dasharray="1.6 0.8"/>`);
    for (const z of map.zones || []) {
      const [a, b, c, d] = z.box;
      add(`<rect x="${f(a)}" y="${f(b)}" width="${f(c - a)}" height="${f(d - b)}" fill="#00a0c8" fill-opacity="0.08" stroke="#0090c0" stroke-width="0.2"/>`);
      add(`<text x="${f(a + 0.8)}" y="${f(b + 2.4)}" font-size="2" fill="#006c90">${esc(z.name)} ${z.y} m</text>`);
    }
    if (map.steps) {
      for (const p of map.steps.profile) add(`<line x1="${f(-W)}" y1="${f(p.z)}" x2="${f(W)}" y2="${f(p.z)}" stroke="#b0309a" stroke-width="0.2" stroke-dasharray="0.8 0.5"/><text x="${f(W + 0.6)}" y="${f(p.z + 0.6)}" font-size="1.6" fill="#b0309a">${p.height} m</text>`);
    }
    add(`<circle cx="${f(map.start.x)}" cy="${f(map.start.z)}" r="0.7" fill="#0090c0"/>`);
  }
  add('</g>');

  // the key: north, scale, legend, sources
  const nx = x1 - 8;
  const ny = z0 + 9;
  const [ax, az] = toGame(0, 1);
  add(`<g id="north" stroke="#2a241e" stroke-width="0.35" fill="#2a241e"><circle cx="${f(nx)}" cy="${f(ny)}" r="5" fill="#fff" fill-opacity="0.8"/><line x1="${f(nx - ax * 4)}" y1="${f(ny - az * 4)}" x2="${f(nx + ax * 4)}" y2="${f(ny + az * 4)}"/><text x="${f(nx + ax * 6)}" y="${f(ny + az * 6 + 0.9)}" font-size="2.6" text-anchor="middle" stroke="none">N</text></g>`);
  const by = z1 + 2;
  add(`<g id="scale" font-size="1.8" fill="#2a241e"><rect x="${f(x0 + 3)}" y="${f(by)}" width="10" height="0.8" fill="#2a241e"/><rect x="${f(x0 + 13)}" y="${f(by)}" width="40" height="0.8" fill="#fff" stroke="#2a241e" stroke-width="0.15"/><text x="${f(x0 + 3)}" y="${f(by + 3)}">0</text><text x="${f(x0 + 12)}" y="${f(by + 3)}">10</text><text x="${f(x0 + 51)}" y="${f(by + 3)}">50 m</text></g>`);
  const k = 1.8;
  const lx = x0 + 60;
  const legend = [
    ['#7a7068', '真實樓宇（深色較高；數字是高度，? 是估算）'],
    ['#e7d6b0', '石階（每條紋一級，示意）'],
    ['#e6283c', '遊戲現在的碰撞體'],
    ['#0090c0', '遊戲的可玩範圍與戰區'],
  ];
  legend.forEach(([c, t], i) => add(`<rect x="${f(lx + (i % 2) * 48)}" y="${f(by + Math.floor(i / 2) * 3.2 - 0.2)}" width="2" height="1.6" fill="${c}"/><text x="${f(lx + (i % 2) * 48 + 3)}" y="${f(by + Math.floor(i / 2) * 3.2 + 1.2)}" font-size="${k}" fill="#2a241e">${esc(t)}</text>`));
  add(`<text x="${f(x0 + 3)}" y="${f(by + 7)}" font-size="2.2" fill="#2a241e" font-weight="bold">${esc(site.name)} ${esc(site.en)}：量體研究平面圖</text>`);
  add(`<text x="${f(x0 + 3)}" y="${f(by + 9.6)}" font-size="1.6" fill="#5a5048">${esc(massing.attribution)}；OSM 抽取 ${esc(massing.fetched)}；旋轉 ${site.rotDeg}°；scripts/massing/plan.mjs</text>`);
  add('</svg>');
  return `${out.join('\n')}\n`;
}

function main() {
  const id = process.argv[2];
  const site = readSite(id);
  const dir = studyDir(id);
  const massing = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'massing.json'), 'utf8'));
  const mapFile = path.join(ROOT, 'assets', 'maps', `${site.map || id}.json`);
  const map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : null;
  fs.writeFileSync(path.join(dir, 'plan.svg'), drawPlan(site, massing, map));
  console.log(`${id}: plan.svg${map ? ` with the game map ${path.relative(ROOT, mapFile)} over it` : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
