// Rooms (彈幕試驗 ②): where the bullet-hell trial is played. A room is data in
// one template format, and room() turns it into what level.js loads, a map as
// maps.js's are: the walls round it (the camera's side low), a door on a wall
// for each way in (the spawns), round tables (fixtures.js 'table': low, shots
// fly over them until the player's kick flips one into a wall), dim-sum trolleys (the hand trolley, a steamer stack on its deck: kicked, it
// rolls and bowls men over). The whole room is on the screen at once (the
// camera holds its middle, `camera.room`; test/rooms.test.mjs) and its floor
// is dark and grey, so bullets stand out on it.
//
// A run is a floor of rooms (彈幕試驗 ⑤, drawFloor; test/floor.test.mjs): the
// player comes in at a room's entry (a gate in a low wall, shut behind him) and
// goes on through its exit (fixtures.js 'exit', a door in a tall wall), locked
// until the room's waves are down.
//
// The rooms are the kinds of place found all over Macau, not real ones: no
// names on them (CLAUDE.md: real places, fictional everything else).
//
// Template: { id, rev, name, en, desc, color, size: [w, d] inside the walls (m),
//   walls: [height, material, trim] (level.js mat keys), low: [height, sides]: the walls on the camera's sides (the south,
//   and the west the 45° side view looks in from) this high, so it looks in over them,
//   doors: [[side, at]]: 'n' | 's' | 'w' | 'e' and where along it from its middle (m),
//   tables: [[x, z, r]] round tables of radius r (fixtures.js 'table': upright low, kicked over a wall),
//   trolleys: [[x, z, angle]], theme (four point lights, as every map), floor, budget,
//   entry: [side, at]: the gate the player comes in by, in a low wall (he starts 1.4 m inside it),
//   exit: [side, at]: the door he goes on by, in a tall wall,
//   camera: { room: { at: [x, z] the middle it holds, back: m it sits back towards the camera, lean: how far it leans
//   towards the player }, dist } }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A door on side `side`, `at` m along it from its middle: where a man comes in (the wall's inner face) and the spot 2.2 m in. */
function doorSpawn(side, at, halfW, halfD) {
  const inset = 0.6; // as the club's doors (maps.js): the man starts at the wall's face, the door drawn on it
  if (side === 'n') return { x: at, z: -halfD + inset, ex: at, ez: -halfD + inset + 2.2, kind: 'door' };
  if (side === 's') return { x: at, z: halfD - inset, ex: at, ez: halfD - inset - 2.2, kind: 'door' };
  if (side === 'w') return { x: -halfW + inset, z: at, ex: -halfW + inset + 2.2, ez: at, kind: 'door' };
  return { x: halfW - inset, z: at, ex: halfW - inset - 2.2, ez: at, kind: 'door' };
}

/** Where on its wall's inner face a door `at` m along side `side` is, and the way it faces into the room (fixtures.js facing: 0 south, 90 east). */
function wallPoint(side, at, halfW, halfD) {
  if (side === 'n') return [at, -halfD, 0];
  if (side === 's') return [at, halfD, 180];
  if (side === 'w') return [-halfW, at, 90];
  return [halfW, at, 270];
}

const EXIT_DOOR = [1.8, 2.5]; // the exit's width and height (m)
const ENTRY_IN = 1.4; // m inside its entry the player starts

/** What level.js loads for room template `t`. */
export function room(t) {
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  const [h, mat, trim] = t.walls;
  const [lowH, lowSides] = t.low;
  const wall = (side) => [lowSides.includes(side) ? lowH : h, mat, trim];
  const [ex, ez, ef] = wallPoint(...t.exit, halfW, halfD);
  const [nx, nz, nf] = wallPoint(...t.entry, halfW, halfD);
  const round = (v) => Math.round(v * 100) / 100;
  const start = [round(nx + Math.sin((nf * Math.PI) / 180) * ENTRY_IN), round(nz + Math.cos((nf * Math.PI) / 180) * ENTRY_IN)];
  return {
    id: t.id,
    rev: t.rev,
    name: t.name,
    en: t.en,
    desc: t.desc,
    color: t.color,
    size: [halfW, halfD],
    zones: [{ id: 'room', name: t.name, en: t.en, y: 0, box: [-halfW, -halfD, halfW, halfD] }], // one floor, one level
    start,
    entry: [nx, nz, nf], // the gate in, on its wall (drawn only: shut behind the player)
    theme: t.theme,
    floor: t.floor,
    edges: { n: wall('n'), s: wall('s'), w: wall('w'), e: wall('e') },
    solids: [],
    tools: t.trolleys.map(([x, z, angle]) => [x, z, 'trolley', angle, 'dimsum']),
    fixtures: [...t.tables.map(([x, z, r]) => [x, z, 'table', 0, r]), [ex, ez, 'exit', ef, ...EXIT_DOOR]],
    spawns: t.doors.map(([side, at]) => doorSpawn(side, at, halfW, halfD)),
    camera: t.camera,
    budget: t.budget,
    room: t, // the template itself (tests)
    decorate(L) {
      decorateRoom(L, t, [nx, nz, nf], [ex, ez]);
    },
  };
}

