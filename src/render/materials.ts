import * as THREE from 'three';
import { getToonRamp } from './textures';

export interface ToonOptions {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  emissive?: THREE.ColorRepresentation;
  emissiveMap?: THREE.Texture | null;
  emissiveIntensity?: number;
}

/** 卡通分段光影材質；整個場景共用同一條 3 階明暗。 */
export function toon(opts: ToonOptions = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: opts.color ?? 0xffffff,
    map: opts.map ?? null,
    gradientMap: getToonRamp(),
    emissive: opts.emissive ?? 0x000000,
    emissiveMap: opts.emissiveMap ?? null,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
  });
}

/** 讓材質支援「網點淡出」：擋住角色的牆以像素網點方式變透明，不需排序透明物件。 */
export function makeFadeable(mat: THREE.Material, fade: { value: number }): void {
  mat.userData.fade = fade;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `uniform float uFade;
float m1Bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float m1Bayer4(vec2 a) { return m1Bayer2(0.5 * a) * 0.25 + m1Bayer2(a); }
void main() {
  if (uFade > 0.001 && m1Bayer4(gl_FragCoord.xy) < uFade) discard;`,
      );
  };
  mat.customProgramCacheKey = () => 'm1-fade';
}

/** 角色材質：寫入模板值 1，讓「穿牆剪影」只畫在沒有角色的位置。 */
export function markCharacterMaterial(mat: THREE.Material): void {
  mat.stencilWrite = true;
  mat.stencilRef = 1;
  mat.stencilFunc = THREE.AlwaysStencilFunc;
  mat.stencilZPass = THREE.ReplaceStencilOp;
}

/** 被牆擋住時顯示的剪影：只在深度「較遠」且該像素不是角色時繪製。 */
export function silhouetteMaterial(color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 });
  m.depthFunc = THREE.GreaterDepth;
  m.depthWrite = false;
  m.stencilWrite = true;
  m.stencilRef = 0;
  m.stencilFunc = THREE.EqualStencilFunc;
  m.stencilFail = THREE.KeepStencilOp;
  m.stencilZFail = THREE.KeepStencilOp;
  m.stencilZPass = THREE.KeepStencilOp;
  m.toneMapped = false;
  return m;
}

/**
 * 建立依「世界座標」展開 UV 的方塊，讓相鄰的牆面材質密度一致、接縫連續。
 * metersPerTile：材質重複一次代表的公尺數。
 * 面的順序與 BoxGeometry 相同：+X, -X, +Y(頂), -Y(底), +Z, -Z。
 */
export function boxWorldUV(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  metersPerTile: number,
  topMetersPerTile = metersPerTile,
): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const y = pos.getY(i) + cy;
    const z = pos.getZ(i) + cz;
    const nx = nor.getX(i);
    const ny = nor.getY(i);
    const nz = nor.getZ(i);
    let u: number;
    let v: number;
    if (Math.abs(ny) > 0.5) {
      u = x / topMetersPerTile;
      v = -z / topMetersPerTile;
    } else if (Math.abs(nx) > 0.5) {
      u = (nx > 0 ? -z : z) / metersPerTile;
      v = y / metersPerTile;
    } else {
      u = (nz > 0 ? x : -x) / metersPerTile;
      v = y / metersPerTile;
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return g;
}

/** 地面用的平面，UV 依世界座標展開。 */
export function floorPlane(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  metersPerTile: number,
): THREE.BufferGeometry {
  const w = maxX - minX;
  const d = maxZ - minZ;
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(minX + w / 2, 0, minZ + d / 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / metersPerTile, -pos.getZ(i) / metersPerTile);
  }
  uv.needsUpdate = true;
  return g;
}

// ---------------------------------------------------------------- 美術風格（兩套材質）

/**
 * 美術風格：
 * - pixel：卡通分段光影＋像素材質（原本的像素風）。
 * - diorama：微縮模型，帶霧面塑膠／木頭質感的標準材質，材質貼圖平滑取樣。
 * 每個卡通材質都配一個微縮模型版本，切換風格時直接替換，不重建場景。
 */
export type ArtStyle = 'diorama' | 'pixel';

export const ART: { style: ArtStyle } = { style: 'diorama' };

/** 微縮模型版本的顏色提亮（場景材質原本是為夜晚設計的偏暗配色）。 */
const DIORAMA_BRIGHTEN = 1.15;
/** 有貼圖的材質：把貼圖平均亮度（線性）拉到這個值附近，深色的柏油、磚牆才不會在白天顯得髒暗。 */
const DIORAMA_TARGET_LUMA = 0.16;
const DIORAMA_MAX_BOOST = 4.5;

const lumaCache = new WeakMap<object, number>();

