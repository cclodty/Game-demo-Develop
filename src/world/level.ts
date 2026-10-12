import * as THREE from 'three';
import type { Box } from './collision';
import { Textures } from '../render/textures';
import { boxWorldUV, floorPlane, makeFadeable, toon } from '../render/materials';
import { Rng } from '../util/math';

/**
 * MAP-01 操作測試場（暫用）。約 48×36 公尺，全部在同一地面。
 * 西側為住屋室內、中央為街道、東北為窄巷與建築、東側為試射場。
 * 所有物件由少數可拼接的方塊組成，視覺邊界與碰撞、子彈阻擋一致。
 */

export type Kind =
  | 'wallOuter'
  | 'wall'
  | 'building'
  | 'container'
  | 'containerRed'
  | 'crate'
  | 'crateTall'
  | 'car'
  | 'shelf'
  | 'fridge'
  | 'counter'
  | 'table'
  | 'sofa'
  | 'barrier'
  | 'pole'
  | 'barrel'
  | 'tree';

export interface LevelBox extends Box {
  kind: Kind;
  id: number;
}

export interface FadeGroup {
  box: LevelBox;
  fade: { value: number };
  target: number;
  meshes: THREE.Mesh[];
}

export interface FlickerLight {
  light: THREE.PointLight;
  base: number;
  phase: number;
  kind: 'fire' | 'lamp';
  fireOrigin?: THREE.Vector3;
}

