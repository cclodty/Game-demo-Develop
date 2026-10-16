// index.html + viewer/ -> senado/export/senado_viewer.html: the whole viewer in one file that opens with a double
// click, offline (no server, no CDN).
//
//   node senado/scripts/export_html.mjs
//
// esbuild bundles viewer/main.js with three.js into one inline module. The model data, the textures, the photo
// credits and the reference photos are embedded; a small shim imported ahead of main.js answers the viewer's
// fetch() calls and three.js texture loads from them, so main.js is unchanged. The Esri satellite images
// (reference/*.jpg, git-ignored, alignment reference only) are left out: the minimap card is hidden and the
// satellite toggle reports that the image is missing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(root, 'export/senado_viewer.html');
const read = (rel) => fs.readFileSync(path.join(root, rel));
const dataUri = (rel) => `data:${{ '.png': 'image/png', '.jpg': 'image/jpeg' }[path.extname(rel)]};base64,${read(rel).toString('base64')}`;

// JSON answered to fetch(); images handed to three.js as data URIs (a data URI does not taint WebGL textures,
// a file:// image does). The photo credits point straight at their embedded photos.
const credits = JSON.parse(read('reference/photos/credits.json'));
for (const ph of Object.values(credits.photos)) ph.src = dataUri(ph.src);
const json = {
  'data/senado_massing.json': read('data/senado_massing.json').toString('utf8'),
  'reference/photos/credits.json': JSON.stringify(credits),
};
const images = Object.fromEntries(fs.readdirSync(path.join(root, 'viewer/assets'))
  .filter((f) => f.endsWith('.png'))
  .map((f) => [`viewer/assets/${f}`, dataUri(`viewer/assets/${f}`)]));

const shim = `
import * as THREE from 'three';
const json = ${JSON.stringify(json)};
const images = ${JSON.stringify(images)};
THREE.DefaultLoadingManager.setURLModifier((url) => images[url] || url);
const fetch0 = window.fetch.bind(window);
window.fetch = (url, opts) => (typeof url === 'string' && url in json
  ? Promise.resolve(new Response(json[url], { headers: { 'content-type': 'application/json' } }))
  : fetch0(url, opts));
`;

const result = await esbuild.build({
  stdin: { contents: "import './export-shim.js';\nimport './main.js';\n", resolveDir: path.join(root, 'viewer'), loader: 'js' },
  bundle: true, format: 'esm', minify: true, write: false, target: 'es2020', legalComments: 'inline', logLevel: 'warning',
  plugins: [{
    name: 'shim',
    setup(b) {
      b.onResolve({ filter: /^\.\/export-shim\.js$/ }, () => ({ path: 'export-shim', namespace: 'shim' }));
      b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({ contents: shim, resolveDir: path.join(root, 'viewer'), loader: 'js' }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

let html = read('index.html').toString('utf8');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html changed, not found: ${from.slice(0, 60)}`);
  html = html.replace(from, () => to);
};
swap(/<script type="importmap">[\s\S]*?<\/script>\s*/.exec(html)?.[0] ?? '<script type="importmap">', '');
swap('<script type="module" src="viewer/main.js"></script>', `<script type="module">\n${js}</script>`);
// no satellite image in the export: hide the minimap card, and load nothing
swap('<div class="card">\n        <h2>位置圖', '<div class="card" hidden>\n        <h2>位置圖');
swap(' src="reference/sat_core.jpg"', '');

fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(path.resolve(root, '..'), out)}  ${(fs.statSync(out).size / 1e6).toFixed(2)} MB  (script ${(js.length / 1e6).toFixed(2)} MB)`);
