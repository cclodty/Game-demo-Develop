// v10 stroll (viewer only): walk the streets at eye height. Collisions are worked out in plan from the data, not
// from the meshes: building walls at ground level (arcades recessed to their back wall, their piers kept), street
// furniture, the railings along the kerbs and the fountain pool. The ground under the feet comes from the upward
// faces of the street, square and fountain meshes, so kerbs and the fountain steps are walked up and down; a rise
// higher than a step stops the walker.
import * as THREE from 'three';
import { edgeFrame, offsetEdges, bayLayout, facadeLayout, pointIn, FOUNTAIN } from './model.js';

export const STROLL = {
  radius: 0.3,       // m, the walker's half width
  eye: 1.62,         // m above the feet
  walk: 1.35, run: 4.0,   // m/s
  accel: 7,          // 1/s, how fast the pace follows the keys
  stride: 0.74,      // m per step
  stepUp: 0.42,      // m, highest rise taken in one step
  bob: 0.028, sway: 0.012,   // m, head movement per step
  look: 0.0023,      // rad per pixel
  spawn: [-12, -14, 0.9],   // x, y, heading (rad from east, counter-clockwise): the square's mouth, facing in
};

// furniture footprints: radius (m) per kind, or [half length, half width] for the long ones
const FURNITURE = { lamp: 0.22, lampDouble: 0.26, signal: 0.1, pedSignal: 0.08, busStop: 0.3, bollard: 0.12, block: 0.35, postBox: 0.24, pot: 0.46, bin: 0.26, bench: [0.92, 0.28] };

// ---------- plan collider ----------
export function buildCollider(data) {
  const cell = 4, cells = new Map();
  const key = (i, j) => i * 100003 + j;
  const add = (x0, y0, x1, y1, item) => {
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
      for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) {
        const k = key(i, j);
        if (!cells.has(k)) cells.set(k, { segs: [], circles: [], polys: [] });
        cells.get(k)[item.kind].push(item);
      }
    }
  };
  const seg = (a, b) => add(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1]), { kind: 'segs', a, b });
  const ring = (r) => r.forEach((p, i) => seg(p, r[(i + 1) % r.length]));
  const solid = (outer, holes = []) => {
    const xs = outer.map((p) => p[0]), ys = outer.map((p) => p[1]);
    add(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), { kind: 'polys', outer, holes });
    ring(outer);
    holes.forEach(ring);
  };
  const circle = (x, y, r) => add(x - r, y - r, x + r, y + r, { kind: 'circles', x, y, r });
  let walls = 0, piers = 0, things = 0;

  for (const b of data.buildings.concat(data.parts || [])) {
    if (b.minH > 0.3) continue;                                   // raised parts and bridges: walk under them
    if (b.facade) {
      const L = facadeLayout(b);
      if (L.arcadeEdges.length) {
        // the arcade's back wall, and its piers along the facade line
        if (!L.F.passage) solid(offsetEdges(L.ring, new Map(L.arcadeEdges.map((i) => [i, L.arcade.depth]))), b.holes);
        for (const i of L.arcadeEdges) {
          const f = edgeFrame(L.ring, i), arc = L.arcade, at = (s, o) => [f.a[0] + f.u[0] * s + f.n[0] * o, f.a[1] + f.u[1] * s + f.n[1] * o];
          for (const c of bayLayout(f.L, arc.bay, arc.pier).piers) {
            const s0 = Math.max(0, c - arc.pier / 2), s1 = Math.min(f.L, c + arc.pier / 2);
            solid([at(s0, 0), at(s0, -arc.thick), at(s1, -arc.thick), at(s1, 0)].reverse());
            piers++;
          }
        }
        walls++;
        continue;
      }
    }
    solid(b.outer, b.holes);
    walls++;
  }
  const fu = (data.streets && data.streets.furniture) || {};
  for (const [kind, size] of Object.entries(FURNITURE)) {
    for (const [x, y, h = 0] of fu[kind] || []) {
      if (Array.isArray(size)) {                                   // bench: two circles along its length
        const dx = Math.sin(h), dy = -Math.cos(h);
        for (const t of [-0.55, 0, 0.55]) circle(x + dx * t * size[0], y + dy * t * size[0], size[1] + 0.12);
      } else circle(x, y, size);
      things++;
    }
  }
  for (const line of fu.railing || []) for (let k = 0; k < line.length - 1; k++) seg(line[k], line[k + 1]);
  if (data.fountain) circle(data.fountain.x, data.fountain.y, FOUNTAIN.poolOuter + 0.05);

  const near = (p, r) => {
    const out = { segs: new Set(), circles: new Set(), polys: new Set() };
    for (let i = Math.floor((p[0] - r) / cell); i <= Math.floor((p[0] + r) / cell); i++) {
      for (let j = Math.floor((p[1] - r) / cell); j <= Math.floor((p[1] + r) / cell); j++) {
        const c = cells.get(key(i, j));
        if (c) for (const k of ['segs', 'circles', 'polys']) c[k].forEach((v) => out[k].add(v));
      }
    }
    return out;
  };
  const insideSolid = (p, polys) => {
    for (const q of polys) if (pointIn(p, q.outer) && !q.holes.some((h) => pointIn(p, h))) return true;
    return false;
  };
  // one step: push out of every wall and post closer than r, a few times over so corners settle
  const settle = (q, r, N) => {
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const { a, b } of N.segs) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12;
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2));
        const cx = a[0] + dx * t, cy = a[1] + dy * t, ex = q[0] - cx, ey = q[1] - cy, d = Math.hypot(ex, ey);
        if (d >= r) continue;
        const [nx, ny] = d > 1e-6 ? [ex / d, ey / d] : [dy / Math.sqrt(L2), -dx / Math.sqrt(L2)];
        q[0] = cx + nx * r; q[1] = cy + ny * r;
        moved = true;
      }
      for (const c of N.circles) {
        const ex = q[0] - c.x, ey = q[1] - c.y, d = Math.hypot(ex, ey), R = c.r + r;
        if (d >= R) continue;
        const [nx, ny] = d > 1e-6 ? [ex / d, ey / d] : [1, 0];
        q[0] = c.x + nx * R; q[1] = c.y + ny * R;
        moved = true;
      }
      if (!moved) break;
    }
    return q;
  };
  return {
    stats: { walls, piers, things },
    // where a walker of radius r at p ends up after trying to move by d (data metres); slides along walls
    move(p, d, r = STROLL.radius) {
      const n = Math.max(1, Math.ceil(Math.hypot(d[0], d[1]) / 0.12));
      let q = [p[0], p[1]];
      for (let k = 0; k < n; k++) {
        const t = [q[0] + d[0] / n, q[1] + d[1] / n];
        const N = near(t, r + 0.05);
        settle(t, r, N);
        if (insideSolid(t, N.polys)) break;                       // pushed through a thin corner: stay
        q = t;
      }
      return q;
    },
    // true when a walker of radius r cannot stand at p
    blocked(p, r = STROLL.radius) {
      const N = near(p, r + 0.05);
      if (insideSolid(p, N.polys)) return true;
      const q = settle([p[0], p[1]], r, N);
      return Math.hypot(q[0] - p[0], q[1] - p[1]) > 1e-6;
    },
  };
}

