import { vfxRng } from './rng.js';

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
// Effects only (particles, decals, sounds, set dressing): these draw from the
// effects RNG. Anything that changes the game draws from game.rng (see rng.js).
export const rand = (a, b) => vfxRng.range(a, b);
export const randInt = (a, b) => vfxRng.int(a, b);
export const pick = (arr) => vfxRng.pick(arr);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

export function turnTowards(a, b, maxStep) {
  const d = wrapAngle(b - a);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

// Facing convention: angle 0 looks down +z, angle PI/2 looks down +x.
export const angleTo = (x0, z0, x1, z1) => Math.atan2(x1 - x0, z1 - z0);

/**
 * Segment (x0,z0)->(x1,z1) against an axis aligned box.
 * Writes entry parameter t (0..1) and the face normal into `out`.
 */
export function segAABB(x0, z0, x1, z1, b, out) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let nz = 0;

  if (Math.abs(dx) < 1e-9) {
    if (x0 < b.minX || x0 > b.maxX) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (b.minX - x0) * inv;
    let t2 = (b.maxX - x0) * inv;
    let n = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = n;
      nz = 0;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }

  if (Math.abs(dz) < 1e-9) {
    if (z0 < b.minZ || z0 > b.maxZ) return false;
  } else {
    const inv = 1 / dz;
    let t1 = (b.minZ - z0) * inv;
    let t2 = (b.maxZ - z0) * inv;
    let n = -1;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
      n = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nx = 0;
      nz = n;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }

  out.t = tmin;
  out.nx = nx;
  out.nz = nz;
  return true;
}

/** Segment against circle. Returns entry t in 0..1, 0 if starting inside, -1 on miss. */
export function segCircle(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const fx = x0 - cx;
  const fz = z0 - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return -1;
  const b = 2 * (fx * dx + fz * dz);
  let disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t = (-b - disc) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

export function pointSegDist2(px, pz, x0, z0, x1, z1) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - x0) * dx + (pz - z0) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const qx = x0 + dx * t - px;
  const qz = z0 + dz * t - pz;
  return qx * qx + qz * qz;
}

/** Push a circle (object with x,z) out of a box. Returns true if it collided. */
export function resolveCircleAABB(p, r, b) {
  const cx = clamp(p.x, b.minX, b.maxX);
  const cz = clamp(p.z, b.minZ, b.maxZ);
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const push = r - d;
    p.x += (dx / d) * push;
    p.z += (dz / d) * push;
  } else {
    const l = p.x - b.minX;
    const rr = b.maxX - p.x;
    const t = p.z - b.minZ;
    const bt = b.maxZ - p.z;
    const m = Math.min(l, rr, t, bt);
    if (m === l) p.x = b.minX - r;
    else if (m === rr) p.x = b.maxX + r;
    else if (m === t) p.z = b.minZ - r;
    else p.z = b.maxZ + r;
  }
  return true;
}

// ---------------------------------------------------------------- polygons
// Polygons are flat arrays [x0, z0, x1, z1, ...] (closed implicitly), used for
// real building footprints that are not axis aligned.

export function pointInPoly(x, z, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = poly[i];
    const zi = poly[i + 1];
    const xj = poly[j];
    const zj = poly[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Closest point on the polygon outline; writes {x, z, d2, nx, nz} (edge normal, unnormalised side). */
export function closestOnPoly(x, z, poly, out) {
  let best = Infinity;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = poly[j];
    const az = poly[j + 1];
    const bx = poly[i];
    const bz = poly[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t;
    const qz = az + dz * t;
    const d2 = (x - qx) * (x - qx) + (z - qz) * (z - qz);
    if (d2 < best) {
      best = d2;
      out.x = qx;
      out.z = qz;
      out.ex = dx;
      out.ez = dz;
    }
  }
  out.d2 = best;
  return out;
}

/** Segment against a polygon outline (same contract as segAABB). */
export function segPoly(x0, z0, x1, z1, poly, out) {
  if (pointInPoly(x0, z0, poly)) {
    out.t = 0;
    out.nx = 0;
    out.nz = 0;
    return true;
  }
  const rx = x1 - x0;
  const rz = z1 - z0;
  let tmin = Infinity;
  let nx = 0;
  let nz = 0;
  const n = poly.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const ax = poly[j];
    const az = poly[j + 1];
    const sx = poly[i] - ax;
    const sz = poly[i + 1] - az;
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-12) continue;
    const qx = ax - x0;
    const qz = az - z0;
    const t = (qx * sz - qz * sx) / den;
    const u = (qx * rz - qz * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < tmin) {
      tmin = t;
      // edge normal facing the incoming ray
      const l = Math.hypot(sx, sz) || 1;
      nx = sz / l;
      nz = -sx / l;
      if (nx * rx + nz * rz > 0) {
        nx = -nx;
        nz = -nz;
      }
    }
  }
  if (tmin === Infinity) return false;
  out.t = tmin;
  out.nx = nx;
  out.nz = nz;
  return true;
}

const _cp = { x: 0, z: 0, d2: 0, ex: 0, ez: 0 };

/** Push a circle (object with x,z) out of a polygon. Returns true if it collided. */
export function resolveCirclePoly(p, r, poly) {
  const inside = pointInPoly(p.x, p.z, poly);
  closestOnPoly(p.x, p.z, poly, _cp);
  if (!inside && _cp.d2 >= r * r) return false;
  const d = Math.sqrt(_cp.d2);
  let ux;
  let uz;
  if (d > 1e-6) {
    ux = (p.x - _cp.x) / d;
    uz = (p.z - _cp.z) / d;
    if (inside) {
      ux = -ux;
      uz = -uz;
    }
  } else {
    const l = Math.hypot(_cp.ex, _cp.ez) || 1;
    ux = _cp.ez / l;
    uz = -_cp.ex / l;
  }
  p.x = _cp.x + ux * r;
  p.z = _cp.z + uz * r;
  return true;
}

export function polyDist2(x, z, poly) {
  return closestOnPoly(x, z, poly, _cp).d2;
}
