// Rooms (彈幕試驗 ②): where the bullet-hell trial is played. A room is data in
// one template format, and room() turns it into what level.js loads, a map as
// maps.js's are: the walls round it (the camera's side low), a door on a wall
// for each way in (the spawns), round tables (fixtures.js 'table': low, shots
// fly over them until the player's kick flips one into a wall), dim-sum trolleys (the hand trolley, a steamer stack on its deck: kicked, it
// rolls and bowls men over). The camera follows the player most of the way from
// the room's middle (`camera.room` with `follow`, config.js CAMERA.roomDist and
// roomLean; test/rooms.test.mjs): since 試玩回饋 ⑥a the room is bigger than the
// screen (it was all on it before). Its floor is dark and grey, so bullets stand out on it.
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
//   flocks: [[x, z]] pigeon flocks resting on the floor (level.js Flock, ambient.js Pigeons: a shot or a runner close by
//   bursts them up, an enemy aiming within ENV.flockReach loses his aim, PIGEON STRIKE), pool: [x, z, r] a round
//   fountain pool, a solid knee-high rim with water in it (level.js `water`: a man knocked over its rim is gone, SPLASH),
//   dress 'plaza' (E①),
//   track: { at: [x, z], r, road, first, every, lanes }: a quarter bend of road about the room's corner (x, z), r m to
//   its middle, `road` m across, in at one wall and out at the other; the racing cars (race.js) sweep it on the room's
//   timetable (`first` s after the room loads, then every `every` s, in world time) on their own `lanes`, the lights red
//   and a line along the road RACE.warn s before (a man run down: GRAND PRIX); dress 'track' (E②),
//   steps: { profile: [[z, y], …], flight: [x0, x1], treads, planter }: the ground's height from south to north (level.js
//   groundY; level beyond the profile's ends), its rise under LEVELS.tol so the room is still one level (同一水平: a
//   gunner on the low ground fires up at the player as anywhere); where it slopes, a barrel shot or kicked over rolls
//   down (level.js Barrel tip: ROLLING); across the slope either side of the flight [x0, x1] a planter `planter` m over
//   the higher ground (low: shots and sight pass over it, bodies and the nav stop at it), so the flight is the one way
//   between the levels; `treads` steps drawn on it; dress 'steps' (E③),
//   shops: { depth, wall, h, door, shutter, list: [{ x: [x0, x1], front: 'door' | 'shutter' }] }: a row of shophouses
//   along the north wall, `depth` m deep behind a front wall `wall` m thick and `h` high, side by side west to east;
//   each one's street opening shut by a door `door` m wide (fixtures.js 'door': the player's kick slams it open, SLAM;
//   a man walking into it pushes it open) or by a roller shutter over one `shutter` m wide (fixtures.js 'shutter': shot
//   or kicked at its lock post it drops, SHUTTER, and shuts the opening till the wave is down); a door in each wall
//   between two shops, so the row is a way through the houses (as 福隆新街's shops are: maps.js felicidadeWalls);
//   cutaway: the camera's see-through hole round the player (main.js), for a room with rooms in it; dress 'shops' (E④),
//   edges: { side: [height, material, trim] } a side's edge other than its wall (the quay's curb: E⑤), water: [{ x, z, w,
//   d }] water beyond it (level.js: a man knocked into it is gone, SPLASH), trolleyLook: the trolleys' (fixtures' Trolley
//   variant: 'dimsum', the teahouse's, by default; 'trolley' the docks' hand trolley), dress 'quay' (E⑤),
//   laundry: { lines: [[x0, z0, x1, z1]], sheet, gap }: washing hung out on bamboo poles, each line along x or z, sheets
//   `sheet` m wide `gap` m apart along it (level.js veils: an enemy cannot see the player through a sheet, a shot goes
//   through it, a kill through one is LAUNDRY DAY), dress 'roof' (E⑥),
//   blackout: { bpm, every, dark }: the club's beat lights (level.js beatAt, on world time from the room's start): the
//   lights out for the last `dark` beats of every `every`, the whole room dark (level.js darkAt: nobody aims, a kill
//   then is a BLACKOUT), the dance floor flashing white the beat before; danceFloor: { at: [x, z], tiles: [cols, rows] }
//   its light tiles, a metre each; dress 'disco' (E⑦),
//   maze: { cols, rows, extra, thin, thick, h, board, post }: the room cut into `cols` × `rows` cells with walls between
//   them drawn afresh for every run (mazeWalls: a way through every cell, then `extra` more openings); of the walls
//   left a share `thin` are boards (`board` m high: shots and a kick break them, level.js BREAKABLE), the rest concrete
//   `h` m high, `thick` m thick; a concrete post `post` m square where cells meet; no posts to fire from (`posts` empty:
//   the men fight as in the arcade); dress 'maze' (試玩回饋 ⑥b),
//   camera: { room: { at: [x, z] the middle it holds, back: m it sits back towards the camera, lean: how far it leans
//   towards the player, or follow: CAMERA.roomLean of the way, from CAMERA.roomDist }, dist } }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Pigeons } from './ambient.js';
import { PLAZA_ROOM, ROOM_SIZE } from './config.js';
import { corrugatedTexture, windowTexture } from './textures.js';

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

/** The rooms' scale (config.js ROOM_SIZE): `?roomscale=` in the address for a run, else the config's. */
const ROOM_SCALE = (() => {
  const q = Number(new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('roomscale'));
  return q > 0 ? q : ROOM_SIZE.scale;
})();

/**
 * Template `t` drawn `k` × as big (試玩回饋 ⑥a): every place in it spread out from the room's middle, side by side
 * (doors, the entry and the exit, tables, trolleys, barrels, cover, posts, flocks, the pool, the stall, the bend, the
 * steps, the shops, the washing, the dance floor, the boss's spots, the lamps); what stands there keeps its
 * size (a table's radius, a crate's box, a door's width), but for what covers ground (the water, a shop's depth, the
 * steps' slope, the bend's radius, the dance floor's tiles). The lamps reach as much farther and shine k² as strong.
 */
function scaled(t, k) {
  if (k === 1) return t;
  const S = (v) => Math.round(v * k * 100) / 100;
  const at = ([x, z, ...rest]) => [S(x), S(z), ...rest];
  const side = ([sd, a]) => [sd, S(a)];
  const spots = (v) => (Array.isArray(v) ? (Array.isArray(v[0]) ? v.map(at) : at(v)) : v);
  const boss = (b) => {
    if (!b || typeof b !== 'object') return b;
    const out = Array.isArray(b) ? b.map(boss) : { ...b };
    if (!Array.isArray(b)) for (const key of ['perches', 'posts', 'from', 'at', 'pad']) if (out[key]) out[key] = spots(out[key]);
    if (out.pair) out.pair = out.pair.map(boss);
    return out;
  };
  const th = t.theme;
  return {
    ...t,
    size: t.size.map(S),
    doors: t.doors.map(side),
    entry: side(t.entry),
    exit: side(t.exit),
    tables: t.tables.map(at),
    trolleys: t.trolleys && t.trolleys.map(at),
    barrels: t.barrels && t.barrels.map(at),
    solids: t.solids && t.solids.map(at),
    posts: t.posts && t.posts.map((p) => p.map(S)),
    flocks: t.flocks && t.flocks.map(at),
    benches: t.benches && t.benches.map(at),
    pool: t.pool && at(t.pool),
    stall: t.stall && at(t.stall),
    water: t.water && t.water.map((w) => ({ ...w, x: S(w.x), z: S(w.z), w: S(w.w), d: S(w.d) })),
    track: t.track && { ...t.track, at: at(t.track.at), r: S(t.track.r) },
    steps: t.steps && { ...t.steps, profile: t.steps.profile.map(([z, y]) => [S(z), y]), flight: t.steps.flight.map(S) },
    shops: t.shops && { ...t.shops, depth: S(t.shops.depth), list: t.shops.list.map((q) => ({ ...q, x: q.x.map(S) })) },
    laundry: t.laundry && { ...t.laundry, lines: t.laundry.lines.map((l) => l.map(S)) },
    danceFloor: t.danceFloor && { at: at(t.danceFloor.at), tiles: t.danceFloor.tiles.map((n) => Math.round(n * k)) },
    boss: boss(t.boss),
    theme: { ...th, fog: [th.fog[0], th.fog[1] / k], points: th.points.map(([c, x, y, z, i, d]) => [c, S(x), y, S(z), Math.round(i * k * k * 10) / 10, S(d)]) },
  };
}

