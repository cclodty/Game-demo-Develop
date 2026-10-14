// Night mode (v8, viewer only). Patched into the materials at compile time and switched by one uniform, so the GLB
// is unchanged and a game engine lights its own night. Levels follow photo #S3 (the Sé at night): warm floodlit
// facades, double-globe lamps, shopfronts and some upper windows lit, a navy sky with an orange city glow.
//   - lamps: every lantern glass in the scene is a light; their light on the ground is summed once into a
//     top-down map (0.5 m texels) that every surface reads, fading up the walls above the lanterns;
//   - floodlight: a warm light on the walls and mouldings of the buildings with a facade spec, from above the
//     arcades and shopfronts up (they are lit by the lamps and the shops);
//   - windows: a share of the upper windows glow, chosen per window (panes) or per grid cell (generic facades);
//   - shopfronts, shop signs, traffic lights and clock faces light themselves.
import * as THREE from 'three';

export const NIGHT = {
  lamp: { color: 0xffc98a, glass: 7, k: 0.5, reach: 25, texel: 0.5 },   // ground under a 4 m lamp: k x albedo
  flood: { color: 0xffc48a, k: 0.36, fade: 22 },                       // uplight, k at the foot of the wall
  windows: { warm: 0xffcf96, cool: 0xdfe8ff, share: 0.3, k: 1.0 },
  self: { Shopfront: 0.55, Shop_sign: 0.6, Clock_face: 0.5, Signal_lights: 1.5 },
  dark: ['se', 'sao_domingos'],                                        // churches keep their windows dark (#S3)
};

export const nightUniforms = {
  ntNight: { value: 0 },
  ntScale: { value: new THREE.Vector3(1, 1, 1) },
  ntLampMap: { value: null },
  ntMapMin: { value: new THREE.Vector2() },
  ntMapSize: { value: new THREE.Vector2(1, 1) },
  ntLampColor: { value: new THREE.Color(NIGHT.lamp.color) },
  ntLampK: { value: NIGHT.lamp.k },
  ntFloodColor: { value: new THREE.Color(NIGHT.flood.color) },
  ntFloodK: { value: NIGHT.flood.k },
  ntFloodFade: { value: NIGHT.flood.fade },
  ntWarm: { value: new THREE.Color(NIGHT.windows.warm) },
  ntCool: { value: new THREE.Color(NIGHT.windows.cool) },
  ntShare: { value: NIGHT.windows.share },
  ntWinK: { value: NIGHT.windows.k },
};

const hash3 = (a, b, c) => {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

// Lantern centres: the vertices drawn with the lamp glass, gathered into clusters 0.6 m across (world-root space).
function findLamps(world) {
  const lamps = [], v = new THREE.Vector3(), inv = new THREE.Matrix4().copy(world.matrixWorld).invert();
  world.traverse((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material), pos = o.geometry.attributes.position;
    const idx = o.geometry.index, groups = o.geometry.groups.length ? o.geometry.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (const g of groups) {
      if (!mats[g.materialIndex] || mats[g.materialIndex].name !== 'Lamp_glass') continue;
      for (let k = g.start; k < g.start + g.count; k++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(m);
        let c = lamps.find((q) => q.p.distanceToSquared(v) < 0.36);
        if (!c) lamps.push((c = { p: v.clone(), sum: new THREE.Vector3(), n: 0 }));
        c.sum.add(v);
        c.n++;
      }
    }
  });
  return lamps.map((c) => c.sum.divideScalar(c.n));
}

// Light of all lamps on the ground, for a lamp h above it: h / (r² + h²)^1.5, scaled so a 4 m lamp gives 1 below it.
function lampMap(lamps) {
  const { reach, texel } = NIGHT.lamp;
  const xs = lamps.map((p) => p.x), ys = lamps.map((p) => -p.z);
  const x0 = Math.min(...xs) - reach, y0 = Math.min(...ys) - reach;
  const w = Math.ceil((Math.max(...xs) + reach - x0) / texel), h = Math.ceil((Math.max(...ys) + reach - y0) / texel);
  const acc = new Float32Array(w * h), R = Math.ceil(reach / texel);
  for (const p of lamps) {
    const lh = Math.max(p.y, 1.5), cx = Math.round((p.x - x0) / texel), cy = Math.round((-p.z - y0) / texel);
    for (let j = Math.max(0, cy - R); j < Math.min(h, cy + R); j++) {
      for (let i = Math.max(0, cx - R); i < Math.min(w, cx + R); i++) {
        const dx = x0 + (i + 0.5) * texel - p.x, dy = y0 + (j + 0.5) * texel + p.z;
        acc[j * w + i] += (16 * lh) / (dx * dx + dy * dy + lh * lh) ** 1.5;
      }
    }
  }
  const data = new Uint16Array(w * h);
  for (let k = 0; k < acc.length; k++) data[k] = THREE.DataUtils.toHalfFloat(Math.min(acc[k], 60000));
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  nightUniforms.ntLampMap.value = tex;
  nightUniforms.ntMapMin.value.set(x0, y0);
  nightUniforms.ntMapSize.value.set(w * texel, h * texel);
}

