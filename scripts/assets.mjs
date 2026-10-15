#!/usr/bin/env node
// Turns the high-quality masters in assets/source/ into small, web-ready
// models in assets/models/, and writes src/models-index.js so the game knows
// what exists. The masters stay untouched (they are what another engine would
// import; see assets/SPEC.md).
//
//   npm run assets                 build every master that changed
//   npm run assets -- --all        rebuild everything
//   npm run assets -- inspect f.glb [...]   print size, triangles, bones, clips
//   npm run assets:docs            regenerate PROMPTS.md, asset-list.*, maps/*.json
//
// Naming (any folder under assets/source/, usually one folder per asset):
//   hero.glb             the master for manifest id "hero"
//   hero-tripo.glb       a variant ("-" + anything) — handy for comparing tools;
//                        pick one in game with ?use=hero-tripo
//   hero@run.glb         an extra animation for hero.glb; only its animation is
//                        kept and it is renamed "run" (bones are matched by name)
//   hero-tripo@run.glb   the same for a variant

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, meshopt, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { ASSETS } from '../src/asset-manifest.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'assets/source');
const OUT = path.join(ROOT, 'assets/models');
const INDEX = path.join(ROOT, 'src/models-index.js');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
// clips the game plays (or may soon); others (dances, waves, T-poses) are dropped to save space
const KEEP_CLIPS = /idle|stand|breath|run|jog|sprint|walk|death|dying|die|dead|kick|hit|hurt|roll|dive|spin|jump/i;

const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN)).registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

function stats(doc) {
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const n = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
      tris += prim.getMode() === 4 ? n / 3 : Math.max(0, n - 2);
    }
  }
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const b = getBounds(scene);
  const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
  return {
    tris: Math.round(tris),
    size,
    skinned: root.listSkins().length > 0,
    joints: root.listSkins()[0]?.listJoints().map((j) => j.getName()) ?? [],
    clips: root.listAnimations().map((a) => a.getName()),
    textures: root.listTextures().map((t) => `${t.getMimeType().replace('image/', '')} ${t.getSize()?.join('×') ?? '?'}`),
  };
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

/** Copy the animations of `src` into `doc`, binding channels to nodes with the same name. */
function mergeClips(doc, src, rename) {
  const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
  const copyAcc = (a) =>
    doc
      .createAccessor(a.getName())
      .setType(a.getType())
      .setArray(a.getArray().slice())
      .setNormalized(a.getNormalized())
      .setBuffer(doc.getRoot().listBuffers()[0]);
  const anims = src.getRoot().listAnimations();
  let missing = 0;
  for (const [i, anim] of anims.entries()) {
    // one clip: name it after the file; several: keep their own names
    const out = doc.createAnimation(anims.length === 1 ? rename : anim.getName() || `${rename}${i + 1}`);
    for (const ch of anim.listChannels()) {
      const target = nodes.get(ch.getTargetNode()?.getName());
      if (!target) {
        missing++;
        continue;
      }
      const s = ch.getSampler();
      const sampler = doc.createAnimationSampler().setInput(copyAcc(s.getInput())).setOutput(copyAcc(s.getOutput())).setInterpolation(s.getInterpolation());
      out.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
  }
  return missing;
}

async function build(name, files) {
  const id = name.split('-')[0];
  const spec = ASSETS[id];
  if (!spec) console.warn(`  ! ${name}: "${id}" is not in src/asset-manifest.js — built anyway, but the game won't use it`);
  const budget = spec?.tris ?? 3000;
  const texSize = spec?.texture ?? 512;
  const doc = await io.read(files.main);
  if (!doc.getRoot().listBuffers().length) doc.createBuffer();
  const before = stats(doc);
  for (const f of files.clips) {
    const clip = path.basename(f).slice(name.length + 1, -4);
    const missing = mergeClips(doc, await io.read(f), clip);
    if (missing) console.warn(`  ! ${path.basename(f)}: ${missing} channels had no matching bone (different rig?)`);
  }
  const dropped = [];
  for (const anim of doc.getRoot().listAnimations()) {
    if (KEEP_CLIPS.test(anim.getName()) && !/t-?pose/i.test(anim.getName())) continue;
    dropped.push(anim.getName());
    anim.dispose();
  }
  // weapons keep their empty socket_* helper nodes (muzzle, support hand, ...)
  const keepLeaves = !!spec?.sockets;
  const ops = [dedup(), prune({ keepLeaves }), weld()];
  if (before.tris > budget) ops.push(simplify({ simplifier: MeshoptSimplifier, ratio: budget / before.tris, error: 0.02 }));
  ops.push(resample(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texSize, texSize] }), prune({ keepLeaves }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await doc.transform(...ops);
  const after = stats(doc);
  const file = `${name}.glb`;
  await io.write(path.join(OUT, file), doc);
  const bytes = fs.statSync(path.join(OUT, file)).size;
  const warn = [];
  if (after.tris > budget * 1.1) warn.push(`${after.tris} tris > budget ${budget}`);
  if (spec?.sockets) {
    const nodes = new Set(doc.getRoot().listNodes().map((n) => n.getName()));
    const lost = Object.keys(spec.sockets).filter((s) => !nodes.has(`socket_${s}`));
    if (lost.length) warn.push(`no ${lost.map((s) => `socket_${s}`).join(', ')}`);
  }
  if (spec?.kind === 'character' && !after.skinned) warn.push('no skeleton — rig it before export');
  if (spec?.kind === 'character' && after.skinned && !after.clips.some((c) => /run|jog|sprint|walk/i.test(c))) warn.push('no run/walk clip');
  console.log(`  ${name}: ${before.tris} → ${after.tris} tris, ${kb(fs.statSync(files.main).size)} → ${kb(bytes)}, clips [${after.clips.join(', ')}]${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}${warn.length ? `  ⚠ ${warn.join('; ')}` : ''}`);
  return { id, file, bytes, tris: after.tris, size: after.size, skinned: after.skinned, clips: after.clips };
}

function writeIndex() {
  const models = {};
  const old = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
  const prev = JSON.parse(old.match(/= (\{[\s\S]*\});/)?.[1] ?? '{}');
  for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.glb')).sort()) {
    const name = f.slice(0, -4);
    models[name] = built[name] ?? prev[name];
  }
  const body = `// Generated by scripts/assets.mjs — do not edit. Lists the models in assets/models/.\nexport const MODELS = ${JSON.stringify(models, null, 2)};\n`;
  fs.writeFileSync(INDEX, body);
  return models;
}

