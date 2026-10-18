// Map data. Every map lists its cover as [x, z, width, depth, height, material,
// facing?] (x right, z toward the camera; facing is where a made model's front
// points, in degrees: 0 south, 90 east, 180 north, 270 west), plus glass,
// barrels, pans, weapon pads and spawn points. `decorate` adds the
// non-colliding scenery and animations.

import * as THREE from 'three';
import { Pigeons } from './ambient.js';
import { CALCADA, FACADE, GLAZING, LOUVRE } from './senado/assets.js';
import SENADO_DATA from './senado/data.js';
import { buildSenado, FOUNTAIN } from './senado/model.js';
import { SENADO, toGame } from './senado/transform.js';
import { helipadTexture, neonSignTexture, windowTexture } from './textures.js';
import { pick, rand, TAU } from './utils.js';

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
      if (rand(0, 1) < 0.2) continue;
      const tall = z < -40 && rand(0, 1) < 0.5;
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
  budget: { tris: 360000, calls: 1600 }, // rendered per frame, all passes (test/maps.test.mjs)
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
  // the last wave of a run that ends here (boss.js): the helicopter, over the helipad, flying in from the north-west
  boss: { kind: 'heli', pad: [0, -1.5], from: [-34, -30] },
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
  budget: { tris: 490000, calls: 400 }, // rendered per frame, all passes (test/maps.test.mjs)
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
    [17.6, -4, 1.4, 4.4, 0.9, 'sofa', 270],
    [17.6, 4, 1.4, 4.4, 0.9, 'sofa', 270],
    [15.4, -4, 1, 1.2, 0.8, 'table'],
    [15.4, 4, 1, 1.2, 0.8, 'table'],
    [-17.6, 3, 1.4, 5, 0.9, 'sofa', 90],
    [-15.4, 3, 1, 1.2, 0.8, 'table'],
    [-4.5, 10, 1.3, 1.3, 1.7, 'speaker'],
    [4.5, 10, 1.3, 1.3, 1.7, 'speaker'],
    [-13.5, 9, 0.5, 4, 1.2, 'bar', 90],
    [13.5, 9.5, 0.5, 3, 1.2, 'bar', 270],
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
          const b = new THREE.Mesh(bottleGeo, pick(bottleMats));
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
  budget: { tris: 410000, calls: 2250 }, // rendered per frame, all passes (test/maps.test.mjs)
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

// ------------------------------------------------------------- Largo do Senado

// Decode the Senado textures as soon as the page loads, so the map never
// shows a frame of untextured paving when it is picked.
const SENADO_IMAGES =
  typeof Image === 'undefined'
    ? {}
    : Object.fromEntries(
        Object.entries({ CALCADA, LOUVRE, GLAZING, FACADE }).map(([key, uri]) => {
          const img = new Image();
          img.src = uri;
          return [key, img];
        }),
      );

