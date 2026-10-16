// Viewer lighting (v7): sky dome, image-based ambient light from that sky, a sun whose shadow map follows the
// view, screen-space ambient occlusion and Khronos PBR Neutral tone mapping. v8 adds the night set (sky, ambient,
// moon, bloom; see night.js for the lamps and lit windows). All of it lives in the viewer;
// the GLB carries geometry and materials only, and a game engine lights them its own way. v9 turns the day set
// towards a sunny model photograph: a harder, lower sun, less sky fill in the shade, a light grade and more haze.
// v10 lets the sun move: a time of day from just after sunrise to just before sunset, with the sun's colour, the
// sky, the haze and the ambient light following its height.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const LIGHT = {
  // morning sun from the south-east, as in photo #87 where it lights the west row (v10: the moon's place at
  // night; by day the sun follows the time, see SOLAR)
  sunAz: 125, sunEl: 44,
  sunColor: 0xfff0da, sunIntensity: 4.2,
  // visible sky (sRGB)
  sky: { zenith: 0x5a8acb, horizon: 0xd3dfe8, ground: 0xbcc6cc },   // v9: ground below the horizon in the haze
  // Ambient light comes from a white-balanced copy of the sky, as a camera would see it: the saturated blue
  // turned shade a deep blue. Levels from photos #87 and #40: sunlit calçada is about 3.2x as bright as shaded
  // calçada (linear), and the shade is close to neutral. `ground` is the bounce off the sunlit square. v9 keeps
  // only part of it (`fill` in the day stops below), so the shade reads darker against the stronger sun.
  ambient: { zenith: 0x8b92a1, horizon: 0xaaadb0, ground: 0xa19689 },
  // v9 grade on the linear image before tone mapping: saturation and contrast around mid grey
  grade: { sat: 1.22, con: 1.08 },
  // v9 haze: the far blocks fade into a pale blue-grey, so the detailed core stands out. Metres from the camera,
  // pushed out by the distance to the orbit target (times `follow`), so an aerial view is not washed out.
  haze: { color: 0xcdd8e1, near: 110, far: 850, follow: [1, 1.5] },
  // shadow map: one 4096² map fitted each frame around what the camera sees (eye level: the first 150 m)
  shadow: { size: 4096, far: 150, bias: -0.0001, normalBias: 0.025 },
  ao: { radius: 2.0, intensity: 0.9 },
  // v10: the day set by the sun's elevation (degrees), interpolated between stops. 44° is the v9 look; lower, the
  // sun turns warm and weak, the sky deepens overhead and warms at the horizon, the glow around the sun widens and
  // the haze takes the sun's colour; exposure lifts a little so the shade does not go black.
  day: [
    { el: 0, sun: 0xff9a55, sunI: 1.6, zenith: 0x4a6ca2, horizon: 0xe6cdb4, ground: 0xa49c94, haze: 0xdac3ad, amb: 0xe4e2e6, fill: 0.62, glow: 0.5, exp: 1.38 },
    { el: 6, sun: 0xffb26e, sunI: 2.7, zenith: 0x5279b5, horizon: 0xdfd8cf, ground: 0xb3b2ae, haze: 0xd8d0c6, amb: 0xebeaee, fill: 0.6, glow: 0.32, exp: 1.22 },
    { el: 16, sun: 0xffd6a6, sunI: 3.5, zenith: 0x5584c5, horizon: 0xd8dcdf, ground: 0xbac2c6, haze: 0xd2d6d8, amb: 0xf5f5f7, fill: 0.57, glow: 0.15, exp: 1.07 },
    { el: 44, sun: 0xfff0da, sunI: 4.2, zenith: 0x5a8acb, horizon: 0xd3dfe8, ground: 0xbcc6cc, haze: 0xcdd8e1, amb: 0xffffff, fill: 0.55, glow: 0.08, exp: 1 },
    { el: 90, sun: 0xfff4e6, sunI: 4.3, zenith: 0x5a8acb, horizon: 0xd3dfe8, ground: 0xbcc6cc, haze: 0xcdd8e1, amb: 0xffffff, fill: 0.55, glow: 0.08, exp: 1 },
  ],
  // night (v8, photo #S3): navy sky with an orange-brown city glow low down, clouds lit from below, a small moon
  // where the sun was; ambient a little warm from the lit square; lanterns and lit windows bloom
  night: {
    sky: { zenith: 0x0a1222, horizon: 0x3a3134, ground: 0x121212 },
    ambient: { zenith: 0x1e2536, horizon: 0x2a282b, ground: 0x3a2e24 },
    cloudTint: [0.12, 0.095, 0.08], clouds: 0.6,
    moonColor: 0x9fb2d8, moonIntensity: 0.12,
    ao: 0.6, exposure: 1.1,
    bloom: { strength: 0.6, radius: 0.45, threshold: 1.0 },
  },
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

