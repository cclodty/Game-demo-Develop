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
  // the dive (player.js): Space with a direction while in bullet time throws the player `dist` m that way in `air` s
  // (the player's own time) with the guns still firing and bullets passing under the body, then a `roll` s roll at
  // `rollMul` of the run speed; `cooldown` s before the next. Outside bullet time Space is the spin
  dive: { dist: 4, air: 0.42, roll: 0.3, rollMul: 0.5, cooldown: 0.4 },
  // a human shield (player.js grab): E within `reach` m of a man in front, with nothing to pick up, holds him `gap` m in
  // front for `hold` s (or until E again); enemy bullets from within ±`arc`° of the facing hit him instead, `hit` of his
  // hp each; the player walks at `walkMul` of the run speed and fires the left gun alone. Let go, he is shoved out
  // ahead at `shove` m/s (about a quarter of that in metres, as a kick's flight slows), bowling over whoever he meets
  humanShield: { reach: 1.5, gap: 0.75, hold: 1.5, arc: 60, hit: 1, walkMul: 0.6, shove: 24 },
  throwReach: 1.6, // metres: G picks up a pan or barrel this close
  throwRange: 8, // metres a carried thing is thrown, at most
  kickRange: 2.1,
  kickArc: 1.25, // radians, total cone is twice this
  kickCooldown: 0.45,
  execRange: 1.2, // m: F by an enemy kicked down or hit by something thrown, still dazed, finishes him
  execTime: 0.6, // s the execution takes, standing
  execInvuln: 0.3, // s untouchable at its start
};

/** The pan in hand (工具 ①, thrown.js / player.js smash): F swings it. */
export const PAN = {
  arc: 1.6, // radians either side of the facing the swing reaches
  reach: 2.3, // m
  power: 16, // how hard whoever is hit flies (dazed: an execution follows)
  damage: 2, // a thug has 3
  swing: 0.3, // s the swing shows (and, later, parries)
  barrelFly: 12, // m/s a barrel is batted off at; it goes off where it lands
  handY: 1.0, // m: where it rides in the hand
  parry: 0.25, // s from the start of the swing in which an enemy bullet or grenade in the arc is batted back
  batSpeed: 70, // m/s a batted bullet leaves at, towards the nearest enemy (HOME RUN when it kills)
  batDamage: 3, // a thug has 3
};

