// Gameplay tuning. Everything that changes how the game feels lives here.

export const ARENA = { halfW: 22, halfD: 15 };

// Height (y) at which bullets fly. Collision itself is 2D on the XZ plane.
export const GUN_Y = 1.38;

// The game logic advances in fixed steps of 1/LOGIC_HZ seconds, whatever the
// display's refresh rate. Not a feel number: recorded runs depend on it.
export const LOGIC_HZ = 120;

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
  slideDuration: 0.55, // C while running: a low slide that enemy bullets pass over
  slideCooldown: 0.5,
  slideSpeedMul: 1.6, // launch speed relative to run speed, decaying over the slide
  slideMinSpeed: 3, // m/s needed to start a slide
  throwReach: 1.6, // metres: G picks up a pan or barrel this close
  throwRange: 8, // metres a carried thing is thrown, at most
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

/**
 * The grade at the end of an arcade run (S, A, B, C, D). Three parts add up
 * to 100 points: the run's Style score against a par, the waves cleared
 * without a hit, and how fast a cleared run was. A run that falls gets no
 * time points. The god-mode bot clears 12 waves with about 206,000 points.
 */
export const RATING = {
  style: 50, // points for the Style score, all of them at stylePar or more
  clean: 30, // points for waves cleared without a hit, all of them when every wave of the run is clean
  time: 20, // points for a cleared run's time: all at timePar seconds or faster, none at timeSlow
  stylePar: 250000,
  timePar: 480,
  timeSlow: 960,
  grades: [
    ['S', 85],
    ['A', 70],
    ['B', 55],
    ['C', 40],
  ], // the lowest total for each grade; below the last one is D
};

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

/**
 * The look ("neon figures", 2026-10-17): flat toon shading, an inverted-hull
 * outline, cyan afterimages behind the player's moves, character poses held
 * at 12 fps and comic proportions on worn models. Rendering only; each part
 * has a switch in the stats panel (src/style.js) and ?style=off turns it off.
 */
export const STYLE = {
  charSteps: 2, // toon ramp steps on characters
  worldSteps: 3, // and on the world
  charLine: 0.024, // outline thickness in metres on characters and props
  worldLine: 0.012, // world outline, when switched on
  ghostEvery: 0.05, // world seconds between afterimages during a move
  ghostLife: 0.3, // world seconds an afterimage takes to fade
  ghostAlpha: 0.26,
  ghostColor: [0.15, 0.95, 1.3], // under the bloom threshold on its own; three overlapping ghosts still glow
  stepHz: 12, // character poses refresh this often (world time)
  head: 1.28, // proportions on worn models
  hand: 1.35,
  foot: 1.2,
  thigh: 0.9,
};
