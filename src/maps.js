// Map data. Every map lists its cover as [x, z, width, depth, height, material,
// facing?] (x right, z toward the camera; facing is where a made model's front
// points, in degrees: 0 south, 90 east, 180 north, 270 west), plus glass,
// barrels, pans, weapon pads and spawn points. `decorate` adds the
// non-colliding scenery and animations.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Pigeons } from './ambient.js';
import { CALCADA, FACADE, GLAZING, LOUVRE } from './senado/assets.js';
import SENADO_DATA from './senado/data.js';
import { buildSenado, FOUNTAIN } from './senado/model.js';
import { SENADO, toGame } from './senado/transform.js';
import { brickTexture, helipadTexture, neonSignTexture, shopfrontTexture, tileTexture, windowTexture } from './textures.js';
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
  // laid out by the effects' dice: never culled, so a frame's draw calls do not hang on where the towers fell
  city.frustumCulled = false;
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
  rev: 1, // the map's revision: up one whenever its data changes how a run plays (replay.js records them all)
  budget: { tris: 360000, calls: 500 }, // rendered per frame, all passes (test/maps.test.mjs: 242,174 and 205 at the start; 1,240 before made props were merged by material, models.js)
  name: '霓虹天台',
  en: 'NEON ROOFTOP',
  hour: '20:00', // 澳門一夜 (night.js): the hour of the night it is set at, and the line that opens it
  line: ['今晚八點，他們在天台交收。你一個人上去。', 'Eight o\'clock. They trade on the roof tonight. You go up alone.'],
  desc: '雨夜的天台：直升機坪、玻璃溫室和一排排油桶。',
  color: '#ff3fa4',
  size: [22, 15],
  // 同一水平 (level.js zones, DECISIONS 2026-10-22): one floor, one level
  zones: [{ id: 'floor', name: '天台', en: 'ROOF', y: 0, box: [-22, -15, 22, 15] }],
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
  // Four stages (stages, below), none a mirror of another: the glass greenhouse in the north-west,
  // the barrel yard in the south-east, the gate in the barrier to the north, the open helipad.
  solids: [
    [-7.5, -5, 2, 2, 1.7, 'crate'],
    [-5.9, -5.6, 1.2, 1.2, 1.1, 'crate'],
    [9.5, -3.5, 1.6, 1.6, 1.4, 'crate'],
    [18, 10, 1.6, 1.6, 1.4, 'crate'],
    [15.5, 11.2, 1.2, 1.2, 1.1, 'crate'],
    [-2.5, 11.5, 1.4, 1.4, 1.3, 'crate'],
    [-2.25, -8, 2.5, 0.6, 1.25, 'concrete'],
    [2.25, -8, 2.5, 0.6, 1.25, 'concrete'],
    [10.5, 9, 0.6, 4.5, 1.25, 'concrete'],
    [-15, 9, 0.6, 4, 1.25, 'concrete'], // the lane south of the west sign stays open (fixtures.test shoots along it)
    [4.5, 2.5, 1, 1, 3.4, 'pillar'],
    [14, 4, 2.8, 1.8, 1.5, 'unit'],
    [17, -6, 1.4, 1.4, 1.0, 'unit'],
    [-16, 1, 1.4, 1.4, 1.0, 'unit'],
    [13, -13.5, 4, 3, 2.9, 'hut'],
  ],
  glass: [
    // the greenhouse: three glass walls, open to the south
    [-14, -12.2, 7.2, 0.25, 1.9],
    [-17.6, -9, 0.25, 6.6, 1.9],
    [-10.4, -9, 0.25, 6.6, 1.9],
    [19.5, -2.5, 0.25, 4, 1.9],
    [2, 7, 5, 0.25, 1.9],
  ],
  barrels: [[-6, -3.4], [-12, -2], [3.5, -10], [-19.5, 13], [5.2, 12.4], [-9, -11, 'lpg'], [13, 8.5], [15, 7.2, 'gas'], [16.5, 9.5], [14, 11.5], [12, 10.5]],
  pans: [[2.5, -1.5], [-1.5, 1.5], [-14, -9], [12.5, -8.5], [-16, 7], [6, 10]],
  tools: [[-13, -9.5, 'extinguisher'], [-3, 9, 'umbrella'], [16, 0, 'umbrella']], // things to pick up and use: a fire extinguisher in the greenhouse, two umbrellas left in the rain
  spots: { barrels: [[0, 9.5], [6, 6.5], [13.5, 1.5], [-0.5, -5.5]], pans: [[-14, 1.5], [-14, 12.5], [-8.5, -7], [4.5, -7]], tools: [[0.5, -13], [12.5, 13.5], [19.5, -13.5]] }, // the daily's spare places (level.js dealProps): beside cover, near each kind's own
  // fixtures (fixtures.js): street lamps that go dark when shot out, hanging signs that drop on whoever is under them, a gate in the barrier
  fixtures: [[-6, 7, 'lamp'], [8, 5, 'lamp'], [12, -3, 'sign', 180], [-12, 11, 'sign', 0], [0, -8, 'door', 0, 2, 1.25]],
  pads: [[-9, 1], [11, 2]],
  // where the beats of a wave play out (waves.js): a name, a spot, and the move the spot is made for
  stages: [
    { name: '溫室', en: 'GREENHOUSE', at: [-14, -8.5], move: 'glass' },
    { name: '油桶陣', en: 'BARREL YARD', at: [14, 9.5], move: 'boom' },
    { name: '閘門', en: 'THE GATE', at: [0, -9.5], move: 'door' },
    { name: '停機坪', en: 'HELIPAD', at: [0, -1.5], move: 'slide' },
  ],
  boss: { kind: 'heli', pad: [0, -1.5], from: [-34, -30] },
  spawns: [
    { x: 13, z: -11.4, ex: 13, ez: -9.2, kind: 'door' },
    { x: -21.4, z: -9, ex: -19, ez: -9, kind: 'ledge' },
    { x: -21.4, z: 3.5, ex: -18.6, ez: 3.5, kind: 'ledge' },
    { x: 21.4, z: 3.5, ex: 18.6, ez: 3.5, kind: 'ledge' },
    { x: 7.5, z: 14.4, ex: 7.5, ez: 11.6, kind: 'ledge' },
    { x: -6, z: 14.4, ex: -6, ez: 11.6, kind: 'ledge' },
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
  rev: 1,
  budget: { tris: 490000, calls: 400 }, // rendered per frame, all passes (test/maps.test.mjs)
  name: '脈衝夜店',
  en: 'CLUB PULSE',
  hour: '21:00',
  line: ['貨帶進了夜店。音樂越大聲，越沒有人聽見槍聲。', 'The goods went into the club. The louder the music, the fewer hear the shots.'],
  desc: '跟著節拍閃爍的舞池、吧枱後的一整排酒瓶，和一顆鏡面球。',
  color: '#9b6bff',
  size: [20, 14],
  // 同一水平 (level.js zones, DECISIONS 2026-10-22): one floor, one level
  zones: [{ id: 'floor', name: '舞池', en: 'FLOOR', y: 0, box: [-20, -14, 20, 14] }],
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
  // the stage's last wave here (boss.js): the blade queen, dashing between her perches ([x, z], or [x, z, height] a
  // map could give but none does: 同一水平): the lounge between the sofas, the front of the DJ booth, the glass walk,
  // the floor before the bar
  boss: { kind: 'blade', perches: [[15.5, 0], [6, -8.2], [-13.5, 3], [-12, -8.5]] },
  edges: { n: [3.2, 'clubWall', 'neonPink'], s: [0.9, 'clubWall', 'neonCyan'], w: [3.2, 'clubWall', 'neonCyan'], e: [3.2, 'clubWall', 'neonCyan'] },
  // Four stages: the long bar with its flap, the DJ booth, the lounge in the east, a glass walk in the west.
  solids: [
    [-15, -10.2, 4, 1.2, 1.2, 'bar'],
    [-9, -10.2, 4, 1.2, 1.2, 'bar'],
    [6, -10, 4, 1.6, 1.3, 'dj'],
    [2.6, -10.6, 1.2, 1.2, 2.2, 'speaker'],
    [9.4, -10.6, 1.2, 1.2, 2.2, 'speaker'],
    [8.5, -5.5, 1, 1, 3.2, 'pillar'],
    [8.5, 5, 1, 1, 3.2, 'pillar'],
    [-8.5, 5, 1, 1, 3.2, 'pillar'],
    [17.6, -4, 1.4, 4.4, 0.9, 'sofa', 270],
    [17.6, 4, 1.4, 4.4, 0.9, 'sofa', 270],
    [15.4, -4, 1, 1.2, 0.8, 'table'],
    [15.4, 4, 1, 1.2, 0.8, 'table'],
    [4.5, 10, 1.3, 1.3, 1.7, 'speaker'],
    [-7, 11.5, 1.3, 1.3, 1.7, 'speaker'],
    [13.5, 9.5, 0.5, 3, 1.2, 'bar', 270],
    [-13.5, 1.5, 1.2, 1.2, 0.8, 'table'],
  ],
  glass: [
    [-12, -13.3, 9, 0.35, 1.9],
    // the glass walk: two panes with a table and a tray between them
    [-11.5, 3, 0.25, 6, 1.9],
    [-15.5, 3, 0.25, 6, 1.9],
    [12, 0, 0.25, 3.5, 1.9],
  ],
  barrels: [[-5.5, -12.2, 'gas'], [12.5, -12, 'gas'], [11.5, 12], [-17.5, 12], [17.5, -11.5]],
  pans: [[-3, -1.5, 'tray'], [2, 1, 'tray'], [0, 4, 'tray'], [-15, -7, 'tray'], [15, -8.5, 'tray'], [-2.5, 12, 'tray'], [-13.5, 4.5, 'tray']],
  tools: [[-8.5, 0, 'extinguisher']], // one: the club's draw-call budget (400) is the tightest of the maps
  spots: { barrels: [[0, -10], [-9, -7.5], [9.5, 6.5], [10.5, -6.5]], pans: [[-15.5, -1], [-8, 2.5], [-8, 10], [5.5, 6]], tools: [[2.5, 8.5], [-15.5, -12], [3.5, -7]] },
  fixtures: [[-6, 0, 'lamp'], [-4, -7.5, 'sign', 180], [-12, -10.2, 'door', 0, 2, 1.2]], // the bar's flap
  stages: [
    { name: '長吧', en: 'THE BAR', at: [-12, -8.5], move: 'slide' },
    { name: 'DJ 台', en: 'DJ BOOTH', at: [6, -8], move: 'high' },
    { name: '梳化角', en: 'THE LOUNGE', at: [15.5, 0], move: 'pan' },
    { name: '玻璃走廊', en: 'GLASS WALK', at: [-13.5, 3], move: 'glass' },
  ],
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
          const k = (on ? fade * 0.5 : 0.04) * (L.floorTaken ? 0.12 : 1); // the DJ's own tiles (boss.js) take the floor over
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
      const colours = [0x3fe68a, 0xffb347, 0x9fe8ff, 0xff5a8a].map((c) => new THREE.Color(c));
      // one mesh, the colours in its vertices (they only ever go together, with the shelf): one draw call, not one a
      // bottle; and always the whole shelf long, so whether it is in view never hangs on how the colours fell (a mesh
      // a colour, its extent drawn at random, put the club's frame over its budget one load in two)
      const geos = [];
      const boards = [];
      for (const y of [0.55, 1.15, 1.7]) {
        boards.push(new THREE.BoxGeometry(shelf.w, 0.04, 0.34).translate(0, y - 0.2, 0));
        for (let x = -shelf.w / 2 + 0.25; x < shelf.w / 2 - 0.1; x += rand(0.22, 0.4)) {
          const geo = bottleGeo.clone().translate(x, y - 0.02, rand(-0.05, 0.05));
          const rgb = pick(colours).toArray();
          const n = geo.attributes.position.count;
          geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, k) => rgb[k % 3]), 3));
          geos.push(geo);
        }
      }
      const bottles = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }); // lit from within
      const merged = L.own(mergeGeometries(geos));
      // its bounds are the shelf's, not where the last bottle happened to stand: in view or not, the same every load
      merged.boundingSphere = new THREE.Box3(new THREE.Vector3(-shelf.w / 2, 0, -0.2), new THREE.Vector3(shelf.w / 2, 1.9, 0.2)).getBoundingSphere(new THREE.Sphere());
      shelf.mesh.add(new THREE.Mesh(merged, L.own(bottles)), new THREE.Mesh(L.own(mergeGeometries(boards)), L.mat.bar)); // the three boards one mesh too
      for (const g of [...geos, ...boards]) g.dispose();
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
  rev: 1,
  budget: { tris: 410000, calls: 500 }, // rendered per frame, all passes (test/maps.test.mjs: 349,025 and 213 at the start; 1,693 before made props were merged by material, models.js)
  name: '七號碼頭',
  en: 'HARBOR 7',
  hour: '01:00',
  line: ['一點，七號碼頭。貨櫃門已經打開。', 'One o\'clock, Harbor 7. The container doors are open.'],
  desc: '貨櫃迷宮、會大爆炸的氣罐，敵人還會從海裡爬上來。',
  color: '#ffa040',
  size: [24, 15],
  // 同一水平 (level.js zones, DECISIONS 2026-10-22): one floor, one level
  zones: [{ id: 'floor', name: '碼頭', en: 'QUAY', y: 0, box: [-24, -15, 24, 15] }],
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
  // the stage's last wave here (boss.js): the heavy gunner, in through the west gate (`from` off the map, `at` just
  // inside) and after the player. The cover below still keeps the old truck's roads (its `loop`) clear, so the truck kind
  // can come back as data
  boss: { kind: 'gunner', from: [-26, -8], at: [-19.5, -8] },
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
    [-3, -3.2, 1.4, 1.4, 1.2, 'crate'], // off the mirror of the crate across the road; the truck's road (boss) runs at z = 0.8
    [20, -9, 1.6, 1.6, 1.4, 'crate'],
    [-21, -11, 1.6, 1.6, 1.4, 'crate'],
    [-8, -11, 1.6, 2.6, 1.5, 'forklift'],
    [21, -1.5, 2.4, 2.4, 2.4, 'hut'],
  ],
  glass: [
    [6, -3.6, 3.6, 0.25, 1.9],
    [-21.6, 4.5, 0.25, 3.4, 1.9],
  ],
  // three LPG cylinders for the boss (boss.js: a kicked one jets into the heavy gunner), in the open and off his way in
  barrels: [[4.5, -12, 'gas'], [-21.5, -4, 'gas'], [21.5, 3, 'gas'], [-1, 11.5, 'gas'], [-12, -12, 'gas'], [-11, 1.5], [13.5, -8.5], [3, 3.5], [-16, 12.5], [15, 12], [-18, 0, 'lpg'], [15, -1.5, 'lpg'], [2, 8, 'lpg']],
  pans: [[-4, -12.5], [7, 1.5], [-12, 9], [17, -11], [3, 12.5]],
  // a fire extinguisher; two fishing nets by the quay; two hand trolleys at the ends of the road through the middle,
  // facing down it, to be kicked along it ([x, z, kind, facing]: the deck's front turned this far from +x)
  tools: [[-4, 9, 'extinguisher'], [-7, 12.5, 'net'], [11.5, 12.5, 'net'], [-19.5, 1.8, 'trolley', 0], [18, 1.6, 'trolley', Math.PI]],
  spots: { barrels: [[-21.5, 10.5], [-10, -6.5], [-2.5, 1.5], [2.5, -6.5]], pans: [[-17.5, 7], [-10, 3.5], [8.5, 10.5], [9, -4]], tools: [[8, -1], [-10, -3.5], [-20.5, 13.5]] },
  water: [{ x: 0, z: 17, w: 52, d: 4 }], // the harbour beyond the south curb: whoever is knocked over it is gone
  // where the beats play out (waves.js); the truck's roads (boss.loop) stay clear of cover
  stages: [
    { name: '貨櫃巷', en: 'CONTAINER ALLEY', at: [-7, -6], move: 'slide' },
    { name: '卸貨閘', en: 'LOADING BAY', at: [16.5, 4.5], move: 'shutter' }, // beside the bay, off the truck's lane through it (x = 13)
    { name: '碼頭邊', en: 'QUAYSIDE', at: [4, 12.5], move: 'splash' },
    { name: '倉前', en: 'WAREHOUSE FRONT', at: [-11, -9.5], move: 'boom' },
  ],
  fixtures: [[-10, 8, 'lamp'], [16, -8, 'lamp'], [0, 9, 'lamp'], [-14, -9, 'sign', 90], [10.5, 7.2, 'shutter', 90, 5]], // a loading-bay shutter between two containers; the lamps stand clear of the truck's loop (boss.js)
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
  rev: 1,
  budget: { tris: 290000, calls: 500 }, // rendered per frame, all passes (test/maps.test.mjs: 208,358 and 255 at the start; 1,218 before made props were merged by material, models.js; up the square, test/drawcalls.test.mjs, about 250)
  name: '議事亭前地',
  en: 'LARGO DO SENADO',
  hour: '22:00',
  line: ['他們在議事亭前地散開，混進看燈飾的人羣裏。', 'They scatter across the Senado, into the crowd out to see the lights.'],
  desc: '按實景比例重建的澳門議事亭前地：新馬路、噴水池、窄段一直到板樟堂前地。',
  color: '#f2c94c',
  credit: '地圖資料 © OpenStreetMap contributors（ODbL）',
  massing: 'senado', // rebuilt from its massing study (senado/; massing/senado/ lists the checks test/massing.test.mjs runs)
  size: [SENADO.halfW, SENADO.halfD],
  // 同一水平 (level.js zones, DECISIONS 2026-10-22): one level; the sunk ring round the fountain, 0.48 m down, is within it
  zones: [{ id: 'square', name: '廣場', en: 'SQUARE', y: 0, box: [-SENADO.halfW, -SENADO.halfD, SENADO.halfW, SENADO.halfD] }],
  start: [2, 54],
  camera: { dist: 31, pitch: 72, fov: 30 },
  cutaway: true,
  // the buildings across the avenue, between the camera and the square: above 1.2 m, seen through;
  // and up the square, any building within 6 m of the line from the player to the camera, whole (level.js updateFade)
  fade: { above: 1.2, follow: 6 },
  // the stage's last wave here (boss.js): the taxi convoy, in along the avenue from the east, then round
  // the fountain on a loop that clears the buildings, the stalls and the lamps
  boss: {
    kind: 'convoy',
    entry: [[31, 65.6], [3, 65.6], [-3.5, 46.7]],
    loop: [[-8.9, 34.5], [-8.9, 41.5], [-3.5, 46.7], [4.5, 46.7], [11.7, 40.5], [11.7, 34.8], [8.6, 29.2], [-4, 29.2], [-7.6, 31]],
  },
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
    [-11, 44.5, 1.4, 1.4, 0.9, 'planter'], // these three stand clear of the convoy's road round the fountain (boss.js)
    [14, 44, 1.4, 1.4, 0.9, 'planter'],
    [-5, -60, 1.4, 1.4, 0.9, 'planter'],
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
  tools: [[-3, 52, 'extinguisher']],
  spots: { barrels: [[-15.5, 49.5], [6.5, 7.5], [15, 52], [-8, 46]], pans: [[-13.5, 44], [7, 4], [-16, -69], [-4.5, -10]], tools: [[-6.5, 65.5], [-16.5, 55], [10.5, 55]] },
  // where the beats play out (waves.js), off the convoy's road (boss): beside the fountain's pool, the square before
  // St Dominic's, the narrow stretch, and the corner by the post office at the avenue
  stages: [
    { name: '噴水池', en: 'THE FOUNTAIN', at: [7, 38], move: 'splash' },
    { name: '板樟堂前地', en: 'ST DOMINIC\u2019S', at: [6, 57], move: 'pan' },
    { name: '窄段', en: 'THE NARROWS', at: [0, -28], move: 'glass' },
    { name: '郵政局前', en: 'POST OFFICE', at: [-8, -64], move: 'boom' },
  ],
  // four of the square's lamps can be shot out; two shop signs hang over the pavement
  fixtures: [[-15, 60, 'lamp'], [16, 58, 'lamp'], [-11, 31, 'lamp'], [13, 31.5, 'lamp'], [-14, 55, 'sign', 90], [14.5, 41, 'sign', 270]], // the two by the fountain and the east sign stand clear of the convoy's road (boss.js)
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
    const { root, pickTables } = buildSenado(SENADO_DATA, {
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

    // Every building taller than the fade height gets a number, and its vertices carry it, so the
    // camera can see through it whole while it stands between the camera and the player (`fade.follow`).
    // Merged buildings know their owner per triangle; the rooftop clutter lies inside a footprint.
    const number = new Map();
    const feet = [];
    for (const b of SENADO_DATA.buildings.concat(SENADO_DATA.parts)) {
      if (b.h <= L.map.fade.above) continue;
      const pts = b.outer.map(([x, y]) => toGame(x, y));
      const n = L.addFadeable(pts, b.h);
      number.set(b, n);
      number.set(b.id, n);
      feet.push({ n, pts, minX: Math.min(...pts.map((q) => q[0])), maxX: Math.max(...pts.map((q) => q[0])), minZ: Math.min(...pts.map((q) => q[1])), maxZ: Math.max(...pts.map((q) => q[1])) });
    }
    const footOf = (x, z) => {
      for (const f of feet) {
        if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) continue;
        let inside = false;
        for (let i = 0, j = f.pts.length - 1; i < f.pts.length; j = i++) {
          const [ax, az] = f.pts[j];
          const [bx, bz] = f.pts[i];
          if (az > z !== bz > z && x < ax + ((z - az) / (bz - az)) * (bx - ax)) inside = !inside;
        }
        if (inside) return f.n;
      }
      return 0;
    };
    wrap.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const kind = o.userData.kind;
      if (kind === 'building') L.markFade(o.geometry, number.get(o.userData.id) || 0);
      else if (kind === 'merged') {
        const { triOwner, list } = pickTables.find((t) => t.mesh === o);
        const owner = new Float32Array(o.geometry.attributes.position.count);
        const ix = o.geometry.index.array;
        for (let t = 0; t < triOwner.length; t++) for (let k = 0; k < 3; k++) owner[ix[t * 3 + k]] = number.get(list[triOwner[t]]) || 0;
        L.markFade(o.geometry, (i) => owner[i]);
      } else if (kind === 'rooftops') {
        const pos = o.geometry.attributes.position;
        L.markFade(o.geometry, (i) => {
          v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
          return footOf(v.x, v.z);
        });
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
    L.water.push({ x: fx, z: fz, r: FOUNTAIN.poolOuter }); // the pool: a body knocked over its rim lands in the water
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

// ----------------------------------------------------------- Rua da Felicidade

// 福隆新街: the street runs west to east (x) between two rows of two-storey shops, `road` m either side of its
// middle; each row is `depth` m of room behind a `wall` m front, out to the map's edge. A lane crosses it at
// `lane` (x from, to). Six shops are open (`FEL_SHOPS`); the rest of each row is solid building.
const FEL = { halfW: 30, halfD: 10, road: 3, depth: 5, wall: 0.3, bay: 4.6, h: 6.6, door: 2, shutter: 2.4, lane: [5.8, 8.7] };

// The open shops, west to east in each row: `x` the middle of the room, `side` the row (n or s), `front` what shuts
// its street opening (a wooden door, or at the lane's mouth a roller shutter), `back` the wall with a door onto the
// lane (e or w). The names are made up, as every name in the game is but the places'.
const FEL_SHOPS = [
  { x: -16.5, side: 'n', front: 'door', name: '雲樓茶室', en: 'WAN LAU TEA ROOM' },
  { x: 3.5, side: 'n', front: 'shutter', back: 'e', name: '祥興五金', en: 'CHEUNG HING HARDWARE' },
  { x: 19.5, side: 'n', front: 'door', name: '銀燕冰室', en: 'NGAN YIN CAFE' },
  { x: -22.5, side: 's', front: 'door', name: '海昌海味', en: 'HOI CHEONG DRIED SEAFOOD' },
  { x: -3.5, side: 's', front: 'door', name: '福星押', en: 'FOOK SING PAWN' },
  { x: 11, side: 's', front: 'door', back: 'w', name: '瑞興雲吞', en: 'SUI HING WONTON' },
];

/**
 * The truck's loop on Rua da Felicidade (its `boss`): east along the street on `FEL_ROAD`, on out of the east end and
 * round in a teardrop, back west on the same line, the same past the west end. Each table, lamp and sign post is at least the
 * truck's half width (1.1 m) clear of the line: the line passes south of the table at x -9, north of those at -25.5
 * and 14.
 */
const FEL_ROAD = [[-28, -0.9], [-21, -0.9], [-13, 1], [-5, 1], [11, -0.8], [28, -0.8]];
function felicidadeTruckLoop() {
  // straight on 4 m out of each end before the teardrop, or its tail swings into the corner shops and the end tables
  const out = ([x, z], dir) => [x + dir * 4, z];
  const turn = ([x, z], dir) => [[x + dir * 3, z + 1.2], [x + dir * 5, z], [x + dir * 3, z - 1.2]];
  const east = out(FEL_ROAD[FEL_ROAD.length - 1], 1);
  const west = out(FEL_ROAD[0], -1);
  return [...FEL_ROAD, east, ...turn(east, 1), east, ...[...FEL_ROAD].reverse(), west, ...turn(west, -1).reverse(), west];
}

/**
 * The street's walls as data: for each row, the solid blocks between the shops and the lane, and each open
 * shop's front (two pieces beside its opening), side walls (one split by a back door) and back; and the doors and
 * shutters that close the openings (fixtures.js).
 */
function felicidadeWalls() {
  const { halfW: W, halfD: D, road: S, depth, wall: t, bay, h } = FEL;
  const solids = [];
  const fixtures = [];
  for (const side of ['n', 's']) {
    const sz = side === 'n' ? -1 : 1;
    const shops = FEL_SHOPS.filter((s) => s.side === side);
    const gaps = [...shops.map((s) => [s.x - bay / 2, s.x + bay / 2]), FEL.lane].sort((a, b) => a[0] - b[0]);
    let x0 = -W;
    for (const [a, b] of [...gaps, [W, W]]) {
      if (a - x0 > 0.05) solids.push([(x0 + a) / 2, (sz * (S + D)) / 2, a - x0, D - S, h, 'brick']);
      x0 = b;
    }
    const room = sz * (S + t + depth / 2); // the middle of a room, across the street
    const backZ = sz * (S + t + depth + (D - S - t - depth) / 2);
    for (const shop of shops) {
      const open = shop.front === 'shutter' ? FEL.shutter : FEL.door;
      // a shutter's lock post stands clear of the wall (fixtures.js: it is a prop that bullets find): a slot either
      // side of the shutter too narrow for a body
      const slot = shop.front === 'shutter' ? 0.3 : 0;
      const piece = (bay - open) / 2 - slot;
      for (const k of [-1, 1]) solids.push([shop.x + k * (open / 2 + slot + piece / 2), sz * (S + t / 2), piece, t, h, 'brick']);
      for (const k of [-1, 1]) {
        const wx = shop.x + k * (bay / 2 - t / 2);
        if (shop.back === (k > 0 ? 'e' : 'w')) {
          const part = (depth - FEL.door) / 2;
          for (const j of [-1, 1]) solids.push([wx, room + j * (FEL.door / 2 + part / 2), t, part, h, 'brick']);
          fixtures.push([wx, room, 'door', 90, FEL.door, 2.3]);
        } else solids.push([wx, room, t, depth, h, 'brick']);
      }
      solids.push([shop.x, backZ, bay, D - S - t - depth, h, 'brick']);
      if (shop.front === 'shutter') fixtures.push([shop.x - open / 2, sz * (S + t / 2), 'shutter', 90, open, 2.6]);
      else fixtures.push([shop.x, sz * (S + t / 2), 'door', 0, open, 2.3]);
    }
  }
  return { solids, fixtures };
}

const FEL_WALLS = felicidadeWalls();

const felicidade = {
  id: 'felicidade',
  rev: 1,
  budget: { tris: 110000, calls: 1000 }, // rendered per frame, all passes (test/maps.test.mjs: 87,555 and 820 at the start)
  name: '福隆新街',
  en: 'RUA DA FELICIDADE',
  hour: '23:00',
  line: ['福隆新街的紅窗後面，每一扇都可能有槍。', 'Behind every red window on Felicidade, maybe a gun.'],
  desc: '紅窗木門的兩層舊舖夾着一條窄街：踢門入舖、鐵閘落下，橫巷兩頭都有人殺到。',
  color: '#ff5a4a',
  size: [FEL.halfW, FEL.halfD],
  // 同一水平 (level.js zones, DECISIONS 2026-10-22): one floor, one level
  zones: [{ id: 'floor', name: '街', en: 'STREET', y: 0, box: [-FEL.halfW, -FEL.halfD, FEL.halfW, FEL.halfD] }],
  start: [-2, 0.5],
  camera: { dist: 26, pitch: 66, fov: 34 },
  cutaway: true,
  // the shop fronts are two storeys over a 6 m street, so the one between the camera and the player is seen through
  // above 1.2 m (level.js updateFade), every building numbered in decorate
  fade: { above: 1.2, follow: 3 },
  theme: {
    bg: 0x0c0607,
    fog: [0x160809, 0.016],
    hemi: [0x6c5c66, 0x120a0c, 0.75],
    moon: [0xa8b0ff, 0.55],
    sunDir: [-10, 34, 18],
    points: [
      [0xff5a3a, -21, 4.4, 0, 55, 20],
      [0xff6e42, -7, 4.4, 0.5, 55, 20],
      [0xff4c34, 9, 4.4, -0.5, 55, 20],
      [0xff7a48, 23, 4.4, 0, 55, 20],
    ],
    rain: false,
    bloom: { strength: 0.95, threshold: 0.78 },
  },
  floor: 'concrete',
  edges: null, // the rows of shops are the edge; the street ends and the lane ends are open (where enemies come in)
  shops: FEL_SHOPS,
  lane: { x: (FEL.lane[0] + FEL.lane[1]) / 2 },
  solids: [
    ...FEL_WALLS.solids,
    // mahjong tables put out on the street, low cover
    [-25.5, 1.3, 1.1, 1.1, 0.8, 'mahjong'],
    [-9, -1.2, 1.1, 1.1, 0.8, 'mahjong'],
    [14, 1.4, 1.1, 1.1, 0.8, 'mahjong'],
  ],
  barrels: [[-13, -2.3, 'lpg'], [16.3, 2.3, 'lpg'], [2.2, -7.4, 'lpg'], [-27.5, -2.2], [26, 2.1]],
  pans: [[-18, -6.8], [-6, 1.8], [12.3, 6.6], [21, -1.6], [-23.5, 5]],
  tools: [[19.5, -7.4, 'extinguisher']],
  spots: { barrels: [[11, -0.5], [-18, 1], [-8, 1], [4.5, -2]], pans: [[-11, -1.5], [8.5, 2], [-1.5, -2], [15.5, 0.5]], tools: [[7.5, -1], [24.5, 0.5], [20.5, 0.5]] },
  fixtures: [
    ...FEL_WALLS.fixtures,
    [-19.5, -2.62, 'sign', 0],
    [-1, 2.62, 'sign', 180],
    [10.5, -2.62, 'sign', 0],
    [24.5, 2.62, 'sign', 180],
    [-11.5, 2.5, 'lamp'],
    [1.5, -2.5, 'lamp'],
    [21, 2.5, 'lamp'],
  ],
  pads: [[-21, -0.8], [18, -0.2]],
  // the stage's boss (boss.js truck): in from the west, then up and down the street on one line that weaves clear of
  // the mahjong tables, lamps and sign posts, turning in a teardrop just past each open end (the street is too narrow
  // to turn in); it lets its thugs out and charges only on the map (boss.js onMap)
  boss: { kind: 'truck', from: [-40, -0.9], loop: felicidadeTruckLoop() },
  // balconies up the fronts of the solid blocks, [x, z, height, facing]: drawn only (level.js ledges; decorate). Nobody
  // is sent up to them any more (同一水平, DECISIONS 2026-10-22: a man up there was a man the player could not tell how
  // to hit); four on the north row, two on the south
  balconies: [
    [-24, -2.55, 3.05, 0],
    [-8, -2.55, 3.05, 0],
    [13, -2.55, 3.05, 0],
    [26, -2.55, 3.05, 0],
    [-13, 2.55, 3.05, 180],
    [18, 2.55, 3.05, 180],
  ],
  stages: [
    { name: '茶室前', en: 'TEA ROOM FRONT', at: [-16.5, -1.2], move: 'door' },
    { name: '巷口', en: 'LANE MOUTH', at: [7.25, -3.6], move: 'shutter' }, // just into the lane: off the truck's road (boss)
    { name: '麻雀枱', en: 'MAHJONG TABLES', at: [-8, -2.3], move: 'slide' }, // behind the table, between it and the shops
    { name: '石油氣', en: 'GAS CYLINDERS', at: [17, 0.8], move: 'boom' },
  ],
  spawns: [
    { x: -29.4, z: -1.2, ex: -27, ez: -1.2, kind: 'gate' },
    { x: -29.4, z: 1.4, ex: -27.5, ez: 1.4, kind: 'gate' },
    { x: 29.4, z: 1.2, ex: 27, ez: 1.2, kind: 'gate' },
    { x: 29.4, z: -1.4, ex: 27.5, ez: -1.4, kind: 'gate' },
    { x: 7.25, z: -9.5, ex: 7.25, ez: -7.4, kind: 'gate' },
    { x: 7.25, z: 9.5, ex: 7.25, ez: 7.4, kind: 'gate' },
  ],
  decorate(L) {
    const { halfW: W, halfD: D, road: S, wall: t, bay, h } = FEL;
    const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }));
    const brickTex = L.own(brickTexture());
    brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
    const brickMat = std({ map: brickTex, roughness: 0.92 });
    const roofMat = std({ color: 0x45403f, roughness: 0.95 }); // flat tarred roofs
    const walls = [brickMat, brickMat, roofMat, brickMat, brickMat, brickMat]; // a box's faces: +x, -x, top, bottom, +z, -z
    const frontTex = L.own(shopfrontTexture(false));
    frontTex.wrapS = THREE.RepeatWrapping;
    const frontMat = std({ map: frontTex });
    const openTex = L.own(shopfrontTexture(true));
    const openMat = std({ map: openTex });
    /** A plane `w` × `ht` with its texture repeated `rx` × `ry` times (its own UVs, so one material serves all). */
    const face = (w, ht, mat, rx = 1, ry = 1) => {
      const geo = L.own(new THREE.PlaneGeometry(w, ht));
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
      return new THREE.Mesh(geo, mat);
    };

    // every building numbered for the follow fade: each wall of the map's own, its look re-drawn on a geometry of
    // its own (the shared unit box cannot carry one building's number), brick on its sides and top
    const own = L.solids.filter((sd) => sd.matKey === 'brick');
    const numbers = new Map();
    for (const sd of own) {
      const n = L.addFadeable(
        [
          [sd.minX, sd.minZ],
          [sd.maxX, sd.minZ],
          [sd.maxX, sd.maxZ],
          [sd.minX, sd.maxZ],
        ],
        sd.h,
      );
      numbers.set(sd, n);
      const w = sd.maxX - sd.minX;
      const d = sd.maxZ - sd.minZ;
      const geo = L.own(new THREE.BoxGeometry(w, sd.h, d).translate(0, sd.h / 2, 0));
      const uv = geo.attributes.uv;
      // BoxGeometry faces in order +x, -x, +y, -y, +z, -z, four vertices each: repeat the brick by each face's size
      const sizes = [[d, sd.h], [d, sd.h], [w, d], [w, d], [w, sd.h], [w, sd.h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, uv.getX(f * 4 + k) * sizes[f][0] / 1.2, uv.getY(f * 4 + k) * sizes[f][1] / 1.2);
      L.markFade(geo, n);
      sd.mesh.geometry = geo;
      sd.mesh.material = walls;
      sd.mesh.scale.set(1, 1, 1);
      sd.mesh.position.set((sd.minX + sd.maxX) / 2, 0, (sd.minZ + sd.maxZ) / 2);
    }
    /** A facade plane on a building's street face (or its back), carrying the building's number. */
    const front = (sd, mesh, z, ry, y = h / 2) => {
      mesh.position.set((sd.minX + sd.maxX) / 2, y, z);
      mesh.rotation.y = ry;
      L.markFade(mesh.geometry, numbers.get(sd));
      L.add(mesh);
    };
    // the faces the camera sees (it is always on the south side): the north row's street front, bay after bay, and
    // the south row's back
    for (const sd of own) {
      const w = sd.maxX - sd.minX;
      const bays = Math.max(1, Math.round(w / bay));
      if (Math.abs(sd.maxZ + S) < 0.05 && sd.maxZ - sd.minZ > 1) front(sd, face(w, h, frontMat, bays), sd.maxZ + 0.02, 0);
      if (Math.abs(sd.maxZ - D) < 0.05 && w > 1) front(sd, face(w, h, frontMat, bays), sd.maxZ + 0.02, 0);
    }
    // an open shop: its upper floor over the opening, the floor tiles inside, a counter and shelves
    const tileTex = L.own(tileTexture());
    tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping;
    const tileMat = std({ map: tileTex, roughness: 0.6 });
    const wood = std({ color: 0x5a2a1a, roughness: 0.7 });
    for (const shop of FEL_SHOPS) {
      const sz = shop.side === 'n' ? -1 : 1;
      if (shop.side === 'n') {
        // the upper floor over the opening (the texture's part from the ledge up), a building of its own to the fade
        const n = L.addFadeable(
          [
            [shop.x - bay / 2, -S - t],
            [shop.x + bay / 2, -S - t],
            [shop.x + bay / 2, -S],
            [shop.x - bay / 2, -S],
          ],
          h,
        );
        const upper = face(bay, h - 2.6, openMat);
        const uv = upper.geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setY(i, 2.6 / h + uv.getY(i) * (1 - 2.6 / h));
        upper.position.set(shop.x, 2.6 + (h - 2.6) / 2, -S + 0.02);
        L.markFade(upper.geometry, n);
        L.add(upper);
      }
      const floor = face(bay - 2 * t, FEL.depth, tileMat, 3, 4);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(shop.x, 0.01, sz * (S + t + FEL.depth / 2));
      L.add(floor);
      L.deco(shop.x - 1, 0, sz * (S + t + FEL.depth - 0.5), 1.6, 1.0, 0.5, wood, true); // the counter by the back wall
      L.deco(shop.x + 1.2, 1.1, sz * (S + t + FEL.depth - 0.15), 1.4, 0.06, 0.3, wood); // a shelf above it
      L.deco(shop.x + 1.2, 1.7, sz * (S + t + FEL.depth - 0.15), 1.4, 0.06, 0.3, wood);
      // the shop's name over its door: Chinese with the English label
      sign(
        L,
        [
          { text: shop.name, font: HAN(96), color: '#ffe2b0', y: 112 },
          { text: shop.en, font: 'bold 44px "Bebas Neue", Impact, sans-serif', color: '#3fe6ff', y: 206 },
        ],
        3.2,
        0.8,
        shop.x,
        3.05,
        sz * (S - 0.06),
        shop.side === 'n' ? 0 : Math.PI,
        1.6,
      );
    }
    // cyan neon: a strip along every third bay's ledge, and the lane's mouth picked out
    for (const sd of own) {
      const north = sd.maxZ <= 0;
      if (Math.abs(Math.abs(north ? sd.maxZ : sd.minZ) - S) > 0.05 || sd.maxZ - sd.minZ < 1) continue;
      const w = sd.maxX - sd.minX;
      L.deco((sd.minX + sd.maxX) / 2, 3.12, north ? sd.maxZ + 0.06 : sd.minZ - 0.06, Math.min(w - 0.6, 3.2), 0.07, 0.05, L.mat.neonCyan);
    }
    for (const [x, z] of [[FEL.lane[0] + 0.1, -S - 0.1], [FEL.lane[1] - 0.1, S + 0.1]]) L.deco(x, 2.4, z, 0.08, 2.2, 0.08, L.mat.neonCyan);

    // the street goes on past both ends, and the lane past both edges: low blocks of shops, dark
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) L.deco(sx * (W + 12), 0, (sz * (S + D)) / 2, 24, h, D - S, brickMat, true);
      const street = L.add(face(24, 2 * S, std({ color: 0x3a3634, roughness: 0.95 })));
      street.rotation.x = -Math.PI / 2;
      street.position.set(sx * (W + 12), 0.005, 0);
    }
    // on the roofs: water tanks and air conditioners
    const tank = std({ color: 0x8c8f94, roughness: 0.5, metalness: 0.4 });
    for (const [x, z, w, d, ht] of [
      [-25, -7, 1.6, 1.6, 1.4],
      [12, -6.5, 2.4, 1.2, 0.9],
      [26, -8, 1.2, 1.2, 1.2],
      [-12, 6.8, 2, 1.4, 1],
      [2, 7.5, 1.4, 1.4, 1.5],
      [22, 6, 2.2, 1.2, 0.8],
    ]) {
      L.deco(x, h, z, w, ht, d, tank, true);
    }
    // the balconies: a slab and its railing, one piece each (numbered with the building behind, so it fades with it),
    // and the window behind; if a man is sent out onto one (a test's perches, level.js balconies) it lights while he
    // is coming (level.js present)
    const iron = std({ color: 0x2f7a62, roughness: 0.55, metalness: 0.3 }); // painted ironwork, green as the old ones are
    const slab = std({ color: 0x9a948a, roughness: 0.9 });
    for (const b of L.ledges) {
      const across = Math.abs(b.dirZ) > 0.5; // the balcony runs along x
      const piece = (w, ht, d, x, y, z) => new THREE.BoxGeometry(across ? w : d, ht, across ? d : w).translate(across ? x : z, y, across ? z : x);
      const out = 0.95; // its depth out from the wall
      const edge = (out / 2 - 0.03) * Math.sign(b.dirZ || b.dirX); // the railing along its outer edge
      const floor = piece(1.9, 0.14, out, 0, -0.07, 0);
      const parts = [];
      for (const x of [-0.92, -0.46, 0, 0.46, 0.92]) parts.push(piece(0.08, 0.95, 0.08, x, 0.47, edge));
      parts.push(piece(1.94, 0.1, 0.1, 0, 0.95, edge));
      for (const x of [-0.92, 0.92]) parts.push(piece(0.1, 0.1, out, x, 0.95, 0));
      const geo = L.own(mergeGeometries(parts));
      for (const g of parts) g.dispose();
      const wallZ = b.ez - b.dirZ * (out / 2);
      const home = own.find((sd) => b.x > sd.minX && b.x < sd.maxX && b.z > sd.minZ && b.z < sd.maxZ);
      for (const [g, mat] of [
        [geo, iron],
        [L.own(floor), slab],
      ]) {
        if (home) L.markFade(g, numbers.get(home));
        const m = new THREE.Mesh(g, mat);
        m.position.set(b.ex, b.perch, b.ez);
        m.castShadow = true;
        L.add(m);
      }
      const glow = std({ color: 0x1a0c08, emissive: 0xff7a3a, emissiveIntensity: 0.9 });
      const window = face(1.1, 2.1, glow);
      if (home) L.markFade(window.geometry, numbers.get(home));
      window.position.set(b.ex, b.perch + 1.05, wallZ + b.dirZ * 0.06); // in front of the facade's own picture (decorate's `front`)
      window.rotation.y = b.dirZ > 0 ? 0 : Math.PI;
      L.add(window);
      const live = L.balconies.find((o) => o.ex === b.ex && o.ez === b.ez);
      if (live) live.lamp = { mat: glow };
    }
    // power lines and lanterns strung across the street
    const cable = std({ color: 0x141214, roughness: 0.6 });
    const lantern = std({ color: 0xd8261c, emissive: 0xff3020, emissiveIntensity: 0.9, roughness: 0.5 });
    for (const x of [-26, -14, -4, 12, 25]) {
      L.deco(x, 5.4, 0, 0.04, 0.04, 2 * S, cable);
      for (const z of [-1.2, 1.2]) {
        const lamp = new THREE.Mesh(L.geo.unit, lantern);
        lamp.scale.set(0.34, 0.4, 0.34);
        lamp.position.set(x, 4.95, z);
        L.add(lamp);
      }
    }
  },
};

