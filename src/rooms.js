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
// names on them (CLAUDE.md: real places, fictional everything else): the
// teahouse's three rooms, and the dai pai dong (大排檔, 彈幕試驗 ⑥), a street
// cooked-food stall's tables in a lane at night.
//
// Template: { id, rev, name, en, desc, color, size: [w, d] inside the walls (m),
//   walls: [height, material, trim] (level.js mat keys), low: [height, sides]: the walls on the camera's sides (the south,
//   and the west the 45° side view looks in from) this high, so it looks in over them,
//   doors: [[side, at]]: 'n' | 's' | 'w' | 'e' and where along it from its middle (m),
//   tables: [[x, z, r]] round tables of radius r (fixtures.js 'table': upright low, kicked over a wall), tableLook:
//   'cloth' (the teahouse's) or 'folding' (the dai pai dong's), trolleys: [[x, z, angle]] (dim-sum trolleys),
//   barrels: [[x, z, variant]] (level.js Barrel: 'lpg' cylinders jet off when kicked), solids: [cover] (maps.js's),
//   dress: 'tea' (stools, gold rails, lanterns) or 'stall' (plastic stools, the stall's iron roof over `stall`: [x, z,
//   w, d] its cooking counter, a solid 1 m high of the 'counter' material), theme (four point lights, as every map), floor, budget,
//   entry: [side, at]: the gate the player comes in by, in a low wall (he starts 1.4 m inside it),
//   exit: [side, at]: the door he goes on by, in a tall wall,
//   posts: [[x, z, coverX?, coverZ?]]: the far side's firing posts (彈幕 ② A①, config.js HELL): where the room's gunners
//   go to stand and fire from, at least four, all in the half of the room away from the entry, each walkable and
//   seeing most of the room (test/hell.test.mjs); with the middle of the table a post stands behind, when it does:
//   that table gone (flipped and shot to bits), the post is given up,
//   boss: the room's boss (maps.js `boss`, boss.js BOSSES: { kind, perches… }), fought on the room's last wave (waves.js);
//   with `danmaku: true` the kind's bullet-hell moves are on (彈幕 ② D①),
//   camera: { room: { at: [x, z] the middle it holds, back: m it sits back towards the camera, lean: how far it leans
//   towards the player }, dist } }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { corrugatedTexture } from './textures.js';

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
    solids: [...(t.solids || []), ...(t.stall ? [[...t.stall, 1.0, 'counter']] : [])],
    barrels: t.barrels || [],
    tools: (t.trolleys || []).map(([x, z, angle]) => [x, z, 'trolley', angle, 'dimsum']),
    fixtures: [...t.tables.map(([x, z, r]) => [x, z, 'table', 0, r, t.tableLook || 'cloth']), [ex, ez, 'exit', ef, ...EXIT_DOOR]],
    spawns: t.doors.map(([side, at]) => doorSpawn(side, at, halfW, halfD)),
    posts: t.posts || [],
    boss: t.boss || null, // its boss, on its last wave (D①)
    camera: t.camera,
    budget: t.budget,
    room: t, // the template itself (tests)
    decorate(L) {
      decorateRoom(L, t, [nx, nz, nf], [ex, ez]);
    },
  };
}

/** The room's dressing, merged by material: the entry gate, then its kind's (`dress`): the tables are fixtures. */
function decorateRoom(L, t, entry, exit) {
  const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.8, ...o }));
  const merged = (parts, mat, cast = true, name = '') => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(L.own(mergeGeometries(parts)), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.name = name;
    L.add(mesh);
  };
  const gold = std({ color: 0xc9a24a, roughness: 0.4, metalness: 0.6 });
  const posts = entryGate(L, entry, std, merged);
  if (t.dress === 'stall') dressStall(L, t, std, merged, posts, gold);
  else dressTea(L, t, exit, std, merged, posts, gold);
}