export interface Level {
  group: THREE.Group;
  boxes: LevelBox[];
  fadeGroups: FadeGroup[];
  flickerLights: FlickerLight[];
  fireOrigins: THREE.Vector3[];
  spawnPoints: { x: number; z: number }[];
  ammoSpots: { x: number; z: number }[];
  medSpots: { x: number; z: number }[];
  dummySpots: { x: number; z: number }[];
  playerStart: { x: number; z: number; yaw: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** 以兩個角落座標描述的方塊：(x0, z0)–(x1, z1)，高度 h。 */
type Def = [x0: number, z0: number, x1: number, z1: number, h: number, kind: Kind];

const LAYOUT: Def[] = [
  // 外圍：北、西、東為高牆；南側為矮的混凝土護欄，減少鏡頭前方的遮擋。
  [-24.3, -18.3, 24.3, -17.7, 2.8, 'wallOuter'],
  [-24.3, 17.7, 24.3, 18.3, 0.9, 'barrier'],
  [-24.3, -17.7, -23.7, 17.7, 2.8, 'wallOuter'],
  [23.7, -17.7, 24.3, 17.7, 2.8, 'wallOuter'],

  // 西側住屋（室內 x -23.7..-12, z -6..10），三個出入口。
  [-23.7, -6.15, -19.2, -5.85, 2.6, 'wall'],
  [-17.4, -6.15, -11.85, -5.85, 2.6, 'wall'],
  [-12.15, -6.15, -11.85, 0.6, 2.6, 'wall'],
  [-12.15, 2.6, -11.85, 10.15, 2.6, 'wall'],
  [-23.7, 9.85, -19.2, 10.15, 2.6, 'wall'],
  [-17.2, 9.85, -11.85, 10.15, 2.6, 'wall'],
  [-18.15, -5.85, -17.85, -1.2, 2.6, 'wall'],
  // 室內家具：高的擋子彈，矮的只擋移動。
  [-23.7, -5.2, -23.05, -1.6, 2.0, 'shelf'],
  [-14.0, -5.85, -13.05, -5.05, 1.9, 'fridge'],
  [-17.6, -5.85, -15.0, -5.25, 0.95, 'counter'],
  [-21.6, 1.4, -19.6, 2.6, 0.78, 'table'],
  [-16.6, 6.6, -13.6, 7.45, 0.75, 'sofa'],
  [-23.7, 5.0, -23.05, 8.8, 2.0, 'shelf'],

  // 中央街道
  [-5.95, 0.9, -4.05, 5.1, 1.5, 'car'],
  [0.4, -8.95, 4.6, -7.05, 1.5, 'car'],
  [-9.65, -9.15, -9.35, -8.85, 4.2, 'pole'],
  [6.35, 6.85, 6.65, 7.15, 4.2, 'pole'],
  [-1.85, -4.35, -1.15, -3.65, 1.0, 'barrel'],
  [2.15, 12.15, 2.85, 12.85, 1.0, 'barrel'],
  [-4.0, -16.2, 3.0, -13.8, 2.6, 'container'],
  [-9.0, 13.0, -5.5, 13.6, 0.85, 'barrier'],
  [4.0, 2.0, 4.6, 5.5, 0.85, 'barrier'],
  [-8.0, -2.0, -7.1, -1.1, 0.9, 'crate'],
  [-7.1, -2.0, -6.2, -1.1, 0.9, 'crate'],
  [6.0, -3.0, 6.9, -2.1, 0.9, 'crate'],
  [7.0, 10.0, 8.4, 11.4, 1.9, 'crateTall'],

  // 東北建築，中間留 1.4 公尺窄巷
  [10.0, -17.7, 15.3, -8.5, 3.4, 'building'],
  [16.7, -17.7, 23.7, -8.5, 3.4, 'building'],

  // 東側試射場：矮箱可越過射擊，高貨櫃會擋子彈
  [9.8, -1.0, 10.2, 5.0, 0.9, 'barrier'],
  [14.0, 2.0, 14.9, 2.9, 0.9, 'crate'],
  [14.0, 7.5, 14.9, 8.4, 0.9, 'crate'],
  [14.0, 12.0, 14.9, 12.9, 0.9, 'crate'],
  [16.5, -5.5, 18.9, 0.5, 2.6, 'containerRed'],

  // 西北空地的枯樹
  [-19.18, -12.18, -18.82, -11.82, 3.0, 'tree'],
  [-14.68, -15.18, -14.32, -14.82, 3.0, 'tree'],
];

export const LEVEL_DATA = {
  spawnPoints: [
    { x: -18, z: -15 },
    { x: -0.5, z: -16.8 },
    { x: 16, z: -16.6 },
    { x: 22.5, z: 16.4 },
    { x: -22, z: 16.2 },
  ],
  ammoSpots: [
    { x: -21, z: 8 },
    { x: 12, z: 15 },
    { x: 0.5, z: -1.5 },
  ],
  medSpots: [{ x: -15, z: -3 }],
  dummySpots: [
    { x: 21, z: 3 },
    { x: 21, z: 8 },
    { x: 21, z: 13 },
  ],
  playerStart: { x: -3, z: 9, yaw: Math.PI },
  bounds: { minX: -24.3, maxX: 24.3, minZ: -18.3, maxZ: 18.3 },
};

/** 只建立碰撞資料（單元測試與尋路用，不需要 WebGL）。 */
export function buildColliders(): LevelBox[] {
  return LAYOUT.map(([x0, z0, x1, z1, h, kind], id) => ({
    minX: Math.min(x0, x1),
    maxX: Math.max(x0, x1),
    minZ: Math.min(z0, z1),
    maxZ: Math.max(z0, z1),
    height: h,
    kind,
    id,
  }));
}

const FADE_MIN_HEIGHT = 1.6;

export function buildLevel(): Level {
  const group = new THREE.Group();
  group.name = 'level';
  const boxes = buildColliders();
  const fadeGroups: FadeGroup[] = [];
  const flickerLights: FlickerLight[] = [];
  const fireOrigins: THREE.Vector3[] = [];
  const rng = new Rng(7);

  buildFloors(group);

  for (const b of boxes) {
    const meshes = buildBoxVisual(b, group, flickerLights, fireOrigins, rng);
    if (b.height >= FADE_MIN_HEIGHT && b.kind !== 'pole' && b.kind !== 'wallOuter') {
      const fade = { value: 0 };
      for (const m of meshes) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const cloned = mats.map((mat) => {
          const c = mat.clone();
          makeFadeable(c, fade);
          return c;
        });
        m.material = Array.isArray(m.material) ? cloned : cloned[0];
      }
      fadeGroups.push({ box: b, fade, target: 0, meshes });
    }
  }

  buildDecor(group, rng);

  return {
    group,
    boxes,
    fadeGroups,
    flickerLights,
    fireOrigins,
    spawnPoints: LEVEL_DATA.spawnPoints,
    ammoSpots: LEVEL_DATA.ammoSpots,
    medSpots: LEVEL_DATA.medSpots,
    dummySpots: LEVEL_DATA.dummySpots,
    playerStart: LEVEL_DATA.playerStart,
    bounds: LEVEL_DATA.bounds,
  };
}

function addMesh(
  group: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
  cast = true,
  receive = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  group.add(m);
  return m;
}

function buildFloors(group: THREE.Group): void {
  const dirt = toon({ map: Textures.dirt() });
  const asphalt = toon({ map: Textures.asphalt() });
  asphalt.userData.dioramaTint = 0xfff0de;
  const sidewalk = toon({ map: Textures.sidewalk() });
  const concrete = toon({ map: Textures.concrete() });
  const wood = toon({ map: Textures.wood() });

  // 大地面延伸到場外，畫面邊緣不會露出背景。
  addMesh(group, floorPlane(-60, -50, 60, 50, 2), dirt, false, true);
  const layers: [number, number, number, number, THREE.Material, number][] = [
    [-10.5, -17.7, 8.5, 17.7, asphalt, 4],
    [-11.85, -17.7, -10.5, 17.7, sidewalk, 2],
    [8.5, -8.5, 9.85, 17.7, sidewalk, 2],
    [9.85, -8.5, 23.7, 17.7, concrete, 2],
    [-23.7, -6, -11.85, 10, wood, 2],
  ];
  layers.forEach(([x0, z0, x1, z1, mat, tile], i) => {
    const m = addMesh(group, floorPlane(x0, z0, x1, z1, tile), mat, false, true);
    m.position.y = 0.004 + i * 0.002;
  });

  // 道路中線（褪色的虛線）與試射場距離標線
  const paint = new THREE.MeshBasicMaterial({ color: 0x8a7a3e });
  const paintGeo = new THREE.PlaneGeometry(0.16, 1.6);
  paintGeo.rotateX(-Math.PI / 2);
  for (let z = -16; z <= 16; z += 3.2) {
    const m = new THREE.Mesh(paintGeo, paint);
    m.position.set(-1, 0.02, z);
    m.receiveShadow = false;
    group.add(m);
  }
  const lineMat = new THREE.MeshBasicMaterial({ color: 0x7c7f73 });
  for (const x of [16, 11]) {
    const g = new THREE.PlaneGeometry(0.12, 15);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, lineMat);
    m.position.set(x, 0.022, 8);
    group.add(m);
  }
}

