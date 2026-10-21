// See-through cutaway: hides whatever stands between the camera and the
// player. Fragments inside a cylinder around the camera -> player line are
// discarded, with a dithered edge. The floor (below 0.45 m) and everything
// behind the player stay; shadows still use the full geometry.
// A map can also fade what stands outside its play area on the camera's side
// (maps.js `fade`): above a height, only one pixel in four of it is drawn, so
// a street's far side shows through the buildings in front of it.
// And with `fade.follow` a building is seen through whole above that height
// while it stands between the camera and the player: each building's vertices
// carry its number (aFade, 0 for anything else) and uFadeSet says which
// numbers fade this frame (level.js updateFade).

/** How many buildings a map can number for the follow fade (slot 0 is "not a building"). */
export const FADE_SLOTS = 128;

export function addCutaway(mat, U) {
  if (mat.userData.cutaway) return;
  mat.userData.cutaway = true;
  // geometry without building numbers reads 0, whatever another program left at that attribute slot
  mat.defaultAttributeValues = { ...mat.defaultAttributeValues, aFade: [0] };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCutA = U.uCutA;
    shader.uniforms.uCutB = U.uCutB;
    shader.uniforms.uCutR = U.uCutR;
    shader.uniforms.uCutSoft = U.uCutSoft;
    for (const k of ['uFadeOn', 'uFadeY', 'uFadeBox', 'uFadeDir', 'uFadeSet']) shader.uniforms[k] = U[k];
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCutWorld;\nattribute float aFade;\nuniform vec4 uFadeSet[${FADE_SLOTS / 4}];\nvarying float vFadeAll;`)
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvCutWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nint fadeI = int(aFade + 0.5);\nvFadeAll = fadeI > 0 ? uFadeSet[fadeI / 4][fadeI - (fadeI / 4) * 4] : 0.0;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutWorld;\nvarying float vFadeAll;\nuniform vec3 uCutA;\nuniform vec3 uCutB;\nuniform float uCutR;\nuniform float uCutSoft;\nuniform float uFadeOn;\nuniform float uFadeY;\nuniform vec2 uFadeBox;\nuniform vec2 uFadeDir;')
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // a building seen through whole is not holed as well (the hole's rim would show in it)
        if (uCutR > 0.0 && vCutWorld.y > 0.45 && (vFadeAll < 0.5 || vCutWorld.y <= uFadeY)) {
          vec3 ab = uCutB - uCutA;
          float t = clamp(dot(vCutWorld - uCutA, ab) / dot(ab, ab), 0.0, 1.0);
          float edge = uCutR - length(vCutWorld - (uCutA + ab * t));
          if (t < 0.97 && edge > 0.0) {
            float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            if (uCutSoft < 0.5 || edge > 0.7 || n < edge / 0.7) discard;
          }
        }
        if (uFadeOn > 0.0 && vCutWorld.y > uFadeY) {
          vec2 w = vCutWorld.xz;
          bool front = vFadeAll > 0.5 || (w.y > uFadeBox.y && uFadeDir.y > 0.3) || (w.y < -uFadeBox.y && uFadeDir.y < -0.3) || (w.x > uFadeBox.x && uFadeDir.x > 0.3) || (w.x < -uFadeBox.x && uFadeDir.x < -0.3);
          if (front && (mod(floor(gl_FragCoord.x), 2.0) > 0.5 || mod(floor(gl_FragCoord.y), 2.0) > 0.5)) discard;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'cutaway';
  mat.needsUpdate = true;
}