/** What level.js loads for room template `t`, at the rooms' scale (ROOM_SCALE). */
export function room(template) {
  const t = scaled(template, ROOM_SCALE);
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  const [h, mat, trim] = t.walls;
  const [lowH, lowSides] = t.low;
  const wall = (side) => [lowSides.includes(side) ? lowH : h, mat, trim];
  const [ex, ez, ef] = wallPoint(...t.exit, halfW, halfD);
  const [nx, nz, nf] = wallPoint(...t.entry, halfW, halfD);
  const round = (v) => Math.round(v * 100) / 100;
  const start = [round(nx + Math.sin((nf * Math.PI) / 180) * ENTRY_IN), round(nz + Math.cos((nf * Math.PI) / 180) * ENTRY_IN)];
  const shops = t.shops ? shopWalls(t) : { solids: [], fixtures: [] }; // the street's shophouses (E④)
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
    edges: { n: wall('n'), s: wall('s'), w: wall('w'), e: wall('e'), ...(t.edges || {}) },
    solids: [...(t.solids || []), ...(t.stall ? [[...t.stall, 1.0, 'counter']] : []), ...shops.solids],
    barrels: t.barrels || [],
    tools: (t.trolleys || []).map(([x, z, angle]) => [x, z, 'trolley', angle, t.trolleyLook || 'dimsum']),
    fixtures: [...t.tables.map(([x, z, r]) => [x, z, 'table', 0, r, t.tableLook || 'cloth']), [ex, ez, 'exit', ef, ...EXIT_DOOR], ...shops.fixtures],
    cutaway: !!t.cutaway,
    spawns: t.doors.map(([side, at]) => doorSpawn(side, at, halfW, halfD)),
    posts: t.posts || [],
    boss: t.boss || null, // its boss, on its last wave (D①)
    flocks: t.flocks || [], // pigeons (E①)
    water: [...(t.pool ? [{ x: t.pool[0], z: t.pool[1], r: t.pool[2] - 0.35 }] : []), ...(t.water || [])], // the pool's water, inside its rim; the quay's sea
    veils: t.laundry ? laundrySheets(t).map((q) => q.box) : [], // the roof's washing: sight stops at a sheet (E⑥)
    blackout: t.blackout || null, // the club's beat lights (E⑦)
    race: t.track ? { first: t.track.first, every: t.track.every, lanes: t.track.lanes, line: bendLine(t.track) } : null, // the racing cars (E②)
    maze: t.maze ? (rng) => mazeWalls(t, rng) : null, // the maze's walls, drawn for a run by level.js load (⑥b)
    ground: t.steps ? profileGround(t.steps.profile) : null, // the steps' two levels (E③)
    slope: t.steps ? profileSlope(t.steps.profile) : null,
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
  else if (t.dress === 'plaza') dressPlaza(L, t, std, merged, posts, gold);
  else if (t.dress === 'track') dressTrack(L, t, std, merged, posts, gold);
  else if (t.dress === 'steps') dressSteps(L, t, std, merged, posts, gold);
  else if (t.dress === 'shops') dressStreet(L, t, std, merged, posts, gold);
  else if (t.dress === 'quay') dressQuay(L, t, std, merged, posts, gold);
  else if (t.dress === 'roof') dressRoof(L, t, std, merged, posts, gold);
  else if (t.dress === 'disco') dressDisco(L, t, std, merged, posts, gold);
  else if (t.dress === 'maze') dressMaze(L, t, std, merged, posts, gold);
  else dressTea(L, t, exit, std, merged, posts, gold);
}

/**
 * The maze's walls for one run (試玩回饋 ⑥b), drawn from `rng` (level.js load: the run's seed and the room's place in
 * it, so the same seed walks the same maze). The room is cut into `cols` × `rows` cells. First a way through every cell
 * (Kruskal's: the walls between cells in a drawn order, each taken down when it parts two groups of cells not yet
 * joined), so any cell can be walked to from any other, the entry and the exit among them, without breaking a wall;
 * then `extra` more of those left taken down, so there is more than one way round; of the walls still standing, a share
 * `thin` boards and the rest concrete. A concrete post at every corner where four cells meet, the walls between them.
 * Returns the walls and the posts as cover ([x, z, w, d, h, material]: 'mazeWall' or 'partition'), the posts alone, and
 * the cells' edges, each open or not (tests).
 */
function mazeWalls(t, rng) {
  const { cols, rows, extra, thin, thick, h, board, post } = t.maze;
  const [W, D] = t.size;
  const cw = W / cols;
  const cd = D / rows;
  const x0 = -W / 2;
  const z0 = -D / 2;
  const round = (v) => Math.round(v * 1000) / 1000;
  // every wall between two cells: `v` the one east of cell (c, r), else the one south of it
  const edges = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols - 1; c++) edges.push({ a: r * cols + c, b: r * cols + c + 1, c, r, v: true, open: false });
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols; c++) edges.push({ a: r * cols + c, b: (r + 1) * cols + c, c, r, v: false, open: false });
  const order = edges.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const group = Array.from({ length: cols * rows }, (_, i) => i);
  const find = (i) => (group[i] === i ? i : (group[i] = find(group[i])));
  const left = [];
  for (const e of order) {
    const [ga, gb] = [find(e.a), find(e.b)];
    if (ga !== gb) {
      group[ga] = gb;
      e.open = true;
    } else left.push(e);
  }
  for (const e of left.slice(0, extra)) e.open = true;
  const solids = [];
  for (const e of edges) {
    if (e.open) continue;
    const kind = rng.next() < thin ? 'partition' : 'mazeWall';
    const tall = kind === 'partition' ? board : h;
    // from post to post: where a wall meets the room's own wall it runs on to it
    if (e.v) {
      const z1 = z0 + e.r * cd + (e.r > 0 ? post / 2 : 0);
      const z2 = z0 + (e.r + 1) * cd - (e.r + 1 < rows ? post / 2 : 0);
      solids.push([round(x0 + (e.c + 1) * cw), round((z1 + z2) / 2), thick, round(z2 - z1), tall, kind]);
    } else {
      const xa = x0 + e.c * cw + (e.c > 0 ? post / 2 : 0);
      const xb = x0 + (e.c + 1) * cw - (e.c + 1 < cols ? post / 2 : 0);
      solids.push([round((xa + xb) / 2), round(z0 + (e.r + 1) * cd), round(xb - xa), thick, tall, kind]);
    }
  }
  const posts = [];
  for (let c = 1; c < cols; c++) for (let r = 1; r < rows; r++) posts.push([round(x0 + c * cw), round(z0 + r * cd), post, post, h, 'mazeWall']);
  return { solids: [...solids, ...posts], posts, edges, cells: { cols, rows, w: cw, d: cd, x0, z0 } };
}

/**
 * The maze (⑥b): a strip light along the top of every concrete post, so the corners read in the dark; the walls are
 * the level's (level.js addMaze: the concrete merged into one mesh, each board its own, as it breaks).
 */
function dressMaze(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const tube = L.own(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.6) }));
  const caps = [];
  for (const [x, z, w, d, h] of L.maze ? L.maze.posts : []) caps.push(new THREE.BoxGeometry(w + 0.04, 0.06, d + 0.04).translate(x, h + 0.03, z));
  merged(caps, tube, false, 'maze post lights');
}

/**
 * The quay (E⑤): the sea beyond the north curb, a dark plane well below it with the quay's stone face down to it and
 * a line of foam where they meet, bollards along the curb (only drawn: the curb is what stops bodies), the quay's
 * lamps broken into streaks on the water, and the lights of a far shore across it.
 */