/** The entry gate in its low wall, shut behind the player; its gold parts (posts, a rail) for the caller to merge with its own. */
function entryGate(L, [nx, nz, nf], std, merged) {
  const gateWood = std({ color: 0x24120a, roughness: 0.5 }); // dark against the wall: a shut gate reads at a glance
  const red = L.own(new THREE.MeshBasicMaterial({ color: 0xff3a2a })); // unlit: the gate's lamps, always lit (it is shut)
  // two gold posts, a dark leaf over the wall's inner face with a gold rail along its top, a red lamp on each post
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
  merged(leaves, gateWood);
  merged(gateLamps, red, false);
  return posts;
}

/** The teahouse's: wooden stools round the tables; on the tall walls a gold rail at waist height and paper lanterns, neither across the exit. */
function dressTea(L, t, [ex, ez], std, merged, posts, gold) {
  const lantern = std({ color: 0xb8231c, emissive: 0xff3a1a, emissiveIntensity: 0.8, roughness: 0.6 });
  const stools = [];
  for (const [x, z, r] of t.tables) {
    // stools round each table, only drawn: low, so a bullet over them is a bullet over the floor
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      stools.push(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 10).translate(x + Math.cos(a) * (r + 0.45), 0.225, z + Math.sin(a) * (r + 0.45)));
    }
  }
  merged(stools, L.mat.teaWood);
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
}

/**
 * The dai pai dong's: plastic stools round the folding tables, red and blue; the stall's counter (a solid) under a
 * corrugated iron roof on two posts, a string of bare bulbs along its edge, woks on the counter. The roof is over the
 * counter only, never over the floor (nothing between the camera and a bullet).
 */