// ---------------------------------------------------------------- 東望洋跑道 GUIA CIRCUIT
// A hairpin of the street circuit at night, built by hand to the ROADMAP's size (OSM cannot be reached from the
// build): the track comes in along the north, turns round the west end and goes back out along the south. Inside
// the hairpin a grass infield behind blue-and-white tyre walls with the timing tower; outside it guardrails with
// marshals' gates, the grandstand to the north (nobody on it: 同一水平), the spectators' side to the south
// and a gravel run-off past the bend. The track goes on past the east edge. The teams, sponsors and lap times are
// made up.
const GUIA = {
  halfW: 28,
  halfD: 20,
  cx: -10, // the hairpin's centre: the bend is the half circle west of it
  inner: 5.4, // the infield's tyre wall (its middle line): along the straights at z = ±inner, round the bend at that radius
  outer: 13.1, // the outer barrier's middle line: guardrails along the straights, a tyre wall round the bend
  tyre: 0.9, // a tyre wall's thickness and height: low cover, a man crouched behind it, the shots over it
  rail: 0.3, // a guardrail's thickness and height
  railH: 1.0,
  stand: [-15, 15, -19.8, -13.25], // the grandstand's box (x from, x to, z from, z to): its front is the north straight's edge
  standH: 3.4,
};

