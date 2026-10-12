import * as THREE from 'three';

/**
 * 像素風渲染流程：
 * 1. 以低解析度把場景的法線與深度畫到 normalTarget（只含實體物件，不含特效）。
 * 2. 以同樣解析度畫出彩色畫面到 colorTarget（含特效、穿牆剪影）。
 * 3. 合成到螢幕：依深度／法線差畫出像素描邊，最近鄰放大，並套用子彈時間的色調。
 *
 * 鏡頭位置先「對齊到像素格」再渲染，合成時補回不到一格的位移，
 * 所以鏡頭平滑跟隨時畫面不會出現像素爬行閃爍。UI 由 HTML 繪製，保持原解析度。
 */

export interface PipelineSettings {
  pixelMode: boolean;
  pixelSize: number; // CSS 像素
  outlines: boolean;
}

export interface FrameEffects {
  slowmo: number; // 0..1
  damage: number; // 0..1
  pulse: number; // 子彈時間啟動時的波紋 0..1
  pulseCenter: THREE.Vector2; // 螢幕座標 0..1
  time: number;
}

const MARGIN = 1;

const compositeVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const compositeFragment = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uScreen;
uniform vec2 uLowSize;
uniform float uPixel;
uniform vec2 uOffset;
uniform float uOutline;
uniform float uNear;
uniform float uFar;
uniform float uSlow;
uniform float uDamage;
uniform float uPulse;
uniform vec2 uPulseCenter;
uniform float uTime;
varying vec2 vUv;

float linDepth(ivec2 c) {
  float d = texelFetch(tDepth, c, 0).r;
  return uNear + d * (uFar - uNear);
}
vec3 nrm(ivec2 c) {
  return texelFetch(tNormal, c, 0).rgb * 2.0 - 1.0;
}

