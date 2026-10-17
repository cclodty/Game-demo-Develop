// The asset pipeline: a tiny master GLB goes through scripts/assets.mjs into a
// web model plus an index entry, and scripts/asset-docs.mjs regenerates the
// prompt list, asset list and map layouts. Everything runs in a temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';
import { ASSETS } from '../src/asset-manifest.js';
import { MAPS } from '../src/maps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-assets-'));
const run = (script, env) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', script)], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });

/** A 1.4 m textured cube: the smallest thing that exercises mesh and texture processing. */
async function writeCube(file) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const s = 0.7;
  const corners = [];
  for (const y of [0, 1.4]) for (const z of [-s, s]) for (const x of [-s, s]) corners.push(x, y, z);
  const position = doc.createAccessor().setType('VEC3').setArray(new Float32Array(corners)).setBuffer(buffer);
  const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array(16).fill(0.5)).setBuffer(buffer);
  const faces = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
  const indices = doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(faces)).setBuffer(buffer);
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#a0522d' } }).png().toBuffer();
  const texture = doc.createTexture('wood').setImage(new Uint8Array(png)).setMimeType('image/png');
  const material = doc.createMaterial('crate').setBaseColorTexture(texture);
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setAttribute('TEXCOORD_0', uv).setIndices(indices).setMaterial(material);
  const node = doc.createNode('crate').setMesh(doc.createMesh('crate').addPrimitive(prim));
  doc.createScene('scene').addChild(node);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await new NodeIO().write(file, doc);
}

test('a master GLB becomes a web model and an index entry', async () => {
  const source = path.join(tmp, 'source');
  const out = path.join(tmp, 'models');
  const index = path.join(tmp, 'models-index.js');
  await writeCube(path.join(source, 'crate', 'crate.glb'));
  const env = { BB_ASSETS_SOURCE: source, BB_ASSETS_OUT: out, BB_MODELS_INDEX: index };
  const log = run('assets.mjs', env);
  assert.match(log, /crate: 12 → 12 tris/);
  assert.ok(fs.existsSync(path.join(out, 'crate.glb')));
  const { MODELS } = await import(`file://${index}`);
  assert.equal(MODELS.crate.file, 'crate.glb');
  assert.equal(MODELS.crate.tris, 12);
  assert.deepEqual(MODELS.crate.size.map((v) => +v.toFixed(1)), [1.4, 1.4, 1.4]);
  // a second run with nothing changed rebuilds nothing
  assert.doesNotMatch(run('assets.mjs', env), /crate:/);
  // inspect prints the essentials
  const info = execFileSync(process.execPath, [path.join(ROOT, 'scripts/assets.mjs'), 'inspect', path.join(out, 'crate.glb')], { encoding: 'utf8' });
  assert.match(info, /12 tris/);
  assert.match(info, /no skeleton/);
});

test('the docs generator writes the prompt list, asset list and map layouts', async () => {
  const docs = path.join(tmp, 'docs');
  fs.mkdirSync(docs, { recursive: true });
  run('asset-docs.mjs', { BB_DOCS_OUT: docs });
  const prompts = fs.readFileSync(path.join(docs, 'PROMPTS.md'), 'utf8');
  for (const id of Object.keys(ASSETS)) assert.ok(prompts.includes(`### \`${id}\``), `PROMPTS.md lacks ${id}`);
  const list = JSON.parse(fs.readFileSync(path.join(docs, 'asset-list.json'), 'utf8'));
  assert.equal(list.assets.length, Object.keys(ASSETS).length);
  for (const a of list.assets) {
    assert.ok(a.size.x > 0 && a.size.y >= 0 && a.size.z > 0, `${a.id} has no size`);
    assert.ok(a.prompt.length > 20, `${a.id} has no prompt`);
  }
  for (const map of MAPS) {
    const j = JSON.parse(fs.readFileSync(path.join(docs, 'maps', `${map.id}.json`), 'utf8'));
    assert.equal(j.solids.length, map.solids.length);
    for (const s of j.solids) assert.ok(s.asset === null || ASSETS[s.asset], `${map.id}: solid ${s.kind} points at an unknown asset ${s.asset}`);
  }
  assert.ok(fs.statSync(path.join(docs, 'asset-list.csv')).size > 1000);
});