/** A tyre wall on an arc of radius r about (cx, cz), from angle a0 to a1 (degrees from +x towards +z): stacks 0.75 m apart, the gaps left open. */
function tyreArc(out, cx, cz, r, a0, a1, gaps = []) {
  const n = Math.ceil(((((a1 - a0) * Math.PI) / 180) * r) / 0.75);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    if (gaps.some(([g0, g1]) => a > g0 && a < g1)) continue;
    const t = (a * Math.PI) / 180;
    out.push([+(cx + r * Math.cos(t)).toFixed(2), +(cz + r * Math.sin(t)).toFixed(2), GUIA.tyre, GUIA.tyre, GUIA.tyre, 'tyres']);
  }
}

/** A straight run along z from x0 to x1, broken at the gaps ([a, b] in x). */
function straightRun(out, z, x0, x1, gaps, thick, h, mat) {
  let a = x0;
  for (const [g0, g1] of [...gaps, [x1, x1]]) {
    if (g0 - a > 0.05) out.push([+((a + g0) / 2).toFixed(2), z, +(g0 - a).toFixed(2), thick, h, mat]);
    a = g1;
  }
}

/** The barriers as solids: the infield's tyre walls and the outer guardrails and tyre wall, with their gaps. */
function guiaBarriers() {
  const { halfW: W, cx, inner, outer, tyre, rail, railH } = GUIA;
  const s = [];
  straightRun(s, -inner, cx, W - 1, [[-1.2, 1.2], [13, 15.4]], tyre, tyre, 'tyres');
  straightRun(s, inner, cx, W - 1, [[-5.2, -2.8], [7, 9.4], [20, 22.4]], tyre, tyre, 'tyres');
  tyreArc(s, cx, 0, inner, 90, 270);
  straightRun(s, -outer, GUIA.stand[1], W - 0.4, [[19, 21.4]], rail, railH, 'rail'); // east of the grandstand, whose front is the edge
  straightRun(s, outer, cx, W - 0.4, [[0.8, 3.2], [16.8, 19.2]], rail, railH, 'rail'); // short of the map's edge: cover, not the edge
  tyreArc(s, cx, 0, outer, 90, 270, [[124, 136], [224, 236]]);
  return s;
}