function dressQuay(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  const seaY = -1.4;
  const sea = new THREE.Mesh(L.own(new THREE.PlaneGeometry(halfW * 2 + 40, 30)), std({ color: 0x0c2436, emissive: 0x04101a, roughness: 0.12, metalness: 0.5 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, seaY, -halfD - 15.6);
  sea.name = 'sea';
  L.add(sea);
  merged([new THREE.BoxGeometry(halfW * 2 + 1.2, 1.45, 0.4).translate(0, -0.725, -halfD - 0.8)], L.mat.curb, false, 'quay-face');
  merged([new THREE.BoxGeometry(halfW * 2 + 1.2, 0.04, 0.3).translate(0, seaY + 0.03, -halfD - 1.15)], L.own(new THREE.MeshBasicMaterial({ color: 0x6f9fb0 })), false, 'foam');
  const bollards = [];
  for (let x = -halfW + 2; x <= halfW - 2; x += 4) bollards.push(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8).translate(x, 0.45 + 0.25, -halfD - 0.3));
  merged(bollards, L.mat.darkMetal, true, 'bollards');
  // each lamp over the quay and each far light as a column of short streaks on the water, broken up the further out
  const streak = (x, z0, z1, wide) => {
    const out = [];
    for (let z = z0, k = 0; z > z1; z -= 0.55 + k * 0.08, k++) out.push(new THREE.BoxGeometry(wide * (1 - k * 0.06) * (k % 2 ? 0.6 : 1), 0.02, 0.16).translate(x + (k % 3) * 0.12 - 0.12, seaY + 0.02, z));
    return out;
  };
  const glints = [];
  for (const [, x, , z] of t.theme.points) if (z < 0) glints.push(...streak(x, -halfD - 1.6, -halfD - 7.5, 1.1));
  const lights = [];
  for (let x = -halfW - 6, k = 0; x <= halfW + 6; x += 3.7, k++) {
    const lx = x + (k % 2) * 0.9;
    lights.push(new THREE.SphereGeometry(0.18, 8, 6).translate(lx, 0.3 + (k % 3) * 0.4, -halfD - 14));
    if (k % 2 === 0) glints.push(...streak(lx, -halfD - 13.2, -halfD - 9.4, 0.5));
  }
  merged(glints, L.own(new THREE.MeshBasicMaterial({ color: 0x9a6a3a })), false, 'glints');
  merged(lights, L.own(new THREE.MeshBasicMaterial({ color: 0xffc070 })), false, 'far-shore');
}

/**
 * The sheets on the roof's laundry lines (E⑥, `laundry`): along each line as many as fit, `gap` m apart and the row
 * centred on it; each sheet's middle, its width, the way its line runs, and its box (level.js veils: 0.1 m thick).
 */
function laundrySheets(t) {
  const { lines, sheet, gap } = t.laundry;
  const out = [];
  const round = (v) => Math.round(v * 100) / 100;
  for (const [x0, z0, x1, z1] of lines) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const [ux, uz] = [(x1 - x0) / len, (z1 - z0) / len];
    const n = Math.floor((len + gap) / (sheet + gap));
    const first = (len - (n * sheet + (n - 1) * gap)) / 2 + sheet / 2;
    for (let k = 0; k < n; k++) {
      const a = first + k * (sheet + gap);
      const [x, z] = [x0 + ux * a, z0 + uz * a];
      const [hx, hz] = [Math.abs(ux) * (sheet / 2) + Math.abs(uz) * 0.05, Math.abs(uz) * (sheet / 2) + Math.abs(ux) * 0.05];
      out.push({ x, z, w: sheet, along: Math.abs(ux) > 0.5 ? 'x' : 'z', box: [round(x - hx), round(z - hz), round(x + hx), round(z + hz)] });
    }
  }
  return out;
}

/**
 * The rooftop (E⑥): the washing (bamboo poles on iron stands at each line's ends, the sheets in four colours, hung
 * from the pole, some longer than others: what they hide is the level's veils, not these), a strip of pink neon along
 * the stair hut's wall, two aerials on it, and the next towers' lit windows beyond, dimmed (bullets stand out).
 */
function dressRoof(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  const top = 2.05; // the poles' height
  const poles = [];
  const iron = [];
  for (const [x0, z0, x1, z1] of t.laundry.lines) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const pole = new THREE.CylinderGeometry(0.035, 0.035, len + 0.5, 6).rotateZ(Math.PI / 2);
    if (Math.abs(z1 - z0) > Math.abs(x1 - x0)) pole.rotateY(Math.PI / 2);
    poles.push(pole.translate((x0 + x1) / 2, top, (z0 + z1) / 2));
    for (const [x, z] of [[x0, z0], [x1, z1]]) {
      iron.push(new THREE.CylinderGeometry(0.04, 0.04, top + 0.1, 6).translate(x, (top + 0.1) / 2, z));
      iron.push(new THREE.CylinderGeometry(0.22, 0.25, 0.06, 8).translate(x, 0.03, z));
    }
  }
  merged(poles, std({ color: 0xc8a868, roughness: 0.6 }), true, 'bamboo');
  const colours = [0xe9e4d8, 0x6aa8d8, 0xe0806e, 0xf2cc66];
  const cloth = colours.map(() => []);
  laundrySheets(t).forEach((q, k) => {
    const drop = [1.4, 1.0, 1.25][k % 3];
    const geo = q.along === 'x' ? new THREE.BoxGeometry(q.w - 0.06, drop, 0.03) : new THREE.BoxGeometry(0.03, drop, q.w - 0.06);
    cloth[k % colours.length].push(geo.translate(q.x, top - 0.04 - drop / 2, q.z));
  });
  cloth.forEach((parts, k) => merged(parts, std({ color: colours[k], roughness: 0.95 }), true, 'sheets'));
  // the stair hut's wall: a strip of neon, two aerials on top
  merged([new THREE.BoxGeometry(halfW * 1.4, 0.08, 0.06).translate(-halfW * 0.25, 2.7, -halfD + 0.05)], L.mat.neonPink, false, 'neon');
  for (const [x, h] of [[1.5, 3.2], [3.2, 2.4]]) {
    iron.push(new THREE.BoxGeometry(0.05, h, 0.05).translate(x, t.walls[0] + h / 2, -halfD - 0.8));
    iron.push(new THREE.BoxGeometry(1.2, 0.04, 0.04).translate(x, t.walls[0] + h * 0.8, -halfD - 0.8));
  }
  merged(iron, L.mat.darkMetal, true, 'iron');
  // the next towers, north and east: lit windows (no names anywhere)
  const tex = L.own(windowTexture(0.3));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  const towers = [[-14, -20, 9, 8, 18], [-3, -24, 10, 9, 26], [9, -19, 8, 7, 14], [20, -15, 8, 10, 20], [21, -2, 8, 9, 9], [-24, -12, 9, 9, 22]];
  const city = new THREE.InstancedMesh(L.own(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), L.own(new THREE.MeshStandardMaterial({ color: 0x14131c, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.9 })), towers.length);
  const m = new THREE.Matrix4();
  towers.forEach(([x, z, w, d, h], i) => city.setMatrixAt(i, m.makeScale(w, h + 30, d).setPosition(x, -30, z)));
  city.frustumCulled = false;
  city.name = 'towers';
  L.add(city);
}

/**
 * The club (E⑦): the dance floor's light tiles and the room's lights on the room's beat (level.js beatAt: the logic's,
 * so what is shown is what the gunners see): a pattern pulsing on each beat, every tile white the beat before the
 * lights go out, then the tiles and the lamps (to 5%) out for the dark beat; a mirror ball over the floor.
 */
function dressDisco(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const [cols, rows] = t.danceFloor.tiles;
  const [x0, z0] = [t.danceFloor.at[0] - cols / 2, t.danceFloor.at[1] - rows / 2];
  const tiles = new THREE.InstancedMesh(L.own(new THREE.PlaneGeometry(0.92, 0.92).rotateX(-Math.PI / 2)), L.own(new THREE.MeshBasicMaterial()), cols * rows);
  tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols * rows * 3), 3);
  const m = new THREE.Matrix4();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tiles.setMatrixAt(r * cols + c, m.makeTranslation(x0 + 0.5 + c, 0.008, z0 + 0.5 + r));
  tiles.name = 'dance-floor';
  L.add(tiles);
  const ball = new THREE.Mesh(L.own(new THREE.IcosahedronGeometry(0.45, 1)), std({ color: 0xd8d8e8, roughness: 0.15, metalness: 0.9, flatShading: true }));
  ball.position.set(t.danceFloor.at[0], 3, t.danceFloor.at[1]);
  ball.name = 'mirror-ball';
  L.add(ball);
  merged([new THREE.CylinderGeometry(0.015, 0.015, 0.4, 4).translate(t.danceFloor.at[0], 3.4, t.danceFloor.at[1])], L.mat.darkMetal, false, 'ball-wire');
  const pal = [
    [1, 0.12, 0.55],
    [0.1, 0.85, 1],
    [0.55, 0.25, 1],
    [1, 0.55, 0.1],
  ];
  const { every, dark } = t.blackout;
  L.animators.push((realDt) => {
    const [b, f] = L.beatAt();
    const k = b % every;
    const out = k >= every - dark;
    const warn = k === every - dark - 1;
    const fade = 0.3 + 0.7 * (1 - f) * (1 - f);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (out) tiles.setColorAt(i, _tile.setRGB(0, 0, 0));
        else if (warn) tiles.setColorAt(i, _tile.setRGB(fade, fade, fade));
        else {
          const on = (r + c + b) % 2 === 0;
          const [cr, cg, cb] = pal[(Math.floor(b / 2) + (c >> 1)) % pal.length];
          const v = on ? fade : 0.08;
          tiles.setColorAt(i, _tile.setRGB(cr * v, cg * v, cb * v));
        }
      }
    }
    tiles.instanceColor.needsUpdate = true;
    for (const p of L.points) p.light.intensity = p.intensity * (out ? 0.05 : 1);
    L.hemi.intensity = t.theme.hemi[2] * (out ? 0.3 : 1);
    L.moon.intensity = t.theme.moon[1] * (out ? 0.3 : 1);
    ball.rotation.y += realDt * 0.6;
  });
}
const _tile = new THREE.Color();

