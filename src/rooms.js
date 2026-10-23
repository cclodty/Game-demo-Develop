// Rooms (彈幕試驗 ②): where the bullet-hell trial is played. A room is data in
// one template format, and room() turns it into what level.js loads, a map as
// maps.js's are: the walls round it (the camera's side low), a door on a wall
// for each way in (the spawns), round tables (low cover: they stop bullets),
// dim-sum trolleys (the hand trolley, a steamer stack on its deck: kicked, it
// rolls and bowls men over). The whole room is on the screen at once (the
// camera holds its middle, `camera.room`; test/rooms.test.mjs) and its floor
// is dark and grey, so bullets stand out on it. A later card chains rooms.
//
// The rooms are the kinds of place found all over Macau, not real ones: no
// names on them (CLAUDE.md: real places, fictional everything else).
//
// Template: { id, rev, name, en, desc, color, size: [w, d] inside the walls (m),
//   walls: [height, material, trim] (level.js mat keys), low: [height, sides]: the walls on the camera's sides (the south,
//   and the west the 45° side view looks in from) this high, so it looks in over them,
//   doors: [[side, at]]: 'n' | 's' | 'w' | 'e' and where along it from its middle (m),
//   tables: [[x, z, r]] round tables (an octagon of radius r for collision, 0.8 m high),
//   trolleys: [[x, z, angle]], start: [x, z], theme (four point lights, as every map), floor, budget,
//   camera: { room: { at: [x, z] the middle it holds, back: m it sits back towards the camera, lean: how far it leans
//   towards the player }, dist } }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TABLE_H = 0.8; // a round table's height: low cover

/** An octagon of radius r round (x, z): a round table's collision. */
function octagon(x, z, r) {
  return Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    return [x + Math.cos(a) * r, z + Math.sin(a) * r];
  });
}

/** A door on side `side`, `at` m along it from its middle: where a man comes in (the wall's inner face) and the spot 2.2 m in. */
function doorSpawn(side, at, halfW, halfD) {
  const inset = 0.6; // as the club's doors (maps.js): the man starts at the wall's face, the door drawn on it
  if (side === 'n') return { x: at, z: -halfD + inset, ex: at, ez: -halfD + inset + 2.2, kind: 'door' };
  if (side === 's') return { x: at, z: halfD - inset, ex: at, ez: halfD - inset - 2.2, kind: 'door' };
  if (side === 'w') return { x: -halfW + inset, z: at, ex: -halfW + inset + 2.2, ez: at, kind: 'door' };
  return { x: halfW - inset, z: at, ex: halfW - inset - 2.2, ez: at, kind: 'door' };
}

/** What level.js loads for room template `t`. */
export function room(t) {
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  const [h, mat, trim] = t.walls;
  const [lowH, lowSides] = t.low;
  const wall = (side) => [lowSides.includes(side) ? lowH : h, mat, trim];
  return {
    id: t.id,
    rev: t.rev,
    name: t.name,
    en: t.en,
    desc: t.desc,
    color: t.color,
    size: [halfW, halfD],
    zones: [{ id: 'room', name: t.name, en: t.en, y: 0, box: [-halfW, -halfD, halfW, halfD] }], // one floor, one level
    start: t.start,
    theme: t.theme,
    floor: t.floor,
    edges: { n: wall('n'), s: wall('s'), w: wall('w'), e: wall('e') },
    solids: [],
    tools: t.trolleys.map(([x, z, angle]) => [x, z, 'trolley', angle, 'dimsum']),
    spawns: t.doors.map(([side, at]) => doorSpawn(side, at, halfW, halfD)),
    camera: t.camera,
    budget: t.budget,
    room: t, // the template itself (tests; the rooms a later card chains)
    decorate(L) {
      decorateRoom(L, t);
    },
  };
}

