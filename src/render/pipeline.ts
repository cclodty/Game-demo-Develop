import * as THREE from 'three';

/**
 * 渲染流程（像素風與微縮模型共用）：
 * 1. 法線與深度：畫出實體物件的法線與深度（不含特效），供描邊與環境光遮蔽使用。
 * 2. 環境光遮蔽：依深度與法線估算牆角、物件底部的接觸陰影（微縮模型感的關鍵）。
 * 3. 彩色畫面：含特效與穿牆剪影。
 * 4. 合成：描邊、環境光遮蔽、調色、子彈時間色調、暗角、受傷泛紅。
 * 5. 輸出：移軸景深（畫面上下模糊）、色調映射後畫到螢幕。
 *
 * 像素風：以低解析度渲染，鏡頭先對齊像素格、合成時補回不到一格的位移，畫面平移時不閃爍。
 * 微縮模型：全解析度加多重取樣抗鋸齒。UI 由 HTML 繪製，兩種風格都保持清晰。
 */

export interface PipelineSettings {
  pixelMode: boolean;
  pixelSize: number; // CSS 像素
  outlines: boolean;
  /** 環境光遮蔽強度 0..1（0 為關閉）。 */
  ao: number;
  /** 移軸景深強度 0..1。 */
  tiltShift: number;
  saturation: number;
  contrast: number;
  /** 色溫：正值偏暖、負值偏冷。 */
  warmth: number;
  vignette: number;
}

export const DEFAULT_PIPELINE: PipelineSettings = {
  pixelMode: true,
  pixelSize: 3,
  outlines: true,
  ao: 0,
  tiltShift: 0,
  saturation: 1,
  contrast: 1,
  warmth: 0,
  vignette: 0.45,
};

export interface FrameEffects {
  slowmo: number; // 0..1
  damage: number; // 0..1
  pulse: number; // 子彈時間啟動時的波紋 0..1
  pulseCenter: THREE.Vector2; // 螢幕座標 0..1
  time: number;
}

const MARGIN = 1;
const AO_RADIUS = 0.7; // 公尺

const quadVertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const depthHelpers = /* glsl */ `
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 uLowSize;
uniform float uNear;
uniform float uFar;
float linDepth(ivec2 c) {
  float d = texelFetch(tDepth, c, 0).r;
  return uNear + d * (uFar - uNear);
}
vec3 nrm(ivec2 c) {
  return texelFetch(tNormal, c, 0).rgb * 2.0 - 1.0;
}`;

/** 環境光遮蔽：正交鏡頭下由深度直接還原位置，在法線半球內取 12 個點比較深度。 */
const aoFragment = /* glsl */ `
${depthHelpers}
uniform vec2 uOrtho;
uniform float uRadius;
uniform float uAOScale;

vec3 viewPos(vec2 pix, float d) {
  vec2 ndc = pix / uLowSize * 2.0 - 1.0;
  return vec3(ndc * uOrtho * 0.5, -d);
}

void main() {
  // 全解析度畫面時以一半解析度計算（uAOScale = 2），成本降為四分之一
  ivec2 ac = ivec2(gl_FragCoord.xy);
  ivec2 c = min(ac * int(uAOScale), ivec2(uLowSize) - 1);
  float d = linDepth(c);
  if (d > uFar - 0.5) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 n = normalize(nrm(c));
  vec3 p = viewPos(vec2(c) + 0.5, d);
  // 以 4×4 格重複的旋轉角度取樣，合成時用 4×4 模糊剛好抵銷雜訊
  int idx = (ac.x & 3) + (ac.y & 3) * 4;
  float ang = float(idx) * (6.2831853 / 16.0);
  vec3 t = normalize(abs(n.z) < 0.9 ? cross(n, vec3(0.0, 0.0, 1.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(n, t);
  float occ = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float a = ang + fi * 2.39996;
    float r = (fi + 0.5) / 12.0;
    vec3 dir = (t * cos(a) + b * sin(a)) * r + n * sqrt(max(0.0, 1.0 - r * r));
    float scale = mix(0.2, 1.0, (fi * fi) / 144.0);
    vec3 s = p + dir * uRadius * scale;
    vec2 sp = (s.xy / (uOrtho * 0.5) * 0.5 + 0.5) * uLowSize;
    ivec2 sc = clamp(ivec2(sp), ivec2(0), ivec2(uLowSize) - 1);
    float sd = linDepth(sc);
    float diff = -s.z - sd;
    float range = smoothstep(0.0, 1.0, uRadius / max(abs(d - sd), 1e-3));
    occ += step(0.03, diff) * range;
  }
  gl_FragColor = vec4(vec3(1.0 - occ / 12.0), 1.0);
}`;

