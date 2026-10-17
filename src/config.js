// Gameplay tuning. Everything that changes how the game feels lives here.

export const ARENA = { halfW: 22, halfD: 15 };

// Height (y) at which bullets fly. Collision itself is 2D on the XZ plane.
export const GUN_Y = 1.38;

export const PLAYER = {
  radius: 0.3,
  hitRadius: 0.22, // smaller than the body on purpose: near misses should feel fair
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
  spinFireMul: 0.55, // fire interval while spinning: holding fire during a spin sprays a ring (the spin shot)
  spinFan: 0.35, // radians between the two guns during a spin shot
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
  dist: 22.7, // camera distance from the point it looks at
  pitch: 59.25, // degrees above the horizon (maps can override both)
  fov: 40,
  lookAhead: 0.24,
  lookAheadMax: 5.5,
  focusZoom: 0.86,
};

/**
 * Camera views, cycled with V. `top` keeps each map's own pitch; the two
 * 45-degree views tilt the camera down to 45 degrees, and the "side" one
 * also swings it round to look in from the south-west corner.
 */
export const VIEWS = [
  { id: 'top', name: '俯視', en: 'TOP-DOWN' },
  { id: 'tilt', name: '45° 俯視', en: '45° TILT', pitch: 45, yaw: 0 },
  { id: 'iso', name: '45° 側俯視', en: '45° SIDE', pitch: 45, yaw: -45 },
];