const GUIA_WALLS = guiaBarriers();

/** The racing line (src/race.js): in along the north straight from past the east edge, round the bend, out along the south. */
function guiaRacingLine() {
  const { cx, inner, outer } = GUIA;
  const r = (inner + 0.45 + outer - 0.15) / 2; // the middle of the road
  const line = [[45, -r]];
  for (let i = 0; i <= 16; i++) {
    const a = ((270 - (180 * i) / 16) * Math.PI) / 180;
    line.push([+(cx + r * Math.cos(a)).toFixed(3), +(r * Math.sin(a)).toFixed(3)]);
  }
  line.push([45, r]);
  return line;
}

const guia = {
  id: 'guia',
  rev: 1,
  budget: { tris: 190000, calls: 560 }, // rendered per frame, all passes (test/maps.test.mjs: 150,785 and 424 at the start)
  name: '東望洋跑道',
  en: 'GUIA CIRCUIT',
  hour: '02:00',
  line: ['他們沿着跑道逃。夜裏試車的賽車不會停下來。', 'They run down the circuit. The night\'s test laps won\'t stop for anyone.'],
  desc: '格蘭披治的髮夾彎，晚上：藍白輪胎牆只夠蹲低；賽車掠過前，過賽道要快。',
  color: '#4fb4ff',
  size: [GUIA.halfW, GUIA.halfD],
  // 同一水平 (level.js zones, DECISIONS 2026-10-22): one floor, one level
  zones: [{ id: 'floor', name: '賽道', en: 'TRACK', y: 0, box: [-GUIA.halfW, -GUIA.halfD, GUIA.halfW, GUIA.halfD] }],
  start: [-2, 1.5],
  cutaway: true,
  theme: {
    bg: 0x05070d,
    fog: [0x070a14, 0.012],
    hemi: [0x5a6a8c, 0x0a0c12, 0.7],
    moon: [0xb8c8ff, 0.5],
    sunDir: [12, 34, 16],
    // four floodlights on masts round the bend (decorate draws the masts)
    points: [
      [0xe8f0ff, -20, 7, -12, 70, 24],
      [0xe8f0ff, 4, 7, -14.2, 70, 24],
      [0xffe2b8, -6, 7, 14.4, 60, 22],
      [0xe8f0ff, 22, 7, 2, 70, 24],
    ],
    rain: false,
    bloom: { strength: 0.85, threshold: 0.8 },
  },
  floor: 'asphalt',
  edges: null, // the barriers, the grandstand and the dark beyond mark the edge; the track goes on past the east end
  solids: [
    ...GUIA_WALLS,
    [(GUIA.stand[0] + GUIA.stand[1]) / 2, (GUIA.stand[2] + GUIA.stand[3]) / 2, GUIA.stand[1] - GUIA.stand[0], GUIA.stand[3] - GUIA.stand[2], GUIA.standH, 'stand'],
    [8, 0, 2.6, 2.6, 8.5, 'tower'], // the timing tower in the infield
    [-4, -1.6, 2.2, 1.4, 1.2, 'hut'], // a marshals' post
    [18.45, 1.8, 1.8, 0.9, 0.9, 'tyres'], // spare tyres in the infield
    [-4, 16.8, 3, 1.4, 1.1, 'stall'], // a noodle stall on the spectators' side
    [12, 16, 2.7, 0.9, 0.9, 'tyres'],
    [-25.5, -6, 0.9, 1.8, 0.9, 'tyres'], // stacks in the run-off
    [-25.5, 7, 0.9, 1.8, 0.9, 'tyres'],
  ],
  barrels: [[2, -9], [12, 9.5], [-19, -4], [24, -16, 'lpg'], [-1.6, 15.8, 'lpg']],
  pans: [[-6.2, 15.6], [-2.6, 15.2], [20.5, -3.5], [-12.5, 1.8]],
  tools: [[-5.5, 0.4, 'extinguisher'], [15, 15.8, 'extinguisher']],
  spots: { barrels: [[-14, -9], [6, 9], [22, -9], [-21, 3]], pans: [[3, 2.8], [8, 16.8], [-24, -14], [26, 15.5]], tools: [[11, -3.2], [-18, 14.5], [23, 16.5]] },
  fixtures: [
    [-13.6, 0, 'lamp'],
    [1.5, -4.4, 'lamp'],
    [15, 4.4, 'lamp'],
    [7, 14.3, 'lamp'],
    [24, -14.3, 'lamp'],
    // signs hung out over the ways in from the marshals' gates (made-up names): shot down, they crush whoever is under
    [3.6, 14.6, 'sign', 270],
    [22.8, -15.4, 'sign', 270],
  ],
  pads: [[2, 1], [-25, 0], [20, 16.5]],
  // boxes on the grandstand's front, over the north straight's edge: drawn only (decorate). Nobody is sent up there
  // any more (同一水平, DECISIONS 2026-10-22)
  // the race (src/race.js, 東望洋跑道 ②): the first pass `first` s into the stage, then one every `every` s, in world time
  race: { first: 16, every: 24, line: guiaRacingLine() },
  balconies: [
    [-7, -12.8, 2.2, 0],
    [-0.5, -12.8, 2.2, 0],
    [5.5, -12.8, 2.2, 0],
    [11.5, -12.8, 2.2, 0],
  ],
  stages: [
    { name: '計時塔', en: 'TIMING TOWER', at: [8, 2.6], move: 'slide' },
    { name: '髮夾彎', en: 'THE HAIRPIN', at: [-17.5, 0.5], move: 'boom' },
    { name: '看台前', en: 'GRANDSTAND', at: [8.5, -11.2], move: 'high' },
    { name: '小食檔', en: 'NOODLE STALL', at: [-4, 14.6], move: 'pan' },
  ],
  spawns: [
    { x: 27.4, z: -9, ex: 25, ez: -9, kind: 'gate' }, // along the track: the north straight from the east
    { x: 27.4, z: 9, ex: 25, ez: 9, kind: 'gate' }, // the south straight
    { x: 27.4, z: 0, ex: 25, ez: 0, kind: 'gate' }, // the infield's open end
    { x: 21.5, z: -16.5, ex: 20.2, ez: -11.6, kind: 'gate' }, // past the grandstand, through the marshals' gate
    { x: 25.5, z: -17.5, ex: 20.2, ez: -11.6, kind: 'gate' },
    { x: -20.5, z: -12.1, ex: -17.2, ez: -8.3, kind: 'gate' }, // the run-off, through the tyre wall's gaps
    { x: -20.5, z: 12.1, ex: -17.2, ez: 8.3, kind: 'gate' },
    { x: 2, z: 19.4, ex: 2, ez: 11.6, kind: 'gate' }, // from the spectators' side
    { x: 18, z: 19.4, ex: 18, ez: 11.6, kind: 'gate' },
  ],
  decorate(L) {
    guiaDecorate(L);
  },
};

