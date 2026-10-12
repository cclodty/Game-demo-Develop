import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * 外部角色模型的載入與自動整理。
 *
 * 把模型檔放到 src/assets/models/，檔名為 player.glb 與 zombie.glb（也接受 .gltf、.fbx）。
 * 載入後會自動：縮放到設定身高、腳底貼齊地面、置中，並從動畫名稱辨識各種動作。
 * 找不到檔案時沿用方塊暫用人形，遊戲照常運作。
 */

export type CharacterKind = 'player' | 'zombie';

export type ClipRole =
  | 'idle'
  | 'walk'
  | 'run'
  | 'walkBack'
  | 'strafeLeft'
  | 'strafeRight'
  | 'aim'
  | 'death'
  | 'attack'
  | 'hit';

export interface ModelConfig {
  /** 身高（公尺），模型會等比縮放到這個高度。 */
  height: number;
  /** 模型正面若不是朝 +Z，用這個角度修正。 */
  yawOffsetDeg: number;
  /**
   * 走路、跑步動作原本對應的移動速度（公尺／秒），用來換算播放速度，避免腳滑。
   * 留空（null）時，載入時依「著地腳往後滑的速度」自動量測。
   */
  walkSpeed: number | null;
  runSpeed: number | null;
  /** 速度超過這個值改播跑步動作。 */
  runThreshold: number;
  /** 指定動作名稱（名稱自動辨識不準時使用）。 */
  clips?: Partial<Record<ClipRole, string>>;
  /** 只截取動作的一段（秒）：[開始, 結束]。 */
  clipRanges?: Partial<Record<ClipRole, [number, number]>>;
  /** 轉成卡通分段光影材質，和目前場景一致。 */
  toon: boolean;
  /** 每個角色隨機的明暗與色調變化（0 為不變）。 */
  tintVariance: number;
}

export const MODEL_CONFIG: Record<CharacterKind, ModelConfig> = {
  player: { height: 1.8, yawOffsetDeg: 0, walkSpeed: null, runSpeed: null, runThreshold: 2.2, toon: true, tintVariance: 0 },
  zombie: {
    height: 1.8,
    yawOffsetDeg: 0,
    walkSpeed: null,
    runSpeed: null,
    // 遊戲中的喪屍約每秒 2 公尺，比拖步快很多，所以幾乎都播跑步動作（放慢播放）
    runThreshold: 0.9,
    // Quaternius 的 ZombieBite 長 5 秒，前段是撲上去，後段是原地啃咬；攻擊只取撲上去的部分
    clipRanges: { attack: [0.2, 1.5] },
    toon: true,
    tintVariance: 0.18,
  },
};

/** 持槍瞄準姿勢下，從右手到槍口的距離（暫用手槍）。 */
export const PISTOL = { forward: 0.24, up: 0.05 };

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
  /**
   * 上下半身分層：上半身固定播放瞄準姿勢，下半身播放移動動作。
   * 只有主角、而且模型有瞄準姿勢時啟用。
   */
  layered: boolean;
  /** 走路、跑步動作的設計速度（量測或設定值）。 */
  speeds: { walk: number; run: number };
  /** 瞄準姿勢下槍口相對角色的位置（左右、高度、前後），用來讓子彈與畫面上的槍一致。 */
  muzzle?: { side: number; height: number; forward: number };
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

const LOCO_ROLES: ClipRole[] = ['idle', 'walk', 'run', 'walkBack', 'strafeLeft', 'strafeRight'];

