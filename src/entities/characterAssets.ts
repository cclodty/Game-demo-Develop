import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

/**
 * 外部角色模型的載入與自動整理。
 *
 * 把模型檔放到 src/assets/models/，檔名為 player.glb 與 zombie.glb（也接受 .gltf、.fbx）。
 * 載入後會自動：縮放到設定身高、腳底貼齊地面、置中，並從動畫名稱辨識各種動作。
 * 找不到檔案時沿用方塊暫用人形，遊戲照常運作。
 */

export type CharacterKind = 'player' | 'zombie';

export type ClipRole = 'idle' | 'walk' | 'run' | 'walkBack' | 'death' | 'attack' | 'hit';

export interface ModelConfig {
  /** 身高（公尺），模型會等比縮放到這個高度。 */
  height: number;
  /** 模型正面若不是朝 +Z，用這個角度修正。 */
  yawOffsetDeg: number;
  /** 走路、跑步動作原本對應的移動速度（公尺／秒），用來換算播放速度，避免腳滑。 */
  walkSpeed: number;
  runSpeed: number;
  /** 速度超過這個值改播跑步動作。 */
  runThreshold: number;
  /** 指定動作名稱（名稱自動辨識不準時使用）。 */
  clips?: Partial<Record<ClipRole, string>>;
  /** 轉成卡通分段光影材質，和目前場景一致。 */
  toon: boolean;
}

export const MODEL_CONFIG: Record<CharacterKind, ModelConfig> = {
  player: { height: 1.8, yawOffsetDeg: 0, walkSpeed: 1.7, runSpeed: 4.4, runThreshold: 3.0, toon: true },
  zombie: { height: 1.8, yawOffsetDeg: 0, walkSpeed: 1.5, runSpeed: 4.0, runThreshold: 3.2, toon: true },
};

export interface CharacterTemplate {
  kind: CharacterKind;
  fileName: string;
  config: ModelConfig;
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  roles: Partial<Record<ClipRole, THREE.AnimationClip>>;
  /** 正規化：縮放倍率與位移（套在模型外層）。 */
  scale: number;
  offset: THREE.Vector3;
  bones: { hips?: string; spine?: string; handR?: string };
  /** 動作名稱裡有沒有持槍姿勢（有的話把槍裝在手上）。 */
  hasGunPose: boolean;
}

