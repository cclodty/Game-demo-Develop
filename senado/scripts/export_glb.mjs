// senado_massing.json -> senado/export/senado_massing.glb (via the same builder the viewer uses)
//
//   node senado/scripts/export_glb.mjs                 real scale, 1 unit = 1 m
//   node senado/scripts/export_glb.mjs --scale 1.25    uniform gameplay scale
//   node senado/scripts/export_glb.mjs --plan 1.25     widen streets/squares only, keep heights
//
// glTF is Y-up, metres. Each building near the square is its own node (name B_<osm id>[_landmark]),
// with OSM metadata in node extras; the skyline context is one merged mesh.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildSenado } from '../viewer/model.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const scale = parseFloat(args.scale || '1');
const plan = parseFloat(args.plan || '1');

// GLTFExporter reads Blobs through FileReader, which Node does not ship.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type};base64,${Buffer.from(b).toString('base64')}`; this.onloadend?.(); }); }
};

const data = JSON.parse(fs.readFileSync(path.join(root, 'data/senado_massing.json'), 'utf8'));
const { root: model } = buildSenado(data, { mode: 'export' });
const sx = scale * plan, sy = scale;
model.scale.set(sx, sy, sx);
model.userData.scale = { horizontal: sx, vertical: sy };
model.updateMatrixWorld(true);

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(model, { binary: true, onlyVisible: true });
const asset = (n) => fs.readFileSync(path.join(root, 'viewer/assets', n));
const out = injectTextures(Buffer.from(glb), [
  { name: 'calcada_waves', png: asset('calcada_waves.png'), materials: (m) => m === 'Calcada', tint: false },
  // detail maps multiply the window colour, so those materials keep their baseColorFactor
  { name: 'louvre', png: asset('louvre.png'), materials: (m) => m.startsWith('Window_shutter'), tint: true },
  { name: 'glazing', png: asset('glazing.png'), materials: (m) => m === 'Window_glass' || m.startsWith('Window_glaze'), tint: true },
]);

const suffix = scale !== 1 ? `_x${scale}` : plan !== 1 ? `_plan${plan}` : '';
const file = path.join(root, 'export', `senado_massing${suffix}.glb`);
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, out);
let meshes = 0;
model.traverse((o) => { if (o.isMesh) meshes++; });
console.log(`wrote ${path.relative(process.cwd(), file)}  ${(out.length / 1048576).toFixed(2)} MB  meshes=${meshes}  scale h=${sx} v=${sy}`);

// Embed PNGs as baseColorTexture of the matching materials (the exporter cannot encode images without a DOM canvas).
// tint keeps the material's baseColorFactor, so a greyscale detail map is multiplied by the material colour.
function injectTextures(buf, list) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8').trim());
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  let bin = buf.subarray(binStart + 8, binStart + 8 + binLen);
  const pad = (n) => (4 - (n % 4)) % 4;
  for (const { name, png, materials, tint } of list) {
    const targets = json.materials.filter((m) => materials(m.name || ''));
    if (!targets.length) throw new Error(`no material for ${name}`);
    const offset = bin.length;
    bin = Buffer.concat([bin, png, Buffer.alloc(pad(png.length))]);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: png.length });
    (json.images ??= []).push({ bufferView: json.bufferViews.length - 1, mimeType: 'image/png', name });
    (json.samplers ??= []).push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
    (json.textures ??= []).push({ sampler: json.samplers.length - 1, source: json.images.length - 1 });
    for (const mat of targets) {
      const pbr = mat.pbrMetallicRoughness || {};
      mat.pbrMetallicRoughness = { ...pbr, baseColorFactor: tint ? pbr.baseColorFactor || [1, 1, 1, 1] : [1, 1, 1, 1], baseColorTexture: { index: json.textures.length - 1 } };
    }
  }
  json.buffers[0].byteLength = bin.length;
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc(pad(js.length), 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([header, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]);
}
