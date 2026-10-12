// Bloom for the neon + a bullet-time grade: desaturate everything that is not
// glowing, cool tint, chromatic aberration, vignette and a ripple when time
// slows down.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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

export class PostFX {
  constructor(renderer, scene, camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
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
