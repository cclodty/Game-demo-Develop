/**
 * 平面碰撞工具。測試場全部在同一地面上，碰撞以俯視 2D（X/Z）處理，
 * 再用高度決定障礙物是否擋子彈：高度低於子彈飛行高度的矮障礙只擋移動。
 */

export interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface SegmentHit {
  t: number; // 0..1，沿線段的比例
  nx: number; // 命中面的法線
  nz: number;
}

/** 把圓形推出所有方塊之外，回傳修正後的位置。 */
export function resolveCircle(
  x: number,
  z: number,
  r: number,
  boxes: readonly Box[],
  iterations = 3,
): { x: number; z: number; hit: boolean } {
  let hit = false;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (const b of boxes) {
      if (x < b.minX - r || x > b.maxX + r || z < b.minZ - r || z > b.maxZ + r) continue;
      const cx = x < b.minX ? b.minX : x > b.maxX ? b.maxX : x;
      const cz = z < b.minZ ? b.minZ : z > b.maxZ ? b.maxZ : z;
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      moved = true;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const push = r - d;
        x += (dx / d) * push;
        z += (dz / d) * push;
      } else {
        // 圓心已在方塊內：沿最短穿透軸推出。
        const left = x - b.minX;
        const right = b.maxX - x;
        const top = z - b.minZ;
        const bottom = b.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = b.minX - r;
        else if (m === right) x = b.maxX + r;
        else if (m === top) z = b.minZ - r;
        else z = b.maxZ + r;
      }
    }
    if (!moved) break;
  }
  return { x, z, hit };
}

/** 線段與軸對齊方塊（俯視）的交點；起點在方塊內時回傳 t = 0。 */
export function segmentBox(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  b: Box,
  expand = 0,
): SegmentHit | null {
  const minX = b.minX - expand;
  const maxX = b.maxX + expand;
  const minZ = b.minZ - expand;
  const maxZ = b.maxZ + expand;
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;
  let nx = 0;
  let nz = 0;

  if (Math.abs(dx) < 1e-12) {
    if (x0 < minX || x0 > maxX) return null;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - x0) * inv;
    let t2 = (maxX - x0) * inv;
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
    if (tmin > tmax) return null;
  }

  if (Math.abs(dz) < 1e-12) {
    if (z0 < minZ || z0 > maxZ) return null;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - z0) * inv;
    let t2 = (maxZ - z0) * inv;
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
    if (tmin > tmax) return null;
  }

  if (nx === 0 && nz === 0) {
    // 起點已在方塊內，法線取與前進方向相反。
    const len = Math.hypot(dx, dz) || 1;
    return { t: 0, nx: -dx / len, nz: -dz / len };
  }
  return { t: tmin, nx, nz };
}

/** 線段與圓的第一個交點比例；起點在圓內時回傳 0。 */
export function segmentCircle(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  cx: number,
  cz: number,
  r: number,
): number | null {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const fx = x0 - cx;
  const fz = z0 - cz;
  const c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dz * dz;
  if (a < 1e-12) return null;
  const b = 2 * (fx * dx + fz * dz);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

/** 找出線段最先碰到、且高度足以擋住 minHeight 的方塊。 */
export function firstBoxHit(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  boxes: readonly Box[],
  minHeight: number,
  expand = 0,
): (SegmentHit & { box: Box }) | null {
  let best: (SegmentHit & { box: Box }) | null = null;
  for (const b of boxes) {
    if (b.height <= minHeight) continue;
    const h = segmentBox(x0, z0, x1, z1, b, expand);
    if (h && (!best || h.t < best.t)) best = { ...h, box: b };
  }
  return best;
}

/** 兩點之間有沒有被方塊擋住（可用 expand 檢查有寬度的身體能否直接通過）。 */
export function lineClear(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  boxes: readonly Box[],
  minHeight = 0,
  expand = 0,
): boolean {
  for (const b of boxes) {
    if (b.height <= minHeight) continue;
    if (segmentBox(x0, z0, x1, z1, b, expand)) return false;
  }
  return true;
}

/** 3D 射線與「站在地面上的方塊」相交（用於判斷牆是否擋住鏡頭看角色）。 */
export function rayHitsBox3D(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  b: Box,
  maxT: number,
): boolean {
  let tmin = 0;
  let tmax = maxT;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, 0, b.height],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return false;
  }
  return true;
}