/** The tables (their collision and their looks, merged by material) and the walls' dressing. */
function decorateRoom(L, t) {
  const std = (o) => L.own(new THREE.MeshStandardMaterial({ roughness: 0.8, ...o }));
  const cloth = std({ color: 0x7a4a44, roughness: 0.95 }); // dusty red, not white: a bullet over a table still stands out
  const wood = std({ color: 0x3a2016, roughness: 0.6 });
  const gold = std({ color: 0xc9a24a, roughness: 0.4, metalness: 0.6 });
  const lantern = std({ color: 0xb8231c, emissive: 0xff3a1a, emissiveIntensity: 0.8, roughness: 0.6 });
  const merged = (parts, mat, cast = true) => {
    if (!parts.length) return;
    const mesh = new THREE.Mesh(L.own(mergeGeometries(parts)), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    L.add(mesh);
  };
  const tops = [];
  const legs = [];
  const turns = [];
  for (const [x, z, r] of t.tables) {
    L.addPoly(octagon(x, z, r), TABLE_H, 'wall');
    tops.push(new THREE.CylinderGeometry(r + 0.05, r + 0.12, 0.1, 20).translate(x, TABLE_H - 0.05, z)); // the cloth falls a little over the edge
    turns.push(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.04, 16).translate(x, TABLE_H + 0.02, z)); // the turntable in the middle
    legs.push(new THREE.CylinderGeometry(0.12, 0.3, TABLE_H - 0.1, 8).translate(x, (TABLE_H - 0.1) / 2, z));
    // stools round it, only drawn: low, so a bullet over them is a bullet over the floor
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      legs.push(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 10).translate(x + Math.cos(a) * (r + 0.45), 0.225, z + Math.sin(a) * (r + 0.45)));
    }
  }
  merged(tops, cloth);
  merged(turns, wood);
  merged(legs, wood);
  // the tall walls (north, east): a gold rail along them at waist height, and paper lanterns hung on them (over the
  // walls, never over the floor: nothing between the camera and a bullet)
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  const tall = ['n', 's', 'w', 'e'].filter((side) => !t.low[1].includes(side));
  const rails = [];
  const lamps = [];
  const lamp = (x, z) => lamps.push(new THREE.SphereGeometry(0.32, 12, 8).scale(1, 1.25, 1).translate(x, t.walls[0] - 0.6, z));
  for (const side of tall) {
    if (side === 'n' || side === 's') {
      const z = side === 'n' ? -halfD + 0.03 : halfD - 0.03;
      rails.push(new THREE.BoxGeometry(halfW * 2, 0.08, 0.06).translate(0, 1.1, z));
      for (let x = -halfW + 2.5; x <= halfW - 2.5; x += 4) lamp(x, side === 'n' ? -halfD + 0.4 : halfD - 0.4);
    } else {
      const x = side === 'w' ? -halfW + 0.03 : halfW - 0.03;
      rails.push(new THREE.BoxGeometry(0.06, 0.08, halfD * 2).translate(x, 1.1, 0));
      for (let z = -halfD + 2.5; z <= halfD - 2.5; z += 4) lamp(side === 'w' ? -halfW + 0.4 : halfW - 0.4, z);
    }
  }
  merged(rails, gold, false);
  merged(lamps, lantern, false);
}

/**
 * The teahouse (茶樓): a dining room of round tables, two dim-sum trolleys, a door in each wall; 22 × 15 m inside,
 * all of it on one screen. Warm light from four lamps over the tables, a dark terrazzo floor.
 */
export const TEAHOUSE = room({
  id: 'teahouse',
  rev: 1,
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
  start: [0, 5.5],
  floor: 'teahouse',
  theme: {
    bg: 0x0d0907,
    fog: [0x120c09, 0.004],
    hemi: [0xffe2c4, 0x2a1810, 0.9],
    moon: [0xffd9b0, 0.55],
    sunDir: [-8, 30, 12],
    // four lamps high over the lanes between the tables, not over them: even light, no glare on the cloths
    points: [
      [0xffc68a, -3, 5, -3, 22, 16],
      [0xffc68a, 3, 5, -3, 22, 16],
      [0xffb070, -3, 5, 3, 22, 16],
      [0xffb070, 3, 5, 3, 22, 16],
    ],
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  },
  // the camera holds the room's middle, set back 5 m towards itself, and leans a tenth of the way to the player; 28 m
  // off (CAMERA.dist 22.7): the room's corners on the screen in every view (test/rooms.test.mjs: 0.90 of the half at worst)
  camera: { room: { at: [0, 0], back: 5, lean: 0.1 }, dist: 28 },
  budget: { tris: 120000, calls: 400 }, // rendered per frame, all passes; indoor: 400 (test/maps.test.mjs: 50,397 and 70 at the start)
});

/** Every room, by id. */
export const ROOMS = { teahouse: TEAHOUSE };