void main() {
  vec2 low = (gl_FragCoord.xy - uScreen * 0.5) / uPixel + uLowSize * 0.5 - uOffset;
  ivec2 maxC = ivec2(uLowSize) - 1;
  ivec2 c = clamp(ivec2(floor(low)), ivec2(0), maxC);
  vec3 col = texelFetch(tColor, c, 0).rgb;

  if (uOutline > 0.5) {
    float d = linDepth(c);
    if (d < uFar - 0.5) {
      vec3 n = nrm(c);
      ivec2 offs[4] = ivec2[4](ivec2(1, 0), ivec2(-1, 0), ivec2(0, 1), ivec2(0, -1));
      float depthEdge = 0.0;
      float normalEdge = 0.0;
      for (int i = 0; i < 4; i++) {
        ivec2 nc = clamp(c + offs[i], ivec2(0), maxC);
        float nd = linDepth(nc);
        // 外輪廓：鄰格明顯較遠，就在較近的這一格畫深色線
        depthEdge += clamp((nd - d - 0.35) * 2.0, 0.0, 1.0);
        // 內部稜線：法線變化且自己不比鄰格遠，就把這一格提亮
        vec3 nn = nrm(nc);
        float ndiff = dot(n - nn, vec3(1.0, 1.0, 1.0));
        float nIndicator = clamp(smoothstep(-0.01, 0.01, ndiff), 0.0, 1.0);
        float dIndicator = clamp(sign((nd - d) * 0.25 + 0.0025), 0.0, 1.0);
        normalEdge += (1.0 - dot(n, nn)) * nIndicator * dIndicator;
      }
      if (depthEdge > 0.0) {
        col *= 1.0 - 0.55 * min(1.0, depthEdge);
      } else if (normalEdge > 0.12) {
        col *= 1.28;
      }
    }
  }

  vec2 uv = gl_FragCoord.xy / uScreen;
  vec2 cen = (uv - 0.5) * vec2(uScreen.x / uScreen.y, 1.0);
  float r = length(cen);

  // 子彈時間：降飽和、偏冷色、加強暗角
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 cool = vec3(lum) * vec3(0.78, 0.95, 1.18);
  col = mix(col, cool, uSlow * 0.62);
  col += vec3(0.0, 0.012, 0.03) * uSlow;

  // 啟動波紋
  if (uPulse > 0.0) {
    vec2 pc = (uv - uPulseCenter) * vec2(uScreen.x / uScreen.y, 1.0);
    float pr = length(pc);
    float ring = smoothstep(0.05, 0.0, abs(pr - (1.0 - uPulse) * 1.3));
    col += vec3(0.25, 0.55, 0.75) * ring * uPulse;
  }

  float vig = smoothstep(1.05, 0.35, r);
  col *= mix(1.0, vig, 0.45 + uSlow * 0.35);

  // 受傷時畫面邊緣泛紅
  float edge = smoothstep(0.35, 0.95, r);
  col = mix(col, vec3(0.55, 0.02, 0.02), uDamage * edge * 0.85);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class PixelPipeline {
  readonly renderCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private colorTarget: THREE.WebGLRenderTarget;
  private normalTarget: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly composite: THREE.ShaderMaterial;
  private bufferW = 1;
  private bufferH = 1;
  private settings: PipelineSettings = { pixelMode: true, pixelSize: 3, outlines: true };
  private samples = 0;
  lowW = 1;
  lowH = 1;
  /** 每個低解析度像素代表的世界尺寸（公尺）。 */
  worldPerPixel = 0.05;
  /** 本幀的次像素補償量（低解析度像素）。 */
  readonly offset = new THREE.Vector2();
  /** 渲染時要暫時隱藏於法線圖之外的物件（淡出中的牆）。 */
  hideInNormalPass: THREE.Object3D[] = [];

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.colorTarget = this.makeColorTarget(1, 1, 0);
    this.normalTarget = this.makeNormalTarget(1, 1);
    this.composite = new THREE.ShaderMaterial({
      vertexShader: compositeVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        tColor: { value: null },
        tNormal: { value: null },
        tDepth: { value: null },
        uScreen: { value: new THREE.Vector2(1, 1) },
        uLowSize: { value: new THREE.Vector2(1, 1) },
        uPixel: { value: 3 },
        uOffset: { value: new THREE.Vector2() },
        uOutline: { value: 1 },
        uNear: { value: 1 },
        uFar: { value: 100 },
        uSlow: { value: 0 },
        uDamage: { value: 0 },
        uPulse: { value: 0 },
        uPulseCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
  }

  private makeColorTarget(w: number, h: number, samples: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: true,
      samples,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    return t;
  }

  private makeNormalTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, {
      depthBuffer: true,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    t.depthTexture = new THREE.DepthTexture(w, h);
    t.depthTexture.type = THREE.UnsignedIntType;
    return t;
  }

  configure(settings: PipelineSettings): void {
    this.settings = { ...settings };
    this.resize(this.bufferW, this.bufferH, true);
  }

  /** 每像素的實際裝置像素大小（像素風時取整數，避免不均勻的像素）。 */
  get devicePixelSize(): number {
    if (!this.settings.pixelMode) return 1;
    return Math.max(1, Math.round(this.settings.pixelSize * this.renderer.getPixelRatio()));
  }

  resize(bufferW: number, bufferH: number, force = false): void {
    const px = this.devicePixelSize;
    const margin = this.settings.pixelMode ? MARGIN : 0;
    const lw = Math.ceil(bufferW / px) + margin * 2;
    const lh = Math.ceil(bufferH / px) + margin * 2;
    const samples = this.settings.pixelMode ? 0 : 4;
    if (!force && lw === this.lowW && lh === this.lowH && bufferW === this.bufferW && bufferH === this.bufferH) return;
    this.bufferW = bufferW;
    this.bufferH = bufferH;
    this.lowW = lw;
    this.lowH = lh;
    if (samples !== this.samples) {
      this.colorTarget.dispose();
      this.colorTarget = this.makeColorTarget(lw, lh, samples);
      this.samples = samples;
    } else {
      this.colorTarget.setSize(lw, lh);
    }
    this.normalTarget.dispose();
    this.normalTarget = this.makeNormalTarget(lw, lh);
  }

  /**
   * viewCam：平滑跟隨的鏡頭（也用於滑鼠投射）。這裡依它建立對齊像素格的渲染鏡頭。
   */
  render(scene: THREE.Scene, viewCam: THREE.OrthographicCamera, viewHeight: number, fx: FrameEffects): void {
    const px = this.devicePixelSize;
    const pixelMode = this.settings.pixelMode;
    const screenLowH = this.bufferH / px;
    const s = viewHeight / screenLowH;
    this.worldPerPixel = s;

    const rc = this.renderCam;
    rc.left = (-this.lowW / 2) * s;
    rc.right = (this.lowW / 2) * s;
    rc.top = (this.lowH / 2) * s;
    rc.bottom = (-this.lowH / 2) * s;
    rc.near = viewCam.near;
    rc.far = viewCam.far;
    rc.quaternion.copy(viewCam.quaternion);
    rc.position.copy(viewCam.position);

    if (pixelMode) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(viewCam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(viewCam.quaternion);
      const cx = viewCam.position.dot(right);
      const cy = viewCam.position.dot(up);
      const dx = Math.round(cx / s) * s - cx;
      const dy = Math.round(cy / s) * s - cy;
      rc.position.addScaledVector(right, dx).addScaledVector(up, dy);
      this.offset.set(dx / s, dy / s);
    } else {
      this.offset.set(0, 0);
    }
    rc.updateProjectionMatrix();
    rc.updateMatrixWorld();

    const r = this.renderer;

    if (this.settings.outlines) {
      const hidden: THREE.Object3D[] = [];
      for (const o of this.hideInNormalPass) {
        if (o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      }
      rc.layers.set(0);
      scene.overrideMaterial = this.normalMaterial;
      const bg = scene.background;
      scene.background = null;
      r.setRenderTarget(this.normalTarget);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, true);
      r.render(scene, rc);
      scene.overrideMaterial = null;
      scene.background = bg;
      for (const o of hidden) o.visible = true;
    }

    rc.layers.enable(0);
    rc.layers.enable(1);
    // 陰影圖每幀只在彩色畫面這一步更新一次（法線步驟不需要陰影）
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.colorTarget);
    r.render(scene, rc);

    const u = this.composite.uniforms;
    u.tColor.value = this.colorTarget.texture;
    u.tNormal.value = this.normalTarget.texture;
    u.tDepth.value = this.normalTarget.depthTexture;
    u.uScreen.value.set(this.bufferW, this.bufferH);
    u.uLowSize.value.set(this.lowW, this.lowH);
    u.uPixel.value = px;
    u.uOffset.value.copy(this.offset);
    u.uOutline.value = this.settings.outlines ? 1 : 0;
    u.uNear.value = rc.near;
    u.uFar.value = rc.far;
    u.uSlow.value = fx.slowmo;
    u.uDamage.value = fx.damage;
    u.uPulse.value = fx.pulse;
    u.uPulseCenter.value.copy(fx.pulseCenter);
    u.uTime.value = fx.time;
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }

  /** 讀取低解析度畫面尺寸等資訊（除錯面板用）。 */
  info(): { lowW: number; lowH: number; pixel: number; offsetX: number; offsetY: number } {
    return { lowW: this.lowW, lowH: this.lowH, pixel: this.devicePixelSize, offsetX: this.offset.x, offsetY: this.offset.y };
  }
}