function sideTopMaterials(side: THREE.Material, top: THREE.Material): THREE.Material[] {
  return [side, side, top, top, side, side];
}

function buildBoxVisual(
  b: LevelBox,
  group: THREE.Group,
  lights: FlickerLight[],
  fires: THREE.Vector3[],
  rng: Rng,
): THREE.Mesh[] {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const h = b.height;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const meshes: THREE.Mesh[] = [];
  const box = (
    bw: number,
    bh: number,
    bd: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material | THREE.Material[],
    tile = 2,
  ) => {
    const m = addMesh(group, boxWorldUV(bw, bh, bd, x, y, z, tile), mat);
    m.position.set(x, y, z);
    meshes.push(m);
    return m;
  };

  switch (b.kind) {
    case 'wallOuter':
      box(w, h, d, cx, h / 2, cz, sideTopMaterials(toon({ map: Textures.brick() }), toon({ map: Textures.wallTop() })));
      break;
    case 'wall':
      box(w, h, d, cx, h / 2, cz, sideTopMaterials(toon({ map: Textures.plaster() }), toon({ map: Textures.wallTop() })));
      break;
    case 'building': {
      const facade = toon({ map: Textures.facade(), emissiveMap: Textures.facadeGlow(), emissive: 0xffffff, emissiveIntensity: 1.4 });
      // 夜晚才亮的窗戶（白天由遊戲把自發光關掉）
      facade.userData.nightWindows = true;
      box(w, h, d, cx, h / 2, cz, sideTopMaterials(facade, toon({ map: Textures.roof() })), 4);
      // 屋頂邊緣與冷氣機，讓俯視時有層次
      const trim = toon({ color: 0x3a3836 });
      box(w, 0.25, 0.25, cx, h + 0.12, b.maxZ - 0.12, trim);
      const ac = toon({ color: 0x6d706f });
      box(1.0, 0.6, 0.8, cx - w * 0.2, h + 0.3, cz - 1, ac);
      break;
    }
    case 'container':
    case 'containerRed': {
      const metal = toon({ map: b.kind === 'container' ? Textures.metal() : Textures.metalRed() });
      box(w, h, d, cx, h / 2, cz, sideTopMaterials(metal, toon({ color: b.kind === 'container' ? 0x3b4d52 : 0x55302a })));
      break;
    }
    case 'crate':
      meshes.push(addCrate(group, w, h, d, cx, cz, 0));
      break;
    case 'crateTall':
      meshes.push(addCrate(group, w, h * 0.5, d, cx, cz, 0));
      meshes.push(addCrate(group, w * 0.8, h * 0.5, d * 0.8, cx + 0.05, cz - 0.05, h * 0.5));
      break;
    case 'car':
      buildCar(b, group, meshes, rng);
      break;
    case 'shelf':
      box(w, h, d, cx, h / 2, cz, sideTopMaterials(toon({ map: Textures.shelf() }), toon({ color: 0x2d2016 })), 1);
      break;
    case 'fridge':
      box(w, h, d, cx, h / 2, cz, toon({ color: 0xb9b8ae }));
      break;
    case 'counter':
      box(w, h, d, cx, h / 2, cz, sideTopMaterials(toon({ color: 0x4d4135 }), toon({ color: 0x7c776c })));
      break;
    case 'table':
      box(w, 0.08, d, cx, h - 0.04, cz, toon({ map: Textures.wood() }));
      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        box(0.08, h - 0.08, 0.08, cx + dx * (w / 2 - 0.1), (h - 0.08) / 2, cz + dz * (d / 2 - 0.1), toon({ color: 0x3a2a1c }));
      }
      break;
    case 'sofa': {
      const fabric = toon({ map: Textures.fabric() });
      box(w, h * 0.55, d, cx, h * 0.275, cz, fabric);
      box(w, h * 0.5, 0.22, cx, h * 0.75, b.minZ + 0.11, fabric);
      break;
    }
    case 'barrier':
      box(w, h, d, cx, h / 2, cz, sideTopMaterials(toon({ map: Textures.hazard() }), toon({ map: Textures.concrete() })), 1);
      break;
    case 'pole': {
      const metal = toon({ color: 0x2f3236 });
      box(w, h, d, cx, h / 2, cz, metal);
      const armDir = cx < 0 ? 1 : -1;
      box(1.2, 0.1, 0.12, cx + armDir * 0.55, h - 0.05, cz, metal);
      const lamp = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
      lamp.userData.lampHead = true;
      const head = box(0.42, 0.14, 0.26, cx + armDir * 1.1, h - 0.16, cz, lamp);
      head.castShadow = false;
      const light = new THREE.PointLight(0xffb36b, 34, 13, 1.6);
      light.position.set(cx + armDir * 1.1, h - 0.45, cz);
      group.add(light);
      lights.push({ light, base: 34, phase: rng.range(0, 10), kind: 'lamp' });
      break;
    }
    case 'barrel': {
      const geo = new THREE.CylinderGeometry(w / 2, w / 2 * 0.92, h, 10, 1);
      const m = addMesh(group, geo, toon({ map: Textures.barrel() }));
      m.position.set(cx, h / 2, cz);
      meshes.push(m);
      const origin = new THREE.Vector3(cx, h + 0.05, cz);
      fires.push(origin);
      const light = new THREE.PointLight(0xff7a2a, 22, 10, 1.5);
      light.position.set(cx, h + 0.7, cz);
      group.add(light);
      lights.push({ light, base: 22, phase: rng.range(0, 10), kind: 'fire', fireOrigin: origin });
      // 燒焦痕跡
      const scorch = new THREE.Mesh(
        new THREE.CircleGeometry(1.1, 12).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x15120f, transparent: true, opacity: 0.55 }),
      );
      scorch.position.set(cx, 0.03, cz);
      group.add(scorch);
      break;
    }
    case 'tree': {
      const bark = toon({ color: 0x2d241c });
      box(w, h, d, cx, h / 2, cz, bark);
      const branches: [number, number, number, number][] = [
        [0.9, 2.2, 0.6, 0.5],
        [-0.8, 2.5, -0.3, -0.6],
        [0.2, 2.8, -0.9, 0.3],
        [-0.5, 1.8, 0.7, -0.4],
      ];
      for (const [bx, by, bz, rot] of branches) {
        const len = Math.hypot(bx, bz);
        const m = box(0.12, 0.12, len, cx + bx / 2, by, cz + bz / 2, bark);
        m.rotation.y = Math.atan2(bx, bz);
        m.rotation.x = rot * 0.4;
      }
      break;
    }
  }
  return meshes;
}