/** The circuit's look: drawn in few meshes (merged boxes, instanced tyres), as draw calls are the weak GPUs' limit. */
function guiaDecorate(L) {
  const { halfW: W, halfD: D, cx, inner, outer } = GUIA;
  const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }));
  /** Boxes [x, y, z, w, h, d] (y the bottom) merged into one mesh: one draw call for the lot (none for none: 玻璃之城 turns the rails to glass). */
  const boxes = (list, mat, cast = false) => {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(L.own(mergeGeometries(list.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)))), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return L.add(mesh);
  };
  /** Flat pieces on the ground merged into one mesh: geometries in the XZ plane, lifted `y`. */
  const ground = (geos, mat, y) => {
    const mesh = new THREE.Mesh(L.own(mergeGeometries(geos)), mat);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    return L.add(mesh);
  };
  const flat = (geo) => geo.rotateX(-Math.PI / 2);
  /** A ring segment about (x, z) lying on the ground: radii r0 to r1, the west half (the bend's side) unless told otherwise. */
  const arc = (r0, r1, x = cx, z = 0, a0 = Math.PI / 2, len = Math.PI) => flat(new THREE.RingGeometry(r0, r1, 48, 1, a0, len)).translate(x, 0, z);

  // the ground: grass on the infield, gravel past the bend, a darker strip of the spectators' side
  ground(
    [flat(new THREE.PlaneGeometry(W - cx, 2 * inner)).translate((W + cx) / 2, 0, 0), flat(new THREE.CircleGeometry(inner, 32, Math.PI / 2, Math.PI)).translate(cx, 0, 0)],
    std({ color: 0x1b3320, roughness: 1 }),
    0.006,
  );
  ground([arc(outer + 0.5, 21)], std({ color: 0x4a4338, roughness: 1 }), 0.005);
  // the white lines at the track's edges, and red-and-white kerbs round the inside of the bend
  const lineMat = std({ color: 0xe8ecf2, roughness: 0.6, emissive: 0xe8ecf2, emissiveIntensity: 0.06 });
  const lines = [];
  for (const sz of [-1, 1]) {
    lines.push(flat(new THREE.PlaneGeometry(W - cx, 0.14)).translate((W + cx) / 2, 0, sz * (inner + 0.75)));
    lines.push(flat(new THREE.PlaneGeometry(W - cx, 0.14)).translate((W + cx) / 2, 0, sz * (outer - 0.6)));
  }
  lines.push(arc(inner + 0.68, inner + 0.82), arc(outer - 0.67, outer - 0.53));
  ground(lines, lineMat, 0.012);
  const kerbs = [[], []];
  for (let i = 0; i < 16; i++) kerbs[i % 2].push(arc(inner + 0.48, inner + 1.1, cx, 0, Math.PI / 2 + (i * Math.PI) / 16, Math.PI / 16));
  ground(kerbs[0], std({ color: 0xc81e28, roughness: 0.7 }), 0.014);
  ground(kerbs[1], std({ color: 0xe8ecf2, roughness: 0.7 }), 0.014);

  // the tyre walls: every 'tyres' box drawn as stacks of three tyres, blue and white by turns (two instanced meshes)
  const stacks = [];
  for (const sd of L.solids) {
    if (sd.matKey !== 'tyres') continue;
    sd.mesh.visible = false;
    const w = sd.maxX - sd.minX;
    const d = sd.maxZ - sd.minZ;
    const along = w >= d;
    const n = Math.max(1, Math.round((along ? w : d) / 0.85));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      stacks.push([along ? sd.minX + w * k : (sd.minX + sd.maxX) / 2, along ? (sd.minZ + sd.maxZ) / 2 : sd.minZ + d * k]);
    }
  }
  const tyreGeo = L.own(new THREE.CylinderGeometry(0.42, 0.42, 0.29, 12).translate(0, 0.145, 0));
  const layers = [[], []];
  stacks.forEach(([x, z], i) => {
    for (let t = 0; t < 3; t++) layers[(i + t) % 3 === 1 ? 1 : 0].push([x, t * 0.3, z]);
  });
  const m4 = new THREE.Matrix4();
  layers.forEach((list, k) => {
    const im = new THREE.InstancedMesh(tyreGeo, std({ color: k ? 0xe8ecf2 : 0x1d4fd0, roughness: 0.7 }), list.length);
    list.forEach(([x, y, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, y, z)));
    im.computeBoundingSphere();
    im.castShadow = true;
    im.receiveShadow = true;
    L.add(im);
  });

  // the guardrails: white steel with a blue band and a post every 2 m (each rail's box is its collision and its look)
  const band = [];
  const posts = [];
  for (const sd of L.solids) {
    if (sd.matKey !== 'rail') continue;
    const z = (sd.minZ + sd.maxZ) / 2;
    band.push([(sd.minX + sd.maxX) / 2, 0.45, z, sd.maxX - sd.minX, 0.22, GUIA.rail + 0.02]);
    for (let x = sd.minX + 0.2; x < sd.maxX; x += 2) posts.push([x, 0, z, 0.12, GUIA.railH + 0.1, 0.12]);
  }
  boxes(band, std({ color: 0x1d4fd0, roughness: 0.5 }));
  boxes(posts, L.mat.darkMetal);

  // the grandstand: four tiers rising north, red and white seats, posts and a roof over the back
  const [sx0, sx1, sz0, sz1] = GUIA.stand;
  const standSd = L.solids.find((sd) => sd.matKey === 'stand');
  standSd.mesh.visible = false;
  const tiers = [];
  const seats = [[], []];
  for (let i = 0; i < 4; i++) {
    const z = sz1 - 0.6 - i * 1.2;
    const top = 1.4 + i * 0.67;
    tiers.push([(sx0 + sx1) / 2, 0, z, sx1 - sx0, top, 1.2]);
    for (let x = sx0 + 0.5; x < sx1 - 0.3; x += 0.7) seats[Math.floor((x - sx0) / 4.2) % 2].push([x, top, z, 0.5, 0.32, 0.45]);
  }
  tiers.push([(sx0 + sx1) / 2, 0, (sz0 + sz1 - 4.8) / 2, sx1 - sx0, GUIA.standH, sz1 - sz0 - 4.8]);
  boxes(tiers, std({ color: 0x5b6270, roughness: 0.9 }), true);
  boxes(seats[0], std({ color: 0xc81e28, roughness: 0.6 }));
  boxes(seats[1], std({ color: 0xe8ecf2, roughness: 0.6 }));
  const roofPosts = [];
  for (let x = sx0 + 1; x <= sx1 - 1; x += 7) roofPosts.push([x, 0, sz0 + 0.4, 0.25, 6.4, 0.25]);
  boxes(roofPosts, L.mat.darkMetal, true);
  // the boxes on the stand's front, over the walkway (the map's balconies)
  const ledges = [];
  for (const [x, z, y] of L.map.balconies) {
    ledges.push([x, y - 0.15, z - 0.05, 2.4, 0.15, 0.9], [x, y, z + 0.38, 2.4, 0.55, 0.06]);
  }
  boxes(ledges, std({ color: 0x3a404c, roughness: 0.7, metalness: 0.2 }), true);
  boxes([[(sx0 + sx1) / 2, 6.4, (sz0 + sz1) / 2 - 1, sx1 - sx0 + 1, 0.25, sz1 - sz0 + 0.4]], std({ color: 0x2a2f3a, roughness: 0.7, metalness: 0.3 }), true);
  sign(
    L,
    [
      { text: 'GUIA CIRCUIT', font: 'bold 150px "Bebas Neue", Impact, sans-serif', color: '#e8f0ff', y: 110 },
      { text: '東 望 洋 跑 道', font: HAN(56), color: '#3fb4ff', y: 214 },
    ],
    9,
    2.25,
    0,
    5.4,
    sz1 - 4.5,
    0,
    1.6,
  );

  // the timing tower: a board of made-up lap times on its south face
  sign(
    L,
    [
      { text: 'LAP 12 / 15', font: 'bold 120px "Bebas Neue", Impact, sans-serif', color: '#ffd23a', y: 104 },
      { text: '#7  #21  #33', font: 'bold 80px "Bebas Neue", Impact, sans-serif', color: '#e8f0ff', y: 206 },
    ],
    2.4,
    0.6,
    8,
    7,
    1.32,
    0,
    1.8,
  );

  // the floodlight masts at the map's four point lights
  const masts = [];
  const heads = [];
  for (const p of L.points) {
    masts.push([p.base.x, 0, p.base.z, 0.3, p.base.y, 0.3]);
    heads.push([p.base.x, p.base.y, p.base.z, 1.4, 0.5, 0.5]);
  }
  boxes(masts, L.mat.darkMetal, true);
  boxes(heads, std({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 2.2 }));

  // the city beyond: dark towers with lit windows
  cityBackdrop(L, { facade: false, keepOut: [W + 8, D + 8] });
}

