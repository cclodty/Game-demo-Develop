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