function dressStall(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const stools = [[], []];
  t.tables.forEach(([x, z, r], k) => {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4 + k;
      stools[(i + k) % 2].push(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 8).translate(x + Math.cos(a) * (r + 0.4), 0.21, z + Math.sin(a) * (r + 0.4)));
    }
  });
  merged(stools[0], std({ color: 0xc8302a, roughness: 0.5 }), true, 'plastic-stools');
  merged(stools[1], std({ color: 0x2f5fb0, roughness: 0.5 }));
  const [x, z, w, d] = t.stall;
  const front = z + d / 2; // the counter's edge towards the room
  const roofH = 2.5;
  const iron = L.own(corrugatedTexture(w / 3));
  const roof = new THREE.Mesh(L.own(new THREE.BoxGeometry(w + 0.6, 0.05, d + 0.5)), std({ map: iron, color: 0x6a7686, roughness: 0.6, metalness: 0.4 }));
  roof.position.set(x, roofH + 0.1, z + 0.05);
  roof.rotation.x = 0.1; // falling towards the room
  roof.castShadow = true;
  roof.name = 'stall-roof';
  L.add(roof);
  const legs = [];
  for (const s of [-1, 1]) legs.push(new THREE.BoxGeometry(0.08, roofH, 0.08).translate(x + s * (w / 2 - 0.1), roofH / 2, front - 0.1));
  merged(legs, L.mat.darkMetal, false);
  const bulbs = [];
  for (let bx = x - w / 2 + 0.4; bx <= x + w / 2 - 0.3; bx += 1.1) bulbs.push(new THREE.SphereGeometry(0.09, 8, 6).translate(bx, roofH - 0.18, front + 0.2));
  merged(bulbs, L.own(new THREE.MeshBasicMaterial({ color: 0xffe0a0 })), false, 'bulbs');
  const woks = [];
  for (const k of [-0.3, 0.1]) woks.push(new THREE.SphereGeometry(0.32, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(x + k * w, 1.32, z));
  merged(woks, L.mat.darkMetal);
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

const ROOM_CAMERA = { room: { at: [0, 0], back: 5, lean: 0.1 }, dist: 28 };
const ROOM_BUDGET = { tris: 120000, calls: 400 }; // rendered per frame, all passes; indoor: 400 (test/maps.test.mjs at the start: the teahouse 51,147 and 132, the banquet room 50,023 and 123, the side hall 49,373 and 99, the dai pai dong 66,804 and 111; the tables and the exit, fixtures, are their own meshes)

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
  // the far side: behind the north row's three tables, and the north ends of the two side aisles
  posts: [[-6, -5.2, -6, -3], [0, -5.2, 0, -3], [6, -5.2, 6, -3], [-9.5, -1], [9.5, -1]],
  floor: 'teahouse',
  theme: teaTheme([
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ]),
  // the camera holds the room's middle, set back 5 m towards itself, and leans a tenth of the way to the player; 28 m
  // off (CAMERA.dist 22.7): the room's corners on the screen in every view (test/rooms.test.mjs: 0.90 of the half at worst)
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
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
  // the far side is the east: behind its two small tables, by the east wall, and either side of the big table's far end
  posts: [[8, -3.5, 6, -3.5], [8, 3.5, 6, 3.5], [3, -5.8], [3, 5.8], [8.5, 0]],
  floor: 'teahouse',
  theme: teaTheme([
    [-3.5, -2.5],
    [3.5, -2.5],
    [-3.5, 2.5],
    [3.5, 2.5],
  ]),
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
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
  // the far side is the north: behind its two north tables, the north-west corner by the exit, and the middle
  posts: [[-7.5, -4.6, -7.5, -2.5], [2.5, -4.6, 2.5, -2.5], [-9.8, -1.5], [-3.5, -2.6]],
  floor: 'teahouse',
  theme: teaTheme([
    [-5, -2],
    [5, -2],
    [-5, 2.5],
    [5, 2.5],
  ]),
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The dai pai dong (大排檔, 彈幕試驗 ⑥): a street cooked-food stall's folding tables in a lane at night, red and blue
 * plastic stools round them; the stall's counter along the north wall under its iron roof, LPG cylinders by it and in
 * the lane (kicked, one jets off: ROCKET CAN). In at the south, out at the east. 22 × 15 m, an asphalt floor.
 */
export const DAIPAIDONG = room({
  id: 'daipaidong',
  rev: 1,
  name: '大排檔',
  en: 'DAI PAI DONG',
  desc: '街邊熟食檔，摺枱擋子彈，石油氣罐踢出去會噴射。',
  color: '#ff6a3d',
  size: [22, 15],
  walls: [3.2, 'concrete', null],
  low: [0.9, ['s', 'w']],
  doors: [['n', -9], ['n', 4], ['n', 8], ['e', 3.5]],
  tables: [[-6, -0.5, 0.65], [-1, -3, 0.65], [4, -0.5, 0.65], [-2, 3.5, 0.65], [5.5, 4.5, 0.65]],
  tableLook: 'folding',
  stall: [-3, -6.9, 8, 1.2], // the counter along the north wall, its iron roof over it
  barrels: [[2, -6.9, 'lpg'], [-7.6, -5.4, 'lpg'], [8.6, 0.5, 'lpg']],
  dress: 'stall',
  entry: ['s', -6],
  exit: ['e', -3],
  // the far side is the north: behind the three tables nearest the stall, and the lane's two far corners
  posts: [[-1, -5, -1, -3], [4, -2.4, 4, -0.5], [-6, -2.4, -6, -0.5], [-9.6, -2.5], [9.5, -3]],
  floor: 'asphalt',
  theme: {
    bg: 0x07080c,
    fog: [0x0a0c10, 0.004],
    hemi: [0xb8c8ff, 0x1a140e, 0.75],
    moon: [0x9fb2ff, 0.45],
    sunDir: [-8, 30, 12],
    // four bare bulbs strung over the lane between the tables
    points: [
      [0xffd08a, -4, 4.5, -2, 20, 15],
      [0xffd08a, 3, 4.5, -2, 20, 15],
      [0xffc070, -4, 4.5, 3, 20, 15],
      [0xffc070, 3, 4.5, 3, 20, 15],
    ],
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/** Every room, by id. */
/**
 * The arena (大廳, 彈幕 ② D①): a floor's last room, the floor boss's. The blade queen's for now: four perches in its
 * corners she crouches on between dashes, four small tables for cover from her knives and her rings, the room's men
 * on its first wave as anywhere. 22 × 15 m, in at the south, out at the north.
 */
export const ARENA = room({
  id: 'arena',
  rev: 1,
  name: '大廳',
  en: 'GRAND HALL',
  desc: '層尾的大廳：頭目在四角的高台之間穿梭，四張小枱擋刀氣。',
  color: '#ff2bd0',
  size: [22, 15],
  walls: [3.2, 'teaWall', 'teaTrim'],
  low: [0.9, ['s', 'w']],
  doors: [['n', -5], ['n', 5], ['e', -3], ['e', 3]],
  tables: [[-7, -3, 0.8], [7, -3, 0.8], [-7, 3, 0.8], [7, 3, 0.8]],
  entry: ['s', 0],
  exit: ['n', 0],
  // the far side: behind the north pair of tables, and the north ends of the side aisles
  posts: [[-7, -5.2, -7, -3], [7, -5.2, 7, -3], [-9.5, -1], [9.5, -1]],
  // the blade queen (boss.js BLADE) with her bullet-hell moves (`danmaku`): knives from a perch, a ring of slow blades as she lands on one
  boss: { kind: 'blade', danmaku: true, perches: [[-8.5, -5.5], [8.5, -5.5], [-8.5, 5], [8.5, 5]] },
  floor: 'teahouse',
  theme: teaTheme([
    [-4, -3],
    [4, -3],
    [-4, 3],
    [4, 3],
  ]),
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The back hall (後廳, 彈幕 ② D②): the heavy gunner's. He comes in by the north door and walks after the player; a big
 * round table in the middle to circle round him to his open back, two small ones for cover from his sweep and his
 * slow wall. 22 × 15 m, in at the south, out at the north.
 */
export const BACKHALL = room({
  id: 'backhall',
  rev: 1,
  name: '後廳',
  en: 'BACK HALL',
  desc: '層尾的後廳：重炮由北門踏入，繞着大圓枱走到他背後。',
  color: '#ff8a2a',
  size: [22, 15],
  walls: [3.2, 'teaWall', 'teaTrim'],
  low: [0.9, ['s', 'w']],
  doors: [['n', -5], ['n', 5], ['e', -3], ['e', 3]],
  tables: [[0, 0, 1.4], [-6.5, -3.5, 0.8], [6.5, -3.5, 0.8]], // the small ones clear of the east doors' way in (8.2, -3)
  entry: ['s', 0],
  exit: ['n', 0],
  // the far side: behind the north pair of small tables, and the north ends of the side aisles
  posts: [[-6.5, -5.5, -6.5, -3.5], [6.5, -5.5, 6.5, -3.5], [-9.5, -1], [9.5, -1]],
  // the heavy gunner (boss.js GUNNER) with his slow wall (`danmaku`): in through the exit's wall from beyond it
  boss: { kind: 'gunner', danmaku: true, from: [0, -9.5], at: [0, -5] },
  floor: 'teahouse',
  theme: teaTheme([
    [-4, -3],
    [4, -3],
    [-4, 3],
    [4, 3],
  ]),
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The strongroom (庫房, 彈幕 ② D③): the bulwark's. He comes in by the north door and bashes; two medium tables to
 * duck behind and come out at his side or his back, the way 大三巴's doorways do. 22 × 15 m, in at the south, out at
 * the north.
 */
export const STRONGROOM = room({
  id: 'strongroom',
  rev: 1,
  name: '庫房',
  en: 'STRONGROOM',
  desc: '層尾的庫房：鐵盾由北門踏入，兩張枱繞到他側面。',
  color: '#ffb02a',
  size: [22, 15],
  walls: [3.2, 'teaWall', 'teaTrim'],
  low: [0.9, ['s', 'w']],
  doors: [['n', -5], ['n', 5], ['e', -3], ['e', 3]],
  tables: [[-4.5, 0, 1.1], [4.5, 0, 1.1]],
  entry: ['s', 0],
  exit: ['n', 0],
  // the far side: the north ends of the aisles outside and between the two tables
  posts: [[-8.5, -5], [8.5, -5], [0, -5], [-9.5, -1], [9.5, -1]],
  // the bulwark (boss.js BULWARK) with his slow wall (`danmaku`): in through the exit's wall from beyond it
  boss: { kind: 'bulwark', danmaku: true, from: [0, -9.5], at: [0, -5] },
  floor: 'teahouse',
  theme: teaTheme([
    [-4, -3],
    [4, -3],
    [-4, 3],
    [4, 3],
  ]),
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The front hall (前廳, 彈幕 ② D④): the marksman's and the shotgunner's, two at once (boss.js Duo). The marksman has
 * six posts round the room, the shotgunner comes in by the north; two tables to break the line and the fan. 22 × 15 m,
 * in at the south, out at the north.
 */
export const FRONTHALL = room({
  id: 'fronthall',
  rev: 1,
  name: '前廳',
  en: 'FRONT HALL',
  desc: '層尾的前廳：長槍手在六個角落換位，散彈手追着你，兩張枱擋紅線。',
  color: '#ff5a10',
  size: [22, 15],
  walls: [3.2, 'teaWall', 'teaTrim'],
  low: [0.9, ['s', 'w']],
  doors: [['n', -5], ['n', 5], ['e', -3], ['e', 3]],
  tables: [[-5, -2, 0.9], [5, 2, 0.9]],
  entry: ['s', 0],
  exit: ['n', 0],
  // the far side: the north ends of the aisles, and behind the north table
  posts: [[-8.5, -5.5], [8.5, -5.5], [0, -5.5], [-5, -4.5, -5, -2], [9.5, -1]],
  // the pair (boss.js DUO): the marksman's posts round the room, the shotgunner in through the exit's wall with his slow wall (`danmaku`);
  // their combo RED LINE RUSH as on Senado
  boss: {
    kind: 'duo',
    pair: [
      { kind: 'marksman', from: [0, -9.5], posts: [[-9, -5.5], [9, -5.5], [-9, 5.5], [9, 5.5], [0, -6], [0, 6]] },
      { kind: 'buckshot', danmaku: true, from: [0, -9.5], at: [0, -4] },
    ],
    combo: { name: '紅線衝鋒', en: 'RED LINE RUSH', hint: '閃出紅線：散彈手衝入去，長槍打中他', wait: 6 },
  },
  floor: 'teahouse',
  theme: teaTheme([
    [-4, -3],
    [4, -3],
    [-4, 3],
    [4, 3],
  ]),
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

export const ROOMS = { teahouse: TEAHOUSE, banquet: BANQUET, sidehall: SIDEHALL, daipaidong: DAIPAIDONG, arena: ARENA, backhall: BACKHALL, strongroom: STRONGROOM, fronthall: FRONTHALL };

/**
 * A run's floors (waves.js MODES `floor`: { first, pool, floors, rooms: [least, most], boss: a room id or ids }, 彈幕 ② C①): `floors` of
 * them, each `rooms` rooms (how many, the rng's), none twice on a floor; the first floor opens with `first`, the others
 * draw from `first` and `pool` alike, in an order drawn from `rng` (the run's own stream: the same seed, the same
 * floors). Arrays of room ids, one an floor.
 */
export function drawFloors(spec, rng) {
  const [least, most] = spec.rooms;
  const all = [spec.first, ...spec.pool];
  const shuffled = (ids) => {
    const a = ids.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const floors = [];
  for (let f = 0; f < spec.floors; f++) {
    const n = Math.min(all.length, rng.int(least, most));
    const rooms = f === 0 ? [spec.first, ...shuffled(spec.pool).slice(0, n - 1)] : shuffled(all).slice(0, n);
    if (spec.boss) rooms.push(Array.isArray(spec.boss) ? spec.boss[rng.int(0, spec.boss.length - 1)] : spec.boss); // the floor ends in a boss's room, one of them drawn (D①, D②)
    floors.push(rooms);
  }
  return floors;
}

/** The floors as one run of rooms, in order (main.js `floor`). */
export function drawFloor(spec, rng) {
  return drawFloors(spec, rng).flat();
}