// ---------------------------------------------------------------- 大三巴 RUINS OF ST. PAUL'S
// The forecourt and the great flight of steps up to the façade, stylised (a World Heritage site: no attempt at the
// real stone), about 40 × 60 m, built to the ROADMAP's size. From the forecourt in the south 68 steps climb north in
// three flights with two landings to the terrace under the façade; walls and slopes close the steps in at the sides.
// The ground's height is the map's `ground` (level.js groundY): everything stands on it. Two levels (`zones`, 同一水平):
// the forecourt and the terrace each fight on their own, the steps are the way between (a man below walks up to the
// player above rather than shoot at him; a shot stops at the edge of a flight). The façade is only a façade: its three
// doorways are open to the old nave behind it, a way round the wall.
// A barrel on the steps, shot or kicked, falls over and rolls down them (`slope`, level.js Barrel tip): ROLLING.
// Shop names are made up.
const RUINS = {
  halfW: 20,
  halfD: 30,
  stairs: 12, // the steps run x -12 to 12
  terrace: 15, // the terrace under the façade, x -15 to 15
  // the ground's profile up the steps, south to north: [z, height] at each corner; flat beyond the ends
  profile: [
    [9, 0],
    [4, 1.6],
    [1, 1.6],
    [-4, 3.2],
    [-7, 3.2],
    [-12, 4.8],
  ],
  flights: [23, 23, 22], // steps in each flight: 68 in all
  facade: -21.6, // the façade's line (its middle), 1.2 m thick
  doors: [
    [-6, 2.4, 3.8],
    [0, 3.2, 4.4],
    [6, 2.4, 3.8],
  ], // its doorways: [x, width, height]; 2.4 m at least, or the nav grid (0.5 m cells, grown by a body's width) shuts them
  nave: [9, -28.5], // behind it the old nave, open to the sky: half its width, and its back (the hill beyond)
  shops: 17, // the shop rows at the forecourt's sides start this far out
};

