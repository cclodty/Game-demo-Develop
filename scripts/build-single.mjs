#!/usr/bin/env node
// Bundles the game into one self-contained HTML page for sharing (claude.ai
// artifact, e-mail, a USB stick): the vendored three.js, every module, the
// styles and the default web models as data URIs. The result must stay under
// 16 MB for the artifact host. `npm run build` → dist/bullet-ballet.html
//
//   node scripts/build-single.mjs [out.html]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist/bullet-ballet.html'));

// the importmap in index.html points "three" at vendor/; the bundle resolves it the same way
const threePlugin = {
  name: 'three-vendor',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(ROOT, 'vendor/three/build/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(ROOT, 'vendor/three/addons', a.path.slice('three/addons/'.length)) }));
  },
};
const res = await esbuild.build({
  entryPoints: [path.join(ROOT, 'src/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: 'es2020',
  legalComments: 'inline',
  write: false,
  plugins: [threePlugin],
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fonts = [...html.matchAll(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g)].map((m) => m[0]).join('\n');
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/<script type="module"[^>]*><\/script>/, '').replace(/<noscript>[\s\S]*?<\/noscript>/, '');

// inline the models the game would pick by default (no ?use=) as data URIs
const { MODELS } = await import(pathToFileURL(path.join(ROOT, 'src/models-index.js')));
const { ASSETS } = await import(pathToFileURL(path.join(ROOT, 'src/asset-manifest.js')));
const inline = {};
for (const id of Object.keys(ASSETS)) {
  const names = Object.keys(MODELS).filter((n) => n.split('-')[0] === id);
  const name = names.includes(id) ? id : names[0];
  if (!name) continue;
  const file = MODELS[name].file;
  inline[file] = `data:model/gltf-binary;base64,${fs.readFileSync(path.join(ROOT, 'assets/models', file)).toString('base64')}`;
}
const modelScript = Object.keys(inline).length ? `<script>window.BULLET_BALLET_MODELS = ${JSON.stringify(inline)};</script>\n` : '';

const page = `<title>Bullet Ballet</title>
${fonts}
<style>
${css}
</style>
${body.trim()}
${modelScript}<script>
${js}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
const mb = page.length / 1048576;
console.log(`wrote ${path.relative(ROOT, out)} (${mb.toFixed(2)} MB${Object.keys(inline).length ? `, models: ${Object.keys(inline).join(', ')}` : ''})`);
if (mb > 16) {
  console.error('over the 16 MB single-file limit');
  process.exit(1);
}
