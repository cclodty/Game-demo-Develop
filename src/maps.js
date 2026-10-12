// Map data. Every map lists its cover as [x, z, width, depth, height, material]
// (x right, z toward the camera), plus glass, barrels, pans, weapon pads and
// spawn points. `decorate` adds the non-colliding scenery and animations.

import * as THREE from 'three';
import { helipadTexture, neonSignTexture, windowTexture } from './textures.js';
import { rand, TAU } from './utils.js';

// ------------------------------------------------------------ scenery helpers

function plane(L, w, h, mat) {
  return new THREE.Mesh(L.own(new THREE.PlaneGeometry(w, h)), mat);
}

function sign(L, lines, w, h, x, y, z, ry = 0, brightness = 2.2, texW = 1024, texH = 256) {
  const mat = L.own(
    new THREE.MeshBasicMaterial({
      map: L.own(neonSignTexture(lines, texW, texH)),
      color: new THREE.Color(brightness, brightness, brightness),
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    }),
  );
  const m = plane(L, w, h, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  return L.add(m);
}

const DISPLAY = 'bold 64px "Bebas Neue", Impact, sans-serif';
const HAN = (px) => `bold ${px}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;

/** Lit-window towers around (and far below) the arena. */
function cityBackdrop(L, { facade = true, keepOut = [36, 28] } = {}) {
  const { halfW, halfD } = L.bounds;
  if (facade) {
    const tex = L.own(windowTexture(0.28));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 2);
    const facadeMesh = new THREE.Mesh(
      L.own(new THREE.BoxGeometry(halfW * 2 + 1.2, 80, halfD * 2 + 1.2).translate(0, -40.02, 0)),
      L.own(new THREE.MeshStandardMaterial({ color: 0x15141c, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.2, roughness: 0.9 })),
    );
    L.add(facadeMesh);
  }
  const tex = L.own(windowTexture(0.32));
  const mat = L.own(new THREE.MeshStandardMaterial({ color: 0x14131c, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.5, roughness: 0.9 }));
  const geo = L.own(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const spots = [];
  for (let gx = -7; gx <= 7; gx++) {
    for (let gz = -7; gz <= 5; gz++) {
      const x = gx * 15 + rand(-4, 4);
      const z = gz * 15 + rand(-4, 4);
      if (Math.abs(x) < keepOut[0] && Math.abs(z) < keepOut[1]) continue;
      if (Math.random() < 0.2) continue;
      const tall = z < -40 && Math.random() < 0.5;
      spots.push([x, z, rand(7, 13), rand(7, 13), tall ? rand(5, 35) : rand(-45, -6)]);
    }
  }
  const city = L.own(new THREE.InstancedMesh(geo, mat, spots.length));
  const m = new THREE.Matrix4();
  spots.forEach(([x, z, w, d, top], i) => {
    m.makeScale(w, top + 90, d);
    m.setPosition(x, -90, z);
    city.setMatrixAt(i, m);
  });
  L.add(city);
}

// -------------------------------------------------------------------- maps

const rooftop = {
  id: 'rooftop',
  name: '霓虹天台',
  en: 'NEON ROOFTOP',
  desc: '雨夜的天台：直升機坪、玻璃溫室和一排排油桶。',
  color: '#ff3fa4',
  size: [22, 15],
  start: [0, 4],
  theme: {
    bg: 0x0a0816,
    fog: [0x0d0a1c, 0.011],
    hemi: [0x8c80ff, 0x1c1020, 1.1],
    moon: [0xc4d2ff, 1.6],
    points: [
      [0xff3fa4, 0, 3.5, -16.5, 90, 34],
      [0x3fe6ff, -23, 2.5, 6, 60, 26],
      [0x3fe6ff, 23, 2.5, 6, 60, 26],
      [0xffa040, 0, 4, 16.5, 50, 26],
    ],
    rain: true,
  },
  floor: 'concrete',
  edges: { n: [1, 'parapet', 'neonPink'], s: [0.8, 'parapet', 'neonCyan'], w: [1, 'parapet', 'neonCyan'], e: [1, 'parapet', 'neonCyan'] },
  solids: [
    [-7.5, -5, 2, 2, 1.7, 'crate'],
    [-5.9, -5.6, 1.2, 1.2, 1.1, 'crate'],
    [7.5, -5, 2, 2, 1.7, 'crate'],
    [9.1, -4.4, 1.2, 1.2, 1.1, 'crate'],
    [-18, 10, 1.6, 1.6, 1.4, 'crate'],
    [18, 10, 1.6, 1.6, 1.4, 'crate'],
    [-2.5, 11.5, 1.4, 1.4, 1.3, 'crate'],
    [0, -8, 7, 0.6, 1.25, 'concrete'],
    [-10.5, 9, 0.6, 4.5, 1.25, 'concrete'],
    [10.5, 9, 0.6, 4.5, 1.25, 'concrete'],
    [-4.5, 2.5, 1, 1, 3.4, 'pillar'],
    [4.5, 2.5, 1, 1, 3.4, 'pillar'],
    [-14, 4, 2.8, 1.8, 1.5, 'unit'],
    [14, 4, 2.8, 1.8, 1.5, 'unit'],
    [-17, -6, 1.4, 1.4, 1.0, 'unit'],
    [17, -6, 1.4, 1.4, 1.0, 'unit'],
    [-13, -13.5, 4, 3, 2.9, 'hut'],
    [13, -13.5, 4, 3, 2.9, 'hut'],
  ],
  glass: [
    [0, -12.4, 6, 0.25, 1.9],
    [-19.5, -2.5, 0.25, 4, 1.9],
    [19.5, -2.5, 0.25, 4, 1.9],
    [0, 7, 5, 0.25, 1.9],
  ],
  barrels: [[-6, -3.4], [11.8, 6.2], [-12, -2], [3.5, -10], [-19.5, 13], [5.2, 12.4], [15.5, -9.5]],
  pans: [[-2.5, -1.5], [2.5, -1.5], [-12.5, -8.5], [12.5, -8.5], [-16, 7], [16, 7]],
  pads: [[-9, 1], [9, 1]],
  spawns: [
    { x: -13, z: -11.4, ex: -13, ez: -9.2, kind: 'door' },
    { x: 13, z: -11.4, ex: 13, ez: -9.2, kind: 'door' },
    { x: -21.4, z: 3.5, ex: -18.6, ez: 3.5, kind: 'ledge' },
    { x: 21.4, z: 3.5, ex: 18.6, ez: 3.5, kind: 'ledge' },
    { x: 7.5, z: 14.4, ex: 7.5, ez: 11.6, kind: 'ledge' },
  ],
  decorate(L) {
    const pad = new THREE.Mesh(
      L.own(new THREE.PlaneGeometry(8.5, 8.5)),
      L.own(new THREE.MeshStandardMaterial({ map: L.own(helipadTexture()), transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.005, -1.5);
    pad.receiveShadow = true;
    L.add(pad);

    cityBackdrop(L);

    sign(
      L,
      [
        { text: '子彈芭蕾', font: HAN(112), color: '#ff3fa4', y: 96 },
        { text: 'BULLET  BALLET', font: DISPLAY, color: '#3fe6ff', y: 200 },
      ],
      13,
      3.25,
      0,
      2.6,
      -16.6,
    );
    L.deco(0, 0.8, -16.75, 13.4, 3.6, 0.15, L.mat.darkMetal);
    for (const x of [-5, 5]) L.deco(x, -0.2, -16.75, 0.2, 1.2, 0.2, L.mat.darkMetal);

    for (const [x, z] of [[-21.4, -14.4], [21.4, -14.4], [-21.4, 14.4], [21.4, 14.4]]) {
      L.deco(x, 0, z, 0.18, 4.2, 0.18, L.mat.darkMetal, true);
      L.deco(x, 4.2, z, 0.6, 0.12, 0.3, L.mat.neonCyan);
    }
  },
};

const club = {
  id: 'club',
  name: '脈衝夜店',
  en: 'CLUB PULSE',
  desc: '跟著節拍閃爍的舞池、吧枱後的一整排酒瓶，和一顆鏡面球。',
  color: '#9b6bff',
  size: [20, 14],
  start: [0, 6.5],
  theme: {
    bg: 0x07040c,
    fog: [0x0a0612, 0.006],
    hemi: [0x7a4aa0, 0x120a1c, 0.95],
    moon: [0xb090ff, 0.55],
    points: [
      [0xff3fa4, -7, 4, -3, 70, 22],
      [0x3fe6ff, 7, 4, -3, 70, 22],
      [0xffa040, 0, 4, 9.5, 70, 22],
      [0x9b6bff, -12, 4.5, -11, 60, 20],
    ],
    rain: false,
  },
  floor: 'club',
  edges: { n: [3.2, 'clubWall', 'neonPink'], s: [0.9, 'clubWall', 'neonCyan'], w: [3.2, 'clubWall', 'neonCyan'], e: [3.2, 'clubWall', 'neonCyan'] },
  solids: [
    [-12, -10.2, 10, 1.2, 1.2, 'bar'],
    [6, -10, 4, 1.6, 1.3, 'dj'],
    [2.6, -10.6, 1.2, 1.2, 2.2, 'speaker'],
    [9.4, -10.6, 1.2, 1.2, 2.2, 'speaker'],
    [-8.5, -5.5, 1, 1, 3.2, 'pillar'],
    [8.5, -5.5, 1, 1, 3.2, 'pillar'],
    [-8.5, 5, 1, 1, 3.2, 'pillar'],
    [8.5, 5, 1, 1, 3.2, 'pillar'],
    [17.6, -4, 1.4, 4.4, 0.9, 'sofa'],
    [17.6, 4, 1.4, 4.4, 0.9, 'sofa'],
    [15.4, -4, 1, 1.2, 0.8, 'table'],
    [15.4, 4, 1, 1.2, 0.8, 'table'],
    [-17.6, 3, 1.4, 5, 0.9, 'sofa'],
    [-15.4, 3, 1, 1.2, 0.8, 'table'],
    [-4.5, 10, 1.3, 1.3, 1.7, 'speaker'],
    [4.5, 10, 1.3, 1.3, 1.7, 'speaker'],
    [-13.5, 9, 0.5, 4, 1.2, 'bar'],
    [13.5, 9.5, 0.5, 3, 1.2, 'bar'],
  ],
  glass: [
    [-12, -13.3, 9, 0.35, 1.9],
    [-11.5, 3, 0.25, 6, 1.9],
    [12, 0, 0.25, 3.5, 1.9],
  ],
  barrels: [[-5.5, -12.2, 'gas'], [12.5, -12, 'gas'], [11.5, 12], [-17.5, 12], [17.5, -11.5]],
  pans: [[-3, -1.5, 'tray'], [3, -1.5, 'tray'], [0, 4, 'tray'], [-15, -7, 'tray'], [15, -8.5, 'tray'], [-2.5, 12, 'tray']],
  pads: [[-3, 7.5], [13, -3.5]],
  spawns: [
    { x: -3, z: -13.4, ex: -3, ez: -11.2, kind: 'door' },
    { x: 14, z: -13.4, ex: 14, ez: -11.2, kind: 'door' },
    { x: -19.4, z: -3.5, ex: -17.2, ez: -3.5, kind: 'door' },
    { x: 19.4, z: 9, ex: 17.2, ez: 9, kind: 'door' },
    { x: 0, z: 13.4, ex: 0, ez: 11.2, kind: 'stairs' },
  ],
  decorate(L) {
    const { halfD } = L.bounds;

    // Dance floor: 12 x 8 light tiles that change pattern with the beat.
    const cols = 12;
    const rows = 8;
    const x0 = -6;
    const z0 = -5;
    const tiles = L.own(
      new THREE.InstancedMesh(L.own(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2)), L.own(new THREE.MeshBasicMaterial()), cols * rows),
    );
    tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols * rows * 3), 3);
    const m = new THREE.Matrix4();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        m.makeTranslation(x0 + 0.5 + c, 0.008, z0 + 0.5 + r);
        tiles.setMatrixAt(r * cols + c, m);
      }
    }
    L.add(tiles);
    const pal = [
      [1, 0.12, 0.55],
      [0.1, 0.85, 1],
      [0.55, 0.25, 1],
      [1, 0.55, 0.1],
    ];
    const hash = (a, b, c) => {
      const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
      return s - Math.floor(s);
    };
    let pattern = 0;
    let lastBeat = -1;
    L.animators.push(() => {
      const b = Math.floor(L.beat);
      const frac = L.beat - b;
      if (b !== lastBeat) {
        lastBeat = b;
        if (b % 4 === 0) pattern = (pattern + 1) % 4;
      }
      const fade = 0.25 + 0.75 * (1 - frac) * (1 - frac);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let on;
          let ci;
          if (pattern === 0) {
            on = (r + c + b) % 2 === 0;
            ci = b % 4;
          } else if (pattern === 1) {
            const d = Math.floor(Math.hypot(c - 5.5, r - 3.5));
            on = (((d - b) % 3) + 3) % 3 === 0;
            ci = (d + b) % 4;
          } else if (pattern === 2) {
            on = (c + b) % 4 < 2;
            ci = ((c >> 1) + b) % 4;
          } else {
            on = hash(r, c, b) < 0.35;
            ci = Math.floor(hash(c, r, b) * 4);
          }
          const k = on ? fade * 0.5 : 0.04;
          const p = pal[ci];
          tiles.instanceColor.setXYZ(r * cols + c, p[0] * k, p[1] * k, p[2] * k);
        }
      }
      tiles.instanceColor.needsUpdate = true;
    });

    // Mirror ball + the light specks it throws on the floor.
    const ball = new THREE.Mesh(
      L.own(new THREE.IcosahedronGeometry(0.75, 1)),
      L.own(new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15, flatShading: true, emissive: 0x3a3a55 })),
    );
    ball.position.set(0, 4.6, -1);
    L.add(ball);
    L.deco(0, 5.3, -1, 0.04, 4, 0.04, L.mat.darkMetal);
    const N = 70;
    const specks = L.own(
      new THREE.InstancedMesh(
        L.own(new THREE.CircleGeometry(0.08, 6).rotateX(-Math.PI / 2)),
        L.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.3, 1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })),
        N,
      ),
    );
    const sr = [];
    const sa = [];
    for (let i = 0; i < N; i++) {
      sr.push(rand(1.5, 11));
      sa.push(rand(0, TAU));
    }
    L.add(specks);
    L.animators.push((realDt) => {
      ball.rotation.y += realDt * 0.6 * L.game.audio.musicRate;
      for (let i = 0; i < N; i++) {
        const a = sa[i] + ball.rotation.y;
        m.makeTranslation(Math.cos(a) * sr[i] * 1.3, 0.012, -1 + Math.sin(a) * sr[i] * 0.8);
        specks.setMatrixAt(i, m);
      }
      specks.instanceMatrix.needsUpdate = true;
      // two coloured spots sweep around the dance floor on the beat
      const pulse = 1 - (L.beat % 1);
      for (let i = 0; i < 2; i++) {
        const p = L.points[i];
        const a = L.beat * 0.25 + i * Math.PI;
        p.light.position.set(Math.cos(a) * 7, p.base.y, -1 + Math.sin(a) * 5);
        p.light.intensity = p.intensity * (0.55 + 0.45 * pulse);
      }
    });

    // Bottles on the shelf behind the bar (they go when the glass goes).
    const shelf = L.glass.find((g) => g.z < -12);
    if (shelf) {
      const bottleGeo = L.own(new THREE.CylinderGeometry(0.07, 0.08, 0.34, 6));
      const bottleMats = [0x3fe68a, 0xffb347, 0x9fe8ff, 0xff5a8a].map((c) =>
        L.own(new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 })),
      );
      for (const y of [0.55, 1.15, 1.7]) {
        const board = new THREE.Mesh(L.geo.unit, L.mat.bar);
        board.scale.set(shelf.w, 0.04, 0.34);
        board.position.y = y - 0.2;
        shelf.mesh.add(board);
        for (let x = -shelf.w / 2 + 0.25; x < shelf.w / 2 - 0.1; x += rand(0.22, 0.4)) {
          const b = new THREE.Mesh(bottleGeo, bottleMats[Math.floor(Math.random() * bottleMats.length)]);
          b.position.set(x, y - 0.02, rand(-0.05, 0.05));
          shelf.mesh.add(b);
        }
      }
    }

    sign(
      L,
      [
        { text: 'PULSE', font: 'bold 150px "Bebas Neue", Impact, sans-serif', color: '#9b6bff', y: 110 },
        { text: '脈 衝 夜 店', font: HAN(56), color: '#ff3fa4', y: 214 },
      ],
      7,
      1.75,
      6,
      2.3,
      -halfD + 0.02,
    );
    sign(L, [{ text: 'BAR · 酒吧', font: HAN(120), color: '#ffa040', y: 128 }], 4, 1, -12, 2.6, -halfD + 0.02, 0, 1.6);
    // neon wall stripes
    for (const x of [-19.96, 19.96]) L.deco(x, 1.4, 0, 0.04, 0.06, 26, L.mat.neonViolet);
  },
};

const docks = {
  id: 'docks',
  name: '七號碼頭',
  en: 'HARBOR 7',
  desc: '貨櫃迷宮、會大爆炸的氣罐，敵人還會從海裡爬上來。',
  color: '#ffa040',
  size: [24, 15],
  start: [0, 2],
  theme: {
    bg: 0x050a10,
    fog: [0x0a1018, 0.012],
    hemi: [0x5a7aa0, 0x0e1216, 0.95],
    moon: [0xa8c0ff, 1.25],
    points: [
      [0xff9a3c, -25.5, 8, -4, 130, 42],
      [0xff9a3c, 25.5, 8, -4, 130, 42],
      [0xff9a3c, -25.5, 8, 9, 120, 42],
      [0xff9a3c, 25.5, 8, 9, 120, 42],
    ],
    rain: true,
  },
  floor: 'asphalt',
  edges: { n: [3.6, 'warehouse', null], s: [0.45, 'curb', null], w: [2.2, 'fence', null], e: [2.2, 'fence', null] },
  solids: [
    [-14, -6, 6, 2.4, 2.6, 'containerRed'],
    [-14, -3.6, 6, 2.4, 2.6, 'containerBlue'],
    [0, -7.5, 2.4, 6, 2.6, 'containerGreen'],
    [13, -5, 6, 2.4, 2.6, 'containerOrange'],
    [-6, 5, 6, 2.4, 2.6, 'containerBlue'],
    [9, 6, 2.4, 6, 2.6, 'containerRed'],
    [18.5, 8, 6, 2.4, 2.6, 'containerGreen'],
    [-19, 10, 1.6, 1.6, 1.3, 'crate'],
    [5, -1.5, 1.4, 1.4, 1.2, 'crate'],
    [-4, -1.5, 1.4, 1.4, 1.2, 'crate'],
    [20, -9, 1.6, 1.6, 1.4, 'crate'],
    [-21, -11, 1.6, 1.6, 1.4, 'crate'],
    [-8, -11, 1.6, 2.6, 1.5, 'forklift'],
    [21, -1.5, 2.4, 2.4, 2.4, 'hut'],
  ],
  glass: [
    [6, -3.6, 3.6, 0.25, 1.9],
    [-21.6, 4.5, 0.25, 3.4, 1.9],
  ],
  barrels: [[4.5, -12, 'gas'], [-21.5, -4, 'gas'], [21.5, 3, 'gas'], [-1, 11.5, 'gas'], [-11, 1.5], [13.5, -8.5], [3, 3.5], [-16, 12.5], [15, 12]],
  pans: [[-4, -12.5], [7, 1.5], [-12, 9], [17, -11], [3, 12.5]],
  pads: [[-10, -0.5], [12, 1.5]],
  spawns: [
    { x: -6, z: -14.4, ex: -6, ez: -12.2, kind: 'door', door: [2.4, 2.6] },
    { x: 8, z: -14.4, ex: 8, ez: -12.2, kind: 'door', door: [2.4, 2.6] },
    { x: -8, z: 14.4, ex: -8, ez: 12, kind: 'ledge' },
    { x: 12, z: 14.4, ex: 12, ez: 12, kind: 'ledge' },
    { x: -23.4, z: -8, ex: -21, ez: -8, kind: 'gate' },
    { x: 23.4, z: -12, ex: 21, ez: -12, kind: 'gate' },
  ],
  decorate(L) {
    const { halfW: W, halfD: D } = L.bounds;
    const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.8, ...o }));

    // harbour water to the south, pier face and the yard beyond the fences
    const water = plane(L, 260, 90, std({ color: 0x081826, roughness: 0.12, metalness: 0.5 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -1.6, D + 45.6);
    L.add(water);
    L.deco(0, -1.7, D + 0.8, W * 2 + 1.2, 1.7, 0.4, L.mat.curb);
    const yard = plane(L, 220, 120, std({ color: 0x1b1d21, roughness: 0.95 }));
    yard.rotation.x = -Math.PI / 2;
    yard.position.set(0, -0.02, D + 0.6 - 60);
    L.add(yard);
    for (let x = -W + 2; x <= W - 2; x += 4) {
      const b = new THREE.Mesh(L.own(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8)), L.mat.darkMetal);
      b.position.set(x, 0.45 + 0.25, D + 0.3);
      L.add(b);
    }

    // warehouse block behind the north wall
    const wh = std({ color: 0x4a5462, roughness: 0.7, metalness: 0.3 });
    L.deco(0, 0, -D - 7.6, W * 2 + 1.2, 9, 14, wh, true);
    L.deco(0, 9, -D - 7.6, W * 2 + 1.6, 0.25, 14.4, L.mat.darkMetal);
    sign(
      L,
      [
        { text: 'HARBOR 7', font: 'bold 150px "Bebas Neue", Impact, sans-serif', color: '#ffa040', y: 110 },
        { text: '七 號 碼 頭', font: HAN(56), color: '#3fe6ff', y: 214 },
      ],
      9,
      2.25,
      0,
      6.2,
      -D - 0.58,
      0,
      1.8,
    );
    for (const x of [-16, -6, 8, 18]) L.deco(x, 4.2, -D - 0.62, 0.9, 0.18, 0.12, L.mat.neonOrange);

    // gantry cranes looming over the warehouse
    const craneMat = std({ color: 0xb8352a, roughness: 0.6, metalness: 0.4 });
    const blinks = [];
    for (const cx of [-17, 15]) {
      for (const dx of [-3, 3]) for (const dz of [-34, -26]) L.deco(cx + dx, 0, dz, 0.8, 24, 0.8, craneMat);
      L.deco(cx, 24, -30, 7.6, 1.2, 9, craneMat);
      L.deco(cx, 24.6, -24, 1.2, 1, 22, craneMat);
      const blink = new THREE.Mesh(L.geo.unit, L.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2) })));
      blink.scale.set(0.5, 0.4, 0.5);
      blink.position.set(cx, 25.2, -13.5);
      L.add(blink);
      blinks.push(blink);
    }
    L.animators.push(() => {
      const on = performance.now() % 1400 < 250;
      for (const b of blinks) b.visible = on;
    });

    // sodium lamp masts outside the fences (the map's four point lights)
    for (const p of L.points) {
      L.deco(p.base.x, 0, p.base.z, 0.25, p.base.y, 0.25, L.mat.darkMetal, true);
      L.deco(p.base.x + Math.sign(-p.base.x) * 0.5, p.base.y, p.base.z, 1.2, 0.2, 0.5, L.mat.neonOrange);
    }

    // painted yard markings
    const paint = std({ color: 0xc9a227, roughness: 0.9, emissive: 0xc9a227, emissiveIntensity: 0.08 });
    for (let x = -W + 1.5; x < W - 1.5; x += 2.4) L.deco(x, 0.004, 1.2, 1.3, 0.01, 0.14, paint);
    for (const [x, z, w, d] of [
      [-18, 12.7, 5, 0.12],
      [-18, 10.3, 5, 0.12],
      [3, -12.6, 0.12, 3.6],
      [7, -12.6, 0.12, 3.6],
    ]) {
      L.deco(x, 0.004, z, w, 0.01, d, paint);
    }
  },
};

export const MAPS = [rooftop, club, docks];