/** The height of the ground at (x, z): the forecourt 0, up the steps, the terrace at the top. */
function ruinsGround(x, z) {
  const P = RUINS.profile;
  if (z >= P[0][0]) return 0;
  for (let i = 1; i < P.length; i++) {
    const [z0, y0] = P[i - 1];
    const [z1, y1] = P[i];
    if (z >= z1) return y0 + ((y1 - y0) * (z0 - z)) / (z0 - z1);
  }
  return P[P.length - 1][1];
}

/** Where the ground slopes, its rise per metre [east, south]: on a flight of steps, up to the north; null where it is level. */
function ruinsSlope(x, z) {
  const P = RUINS.profile;
  for (let i = 1; i < P.length; i++) {
    const [z0, y0] = P[i - 1];
    const [z1, y1] = P[i];
    if (z < z0 && z > z1 && y1 !== y0) return [0, (y0 - y1) / (z0 - z1)];
  }
  return null;
}

/** The walls: the shop rows round the forecourt (lanes left open), the slopes beside the steps, the façade. */
function ruinsWalls() {
  const { halfW: W, halfD: D, stairs: S, terrace: T, facade: F, shops: X, doors, nave } = RUINS;
  const s = [];
  // the shop rows, two storeys, with a lane into each side of the forecourt
  s.push([-(X + W) / 2, (9 + 15) / 2, W - X, 6, 6.5, 'brick'], [-(X + W) / 2, (18 + D) / 2, W - X, D - 18, 6.5, 'brick']);
  s.push([(X + W) / 2, (9 + 21) / 2, W - X, 12, 6.5, 'brick'], [(X + W) / 2, (24 + D) / 2, W - X, D - 24, 6.5, 'brick']);
  // the slopes beside the steps, a wall a little over head height above the steps beside them, flight by flight
  for (const sx of [-1, 1]) {
    s.push([(sx * (S + W)) / 2, 5, W - S, 8, 3.4, 'slope']);
    s.push([(sx * (S + W)) / 2, -3, W - S, 8, 5, 'slope']);
    s.push([(sx * (T + W)) / 2, -16.8, W - T, 9.6, 6.6, 'slope']);
    s.push([(sx * (S + W)) / 2, -9.5, W - S, 5, 6.6, 'slope']);
  }
  // the terrace's sides are open to a lane each, between z -15.5 and -13 (the side streets climbing up)
  for (const sx of [-1, 1]) {
    s.splice(s.findIndex((w) => w[1] === -16.8 && Math.sign(w[0]) === sx), 1);
    s.push([(sx * (T + W)) / 2, -12.5, W - T, 1, 6.6, 'slope']);
    s.push([(sx * (T + W)) / 2, (-15.5 + F - 0.6) / 2, W - T, -15.5 - (F - 0.6), 6.6, 'slope']);
  }
  // the façade: a wall across the top of the terrace in four pieces, its three doorways open between them
  let x0 = -W;
  for (const [x, w] of [...doors, [W, 0]]) {
    s.push([(x0 + x - w / 2) / 2, F, x - w / 2 - x0, 1.2, 4.8 + 18, 'facade']);
    x0 = x + w / 2;
  }
  // behind it the old nave, the hill round it: at its sides and its back
  const [N, back] = nave;
  for (const sx of [-1, 1]) s.push([(sx * (N + W)) / 2, (F - 0.6 - D) / 2, W - N, D + F - 0.6, 7, 'slope']);
  s.push([0, (back - D) / 2, 2 * N, D + back, 7, 'slope']);
  return s;
}

const RUINS_WALLS = ruinsWalls();

