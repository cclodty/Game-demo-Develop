export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** 把角度包回 (-π, π]。 */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** 與幀率無關的指數平滑。sharpness 越大越快到達目標。 */
export function damp(current: number, target: number, sharpness: number, dt: number): number {
  return target + (current - target) * Math.exp(-sharpness * dt);
}

/** 角度版的指數平滑，走最短的轉向；結果為連續角度，不吸附到固定方向。 */
export function dampAngle(current: number, target: number, sharpness: number, dt: number): number {
  const diff = wrapAngle(target - current);
  return wrapAngle(current + diff * (1 - Math.exp(-sharpness * dt)));
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 由面向角度得到前方向量（角色本地 +Z 為前方，與 three.js rotation.y 一致）。 */
export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** 角色本地 +X 軸在世界中的方向（面向 +Z 時，本地 +X 是角色的左手邊）。 */
export function localXOf(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** 由 (dx, dz) 求面向角度。 */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/**
 * 求角色應有的面向，使「偏在身側的槍口」沿面向發射時正好經過瞄準點。
 * gunSide 為槍口在角色本地 X 的偏移。距離太近時退回單純指向瞄準點。
 */
export function aimYawWithMuzzleOffset(dx: number, dz: number, gunSide: number): number {
  const d = Math.hypot(dx, dz);
  const phi = Math.atan2(dx, dz);
  if (d < Math.abs(gunSide) * 3 || d < 0.6) return phi;
  return wrapAngle(phi - Math.asin(clamp(gunSide / d, -0.9, 0.9)));
}

/** 可重現的亂數（mulberry32）。 */
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
