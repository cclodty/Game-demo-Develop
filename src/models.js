// Optional real models. Loads the optimised .glb files listed in
// models-index.js (built by scripts/assets.mjs) and hands out copies fitted to
// the game's boxes. With no models, or with ?models=off in the URL, every
// lookup returns null and callers keep their built-in block models, so the
// game never depends on an asset being there.
//
// URL options:
//   ?models=off               ignore all models
//   ?use=hero-tripo,crate-b   pick these variants (id = the part before "-")

import * as THREE from 'three';
import { ALIASES, ASSETS, MAP_ALIASES } from './asset-manifest.js';
import { MODELS } from './models-index.js';
import { prepareCharacter } from './skin.js';

const loaded = new Map(); // id -> { id, name, kind, scene, box, ... }
const tinted = new Map(); // `${id}|${tint}` -> material replacement map

/** Which built model (if any) stands in for a manifest id. */
function pick(id, use) {
  const names = Object.keys(MODELS).filter((n) => n.split('-')[0] === id);
  if (!names.length) return null;
  return use.find((u) => names.includes(u)) ?? (names.includes(id) ? id : names[0]);
}

export async function loadModels() {
  const params = new URLSearchParams(location.search);
  if (params.get('models') === 'off') return;
  const use = (params.get('use') || '').split(',').filter(Boolean);
  // only what the game places today; weapons, scenery and landmarks wait for their code
  const wanted = Object.keys(ASSETS)
    .filter((id) => ASSETS[id].kind === 'character' || ASSETS[id].kind === 'prop')
    .map((id) => [id, pick(id, use)])
    .filter(([, name]) => name);
  if (!wanted.length) return;
  // the loader and its WebAssembly decoder are only fetched when there is something to load
  const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  // the single-file build inlines models as data URIs
  const inline = globalThis.BULLET_BALLET_MODELS || {};
  await Promise.all(
    wanted.map(async ([id, name]) => {
      const file = MODELS[name].file;
      try {
        const gltf = await loader.loadAsync(inline[file] || `assets/models/${file}`);
        loaded.set(id, prepare(id, name, gltf));
      } catch (err) {
        console.warn(`[models] ${file} could not be loaded; using the block model`, err);
      }
    }),
  );
  if (loaded.size) console.info(`[models] using ${[...loaded.values()].map((m) => m.name).join(', ')}`);
}

function prepare(id, name, gltf) {
  const spec = ASSETS[id];
  const scene = gltf.scene;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  if (spec.kind === 'character') return { id, name, kind: 'character', ...prepareCharacter(scene, gltf.animations, spec) };
  scene.updateMatrixWorld(true);
  return { id, name, kind: 'prop', scene, box: new THREE.Box3().setFromObject(scene) };
}

/** The loaded character template for an id, or null. */
export function characterTemplate(id) {
  const m = loaded.get(id);
  return m && m.kind === 'character' ? m : null;
}

export function loadedCharacters() {
  return [...loaded.values()].filter((m) => m.kind === 'character').map((m) => m.id);
}

function tintMaterials(id, scene, tint) {
  const key = `${id}|${tint}`;
  let map = tinted.get(key);
  if (!map) {
    map = new Map();
    const c = new THREE.Color(tint);
    scene.traverse((o) => {
      if (!o.isMesh || map.has(o.material)) return;
      const m = o.material.clone();
      m.color.multiply(c);
      map.set(o.material, m);
    });
    tinted.set(key, map);
  }
  return map;
}

/**
 * A copy of the model that stands in for a map material / barrel / pan
 * (`kind`), fitted to w × d × h metres (or the manifest size), with its base
 * on y = 0 and the box centre at the origin. `face` (degrees, optional) is
 * where the model's front (+Z) should point: 0 south, 90 east, 180 north,
 * 270 west; without it the model's long side follows the box's long side.
 * Null when there is no model.
 */
export function propModel(kind, mapId, w, d, h, face) {
  const alias = MAP_ALIASES[mapId]?.[kind] ?? kind;
  const [id, tint] = ALIASES[alias] ?? [alias];
  const m = loaded.get(id);
  if (!m || m.kind !== 'prop') return null;
  const spec = ASSETS[id];
  if (w === undefined) [w, d, h] = spec.size;
  if (spec.fit !== 'tile') return fitted(m, spec, tint, w, d, h, face, spec.fit || 'box');

  // long things are one module repeated, so their textures never stretch
  const alongX = w >= d;
  const len = alongX ? w : d;
  const n = Math.max(1, Math.round(len / (spec.module || len)));
  const out = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const seg = fitted(m, spec, tint, alongX ? len / n : w, alongX ? d : len / n, h, face, 'box');
    seg.position[alongX ? 'x' : 'z'] += -len / 2 + (i + 0.5) * (len / n);
    out.add(seg);
  }
  return out;
}

function fitted(m, spec, tint, w, d, h, face, fit) {
  const size = m.box.getSize(new THREE.Vector3());
  const centre = m.box.getCenter(new THREE.Vector3());
  const inner = m.scene.clone(true);
  if (tint !== undefined) {
    const swap = tintMaterials(m.id, m.scene, tint);
    inner.traverse((o) => {
      if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material);
    });
  }
  inner.position.set(-centre.x, -m.box.min.y, -centre.z);

  const pivot = new THREE.Group();
  pivot.add(inner);
  let turn;
  if (face !== undefined) {
    pivot.rotation.y = (face * Math.PI) / 180;
    turn = Math.round(face / 90) % 2 !== 0;
  } else {
    // lay the model's long side along the box's long side
    const longX = (v, u) => v > u * 1.15;
    turn = (longX(size.x, size.z) && longX(d, w)) || (longX(size.z, size.x) && longX(w, d));
    if (turn) pivot.rotation.y = Math.PI / 2;
  }
  const mx = turn ? size.z : size.x;
  const mz = turn ? size.x : size.z;

  const out = new THREE.Group();
  out.add(pivot);
  const sx = w / mx;
  const sz = d / mz;
  if (fit === 'box') out.scale.set(sx, h / size.y, sz);
  else if (fit === 'footprint') out.scale.set(sx, (sx + sz) / 2, sz);
  else out.scale.setScalar(h / size.y);
  if (spec.offset) out.position.set(spec.offset[0], spec.offset[2], spec.offset[1]);
  return out;
}