/** The umbrella (工具 ③, thrown.js / player.js shield): held open in front while F is held; G throws it like a dart. */
export const UMBRELLA = {
  cooldown: 0.4, // s after it closes before it opens again (no flicker)
  arc: 1.22, // radians either side of the facing it covers (±70°)
  reach: 1.3, // m in front of the player a bullet is caught
  block: 40, // PARASOL points per bullet caught…
  blockCap: 200, // …up to this much per opening
  hits: 6, // bullets it takes before the ribs give and it is done for
  walkMul: 0.6, // walking speed × while it is open (and no slide)
  dartDamage: 3, // thrown: a thug has 3
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

/**
 * Grazing (彈幕試驗 ③): in a mode with `graze` (waves.js MODES), every enemy bullet that passes within `radius` m of
 * the player's middle without hitting him gives `focus` of the meter and GRAZE Style, `pts` a bullet (gathered into
 * one GRAZE at most every `flush` s, so the HUD's feed is not flooded); the notes count them every `log` s. There the
 * hitbox (PLAYER.hitRadius) shows as a dot once bullet time is `show` of the way in. Other modes keep CLOSE CALL.
 */
export const GRAZE = { radius: 0.5, focus: 0.02, pts: 10, flush: 0.25, log: 3, show: 0.3 };

/**
 * The bullet hell's room fights (彈幕 ② A①, DECISIONS 2026-10-26): in a mode played in rooms (waves.js MODES `floor`)
 * the arcade's enemies come, with the arcade's fast bullets, and the hell is how many fire at once: nobody waits for
 * an aim token (enemies.js requestToken), the gap before a man fires again is `fireMul` of his type's, `maxAlive` may
 * stand at once and the next comes in `entry` s after the last. Every one glows as he aims (the heavy guns' tell,
 * on top of his laser). The far side (對面陣地): a room's `posts` (rooms.js) are where its gunners go to fire from;
 * a man leaves his when the player comes within `postClose` m or the cover it names is gone, and looks for another
 * `postRetry` s later; only a gun that reaches `postRange` m takes one (a shotgunner comes on as ever). First
 * version, to be confirmed in play.
 */
export const HELL = {
  fireMul: 0.6,
  maxAlive: 12,
  entry: [0.3, 0.7],
  postClose: 4,
  postRetry: 0.6,
  postRange: 10,
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
  perchStep: 0.8, // s a man sent up to a balcony (maps.js perches) takes to step out onto it from inside
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
  flinch: 0.25, // s a shot that does not kill rocks him back (characters.js KEY_POSES.flinch), fading (試玩回饋 ④: thicker enemies, so the hits must show)
  // 閃避翻滾 (試玩回饋 ④): a gunman or a blade (enemies.js TYPES `dodge`) with the player's aim on him (within `reach` m of
  // his body) for `watch` s while the player fires crouches `tell` s, then rolls `dist` m to the side in `roll` s; once
  // each `cooldown` s. Never into a wall or off the floor (the nav grid), so with no room he stands
  dodge: { watch: 0.4, reach: 0.5, tell: 0.25, roll: 0.4, dist: 2.5, cooldown: 3 },
  // 敵人動作 ② (試玩回饋 ④): a rifleman or a shotgunner (TYPES `strafe`) steps sideways at `speed` m/s while he aims and
  // fires, turning back every `flip` s or at a wall
  strafe: { speed: 1.8, flip: 1.5 },
  // low cover (no higher than `maxH`, no deeper than `depth` m) in a man's straight way within `look` m (TYPES `vault`):
  // over it in `time` s, in the air, no shot, no roll; looked for every `every` s
  vault: { maxH: 1, depth: 1.6, look: 2, time: 0.5, every: 0.25 },
  // a gunman (TYPES `retreat`) down to `at` of his health falls back to cover farther from the player, or `away` m off
  // when there is none; never the last man standing
  retreat: { at: 0.5, away: 6 },
  // 飛仔 TUMBLER (試玩回饋 ④; TYPES `tumble`): rolls of `dist` m in `roll` s at the player, swung `angle`° one side then
  // the other, bullets passing through him mid-roll; `land` s open after each; after `rolls` rolls `pant` s for breath;
  // within `reach` m a kick, `windup` s to wind up, for `kick`
  tumble: { roll: 0.4, dist: 3, angle: 25, land: 0.5, rolls: 3, pant: 2, reach: 1.8, windup: 0.3, kick: 20 },
  // 帶頭大佬 CAPTAIN (試玩回饋 ④; TYPES `captain`): while he stands the others hide less and go round to the player's
  // sides, a place `side[0]`–`side[1]`° off the line from the player to him worth `bonus` more to them; when he falls,
  // for `panic` s they take `panicAim` times as long to aim and fall back `back` m from the player
  captain: { side: [50, 130], bonus: 5, panic: 4, panicAim: 1.6, back: 6 },
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
  perch: 2, // men a beat sends up to a map's balconies (maps.js perches), at most: enemies.js TYPES `perch` say who goes
  perchClear: 5, // m: no balcony this close to the player is picked
};

/**
 * 同一水平 (DECISIONS 2026-10-22): the player and the enemies fight on one level. Two people are on one level when the
 * ground under them differs by at most `tol` m (maps.js `zones`; Senado's sunk fountain ring, 0.48 m down, is one level
 * with the square). Across more, an enemy neither aims nor fires nor throws but walks to the player's level, and a
 * bullet stops where the ground under it has risen or fallen more than `tol` from where it was fired (a step's edge).
 */
/**
 * The firepower the player is handed (試玩回饋 ④, DECISIONS 2026-10-23): a heavy gun is something to save, not a
 * new one every wave, so the waves between are got through with kicks, throws, the map and bullet time. The weapon
 * pads (maps.js `pads`) fill once a stage, at its first wave; what each enemy type may drop, and how much of the
 * gun's ammo comes with it. The pistols stay unlimited.
 */
export const FIREPOWER = {
  pads: 'stage', // when the pads fill: 'stage' (a stage's first wave) or 'wave' (every wave, as before 2026-10-23)
  drops: { grunt: [['smg', 0.12]], shotgun: [['shotgun', 0.5]], rifle: [['rifle', 0.5]], brute: [['minigun', 0.35]] }, // [weapon, chance], tried in order (the brute's was 1)
  dropAmmo: 0.4, // of the gun's ammo, in any dropped gun (was 0.6, and a brute's minigun came full)
};

/**
 * How thick the enemies are (試玩回饋 ④, DECISIONS 2026-10-23): each comes in with `base` times the health his type
 * has in enemies.js TYPES, and every stage of the run (waves.js stageIndex) adds `perStage` of that again, so a gun
 * takes more shots as the night goes on. What is not a bullet (a kick, a throw, a barrel, a door, a stray round) is
 * made as much stronger: it takes as many as it always did, and an execution or a fall still takes him at once.
 */
export const ENEMY_HP = {
  base: 1.5, // ×: a thug 3 → 5, a brute 20 → 30 (rounded)
  perStage: 0.25, // + per stage after the first: the second ×1.25, the third ×1.5
};

/**
 * The run gets harder as it goes (試玩回饋 ④, DECISIONS 2026-10-23): each stage (waves.js stageIndex) the enemies'
 * aim (on top of the difficulty's, rules.js aimMul) and the gap before they fire again take `perStage` less again,
 * so late in a run bullet time is for seeing who fires first; and more may stand at once in a trickle.
 */
export const RAMP = {
  perStage: 0.1, // × (1 − this) a stage: the second ×0.9, the third ×0.81
  maxAlive: 11, // most standing at once while a wave trickles in (endless; arcade comes in beats, BEATS): was 9
};

export const LEVELS = {
  tol: 0.6,
};

/** Things in the maps that play along (環境互動). */
/**
 * The race on the Guia circuit (src/race.js; the timetable and the racing line are the map's `race`): `warn` s before
 * each pass the lights turn red and a line glows on the road; then `cars` cars, `gap` m apart, each on a line of its
 * own `lanes` m off the racing line, sweep the road at `speed` m/s (world time). Each is `length` × `width` m; it
 * kills an enemy outright and costs the player `damage` HP, whatever move he is making. The teams are made up.
 */
export const RACE = {
  warn: 2,
  cars: 3,
  speed: 46,
  gap: 9,
  lanes: [0, -2.2, 2.2],
  length: 4.6,
  width: 1.9,
  damage: 60,
  teams: [0xd8262e, 0x1d6fe8, 0xf0c020],
};

export const ENV = {
  crateHits: 6, // bullets a wooden crate takes before it breaks apart
  flockReach: 2, // metres: an aiming enemy this close to a flock that takes off loses his aim
  flockBlind: 0.5, // world seconds before he can aim again (a kill meanwhile is a PIGEON STRIKE)
  flockScare: 1.5, // metres: a player bullet passing this close to a resting flock startles it
  flockAway: [14, 24], // world seconds a startled flock stays away
  flockCloud: { time: 2.5, radius: 3 }, // for `time` s after it takes off, a flock is a cloud `radius` m round its spot that a marksman's line cannot cross (level.js flockBlocks)
  // fixtures (fixtures.js): street lamps and hanging signs
  lampHits: 2, // player bullets that put a street lamp out
  darkRadius: 4, // m: the dark pool under a lamp shot out…
  darkTime: 10, // …for this many world seconds, in which the enemies inside cannot aim (a kill there is BLACKOUT)
  signHits: 3, // bullets on a hanging sign's bracket before the board drops
  signFall: 0.45, // s from the bracket breaking to the board on the floor
  signBlast: 1.2, // m: whoever stands this close to where it lands is CRUSHED
  signDamage: 60, // what the player takes under it
  doorOpen: 4, // s a door stays open before it swings shut (if nobody stands in it)
  doorSlam: 2, // damage a kicked-open door does to whoever stands behind it (and a stun: an execution follows)
  slamPower: 12, // how hard the door throws him
  shutterFall: 0.5, // s from the lock giving to the shutter on the ground
  shutterDamage: 60, // what the player takes under a shutter
  // a round table (fixtures.js 'table', 彈幕試驗 ④): upright `low` m high (bodies stop at it, shots and sight pass
  // over); kicked, it flips in `flipTime` s, its top a wall `height` m high and `thick` m thick across the kick's way,
  // `out` m beyond its middle, FLIP +`pts`; it stops shots and sight until `hp` shots (anyone's) break it
  table: { low: 0.8, height: 1.6, thick: 0.3, out: 0.45, flipTime: 0.2, hp: 10, pts: 50 },
  // a room's exit (fixtures.js 'exit', 彈幕試驗 ⑤): open, the player within `reach` m of its wall goes on; its leaves swing out in `open` s (looks)
  exit: { reach: 1.1, open: 0.6 },
  // a kicked LPG cylinder jets off (level.js Barrel.rocket) and bursts on an enemy or when its time is up: ROCKET CAN
  rocketTime: 1.5, // s of flight
  rocketAccel: 26, // m/s² along its way
  rocketSpeed: 14, // m/s at most
  // a fire extinguisher (level.js Extinguisher): shot, it bursts into a cloud nobody aims from (SMOKE); kicked, it tumbles about
  smokeRadius: 3, // m
  smokeTime: 6, // s the cloud lasts
  tumbleTime: 2.5, // s a kicked one careers about, bowling over whoever it meets
  tumbleSpeed: 10, // m/s it keeps while it does
  sprayAhead: 2, // m ahead of the player the cloud of one sprayed from the arms (F, thrown.js spray) is centred
  // a fishing net (level.js Net, the docks): thrown, it falls open over `radius` m for `time` s and holds everyone under it, dazed (NETTED)
  net: { radius: 2.2, time: 2.5 },
  // a hand trolley (level.js Trolley, the docks): kicked off at `speed` m/s, slowing by `friction` a second (a barrel's is 3.2);
  // it keeps `knock` of its speed through each one it bowls over, and `bowling` of them in one roll is BOWLING +`pts`
  trolley: { speed: 13, friction: 0.45, knock: 0.85, bowling: 2, pts: 200 },
  // a barrel knocked over on a slope (a shot, a kick; maps.js `slope`: 大三巴's steps) lies on its side and rolls down it
  // (level.js Barrel): pulled by `gravity` × the slope's rise per metre, slowed by `friction` a second (a standing one's is
  // 3.2), at rest once under `stop` m/s on the level; one going `tip` m/s onto a slope falls over too. At `bowl` m/s or
  // more it bowls over whoever it meets and keeps `knock` of its speed; the first of a roll is ROLLING +`pts`
  roll: { gravity: 40, friction: 0.9, tip: 2, stop: 0.3, bowl: 3, knock: 0.8, pts: 150 },
  // mahjong tiles (thrown.js throwTiles; the tables on Rua da Felicidade): G within `reach` m of a table, hands empty,
  // throws a handful: one tile for each of `fan` (where it flies across a fan `spread` rad wide around the aim: most
  // of a handful goes straight, two close either side of the aim so the man aimed at is hit, two a little out, two at
  // the edges), flying `range` m at `speed` m/s; each dazes the first man it meets for `daze` s and does no harm;
  // `pong` or more dazed by one handful is PONG +`pts`. A table holds `handfuls` (one wall of tiles each), back with a new run
  tiles: { reach: 1.2, fan: [-0.5, -0.3, -0.06, 0.06, 0.3, 0.5], spread: 0.8, range: 9, speed: 18, daze: 0.4, pong: 3, pts: 150, handfuls: 4 },
  // water (level.js `water`): an enemy knocked over the edge of it is gone (SPLASH); props that land in it sink
  splashSpeed: 4, // m/s towards the water a knocked-over enemy needs to go in
  splashReach: 0.6, // m beyond his body the water has to be
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
/** The background songs (music.js SONGS): one a stage, in this order, round again in endless; ?music=<id> plays just that one for a visit. */
export const MUSIC = {
  playlist: ['undertow', 'countdown', 'abyss'],
};

export const PAD = {
  moveAt: 0.35, // the left stick past this (each axis) holds W / A / S / D
  deadzone: 0.3, // the right stick inside this keeps the last aim direction
  aimDistance: 7, // m: the aim point ahead of the player along the right stick
  assistDeg: 6, // the aim snaps onto the nearest visible enemy this close to the stick's direction
  assistRange: 25, // m: enemies further off are not snapped to
};

/**
 * Touch on a phone (手機版 ①, input.js): a stick wherever each thumb comes down, the left one moving, the right one
 * aiming and firing; how far it is pushed counts against `radius` (CSS px). The aim snaps onto enemies as the pad's does.
 */
export const TOUCH = {
  radius: 60, // px: a thumb this far from where it came down pushes its stick all the way
  moveAt: 0.35, // the left stick past this (each axis) holds W / A / S / D
  deadzone: 0.25, // the right stick inside this neither fires nor turns the aim
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
  // the flat look, on a map with `look: 'flat'` (議事亭前地 as the trial): the world drawn like the characters
  flatSteps: 2, // toon ramp steps on the world (characters: charSteps)
  flatFloor: 0.5, // the ramp's dark step
  flatBands: 4, // brightness bands the world's colours are cut into
  flatSat: 1.5, // colour saturation (1 = as modelled)
  flatBlur: 2, // texture blur (mip levels) before the bands
  edge: { from: 0.012, full: 0.05, ink: 0.85, step: 2, fadeFrom: 70, fadeTo: 150 }, // ink lines: depth bend (share of the distance) where a line starts and is full, its darkness, the sampling step in pixels, and the distances (m) over which lines fade out
};