/** 依動畫名稱辨識動作用途。回傳每種用途對應的動畫名稱。 */
export function detectClipRoles(names: readonly string[], overrides: Partial<Record<ClipRole, string>> = {}): Partial<Record<ClipRole, string>> {
  const rules: Record<ClipRole, { want: string[]; avoid: string[] }> = {
    idle: { want: ['idlegun', 'gunidle', 'rifleidle', 'idleaim', 'idleshoot', 'zombieidle', 'idle', 'standing', 'breath'], avoid: ['crouch', 'sit', 'pointing'] },
    walk: { want: ['zombiewalk', 'walkgun', 'gunwalk', 'riflewalk', 'walking', 'walk'], avoid: ['back', 'jump', 'crouch', 'left', 'right', 'strafe'] },
    run: { want: ['zombierun', 'rungun', 'gunrun', 'riflerun', 'running', 'run', 'sprint', 'jog'], avoid: ['back', 'jump', 'crouch', 'left', 'right', 'strafe', 'shoot'] },
    walkBack: { want: ['runback', 'walkback', 'walkingback', 'backward', 'backwards'], avoid: ['jump'] },
    strafeLeft: { want: ['runleft', 'strafeleft', 'walkleft', 'leftstrafe'], avoid: ['kick', 'punch', 'turn', 'slash'] },
    strafeRight: { want: ['runright', 'straferight', 'walkright', 'rightstrafe'], avoid: ['kick', 'punch', 'turn', 'slash'] },
    aim: { want: ['idlegunpointing', 'gunpointing', 'pointing', 'idleaim', 'aiming', 'riflaim', 'idlegunshoot'], avoid: [] },
    death: { want: ['death', 'dying', 'die', 'dead', 'killed'], avoid: [] },
    attack: { want: ['zombieattack', 'attack', 'bite', 'punch', 'swipe', 'slash'], avoid: ['react', 'receive', 'recieve'] },
    hit: { want: ['hitreact', 'hitreaction', 'hitreceive', 'hitrecieve', 'receivehit', 'recievehit', 'gethit', 'damage', 'hurt'], avoid: [] },
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
      // 同一個關鍵字有多個符合時，取名稱最短的（例如 Idle_Gun 優先於 Idle_Gun_Shoot）
      const hits = normalized.filter(({ k }) => k.includes(w) && !avoid.some((a) => k.includes(a)));
      if (hits.length) {
        out[role] = hits.reduce((a, b) => (b.k.length < a.k.length ? b : a)).n;
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

/** 只保留指定骨頭的關鍵影格（上下半身分層用）。 */
function filterClip(clip: THREE.AnimationClip, keep: (node: string) => boolean, suffix: string): THREE.AnimationClip {
  const tracks = clip.tracks.filter((t) => keep(THREE.PropertyBinding.parseTrackName(t.name).nodeName));
  return new THREE.AnimationClip(clip.name + suffix, clip.duration, tracks);
}

/**
 * 量測原地動作的設計移動速度：腳著地時相對身體往後滑的速度（取中位數）。
 * 在模型的複本上量，不影響原本的姿勢。
 */
export function measureClipSpeed(scene: THREE.Object3D, clip: THREE.AnimationClip, scale: number): number | null {
  const model = cloneSkinned(scene);
  const feet: THREE.Object3D[] = [];
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone && /^(foot\.?[lr]|leftfoot|rightfoot|footleft|footright|[lr]foot)$/i.test(o.name)) feet.push(o);
  });
  if (feet.length < 2) return null;
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  const N = 120;
  const dt = clip.duration / N;
  const tracks = feet.map(() => [] as THREE.Vector3[]);
  for (let i = 0; i <= N; i++) {
    mixer.setTime(i * dt);
    model.updateMatrixWorld(true);
    feet.forEach((f, k) => tracks[k].push(f.getWorldPosition(new THREE.Vector3()).multiplyScalar(scale)));
  }
  const speeds: number[] = [];
  for (const pts of tracks) {
    const minY = Math.min(...pts.map((p) => p.y));
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].y < minY + 0.03 && pts[i - 1].y < minY + 0.03) {
        speeds.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) / dt);
      }
    }
  }
  mixer.uncacheRoot(model);
  if (speeds.length < 4) return null;
  speeds.sort((a, b) => a - b);
  const v = speeds[Math.floor(speeds.length / 2)];
  return v > 0.05 ? v : null;
}

/** 在瞄準姿勢下量出右手位置，換算成槍口相對角色的位置。 */
function measureMuzzle(
  scene: THREE.Object3D,
  aim: THREE.AnimationClip,
  handName: string,
  scale: number,
  offset: THREE.Vector3,
  yawDeg: number,
): { side: number; height: number; forward: number } | undefined {
  const model = cloneSkinned(scene);
  const holder = new THREE.Group();
  holder.scale.setScalar(scale);
  holder.position.copy(offset);
  const yawFix = new THREE.Group();
  yawFix.rotation.y = THREE.MathUtils.degToRad(yawDeg);
  yawFix.add(holder);
  holder.add(model);
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(aim).play();
  mixer.setTime(0);
  yawFix.updateMatrixWorld(true);
  const hand = model.getObjectByName(handName);
  // 先讀位置再釋放動畫：釋放時 three.js 會把骨頭還原成原始姿勢
  const p = hand?.getWorldPosition(new THREE.Vector3());
  mixer.uncacheRoot(model);
  if (!p) return undefined;
  return { side: p.x, height: p.y + PISTOL.up, forward: p.z + PISTOL.forward };
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
    let clip = clips.find((c) => c.name === name);
    const range = config.clipRanges?.[role];
    if (clip && range) {
      const fps = 30;
      clip = THREE.AnimationUtils.subclip(clip, `${clip.name}#${role}`, Math.round(range[0] * fps), Math.round(range[1] * fps), fps);
    }
    if (clip) roles[role] = clip;
  }
  const boneNames: string[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) boneNames.push(o.name);
  });
  const bones = detectBones(boneNames);

  const measuredWalk = roles.walk ? measureClipSpeed(scene, roles.walk, scale) : null;
  const measuredRun = roles.run ? measureClipSpeed(scene, roles.run, scale) : null;
  const speeds = {
    walk: config.walkSpeed ?? measuredWalk ?? 1.4,
    run: config.runSpeed ?? measuredRun ?? 3.5,
  };

  // 主角有瞄準姿勢時：上半身（脊椎以上）播瞄準，下半身播移動
  let layered = false;
  let muzzle: CharacterTemplate['muzzle'];
  const spineObj = bones.spine ? scene.getObjectByName(bones.spine) : undefined;
  if (kind === 'player' && roles.aim && spineObj && bones.handR) {
    const upper = new Set<string>();
    spineObj.traverse((o) => upper.add(o.name));
    for (const role of LOCO_ROLES) {
      const clip = roles[role];
      if (clip) roles[role] = filterClip(clip, (n) => !upper.has(n), '#lower');
    }
    muzzle = measureMuzzle(scene, roles.aim, bones.handR, scale, offset, config.yawOffsetDeg);
    roles.aim = filterClip(roles.aim, (n) => upper.has(n), '#upper');
    layered = true;
  }

  return {
    kind,
    fileName: file.name,
    config,
    scene,
    clips,
    roles,
    scale,
    offset,
    bones,
    hasGunPose: clips.some((c) => /gun|rifle|pistol|shoot|aim/i.test(c.name)),
    layered,
    speeds,
    muzzle,
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