/**
 * The street's row of shophouses (rooms.js `shops`) as data: each one's front, two pieces either side of its opening,
 * and the door or the shutter that shuts it; between two shops a wall in two pieces and the door between them. The
 * north wall is their back, the room's walls their ends. 福隆新街's shops are built the same way (maps.js).
 */
function shopWalls(t) {
  const { depth, wall: w, h, door, shutter, list } = t.shops;
  const back = -t.size[1] / 2;
  const frontZ = back + depth + w / 2; // the front wall's middle
  const midZ = back + depth / 2; // a shop's room's middle
  const solids = [];
  const fixtures = [];
  list.forEach((shop, i) => {
    const [x0, x1] = shop.x;
    const cx = (x0 + x1) / 2;
    const open = shop.front === 'shutter' ? shutter : door;
    // a shutter's lock post stands clear of the wall (fixtures.js: a prop bullets find): a slot either side too narrow for a body
    const slot = shop.front === 'shutter' ? 0.3 : 0;
    const a = cx - open / 2 - slot;
    const b = cx + open / 2 + slot;
    solids.push([(x0 + a) / 2, frontZ, a - x0, w, h, 'brick'], [(b + x1) / 2, frontZ, x1 - b, w, h, 'brick']);
    if (shop.front === 'shutter') fixtures.push([cx - open / 2, frontZ, 'shutter', 90, open, h - 0.2]);
    else fixtures.push([cx, frontZ, 'door', 0, open, 2.3]);
    if (i + 1 < list.length) {
      const part = (depth - door) / 2;
      for (const j of [-1, 1]) solids.push([x1, midZ + j * (door / 2 + part / 2), w, part, h, 'brick']);
      fixtures.push([x1, midZ, 'door', 90, door, 2.3]);
    }
  });
  return { solids, fixtures };
}

/**
 * The shop street (E④): over each shop's opening a signboard (lit, in its own colour: no names on them) on the
 * front wall's street face, and a strip of light along the top of the row; the walls and the doors are the level's.
 */
function dressStreet(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const { depth, wall: w, h, list } = t.shops;
  const frontZ = -t.size[1] / 2 + depth + w / 2;
  const face = frontZ + w / 2 + 0.06; // just out from the front wall's street face
  const colours = [0xff4a3a, 0x38d6c8, 0xffb43a];
  const boards = colours.map(() => []);
  list.forEach((shop, i) => {
    const [x0, x1] = shop.x;
    const cx = (x0 + x1) / 2;
    boards[i % colours.length].push(new THREE.BoxGeometry(Math.min(3.4, x1 - x0 - 1.2), 0.42, 0.08).translate(cx, h - 0.05, face));
  });
  boards.forEach((parts, i) => merged(parts, std({ color: colours[i], emissive: colours[i], emissiveIntensity: 0.9 }), false, 'shop-signs'));
  // the row's eaves: a dark ledge along its top on the street side
  merged([new THREE.BoxGeometry(t.size[0], 0.12, 0.5).translate(0, h + 0.06, face + 0.2)], L.mat.darkMetal, true, 'eaves');
}

/** The ground's height at z along a profile [[z, y], …] given from south to north (rooms.js `steps`): level beyond its ends. */
function profileGround(P) {
  return (x, z) => {
    if (z >= P[0][0]) return P[0][1];
    for (let i = 1; i < P.length; i++) {
      const [z0, y0] = P[i - 1];
      const [z1, y1] = P[i];
      if (z >= z1) return y0 + ((y1 - y0) * (z0 - z)) / (z0 - z1);
    }
    return P[P.length - 1][1];
  };
}

/** Where a profile slopes, its rise per metre [east, south] (level.js slopeAt); null where it is level. */
function profileSlope(P) {
  return (x, z) => {
    for (let i = 1; i < P.length; i++) {
      const [z0, y0] = P[i - 1];
      const [z1, y1] = P[i];
      if (z < z0 && z > z1 && y1 !== y0) return [0, (y0 - y1) / (z0 - z1)];
    }
    return null;
  };
}

/**
 * The stone steps (E③): the raised ground a slab wall to wall; on each sloping stretch of the profile `treads` steps
 * across the flight, each as high as the ground at its middle (what stands on them stands within a few centimetres of
 * the tread), a pale edge on each so they read from above; either side of the flight a stone planter with a hedge on
 * it, its solid low (shots and sight over it) and added here as the plaza's rim is; a lamp at the top of each planter.
 */
function dressSteps(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const { profile: P, flight: [fx0, fx1], treads, planter } = t.steps;
  const halfW = t.size[0] / 2;
  const halfD = t.size[1] / 2;
  /** A box from (x0, ya, z0) to (x1, yb, z1). */
  const box = (x0, x1, z0, z1, ya, yb) => new THREE.BoxGeometry(x1 - x0, yb - ya, z1 - z0).translate((x0 + x1) / 2, (ya + yb) / 2, (z0 + z1) / 2);
  const slabs = [];
  const [zs, ys] = P[0];
  const [zn, yn] = P[P.length - 1];
  if (ys > 0) slabs.push(box(-halfW, halfW, zs, halfD, 0, ys)); // the raised ground south of the profile
  if (yn > 0) slabs.push(box(-halfW, halfW, -halfD, zn, 0, yn)); // or north of it
  const steps = [];
  const edges = [];
  const beds = [];
  const hedges = [];
  const lampPosts = [];
  const lampHeads = [];
  for (let i = 1; i < P.length; i++) {
    const [z0, y0] = P[i - 1];
    const [z1, y1] = P[i];
    if (y0 === y1) continue;
    for (let k = 0; k < treads; k++) {
      const za = z0 - ((z0 - z1) * k) / treads;
      const zb = z0 - ((z0 - z1) * (k + 1)) / treads;
      const y = L.groundY(0, (za + zb) / 2);
      steps.push(box(fx0, fx1, zb, za, 0, y));
      const drop = y0 > y1 ? zb : za; // its edge on the lower side
      edges.push(box(fx0, fx1, drop - 0.05, drop + 0.05, y - 0.02, y + 0.012));
    }
    const top = Math.max(y0, y1) + planter;
    for (const [xa, xb] of [[-halfW, fx0], [fx1, halfW]]) {
      L.addBox((xa + xb) / 2, (z0 + z1) / 2, xb - xa, z0 - z1, top, null, 'wall', { visible: false }).low = true; // bodies stop, shots and sight pass over
      beds.push(box(xa, xb, z1, z0, 0, top - 0.2));
      hedges.push(box(xa + 0.15, xb - 0.15, z1 + 0.15, z0 - 0.15, top - 0.2, top + 0.1));
      // a lamp on the planter's end by the flight, at the top of the steps
      const lx = xa === -halfW ? xb - 0.45 : xa + 0.45;
      const lz = y0 > y1 ? z0 - 0.45 : z1 + 0.45;
      lampPosts.push(box(lx - 0.07, lx + 0.07, lz - 0.07, lz + 0.07, top - 0.2, top + 2.4));
      lampHeads.push(new THREE.SphereGeometry(0.22, 12, 8).translate(lx, top + 2.55, lz));
    }
  }
  const stone = std({ color: 0x3e3c44, roughness: 0.85 });
  merged(slabs, stone, true, 'raised-ground');
  merged(steps, std({ color: 0x4a4752, roughness: 0.85 }), true, 'steps');
  merged(edges, std({ color: 0x9a948a, roughness: 0.8 }), false, 'step-edges');
  merged(beds, L.mat.slope, true, 'planters');
  merged(hedges, L.mat.bush, true, 'hedges');
  merged(lampPosts, L.mat.streetlamp, true, 'lamp-posts');
  merged(lampHeads, L.own(new THREE.MeshBasicMaterial({ color: 0xffe2a8 })), false, 'lamps');
}

