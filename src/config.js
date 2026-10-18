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
  execRange: 1.2, // m: F by an enemy kicked down or hit by something thrown, still dazed, finishes him
  execTime: 0.6, // s the execution takes, standing
  execInvuln: 0.3, // s untouchable at its start
};

export const FOCUS = {
  worldScale: 0.2, // world speed while in bullet time
  playerScale: 0.55, // the player is slowed less than the world
  drain: 0.125, // meter per real second while active
  regen: 0.022,
  minToEnter: 0.1,
  killRefill: 0.12,
  executeRefill: 0.25, // an execution's refill (instead of killRefill)
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
 * The live Style rank in the top-right corner, D to SSS: a gauge where each
 * whole step is one rank. A kill with a style tag (SLOW-MO, KICK, RICOCHET…)
 * pushes it by `move` (plus `extra` per further tag), a plain kill by
 * `kill`, a style bonus (DODGE, CLOSE CALL…) by its points × `perPoint`. The
 * same move again right after itself gains `repeat` times what it gained the
 * time before; a different move gains in full again. A hit drops `hit`
 * ranks; after `idle` seconds without a gain the gauge drains `drain` ranks a
 * second. Standing still (under `campSpeed` m/s) for `camp` seconds with
 * enemies about drains `campDrain` a second at once (Style 推進): the gauge
 * wants you moving. A kill `roam` m or more from the last one is a ROAM.
 * Times are real seconds. The rank only shows: it changes no score.
 */
export const RANK = {
  names: ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'],
  kill: 0.3,
  move: 0.75,
  extra: 0.25,
  perPoint: 0.005,
  repeat: 0.5,
  hit: 1,
  idle: 5,
  drain: 0.5,
  camp: 3, // s standing still before the gauge starts to go
  campDrain: 1, // ranks a second while camping (twice the idle drain)
  campSpeed: 1, // m/s: slower than this is standing still
  roam: 8, // m from the last kill for a ROAM
  roamPts: 60,
};

/**
 * How enemies close in (敵人掩體與包抄; enemies.js, TYPES[type].tactic). A
 * gunner with `tactic: 'cover'` goes behind a box that stands between him and
 * the player, ducks there, and fights by stepping out (peek); a pair of
 * rushers with 'flank' split up and arrive from two sides; 'advance' is the
 * old straight approach.
 */
export const AI = {
  coverSearch: 8, // m: how far a gunner looks for a box to hide behind
  coverHeight: 0.9, // m: lower cover hides nobody
  coverGap: 0.55, // m between the cover's face and where he stands
  duck: [0.8, 1.4], // s hidden between peeks
  peek: 0.6, // s he stays out after his shot before ducking again
  peekTimeout: 1.5, // s stepped out without a shot before he gives the spot up
  peeks: 3, // shots from one spot before he leaves it and comes on
  rest: 6, // s after leaving a spot before he looks for another; the last man standing never hides
  flankAngle: 60, // degrees off the straight line each of a pair of rushers takes
  flankSwing: 0.9, // how wide the arc is: the point he heads for lies this × his distance from the player
  flankClose: 3, // m: from here they just come straight at you
};

/**
 * Waves played in beats (波次拍子; waves.js, the MODES with `beats`): the
 * wave's roster is split into beats of a few enemies that come in together at
 * one spot after a telegraph, with quiet between. Endless keeps its trickle.
 */
export const BEATS = {
  size: [3, 6], // enemies a beat brings, least and most (the roster is split as evenly as that allows)
  finaleSize: [5, 8], // the last wave's beats are bigger
  telegraph: 1.2, // s the spot's rings burn before they come
  quiet: 1.5, // s of nothing after a beat is cleared (or spent) before the next telegraph
  next: 1, // the next beat comes when this many or fewer still stand…
  after: 12, // …or this many s after the beat came, whatever stands
  spread: 18, // m: a second door this close to the beat's door shares its enemies
  clean: 100, // CLEAN BEAT: a beat cleared without taking a hit
};

/** Things in the maps that play along (環境互動). */
export const ENV = {
  crateHits: 6, // bullets a wooden crate takes before it breaks apart
  flockReach: 2, // metres: an aiming enemy this close to a flock that takes off loses his aim
  flockBlind: 0.5, // world seconds before he can aim again (a kill meanwhile is a PIGEON STRIKE)
  flockScare: 1.5, // metres: a player bullet passing this close to a resting flock startles it
  flockAway: [14, 24], // world seconds a startled flock stays away
};

/** The 60-second warm-up on a first run (src/tutorial.js). */
export const WARMUP = {
  limit: 60, // real seconds before it ends anyway and wave 1 starts
  front: 8, // metres in front of the player for the first enemy
  behindPan: 3.5, // metres beyond the nearest pan, seen from the player, for the second
  besideBarrel: 1.6, // metres beyond the nearest barrel for the third: inside its blast
};

/**
 * The grade at the end of an arcade run (S, A, B, C, D). Three parts add up
 * to 100 points: the run's Style score against a par, the waves cleared
 * without a hit, and how fast a cleared run was. A run that falls gets no
 * time points. The god-mode bot clears 12 waves with about 206,000 points.
 */
/** The leaderboard back end (backend/worker.js, docs/BACKEND.md): its address once deployed; empty plays offline. */
export const BACKEND = {
  url: '',
};

/** Gamepads (input.js poll, main.js padAim): sticks, the aim distance, the pull onto an enemy. */
export const PAD = {
  moveAt: 0.35, // the left stick past this (each axis) holds W / A / S / D
  deadzone: 0.3, // the right stick inside this keeps the last aim direction
  aimDistance: 7, // m: the aim point ahead of the player along the right stick
  assistDeg: 6, // the aim snaps onto the nearest visible enemy this close to the stick's direction
  assistRange: 25, // m: enemies further off are not snapped to
};

/** The best-kill clip (clip.js): overlapping recordings of a small copy of the screen. */
export const CLIP = {
  before: 6, // seconds kept ahead of the best kill
  after: 2, // and after it
  every: 4, // a new recording starts this often (about three run at once)
  fps: 30,
  width: 960, // pixels; the height follows the screen
  bitrate: 2500000, // bits per second
};

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
  bossZoom: 1.4, // a boss in the air (boss.js): the view pulls back this much
  bossPull: 0.35, // and leans this far from the player towards it
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