const ruins = {
  id: 'ruins',
  rev: 1,
  budget: { tris: 180000, calls: 600 }, // rendered per frame, all passes (test/maps.test.mjs: 138,592 and 342 at the start; two drones there, test/drone.test.mjs: 160,212 and 449)
  name: '大三巴',
  en: "RUINS OF ST. PAUL'S",
  hour: '03:00',
  line: ['最後一段：六十八級石階。走到牌坊，這一夜就完。', 'The last of it: sixty-eight steps. Reach the facade and the night is over.'],
  desc: '六十八級石階連住前地和牌坊下的平台：兩層各打各的，追上來的人迎面踢個油桶落去；牌坊門洞繞得到後面。',
  color: '#ffb35a',
  size: [RUINS.halfW, RUINS.halfD],
  // 同一水平 (level.js zones, DECISIONS 2026-10-22): two levels, the forecourt at the foot of the steps and the terrace
  // under the façade with the old nave behind it; the steps and their two narrow landings are the way between, where
  // nobody fights (the landings are 3 m deep)
  zones: [
    { id: 'forecourt', name: '前地', en: 'FORECOURT', y: 0, box: [-RUINS.halfW, 9, RUINS.halfW, RUINS.halfD] },
    { id: 'terrace', name: '平台', en: 'TERRACE', y: 4.8, box: [-RUINS.terrace, -RUINS.halfD, RUINS.terrace, -12] },
  ],
  start: [-3, 21],
  ground: ruinsGround,
  slope: ruinsSlope, // a barrel knocked over on the steps rolls down them (level.js Barrel)
  steps: { profile: RUINS.profile, flights: RUINS.flights }, // the ground's profile and the steps in each flight (the map export)
  cutaway: true,
  theme: {
    bg: 0x0b0a10,
    fog: [0x120e14, 0.011],
    hemi: [0x7a6c78, 0x14100e, 0.72],
    moon: [0xb8c0ff, 0.5],
    sunDir: [-14, 36, 20],
    // warm floodlights on the façade and the steps, a cooler one over the forecourt
    points: [
      [0xffc27a, -8, 9, -15, 70, 22],
      [0xffc27a, 9, 9, -15, 70, 22],
      [0xffb060, 0, 7, -1, 55, 18],
      [0xc8d4ff, 2, 6.5, 19, 55, 22],
    ],
    rain: false,
    bloom: { strength: 0.8, threshold: 0.82 },
  },
  floor: 'concrete',
  edges: null, // the shop rows, the slopes and the façade close it in; the lanes and the forecourt's south side are open
  solids: [
    ...RUINS_WALLS,
    // the forecourt: stone planters, low cover (two long ones where the shop rows open: no stalls, whose model is a
    // hundred meshes, two hundred draw calls with their shadows)
    [-9, 19.5, 2.6, 1.2, 0.9, 'planter'],
    [7.5, 22, 1.2, 2.6, 0.9, 'planter'],
    [2.5, 13.5, 2.6, 1.2, 0.9, 'planter'],
    [-12.5, 26, 2.8, 1.4, 1.1, 'planter'],
    [12.5, 12.5, 1.4, 2.8, 1.1, 'planter'],
    // up the steps: urns on the landings (their tops counted from the ground: a landing's height and a metre)
    [-6, 2.5, 1.2, 1.2, 1.6 + 1, 'planter'],
    [7, 2.5, 1.2, 1.2, 1.6 + 1, 'planter'],
    [-1.5, -5.5, 2.6, 1.0, 3.2 + 1, 'planter'],
    // the terrace: low walls before the façade and a planter
    [-6.5, -18.5, 4, 0.7, 4.8 + 0.9, 'facade'],
    [8, -16, 1.4, 1.4, 4.8 + 1, 'planter'],
    // the nave behind the façade: the stumps of two of its columns, the low wall round the crypt's stair
    [-5, -25.2, 1.1, 1.1, 4.8 + 1.1, 'facade'],
    [5, -25.2, 1.1, 1.1, 4.8 + 1.1, 'facade'],
    [0, -26.9, 4.4, 1.4, 4.8 + 0.8, 'facade'],
  ],
  // on the forecourt, and on the steps (shot or kicked, one there rolls down: ROLLING); one at the top of the steps to kick
  barrels: [[-11, 23.5, 'lpg'], [14.5, 14.8, 'lpg'], [-4.5, 15, 'barrel'], [6.5, 25.5, 'barrel'], [-9, 6.5, 'barrel'], [9, -1.5, 'barrel'], [-4, -9.5, 'barrel'], [4.5, -12.8, 'barrel']],
  pans: [[-14, 27.5], [-10.4, 25], [13.8, 11]],
  tools: [[-14.5, 22, 'extinguisher']],
  spots: { barrels: [[5.5, 18.5], [-1, 26.5], [-15, 11], [15, 19], [3.5, 6], [-9.5, -9]], pans: [[3.5, 27], [-6.5, 12], [9, 17], [-15.5, 17]], tools: [[2.2, 24], [14.5, 25.5], [-6, 26]] },
  fixtures: [
    [-5.5, 11, 'lamp'],
    [6, 17.5, 'lamp'],
    [-16.6, 23, 'sign', 90],
    [16.6, 18.5, 'sign', 270],
  ],
  pads: [[0, 20.5], [0, -15]],
  stages: [
    { name: '前地', en: 'FORECOURT', at: [-2.5, 17.5], move: 'pan' },
    { name: '花槽', en: 'PLANTERS', at: [-9, 21.4], move: 'boom' },
    { name: '平台', en: 'THE TERRACE', at: [-7, -15], move: 'boom' }, // on the terrace (同一水平: the landings are the way up, not a place to fight)
    { name: '牌坊下', en: 'UNDER THE FAÇADE', at: [3, -19.8], move: 'slide' },
  ],
  spawns: [
    { x: -8, z: 29.4, ex: -8, ez: 27, kind: 'gate' }, // the forecourt's south side
    { x: 9, z: 29.4, ex: 9, ez: 27, kind: 'gate' },
    { x: -19.4, z: 16.5, ex: -15.5, ez: 16.5, kind: 'gate' }, // the lanes into the forecourt
    { x: 19.4, z: 22.5, ex: 15.5, ez: 22.5, kind: 'gate' },
    { x: -19.4, z: -14.25, ex: -13.5, ez: -14.25, kind: 'gate' }, // the side streets up to the terrace
    { x: 19.4, z: -14.25, ex: 13.5, ez: -14.25, kind: 'gate' },
  ],
  decorate(L) {
    ruinsDecorate(L);
  },
};

/** The steps and the façade, stylised, in few meshes (merged boxes). */
function ruinsDecorate(L) {
  const { halfW: W, stairs: S, terrace: T, profile: P, flights, facade: F, doors, nave } = RUINS;
  const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.85, ...o }));
  const boxes = (list, mat, cast = false) => {
    if (!list.length) return null;
    const mesh = new THREE.Mesh(L.own(mergeGeometries(list.map(([x, y, z, w, h, d]) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)))), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    return L.add(mesh);
  };
  const stone = std({ color: 0xb8a58a, roughness: 0.92 });
  // the steps: each flight's treads stacked from the forecourt's level, the landings and the terrace flat between
  const steps = [];
  let f = 0;
  for (let i = 1; i < P.length; i++) {
    const [z0, y0] = P[i - 1];
    const [z1, y1] = P[i];
    if (y1 === y0) {
      steps.push([0, 0, (z0 + z1) / 2, 2 * S, y0, z0 - z1]); // a landing
      continue;
    }
    const n = flights[f++];
    const run = (z0 - z1) / n;
    for (let k = 0; k < n; k++) steps.push([0, 0, z0 - run * (k + 0.5), 2 * S, y0 + ((y1 - y0) * (k + 1)) / n, run]);
  }
  const top = P[P.length - 1];
  steps.push([0, 0, (top[0] + F) / 2, 2 * T, top[1], top[0] - F]); // the terrace
  steps.push([0, 0, (F + nave[1]) / 2, 2 * nave[0], top[1], F - nave[1]]); // the nave's floor behind the façade
  boxes(steps, stone);
  // the slopes beside the steps: rough stone walls with greenery along their tops
  const slopeMat = std({ color: 0x6d6457, roughness: 0.95 });
  const green = [];
  for (const sd of L.solids) {
    if (sd.matKey !== 'slope') continue;
    sd.mesh.material = slopeMat;
    green.push([(sd.minX + sd.maxX) / 2, sd.h, (sd.minZ + sd.maxZ) / 2, sd.maxX - sd.minX - 0.3, 0.5, sd.maxZ - sd.minZ - 0.3]);
  }
  boxes(green, std({ color: 0x2e4a2a, roughness: 1 }));
  // the façade: four tiers of columns and cornices over three doorways, a pediment at the top, lit warm from below
  const face = std({ color: 0xc9b392, roughness: 0.9 });
  const front = F + 0.6; // its south face
  const y0 = top[1];
  const parts = [];
  const tiers = [5.2, 4.4, 4, 3.2];
  let y = y0;
  tiers.forEach((h, t) => {
    const width = [26, 24, 18, 10][t];
    for (let c = 0; c <= 6; c++) {
      const x = -width / 2 + (width * c) / 6;
      if (t === 0 && doors.some(([dx, dw]) => Math.abs(x - dx) < dw / 2 + 0.4)) continue; // none in a doorway
      parts.push([x, y, front + 0.25, 0.7, h, 0.5]); // a column
    }
    parts.push([0, y + h - 0.35, front + 0.3, width + 1, 0.35, 0.6]); // the cornice over the tier
    y += h;
  });
  parts.push([0, y, front + 0.2, 6, 1.6, 0.4], [0, y + 1.6, front + 0.2, 2.4, 1.2, 0.4]); // the pediment
  // over each doorway the wall goes on up (the pieces of the wall stand between them), a frame round it
  for (const [x, w, h] of doors) {
    parts.push([x, y0 + h, F, w, 18 - h, 1.2]);
    parts.push([x - w / 2 - 0.15, y0, front + 0.08, 0.3, h + 0.3, 0.16], [x + w / 2 + 0.15, y0, front + 0.08, 0.3, h + 0.3, 0.16], [x, y0 + h, front + 0.08, w + 0.6, 0.3, 0.16]);
  }
  boxes(parts, face, true);
  for (const sd of L.solids) if (sd.matKey === 'facade') sd.mesh.material = face;
  // the steel that holds the façade up from behind, against its back
  const steel = [];
  for (const x of [-15, -10.5, 10.5, 15]) steel.push([x, y0, F - 0.75, 0.3, 17, 0.3]); // its posts rise out of the hill
  for (const ht of [6, 12]) steel.push([0, y0 + ht, F - 0.75, 2 * W - 2, 0.3, 0.3]);
  boxes(steel, std({ color: 0x3a3d42, roughness: 0.6, metalness: 0.5 }), true);
  // the shop rows: brick, the names made up
  for (const [x, z, ry, name, en] of [
    [-17, 12, Math.PI / 2, '雲記餅家', 'WAN KEE BAKERY'],
    [17, 27, -Math.PI / 2, '利來肉乾', 'LEI LOI JERKY'],
  ]) {
    sign(
      L,
      [
        { text: name, font: HAN(96), color: '#ffe2b0', y: 112 },
        { text: en, font: 'bold 44px "Bebas Neue", Impact, sans-serif', color: '#3fe6ff', y: 206 },
      ],
      4,
      1,
      x + Math.sign(-x) * 0.06,
      3.4,
      z,
      ry,
      1.6,
    );
  }
  cityBackdrop(L, { facade: false, keepOut: [W + 8, RUINS.halfD + 8] });
}

export const MAPS = [rooftop, club, docks, senado, felicidade, guia, ruins];

/**
 * How a run plays apart from the maps, as a revision: up one whenever a change to the game's own rules makes the same
 * input play another run. 1: the weapon pads fill once a stage, fewer and emptier dropped guns (config.js FIREPOWER).
 */
export const PLAY_REV = 1;

/**
 * The game's revision as one byte, for the input record (replay.js): the sum of every map's `rev` and PLAY_REV. A
 * replay of a run on maps since rebuilt, or under rules since changed (another MAPS_REV), still plays, but no longer
 * as it was played; the game says so.
 */
export const MAPS_REV = (MAPS.reduce((s, m) => s + m.rev, 0) + PLAY_REV) % 256;