// ---------- ground heights ----------
// The upward faces of the ground meshes in world space, in a grid on the xz plane. at(x, z, cap) gives the highest
// surface no higher than cap (where the feet go) and the highest surface of all (a ledge the walker cannot take).
export function groundIndex(meshes) {
  const cell = 2, grid = new Map(), out = [null, null];
  const key = (i, j) => i * 100003 + j;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let count = 0;
  for (const m of meshes) {
    m.updateWorldMatrix(true, false);
    const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(m.matrixWorld);
      b.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(m.matrixWorld);
      c.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(m.matrixWorld);
      e1.subVectors(b, a).cross(e2.subVectors(c, a));
      const L = e1.length();
      if (L < 1e-9 || Math.abs(e1.y) / L < 0.5) continue;           // kerb faces, step risers, walls
      const tri = [a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z];
      for (let i = Math.floor(Math.min(a.x, b.x, c.x) / cell); i <= Math.floor(Math.max(a.x, b.x, c.x) / cell); i++) {
        for (let j = Math.floor(Math.min(a.z, b.z, c.z) / cell); j <= Math.floor(Math.max(a.z, b.z, c.z) / cell); j++) {
          const k = key(i, j);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(tri);
        }
      }
      count++;
    }
  }
  return {
    count,
    at(x, z, cap = Infinity) {
      let best = null, top = null;
      for (const t of grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []) {
        const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
        if (Math.abs(d) < 1e-12) continue;
        const u = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d;
        const v = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d;
        if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
        const y = u * t[1] + v * t[4] + (1 - u - v) * t[7];
        if (top === null || y > top) top = y;
        if (y <= cap + 1e-4 && (best === null || y > best)) best = y;
      }
      out[0] = best; out[1] = top;
      return out;
    },
  };
}