const senado = {
  id: 'senado',
  budget: { tris: 290000, calls: 1900 }, // rendered per frame, all passes (test/maps.test.mjs)
  name: '議事亭前地',
  en: 'LARGO DO SENADO',
  desc: '按實景比例重建的澳門議事亭前地：新馬路、噴水池、窄段一直到板樟堂前地。',
  color: '#f2c94c',
  credit: '地圖資料 © OpenStreetMap contributors（ODbL）',
  size: [SENADO.halfW, SENADO.halfD],
  start: [2, 54],
  camera: { dist: 31, pitch: 72, fov: 30 },
  cutaway: true,
  // the buildings across the avenue, between the camera and the square: above 1.2 m, seen through
  fade: { above: 1.2 },
  look: 'flat', // drawn like the characters (style.js), the trial of one look for maps and people
  theme: {
    bg: 0x9cc4e8,
    fog: [0xc9d8e6, 0.0042],
    hemi: [0xeef3f8, 0xb8a888, 1.55],
    moon: [0xfff0d8, 3.1],
    sunDir: [-30, 44, 14],
    points: [
      [0xffffff, 0, -50, 0, 0, 1],
      [0xffffff, 0, -50, 0, 0, 1],
      [0xffffff, 0, -50, 0, 0, 1],
      [0xffffff, 0, -50, 0, 0, 1],
    ],
    rain: false,
    exposure: 0.95,
    bloom: { strength: 0.55, threshold: 1.5 },
    shadowFollow: true,
  },
  floor: 'none',
  edges: null,
  solids: [
    // food stalls, planters, street lamps
    [-12, 52, 2.8, 1.6, 1.1, 'stall'],
    [11, 52, 2.8, 1.6, 1.1, 'stall'],
    [-5.8, 20, 2.4, 1.5, 1.1, 'stall'],
    [6, 12, 2.4, 1.5, 1.1, 'stall'],
    [-14, -66, 2.8, 1.6, 1.1, 'stall'],
    [-9, 44, 1.4, 1.4, 0.9, 'planter'],
    [14, 44, 1.4, 1.4, 0.9, 'planter'],
    [-5, -60, 1.4, 1.4, 0.9, 'planter'],
    [-15, 60, 0.3, 0.3, 4, 'streetlamp'],
    [16, 58, 0.3, 0.3, 4, 'streetlamp'],
    [-9, 31, 0.3, 0.3, 4, 'streetlamp'],
    [9, 30, 0.3, 0.3, 4, 'streetlamp'],
    [-6, 6, 0.3, 0.3, 4, 'streetlamp'],
    [7, 6, 0.3, 0.3, 4, 'streetlamp'],
    [5, -24, 0.3, 0.3, 4, 'streetlamp'],
    [-2.5, -40, 0.3, 0.3, 4, 'streetlamp'],
    // the avenue: two parked taxis and a delivery crate or two up the narrow street
    [-10, 68.5, 4.2, 1.8, 1.45, 'car'],
    [14, 68, 4.2, 1.8, 1.45, 'car'],
    [1.5, -28, 1.2, 1.2, 1.1, 'crate'],
    [3, -50, 1.4, 1, 1, 'crate'],
    // borrowed from the other stages: delivery crates, police barriers, a news kiosk, a utility box
    [-17, 57, 1.4, 1.4, 1.2, 'crate'],
    [-15.6, 57.7, 1, 1, 0.8, 'crate'],
    [-3, 61, 4, 0.6, 1, 'concrete'],
    [6, 61.5, 3, 0.6, 1, 'concrete'],
    [-13.5, 47.5, 1.8, 1.4, 2.3, 'kiosk'],
    [-2.5, -8, 1.2, 1.2, 1.1, 'crate'],
    [4, -16, 1, 1, 0.9, 'crate'],
    [-3, -55, 1.2, 0.8, 1.3, 'unit'],
  ],
  glass: [
    [10, 63.2, 3.6, 0.2, 2.1],
    [9, 36, 0.2, 3.2, 1.9],
    [-2, -2, 3, 0.2, 1.9],
  ],
  barrels: [[-9.9, 51.6, 'lpg'], [9, 52.4, 'lpg'], [-4.1, 20.8, 'lpg'], [7.7, 13.3, 'lpg'], [-12, -64.5, 'lpg'], [20, 48, 'gas'], [16.2, 46.2], [-11, 35.5], [-21, -68, 'gas']],
  pans: [[-12, 49.8], [11, 49.8], [-5.8, 17.9], [6, 9.9], [-14, -63.5], [1, -12], [8, 40], [-8, -60]],
  // pigeon flocks resting on the square: they burst into the air at shots, blasts and runners (PIGEON STRIKE)
  flocks: [[-6, 46], [8, 44], [0, 22], [-10, -64]],
  pads: [[-4, 48], [1, -34], [-10, -62]],
  spawns: [
    { x: -24.5, z: 68, ex: -17, ez: 64, kind: 'gate' },
    { x: 24.5, z: 68, ex: 16, ez: 60, kind: 'gate' },
    { x: 24.5, z: 40, ex: 12, ez: 40, kind: 'gate' },
    { x: 24.5, z: 2, ex: 12.5, ez: 2, kind: 'gate' },
    { x: -24.5, z: -13, ex: -10, ez: -12, kind: 'gate' },
    { x: 24, z: -42, ex: 10, ez: -42, kind: 'gate' },
    { x: -24.5, z: -62, ex: -14, ez: -62.5, kind: 'gate' },
    { x: -6, z: -73, ex: -6, ez: -67, kind: 'gate' },
  ],
  decorate(L) {
    const tex = (key) => {
      const img = SENADO_IMAGES[key];
      const t = L.own(new THREE.Texture(img));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      if (img.complete && img.naturalWidth) t.needsUpdate = true;
      else img.addEventListener('load', () => (t.needsUpdate = true), { once: true });
      return t;
    };
    const { root } = buildSenado(SENADO_DATA, {
      mode: 'viewer',
      calcadaTexture: tex('CALCADA'),
      louvreTexture: tex('LOUVRE'),
      glazingTexture: tex('GLAZING'),
      facadeTexture: tex('FACADE'),
    });
    const wrap = new THREE.Group();
    wrap.rotation.y = (SENADO.rotDeg * Math.PI) / 180;
    wrap.position.z = SENADO.offsetZ;
    wrap.add(root);
    L.add(wrap);
    root.traverse((o) => {
      if (!o.isMesh) return;
      L.own(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        L.own(m);
        if (m.name === 'Calcada') {
          // soften the black-and-white waves so characters stay readable on top of them
          m.color.setRGB(0.8, 0.78, 0.74);
          m.emissive.setRGB(0.15, 0.14, 0.13);
        }
      }
    });

    // Building footprints inside the play strip become solids.
    const { halfW, halfD } = L.bounds;
    for (const b of SENADO_DATA.buildings.concat(SENADO_DATA.parts)) {
      if ((b.minH || 0) > 2.2) continue; // overhangs you can walk under
      const pts = b.outer.map(([x, y]) => toGame(x, y));
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[1]);
      if (Math.max(...xs) < -halfW - 1 || Math.min(...xs) > halfW + 1 || Math.max(...zs) < -halfD - 1 || Math.min(...zs) > halfD + 1) continue;
      L.addPoly(pts, b.h);
    }

    // The fountain: its pool is solid cover, the ring around it is sunk below the square.
    const f = SENADO_DATA.fountain;
    const [fx, fz] = toGame(f.x, f.y);
    const ring = [];
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      ring.push([fx + Math.cos(a) * FOUNTAIN.poolOuter, fz + Math.sin(a) * FOUNTAIN.poolOuter]);
    }
    L.addPoly(ring, FOUNTAIN.basinTop, 'wall');
    const floor = -FOUNTAIN.steps * FOUNTAIN.stepRise;
    const pathR = FOUNTAIN.stepsOuter - FOUNTAIN.steps * FOUNTAIN.stepRun;
    L.groundFn = (x, z) => {
      const r = Math.hypot(x - fx, z - fz);
      if (r >= FOUNTAIN.stepsOuter) return 0;
      if (r <= pathR) return floor;
      return -Math.ceil((FOUNTAIN.stepsOuter - r) / FOUNTAIN.stepRun) * FOUNTAIN.stepRise;
    };
    for (const [x, y] of SENADO_DATA.trees) {
      const [tx, tz] = toGame(x, y);
      L.addBox(tx, tz, 0.4, 0.4, 2.6, null, 'wall', { visible: false });
    }

    // Barriers where the strip cuts across streets, so the edge reads as an edge.
    const barrier = L.own(new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.6 }));
    const stripe = L.own(new THREE.MeshStandardMaterial({ color: 0xd23a2a, roughness: 0.6 }));
    for (const [x, z, w, d] of [
      [-25.6, 66.5, 0.3, 7],
      [25.6, 66.5, 0.3, 9],
      [25.6, 40, 0.3, 10],
      [25.6, 2, 0.3, 3],
      [-25.6, -13, 0.3, 3],
      [24.6, -42, 0.3, 3],
      [-25.6, -62, 0.3, 8],
      [-6, -73.7, 7, 0.3],
      [0, 73.75, 52, 0.3], // across the avenue: shots fly over it, people stop at it
    ]) {
      L.deco(x, 0, z, w, 1.0, d, barrier, true);
      L.deco(x, 0.62, z, w + 0.02, 0.16, d + 0.02, stripe);
    }

    // the square's pigeons (their flocks are in `flocks`, above): they burst into the air and drift back later
    L.ambient.push(new Pigeons(L, 28));

    // A bus shelter roof over the glass panel on the avenue
    L.deco(10, 2.25, 62.6, 3.8, 0.08, 1.6, L.mat.darkMetal, true);
    for (const x of [8.3, 11.7]) L.deco(x, 0, 62.0, 0.08, 2.25, 0.08, L.mat.darkMetal, true);
  },
};

export const MAPS = [rooftop, club, docks, senado];