export function sunDirection(azDeg = LIGHT.sunAz, elDeg = LIGHT.sunEl, out = new THREE.Vector3()) {
  const az = THREE.MathUtils.degToRad(azDeg), el = THREE.MathUtils.degToRad(elDeg);
  // three axes: x east, y up, z = -north
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
}

// v10: where the sun stands over the square at local time h (hours) in mid-October: latitude 22.19° N,
// declination about -9°, solar noon about 12:12 (113.54° E in UTC+8, equation of time +14 min). 9:54 puts it
// at about 44° high in the south-east, the v9 sun. Azimuth in degrees clockwise from north.
export const SOLAR = { lat: 22.19, decl: -9, noon: 12.2, start: 9.9, min: 6.6, max: 17.75 };
export function solarPosition(h) {
  const r = THREE.MathUtils.DEG2RAD, phi = SOLAR.lat * r, dec = SOLAR.decl * r, H = 15 * (h - SOLAR.noon) * r;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) + Math.PI;
  return { az: az / r, el: el / r };
}

// the v10 day set at a sun elevation, between the two stops around it (colours mixed in linear light)
export function daySet(el) {
  const D = LIGHT.day;
  let i = 0;
  while (i < D.length - 2 && el > D[i + 1].el) i++;
  const a = D[i], b = D[i + 1], t = THREE.MathUtils.clamp((el - a.el) / (b.el - a.el), 0, 1);
  const out = {};
  for (const k of Object.keys(a)) {
    if (k === 'el') continue;
    out[k] = ['sun', 'zenith', 'horizon', 'ground', 'haze', 'amb'].includes(k)
      ? new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t)
      : a[k] + (b[k] - a[k]) * t;
  }
  return out;
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
      glow: { value: 0.08 },
      cloudTint: { value: new THREE.Color(1, 1, 1) },
      moon: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, ground, sunColor, sunDir, cloudTint;
      uniform float clouds, moon, glow;
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
        sky += sunColor * (glow * pow(mu, 6.0) + 0.2 * pow(mu, 64.0));
        sky += moon * sunColor * smoothstep(0.99992, 0.99996, mu);
        if (clouds > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.4;
          float n = fbm(uv + vec2(4.7, 1.3));
          float c = smoothstep(0.55, 0.8, n) * smoothstep(0.02, 0.3, h);
          vec3 cloud = mix(vec3(0.58, 0.62, 0.68), vec3(0.95), smoothstep(0.55, 0.85, n + 0.2 * mu)) * cloudTint;
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

// v9 grade: saturation about the luminance, contrast as a power curve through mid grey (linear values).
const GradeShader = {
  name: 'Grade',
  uniforms: { tDiffuse: { value: null }, sat: { value: LIGHT.grade.sat }, con: { value: LIGHT.grade.con } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, con; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, sat), 0.0);
      c.rgb = 0.18 * pow(c.rgb / 0.18, vec3(con));
      gl_FragColor = c;
    }`,
};

export function createLighting(renderer, scene, camera) {
  renderer.toneMapping = THREE.CustomToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const sunDir = sunDirection();   // moved in place by setTime(); the sky and the fill share it
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 48, 24), skyMaterial(sunDir, LIGHT.sky, 1));
  sky.name = 'Sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.userData.noAO = true;
  scene.add(sky);
  scene.background = null;
  scene.fog = new THREE.Fog(new THREE.Color(LIGHT.haze.color), LIGHT.haze.near, LIGHT.haze.far);

  // image-based ambient light from the white-balanced sky, prefiltered again when the sun moves (v10)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const fill = skyMaterial(sunDir, LIGHT.ambient, 0);
  const envMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), fill);
  envScene.add(envMesh);
  const prefilter = () => pmrem.fromScene(envScene, 0, 0.1, 100).texture;
  envMesh.material = skyMaterial(sunDirection(), LIGHT.night.ambient, 0);
  const nightEnv = prefilter();
  envMesh.material = fill;
  let dayEnv = null;

  const sun = new THREE.DirectionalLight(LIGHT.sunColor, LIGHT.sunIntensity);   // colour and strength: setTime()
  sun.name = 'Sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(LIGHT.shadow.size, LIGHT.shadow.size);
  sun.shadow.bias = LIGHT.shadow.bias;
  sun.shadow.normalBias = LIGHT.shadow.normalBias;
  scene.add(sun, sun.target);

  // The shadow camera covers a sphere around the visible part of the scene. The sphere's radius does not change
  // when the camera turns, and its centre is snapped to whole shadow texels, so shadows do not shimmer.
  const lightRot = new THREE.Matrix4(), lightRotInv = new THREE.Matrix4();
  const aimShadow = () => {
    lightRot.lookAt(sunDir, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    lightRotInv.copy(lightRot).transpose();
  };
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
  const N = LIGHT.night;
  const bloom = new UnrealBloomPass(size, N.bloom.strength, N.bloom.radius, N.bloom.threshold);
  bloom.enabled = false;
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const output = new ShaderPass(OutputShader);
  composer.addPass(output);

  // v10 time of day: sun, sky, haze and exposure at once; the ambient light is prefiltered again at most every
  // 150 ms while the slider moves, and once more when it stops
  let time = SOLAR.start, isNight = false, envDue = 0, envTimer = null, envAt = -1;
  const setExposure = (e) => { renderer.toneMappingExposure = output.uniforms.toneMappingExposure.value = e; };
  function refreshEnv() {
    clearTimeout(envTimer);
    envTimer = null;
    const old = dayEnv;
    dayEnv = prefilter();
    envAt = time;
    if (!isNight) scene.environment = dayEnv;
    if (old) old.dispose();
    envDue = performance.now() + 150;
  }
  function applyDay() {
    const pos = solarPosition(time), D = daySet(pos.el), u = sky.material.uniforms;
    sunDirection(pos.az, pos.el, sunDir);
    aimShadow();
    u.zenith.value.copy(D.zenith);
    u.horizon.value.copy(D.horizon);
    u.ground.value.copy(D.ground);
    u.sunColor.value.copy(D.sun);
    u.glow.value = D.glow;
    u.cloudTint.value.setRGB(1, 1, 1).lerp(D.sun, 0.25 * (1 - Math.min(1, pos.el / 20)));
    u.clouds.value = 1;
    u.moon.value = 0;
    const f = fill.uniforms;
    for (const k of ['zenith', 'horizon', 'ground']) f[k].value.set(LIGHT.ambient[k]).multiply(D.amb).multiplyScalar(D.fill);
    f.sunColor.value.copy(D.sun);
    sun.color.copy(D.sun);
    sun.intensity = D.sunI;
    scene.fog.color.copy(D.haze);
    gtao.blendIntensity = LIGHT.ao.intensity;
    grade.enabled = true;
    bloom.enabled = false;
    setExposure(D.exp);
    if (envAt === time) scene.environment = dayEnv;
    else if (performance.now() >= envDue) refreshEnv();
    else if (!envTimer) envTimer = setTimeout(refreshEnv, envDue - performance.now());
  }
  function setTime(h) {
    time = THREE.MathUtils.clamp(h, SOLAR.min, SOLAR.max);
    if (!isNight) applyDay();
  }

  // night: sky, ambient, moon, fog, AO and bloom; the lamps, floodlights and windows are in night.js. The moon
  // stands where the v9 sun did, whatever the time; turning night off goes back to the time of day.
  function setNight(on) {
    isNight = on;
    if (!on) { applyDay(); return; }
    const u = sky.material.uniforms, c = N.sky;
    sunDirection(LIGHT.sunAz, LIGHT.sunEl, sunDir);
    aimShadow();
    u.zenith.value.set(c.zenith);
    u.horizon.value.set(c.horizon);
    u.ground.value.set(c.ground);
    // the moon's halo is a quarter of the sun's glow; its disc is drawn at full moon colour
    u.sunColor.value.set(N.moonColor).multiplyScalar(0.25);
    u.glow.value = 0.08;
    u.cloudTint.value.setRGB(...N.cloudTint);
    u.clouds.value = N.clouds;
    u.moon.value = 4;
    scene.environment = nightEnv;
    sun.color.set(N.moonColor);
    sun.intensity = N.moonIntensity;
    scene.fog.color.set(N.sky.horizon);
    gtao.blendIntensity = N.ao;
    grade.enabled = false;
    bloom.enabled = true;
    setExposure(N.exposure);
  }
  applyDay();

  let hq = true;
  return {
    sun,
    sky,
    composer,
    gtao,
    get hq() { return hq; },
    setQuality(on) { hq = on; },
    setNight,
    setTime,
    get time() { return time; },
    get sunPosition() { return solarPosition(time); },
    setSize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); },
    render(orbitTarget) {
      sky.position.copy(camera.position);
      const d = orbitTarget ? camera.position.distanceTo(orbitTarget) : 0, H = LIGHT.haze;
      scene.fog.near = H.near + d * H.follow[0];
      scene.fog.far = H.far + d * H.follow[1];
      fitShadow(orbitTarget);
      if (hq) composer.render();
      else renderer.render(scene, camera);
    },
  };
}