// ---------- names of the streets and squares, for the walker's position ----------
export function splitName(name) {
  const m = /^(.*?[㐀-鿿\)）])\s*([A-Za-zÀ-ÿ].*)$/.exec(name || '');
  return m ? { zh: m[1].trim(), pt: m[2].trim() } : { zh: name || '', pt: '' };
}

export function placeNames(data) {
  const cell = 10, grid = new Map();
  const key = (i, j) => i * 100003 + j;
  for (const r of data.roads) {
    if (!r.name) continue;
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1];
      for (let i = Math.floor(Math.min(a[0], b[0]) / cell) - 1; i <= Math.floor(Math.max(a[0], b[0]) / cell) + 1; i++) {
        for (let j = Math.floor(Math.min(a[1], b[1]) / cell) - 1; j <= Math.floor(Math.max(a[1], b[1]) / cell) + 1; j++) {
          if (!grid.has(key(i, j))) grid.set(key(i, j), []);
          grid.get(key(i, j)).push({ a, b, name: r.name, w: r.w });
        }
      }
    }
  }
  const squares = (data.squares || []).filter((q) => q.name);
  return (p) => {
    for (const q of squares) if (pointIn(p, q.outer)) return q.name;
    let best = null, bd = Infinity;
    for (const s of grid.get(key(Math.floor(p[0] / cell), Math.floor(p[1] / cell))) || []) {
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], L2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / L2));
      const d = Math.hypot(s.a[0] + dx * t - p[0], s.a[1] + dy * t - p[1]) - s.w / 2;
      if (d < bd) { bd = d; best = s.name; }
    }
    return bd < 6 ? best : null;
  };
}