function addCrate(group: THREE.Group, w: number, h: number, d: number, cx: number, cz: number, y0: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon({ map: Textures.crate() }));
  m.position.set(cx, y0 + h / 2, cz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function buildCar(b: LevelBox, group: THREE.Group, meshes: THREE.Mesh[], rng: Rng): void {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  const alongZ = d > w;
  const len = alongZ ? d : w;
  const wid = alongZ ? w : d;
  const car = new THREE.Group();
  car.position.set(cx, 0, cz);
  if (!alongZ) car.rotation.y = Math.PI / 2;
  group.add(car);
  const paint = toon({ color: rng.pick([0x5b6e7a, 0x7a4d3f, 0x6a6a5c]) });
  const dark = toon({ color: 0x1b1c1f });
  const glass = toon({ color: 0x27323d, emissive: 0x0c1218 });
  const add = (bw: number, bh: number, bd: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    car.add(m);
    meshes.push(m);
    return m;
  };
  add(wid - 0.05, 0.62, len - 0.05, 0, 0.62, 0, paint);
  add(wid - 0.2, 0.5, len * 0.48, 0, 1.18, -len * 0.04, glass);
  add(wid - 0.24, 0.06, len * 0.44, 0, 1.45, -len * 0.04, paint);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(0.22, 0.5, 0.62, sx * (wid / 2 - 0.08), 0.25, sz * (len / 2 - 0.75), dark);
    }
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x5e5a4a });
  const tail = new THREE.MeshBasicMaterial({ color: 0x5a1a16 });
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), lightMat);
    hl.position.set(sx * (wid / 2 - 0.3), 0.75, len / 2 - 0.01);
    car.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), tail);
    tl.position.set(sx * (wid / 2 - 0.3), 0.75, -len / 2 + 0.01);
    car.add(tl);
  }
}

