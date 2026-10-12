// Gameplay tuning. Everything that changes how the game feels lives here.

export const ARENA = { halfW: 22, halfD: 15 };

// Height (y) at which bullets fly. Collision itself is 2D on the XZ plane.
export const GUN_Y = 1.35;

export const PLAYER = {
  radius: 0.42,
  hitRadius: 0.3, // smaller than the body on purpose: near misses should feel fair
  speed: 7.4,
  accel: 14,
  hp: 100,
  regenDelay: 2.6,
  regenRate: 28,
  fireInterval: 0.11,
  magSize: 30,
  reloadTime: 1.05,
  spread: 0.012,
  spinDuration: 0.5,
  spinCooldown: 0.28,
  spinSpeedMul: 1.7,
  kickRange: 2.1,
  kickArc: 1.25, // radians, total cone is twice this
  kickCooldown: 0.45,
};

export const FOCUS = {
  worldScale: 0.2, // world speed while in bullet time
  playerScale: 0.55, // the player is slowed less than the world
  drain: 0.125, // meter per real second while active
  regen: 0.022,
  minToEnter: 0.1,
  killRefill: 0.12,
  closeCallRefill: 0.05,
};

export const BULLET = {
  playerSpeed: 62,
  playerTrail: 2.2,
  enemyTrail: 1.1,
  maxRange: 70,
};

export const COMBO_WINDOW = 3.2;

export const CAMERA = {
  offsetY: 19.5,
  offsetZ: 11.6,
  fov: 40,
  lookAhead: 0.24,
  lookAheadMax: 5.5,
  focusZoom: 0.86,
};