/** The stools round the tables (the tables are fixtures), the entry gate and the walls' dressing, merged by material. */
function decorateRoom(L, t, [nx, nz, nf], [ex, ez]) {
  const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.8, ...o }));
  const gold = std({ color: 0xc9a24a, roughness: 0.4, metalness: 0.6 });
  const lantern = std({ color: 0xb8231c, emissive: 0xff3a1a, emissiveIntensity: 0.8, roughness: 0.6 });
  const gateWood = std({ color: 0x24120a, roughness: 0.5 }); // dark against the red wall: a shut gate reads at a glance
  const red = L.own(new THREE.MeshBasicMaterial({ color: 0xff3a2a })); // unlit: the gate's lamps, always lit (it is shut)
  const merged = (parts, mat, cast = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(L.own(mergeGeometries(parts)), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    L.add(mesh);
  };
  const stools = [];
  for (const [x, z, r] of t.tables) {
    // stools round each table, only drawn: low, so a bullet over them is a bullet over the floor
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      stools.push(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 10).translate(x + Math.cos(a) * (r + 0.45), 0.225, z + Math.sin(a) * (r + 0.45)));
    }
  }
  merged(stools, L.mat.teaWood);
  // the entry gate in its low wall, shut behind the player: two gold posts, a dark leaf over the wall's inner face
  // with a gold rail along its top, a red lamp on each post
  const posts = [];
  const leaves = [];
  const gateLamps = [];
  const gate = (g) => g.rotateY((nf * Math.PI) / 180).translate(nx, 0, nz);
  for (const s of [-1, 1]) {
    posts.push(gate(new THREE.BoxGeometry(0.16, 1.3, 0.16).translate(s * 0.88, 0.65, 0.08)));
    gateLamps.push(gate(new THREE.BoxGeometry(0.2, 0.14, 0.2).translate(s * 0.88, 1.37, 0.08)));
  }
  posts.push(gate(new THREE.BoxGeometry(1.6, 0.06, 0.08).translate(0, 0.98, 0.06)));
  leaves.push(gate(new THREE.BoxGeometry(1.6, 0.9, 0.06).translate(0, 0.5, 0.05)));
  // the tall walls (north, east): a gold rail along them at waist height, and paper lanterns hung on them (over the
  // walls, never over the floor: nothing between the camera and a bullet); neither across the exit
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  const tall = ['n', 's', 'w', 'e'].filter((side) => !t.low[1].includes(side));
  const rails = [];
  const lamps = [];
  const lamp = (x, z) => {
    if (Math.hypot(x - ex, z - ez) > 1.8) lamps.push(new THREE.SphereGeometry(0.32, 12, 8).scale(1, 1.25, 1).translate(x, t.walls[0] - 0.6, z));
  };
  // a rail from a to b along a wall, broken where the exit is (`along`: the exit's place along this wall, or null)
  const rail = (a, b, along, make) => {
    const gap = EXIT_DOOR[0] / 2 + 0.2;
    const runs = along === null ? [[a, b]] : [[a, along - gap], [along + gap, b]];
    for (const [p, q] of runs) if (q - p > 0.1) rails.push(make(q - p, (p + q) / 2));
  };
  for (const side of tall) {
    if (side === 'n' || side === 's') {
      const z = side === 'n' ? -halfD + 0.03 : halfD - 0.03;
      rail(-halfW, halfW, t.exit[0] === side ? ex : null, (len, mid) => new THREE.BoxGeometry(len, 0.08, 0.06).translate(mid, 1.1, z));
      for (let x = -halfW + 2.5; x <= halfW - 2.5; x += 4) lamp(x, side === 'n' ? -halfD + 0.4 : halfD - 0.4);
    } else {
      const x = side === 'w' ? -halfW + 0.03 : halfW - 0.03;
      rail(-halfD, halfD, t.exit[0] === side ? ez : null, (len, mid) => new THREE.BoxGeometry(0.06, 0.08, len).translate(x, 1.1, mid));
      for (let z = -halfD + 2.5; z <= halfD - 2.5; z += 4) lamp(side === 'w' ? -halfW + 0.4 : halfW - 0.4, z);
    }
  }
  merged([...rails, ...posts], gold, false);
  merged(lamps, lantern, false);
  merged(leaves, gateWood);
  merged(gateLamps, red, false);
}

/** The teahouse rooms' light: warm, from four lamps high over the lanes between the tables at `at` (not over them: even light, no glare on the cloths). */
function teaTheme(at) {
  return {
    bg: 0x0d0907,
    fog: [0x120c09, 0.004],
    hemi: [0xffe2c4, 0x2a1810, 0.9],
    moon: [0xffd9b0, 0.55],
    sunDir: [-8, 30, 12],
    points: at.map(([x, z], i) => [i < 2 ? 0xffc68a : 0xffb070, x, 5, z, 22, 16]),
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  };
}