const compositeFragment = /* glsl */ `
${depthHelpers}
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform vec2 uScreen;
uniform float uPixel;
uniform vec2 uOffset;
uniform float uOutline;
uniform float uAO;
uniform float uAOScale;
uniform float uSat;
uniform float uContrast;
uniform float uWarm;
uniform float uVignette;
uniform float uSlow;
uniform float uDamage;
uniform float uPulse;
uniform vec2 uPulseCenter;

void main() {
  vec2 low = (gl_FragCoord.xy - uScreen * 0.5) / uPixel + uLowSize * 0.5 - uOffset;
  ivec2 maxC = ivec2(uLowSize) - 1;
  ivec2 c = clamp(ivec2(floor(low)), ivec2(0), maxC);
  vec3 col = texelFetch(tColor, c, 0).rgb;
  float d = linDepth(c);
  bool solid = d < uFar - 0.5;

  // 環境光遮蔽：4×4 模糊，深度差太大的鄰格不採用（避免陰影溢出到前景）
  if (uAO > 0.001 && solid) {
    float sum = 0.0;
    float wsum = 0.0;
    int sc = int(uAOScale);
    ivec2 ac = c / sc;
    ivec2 maxA = (maxC + 1) / sc - 1;
    for (int y = -2; y < 2; y++) {
      for (int x = -2; x < 2; x++) {
        ivec2 na = clamp(ac + ivec2(x, y), ivec2(0), maxA);
        float w = 1.0 / (1.0 + abs(linDepth(min(na * sc, maxC)) - d) * 8.0);
        sum += texelFetch(tAO, na, 0).r * w;
        wsum += w;
      }
    }
    float ao = sum / max(wsum, 1e-4);
    col *= mix(1.0, ao, uAO);
  }

  if (uOutline > 0.5 && solid) {
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

  // 調色：飽和度、以中灰為中心的對比、色溫
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uSat);
  col = max((col - 0.18) * uContrast + 0.18, 0.0);
  col *= vec3(1.0 + uWarm, 1.0 + uWarm * 0.2, 1.0 - uWarm);

  vec2 uv = gl_FragCoord.xy / uScreen;
  vec2 cen = (uv - 0.5) * vec2(uScreen.x / uScreen.y, 1.0);
  float r = length(cen);

  // 子彈時間：降飽和、偏冷色、加強暗角
  lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
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
  col *= mix(1.0, vig, uVignette + uSlow * 0.35);

  // 受傷時畫面邊緣泛紅
  float edge = smoothstep(0.35, 0.95, r);
  col = mix(col, vec3(0.55, 0.02, 0.02), uDamage * edge * 0.85);

  gl_FragColor = vec4(col, 1.0);
}`;