const args = process.argv.slice(2);
const built = {};

if (args[0] === 'inspect') {
  for (const f of args.slice(1)) {
    const s = stats(await io.read(f));
    console.log(`${path.basename(f)}  ${kb(fs.statSync(f).size)}  ${s.tris} tris  size ${s.size.join(' × ')}  ${s.skinned ? `${s.joints.length} bones` : 'no skeleton'}`);
    console.log(`  textures: ${s.textures.join(', ') || '-'}`);
    console.log(`  clips: ${s.clips.join(', ') || '-'}`);
    if (s.joints.length) console.log(`  bones: ${s.joints.join(', ')}`);
  }
} else {
  fs.mkdirSync(SOURCE, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const all = args.includes('--all');
  const masters = fs
    .readdirSync(SOURCE, { recursive: true })
    .filter((f) => f.endsWith('.glb'))
    .map((f) => path.join(SOURCE, f));
  const groups = new Map();
  for (const f of masters) {
    const base = path.basename(f, '.glb');
    if (base.includes('@')) continue;
    if (groups.has(base)) console.warn(`  ! two masters named ${base}.glb; using ${path.relative(ROOT, f)}`);
    groups.set(base, { main: f, clips: [] });
  }
  for (const f of masters.filter((f) => path.basename(f).includes('@'))) {
    const base = path.basename(f);
    const g = groups.get(base.slice(0, base.indexOf('@')));
    if (g) g.clips.push(f);
    else console.warn(`  ! ${base}: no ${base.slice(0, base.indexOf('@'))}.glb to attach this animation to`);
  }
  console.log(groups.size ? `Building ${groups.size} model(s) from assets/source/` : 'Nothing in assets/source/ yet.');
  for (const [name, files] of groups) {
    const out = path.join(OUT, `${name}.glb`);
    const newest = Math.max(...[files.main, ...files.clips].map((f) => fs.statSync(f).mtimeMs));
    if (!all && fs.existsSync(out) && fs.statSync(out).mtimeMs > newest) continue;
    try {
      built[name] = await build(name, files);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message.split('\n')[0]}`);
      if (err.code === 'ENOENT') console.error('    (a .glb that points at separate texture files: put those files next to it, or re-export with textures embedded)');
    }
  }
  const models = writeIndex();
  const total = Object.values(models).reduce((a, m) => a + (m?.bytes ?? 0), 0);
  console.log(`assets/models: ${Object.keys(models).length} model(s), ${kb(total)} in total`);
}