/** 計算畫布貼圖的平均亮度（線性空間）。 */
function textureLuma(t: THREE.Texture): number | null {
  const img = t.image as HTMLCanvasElement | undefined;
  if (!img || typeof (img as HTMLCanvasElement).getContext !== 'function') return null;
  const hit = lumaCache.get(img);
  if (hit !== undefined) return hit;
  const ctx = img.getContext('2d');
  if (!ctx) return null;
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2]);
  const v = sum / (data.length / 4);
  lumaCache.set(img, v);
  return v;
}

const smoothCache = new WeakMap<THREE.Texture, THREE.Texture>();

/** 同一張圖改用平滑取樣＋多層縮圖，表面看起來像上過漆的模型而不是像素格。 */
function smoothTexture(t: THREE.Texture | null): THREE.Texture | null {
  if (!t) return null;
  const hit = smoothCache.get(t);
  if (hit) return hit;
  const c = t.clone();
  c.magFilter = THREE.LinearFilter;
  c.minFilter = THREE.LinearMipmapLinearFilter;
  c.generateMipmaps = true;
  c.anisotropy = 8;
  c.needsUpdate = true;
  smoothCache.set(t, c);
  return c;
}

function copyStencil(from: THREE.Material, to: THREE.Material): void {
  to.stencilWrite = from.stencilWrite;
  to.stencilRef = from.stencilRef;
  to.stencilFunc = from.stencilFunc;
  to.stencilZPass = from.stencilZPass;
  to.stencilFail = from.stencilFail;
  to.stencilZFail = from.stencilZFail;
}

/** 由卡通材質產生微縮模型版本（同色、同貼圖、同模板與淡出設定）。 */
export function dioramaTwin(m: THREE.MeshToonMaterial): THREE.MeshStandardMaterial {
  const twin = m.userData.twin as THREE.MeshStandardMaterial | undefined;
  if (twin) return twin;
  let boost = DIORAMA_BRIGHTEN;
  const luma = m.map ? textureLuma(m.map) : null;
  if (luma) {
    const colorLuma = 0.2126 * m.color.r + 0.7152 * m.color.g + 0.0722 * m.color.b;
    boost = Math.min(DIORAMA_MAX_BOOST, Math.max(1, DIORAMA_TARGET_LUMA / Math.max(1e-4, luma * colorLuma)));
  }
  const color = m.color.clone().multiplyScalar(boost);
  // 個別材質的微縮模型色調修正（例如偏藍的柏油在暖色陽光下會發紫）
  if (m.userData.dioramaTint !== undefined) color.multiply(new THREE.Color(m.userData.dioramaTint as number));
  const std = new THREE.MeshStandardMaterial({
    color,
    map: smoothTexture(m.map),
    emissive: m.emissive.clone(),
    emissiveMap: smoothTexture(m.emissiveMap),
    emissiveIntensity: m.emissiveIntensity,
    roughness: 0.78,
    metalness: 0,
    vertexColors: m.vertexColors,
    transparent: m.transparent,
    opacity: m.opacity,
    alphaTest: m.alphaTest,
    side: m.side,
  });
  copyStencil(m, std);
  if (m.userData.fade) makeFadeable(std, m.userData.fade as { value: number });
  std.userData.isTwin = true;
  m.userData.twin = std;
  return std;
}

/** 同步設定兩套材質的自發光（受擊閃色用）。 */
export function setFlashEmissive(m: THREE.Material & { emissive: THREE.Color }, color: THREE.Color, k: number): void {
  m.emissive.copy(color).multiplyScalar(k);
  const twin = m.userData.twin as (THREE.Material & { emissive: THREE.Color }) | undefined;
  twin?.emissive.copy(m.emissive);
}

interface StyleMats {
  pixel: THREE.Material | THREE.Material[];
  diorama: THREE.Material | THREE.Material[];
}

/**
 * 為物件樹裡所有使用卡通材質的網格準備兩套材質，並套用目前的風格。
 * 新生成的角色（例如喪屍）建立後也要呼叫一次。
 */
export function styleTree(root: THREE.Object3D, style: ArtStyle = ART.style): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || mesh.layers.mask === 2) return;
    let mats = mesh.userData.styleMats as StyleMats | undefined;
    if (!mats) {
      const src = mesh.material;
      const list = Array.isArray(src) ? src : [src];
      if (!list.some((m) => (m as THREE.MeshToonMaterial).isMeshToonMaterial)) return;
      const twins = list.map((m) => ((m as THREE.MeshToonMaterial).isMeshToonMaterial ? dioramaTwin(m as THREE.MeshToonMaterial) : m));
      mats = { pixel: src, diorama: Array.isArray(src) ? twins : twins[0] };
      mesh.userData.styleMats = mats;
    }
    mesh.material = mats[style];
  });
}