// ---------- the walker ----------
// ctx: { data, world, camera, renderer, toWorld(x, y, z) -> Vector3, scale() -> world.scale, groundNames,
//        hud: { hint, joy }, onStep(pace), onPlace({ zh, pt }), onExit() }
export function createStroll(ctx) {
  const { camera, renderer } = ctx;
  const collider = buildCollider(ctx.data);
  const nameAt = placeNames(ctx.data);
  const meshes = [];
  ctx.world.traverse((o) => { if (o.isMesh && ctx.groundNames.some((n) => o.name === n || o.name.startsWith(`${n}_`))) meshes.push(o); });
  let ground = null, groundScale = '';

  const keys = new Set(), joy = { x: 0, y: 0 };
  const S = { on: false, p: [0, 0], foot: 0, yaw: 0, pitch: 0, vel: [0, 0], phase: 0, steps: 0, name: null, nameT: 0, locked: false };

  // ground under data point (x, y), for feet at height `from` (world): [where the feet go, highest surface]
  const groundAt = (x, y, from) => {
    const w = ctx.toWorld(x, y, 0);
    return ground.at(w.x, w.z, from + STROLL.stepUp);
  };

  function enter(x, y, heading) {
    // the index is in world space: rebuild it if the environment scale changed since the last walk
    const sk = ctx.world.scale.toArray().join();
    if (sk !== groundScale) { ground = groundIndex(meshes); groundScale = sk; }
    let p = [x, y];
    if (collider.blocked(p)) p = STROLL.spawn.slice(0, 2), heading = STROLL.spawn[2];
    S.p = p;
    S.yaw = heading;
    S.pitch = 0.04;
    S.vel = [0, 0];
    S.foot = groundAt(p[0], p[1], 0.5)[0] ?? 0;
    S.on = true;
    S.name = null;
    keys.clear();
  }
  function exit() {
    S.on = false;
    keys.clear();
    if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
  }

  // input: keys, mouse look (pointer lock where the page allows it, dragging otherwise), touch stick
  window.addEventListener('keydown', (e) => {
    if (!S.on || (e.target instanceof Element && e.target.closest('input'))) return;
    if (e.code === 'Escape' && !S.locked) { ctx.onExit(); return; }
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const turn = (dx, dy) => {
    S.yaw -= dx * STROLL.look;
    S.pitch = THREE.MathUtils.clamp(S.pitch - dy * STROLL.look, -1.25, 1.25);
  };
  let drag = null, lockFailed = false;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!S.on) return;
    if (e.pointerType === 'mouse' && !lockFailed && !S.locked && renderer.domElement.requestPointerLock) {
      try { const r = renderer.domElement.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFailed = true; }); } catch { lockFailed = true; }
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointerlockerror', () => { lockFailed = true; });
  document.addEventListener('pointerlockchange', () => {
    S.locked = document.pointerLockElement === renderer.domElement;
    if (ctx.hud.hint) ctx.hud.hint.hidden = S.locked;
  });
  window.addEventListener('pointermove', (e) => {
    if (!S.on) return;
    if (S.locked) { turn(e.movementX, e.movementY); return; }
    if (!drag || drag.id !== e.pointerId) return;
    turn(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  window.addEventListener('pointerup', (e) => { if (drag && drag.id === e.pointerId) drag = null; });
  if (ctx.hud.joy) {
    const el = ctx.hud.joy, knob = el.firstElementChild;
    let id = null;
    const set = (e) => {
      const r = el.getBoundingClientRect(), R = r.width / 2;
      let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      joy.x = x; joy.y = y;
      knob.style.transform = `translate(${x * R * 0.6}px, ${y * R * 0.6}px)`;
    };
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); id = e.pointerId; el.setPointerCapture(id); set(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    for (const ev of ['pointerup', 'pointercancel']) el.addEventListener(ev, () => { id = null; joy.x = joy.y = 0; knob.style.transform = ''; });
  }

  function update(dt) {
    if (!S.on) return;
    dt = Math.min(dt, 0.1);
    // pace: keys or stick, eased
    let fwd = 0, side = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fwd += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fwd -= 1;
    if (keys.has('KeyA')) side -= 1;
    if (keys.has('KeyD')) side += 1;
    if (keys.has('ArrowLeft')) S.yaw += 1.6 * dt;
    if (keys.has('ArrowRight')) S.yaw -= 1.6 * dt;
    fwd -= joy.y; side += joy.x;
    const m = Math.hypot(fwd, side);
    if (m > 1) { fwd /= m; side /= m; }
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? STROLL.run : STROLL.walk;
    const hx = Math.cos(S.yaw), hy = Math.sin(S.yaw);            // heading in data axes
    const want = [(hx * fwd + hy * side) * speed, (hy * fwd - hx * side) * speed];
    const k = Math.min(1, dt * STROLL.accel);
    S.vel[0] += (want[0] - S.vel[0]) * k;
    S.vel[1] += (want[1] - S.vel[1]) * k;
    // move: walls and posts in plan, then the ground; a rise above one step is a wall too
    const before = S.p;
    let p = collider.move(S.p, [S.vel[0] * dt, S.vel[1] * dt]);
    const [g, top] = groundAt(p[0], p[1], S.foot);
    if (top !== null && top - S.foot > STROLL.stepUp) { p = before; S.vel[0] = S.vel[1] = 0; }
    else if (g !== null) S.foot += (g - S.foot) * Math.min(1, dt * (g > S.foot ? 14 : 9));
    S.p = p;
    // head: a gentle bob and sway per step; a footstep at each low point
    const moved = Math.hypot(p[0] - before[0], p[1] - before[1]);
    const pace = Math.hypot(S.vel[0], S.vel[1]);
    const prev = Math.floor(S.phase / Math.PI);
    S.phase += (moved / STROLL.stride) * Math.PI;
    if (Math.floor(S.phase / Math.PI) !== prev && pace > 0.3) { S.steps++; ctx.onStep?.(pace / STROLL.walk); }
    const amp = Math.min(1, pace / STROLL.walk);
    const bob = -Math.abs(Math.cos(S.phase)) * STROLL.bob * amp + STROLL.bob * amp * 0.6;
    const sway = Math.sin(S.phase) * STROLL.sway * amp;
    const pos = ctx.toWorld(p[0] + hy * sway, p[1] - hx * sway, 0);
    pos.y = S.foot + STROLL.eye + bob;
    camera.position.copy(pos);
    const look = ctx.toWorld(p[0] + hx * Math.cos(S.pitch), p[1] + hy * Math.cos(S.pitch), 0).sub(ctx.toWorld(p[0], p[1], 0));
    look.y = Math.sin(S.pitch);
    camera.lookAt(pos.add(look));
    // the street or square underfoot, shown when it changes
    S.nameT -= dt;
    if (S.nameT <= 0) {
      S.nameT = 0.4;
      const n = nameAt(p);
      if (n && n !== S.name) { S.name = n; ctx.onPlace?.(splitName(n)); }
    }
  }

  return {
    get on() { return S.on; },
    get state() { return S; },
    collider,
    enter, exit, update,
  };
}
