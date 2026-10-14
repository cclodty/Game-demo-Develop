// Viewer lighting (v7): sky dome, image-based ambient light from that sky, a sun whose shadow map follows the
// view, screen-space ambient occlusion and Khronos PBR Neutral tone mapping. All of it lives in the viewer;
// the GLB carries geometry and materials only, and a game engine lights them its own way.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export const LIGHT = {
  // morning sun from the south-east, as in photo #87 where it lights the west row
  sunAz: 125, sunEl: 50,
  sunColor: 0xfff0da, sunIntensity: 3.2,
  // visible sky (sRGB)
  sky: { zenith: 0x5a8acb, horizon: 0xd3dfe8, ground: 0xb3a995 },
  // Ambient light comes from a white-balanced copy of the sky, as a camera would see it: the saturated blue
  // turned shade a deep blue. Levels from photos #87 and #40: sunlit calçada is about 3.2x as bright as shaded
  // calçada (linear), and the shade is close to neutral. `ground` is the bounce off the sunlit square.
  ambient: { zenith: 0x8b92a1, horizon: 0xaaadb0, ground: 0xa19689 },
  // shadow map: one 4096² map fitted each frame around what the camera sees (eye level: the first 150 m)
  shadow: { size: 4096, far: 150, bias: -0.0001, normalBias: 0.025 },
  ao: { radius: 2.0, intensity: 0.9 },
};

// Khronos PBR Neutral (three r162+ ships it as NeutralToneMapping; r160 takes it as the custom curve). Colours
// below 0.76 pass through almost unchanged, so the photo-sampled pastels keep their values, while sunlit white
// walls roll off instead of clipping. AgX and ACES both washed the pastels out (see v5 notes).
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}`);

export function sunDirection() {
  const az = THREE.MathUtils.degToRad(LIGHT.sunAz), el = THREE.MathUtils.degToRad(LIGHT.sunEl);
  // three axes: x east, y up, z = -north
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

// Gradient sky with a soft glow around the sun and a thin layer of fair-weather cloud. The dome is centred on
// the viewer, so the vertex position is the view direction.
function skyMaterial(sunDir, colours, clouds) {
  return new THREE.ShaderMaterial({
    name: 'Sky',
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(colours.zenith) },
      horizon: { value: new THREE.Color(colours.horizon) },
      ground: { value: new THREE.Color(colours.ground) },
      sunColor: { value: new THREE.Color(LIGHT.sunColor) },
      sunDir: { value: sunDir },
      clouds: { value: clouds },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, ground, sunColor, sunDir;
      uniform float clouds;
      varying vec3 vDir;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.07 + 13.1; a *= 0.5; }
        return s;
      }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sky = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
        float mu = max(dot(d, sunDir), 0.0);
        sky += sunColor * (0.08 * pow(mu, 6.0) + 0.2 * pow(mu, 64.0));
        if (clouds > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.4;
          float n = fbm(uv + vec2(4.7, 1.3));
          float c = smoothstep(0.55, 0.8, n) * smoothstep(0.02, 0.3, h);
          vec3 cloud = mix(vec3(0.58, 0.62, 0.68), vec3(0.95), smoothstep(0.55, 0.85, n + 0.2 * mu));
          sky = mix(sky, cloud, c * 0.8 * clouds);
        }
        gl_FragColor = vec4(mix(sky, ground, smoothstep(0.0, -0.08, h)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Final pass: three applies the renderer's tone mapping and the sRGB transfer to a ShaderMaterial drawn to screen.
const OutputShader = {
  name: 'NeutralOutput',
  uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      gl_FragColor = texture2D(tDiffuse, vUv);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createLighting(renderer, scene, camera) {
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const sunDir = sunDirection();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), skyMaterial(sunDir, LIGHT.sky, 1));
  sky.name = 'Sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.userData.noAO = true;
  scene.add(sky);
  scene.background = null;
  scene.fog = new THREE.Fog(new THREE.Color(LIGHT.sky.horizon), 420, 1600);

  // image-based ambient light from the white-balanced sky, prefiltered once (the sun does not move)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), skyMaterial(sunDir, LIGHT.ambient, 0)));
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  pmrem.dispose();

  const sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);
  sun.name = 'Sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(LIGHT.shadow.size, LIGHT.shadow.size);
  sun.shadow.bias = LIGHT.shadow.bias;
  sun.shadow.normalBias = LIGHT.shadow.normalBias;
  scene.add(sun, sun.target);

  // The shadow camera covers a sphere around the visible part of the scene. The sphere's radius does not change
  // when the camera turns, and its centre is snapped to whole shadow texels, so shadows do not shimmer.
  const lightRot = new THREE.Matrix4().lookAt(sunDir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
  const lightRotInv = lightRot.clone().transpose();
  const centre = new THREE.Vector3(), fwd = new THREE.Vector3();
  function fitShadow(target) {
    let R;
    if (camera.position.y < 20 || !target) {
      const f = LIGHT.shadow.far;
      const k2 = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) ** 2 * (1 + camera.aspect ** 2);
      const zc = Math.min(f, (1 + k2) * f / 2);
      R = Math.sqrt((f - zc) ** 2 + k2 * f * f);
      camera.getWorldDirection(fwd);
      centre.copy(camera.position).addScaledVector(fwd, zc);
    } else {
      R = THREE.MathUtils.clamp(camera.position.distanceTo(target) * 1.1, 120, 330);
      centre.copy(target);
    }
    R = Math.ceil(R / 8) * 8;
    const texel = (2 * R) / LIGHT.shadow.size;
    centre.applyMatrix4(lightRotInv);
    centre.x = Math.round(centre.x / texel) * texel;
    centre.y = Math.round(centre.y / texel) * texel;
    centre.applyMatrix4(lightRot);
    const reach = R + 250;   // casters up to 250 m outside the sphere, towards the sun, still cast into it
    sun.target.position.copy(centre);
    sun.position.copy(centre).addScaledVector(sunDir, reach);
    const c = sun.shadow.camera;
    if (c.right !== R || c.far !== reach + R) {
      c.left = c.bottom = -R; c.right = c.top = R;
      c.near = 1; c.far = reach + R;
      c.updateProjectionMatrix();
    }
  }

  // high quality: multisampled HDR target, GTAO, then the tone-mapping pass; low quality renders straight to screen
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = LIGHT.ao.intensity;
  gtao.updateGtaoMaterial({ radius: LIGHT.ao.radius, distanceExponent: 1, thickness: 2, scale: 1, samples: 16, distanceFallOff: 1 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  // alpha-masked railings would occlude like solid panels, and the sky dome is no occluder at all
  const override = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = function () {
    override();
    scene.traverse((o) => { if (o.userData.noAO) o.visible = false; });
  };
  composer.addPass(gtao);
  composer.addPass(new ShaderPass(OutputShader));

  let hq = true;
  return {
    sun,
    sky,
    composer,
    gtao,
    get hq() { return hq; },
    setQuality(on) { hq = on; },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
    render(orbitTarget) {
      sky.position.copy(camera.position);
      fitShadow(orbitTarget);
      if (hq) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