// Window panes: u runs 0..2 across an opening and v is metres up from its sill, so each triangle's position at
// uv (0, 0) is the opening's corner, the same for every part of one window. It is hashed into an attribute;
// 0 (or a missing attribute) means never lit, 1 + hash otherwise. Ground-floor doors and shop windows stay dark.
export function tagWindows(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index;
  if (!uv) return;
  const lit = new Float32Array(pos.count);
  const P = [0, 1, 2].map(() => new THREE.Vector3()), T = [0, 1, 2].map(() => new THREE.Vector2());
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), O = new THREE.Vector3();
  const n = idx ? idx.count : pos.count;
  for (let k = 0; k < n; k += 3) {
    const ids = [0, 1, 2].map((j) => (idx ? idx.getX(k + j) : k + j));
    ids.forEach((v, j) => { P[j].fromBufferAttribute(pos, v); T[j].fromBufferAttribute(uv, v); });
    const du1 = T[1].x - T[0].x, dv1 = T[1].y - T[0].y, du2 = T[2].x - T[0].x, dv2 = T[2].y - T[0].y;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-9) continue;
    e1.subVectors(P[1], P[0]);
    e2.subVectors(P[2], P[0]);
    A.copy(e1).multiplyScalar(dv2).addScaledVector(e2, -dv1).divideScalar(det);
    B.copy(e2).multiplyScalar(du1).addScaledVector(e1, -du2).divideScalar(det);
    O.copy(P[0]).addScaledVector(A, -T[0].x).addScaledVector(B, -T[0].y);
    if (O.y < 2.5) continue;
    const h = 1 + hash3(Math.round(O.x * 4), Math.round(O.y * 4), Math.round(O.z * 4));
    for (const v of ids) lit[v] = h;
  }
  g.setAttribute('ntLit', new THREE.BufferAttribute(lit, 1));
}

const FRAG_HEAD = /* glsl */ `
  varying vec3 ntPos;
  varying vec3 ntNrm;
  uniform float ntNight, ntLampK, ntFloodK, ntFloodFade, ntShare, ntWinK, ntSelf;
  uniform vec3 ntScale, ntLampColor, ntFloodColor, ntWarm, ntCool;
  uniform vec2 ntMapMin, ntMapSize;
  uniform sampler2D ntLampMap;
  #ifdef NT_PANE
    varying float ntVLit;
  #endif
  float ntHash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
`;