/**
 * A quarter bend about the room's corner (cx, cz): the point `a` (0 to π/2) along it, `r` m from the corner. At 0 it is
 * on the corner's north or south wall, at π/2 on its east or west wall; `sx`, `sz` turn it into the room.
 */
function bendAt([cx, cz], r, a) {
  const sx = -Math.sign(cx);
  const sz = -Math.sign(cz);
  return [cx + sx * r * Math.cos(a), cz + sz * r * Math.sin(a)];
}

/** Where a flat ring piece (THREE.RingGeometry, laid on the ground) starts for the bend about corner `at`: the arc's angle from 0 to π/2. */
function bendTheta([cx, cz]) {
  const t0 = Math.atan2(0, -Math.sign(cx)); // the bend's start, on the north or south wall
  const t1 = Math.atan2(Math.sign(cz), 0); // its end (a ring's angles run the other way round on the ground)
  return ((t1 - t0 + Math.PI * 4) % (Math.PI * 2)) < Math.PI ? t0 : t1;
}

const BEND_RUN = 3; // m the racing line runs on beyond each wall: the cars come in through it, not out of it

/** The racing line round a room's bend (rooms.js `track`): in through the one wall, round, out through the other. */
function bendLine(track) {
  const { at, r } = track;
  const [cx, cz] = at;
  const round = (v) => +v.toFixed(3);
  const line = [];
  const [x0] = bendAt(at, r, 0);
  line.push([round(x0), round(cz + Math.sign(cz) * BEND_RUN)]);
  for (let i = 0; i <= 16; i++) line.push(bendAt(at, r, ((Math.PI / 2) * i) / 16).map(round));
  const [, z1] = bendAt(at, r, Math.PI / 2);
  line.push([round(cx + Math.sign(cx) * BEND_RUN), round(z1)]);
  return line;
}

/** Tyre stacks (solids, the Guia circuit's 'tyres': 0.9 m, cover a man crouches behind) along the bend `r` m from its corner, from a0 to a1 (degrees along it), 0.75 m apart. */
function tyreArc(at, r, a0, a1) {
  const out = [];
  const n = Math.max(1, Math.round((((a1 - a0) * Math.PI) / 180) * r / 0.75));
  for (let i = 0; i <= n; i++) {
    const [x, z] = bendAt(at, r, ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180);
    out.push([+x.toFixed(2), +z.toFixed(2), 0.9, 0.9, 0.9, 'tyres']);
  }
  return out;
}

/**
 * The track bend (E②): the road round the bend, a little darker than the run-off's asphalt, white lines at its edges,
 * red-and-white kerbs on its inside, grass in the infield; the tyre walls as stacks of blue and white tyres (two
 * instanced meshes, as on the circuit); a dark mouth in each wall the road comes through, a light bar over it.
 */
function dressTrack(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const { at, r, road } = t.track;
  const [cx, cz] = at;
  const rIn = r - road / 2;
  const rOut = r + road / 2;
  const t0 = bendTheta(at);
  const Q = Math.PI / 2;
  const flat = (geo) => geo.rotateX(-Math.PI / 2).translate(cx, 0, cz);
  const ring = (r0, r1, a0 = 0, len = Q) => flat(new THREE.RingGeometry(r0, r1, 24, 1, t0 + a0, len));
  const ground = (geos, mat, y, name) => {
    const mesh = new THREE.Mesh(L.own(mergeGeometries(geos)), mat);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    mesh.name = name;
    L.add(mesh);
  };
  ground([ring(rIn, rOut)], std({ color: 0x17191e, roughness: 0.9 }), 0.004, 'road');
  ground([flat(new THREE.CircleGeometry(rIn - 0.55, 24, t0, Q))], std({ color: 0x1b3320, roughness: 1 }), 0.006, 'infield');
  ground([ring(rIn + 0.1, rIn + 0.24), ring(rOut - 0.24, rOut - 0.1)], std({ color: 0xe8ecf2, roughness: 0.6, emissive: 0xe8ecf2, emissiveIntensity: 0.06 }), 0.012, 'road-lines');
  const kerbs = [[], []];
  for (let i = 0; i < 12; i++) kerbs[i % 2].push(ring(rIn - 0.55, rIn, (i * Q) / 12, Q / 12));
  ground(kerbs[0], std({ color: 0xc81e28, roughness: 0.7 }), 0.014, 'kerbs');
  ground(kerbs[1], std({ color: 0xe8ecf2, roughness: 0.7 }), 0.014, 'kerbs');

  // the tyre walls: every 'tyres' solid drawn as a stack of three tyres, blue and white by turns
  const layers = [[], []];
  let k = 0;
  for (const sd of L.solids) {
    if (sd.matKey !== 'tyres') continue;
    sd.mesh.visible = false;
    const x = (sd.minX + sd.maxX) / 2;
    const z = (sd.minZ + sd.maxZ) / 2;
    for (let j = 0; j < 3; j++) layers[(k + j) % 3 === 1 ? 1 : 0].push([x, j * 0.3, z]);
    k++;
  }
  const tyreGeo = L.own(new THREE.CylinderGeometry(0.42, 0.42, 0.29, 12).translate(0, 0.145, 0));
  const m4 = new THREE.Matrix4();
  layers.forEach((list, i) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(tyreGeo, std({ color: i ? 0xe8ecf2 : 0x1d4fd0, roughness: 0.7 }), list.length);
    list.forEach(([x, y, z], j) => im.setMatrixAt(j, m4.makeTranslation(x, y, z)));
    im.computeBoundingSphere();
    im.castShadow = true;
    im.receiveShadow = true;
    im.name = 'tyres';
    L.add(im);
  });

  // where the road comes through the walls: a dark mouth on each wall's inner face, a light bar over it
  const [x0] = bendAt(at, r, 0);
  const [, z1] = bendAt(at, r, Q);
  const w = road + 0.4;
  const inX = -Math.sign(cx) * 0.03; // off the east or west wall's face, into the room
  const inZ = -Math.sign(cz) * 0.03;
  merged([new THREE.BoxGeometry(w, 2.6, 0.06).translate(x0, 1.3, cz + inZ), new THREE.BoxGeometry(0.06, 2.6, w).translate(cx + inX, 1.3, z1)], std({ color: 0x030405, roughness: 1 }), false, 'track-mouths');
  merged([new THREE.BoxGeometry(w, 0.12, 0.08).translate(x0, 2.75, cz + inZ * 2), new THREE.BoxGeometry(0.08, 0.12, w).translate(cx + inX * 2, 2.75, z1)], L.own(new THREE.MeshBasicMaterial({ color: 0xf2f6ff })), false, 'track-lights');
}

/**
 * The plaza (E①): the fountain in the middle, a knee-high round rim (a solid: cover, and a man knocked over it lands in
 * the water) with a basin and a lamp-topped pedestal above the water, benches by the walls, and the pigeons on the
 * flocks' spots. The rim is a polygon solid of the level's, the water its `water` circle (room()).
 */
