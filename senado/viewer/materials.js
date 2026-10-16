// Viewer wall materials (v7): lime plaster instead of flat paint. Patched into the standard materials of the walls,
// arcades and mouldings at compile time, in world space, so it needs no UVs and adds nothing to the GLB:
//   - tone: broad patches a few percent lighter or darker (repainting, weathering), plus faint vertical streaks
//     washed down from the sills and cornices;
//   - grime: a darker band along the foot of the walls, where the calçada splashes and hands rub;
//   - grain: a fine bump on the normal, so grazing sun picks out the trowelled surface.
// v9: the window cells of the generic grid (the blocks outside the streetscape) become glossy dark glass, so the
// outer blocks reflect the sky like the detailed ones instead of showing painted windows.
import * as THREE from 'three';

export const PLASTER = {
  tone: 0.08,          // tone patches a few metres across, ± share of the colour at the extremes
  streaks: 0.14,       // darkest vertical weathering streaks, share of the colour
  grime: 0.24,         // darkening at the foot of the walls
  grimeHeight: 1.5,    // m
  bump: 0.7,           // grain strength on the normal (1 = about two centimetres of relief)
  trim: 0.5,           // mouldings get this share of the above
  glass: { color: [0.035, 0.05, 0.075], roughness: 0.12, metalness: 0.35 },   // v9 grid window cells (linear)
};

const NOISE = /* glsl */ `
  float plHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float plNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(plHash(i), plHash(i + vec3(1, 0, 0)), f.x), mix(plHash(i + vec3(0, 1, 0)), plHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(plHash(i + vec3(0, 0, 1)), plHash(i + vec3(1, 0, 1)), f.x), mix(plHash(i + vec3(0, 1, 1)), plHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float plFbm(vec3 x) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * plNoise(x); x = x * 2.03 + 7.1; a *= 0.5; } return s; }
  // grain height, metres-ish units; two octaves of fine noise
  float plGrain(vec3 p) { return plNoise(p * 9.0) * 0.6 + plNoise(p * 23.0) * 0.4; }
`;

// shared by every patched material, so the effect can be tuned (or switched off) live
export const plasterUniforms = {
  plTone: { value: PLASTER.tone },
  plStreaks: { value: PLASTER.streaks },
  plGrime: { value: PLASTER.grime },
  plGrimeH: { value: PLASTER.grimeHeight },
  plBump: { value: PLASTER.bump },
};

// The grid texture's window cells are its darkest texels (green channel below about 0.1).
const GLASS_CELLS = /* glsl */ `
  float plGlass = 1.0 - smoothstep(0.08, 0.2, sampledDiffuseColor.g);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${PLASTER.glass.color.map((v) => v.toFixed(3)).join(', ')}), plGlass);`;

function patch(material, strength, glass = false) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, plasterUniforms, { plStrength: { value: strength } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 plPos;\nvarying vec3 plNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        plPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        plNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 plPos;
        varying vec3 plNrm;
        uniform float plTone, plStreaks, plGrime, plGrimeH, plBump, plStrength;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float wall = 1.0 - smoothstep(0.6, 0.9, abs(plNrm.y));          // roofs and sills keep their colour
          // the fbm sits around 0.47 with a spread of about 0.11: rescale it to roughly -1..1
          float tone = clamp((plFbm(plPos * vec3(0.3, 0.45, 0.3)) - 0.47) / 0.18, -1.0, 1.0) * plTone;
          // streaks only darken, and only the upper fifth of the noise: sparse runs washed down the wall
          float streak = -smoothstep(0.55, 0.75, plFbm(plPos * vec3(2.2, 0.15, 2.2))) * plStreaks * smoothstep(2.0, 6.0, plPos.y);
          float grime = (1.0 - smoothstep(0.0, plGrimeH, plPos.y)) * plGrime * (0.7 + 0.6 * plNoise(plPos * 1.7));
          diffuseColor.rgb *= 1.0 + wall * plStrength * (tone + streak - grime);
        }
        ${glass ? GLASS_CELLS : ''}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // bump from the world-space grain: screen-space derivatives give its gradient across the surface
          float h = plGrain(plPos);
          vec3 dpx = dFdx(vViewPosition), dpy = dFdy(vViewPosition);
          float dhx = dFdx(h), dhy = dFdy(h);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          // fade the grain out with distance, where it would only shimmer
          float fade = 1.0 - smoothstep(25.0, 70.0, length(vViewPosition));
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - plStrength * plBump * 0.02 * fade * grad);
        }`);
  };
  if (glass) {
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      prev(shader, renderer);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, ${PLASTER.glass.roughness.toFixed(2)}, plGlass);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, ${PLASTER.glass.metalness.toFixed(2)}, plGlass);`);
    };
  }
  material.customProgramCacheKey = () => `plaster:${strength}:${glass}`;
  material.needsUpdate = true;
}

// Walls (photo-sampled or generic), arcades and mouldings of every building in the scene.
export function plasterize(root) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || done.has(m) || !m.isMeshStandardMaterial) continue;
      const n = m.name || '';
      if (n.startsWith('Wall_') || n.startsWith('Facade_')) patch(m, 1, n === 'Facade_generic' && !!m.map);
      else if (n === 'Trim' || n.startsWith('Trim_')) patch(m, PLASTER.trim);
      else continue;
      done.add(m);
    }
  });
  return done.size;
}