const FRAG_BODY = /* glsl */ `
  if (ntNight > 0.0) {
    vec3 nrm = normalize(ntNrm);
    vec3 loc = ntPos / ntScale;
    vec2 muv = (vec2(loc.x, -loc.z) - ntMapMin) / ntMapSize;
    float lamp = texture2D(ntLampMap, clamp(muv, 0.0, 1.0)).r;
    float up = nrm.y;
    float facing = up > 0.0 ? mix(0.75, 1.0, up) : mix(0.75, 0.35, -up);
    float above = max(loc.y - 4.0, 0.0) / 4.0;
    vec3 light = ntLampColor * (ntLampK * lamp * facing / (1.0 + above * above));
    #ifdef NT_FLOOD
      float wallness = 1.0 - smoothstep(0.5, 0.9, abs(up));
      // aimed at the facades above the arcades and shopfronts, which the lamps and the shops light themselves
      light += ntFloodColor * ntFloodK * smoothstep(2.5, 6.0, loc.y) * (1.0 - 0.4 * smoothstep(6.0, ntFloodFade, loc.y)) * wallness;
    #endif
    #ifdef NT_SELF
      light += vec3(ntSelf);
    #endif
    vec3 glow = vec3(0.0);
    #if defined(NT_PANE) && defined(USE_MAP)
      // the maps are dark in the panes and the gaps between slats, light on bars and slats
      if (ntVLit > 1.0 && ntVLit - 1.0 < ntShare) {
        float r = fract(ntVLit * 7.31);
        float gap = 1.0 - dot(texture2D(map, vMapUv).rgb, vec3(0.3333));
        glow = mix(ntWarm, ntCool, step(0.8, fract(ntVLit * 13.7))) * ntWinK * (0.55 + 0.9 * r) * gap;
      }
    #endif
    #if defined(NT_GRID) && defined(USE_MAP)
      // generic grid: one window per tile; a wall is told apart by its plane, constant over the whole wall
      vec2 cell = floor(vMapUv), f = vMapUv - cell;
      float glass = step(0.235, f.x) * step(f.x, 0.765) * step(0.3, f.y) * step(f.y, 0.76) * step(0.012, abs(f.x - 0.5));
      vec3 wallId = vec3(floor(dot(loc, nrm) * 0.5), floor(nrm.x * 4.0 + 0.5) * 7.0 + floor(nrm.z * 4.0 + 0.5), 0.0);
      float hv = ntHash(vec3(cell, 0.0) + wallId * 17.0 + vec3(0.0, 0.0, wallId.y));
      if (loc.y > 3.0 && hv < ntShare) glow = mix(ntWarm, ntCool, step(0.75, fract(hv * 23.1))) * ntWinK * (0.5 + hv / ntShare) * glass;
    #endif
    totalEmissiveRadiance += ntNight * (diffuseColor.rgb * light + glow);
  }
`;

function kindOf(name) {
  if (name.startsWith('Wall_') || name === 'Trim' || name.startsWith('Trim_') || name.startsWith('Stone_')) return 'FLOOD';
  if (name.startsWith('Window_') && name !== 'Window_lattice') return 'PANE';
  if (name === 'Facade_generic') return 'GRID';
  if (name in NIGHT.self) return 'SELF';
  return '';
}

// Chains onto any patch already on the material (the plaster of materials.js).
function patch(m) {
  const kind = kindOf(m.name || ''), prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, nightUniforms, { ntSelf: { value: NIGHT.self[m.name] || 0 } });
    const defs = kind ? { [`NT_${kind}`]: '' } : {};
    if (kind === 'PANE') defs.NT_FLOOD = '';   // recessed in the floodlit walls
    shader.defines = { ...shader.defines, ...defs };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 ntPos;
        varying vec3 ntNrm;
        #ifdef NT_PANE
          attribute float ntLit;
          varying float ntVLit;
        #endif`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        ntPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        ntNrm = normalize(mat3(modelMatrix) * objectNormal);
        #ifdef NT_PANE
          ntVLit = ntLit;
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAG_BODY}`);
  };
  m.customProgramCacheKey = () => `${prevKey ? prevKey.call(m) : ''}|night:${kind}`;
  m.needsUpdate = true;
}

// Sets the scene up for night mode; returns set(on). Call after plasterize().
export function createNight(world) {
  world.updateMatrixWorld(true);
  const lamps = findLamps(world);
  if (lamps.length) lampMap(lamps);
  else nightUniforms.ntLampMap.value = new THREE.DataTexture(new Uint16Array(1), 1, 1, THREE.RedFormat, THREE.HalfFloatType);
  const glass = [], done = new Set();
  world.traverse((o) => {
    if (!o.isMesh) return;
    if (/_windows$/.test(o.name) && !NIGHT.dark.some((k) => o.name.endsWith(`_${k}_windows`))) tagWindows(o);
    for (const m of [].concat(o.material)) {
      if (!m || done.has(m) || !m.isMeshStandardMaterial) continue;
      done.add(m);
      if (m.name === 'Lamp_glass') glass.push({ m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
      patch(m);
    }
  });
  return {
    lamps,
    set(on) {
      nightUniforms.ntNight.value = on ? 1 : 0;
      for (const g of glass) {
        g.m.emissive.set(on ? NIGHT.lamp.color : g.emissive);
        g.m.emissiveIntensity = on ? NIGHT.lamp.glass : g.intensity;
      }
    },
  };
}