const TEA_CAMERA = { room: { at: [0, 0], back: 5, lean: 0.1 }, dist: 28 };
const TEA_BUDGET = { tris: 120000, calls: 400 }; // rendered per frame, all passes; indoor: 400 (test/maps.test.mjs at the start: the teahouse 51,147 and 132, the banquet room 50,023 and 123, the side hall 49,373 and 99; the tables and the exit, fixtures, are their own meshes)

/**
 * The teahouse (茶樓): a dining room of round tables, two dim-sum trolleys, a door in each wall; 22 × 15 m inside,
 * all of it on one screen. Warm light from four lamps over the tables, a dark terrazzo floor.
 */
export const TEAHOUSE = room({
  id: 'teahouse',
  rev: 2, // 2: its entry and exit (彈幕試驗 ⑤)
  name: '茶樓',
  en: 'TEAHOUSE',
  desc: '一間茶樓，圓枱擋子彈，點心車踢得出去撞人。',
  color: '#ff6a3d',
  size: [22, 15],
  walls: [3.2, 'teaWall', 'teaTrim'],
  low: [0.9, ['s', 'w']],
  doors: [['n', -5], ['n', 5], ['e', -3], ['e', 3]], // in the tall walls (a door in a low one would stand over it)
  // two rows of three, 6 m apart across and 6 m between the rows: the lanes between them are where the bullets fly
  tables: [[-6, -3, 0.85], [0, -3, 0.85], [6, -3, 0.85], [-6, 3, 0.85], [0, 3, 0.85], [6, 3, 0.85]],
  trolleys: [[-9, 5.5, 0], [9, -5.5, Math.PI]],
  entry: ['s', 0],
  exit: ['n', 0], // between its two north doors, a table before it
  floor: 'teahouse',
  theme: teaTheme([
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ]),
  // the camera holds the room's middle, set back 5 m towards itself, and leans a tenth of the way to the player; 28 m
  // off (CAMERA.dist 22.7): the room's corners on the screen in every view (test/rooms.test.mjs: 0.90 of the half at worst)
  camera: TEA_CAMERA,
  budget: TEA_BUDGET,
});

/**
 * The banquet room (茶樓廂房): one big round banquet table in the middle (kicked over, a wall 2.8 m long), four small
 * ones about it; in at the west, out at the east, the big table between. 20 × 14 m.
 */
export const BANQUET = room({
  id: 'banquet',
  rev: 1,
  name: '茶樓廂房',
  en: 'BANQUET ROOM',
  desc: '廂房中間一張大圓枱，翻起就是一道長牆。',
  color: '#ff6a3d',
  size: [20, 14],
  walls: [3.2, 'teaWall', 'teaTrim'],
  low: [0.9, ['s', 'w']],
  doors: [['n', -3], ['n', 3], ['e', -5], ['e', 5]],
  tables: [[0, 0, 1.4], [-6, -3.5, 0.8], [6, -3.5, 0.8], [-6, 3.5, 0.8], [6, 3.5, 0.8]],
  trolleys: [[-3, 5.6, 0], [-8, -5.6, Math.PI]],
  entry: ['w', 0],
  exit: ['e', 0],
  floor: 'teahouse',
  theme: teaTheme([
    [-3.5, -2.5],
    [3.5, -2.5],
    [-3.5, 2.5],
    [3.5, 2.5],
  ]),
  camera: TEA_CAMERA,
  budget: TEA_BUDGET,
});

/**
 * The side hall (茶樓偏廳): smaller tables staggered across a long room, so no lane runs straight through it; in at
 * the south-east corner, out at the north-west. 22 × 13 m.
 */
export const SIDEHALL = room({
  id: 'sidehall',
  rev: 1,
  name: '茶樓偏廳',
  en: 'SIDE HALL',
  desc: '偏廳的枱錯開擺，出口在對角。',
  color: '#ff6a3d',
  size: [22, 13],
  walls: [3.2, 'teaWall', 'teaTrim'],
  low: [0.9, ['s', 'w']],
  doors: [['n', -1], ['n', 6], ['e', -3], ['e', 2]],
  tables: [[-7.5, -2.5, 0.75], [2.5, -2.5, 0.75], [-2.5, 2, 0.75], [5, 2, 0.75], [-7.5, 3.5, 0.75]],
  trolleys: [[-3.5, -4.8, 0], [9.5, -5.2, Math.PI]],
  entry: ['s', 7],
  exit: ['n', -7],
  floor: 'teahouse',
  theme: teaTheme([
    [-5, -2],
    [5, -2],
    [-5, 2.5],
    [5, 2.5],
  ]),
  camera: TEA_CAMERA,
  budget: TEA_BUDGET,
});

/** Every room, by id. */
export const ROOMS = { teahouse: TEAHOUSE, banquet: BANQUET, sidehall: SIDEHALL };

/**
 * A run's floor (waves.js MODES `floor`: { first, pool, rooms }): `first`, then `rooms` − 1 of `pool` in an order
 * drawn from `rng` (the run's own stream: the same seed, the same floor). Room ids.
 */
export function drawFloor(spec, rng) {
  const pool = spec.pool.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [spec.first, ...pool.slice(0, spec.rooms - 1)];
}
