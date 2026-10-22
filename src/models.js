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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  // only what the game places today; scenery and landmarks wait for their code
  const wanted = Object.keys(ASSETS)
    .filter((id) => ['character', 'prop', 'weapon'].includes(ASSETS[id].kind))
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
  const box = new THREE.Box3().setFromObject(scene);
  if (spec.kind !== 'weapon') return { id, name, kind: 'prop', scene: mergeByMaterial(scene), box };

  // origin = the main grip, barrel along +z; empty socket_* nodes mark the muzzle,
  // the support hand and so on (the manifest's numbers stand in for missing ones)
  const sockets = {};
  scene.traverse((o) => {
    if (o.name.startsWith('socket_')) sockets[o.name.slice(7)] = o.getWorldPosition(new THREE.Vector3());
  });
  for (const [k, v] of Object.entries(spec.sockets || {})) sockets[k] ??= new THREE.Vector3(...v);
  return { id, name, kind: 'weapon', scene, box, sockets };
}

/**
 * A prop's meshes merged into one a material, in the model's own space. A made crate or container comes as
 * dozens of meshes as exported, every one a draw call with its shadow and its outline (合併繪製次數 ①); merged it
 * is as many as it has materials, and looks the same. The attributes are copied out as plain floats first (the
 * optimised files keep them quantised and interleaved). A model with anything that cannot be merged (a skinned or
 * morphing mesh, several materials on one mesh) stays as it is.
 */
function mergeByMaterial(scene) {
  const meshes = [];
  let plain = true;
  scene.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push(o);
    if (o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material) || Object.keys(o.geometry.morphAttributes).length) plain = false;
  });
  if (!plain || meshes.length <= 1) return scene;
  const toRoot = new THREE.Matrix4().copy(scene.matrixWorld).invert();
  const groups = new Map(); // material and attribute names -> geometries in the model's space
  for (const o of meshes) {
    const src = o.geometry;
    const names = Object.keys(src.attributes).sort();
    const geo = new THREE.BufferGeometry();
    for (const n of names) {
      const a = src.attributes[n];
      const out = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
      geo.setAttribute(n, new THREE.BufferAttribute(out, a.itemSize));
    }
    // every geometry indexed, so any two can be merged
    const count = src.attributes.position.count;
    geo.setIndex(src.index ? Array.from(src.index.array) : Array.from({ length: count }, (_, i) => i));
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, o.matrixWorld));
    const key = `${o.material.uuid}|${names.join(',')}`;
    if (!groups.has(key)) groups.set(key, { material: o.material, geos: [] });
    groups.get(key).geos.push(geo);
  }
  const out = new THREE.Group();
  for (const { material, geos } of groups.values()) {
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    if (!geo) return scene; // could not be merged after all: as it came
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  out.updateMatrixWorld(true);
  return out;
}

/** The loaded character template for an id, or null. */
export function characterTemplate(id) {
  const m = loaded.get(id);
  return m && m.kind === 'character' ? m : null;
}

/** The loaded weapon template for an id ({ scene, box, sockets }), or null. Clone `scene` to use it. */
export function weaponTemplate(id) {
  const m = loaded.get(id);
  return m && m.kind === 'weapon' ? m : null;
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