function buildDecor(group: THREE.Group, rng: Rng): void {
  // 不參與碰撞的小物件：垃圾袋、紙張、碎片，增加末日街頭的質感。
  const bagMat = toon({ color: 0x1f2326 });
  const paperMat = toon({ color: 0x5d5a52 });
  const debrisMat = toon({ color: 0x4a4744 });
  const spots: [number, number][] = [
    [-10.9, -12],
    [-11.2, -11.3],
    [8.9, 9.2],
    [9.1, -5],
    [-10.8, 6],
  ];
  for (const [x, z] of spots) {
    const s = rng.range(0.35, 0.5);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), bagMat);
    m.position.set(x, s * 0.4, z);
    m.rotation.y = rng.range(0, 3);
    m.castShadow = true;
    group.add(m);
  }
  const paperGeo = new THREE.PlaneGeometry(0.28, 0.2).rotateX(-Math.PI / 2);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(paperGeo, paperMat);
    m.receiveShadow = true;
    m.position.set(rng.range(-11, 9), 0.025, rng.range(-17, 17));
    m.rotation.y = rng.range(0, 6);
    group.add(m);
  }
  for (let i = 0; i < 14; i++) {
    const s = rng.range(0.12, 0.3);
    const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.5, s * 1.3), debrisMat);
    m.position.set(rng.range(-11, 9), s * 0.25, rng.range(-17, 17));
    m.rotation.y = rng.range(0, 6);
    m.castShadow = true;
    group.add(m);
  }
}
