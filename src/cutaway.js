// See-through cutaway: hides whatever stands between the camera and the
// player. Fragments inside a cylinder around the camera -> player line are
// discarded, with a dithered edge. The floor (below 0.45 m) and everything
// behind the player stay; shadows still use the full geometry.

export function addCutaway(mat, U) {
  if (mat.userData.cutaway) return;
  mat.userData.cutaway = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCutA = U.uCutA;
    shader.uniforms.uCutB = U.uCutB;
    shader.uniforms.uCutR = U.uCutR;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;\nuniform vec3 uCutA;\nuniform vec3 uCutB;\nuniform float uCutR;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        if (uCutR > 0.0 && vCutWorld.y > 0.45) {
          vec3 ab = uCutB - uCutA;
          float t = clamp(dot(vCutWorld - uCutA, ab) / dot(ab, ab), 0.0, 1.0);
          float edge = uCutR - length(vCutWorld - (uCutA + ab * t));
          if (t < 0.97 && edge > 0.0) {
            float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            if (edge > 0.7 || n < edge / 0.7) discard;
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'cutaway';
  mat.needsUpdate = true;
}
