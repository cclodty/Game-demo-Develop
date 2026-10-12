export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
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