function dressPlaza(L, t, std, merged, posts, gold) {
  merged(posts, gold, false);
  const [px, pz, pr] = t.pool;
  const P = PLAZA_ROOM;
  const ring = [];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    ring.push([px + Math.cos(a) * pr, pz + Math.sin(a) * pr]);
  }
  L.addPoly(ring, P.rim, 'wall').low = true; // the rim: knee high, shots and sight pass over it (`low`, as an upright table), bodies and the nav stop at it
  const stone = std({ color: 0x9a9690, roughness: 0.8 });
  const rim = new THREE.Mesh(L.own(new THREE.CylinderGeometry(pr + 0.05, pr + 0.15, P.rim, 28, 1, true)), stone);
  rim.position.set(px, P.rim / 2, pz);
  rim.castShadow = true;
  L.add(rim);
  const water = new THREE.Mesh(L.own(new THREE.CircleGeometry(pr - 0.05, 28)), std({ color: 0x1c3a4a, roughness: 0.15, metalness: 0.3 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(px, P.rim - 0.14, pz);
  water.name = 'pool-water';
  L.add(water);
  const basin = new THREE.Mesh(L.own(new THREE.CylinderGeometry(pr * 0.42, pr * 0.3, 0.35, 16)), stone);
  basin.position.set(px, P.rim + 0.5, pz);
  basin.castShadow = true;
  L.add(basin);
  const column = new THREE.Mesh(L.own(new THREE.CylinderGeometry(0.16, 0.22, P.rim + 0.5, 10)), stone);
  column.position.set(px, (P.rim + 0.5) / 2, pz);
  L.add(column);
  const lamp = new THREE.Mesh(L.own(new THREE.SphereGeometry(0.28, 12, 8)), L.own(new THREE.MeshBasicMaterial({ color: 0xffe9b0 })));
  lamp.position.set(px, P.rim + 1.1, pz);
  lamp.name = 'fountain-lamp';
  L.add(lamp);
  // benches along the long walls, between the doors
  const benches = [];
  for (const [bx, bz] of t.benches || []) {
    benches.push(new THREE.BoxGeometry(1.8, 0.08, 0.45).translate(bx, 0.45, bz));
    for (const s of [-0.7, 0.7]) benches.push(new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(bx + s, 0.22, bz));
  }
  merged(benches, std({ color: 0x4a3a2c, roughness: 0.7 }), true, 'benches');
  L.ambient.push(new Pigeons(L, P.birds));
}

/** The entry gate in its low wall, shut behind the player; its gold parts (posts, a rail) for the caller to merge with its own. */
function entryGate(L, [nx, nz, nf], std, merged) {
  const gateWood = std({ color: 0x24120a, roughness: 0.5 }); // dark against the wall: a shut gate reads at a glance
  const red = L.own(new THREE.MeshBasicMaterial({ color: 0xff3a2a })); // unlit: the gate's lamps, always lit (it is shut)
  // two gold posts, a dark leaf over the wall's inner face with a gold rail along its top, a red lamp on each post
  const posts = [];
  const leaves = [];
  const gateLamps = [];
  const gate = (g) => g.rotateY((nf * Math.PI) / 180).translate(nx, L.groundY(nx, nz), nz); // on the ground there (the steps' upper level: E③)
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

const ROOM_CAMERA = { room: { at: [0, 0], back: 1.5, follow: true } }; // follows the player (config.js CAMERA.roomDist, roomLean: 試玩回饋 ⑥a); before, it held the middle from 28 m (back 5, lean 0.1) with the whole room on the screen
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
  budget: { ...ROOM_BUDGET, tris: 150000 }, // two bosses' worn models at once: 134,345 triangles with the pair in (test/fronthall.test.mjs); the draw calls (the weak-GPU number) stay about 110
});

/**
 * The plaza (廣場, 彈幕 ② E①): the square remade as a room. The fountain pool in the middle (its rim cover, its water
 * where a man knocked over the rim ends up: SPLASH), two pigeon flocks resting on the open floor either side of it
 * (a shot or a runner bursts them up, and a man aiming within 2 m of the cloud loses his aim: PIGEON STRIKE), benches
 * by the walls. 22 × 15 m, in at the south, out at the north.
 */
export const PLAZA = room({
  id: 'plaza',
  rev: 1,
  name: '廣場',
  en: 'PLAZA',
  desc: '噴水池的廣場：白鴿驚起擋住瞄準，把人踢落水。',
  color: '#8fc8ff',
  size: [22, 15],
  walls: [3.2, 'concrete', null],
  low: [0.9, ['s', 'w']],
  doors: [['n', -6], ['n', 6], ['e', -3], ['e', 3]],
  tables: [],
  pool: [0, 0, 2.2],
  flocks: [[-6, 0.5], [6, -0.5]],
  benches: [[-6, -6.6], [6, -6.6], [-9.9, 3], [9.9, -3]],
  entry: ['s', 0],
  exit: ['n', 0],
  // the far side: the north ends of the aisles, and the north side of the pool
  posts: [[-8.5, -5], [8.5, -5], [0, -4.2], [-9.5, -1], [9.5, -1]],
  dress: 'plaza',
  floor: 'asphalt',
  theme: {
    bg: 0x070a10,
    fog: [0x0a0e14, 0.004],
    hemi: [0xb8c8ff, 0x16140e, 0.8],
    moon: [0xa8b8ff, 0.5],
    sunDir: [-8, 30, 12],
    // four street lamps at the corners of the square
    points: [
      [0xffd9a0, -7, 5, -4, 22, 16],
      [0xffd9a0, 7, 5, -4, 22, 16],
      [0xffc890, -7, 5, 4, 22, 16],
      [0xffc890, 7, 5, 4, 22, 16],
    ],
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The track bend (跑道彎, 彈幕 ② E②): the circuit remade as a room. A quarter bend of road comes in through the north
 * wall, round the north-east corner and out through the east wall; now and then the racing cars sweep it kerb to kerb
 * (race.js), the lights red and a line along the road two seconds before: a man on the road is run down (GRAND PRIX),
 * the player on it is hurt hard, a barrel on it is sent flying. The exit is in the infield, so the way on is across the
 * road. Tyre walls along its outside with a gap where the run-off meets it and a short one inside by the north wall,
 * two marshals' folding tables in the run-off. 22 × 15 m, in at the south, out at the north.
 */
const BEND = { at: [11, -7.5], r: 11, road: 4.4 };

export const RACEBEND = room({
  id: 'racebend',
  rev: 1,
  name: '跑道彎',
  en: 'TRACK BEND',
  desc: '賽道彎：賽車定時掠過，紅燈一亮就離開賽道；把人踢上賽道等車到。',
  color: '#4fb4ff',
  size: [22, 15],
  walls: [3.2, 'concrete', null],
  low: [0.9, ['s', 'w']],
  doors: [['n', -6], ['n', 9], ['e', -4], ['e', 6.8]], // two on the run-off's side, two in the infield
  tables: [[-6, 2, 0.65], [-1, 5, 0.65]],
  tableLook: 'folding',
  // the tyre walls: the outside of the bend either side of the run-off's way onto it; its inside by the north wall, between
  // the road and the way to the exit (one in front of the infield's posts would hide most of the room from them)
  solids: [...tyreArc(BEND.at, BEND.r + BEND.road / 2 + 0.8, 16, 30), ...tyreArc(BEND.at, BEND.r + BEND.road / 2 + 0.8, 60, 74), ...tyreArc(BEND.at, BEND.r - BEND.road / 2 - 0.9, 4, 14)],
  barrels: [[-1.5, 1.5], [5.2, -1.6, 'lpg']], // a drum by the road on the run-off's side, a cylinder by it in the infield: kicked on, sent flying
  track: { ...BEND, first: 10, every: 15, lanes: [-1.1, 1.1] }, // two lanes: the pack (RACE.cars) covers the 4.4 m road kerb to kerb
  dress: 'track',
  entry: ['s', -5],
  exit: ['n', 6], // in the infield: the way on is across the road
  // the far side: the run-off's north-west, and the infield across the road
  posts: [[-8.5, -5], [-4.5, -5.5], [-9.5, -0.5], [5.5, -3.5], [8.5, -1.5]],
  floor: 'asphalt',
  theme: {
    bg: 0x05070d,
    fog: [0x070a14, 0.004],
    hemi: [0x8a9abc, 0x0a0c12, 0.75],
    moon: [0xb8c8ff, 0.5],
    sunDir: [12, 34, 16],
    // four floodlights over the run-off and the infield, white as the circuit's
    points: [
      [0xe8f0ff, -6, 5, -3, 22, 16],
      [0xe8f0ff, 5, 5, -3, 22, 16],
      [0xffe2b8, -6, 5, 4, 22, 16],
      [0xe8f0ff, 5, 5, 4, 22, 16],
    ],
    rain: false,
    bloom: { strength: 0.7, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The stone steps (石階, 彈幕 ② E③): an old quarter's steps remade as a room. The player comes in on the upper level in
 * the south; four steps down the middle, 9 m across between two planters, lead to the lower level in the north where
 * the gunners hold their posts and the exit is. Three oil drums stand on the top step: shot or kicked over, one rolls
 * down the flight, faster as it goes, and bowls over the men coming up it (ROLLING), on across the lower level. The rise
 * is 0.56 m, under LEVELS.tol: one level still, so both sides shoot at each other. 22 × 15 m, in at the south, out at
 * the north.
 */
export const STEPS = room({
  id: 'steps',
  rev: 1,
  name: '石階',
  en: 'STONE STEPS',
  desc: '老區的石階：守住石階頂，衝上來的人排成一行，就射倒油桶滾落去。',
  color: '#ffb35a',
  size: [22, 15],
  walls: [3.2, 'brick', null],
  low: [0.9, ['s', 'w']],
  doors: [['n', -6], ['n', 6], ['e', -3], ['e', -6]], // all onto the lower level
  tables: [[-7.5, -4.5, 0.7], [7.5, -4.5, 0.7]], // on the lower level, the gunners' cover
  tableLook: 'folding',
  // the upper level the south, down four steps to the lower in the north; the planters either side of the flight
  steps: { profile: [[1.5, 0.56], [-1.5, 0]], flight: [-4.5, 4.5], treads: 4, planter: 0.45 },
  // on the upper level two stone planters for the player's cover (their heights count from the floor: 0.56 of it is the level)
  solids: [[-7, 4.5, 1.8, 1, 1.5, 'planter'], [7, 4.5, 1.8, 1, 1.5, 'planter']],
  barrels: [[-3, 1.1], [0, 1.1], [3, 1.1]], // on the top step: shot or kicked over, down they roll
  dress: 'steps',
  entry: ['s', 0],
  exit: ['n', 0],
  // the far side: the lower level, behind its two tables and either side of the way off the steps
  posts: [[-7.5, -6.2, -7.5, -4.5], [7.5, -6.2, 7.5, -4.5], [-3.5, -5.8], [3.5, -5.8], [-9.5, -2.5]],
  floor: 'concrete',
  theme: {
    bg: 0x0b0a10,
    fog: [0x120e14, 0.004],
    hemi: [0xffd9b8, 0x14100c, 0.8],
    moon: [0xb8c0ff, 0.45],
    sunDir: [-8, 30, 12],
    // four warm street lamps, two over each level
    points: [
      [0xffc890, -6, 5, -4, 22, 16],
      [0xffc890, 6, 5, -4, 22, 16],
      [0xffd9a0, -6, 5.5, 4, 22, 16],
      [0xffd9a0, 6, 5.5, 4, 22, 16],
    ],
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The shop street (直街, 彈幕 ② E④): a row of three old shophouses along the north wall, the street before them. The
 * two end shops' fronts are wooden doors (kicked open, the man behind goes flying: SLAM), the middle one's a roller
 * shutter over a wide opening (shot at its lock post it drops, SHUTTER, and shuts the shop till the wave is down) with
 * the exit in its back wall; a door in each wall between them, so the row is a way through the houses to come out
 * behind the gunners on the street. The men come in at the end shops' backs and out through their doors. 22 × 15 m, in
 * at the south, out at the north.
 */
export const STREET = room({
  id: 'shopstreet',
  rev: 1,
  name: '直街',
  en: 'SHOP STREET',
  desc: '直街一排舊舖：踢開舖門撞飛門後的人，穿屋繞到後面，射落鐵閘封住中間那間。',
  color: '#ff5a4a',
  size: [22, 15],
  walls: [3.2, 'brick', null],
  low: [0.9, ['s', 'w']],
  doors: [['n', -7.5], ['n', 7.5], ['e', -5.25], ['e', 3]], // three into the end shops' backs, one onto the street
  tables: [[-5.5, 0.3, 0.7], [5.5, 0.3, 0.7], [0, 3.6, 0.7]],
  tableLook: 'folding',
  shops: { depth: 4.5, wall: 0.3, h: 2.8, door: 2, shutter: 3.2, list: [{ x: [-11, -3.75], front: 'door' }, { x: [-3.75, 3.75], front: 'shutter' }, { x: [3.75, 11], front: 'door' }] },
  cutaway: true,
  dress: 'shops',
  entry: ['s', 0],
  exit: ['n', 0], // in the middle shop's back wall
  // the far side: the street before the shops, either side of their openings and behind the two north tables
  posts: [[-9.5, -1.4], [-5.5, -1.7, -5.5, 0.3], [-2.4, -1.6], [2.4, -1.6], [5.5, -1.7, 5.5, 0.3], [9.5, -1.4]],
  floor: 'concrete',
  theme: {
    bg: 0x0d0808,
    fog: [0x140c0c, 0.004],
    hemi: [0xffc8b0, 0x1a0e0c, 0.8],
    moon: [0xb0b8ff, 0.4],
    sunDir: [-8, 30, 12],
    // warm red over the street, a bare bulb in each end shop
    points: [
      [0xff9a70, -5, 4.5, 2, 22, 16],
      [0xff9a70, 5, 4.5, 2, 22, 16],
      [0xffd0a0, -7.4, 2.5, -5.2, 12, 10],
      [0xffd0a0, 7.4, 2.5, -5.2, 12, 10],
    ],
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The quay (碼頭, 彈幕 ② E⑤): the docks remade as a room. Its north side is the quay's edge, a knee-high curb with
 * the harbour beyond it; the gunners' posts are along it, their backs to the sea, so a man kicked north goes over the
 * curb and into the water (SPLASH), and a hand trolley kicked at a row of them bowls them over (BOWLING) and into it.
 * Wooden crates for cover, the men in by a warehouse's doors in the east wall. 22 × 15 m, in at the south, out at the
 * east.
 */
export const QUAY = room({
  id: 'quay',
  rev: 1,
  name: '碼頭',
  en: 'QUAYSIDE',
  desc: '碼頭邊：開火位背住個海，一腳踢落海；手推車撞倒成排人。',
  color: '#3fe6ff',
  size: [22, 15],
  walls: [3.2, 'warehouse', null],
  low: [0.9, ['s', 'w']],
  edges: { n: [0.45, 'curb', null] }, // the quay's edge: the sea beyond (`water`)
  water: [{ x: 0, z: -9.5, w: 26, d: 4 }], // from the curb's inner face out: a body knocked over it lands in it
  doors: [['e', -1.5], ['e', 2.5], ['e', 6]], // a warehouse's doors
  tables: [[-6.5, 3.5, 0.65], [2.5, 5, 0.65]], // folding tables of the dockers', on the player's side
  tableLook: 'folding',
  trolleys: [[-3, 1.5, Math.PI], [6, 1, Math.PI]], // hand trolleys, laid towards the quay: kicked north they roll at the posts
  trolleyLook: 'trolley',
  solids: [[-9, -1.5, 1.2, 1.2, 1.2, 'crate'], [-1, -2.4, 1.2, 1.2, 1.2, 'crate'], [5.5, -2.6, 1.2, 1.2, 1.2, 'crate'], [7.2, 4.2, 1.4, 1.0, 1.2, 'metal']], // wooden crates (break apart, ENV.crateHits; the made crate is 7,760 triangles, so three) and a steel bin
  barrels: [[-5.5, -4.8]],
  dress: 'quay',
  entry: ['s', -4],
  exit: ['e', -5.5], // at the warehouse's north end, by the quay
  // the far side: along the quay, the men's backs to the sea
  posts: [[-9.5, -5.6], [-5.5, -6.1], [-1.5, -5.6], [2.5, -6.1], [6.5, -5.6]],
  floor: 'concrete',
  theme: {
    bg: 0x05080d,
    fog: [0x070b12, 0.004],
    hemi: [0x9ab0d0, 0x0c0e12, 0.75],
    moon: [0xa8c0ff, 0.55],
    sunDir: [10, 30, -14],
    // sodium lamps over the quay and the yard
    points: [
      [0xffb060, -6, 5, -4, 22, 16],
      [0xffb060, 5, 5, -4, 22, 16],
      [0xffc890, -5, 5, 4, 22, 16],
      [0x9fd0ff, 6, 5, 4, 22, 16],
    ],
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The rooftop (天台, 彈幕 ② E⑥): a tenement's flat roof at night, in the rain. Washing hung out on bamboo poles across
 * the middle (`laundry`): a gunner cannot see the player through a sheet, but a shot goes through it either way, so a
 * line of sheets is cover that stops no bullet (a kill through one: LAUNDRY DAY). LPG cylinders on the player's side:
 * kicked, one jets off at the gunners and bursts on the first it meets (ROCKET CAN; a red barrel by their posts for a
 * CHAIN). The parapet low along the south and west, the stair hut's wall to the north and the next block's to the
 * east; 22 × 15 m, in at the south, out by the stair hut.
 */
export const ROOF = room({
  id: 'roof',
  rev: 1,
  name: '天台',
  en: 'ROOFTOP',
  desc: '天台：晾衫竹上的被單擋住視線，子彈照穿；踢氣樽射向開火位。',
  color: '#ff3fa4',
  size: [22, 15],
  walls: [3.2, 'concrete', null],
  low: [1.0, ['s', 'w']],
  edges: { s: [1.0, 'parapet', 'neonCyan'], w: [1.0, 'parapet', 'neonCyan'] }, // the roof's parapet, neon along its top
  doors: [['n', -1.5], ['e', -3], ['e', 2]], // the stair hut's door and the next block's
  tables: [[3, 4.6, 0.6]], // a folding table the neighbours sit out at
  tableLook: 'folding',
  laundry: { lines: [[-9.5, -2, -3.5, -2], [1.5, -1, 8.5, -1], [-4, 2.5, 2, 2.5]], sheet: 1.3, gap: 0.6 },
  solids: [[-9.6, -6.8, 1.6, 1.0, 1.1, 'unit'], [9.6, -6.8, 1.6, 1.0, 1.1, 'unit'], [-3.5, 4.8, 1.4, 1.2, 1.2, 'concrete']], // air-conditioner units in the far corners, behind the end posts (the made one is 7,880 triangles, so two), a concrete pipe housing on the player's side
  barrels: [[-7, 3.2, 'lpg'], [0.5, 0.6, 'lpg'], [5.5, 4.2, 'lpg'], [2.5, -4.4]], // LPG cylinders to kick; a red barrel by the posts
  dress: 'roof',
  cutaway: true, // the player behind a sheet stays in sight
  entry: ['s', -5],
  exit: ['n', 7], // the stair hut's other door
  posts: [[-9.2, -5.6], [-4, -6], [0.5, -5.6], [4.5, -6], [8.6, -5.4]],
  floor: 'concrete',
  theme: {
    bg: 0x0a0816,
    fog: [0x0d0a1c, 0.006],
    hemi: [0x8c80ff, 0x1c1020, 0.9],
    moon: [0xc4d2ff, 0.9],
    sunDir: [-8, 30, 12],
    // the stair hut's neon, the parapet's cyan, a lamp over the hut's door
    points: [
      [0xff3fa4, -2, 3, -6, 26, 16],
      [0x3fe6ff, -9, 2.5, 4, 20, 14],
      [0x3fe6ff, 8, 2.5, 4, 20, 14],
      [0xffa040, 7, 3, -6, 18, 12],
    ],
    rain: true,
    bloom: { strength: 0.55, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The club (夜店, 彈幕 ② E⑦): a dance floor of light tiles in the middle, the DJ booth to the north with a speaker
 * either side, the gunners' posts along the front of it. The lights keep the beat (`blackout`): on the last beat of
 * every two bars they go out, the whole room in the dark, and nobody aims (level.js darkAt: an aim breaks off, a kill
 * then is a BLACKOUT); the beat before, every tile flashes white. Learn the beat and move on the dark one. 22 × 15 m,
 * in at the south, out by the north-east door.
 */
export const DISCO = room({
  id: 'disco',
  rev: 1,
  name: '夜店',
  en: 'NIGHTCLUB',
  desc: '夜店：燈跟住節拍，每兩小節最後一拍燈滅，嗰一拍冇人瞄得準你。',
  color: '#9b6bff',
  size: [22, 15],
  walls: [3.2, 'clubWall', 'neonPink'],
  low: [0.9, ['s', 'w']],
  edges: { s: [0.9, 'clubWall', 'neonCyan'], w: [0.9, 'clubWall', 'neonCyan'] },
  doors: [['n', -7.5], ['e', -2], ['e', 3]], // the back of house's doors
  tables: [[-7, 2, 0.55], [6.5, 2.8, 0.55]], // cocktail tables at the dance floor's edge
  solids: [[0, -6.5, 3.6, 1.2, 1.3, 'dj'], [-2.6, -6.9, 1.0, 1.0, 2.0, 'speaker'], [2.6, -6.9, 1.0, 1.0, 2.0, 'speaker']], // the DJ booth and its speakers
  barrels: [[-9.5, -3.8]],
  blackout: { bpm: 124, every: 8, dark: 1 }, // the music's tempo; out on the last beat of every two bars
  danceFloor: { at: [0, 0], tiles: [10, 6] },
  dress: 'disco',
  entry: ['s', -6],
  exit: ['n', 7.5],
  posts: [[-8.5, -5.2], [-4.5, -4.6], [0, -4.6], [4.5, -4.6], [8.5, -5.2]],
  floor: 'club',
  theme: {
    bg: 0x07040c,
    fog: [0x0a0612, 0.004],
    hemi: [0x7a4aa0, 0x120a1c, 0.9],
    moon: [0xb090ff, 0.5],
    sunDir: [6, 30, 10],
    // the booth's pink and cyan, the bar's amber, a violet wash over the floor
    points: [
      [0xff3fa4, -5, 4, -4, 24, 16],
      [0x3fe6ff, 5, 4, -4, 24, 16],
      [0xffa040, -6, 3.5, 5, 18, 14],
      [0x9b6bff, 6, 4, 4, 20, 14],
    ],
    rain: false,
    bloom: { strength: 0.6, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

/**
 * The maze (迷宮, 試玩回饋 ⑥b, the developer 10-29: "a maze open every which way, some of its walls you can shoot
 * through and some you can't"): an old industrial building's floor partitioned into units, 6 × 4 cells, the walls
 * between them drawn afresh every run (`maze`, mazeWalls): concrete ones nothing breaks, and plywood boards that a few
 * of the player's rounds or one kick bring down, for the rest of the run, a new way through or round behind a man.
 * No posts to fire from: the men come in by the doors on the north and east walls and hunt the player through it as in
 * the arcade, taking cover at the walls. 24 × 16 m drawn (28.8 × 19.2 at the rooms' scale), in at the south-west, out at
 * the north-east.
 */
export const MAZE = room({
  id: 'maze',
  rev: 1,
  name: '迷宮',
  en: 'MAZE',
  desc: '迷宮：舊工廈間成一格格，間法每局不同；木板牆射幾槍或者踢一腳就爛，石屎牆就打唔爛。',
  color: '#ffb347',
  size: [24, 16],
  walls: [3.2, 'concrete', null],
  low: [0.9, ['s', 'w']],
  maze: { cols: 6, rows: 4, extra: 3, thin: 0.5, thick: 0.3, h: 2.6, board: 2.3, post: 0.5 },
  doors: [['n', -10], ['n', -2], ['e', -6], ['e', 2]], // each at a cell's middle
  tables: [[-2, 2, 0.6], [6, -2, 0.6]], // folding tables in two of the units, at the middle of their cells
  tableLook: 'folding',
  barrels: [[2, 6], [-6, -2], [10, 6, 'lpg']],
  dress: 'maze',
  cutaway: true, // the player behind a wall stays in sight
  entry: ['s', -6],
  exit: ['n', 6],
  posts: [],
  floor: 'concrete',
  theme: {
    bg: 0x07080c,
    fog: [0x0a0b10, 0.005],
    hemi: [0x9aa4b8, 0x101016, 0.85],
    moon: [0xc8d4ff, 0.6],
    sunDir: [-10, 30, 12],
    // fluorescent tubes, cold over the far units, a warmer one over the near
    points: [
      [0xe4ecff, -7, 4, -3, 22, 16],
      [0xe4ecff, 7, 4, -3, 22, 16],
      [0xffd09a, -7, 4, 4, 20, 14],
      [0xb8d8ff, 7, 4, 4, 20, 14],
    ],
    rain: false,
    bloom: { strength: 0.55, threshold: 0.85 },
  },
  camera: ROOM_CAMERA,
  budget: ROOM_BUDGET,
});

export const ROOMS = { teahouse: TEAHOUSE, banquet: BANQUET, sidehall: SIDEHALL, daipaidong: DAIPAIDONG, plaza: PLAZA, racebend: RACEBEND, steps: STEPS, shopstreet: STREET, quay: QUAY, roof: ROOF, disco: DISCO, maze: MAZE, arena: ARENA, backhall: BACKHALL, strongroom: STRONGROOM, fronthall: FRONTHALL };

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