// 建置時列出 src/assets/models/ 裡實際存在的檔案，不在執行時亂試網址
const MODEL_FILES = import.meta.glob('../assets/models/*.{glb,gltf,fbx}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export function findModelFile(kind: CharacterKind): { url: string; name: string } | null {
  for (const ext of ['glb', 'gltf', 'fbx']) {
    const key = Object.keys(MODEL_FILES).find((k) => k.toLowerCase().endsWith(`/${kind}.${ext}`));
    if (key) return { url: MODEL_FILES[key], name: key.split('/').pop()! };
  }
  return null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** 依動畫名稱辨識動作用途。回傳每種用途對應的動畫名稱。 */
export function detectClipRoles(names: readonly string[], overrides: Partial<Record<ClipRole, string>> = {}): Partial<Record<ClipRole, string>> {
  const rules: Record<ClipRole, { want: string[]; avoid: string[] }> = {
    idle: { want: ['idlegun', 'gunidle', 'rifleidle', 'idleaim', 'idleshoot', 'zombieidle', 'idle', 'standing', 'breath'], avoid: ['crouch', 'sit'] },
    walk: { want: ['zombiewalk', 'walkgun', 'gunwalk', 'riflewalk', 'walking', 'walk'], avoid: ['back', 'jump', 'crouch', 'left', 'right', 'strafe'] },
    run: { want: ['zombierun', 'rungun', 'gunrun', 'riflerun', 'running', 'run', 'sprint', 'jog'], avoid: ['back', 'jump', 'crouch', 'left', 'right', 'strafe', 'shoot'] },
    walkBack: { want: ['walkback', 'walkingback', 'backward', 'backwards', 'runback'], avoid: ['jump'] },
    death: { want: ['death', 'dying', 'die', 'dead', 'killed'], avoid: [] },
    attack: { want: ['zombieattack', 'attack', 'bite', 'punch', 'swipe', 'slash'], avoid: ['react', 'receive', 'recieve'] },
    hit: { want: ['hitreact', 'hitreaction', 'receivehit', 'recievehit', 'gethit', 'damage', 'hurt'], avoid: [] },
  };
  const out: Partial<Record<ClipRole, string>> = {};
  const normalized = names.map((n) => ({ n, k: norm(n) }));
  for (const role of Object.keys(rules) as ClipRole[]) {
    const forced = overrides[role];
    if (forced && names.includes(forced)) {
      out[role] = forced;
      continue;
    }
    const { want, avoid } = rules[role];
    for (const w of want) {
      const hit = normalized.find(({ k }) => k.includes(w) && !avoid.some((a) => k.includes(a)));
      if (hit) {
        out[role] = hit.n;
        break;
      }
    }
  }
  return out;
}

/** 依名稱找骨頭（髖部、脊椎、右手），用於上下半身分開轉向與裝槍。 */
export function detectBones(names: readonly string[]): { hips?: string; spine?: string; handR?: string } {
  const pick = (want: string[], avoid: string[] = []) =>
    want.map((w) => names.find((n) => norm(n).includes(w) && !avoid.some((a) => norm(n).includes(a)))).find(Boolean);
  return {
    hips: pick(['hips', 'pelvis', 'hip']),
    spine: pick(['spine1', 'spine', 'abdomen', 'chest', 'torso'], ['spine2']),
    handR: pick(['righthand', 'handr', 'rhand', 'handright', 'palm2r', 'wristr'], ['thumb', 'index', 'middle', 'ring', 'pinky']),
  };
}

/** 內嵌的 data URL 直接解碼成二進位，不經網路請求（單一 HTML 版本使用）。 */
function decodeDataUrl(url: string): ArrayBuffer {
  const comma = url.indexOf(',');
  const bin = atob(url.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function loadFile(url: string, name: string): Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] }> {
  const isFbx = name.toLowerCase().endsWith('.fbx');
  if (url.startsWith('data:')) {
    const buf = decodeDataUrl(url);
    if (isFbx) {
      const group = new FBXLoader().parse(buf, '');
      return { scene: group, clips: group.animations };
    }
    const gltf = await new GLTFLoader().parseAsync(buf, '');
    return { scene: gltf.scene, clips: gltf.animations };
  }
  if (isFbx) {
    const group = await new FBXLoader().loadAsync(url);
    return { scene: group, clips: group.animations };
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  return { scene: gltf.scene, clips: gltf.animations };
}

export async function loadCharacterTemplate(kind: CharacterKind): Promise<CharacterTemplate | null> {
  const file = findModelFile(kind);
  if (!file) return null;
  const config = MODEL_CONFIG[kind];
  const { scene, clips } = await loadFile(file.url, file.name);

  // 以綁定姿勢量出實際尺寸（含骨架變形）
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  const height = size.y > 1e-6 ? size.y : 1;
  const scale = config.height / height;
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale);

  const roleNames = detectClipRoles(
    clips.map((c) => c.name),
    config.clips,
  );
  const roles: Partial<Record<ClipRole, THREE.AnimationClip>> = {};
  for (const [role, name] of Object.entries(roleNames) as [ClipRole, string][]) {
    const clip = clips.find((c) => c.name === name);
    if (clip) roles[role] = clip;
  }
  const boneNames: string[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) boneNames.push(o.name);
  });
  return {
    kind,
    fileName: file.name,
    config,
    scene,
    clips,
    roles,
    scale,
    offset,
    bones: detectBones(boneNames),
    hasGunPose: clips.some((c) => /gun|rifle|pistol|shoot|aim/i.test(c.name)),
  };
}

export type CharacterTemplates = Partial<Record<CharacterKind, CharacterTemplate>>;

/** 載入所有角色模型；任一個失敗都只記錄警告並沿用方塊人形。 */
export async function loadCharacterTemplates(): Promise<{ templates: CharacterTemplates; errors: string[] }> {
  const templates: CharacterTemplates = {};
  const errors: string[] = [];
  for (const kind of ['player', 'zombie'] as const) {
    try {
      const t = await loadCharacterTemplate(kind);
      if (t) templates[kind] = t;
    } catch (err) {
      errors.push(`${kind}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { templates, errors };
}
