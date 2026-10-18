// Bloom for the neon + a bullet-time grade: desaturate everything that is not
// glowing, cool tint, chromatic aberration, vignette and a ripple when time
// slows down. On a map with the flat look (style.js), ink lines where the
// depth jumps: the world's outline in one full-screen pass instead of a hull
// per mesh (which would double the draw calls).

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { STYLE } from './config.js';

const FocusShader = {
  name: 'FocusShader',
  uniforms: {
    tDiffuse: { value: null },
    uFocus: { value: 0 },
    uHurt: { value: 0 },
    uFlash: { value: 0 },
    uRipple: { value: -1 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uFocus;
    uniform float uHurt;
    uniform float uFlash;
    uniform float uRipple;
    uniform vec2 uCenter;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      if (uRipple >= 0.0 && uRipple < 1.0) {
        vec2 d = uv - uCenter;
        d.x *= uAspect;
        float dist = length(d);
        float radius = uRipple * 1.5;
        float k = (1.0 - smoothstep(0.0, 0.12, abs(dist - radius))) * (1.0 - uRipple);
        vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
        dir.x /= uAspect;
        uv -= dir * k * 0.04;
      }
      vec2 c = uv - 0.5;
      float r = length(c);
      float amt = 0.012 * uFocus + 0.018 * uHurt;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * amt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * amt).b;

      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float hot = smoothstep(0.7, 2.2, max(col.r, max(col.g, col.b)));
      vec3 graded = vec3(l) * vec3(0.8, 0.95, 1.22);
      col = mix(col, graded, uFocus * 0.72 * (1.0 - hot));
      col = mix(col, col * col * 1.6, uFocus * 0.12);

      float vig = smoothstep(0.95, 0.28, r);
      col *= mix(1.0, vig, 0.28 + 0.42 * uFocus);
      col += vec3(0.55, 0.0, 0.03) * uHurt * smoothstep(0.2, 0.75, r);
      col += vec3(uFlash);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// Ink where the scene's depth bends: the second difference of the linear depth
// over STYLE.edge.step pixels, against the depth itself. Flat ground and walls
// stay clean (their depth changes evenly); silhouettes and creases get a
// line. A step of two pixels also matches the 2×2 see-through dither
// (cutaway.js), so faded buildings do not turn into noise. Lines thin out
// with distance and leave the sky alone.
const EdgeShader = {
  name: 'EdgeShader',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uLine: { value: new THREE.Vector4() }, // STYLE.edge: from, full, ink, step
    uFade: { value: new THREE.Vector2() },
    uInk: { value: new THREE.Color(0x06040e) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear;
    uniform float uFar;
    uniform vec4 uLine;
    uniform vec2 uFade;
    uniform vec3 uInk;
    varying vec2 vUv;

    float lin(vec2 uv) {
      float z = texture2D(tDepth, uv).x;
      return uNear * uFar / (uFar - z * (uFar - uNear));
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = lin(vUv);
      vec2 o = uTexel * uLine.w;
      float dx = abs(lin(vUv - vec2(o.x, 0.0)) + lin(vUv + vec2(o.x, 0.0)) - 2.0 * d);
      float dy = abs(lin(vUv - vec2(0.0, o.y)) + lin(vUv + vec2(0.0, o.y)) - 2.0 * d);
      float e = smoothstep(uLine.x, uLine.y, max(dx, dy) / d);
      e *= 1.0 - smoothstep(uFade.x, uFade.y, d);
      gl_FragColor = vec4(mix(c.rgb, uInk, e * uLine.z), c.a);
    }`,
};

/** The edge pass: reads the colour and depth the scene pass left in the read buffer. */
class EdgePass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({ ...EdgeShader, uniforms: THREE.UniformsUtils.clone(EdgeShader.uniforms), depthTest: false, depthWrite: false });
    this.u = this.material.uniforms;
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(w, h) {
    this.u.uTexel.value.set(1 / w, 1 / h);
  }

  render(renderer, writeBuffer, readBuffer) {
    this.u.tDiffuse.value = readBuffer.texture;
    this.u.tDepth.value = readBuffer.depthTexture;
    this.u.uNear.value = this.camera.near;
    this.u.uFar.value = this.camera.far;
    const L = STYLE.edge;
    this.u.uLine.value.set(L.from, L.full, L.ink, L.step);
    this.u.uFade.value.set(L.fadeFrom, L.fadeTo);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    // the scene's depth, for the edge pass (both buffers: the scene lands in whichever is read next)
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) rt.depthTexture = new THREE.DepthTexture();
    this.composer.addPass(new RenderPass(scene, camera));
    this.edges = new EdgePass(camera);
    this.edges.enabled = false;
    this.composer.addPass(this.edges);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.45, 0.82);
    this.composer.addPass(this.bloom);
    this.focus = new ShaderPass(FocusShader);
    this.composer.addPass(this.focus);
    this.composer.addPass(new OutputPass());
    this.u = this.focus.uniforms;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.u.uAspect.value = w / h;
  }

  render() {
    this.composer.render();
  }
}