/** 輸出：移軸景深（以黃金角圓盤取樣模糊畫面上下緣），再做色調映射。 */
const finalFragment = /* glsl */ `
uniform sampler2D tPost;
uniform vec2 uScreen;
uniform float uTilt;
uniform float uMaxBlur;

void main() {
  vec2 uv = gl_FragCoord.xy / uScreen;
  float dy = abs(uv.y - 0.5);
  float radius = smoothstep(0.1, 0.5, dy) * uTilt * uMaxBlur;
  vec3 col;
  if (radius < 0.5) {
    col = texture2D(tPost, uv).rgb;
  } else {
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      float fi = float(i);
      float rr = sqrt((fi + 0.5) / 24.0) * radius;
      float a = fi * 2.39996;
      acc += texture2D(tPost, uv + vec2(cos(a), sin(a)) * rr / uScreen).rgb;
    }
    col = acc / 24.0;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function quadScene(material: THREE.Material): THREE.Scene {
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);
  return scene;
}

export class PixelPipeline {
  readonly renderCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);
  private colorTarget: THREE.WebGLRenderTarget;
  private normalTarget: THREE.WebGLRenderTarget;
  private aoTarget: THREE.WebGLRenderTarget;
  private postTarget: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly aoMaterial: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly finalMaterial: THREE.ShaderMaterial;
  private readonly aoScene: THREE.Scene;
  private readonly compositeScene: THREE.Scene;
  private readonly finalScene: THREE.Scene;
  private bufferW = 1;
  private bufferH = 1;
  private settings: PipelineSettings = { ...DEFAULT_PIPELINE };
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
    this.aoTarget = this.makeSimpleTarget(1, 1, THREE.UnsignedByteType, THREE.NearestFilter);
    this.postTarget = this.makeSimpleTarget(1, 1, THREE.HalfFloatType, THREE.LinearFilter);
    const depthUniforms = () => ({
      tNormal: { value: null },
      tDepth: { value: null },
      uLowSize: { value: new THREE.Vector2(1, 1) },
      uNear: { value: 1 },
      uFar: { value: 100 },
    });
    this.aoMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: aoFragment,
      uniforms: { ...depthUniforms(), uOrtho: { value: new THREE.Vector2(1, 1) }, uRadius: { value: AO_RADIUS }, uAOScale: { value: 1 } },
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: compositeFragment,
      uniforms: {
        ...depthUniforms(),
        tColor: { value: null },
        tAO: { value: null },
        uScreen: { value: new THREE.Vector2(1, 1) },
        uPixel: { value: 3 },
        uOffset: { value: new THREE.Vector2() },
        uOutline: { value: 1 },
        uAO: { value: 0 },
        uAOScale: { value: 1 },
        uSat: { value: 1 },
        uContrast: { value: 1 },
        uWarm: { value: 0 },
        uVignette: { value: 0.45 },
        uSlow: { value: 0 },
        uDamage: { value: 0 },
        uPulse: { value: 0 },
        uPulseCenter: { value: new THREE.Vector2(0.5, 0.5) },
      },
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.finalMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: finalFragment,
      uniforms: {
        tPost: { value: null },
        uScreen: { value: new THREE.Vector2(1, 1) },
        uTilt: { value: 0 },
        uMaxBlur: { value: 7 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.aoScene = quadScene(this.aoMaterial);
    this.compositeScene = quadScene(this.composite);
    this.finalScene = quadScene(this.finalMaterial);
  }

  private makeColorTarget(w: number, h: number, samples: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: true,
      samples,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
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

  private makeSimpleTarget(w: number, h: number, type: THREE.TextureDataType, filter: THREE.MagnificationTextureFilter): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type,
      depthBuffer: false,
      minFilter: filter,
      magFilter: filter,
      generateMipmaps: false,
    });
  }

  configure(settings: PipelineSettings): void {
    this.settings = { ...settings };
    this.resize(this.bufferW, this.bufferH, true);
  }

  /** 環境光遮蔽的降解析度倍率：像素風已是低解析度，不再縮小。 */
  private get aoScale(): number {
    return this.settings.pixelMode ? 1 : 2;
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
    const aoScale = this.aoScale;
    this.aoTarget.setSize(Math.ceil(lw / aoScale), Math.ceil(lh / aoScale));
    this.postTarget.setSize(bufferW, bufferH);
  }

  /**
   * viewCam：平滑跟隨的鏡頭（也用於滑鼠投射）。這裡依它建立對齊像素格的渲染鏡頭。
   */
  render(scene: THREE.Scene, viewCam: THREE.OrthographicCamera, viewHeight: number, fx: FrameEffects): void {
    const st = this.settings;
    const px = this.devicePixelSize;
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

    if (st.pixelMode) {
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
    const needDepth = st.outlines || st.ao > 0.001;

    if (needDepth) {
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

    const setDepthUniforms = (m: THREE.ShaderMaterial) => {
      m.uniforms.tNormal.value = this.normalTarget.texture;
      m.uniforms.tDepth.value = this.normalTarget.depthTexture;
      m.uniforms.uLowSize.value.set(this.lowW, this.lowH);
      m.uniforms.uNear.value = rc.near;
      m.uniforms.uFar.value = rc.far;
    };

    if (st.ao > 0.001) {
      setDepthUniforms(this.aoMaterial);
      this.aoMaterial.uniforms.uOrtho.value.set(rc.right - rc.left, rc.top - rc.bottom);
      this.aoMaterial.uniforms.uAOScale.value = this.aoScale;
      r.setRenderTarget(this.aoTarget);
      r.render(this.aoScene, this.quadCam);
    }

    rc.layers.enable(0);
    rc.layers.enable(1);
    // 陰影圖每幀只在彩色畫面這一步更新一次（法線步驟不需要陰影）
    r.shadowMap.needsUpdate = true;
    r.setRenderTarget(this.colorTarget);
    r.render(scene, rc);

    const u = this.composite.uniforms;
    setDepthUniforms(this.composite);
    u.tColor.value = this.colorTarget.texture;
    u.tAO.value = this.aoTarget.texture;
    u.uScreen.value.set(this.bufferW, this.bufferH);
    u.uPixel.value = px;
    u.uOffset.value.copy(this.offset);
    u.uOutline.value = st.outlines ? 1 : 0;
    u.uAO.value = st.ao;
    u.uAOScale.value = this.aoScale;
    u.uSat.value = st.saturation;
    u.uContrast.value = st.contrast;
    u.uWarm.value = st.warmth;
    u.uVignette.value = st.vignette;
    u.uSlow.value = fx.slowmo;
    u.uDamage.value = fx.damage;
    u.uPulse.value = fx.pulse;
    u.uPulseCenter.value.copy(fx.pulseCenter);
    r.setRenderTarget(this.postTarget);
    r.render(this.compositeScene, this.quadCam);

    const f = this.finalMaterial.uniforms;
    f.tPost.value = this.postTarget.texture;
    f.uScreen.value.set(this.bufferW, this.bufferH);
    f.uTilt.value = st.pixelMode ? 0 : st.tiltShift;
    f.uMaxBlur.value = 7 * this.renderer.getPixelRatio();
    r.setRenderTarget(null);
    r.render(this.finalScene, this.quadCam);
  }

  /** 讀取低解析度畫面尺寸等資訊（除錯面板用）。 */
  info(): { lowW: number; lowH: number; pixel: number; offsetX: number; offsetY: number } {
    return { lowW: this.lowW, lowH: this.lowH, pixel: this.devicePixelSize, offsetX: this.offset.x, offsetY: this.offset.y };
  }
}
