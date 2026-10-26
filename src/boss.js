// A stage's boss (頭目). In an arcade run every stage's last wave on a map with a boss (maps.js
// `boss`, whose `kind` is one of BOSSES) is that boss instead of the wave: waves 4 and 8 a shorter
// fight (waves.js MODES `midBoss`), the run's last (wave 12) in full. What every boss shares is
// in Boss: segments of health on the HUD bar, a HIT banner for each, and once it is down the
// BOSS bonus, the run's clip and the end of the wave (`downed`). Each kind brings its own moves.
// game.boss always stands for the boss of the moment (Bosses.view), so a test reads its fields
// whatever its kind.
//
// heli, the rooftop helicopter (頭目 ①②): it flies in from off the map and circles over the helipad, HELI.altitude m up, out of reach of
// bullets. Its searchlight sweeps the roof and follows a player it comes near; a player who
// stays in the light for light.lockAfter s draws a red line onto that spot for light.warn s and
// then a machine-gun burst there. Every rappel.every s two thugs rope down onto the pad.
// Only a blast right under it hurts it (頭目 ②): a thrown barrel (one that flies under it goes off
// there) or a grenade going off within hit.radius m of where it is over the roof takes one
// segment, and it reels for hit.reel s without firing. The fifth brings it down: it falls onto the
// pad and bursts (crash.radius m: get clear), the BOSS bonus is paid and the wave ends.
// dj, the club's DJ (夜店頭目): behind bulletproof glass round the booth, out of reach. The
// dance floor works to the beat (DJ.beat s of world time, so bullet time slows it too): a
// pattern of tiles lights up red for DJ.floor.warn beats, then zaps whoever stands on a lit
// tile (a spin rides it out). The speakers by the booth are the way in: blow one (shots, or a
// blast next to it) and the glass slides down for DJ.open s; DJ.perSegment hits on the DJ then
// take a segment and the glass comes straight back up. A blown speaker is back after a while.
// Thugs come in through the doors every DJ.crew.every s. Shots fly over the booth while the DJ
// is on (`pass`, bullets.js), at the glass or the DJ. The club's default boss is now the blade
// queen (below); the DJ stays as a kind a map can ask for.
//
// blade, the club's blade queen (夜店刀后, 頭目重做 ①): a knife fighter with a blade in each hand who
// crouches at one of the map's perches (`boss.perches`: the lounge, the top of the DJ booth, the glass
// walk, the bar) and dashes at the player, afterimages behind her, too fast for a shot to find (shots
// pass through her while she dashes; at a perch a blade turns them aside). She stops BLADE.dash.stop m
// short, raises both blades for BLADE.tell.time s (the window: a shot takes a segment, a pan smash or a
// batted-back bullet two, a kick shoves her back and holds the window open) and cuts (a spin dodges it);
// then she dashes off to another perch. Her dash runs through a player who neither slides under nor
// spins past her. From the first segment lost she dashes faster and may feint a hop to the player's
// other side before the real tell, one more a segment lost. A blast beside her takes a segment too.
// No crew: she fights alone.
//
// truck, the docks' armoured truck (碼頭頭目): it drives a loop between the containers (the map's
// `boss.loop`), shoving barrels and pans out of its way. Its roof gun draws a red line onto the
// player and sweeps a burst there every TRUCK.gun.every s; every TRUCK.charge.every s it stops,
// turns on the player, paints its path red on the ground and charges down it (slide, spin or get
// out of the way), then backs up to its loop. Bullets do nothing to the armour. What hurts it is a
// blast beside it (a barrel, a grenade), and its back door: every TRUCK.unload.every s it stops
// and lets two thugs out, and TRUCK.unload.hits shots into the open door take a segment.
//
// convoy, Senado's taxi convoy (議事亭頭目): three black taxis of the (fictional) gang drive in
// along the avenue and round the fountain, nose to tail (`boss.entry`, `boss.loop`). Every
// CONVOY.stop.every s they stop and each lets a thug out; from the lead's window a gunman fires
// short bursts onto a red line. The two escorts are the way in: CONVOY.tyres hits (or a blast)
// flatten an escort's tyres and it pulls aside for good. Until both are out the lead shrugs
// everything off; alone, it slows down, and CONVOY.perSegment hits (or a blast beside it) take
// a segment. A moving car runs into a player in its way (not one sliding or spinning). The docks'
// default boss is now the heavy gunner (below); the truck stays as a kind a map can ask for.
//
// gunner, the docks' heavy gunner (碼頭重炮, 頭目重做 ②): a big man behind a steel plate with a
// machine gun, in through the west gate and after the player at GUNNER.speed m/s, turning slowly.
// Shots from within the plate's arc glance off; shots on his back (or on him while he staggers)
// count, GUNNER.perSegment to a segment. Every gun.every s he plants his feet, draws a red line onto
// the player for gun.warn s and sweeps a long burst across it; every mortar.every s he lobs
// mortar.rounds shells onto the player's spot, each marked by a red ring on the ground for its flight.
// Under a lamp shot out or in an extinguisher's cloud he cannot see: no sweep, no shells, and a
// sweep under way is broken off. A blast beside him (a barrel, a grenade, a kicked LPG cylinder that
// runs into him) takes a segment and staggers him; a kick, a pan smash or a thug bowled into him only
// staggers him, plate down. No crew.
//
// marksman, Senado's marksman (議事亭長槍手, 議事亭：頭目 ①): a long gun from one of the map's posts (`boss.posts`), the
// first his first, in on foot from a street's mouth (`boss.from`). At a post his red line comes up after MARKSMAN.line.first s
// and swings onto the player at line.track rad/s; on him with nothing between, it stops there for line.warn s, then one round
// comes down it for line.dmg (a step out of the line meanwhile and it misses). A solid between (a lamp post, a stall, the
// kiosk) breaks his line, and so does a flock of the square's pigeons bursting into the air across it (level.js flockBlocks);
// broken move.lost s, after move.shots rounds, or with the player within move.near m, he moves on to another post, one
// move.band m from the player, and on the move nothing covers him. Shots on him count, perSegment to a segment, anywhere but
// on his way in; a kick, a pan smash or a thug bowled into him staggers him and sends him on. The camera leans towards him
// (`pull`), so he is in the picture whenever he shoots. No crew.
//
// buckshot, the marksman's partner (議事亭散彈手, 議事亭：頭目 ②): a shotgunner in from a street's mouth (`boss.from` to
// `boss.at`), after the player at BUCKSHOT.speed m/s (slower than him). Within gun.reach m and in sight he braces gun.tell s,
// his fan of three red lines on the floor, then the blast (gun.pellets across ± gun.spread); then gun.pump s working the
// slide. Shots count, perSegment to a segment; his partner's round takes one outright (CROSSFIRE). His part of a combo: a
// rush onto the spot the player stood on, timed to be there as the marksman's round comes (rush).
//
// bulwark, 大三巴's shield man (大三巴鐵盾, 大三巴：頭目 ①): out through the façade's middle doorway (`boss.from` behind it, to
// `boss.at` on the terrace) and after the player at BULWARK.speed m/s, turning at BULWARK.turn rad/s behind a big shield: a
// shot from within BULWARK.shield degrees of his facing glances off, one on his back counts, perSegment to a segment. Out of
// his sight (behind the façade) he goes to where he saw the player last, heeding nothing else, and looks round there
// (lost), so out of another doorway the player is at his side or his back. Within bash.reach m, facing the player, he braces bash.tell s, his shield lit, and charges bash.dist
// m; after it bash.spent s with his shield down (a shot from the front counts then). Further off, a revolver round the
// shield's edge onto a red line (gun). A barrel rolling down the steps into him bowls him over (ROLLING): a segment and
// his shield down; a blast beside him takes a segment; a kick, a pan smash or a thug bowled into him only staggers him.
//
// duo, two at once (雙頭目, DECISIONS 2026-10-22): on a large map the stage's boss can be two people fighting the
// player together (maps.js `boss: { kind: 'duo', pair: [def, def] }`, each def a kind of its own with its own data).
// The duo is the boss the rest of the game talks to: it hands each shot, blast, kick, smash and ram to whichever of
// the two it meets, the HUD shows a bar for each (`members`), the two never start a warning within DUO.gap s of each
// other (`mayTell`), and only when both are down is the BOSS bonus paid and the clip kept. Vehicles (heli, truck,
// convoy) and the DJ behind his glass (`waits`) no longer stand on any map: every boss is a person (同上).
//
// Logic: a boss runs in the fixed steps on game.rng and the world, and resets with the run.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { animateRig, BODY, buildCharacter, disposeRig, finishRig, setFlash } from './characters.js';
import { ENV, GUN_Y } from './config.js';
import { addCutaway } from './cutaway.js';
import { Laser } from './fx.js';
import { angleTo, clamp, damp, lerp, segAABB, segCircle, smoothstep, turnTowards, wrapAngle } from './utils.js';

export const HELI = {
  label: 'HELICOPTER', // the HUD bar's English name; names its bullets in the notes, as an enemy's label does
  name: '天台直升機',
  short: '直升機', // in the banners and the notes
  downed: '擊落', // what bringing it down is called
  pull: true, // the camera pulls back and leans towards it (main.js, CAMERA.bossPull)
  altitude: 8, // m over the roof: no bullet reaches it
  enter: 3.5, // s to fly in from off the map
  orbit: { radius: 2.5, speed: 0.35 }, // m and rad/s, circling the pad
  // the searchlight: `radius` m across, sweeping at `sweep` m/s and following a player within
  // `notice` m at `chase` m/s; `lockAfter` s in it and the gun takes that spot, `warn` s later it
  // fires; then `cool` s before it looks again
  light: { radius: 2.2, sweep: 3.4, chase: 2.6, notice: 7, lockAfter: 1, warn: 0.5, cool: 1.8 },
  // the burst: `shots` rounds `interval` s apart at `speed` m/s for `dmg`, scattered `spread` m
  // around the spot, each coming in from `from` m short of it (fired from above: over all cover)
  gun: { shots: 12, interval: 0.06, speed: 34, dmg: 8, spread: 1.2, from: 3 },
  // `count` thugs rope down onto the pad `first` s in and every `every` s after, `drop` s on the rope, while fewer than `maxAlive` are about
  rappel: { first: 5, every: 20, count: 2, drop: 1.4, maxAlive: 6 },
  segments: 5, // its health bar
  // what hurts it: a blast of one of `kinds` within `radius` m of where it is over the roof; it then reels `reel` s without firing
  hit: { radius: 3, kinds: ['barrel', 'grenade'], reel: 3 },
  crash: { fall: 2.4, radius: 5.5 }, // brought down: s falling onto the pad, and the blast there
  bonus: 2000, // BOSS: score for bringing it down
};

export const DJ = {
  label: 'CLUB DJ',
  name: '夜店 DJ',
  short: 'DJ',
  downed: '擊倒',
  pull: false, // in the picture already: the camera stays on the player
  segments: 5,
  bonus: 2000,
  beat: 0.5, // world s per beat (120 BPM)
  // the dance floor: from beat `first`, every `every` beats a pattern of tiles lights up for `warn` beats, then zaps
  // for `zap` s: `dmg` to a player on a lit tile
  floor: { first: 6, every: 6, warn: 2, zap: 0.3, dmg: 18 },
  radius: 0.45, // the DJ, for shots
  shield: { radius: 2.2, height: 2.6, drop: 0.35 }, // the glass round the booth: m, and s to slide down or back up
  speaker: { hp: 10, back: 14, blast: 2.6, blastHits: 5 }, // hits to blow one, s until it is back; a blast within `blast` m counts as `blastHits`
  open: 4, // s the glass stays down after a speaker blows
  perSegment: 3, // hits on the DJ while the glass is down that take a segment (and bring the glass back up)
  crew: { first: 6, every: 16, count: 2, maxAlive: 6 }, // thugs through the doors: s in, then every s, while fewer than maxAlive are about
};

export const BLADE = {
  label: 'BLADE QUEEN',
  name: '夜店刀后',
  short: '刀后',
  downed: '擊倒',
  pull: false, // on the floor with the player: the camera stays put
  segments: 5,
  bonus: 2000,
  radius: 0.4, // her body, for shots and the player's reach
  // crouched at a perch (maps.js `boss.perches`) before each attack: s on the first, then within `wait`, `faster` less a segment lost
  perch: { first: 1.6, wait: [1.1, 1.9], faster: 0.1 },
  // the dash: m/s (+ `perSegment` a segment lost); she stops `stop` m short of the player; from `ram` s into a dash, running
  // through a player who neither slides nor spins costs him `hit` HP; an afterimage every `ghostEvery` world s; a chase longer
  // than `giveUp` s is broken off
  dash: { speed: 14, perSegment: 2.5, stop: 1.7, ram: 0.1, hit: 20, ghostEvery: 0.04, giveUp: 5 },
  tell: { time: 0.5, turn: 2.5 }, // the blades up before the cut: the window to hurt her; she tracks the player at `turn` rad/s meanwhile
  feint: { chance: 0.6, max: 3 }, // from the first segment lost: a hop to the player's other side before the real tell, up to one a segment lost
  cut: { time: 0.22, arc: 1.1, reach: 1.9, dmg: 28, lunge: 6 }, // the cut: s, ± rad in front, m, HP, and the m/s she lunges with it
  reel: 0.45, // s she staggers after a hit in the window, then dashes off
  smash: 2, // segments a pan smash (or a batted-back bullet: HOME RUN) in the window takes
  kick: { back: 7, extend: 0.5 }, // a kick in the window: shoved back at this m/s and the window stays open `extend` s longer
  blast: 2.6, // m: a blast this close takes a segment (not while she dashes)
  // her bullet-hell moves (彈幕 ② D①), on where the map's def says `danmaku` (rooms.js ARENA): from her perch, before a
  // dash, a red line on the player for `tell` s and then `volleys` fans of `count` knives ± `spread` rad, fast, the
  // arcade's look, `between` s apart (the second fan between the first's knives); and as she lands on a perch, a ring
  // of `count` slow blades (the pattern men's look) with `gap` of them missing: the way through
  knives: { tell: 0.4, volleys: 2, between: 0.25, count: 3, spread: 0.45, speed: 24, dmg: 12, range: 30 },
  wall: { count: 16, gap: 3, speed: 6.5, dmg: 10, range: 24 },
};

export const TRUCK = {
  label: 'ARMORED TRUCK',
  name: '裝甲貨車',
  short: '貨車',
  downed: '擊毀',
  pull: false,
  segments: 5,
  bonus: 2000,
  size: { w: 2.2, l: 5, h: 2.6 }, // m: wide, long, high
  speed: 5, // m/s round its loop
  enter: 2.4, // s driving in from off the map
  shove: 5, // m/s it gives a barrel, a pan or a thug in its way
  // the roof gun: every `every` s (first after `first`) a red line onto the player for `warn` s, then `shots` rounds
  // `interval` s apart at `speed` m/s for `dmg`, swept across `sweep` rad round that spot; it needs a clear line
  gun: { first: 4, every: 5, warn: 0.7, shots: 9, interval: 0.07, speed: 30, dmg: 7, sweep: 0.35, range: 26 },
  // the charge: every `every` s (first after `first`) it stops and turns on the player (at `turn` rad/s, `aim` s at
  // most), paints its path red for `warn` s, then drives it at `speed` m/s, `length` m at most; `dmg` to a player
  // it hits (not one sliding or spinning); a path shorter than `min` m is not worth it
  charge: { first: 9, every: 14, turn: 3, aim: 1, warn: 1.2, speed: 16, length: 24, min: 5, dmg: 35, back: 6 },
  // the back door: every `every` s (first after `first`) it stops for `open` s and lets `count` thugs out; `hits`
  // shots into the open door take a segment (and it shuts)
  unload: { first: 15, every: 22, open: 4.5, count: 2, hits: 4, maxAlive: 7 },
  // a blast of one of `kinds` within `radius` m of its side takes a segment; then `cool` s before the next can
  blast: { radius: 2.5, kinds: ['barrel', 'grenade'], cool: 1.5 },
  wreck: { burn: 1.6, radius: 4.5 }, // brought down: s burning, then the blast
};

export const GUNNER = {
  label: 'HEAVY GUNNER',
  name: '碼頭重炮',
  short: '重炮',
  downed: '擊倒',
  pull: false,
  segments: 5,
  bonus: 2000,
  radius: 0.55, // his body, for shots and the player's reach
  speed: 1.5, // m/s after the player; `enter` m/s in through the gate
  enter: 2.5,
  turn: 1.4, // rad/s: he turns slowly, so a run round him gets behind the plate
  plate: 70, // degrees either side of his facing the steel plate covers: a shot from there glances off
  perSegment: 4, // hits on his back (or on him while he staggers) that take a segment
  // the sweep: every `every` s (first after `first`) he plants his feet, a red line onto the player for `warn` s, then `shots`
  // rounds `interval` s apart at `speed` m/s for `dmg`, swept across ± `sweep` rad round that spot; he needs a clear line
  gun: { first: 3, every: 4, warn: 0.8, shots: 24, interval: 0.045, speed: 30, dmg: 10, sweep: 0.7, range: 24 },
  // the mortar: every `every` s (first after `first`) `rounds` shells onto the player's spot, the others within `scatter` m of it;
  // each is marked by a red ring on the ground for lob.flight s and bursts on landing (lob: weapons.js Grenades.lob)
  mortar: { first: 7, every: 12, rounds: 3, scatter: 2.4, lob: { flight: 1.5, apex: 7, fuse: 0.05, radius: 2.4, kickDistance: 10, kickFlight: 0.55, hitRadius: 0.6, airburst: 150 } },
  near: 2.2, // m: this close he stops walking and turns on the player
  stagger: { kick: 0.7, smash: 1.3, bowl: 1.2, blast: 1.2 }, // s he reels (plate down, aim dropped) after a kick, a pan smash, a thug bowled into him, a blast
  bowl: 5, // m/s a kicked thug needs to stagger him
  blast: 2.8, // m: a blast this close takes a segment
  // his slow wall (彈幕 ② D②), on where the map's def says `danmaku` (rooms.js BACKHALL): every `every` s (first after
  // `first`) he plants his feet and his plate lights for `warn` s, then a fan of `count` slow rounds (the pattern men's
  // look) across ± `spread` rad in front of him with `gap` of them missing somewhere inside: the way through, or round
  // him to his open back
  wall: { first: 5, every: 9, warn: 0.6, count: 13, spread: 1.1, gap: 2, speed: 6, dmg: 10, range: 20 },
};

export const CONVOY = {
  label: 'TAXI CONVOY',
  name: '的士車隊',
  short: '頭車',
  route: '車隊', // in the route (main.js routeText); the others use `short`
  downed: '擊毀',
  pull: false,
  segments: 5,
  bonus: 2000,
  size: { w: 1.8, l: 4.2, h: 1.5 },
  cars: 3, // the lead and two escorts behind it
  gap: 7.5, // m between cars along the road
  speed: 6, // m/s; the lead alone, once both escorts are out: `slow`
  slow: 3.2,
  turn: 5, // rad/s a car's nose follows the road (looks, and the box it pushes with)
  tyres: 6, // hits (a blast: all of them) that flatten an escort's tyres: it pulls `aside` m off the road and stops
  aside: 2.4,
  perSegment: 5, // hits on the lead, once alone, that take a segment
  blast: { radius: 2.2, kinds: ['barrel', 'grenade'], cool: 1.5 }, // a blast this close to a car's side
  ram: { dmg: 12, cool: 1 }, // a moving car into the player (not one sliding or spinning): HP, then s before the next
  stop: { first: 10, every: 18, wait: 3.5, thugs: 1 }, // on the loop the convoy stops, and each moving car lets thugs out
  // the gunman in the lead's window: every `every` s a red line onto the player for `warn` s, then `shots` rounds
  gun: { first: 5, every: 4.5, warn: 0.6, shots: 3, interval: 0.12, speed: 30, dmg: 8, range: 24 },
  wreck: { burn: 1.6, radius: 4 }, // the lead brought down: s burning, then the blast
};

export const MARKSMAN = {
  label: 'MARKSMAN',
  name: '議事亭長槍手',
  short: '長槍手',
  downed: '擊倒',
  pull: { lean: 0.5, zoom: 1.35 }, // the camera leans this far towards him and pulls back this much (main.js): him and the player in the picture
  segments: 5,
  bonus: 2000,
  radius: 0.4, // his body, for shots and the player's reach
  enter: 3.5, // m/s in from the street's mouth (`boss.from`) to his first post (`boss.posts[0]`)
  speed: 3.2, // m/s from one post to the next
  perSegment: 4, // hits that take a segment
  // his line: up `first` s after he reaches a post, it swings onto the player at `track` rad/s; on him (within `on` rad) with
  // nothing between, it stops there for `warn` s, then one round down it at `speed` m/s for `dmg`, out to `range` m; `cycle`
  // s to work the bolt
  line: { first: 1.2, track: 1.2, on: 0.02, warn: 1, speed: 72, dmg: 40, range: 40, cycle: 1.2 },
  // on to another post after `shots` rounds from one, once his line has been broken `lost` s, with the player within `near` m or
  // farther than `far`; the next is one `band` m from the player (seeing him if one can), `giveUp` s at most on the way
  move: { shots: 2, lost: 1.5, near: 10, far: 30, band: [12, 26], giveUp: 12 },
  stagger: 0.8, // s he reels after a kick, a pan smash or a thug bowled into him; then he moves on
  bowl: 5, // m/s a kicked thug needs to knock him off balance
  blast: 2.4, // m: a blast this close takes a segment
};

export const BUCKSHOT = {
  label: 'BUCKSHOT',
  name: '議事亭散彈手',
  short: '散彈手',
  downed: '擊倒',
  pull: false,
  segments: 5,
  bonus: 2000,
  radius: 0.45, // his body, for shots and the player's reach
  enter: 4, // m/s in from his street's mouth (`boss.from`) to `boss.at`
  speed: 4.2, // m/s after the player (who runs 7.4): he can be outrun, not left behind
  perSegment: 4, // hits that take a segment
  // the blast: within `reach` m and in sight, every `every` s at most (first after `first`), he braces `tell` s with his fan
  // on the floor, then `pellets` pellets across ±`spread` rad at `speed` m/s for `dmg` each, out to `range` m; `pump` s after
  gun: { first: 2, every: 2.4, reach: 7, tell: 0.6, pellets: 7, spread: 0.28, speed: 20, dmg: 11, range: 11, pump: 1.1 }, // an odd count: one down the middle
  // the rush (his part of a combo): `windup` s crouched, then straight at the spot the player stood on, there in `time` s (at
  // `max` m/s at most), stopping `short` m from a player still on it; braced there till `brace` s after the rush was due, then the blast
  rush: { windup: 0.3, time: 0.7, max: 14, short: 1.6, brace: 0.35 },
  stagger: 0.8, // s he reels after a kick, a pan smash or a thug bowled into him
  bowl: 5, // m/s a kicked thug needs to knock him off balance
  blast: 2.6, // m: a blast this close takes a segment
};

export const BULWARK = {
  label: 'BULWARK',
  name: '大三巴鐵盾',
  short: '鐵盾',
  downed: '擊倒',
  pull: false,
  segments: 5,
  bonus: 2000,
  radius: 0.55, // his body, for shots and the player's reach
  enter: 3, // m/s out through the doorway (`boss.from` to `boss.at`)
  speed: 2.6, // m/s after the player
  turn: 1.5, // rad/s: he turns slowly, so a way round gets behind the shield
  shield: 70, // degrees either side of his facing the shield covers
  perSegment: 4, // hits on him (his back, or him with the shield down) that take a segment
  // the bash: within `reach` m, the player in sight within `aim` degrees of his facing, every `every` s at most (first after
  // `first`): `tell` s braced, then `dist` m in `time` s; a player in its way takes `dmg` and is thrown back at `knock` m/s;
  // after it `spent` s with the shield down
  bash: { first: 2.5, every: 3.5, reach: 7, aim: 25, tell: 0.7, dist: 7, time: 0.45, dmg: 25, knock: 9, spent: 1.4 },
  // the revolver round the shield's edge, the player in sight beyond the bash's reach: a red line `warn` s, then `shots`
  gun: { first: 4, every: 4.5, warn: 0.7, shots: 3, interval: 0.15, speed: 26, dmg: 9, range: 22 },
  roll: 2, // m/s a rolling barrel needs to bowl him over (ROLLING)
  stagger: { kick: 0.8, smash: 1.2, roll: 1.6, blast: 1.2, bowl: 1 }, // s he reels, his shield down
  near: 2.2, // m: this close he stands and turns
  blast: 2.8, // m: a blast this close takes a segment
  // out of his sight more than `after` s (behind the façade) he goes to where he saw the player last, at most `search` s,
  // paying the player no heed unless right before his shield or shooting him; there he looks round `look` s: the way
  // round through the doorways
  lost: { after: 0.5, search: 4, look: 0.8 },
};

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** What every boss shares: its health in segments, the HIT banner, and the end (bonus, clip, the wave's end). No boss at all is a plain Boss. */
export class Boss {
  constructor(game, cfg = { label: '', name: '', short: '', downed: '', pull: false, segments: 0, bonus: 0 }) {
    this.game = game;
    this.cfg = cfg; // its numbers; cfg.label names the bullets that hit the player, as an enemy's does
    this.active = false;
    this.downed = false;
    this.hp = 0;
    this.segments = 0; // this fight's (start)
    this.bonus = 0;
    this.x = this.z = 0;
    this.pass = null; // a solid player shots fly over while this boss is on (bullets.js)
    this.team = null; // the duo this boss is one of (Duo), or null alone
  }

  /** One of a duo whose partner is down: a kind fights harder its own way (more feints, more shells); the duo speeds it up. */
  enrage() {}

  /**
   * Whether something the player can do would take a segment off it right now (a shot, a blast, a kick, a smash):
   * the no-waiting rule (DECISIONS 2026-10-22) is that this is never false for long. A kind says when it is.
   */
  vulnerable() {
    return this.active;
  }

  /** One of a duo, for the combo (Duo): is it free to start its part right now (not mid-attack, the player in sight)? */
  comboReady() {
    return false;
  }

  /** One of a duo: start its part of the combo now (its usual attack, at the player), whatever the gap. */
  combo() {}

  /** May it start a warning now (a red line, a ring, the blades raised)? Alone always; one of a duo, not on top of the other's. */
  mayTell() {
    return this.team ? this.team.mayTell(this) : true;
  }

  /**
   * Its wave: `def` is the map's (maps.js `boss`); `size` ({ segments, bonus }) a stage's shorter
   * fight (waves.js MODES `midBoss`), else the run's last in full (cfg.segments, cfg.bonus).
   */
  start(def, size = null) {
    this.def = def;
    this.active = true;
    this.downed = false;
    this.segments = size ? size.segments : this.cfg.segments;
    this.bonus = size ? size.bonus : this.cfg.bonus;
    this.hp = this.segments;
    this.t = 0;
    this.game.notes.log(`頭目：${this.cfg.name}`);
  }

  reset() {
    this.active = false;
    this.downed = false;
    this.hp = 0;
  }

  update() {}

  /** A blast at (x, z) (main.js explode): whether it hurts depends on the kind. */
  blast() {}

  /** Whether (x, z) is where a blast would hurt it (a thrown barrel goes off there: thrown.js). */
  under() {
    return false;
  }

  /** Where a player shot from (x0, z0) to (x1, z1) first meets a part of it: { t, part }, or null. */
  shotAt() {
    return null;
  }

  /** A player shot met `part`; true if that stops it. */
  shot() {
    return true;
  }

  /** A player shot hit a level solid (bullets.js), in case it is one of the boss's. */
  shotSolid() {}

  /** A kicked LPG cylinder in flight (level.js Barrel.rocket) is at (x, z), radius r: true if it has run into the boss (it bursts there). */
  rammed() {
    return false;
  }

  /** The player's kick or pan smash (player.js): `inCone(x, z, reach)` says whether it reaches; true if it struck the boss. */
  melee() {
    return false;
  }

  /** One segment off (`how` says what did it); the last brings it down (goDown). */
  hurt(how = '中彈') {
    const g = this.game;
    const c = this.cfg;
    this.hp--;
    g.notes.log(`${c.short}${how}（剩 ${this.hp} 段）`);
    if (this.hp <= 0) this.goDown();
    else g.hud.banner('HIT', `${c.short} · 剩 ${this.hp} 段`, 'clear');
  }

  goDown() {
    this.finish();
  }

  /** Down for good: the BOSS bonus, the run's clip, and the wave can end; one of a duo tells the duo instead. */
  finish() {
    const g = this.game;
    const c = this.cfg;
    this.active = false;
    this.downed = true;
    if (this.team) {
      g.notes.log(`${c.downed}${c.short}`);
      this.team.memberDown(this);
      return;
    }
    g.score.bonus('BOSS', this.bonus);
    g.clip.kill(Number.MAX_SAFE_INTEGER); // the boss going down is the run's clip, whatever else it had
    g.notes.log(`${c.downed}${c.short}：BOSS +${this.bonus}`);
  }
}

/** The rooftop helicopter. */
class Heli extends Boss {
  constructor(game) {
    super(game, HELI);
    this.root = null;
    this.laser = new Laser(game.scene, new THREE.Color(1, 0.05, 0.05));
    this.reset();
  }

  /** Back to nothing: no boss on the roof (a new run, a restart, the title). */
  reset() {
    if (this.root) {
      this.game.scene.remove(this.root, this.cone, this.spotMesh, this.ropes, this.crashRing);
      for (const o of [this.root, this.cone, this.spotMesh, this.ropes, this.crashRing]) {
        o.traverse((m) => {
          if (m.geometry) m.geometry.dispose();
        });
      }
    }
    this.root = null;
    super.reset();
    this.laser.hide();
    this.climbers = [];
  }

  /** Its wave on the rooftop: `def` is the map's (maps.js `boss`: its pad and where it flies in from). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    this.theta = 0;
    const [px, pz] = def.pad;
    this.pad = { x: px, z: pz };
    this.from = { x: def.from[0], z: def.from[1] };
    this.x = this.from.x;
    this.z = this.from.z;
    this.facing = 0;
    this.spot = { x: px, z: pz };
    this.state = 'search'; // search, warn, fire, cool
    this.litT = 0;
    this.timer = 0;
    this.lock = null;
    this.shots = 0;
    this.rappelT = HELI.rappel.first;
    this.reelT = 0;
    this.fallT = -1;
    this.build();
  }

  /** The look: a block helicopter, its rotor, the searchlight's cone and spot, the ropes. */
  build() {
    const g = this.game;
    const L = g.level;
    const std = (color, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35, ...extra });
      addCutaway(m, L.cut); // it can be between the camera and the player
      return m;
    };
    const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const root = new THREE.Group();
    const hull = new THREE.Mesh(
      mergeGeometries([
        box(1.9, 1.5, 3.6), // cabin
        box(0.45, 0.45, 3.6, 0, 0.35, -3.4), // tail boom
        box(0.12, 1.1, 0.8, 0, 0.8, -5), // fin
        box(0.12, 0.12, 3.2, 0.85, -1.05, 0.1), // skids
        box(0.12, 0.12, 3.2, -0.85, -1.05, 0.1),
        box(0.5, 0.5, 0.6, 0, -0.55, 1.75), // the searchlight's housing
      ]),
      std(0x2a2d36),
    );
    const glass = new THREE.Mesh(box(1.7, 0.8, 1.2, 0, 0.2, 1.45), std(0x5fd0ff, { emissive: 0x2a8fff, emissiveIntensity: 0.6, roughness: 0.15 }));
    const rotor = new THREE.Mesh(mergeGeometries([box(9, 0.05, 0.3), box(0.3, 0.05, 9)]).translate(0, 0.95, 0), std(0x15161a));
    const tail = new THREE.Mesh(box(0.06, 1.3, 0.2).translate(0.12, 0.8, -5), std(0x15161a));
    root.add(hull, glass, rotor, tail);
    root.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    g.style.retone(root, 'char', L.cut);
    g.style.outline(root, 'char');
    this.rotor = rotor;
    // the light: a pale cone down to a bright disc on the roof
    this.cone = new THREE.Mesh(
      new THREE.ConeGeometry(HELI.light.radius, 1, 24, 1, true).translate(0, -0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.spotMesh = new THREE.Mesh(
      new THREE.CircleGeometry(HELI.light.radius, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.45, 1.1), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.ropes = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6 * 4), 3)), new THREE.LineBasicMaterial({ color: 0xc8c8c8 }));
    this.ropes.frustumCulled = false;
    // where it will come down, once it is falling: a red ring of the crash's blast on the pad
    this.crashRing = new THREE.Mesh(
      new THREE.RingGeometry(HELI.crash.radius - 0.15, HELI.crash.radius, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.2, 0.2), transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.crashRing.visible = false;
    this.root = root;
    g.scene.add(root, this.cone, this.spotMesh, this.ropes, this.crashRing);
    this.sync();
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const p = g.player;
    this.t += dt;
    if (this.fallT >= 0) {
      this.updateFall(dt);
      return;
    }
    if (this.reelT > 0) this.reelT -= dt;
    // flying in, then circling the pad
    if (this.t < HELI.enter) {
      const k = smoothstep(0, 1, this.t / HELI.enter);
      this.x = lerp(this.from.x, this.pad.x, k);
      this.z = lerp(this.from.z, this.pad.z + HELI.orbit.radius, k);
    } else {
      this.theta += HELI.orbit.speed * dt;
      this.x = this.pad.x + Math.sin(this.theta) * HELI.orbit.radius;
      this.z = this.pad.z + Math.cos(this.theta) * HELI.orbit.radius;
    }
    this.facing = Math.atan2(p.x - this.x, p.z - this.z);
    this.updateLight(dt);
    this.updateRappel(dt);
    this.sync();
  }

  updateLight(dt) {
    const g = this.game;
    const p = g.player;
    const L = HELI.light;
    const s = this.spot;
    if (this.t < HELI.enter) {
      // the light comes in with it
      s.x = this.x;
      s.z = this.z + 2;
      return;
    }
    if (this.state === 'search' || this.state === 'cool') {
      // follow a player it comes near, else sweep the roof
      const near = p.alive && Math.hypot(p.x - s.x, p.z - s.z) < L.notice;
      const B = g.level.bounds;
      const tx = near ? p.x : Math.sin(this.t * 0.23) * B.halfW * 0.7;
      const tz = near ? p.z : Math.sin(this.t * 0.31 + 1) * B.halfD * 0.7;
      const d = Math.hypot(tx - s.x, tz - s.z);
      const step = Math.min(d, (near ? L.chase : L.sweep) * dt);
      if (d > 1e-6) {
        s.x += ((tx - s.x) / d) * step;
        s.z += ((tz - s.z) / d) * step;
      }
    }
    // reeling from a hit: no locking on, no firing
    const lit = p.alive && Math.hypot(p.x - s.x, p.z - s.z) < L.radius && this.reelT <= 0;
    switch (this.state) {
      case 'search':
        this.litT = lit ? this.litT + dt : 0;
        if (this.litT >= L.lockAfter) {
          // caught: the gun takes the spot where the player stands, with a red line
          this.state = 'warn';
          this.timer = L.warn;
          this.lock = { x: p.x, z: p.z };
          s.x = p.x;
          s.z = p.z;
          g.audio.aimWarn(g.panFor(p.x));
          g.notes.log('直升機的探照燈鎖定你');
        }
        break;
      case 'warn':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'fire';
          this.shots = HELI.gun.shots;
          this.timer = 0;
        }
        break;
      case 'fire':
        this.timer -= dt;
        while (this.timer <= 0 && this.shots > 0) {
          this.fire();
          this.shots--;
          this.timer += HELI.gun.interval;
        }
        if (this.shots <= 0) {
          this.state = 'cool';
          this.timer = L.cool;
          this.litT = 0;
        }
        break;
      case 'cool':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'search';
        break;
    }
  }

  /** One round of the burst: onto the locked spot, scattered, coming in from the helicopter's side over all cover. */
  fire() {
    const g = this.game;
    const G = HELI.gun;
    const rng = g.rng;
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * G.spread;
    const tx = this.lock.x + Math.sin(a) * r;
    const tz = this.lock.z + Math.cos(a) * r;
    let dx = tx - this.x;
    let dz = tz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    // the source is the boss as the game sees it (game.boss): its label names the bullets that hit
    g.bullets.spawn({ x: tx - dx * G.from, z: tz - dz * G.from, dx, dz, speed: G.speed, owner: 'enemy', damage: G.dmg, range: G.from + 1.5, source: g.boss, over: HELI.altitude });
    g.audio.shot('minigun', g.panFor(this.x));
  }

  /** Whether (x, z) is right under it, where a blast hurts it. */
  under(x, z) {
    return this.active && this.fallT < 0 && this.t >= HELI.enter && Math.hypot(x - this.x, z - this.z) <= HELI.hit.radius;
  }

  /** A blast at (x, z) (main.js explode, `opts.kind` what went off): right under it, a barrel or a grenade takes a segment. */
  blast(x, z, opts = {}) {
    if (!this.under(x, z) || !HELI.hit.kinds.includes(opts.kind) || this.reelT > 0) return;
    const g = this.game;
    this.reelT = HELI.hit.reel;
    this.state = 'search';
    this.litT = 0;
    this.lock = null;
    g.shake(0.5);
    g.hitstop(0.08);
    g.audio.explosion(g.panFor(this.x));
    this.hurt();
  }

  /** The last segment: it falls onto the pad, the ring shows where. */
  goDown() {
    const g = this.game;
    this.fallT = 0;
    this.fallFrom = { x: this.x, z: this.z };
    this.state = 'down';
    this.crashRing.position.set(this.pad.x, 0.05, this.pad.z);
    this.crashRing.visible = true;
    g.notes.log('直升機被擊落');
    g.hud.banner('BOSS DOWN', '快離開停機坪！', 'clear');
  }

  updateFall(dt) {
    const g = this.game;
    const C = HELI.crash;
    this.fallT += dt;
    const k = Math.min(1, this.fallT / C.fall);
    this.x = lerp(this.fallFrom.x, this.pad.x, k);
    this.z = lerp(this.fallFrom.z, this.pad.z, k);
    this.y = HELI.altitude * (1 - k * k);
    this.facing += dt * (2 + 6 * k); // spinning down
    this.climbers = [];
    if (k < 1) {
      this.sync();
      return;
    }
    // down: the blast, then the bonus, the clip, the end of the wave
    this.root.visible = this.cone.visible = this.spotMesh.visible = this.crashRing.visible = false;
    this.laser.hide();
    g.explode(this.pad.x, this.pad.z, C.radius, { source: '墜毀的直升機', kind: 'heli' });
    this.finish();
  }

  /** Every so often two thugs rope down onto the pad. */
  updateRappel(dt) {
    const g = this.game;
    const R = HELI.rappel;
    this.climbers = this.climbers.filter((e) => e.alive && e.rappelT > 0);
    if (this.t < HELI.enter) return;
    this.rappelT -= dt;
    if (this.rappelT > 0) return;
    this.rappelT = R.every;
    if (g.enemies.aliveCount + R.count > R.maxAlive) return;
    for (let i = 0; i < R.count; i++) {
      const x = this.x + (i - (R.count - 1) / 2) * 1.6;
      const z = this.z;
      this.climbers.push(g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, rappel: { height: HELI.altitude - 1, drop: R.drop } }));
    }
    g.notes.log(`直升機放下 ${R.count} 個打手`);
  }

  /** Where everything is drawn; the laser and ropes are only looks. */
  sync() {
    const y = this.fallT >= 0 ? this.y : HELI.altitude;
    this.root.position.set(this.x, y, this.z);
    this.root.rotation.y = this.facing;
    // a hit makes it reel (looks only)
    this.root.rotation.z = this.reelT > 0 ? Math.sin(this.t * 14) * 0.25 * (this.reelT / HELI.hit.reel) : 0;
    this.rotor.rotation.y = this.t * 28;
    // the light: from under the nose to the spot
    _a.set(this.x, y - 0.6, this.z);
    _b.set(this.spot.x, 0.05, this.spot.z);
    this.spotMesh.position.copy(_b);
    const red = this.state === 'warn' || this.state === 'fire';
    this.spotMesh.material.color.setRGB(red ? 2.4 : 1.6, red ? 0.25 : 1.45, red ? 0.2 : 1.1);
    this.cone.position.copy(_a);
    const dir = _b.sub(_a);
    const len = dir.length();
    this.cone.scale.set(1, len, 1);
    this.cone.quaternion.setFromUnitVectors(UP, dir.normalize().negate());
    if (red && this.lock) this.laser.set(this.x, this.z, this.lock.x, this.lock.z, 0.06, this.state === 'warn' ? 1.5 + 2 * clamp(1 - this.timer / HELI.light.warn, 0, 1) : 3, GUN_Y);
    else this.laser.hide();
    // the ropes of the thugs still coming down
    const pos = this.ropes.geometry.attributes.position;
    for (let i = 0; i < 4; i++) {
      const e = this.climbers[i];
      pos.setXYZ(i * 2, e ? e.x : 0, e ? y - 0.8 : -50, e ? e.z : 0);
      pos.setXYZ(i * 2 + 1, e ? e.x : 0, e ? e.y + 1.7 : -50, e ? e.z : 0);
    }
    pos.needsUpdate = true;
  }
}

/** The club's DJ. */
class Dj extends Boss {
  constructor(game) {
    super(game, DJ);
    this.rig = null;
    this.reset();
  }

  reset() {
    if (this.rig) {
      const g = this.game;
      g.scene.remove(this.rig.root, this.glass, this.tiles, ...this.leds);
      disposeRig(this.rig);
      for (const o of [this.glass, this.tiles, ...this.leds]) {
        o.geometry.dispose();
        o.material.dispose();
      }
      this.rig = null;
    }
    super.reset();
    this.game.level.floorTaken = false;
    this.pass = null;
    this.speakers = [];
    this.lit = null;
    this.state = 'idle';
  }

  /** Its wave in the club: `def` is the map's (maps.js `boss`: where the DJ stands, the booth, the speakers, the dance floor). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    const g = this.game;
    const L = g.level;
    [this.x, this.z] = def.at;
    const at = (x, z) => L.solids.find((s) => s.alive && Math.abs((s.minX + s.maxX) / 2 - x) < 0.05 && Math.abs((s.minZ + s.maxZ) / 2 - z) < 0.05);
    this.pass = at(...def.booth) || null;
    this.speakers = def.speakers.map(([x, z]) => ({ x, z, solid: at(x, z), hp: DJ.speaker.hp, backT: 0, flash: 0 }));
    // nobody squeezes past the speakers to the DJ's side of the glass
    for (const [x, z, w, d] of def.gaps) L.addBox(x, z, w, d, DJ.shield.height, null, 'wall', { visible: false });
    L.rebuildNav();
    const [x0, z0, cols, rows] = def.floor;
    this.floor = { x0, z0, cols, rows };
    this.lit = new Uint8Array(cols * rows);
    L.floorTaken = true; // the club's own light show dims, so the warnings read (maps.js)
    this.state = 'idle'; // the floor: idle, warn, zap
    this.nextBeat = DJ.floor.first; // the beat the next pattern lights up on
    this.zapBeat = 0;
    this.zapT = 0;
    this.openT = 0; // s the glass stays down
    this.down = 0; // 0 the glass up, 1 down (slides between)
    this.taken = 0; // hits on the DJ in this opening
    this.crewT = DJ.crew.first;
    this.flash = 0;
    this.build();
  }

  /** The look: a block DJ at the decks, the glass, a light on each speaker, the floor's warning tiles. */
  build() {
    const g = this.game;
    const L = g.level;
    this.rig = buildCharacter({ body: 0x5b25d9, pants: 0x1a1030, hair: 0xff3fa4, accent: 0x2ee8ff, ring: 0.35 });
    for (const m of this.rig.weaponParts) m.visible = false;
    this.rig.root.traverse((o) => {
      o.castShadow = false; // behind the booth, against the wall: a shadow would cost draw calls and show nothing
    });
    this.rig.root.position.set(this.x, 0, this.z);
    // the glass: half a cylinder round the front of the booth, open at the back (the wall)
    const S = DJ.shield;
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a8fff, emissiveIntensity: 0.5, roughness: 0.1, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    addCutaway(glassMat, L.cut);
    this.glass = new THREE.Mesh(new THREE.CylinderGeometry(S.radius, S.radius, S.height, 32, 1, true, -Math.PI / 2, Math.PI).translate(0, S.height / 2, 0), glassMat);
    this.glass.position.set(this.x, 0, this.z);
    // a light on top of each speaker: green while it stands, out once blown
    this.leds = this.speakers.map((sp) => {
      const top = sp.solid ? sp.solid.h : 2.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2, 0.6) }));
      m.position.set(sp.x, top + 0.04, sp.z);
      return m;
    });
    // the floor's warning and zap: one tile per floor tile, adding light on top of the club's own
    const { x0, z0, cols, rows } = this.floor;
    this.tiles = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      cols * rows,
    );
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols * rows * 3), 3);
    const m = new THREE.Matrix4();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        m.makeTranslation(x0 + 0.5 + c, 0.02, z0 + 0.5 + r);
        this.tiles.setMatrixAt(r * cols + c, m);
      }
    }
    g.style.retone(this.glass, 'char', L.cut);
    g.scene.add(this.rig.root, this.glass, this.tiles, ...this.leds);
    this.sync();
  }

  /** The floor tile under (x, z) as [column, row], or null off the floor. */
  tileAt(x, z) {
    const { x0, z0, cols, rows } = this.floor;
    const c = Math.floor(x - x0);
    const r = Math.floor(z - z0);
    return c >= 0 && c < cols && r >= 0 && r < rows ? [c, r] : null;
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    // the glass: down while a blown speaker's opening lasts
    if (this.openT > 0) {
      this.openT -= dt;
      if (this.openT <= 0) this.taken = 0;
    }
    this.down = clamp(this.down + ((this.openT > 0 ? 1 : -1) * dt) / DJ.shield.drop, 0, 1);
    for (const sp of this.speakers) {
      sp.flash = Math.max(0, sp.flash - dt * 4);
      if (sp.hp > 0) continue;
      sp.backT -= dt;
      if (sp.backT <= 0) {
        sp.hp = DJ.speaker.hp;
        g.notes.log('DJ 的喇叭箱又響起來');
      }
    }
    this.updateFloor(dt);
    this.updateCrew(dt);
    this.sync();
  }

  /** The beat: light a pattern, zap it two beats on, then rest until the next. */
  updateFloor(dt) {
    const g = this.game;
    const F = DJ.floor;
    const beat = this.t / DJ.beat;
    if (this.state === 'idle' && beat >= this.nextBeat) {
      this.light();
      this.state = 'warn';
      this.zapBeat = this.nextBeat + F.warn;
      this.nextBeat += F.every;
      g.audio.aimWarn(g.panFor(this.x));
    } else if (this.state === 'warn' && beat >= this.zapBeat) {
      this.state = 'zap';
      this.zapT = F.zap;
      this.zap();
    } else if (this.state === 'zap') {
      this.zapT -= dt;
      if (this.zapT <= 0) {
        this.state = 'idle';
        this.lit.fill(0);
      }
    }
  }

  /** A new pattern on the floor, drawn from the run's stream: a checkerboard, bands of rows or columns, or rings round the player. */
  light() {
    const g = this.game;
    const rng = g.rng;
    const { cols, rows } = this.floor;
    const kind = rng.int(0, 3);
    const k = rng.int(0, 3);
    const [pc, pr] = this.tileAt(g.player.x, g.player.z) || [-9, -9];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const ring = Math.max(Math.abs(c - pc), Math.abs(r - pr));
        const on = kind === 0 ? (r + c + k) % 2 === 0 : kind === 1 ? (r + k) % 4 < 2 : kind === 2 ? (c + k) % 4 < 2 : ring <= 1 || ring === 3;
        this.lit[r * cols + c] = on ? 1 : 0;
      }
    }
  }

  /** The lit tiles go off: the player on one is hurt (a spin rides it out). */
  zap() {
    const g = this.game;
    const p = g.player;
    const tile = p.alive ? this.tileAt(p.x, p.z) : null;
    g.audio.impact(g.panFor(this.x));
    g.shake(0.12);
    if (tile && this.lit[tile[1] * this.floor.cols + tile[0]]) {
      if (p.hurt(DJ.floor.dmg, 0, 0, false, 'DJ 的電擊地板')) g.fx.sparks(p.x, 0.3, p.z, 0, 0, 14, [3, 5, 9], 6, Math.PI);
    }
  }

  /** Every so often the DJ calls in two thugs through the doors. */
  updateCrew(dt) {
    const g = this.game;
    const C = DJ.crew;
    this.crewT -= dt;
    if (this.crewT > 0) return;
    this.crewT = C.every;
    if (g.enemies.aliveCount + g.waves.pending.length + C.count > C.maxAlive) return;
    for (let i = 0; i < C.count; i++) g.waves.pending.push({ type: 'grunt', sp: g.waves.pickSpawn('grunt'), t: 0.9 });
    g.notes.log(`DJ 叫來 ${C.count} 個打手`);
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active) return null;
    // the glass while it is up (more than half way), the DJ once it is down
    if (this.down < 0.5) {
      const t = segCircle(x0, z0, x1, z1, this.x, this.z, DJ.shield.radius);
      return t >= 0 ? { t, part: 'glass' } : null;
    }
    const t = segCircle(x0, z0, x1, z1, this.x, this.z, DJ.radius);
    return t >= 0 ? { t, part: 'dj' } : null;
  }

  shot(b, part) {
    const g = this.game;
    if (part === 'glass') {
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 6, [2, 5, 8], 7);
      g.audio.impact(g.panFor(b.x));
      return true;
    }
    this.flash = 1;
    g.fx.blood(b.x, GUN_Y, b.z, b.dx, b.dz, 8);
    g.audio.flesh(g.panFor(b.x));
    if (++this.taken >= DJ.perSegment) {
      // a segment: the DJ ducks and the glass comes back up
      this.taken = 0;
      this.openT = 0;
      this.hurt();
    }
    return true;
  }

  shotSolid(s) {
    const sp = this.speakers.find((x) => x.solid === s);
    if (sp) this.hitSpeaker(sp, 1);
  }

  /** A blast next to a speaker counts as a few hits. */
  blast(x, z) {
    if (!this.active) return;
    for (const sp of this.speakers) if (Math.hypot(sp.x - x, sp.z - z) <= DJ.speaker.blast) this.hitSpeaker(sp, DJ.speaker.blastHits);
  }

  hitSpeaker(sp, n) {
    if (!this.active || sp.hp <= 0) return;
    const g = this.game;
    sp.hp -= n;
    sp.flash = 1;
    if (sp.hp > 0) return;
    // blown: the glass slides down
    sp.backT = DJ.speaker.back;
    this.openT = DJ.open;
    this.taken = 0;
    const top = sp.solid ? sp.solid.h : 2.2;
    g.fx.flash(sp.x, top, sp.z, 0x88ddff, 30, 0.25, 8);
    g.fx.sparks(sp.x, top, sp.z, 0, 1, 24, [3, 6, 9], 8, Math.PI);
    g.audio.explosion(g.panFor(sp.x));
    g.shake(0.3);
    g.notes.log('射爆 DJ 的喇叭箱：玻璃降下');
    g.hud.banner('GLASS DOWN', `射 DJ！${DJ.open} 秒`, 'clear');
  }

  /** The last segment: the DJ goes down behind the decks, the floor goes dark. */
  goDown() {
    const g = this.game;
    this.lit.fill(0);
    g.level.floorTaken = false;
    this.state = 'idle';
    g.fx.flash(this.x, 1.5, this.z, 0xff3fa4, 40, 0.4, 10);
    g.notes.log('DJ 倒下');
    g.hud.banner('BOSS DOWN', 'DJ 倒下了', 'clear');
    this.finish();
    this.sync();
  }

  /** Where everything is drawn: the DJ bobbing to the beat, the glass, the speakers' lights, the floor. */
  sync() {
    const g = this.game;
    const r = this.rig;
    const beat = this.t / DJ.beat;
    const frac = beat - Math.floor(beat);
    r.root.rotation.y = 0;
    r.root.rotation.x = this.active ? 0 : -1.2; // down: over the decks
    r.root.position.y = this.active ? 0 : -0.6;
    if (g.style.poseDue(r, g.worldTime)) {
      const bob = Math.abs(Math.sin(frac * Math.PI));
      r.torso.position.y = BODY.torsoY + bob * 0.04;
      r.head.position.y = BODY.headY + bob * 0.06;
      r.armL.rotation.x = r.armR.rotation.x = -1.2 + bob * 0.25; // hands on the decks
    }
    setFlash(r, this.flash * 2);
    this.glass.position.y = -DJ.shield.height * this.down;
    this.glass.visible = this.active && this.down < 1;
    this.speakers.forEach((sp, i) => {
      const on = sp.hp > 0;
      const k = on ? 1 + sp.flash * 2 : 0.05;
      this.leds[i].material.color.setRGB(on ? 0.3 * k : 0.6 * k, on ? 2 * k : 0.1, on ? 0.6 * k : 0.1);
    });
    const warnK = 0.5 + 0.9 * (1 - frac) * (1 - frac);
    for (let i = 0; i < this.lit.length; i++) {
      const on = this.lit[i] && this.active;
      const c = !on ? [0, 0, 0] : this.state === 'zap' ? [1.6, 2.2, 3] : [1.4 * warnK, 0.08 * warnK, 0.12 * warnK];
      this.tiles.instanceColor.setXYZ(i, c[0], c[1], c[2]);
    }
    this.tiles.instanceColor.needsUpdate = true;
  }
}

const GHOST = [1.3, 0.2, 1.1]; // the blade queen's afterimages: magenta, under the bloom threshold on its own like the player's cyan

/** The club's blade queen. */
class Blade extends Boss {
  constructor(game) {
    super(game, BLADE);
    this.rig = null;
    this.laser = new Laser(game.scene, 0xff2bd0); // the knives' red line (danmaku)
    this.knife = { cfg: { label: '刀后的飛刀' } }; // what her knives and her rings say hit the player (bullets.js: `source.cfg.label`)
    this.wallSrc = { cfg: { label: '刀后的刀氣' } };
    this.reset();
  }

  reset() {
    if (this.rig) {
      this.game.scene.remove(this.rig.root);
      disposeRig(this.rig);
      this.bladeMat.dispose();
      this.rig = null;
    }
    super.reset();
    this.laser.hide();
    this.state = 'idle';
    this.perches = [];
  }

  /** Its wave in the club: `def` is the map's (maps.js `boss`: her perches, [x, z] or [x, z, height]). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    const g = this.game;
    this.perches = def.perches.map(([x, z, y = 0]) => ({ x, z, y }));
    this.perchI = g.rng.int(0, this.perches.length - 1);
    const at = this.perches[this.perchI];
    this.x = at.x;
    this.z = at.z;
    this.y = at.y;
    this.vx = this.vz = 0;
    this.facing = angleTo(this.x, this.z, g.player.x, g.player.z);
    // perch (crouched, turning shots aside), dash (at the player), feint (a hop to his other side), tell (the window),
    // cut, reel (hit in the window), retreat (to a perch), down
    this.state = 'perch';
    this.timer = BLADE.perch.first;
    this.goal = { x: this.x, z: this.z };
    this.dashT = 0;
    this.path = null;
    this.pathT = 0;
    this.feints = 0;
    this.taken = false; // a segment taken in this window
    this.kicked = false; // the window held open by a kick already
    this.struck = false;
    this.dodged = false;
    this.ramCd = 0;
    this.ghostT = 0;
    this.phase = 0;
    this.flash = 0;
    this.glow = 0; // the blades' light, up through the tell
    this.firstTell = true;
    this.deflectLogT = 0;
    this.rage = 0;
    this.comboLag = 0; // a duo's combo: s on her perch before she goes (Duo)
    this.danmaku = !!def.danmaku; // her knives and rings (BLADE.knives, BLADE.wall)
    this.volleys = 0; // fans thrown in this throw
    this.firstKnives = true;
    this.firstWall = true;
    this.build();
  }

  /** The look: the blade runner's rig a size up, a blade in each hand that lights up for the tell. */
  build() {
    const g = this.game;
    this.rig = buildCharacter({ body: 0x141418, pants: 0x101014, accent: 0xff2bd0, hair: 0x0a0a0a, weapon: 'blades', scale: 1.12, ring: 0.5, model: 'rusher' });
    this.bladeMat = new THREE.MeshBasicMaterial({ color: 0xff2bd0 });
    for (const part of this.rig.weaponParts) {
      part.traverse((o) => {
        if (o.isMesh && !o.userData.hull) o.material = this.bladeMat;
      });
    }
    g.scene.add(this.rig.root);
    this.sync();
  }

  /** Segments lost so far: she gets faster and trickier with each (and two more once her partner is down: enrage). */
  get lost() {
    return this.segments - this.hp + this.rage;
  }

  /** Her partner down (a duo): as if two more segments were gone, faster, shorter waits, more feints. */
  enrage() {
    this.rage = 2;
  }

  get dashing() {
    return this.state === 'dash' || this.state === 'feint' || this.state === 'retreat';
  }

  /**
   * Something the player can do takes a segment now: with the blades raised (until one has landed) a shot, a kick or a
   * smash; any time she is not mid-dash, a blast (a barrel, a grenade: at her perch too). Only a dash is out of reach.
   */
  vulnerable() {
    if (!this.active || this.dashing) return false;
    return this.state === 'tell' ? !this.taken : true;
  }

  comboReady() {
    return this.active && this.state === 'perch' && this.comboLag <= 0 && this.game.player.alive;
  }

  /** The combo: she crouches, blades lit, and goes at the player DUO.combo.lag s later, as the gunner's sweep comes across. */
  combo() {
    const g = this.game;
    this.comboLag = DUO.combo.lag;
    this.glow = 1;
    g.fx.ring(this.x, this.z, 1.2, DUO.combo.lag, 0xff2bd0, 3);
  }

  /** Her dash speed now (m/s). */
  speed() {
    return BLADE.dash.speed + BLADE.dash.perSegment * this.lost;
  }

  faceTo(x, z, maxStep) {
    this.facing = turnTowards(this.facing, angleTo(this.x, this.z, x, z), maxStep);
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const p = g.player;
    this.t += dt;
    this.timer -= dt;
    this.ramCd -= dt;
    this.deflectLogT -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.glow = clamp(this.glow + (this.state === 'tell' ? 6 : -6) * dt, 0, 1);
    switch (this.state) {
      case 'perch':
        this.faceTo(p.x, p.z, 4 * dt);
        if (this.comboLag > 0) {
          // a combo: she goes when her partner's part is under way (DUO.combo.lag)
          this.comboLag -= dt;
          if (this.comboLag <= 0) this.dashTo(p.x, p.z, 'dash');
        } else if (this.timer <= 0 && this.mayTell()) {
          if (this.danmaku && p.alive) this.throwTell();
          else this.dashTo(p.x, p.z, 'dash');
        }
        break;
      case 'throw':
        // the knives (danmaku): the line on the player through the tell, then the fans, then the dash
        this.faceTo(p.x, p.z, BLADE.tell.turn * dt);
        if (this.timer <= 0) {
          this.throwKnives();
          if (this.volleys < BLADE.knives.volleys) this.timer = BLADE.knives.between;
          else {
            this.laser.hide();
            this.dashTo(p.x, p.z, 'dash');
          }
        }
        break;
      case 'dash':
      case 'feint':
      case 'retreat':
        this.updateDash(dt);
        break;
      case 'tell':
        this.faceTo(p.x, p.z, BLADE.tell.turn * dt);
        if (this.timer <= 0) {
          this.state = 'cut';
          this.timer = BLADE.cut.time;
          this.struck = false;
          this.vx = Math.sin(this.facing) * BLADE.cut.lunge;
          this.vz = Math.cos(this.facing) * BLADE.cut.lunge;
          g.audio.slash();
        }
        break;
      case 'cut':
        this.slash();
        if (this.timer <= 0) this.retreat();
        break;
      case 'reel':
        if (this.timer <= 0) this.retreat();
        break;
    }
    if (!this.dashing) {
      // on her feet: the shove of a kick or the lunge of a cut carries her a little, and nobody stands inside her
      const f = Math.exp(-6 * dt);
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      this.vx *= f;
      this.vz *= f;
      if (this.y < 0.5) g.level.collideCircle(this, BLADE.radius);
      this.shove(p);
    }
    // up on a raised perch (the booth) while she waits there, and as she lands back on one
    const perch = this.perches[this.perchI];
    const wantY = this.state === 'perch' || this.state === 'throw' || (this.state === 'retreat' && Math.hypot(perch.x - this.x, perch.z - this.z) < 1) ? perch.y : 0;
    this.y = damp(this.y, wantY, 14, dt);
    if (this.state === 'throw' && p.alive) this.laser.set(this.x, this.z, p.x, p.z, 0.06, 1.5 + 2 * clamp(1 - this.timer / BLADE.knives.tell, 0, 1), GUN_Y);
    this.sync();
  }

  /** The knives' tell (danmaku): at her perch, the blades lit and a red line on the player for BLADE.knives.tell s. */
  throwTell() {
    const g = this.game;
    this.state = 'throw';
    this.timer = BLADE.knives.tell;
    this.volleys = 0;
    this.glow = 1;
    g.audio.aimWarn(g.panFor(this.x));
    if (this.firstKnives) {
      this.firstKnives = false;
      g.notes.log('刀后擲飛刀：紅線預告，快彈');
      g.hud.banner('KNIVES', '紅線對住你：飛刀快，側身或慢鏡', 'clear');
    }
  }

  /** One fan of knives at the player (BLADE.knives): fast rounds in the arcade's look; the second fan between the first's. */
  throwKnives() {
    const g = this.game;
    const K = BLADE.knives;
    const p = g.player;
    const a0 = angleTo(this.x, this.z, p.x, p.z);
    const step = (K.spread * 2) / (K.count - 1);
    const shift = this.volleys % 2 ? step / 2 : 0;
    for (let i = 0; i < K.count; i++) {
      const a = a0 - K.spread + i * step + shift;
      if (a > a0 + K.spread + 1e-6) continue; // the shifted fan's last would fall outside the spread
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      g.bullets.spawn({ x: this.x + dx * 0.5, z: this.z + dz * 0.5, dx, dz, speed: K.speed, owner: 'enemy', damage: K.dmg, range: K.range, source: this.knife, look: 'enemy' });
    }
    this.volleys++;
    this.flash = 0.4;
    g.audio.shot('pistol', g.panFor(this.x));
  }

  /** As she lands on a perch (danmaku): a ring of slow blades out from her, BLADE.wall.gap of them missing at a random place. */
  wallRing() {
    const g = this.game;
    const W = BLADE.wall;
    const step = (Math.PI * 2) / W.count;
    const gapAt = g.rng.int(0, W.count - 1);
    const base = g.rng.range(0, step);
    for (let i = 0; i < W.count; i++) {
      if ((i - gapAt + W.count) % W.count < W.gap) continue;
      const a = base + i * step;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      g.bullets.spawn({ x: this.x + dx * 0.5, z: this.z + dz * 0.5, dx, dz, speed: W.speed, owner: 'enemy', damage: W.dmg, range: W.range, source: this.wallSrc, look: 'danmaku' });
    }
    g.fx.ring(this.x, this.z, 1.2, 0.4, 0xff2bd0, 3);
    g.audio.shot('pistol', g.panFor(this.x));
    if (this.firstWall) {
      this.firstWall = false;
      g.notes.log('刀后放出刀氣環：慢，有缺口');
      g.hud.banner('RING', '刀氣環慢：找缺口走出去', 'clear');
    }
  }

  /** Off towards (x, z): `state` is 'dash' (at the player), 'feint' (a hop to his other side) or 'retreat' (to a perch). */
  dashTo(x, z, state) {
    this.state = state;
    this.goal = { x, z };
    this.dashT = 0;
    this.path = null;
    this.pathT = 0;
    this.dodged = false;
    this.vx = this.vz = 0;
    if (state === 'dash') {
      this.feints = Math.min(this.lost, BLADE.feint.max);
      this.game.audio.slide();
    }
  }

  /** A dash: along the nav grid's path to the goal (the player, wherever he is now), through anyone in the way. */
  updateDash(dt) {
    const g = this.game;
    const L = g.level;
    const p = g.player;
    const D = BLADE.dash;
    this.dashT += dt;
    if (this.state === 'dash' && p.alive) {
      this.goal.x = p.x;
      this.goal.z = p.z;
    }
    const { x: gx, z: gz } = this.goal;
    const dist = Math.hypot(gx - this.x, gz - this.z);
    const stop = this.state === 'dash' ? D.stop : 0.35;
    if (dist <= stop || this.dashT > D.giveUp) {
      this.arrive(dist <= stop);
      return;
    }
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0) {
      this.path = L.nav.findPath(this.x, this.z, gx, gz) || [{ x: gx, z: gz }];
      this.pathT = 0.2;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 0.4) this.path.shift();
    const w = this.path[0];
    this.faceTo(w.x, w.z, 14 * dt);
    const sp = this.speed();
    const step = Math.min(sp * dt, dist);
    this.x += Math.sin(this.facing) * step;
    this.z += Math.cos(this.facing) * step;
    if (this.y < 0.5) L.collideCircle(this, BLADE.radius);
    this.phase += dt * sp * 1.6;
    // running through the player (once she is up to speed: a player she stood beside is passed, not hit): knocked flying,
    // unless he slides under or spins past her (DODGE)
    if (p.alive && this.dashT >= D.ram && Math.hypot(p.x - this.x, p.z - this.z) < BLADE.radius + 0.4) {
      if (p.sliding || p.spinning) {
        if (!this.dodged) {
          this.dodged = true;
          g.score.style('DODGE', 40, true);
          g.notes.log('閃過刀后的衝刺');
        }
      } else if (this.ramCd <= 0) {
        this.ramCd = 0.8;
        if (p.hurt(D.hit, Math.sin(this.facing), Math.cos(this.facing), false, '刀后撞飛')) g.shake(0.35);
      }
    }
    this.ghostT -= dt;
    if (this.ghostT <= 0) {
      this.ghostT = D.ghostEvery;
      g.style.snapshot(this.rig, GHOST);
    }
  }

  /** The dash is over: at a perch she crouches; at the player she feints or raises the blades; a chase given up ends at a perch. */
  arrive(reached) {
    const g = this.game;
    const p = g.player;
    if (this.state !== 'retreat' && !reached) {
      this.retreat();
      return;
    }
    if (this.state === 'retreat') {
      const at = this.perches[this.perchI];
      this.x = at.x;
      this.z = at.z;
      this.state = 'perch';
      const W = BLADE.perch;
      this.timer = g.rng.range(W.wait[0], W.wait[1]) * (1 - W.faster * this.lost);
      if (this.danmaku && p.alive) this.wallRing();
      return;
    }
    if (this.feints > 0 && g.rng.next() < BLADE.feint.chance) {
      this.feints--;
      const d = Math.hypot(p.x - this.x, p.z - this.z) || 1;
      const ux = (p.x - this.x) / d;
      const uz = (p.z - this.z) / d;
      this.dashTo(p.x + ux * BLADE.dash.stop, p.z + uz * BLADE.dash.stop, 'feint');
      return;
    }
    this.tell();
  }

  /** The blades go up: the window. */
  tell() {
    const g = this.game;
    this.state = 'tell';
    this.timer = BLADE.tell.time;
    this.taken = false;
    this.kicked = false;
    this.vx = this.vz = 0;
    this.faceTo(g.player.x, g.player.z, Math.PI);
    g.audio.aimWarn(g.panFor(this.x));
    g.fx.ring(this.x, this.z, BLADE.cut.reach, BLADE.tell.time, 0xff2bd0, 3);
    if (this.firstTell) {
      this.firstTell = false;
      g.hud.banner('OPENING', '亮刀的半秒：開火、鑊擊或踢', 'clear');
    }
  }

  /** The cut: once, on a player within reach and the arc in front (a spin dodges it: player.hurt). */
  slash() {
    if (this.struck) return;
    const g = this.game;
    const p = g.player;
    if (!p.alive) return;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d > BLADE.cut.reach + 0.3 || Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing)) > BLADE.cut.arc) return;
    this.struck = true;
    if (p.hurt(BLADE.cut.dmg, dx / d, dz / d, false, '刀后的刀')) g.shake(0.4);
    else if (p.spinning) {
      g.score.style('DODGE', 40, true);
      g.notes.log('旋轉閃過刀后的刀');
    }
  }

  /** Off to another perch. */
  retreat() {
    const n = this.perches.length;
    if (n > 1) this.perchI = (this.perchI + 1 + this.game.rng.int(0, n - 2)) % n;
    const at = this.perches[this.perchI];
    this.dashTo(at.x, at.z, 'retreat');
  }

  /** Nobody stands inside her while she is on her feet. */
  shove(p) {
    if (!p.alive || this.y >= 0.5) return;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    const rr = BLADE.radius + 0.3;
    if (d >= rr || d < 1e-4) return;
    p.x += (dx / d) * (rr - d);
    p.z += (dz / d) * (rr - d);
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active || this.dashing) return null; // a dash: the shot flies through where she was
    const t = segCircle(x0, z0, x1, z1, this.x, this.z, BLADE.radius);
    return t >= 0 ? { t, part: this.state === 'tell' ? 'open' : this.state === 'perch' || this.state === 'throw' ? 'guard' : 'body' } : null;
  }

  shot(b, part) {
    const g = this.game;
    if (part === 'guard') {
      // perched, she turns the shot aside with a blade
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 6, [7, 2, 6], 7);
      g.audio.deflect(g.panFor(b.x));
      if (this.deflectLogT <= 0) {
        this.deflectLogT = 2;
        g.notes.log('刀后格開子彈：等她亮刀');
      }
      return true;
    }
    this.flash = 1;
    g.fx.blood(b.x, GUN_Y, b.z, b.dx, b.dz, 8);
    g.audio.flesh(g.panFor(b.x));
    if (part === 'open' && !this.taken) this.wound(b.homeRun ? BLADE.smash : 1, b.homeRun ? '被擋回的子彈打中' : '中彈');
    return true;
  }

  /** Hurt in the window: `n` segments off (`how` says by what), and she breaks off reeling. */
  wound(n, how) {
    this.taken = true;
    for (let i = 0; i < n && this.active; i++) this.hurt(how);
    if (!this.active) return;
    this.state = 'reel';
    this.timer = BLADE.reel;
    this.vx = -Math.sin(this.facing) * 3;
    this.vz = -Math.cos(this.facing) * 3;
  }

  /** The player's kick or pan smash (player.js) in the window: a smash takes BLADE.smash segments; a kick shoves her and holds the window open. */
  melee(inCone, reach, kind) {
    if (!this.active || this.state !== 'tell') return false;
    const dir = inCone(this.x, this.z, reach + BLADE.radius);
    if (!dir) return false;
    const g = this.game;
    this.flash = 1;
    if (kind === 'smash') {
      g.notes.log('鑊擊中刀后');
      this.wound(BLADE.smash, '捱了一鑊');
      return true;
    }
    this.vx = dir.x * BLADE.kick.back;
    this.vz = dir.z * BLADE.kick.back;
    if (!this.kicked) {
      this.kicked = true;
      this.timer += BLADE.kick.extend;
    }
    g.notes.log('踢退刀后：刀還亮着');
    return true;
  }

  /** A blast beside her (a barrel, a grenade) takes a segment, unless she is mid-dash. */
  blast(x, z) {
    if (!this.active || this.dashing || Math.hypot(x - this.x, z - this.z) > BLADE.blast) return;
    this.flash = 1;
    this.taken = true;
    this.hurt('被炸到');
    if (!this.active) return;
    this.state = 'reel';
    this.timer = BLADE.reel;
  }

  /** The last segment: she drops where she stands. */
  goDown() {
    const g = this.game;
    this.state = 'down';
    this.vx = this.vz = 0;
    this.laser.hide();
    g.fx.flash(this.x, 1.2, this.z, 0xff2bd0, 40, 0.4, 10);
    g.fx.blood(this.x, 1, this.z, 0, 0, 20);
    g.notes.log('刀后倒下');
    g.hud.banner('BOSS DOWN', '刀后倒下了', 'clear');
    this.finish();
    this.sync();
  }

  /** Where she is drawn: crouched at a perch, leaning into a dash, blades up and alight for the tell, down on the floor at the end. */
  sync() {
    const g = this.game;
    const r = this.rig;
    const S = this.state;
    r.root.position.set(this.x, this.y + g.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    setFlash(r, this.flash * 2.5);
    this.bladeMat.color.setRGB(1 + this.glow * 3, 0.17 + this.glow * 0.6, 0.82 + this.glow * 2);
    // her ring reads from across the floor (the worn model is dark): brighter still through the tell
    r.ring.material.color.setRGB(S === 'tell' ? 2.6 : 1.2, S === 'tell' ? 0.3 : 0.12, S === 'tell' ? 1.4 : 0.75);
    if (!g.style.poseDue(r, g.worldTime)) return;
    animateRig(r, this.phase, this.dashing ? 1 : 0, this.facing);
    const arm = S === 'tell' ? -2.4 : S === 'throw' ? -1.5 : S === 'cut' ? 0.7 : S === 'reel' ? -0.9 : this.dashing ? 1.2 : 0.55;
    r.armL.rotation.x = r.armR.rotation.x = arm;
    r.armL.rotation.z = S === 'tell' ? -0.5 : 0;
    r.armR.rotation.z = S === 'tell' ? 0.5 : 0;
    r.inner.rotation.x = S === 'down' ? 1.45 : S === 'perch' ? 0.45 : S === 'throw' ? 0.2 : this.dashing ? 0.3 : S === 'reel' ? -0.3 : 0;
    r.inner.position.y = S === 'down' ? 0.15 : S === 'perch' ? -0.2 : S === 'throw' ? -0.1 : 0;
    finishRig(r, g.worldTime);
  }
}

/** The docks' armoured truck. */
class Truck extends Boss {
  constructor(game) {
    super(game, TRUCK);
    this.root = null;
    this.laser = new Laser(game.scene, new THREE.Color(1, 0.05, 0.05));
    this.reset();
  }

  reset() {
    if (this.root) {
      this.game.scene.remove(this.root, this.strip);
      for (const o of [this.root, this.strip]) {
        o.traverse((m) => {
          if (m.geometry) m.geometry.dispose();
        });
      }
      this.root = null;
    }
    super.reset();
    this.laser.hide();
    this.state = 'enter';
  }

  /** Its wave on the docks: `def` is the map's (maps.js `boss`: its loop, and where it drives in from). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    this.loop = def.loop.map(([x, z]) => ({ x, z }));
    this.from = { x: def.from[0], z: def.from[1] };
    this.x = this.from.x;
    this.z = this.from.z;
    const first = this.loop[0];
    this.heading = Math.atan2(first.x - this.x, first.z - this.z);
    this.seg = 0; // driving from loop[seg] to loop[seg + 1]
    this.state = 'enter'; // enter, drive, aim, warn, charge, back, unload, down
    this.timer = 0;
    this.gunState = 'idle';
    this.gunT = TRUCK.gun.first;
    this.chargeT = TRUCK.charge.first;
    this.unloadT = TRUCK.unload.first;
    this.blastT = 0;
    this.doorHits = 0;
    this.door = 0; // 0 shut, 1 open (looks)
    this.hitPlayer = false;
    this.build();
  }

  /** The look: a block truck (cab, box, wheels, a roof gun, a back door), and the red strip of a charge. */
  build() {
    const g = this.game;
    const L = g.level;
    const { w, l, h } = TRUCK.size;
    const std = (color, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.4, ...extra });
      addCutaway(m, L.cut);
      return m;
    };
    const box = (bw, bh, bd, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z);
    const root = new THREE.Group();
    const body = new THREE.Mesh(
      mergeGeometries([
        box(w, h - 0.5, l * 0.7, 0, 0.5 + (h - 0.5) / 2, -l * 0.15), // the armoured box
        box(w, h - 0.9, l * 0.3, 0, 0.5 + (h - 0.9) / 2, l * 0.35), // the cab
        box(w + 0.1, 0.25, 0.3, 0, 0.55, l / 2), // the ram bar
      ]),
      std(0x3a4048),
    );
    const plates = new THREE.Mesh(
      mergeGeometries([box(w + 0.04, 0.12, l * 0.7, 0, 1.55, -l * 0.15), box(w + 0.04, 0.12, l * 0.7, 0, 2.15, -l * 0.15)]),
      std(0xd9a530, { emissive: 0x6a4a10, emissiveIntensity: 0.4 }),
    );
    const glass = new THREE.Mesh(box(w - 0.3, 0.45, 0.06, 0, 1.45, l / 2 + 0.01), std(0x5fd0ff, { emissive: 0x2a8fff, emissiveIntensity: 0.5, roughness: 0.15 }));
    const wheels = new THREE.Mesh(
      mergeGeometries(
        [
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
        ].map(([sx, sz]) =>
          new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12)
            .rotateZ(Math.PI / 2)
            .translate(sx * (w / 2), 0.5, sz * l * 0.32),
        ),
      ),
      std(0x111216),
    );
    const turret = new THREE.Group();
    turret.position.set(0, h, -l * 0.15);
    turret.add(new THREE.Mesh(mergeGeometries([box(0.8, 0.4, 0.8, 0, 0.2, 0), box(0.14, 0.14, 1.2, 0, 0.3, 0.6)]), std(0x22252b)));
    const door = new THREE.Group(); // hinged at the left rear corner
    door.position.set(-w / 2, 0.5, -l / 2);
    door.add(new THREE.Mesh(box(w, h - 0.55, 0.1, w / 2, (h - 0.55) / 2, -0.05), std(0x2c3138)));
    const lights = new THREE.Mesh(
      mergeGeometries([box(0.35, 0.18, 0.05, -w / 2 + 0.3, 0.95, l / 2 + 0.02), box(0.35, 0.18, 0.05, w / 2 - 0.3, 0.95, l / 2 + 0.02)]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.8) }),
    );
    root.add(body, plates, glass, wheels, turret, door, lights);
    root.traverse((m) => {
      if (m.isMesh) m.castShadow = true;
    });
    lights.castShadow = false;
    g.style.retone(root, 'char', L.cut);
    g.style.outline(root, 'char');
    this.turret = turret;
    this.doorMesh = door;
    // the charge's path, painted on the ground
    this.strip = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.15, 0.15), transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.strip.visible = false;
    this.root = root;
    g.scene.add(root, this.strip);
    this.sync();
  }

  /** (x, z) in the truck's own frame: [right, forward]. */
  local(x, z) {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    const dx = x - this.x;
    const dz = z - this.z;
    return [dx * c - dz * s, dx * s + dz * c];
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    if (this.blastT > 0) this.blastT -= dt;
    if (this.state === 'down') {
      this.updateWreck(dt);
      return;
    }
    this.updateMove(dt);
    this.updateGun(dt);
    this.push();
    this.sync();
  }

  /** Where it goes: in, round the loop, the stops for a charge or the back door. */
  updateMove(dt) {
    const g = this.game;
    const p = g.player;
    const C = TRUCK.charge;
    const U = TRUCK.unload;
    switch (this.state) {
      case 'enter': {
        const first = this.loop[0];
        if (this.driveTo(first.x, first.z, (Math.hypot(first.x - this.from.x, first.z - this.from.z) / TRUCK.enter) * dt)) this.state = 'drive';
        break;
      }
      case 'drive': {
        this.chargeT -= dt;
        this.unloadT -= dt;
        if (this.unloadT <= 0 && this.onMap()) {
          this.unloadT = U.every;
          if (g.enemies.aliveCount + U.count <= U.maxAlive) {
            this.state = 'unload';
            this.timer = U.open;
            this.doorHits = 0;
            this.letOut();
            break;
          }
        }
        if (this.chargeT <= 0 && p.alive && this.onMap()) {
          this.chargeT = C.every;
          this.state = 'aim';
          this.timer = C.aim;
          this.chargeFrom = { x: this.x, z: this.z, heading: this.heading };
          break;
        }
        let step = TRUCK.speed * dt;
        while (step > 0) {
          const next = this.loop[(this.seg + 1) % this.loop.length];
          const d = Math.hypot(next.x - this.x, next.z - this.z);
          if (d > step) {
            this.driveTo(next.x, next.z, step);
            break;
          }
          this.driveTo(next.x, next.z, d);
          step -= d;
          this.seg = (this.seg + 1) % this.loop.length;
        }
        break;
      }
      case 'aim': {
        // stopped: turn the nose onto the player
        this.timer -= dt;
        const want = Math.atan2(p.x - this.x, p.z - this.z);
        const da = wrapAngle(want - this.heading);
        this.heading = wrapAngle(this.heading + clamp(da, -C.turn * dt, C.turn * dt));
        if (Math.abs(da) < 0.03 || this.timer <= 0) {
          const run = this.chargeRoom();
          if (run < C.min) this.state = 'back';
          else {
            this.state = 'warn';
            this.timer = C.warn;
            this.run = run;
            this.ran = 0;
            this.hitPlayer = false;
            g.audio.aimWarn(g.panFor(this.x));
            g.notes.log('貨車準備衝撞');
          }
        }
        break;
      }
      case 'warn':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'charge';
        break;
      case 'charge': {
        const step = Math.min(C.speed * dt, this.run - this.ran);
        this.x += Math.sin(this.heading) * step;
        this.z += Math.cos(this.heading) * step;
        this.ran += step;
        this.hitCheck();
        if (this.ran >= this.run - 1e-6) {
          this.state = 'back';
          g.shake(0.35);
          g.audio.impact(g.panFor(this.x));
          g.fx.sparks(this.x + Math.sin(this.heading) * TRUCK.size.l * 0.5, 0.8, this.z + Math.cos(this.heading) * TRUCK.size.l * 0.5, -Math.sin(this.heading), -Math.cos(this.heading), 16, [6, 4, 1.5], 8);
        }
        break;
      }
      case 'back': {
        // back to the loop, the way it came, and the nose round to the road again
        const f = this.chargeFrom;
        const d = Math.hypot(f.x - this.x, f.z - this.z);
        const step = Math.min(d, C.back * dt);
        if (d > 1e-6) {
          this.x += ((f.x - this.x) / d) * step;
          this.z += ((f.z - this.z) / d) * step;
        }
        const da = wrapAngle(f.heading - this.heading);
        this.heading = wrapAngle(this.heading + clamp(da, -C.turn * dt, C.turn * dt));
        if (d - step < 1e-4 && Math.abs(wrapAngle(f.heading - this.heading)) < 0.03) {
          this.heading = f.heading;
          this.state = 'drive';
        }
        break;
      }
      case 'unload':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'drive';
        break;
    }
    this.door = clamp(this.door + (this.state === 'unload' ? dt : -dt) * 3, 0, 1);
  }

  /** On the playable ground (a loop may turn just past an open end of the map: no letting thugs out or charging there). */
  onMap() {
    const { halfW, halfD } = this.game.level.bounds;
    return Math.abs(this.x) < halfW - TRUCK.size.l / 2 && Math.abs(this.z) < halfD - TRUCK.size.l / 2;
  }

  /** Move up to `step` m towards (x, z), turning to face it; true once there. */
  driveTo(x, z, step) {
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > 1e-6) this.heading = Math.atan2(x - this.x, z - this.z);
    if (d <= step + 1e-6) {
      this.x = x;
      this.z = z;
      return true;
    }
    this.x += ((x - this.x) / d) * step;
    this.z += ((z - this.z) / d) * step;
    return false;
  }

  /** How far it can charge straight ahead before its nose meets something solid. */
  chargeRoom() {
    const L = this.game.level;
    const C = TRUCK.charge;
    const { w, l } = TRUCK.size;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let room = C.length;
    for (const side of [-0.5, 0, 0.5]) {
      const ox = this.x + fz * side * w;
      const oz = this.z - fx * side * w;
      const hit = L.raycast(ox, oz, ox + fx * (C.length + l / 2), oz + fz * (C.length + l / 2), false, 0, true);
      if (hit) room = Math.min(room, hit.t * (C.length + l / 2) - l / 2 - 0.3);
    }
    return Math.max(0, room);
  }

  /** A charge running into the player: hurt once, thrown aside (a slide or a spin goes under or round it). */
  hitCheck() {
    const g = this.game;
    const p = g.player;
    if (this.hitPlayer || !p.alive || p.sliding || p.spinning) return;
    const [rx, fw] = this.local(p.x, p.z);
    const { w, l } = TRUCK.size;
    if (Math.abs(rx) > w / 2 + 0.35 || Math.abs(fw) > l / 2 + 0.35) return;
    this.hitPlayer = true;
    const side = rx >= 0 ? 1 : -1;
    const dx = Math.sin(this.heading) * 0.6 + Math.cos(this.heading) * side * 0.8;
    const dz = Math.cos(this.heading) * 0.6 - Math.sin(this.heading) * side * 0.8;
    p.hurt(TRUCK.charge.dmg, dx, dz, true, '貨車的衝撞');
    g.shake(0.5);
  }

  /** Nothing stands inside it: the player, thugs, barrels and pans are pushed out to its sides. */
  push() {
    const g = this.game;
    const { w, l } = TRUCK.size;
    const sh = Math.sin(this.heading);
    const ch = Math.cos(this.heading);
    const shove = (o, r, speed) => {
      const [rx, fw] = this.local(o.x, o.z);
      const ox = w / 2 + r - Math.abs(rx);
      const oz = l / 2 + r - Math.abs(fw);
      if (ox <= 0 || oz <= 0) return false;
      if (ox < oz) {
        const s = rx >= 0 ? 1 : -1;
        o.x += ch * s * ox;
        o.z -= sh * s * ox;
        if (speed && o.vx !== undefined) {
          o.vx += ch * s * speed;
          o.vz -= sh * s * speed;
        }
      } else {
        const s = fw >= 0 ? 1 : -1;
        o.x += sh * s * oz;
        o.z += ch * s * oz;
        if (speed && o.vx !== undefined) {
          o.vx += sh * s * speed;
          o.vz += ch * s * speed;
        }
      }
      return true;
    };
    const p = g.player;
    if (p.alive) shove(p, 0.35, 0);
    for (const e of g.enemies.list) if (e.alive) shove(e, e.radius, 0);
    for (const o of g.level.props) if (o.alive && !o.carried && !o.fixed && (o.y || 0) < 1) shove(o, o.r, TRUCK.shove); // not a fixture (fixtures.js): the road is laid clear of them
    // a roller shutter dropped across its road (the docks' loading bay, fixtures.js): it smashes through, and the shutter is up again
    for (const f of g.level.fixtures) {
      if (f.kind !== 'shutter' || !f.down) continue;
      const [rx, fw] = this.local(f.midX, f.midZ);
      if (Math.abs(rx) >= w / 2 + f.w / 2 || Math.abs(fw) >= l / 2 + 0.5) continue;
      f.raise();
      g.fx.debris(f.midX, 1.2, f.midZ, sh, ch, 14, [0.3, 0.3, 0.34], 0.1);
      g.audio.impact(g.panFor(f.midX));
      g.shake(0.3);
      g.notes.log('貨車撞開落下的鐵閘');
    }
  }

  /** The roof gun: a red line onto the player, then a sweep of rounds there. */
  updateGun(dt) {
    const g = this.game;
    const p = g.player;
    const G = TRUCK.gun;
    const busy = this.state === 'enter';
    switch (this.gunState) {
      case 'idle':
        this.gunT -= dt;
        if (this.gunT <= 0 && !busy && p.alive && Math.hypot(p.x - this.x, p.z - this.z) < G.range && g.level.hasLOS(this.x, this.z, p.x, p.z)) {
          this.gunState = 'warn';
          this.gunTimer = G.warn;
          this.lock = { x: p.x, z: p.z };
          g.audio.aimWarn(g.panFor(this.x));
        }
        break;
      case 'warn':
        this.gunTimer -= dt;
        if (this.gunTimer <= 0) {
          this.gunState = 'fire';
          this.shots = G.shots;
          this.gunTimer = 0;
        }
        break;
      case 'fire':
        this.gunTimer -= dt;
        while (this.gunTimer <= 0 && this.shots > 0) {
          this.fire();
          this.shots--;
          this.gunTimer += G.interval;
        }
        if (this.shots <= 0) {
          this.gunState = 'idle';
          this.gunT = G.every;
          this.lock = null;
        }
        break;
    }
  }

  /** One round of the sweep, from the roof gun across the locked spot. */
  fire() {
    const g = this.game;
    const G = TRUCK.gun;
    const k = G.shots > 1 ? (G.shots - this.shots) / (G.shots - 1) : 0.5;
    const a = Math.atan2(this.lock.x - this.x, this.lock.z - this.z) + (k - 0.5) * 2 * G.sweep;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    // the source is the boss as the game sees it (game.boss): its label names the bullets that hit
    g.bullets.spawn({ x: this.x + dx * 0.8, z: this.z + dz * 0.8, dx, dz, speed: G.speed, owner: 'enemy', damage: G.dmg, range: G.range, source: g.boss });
    g.audio.shot('minigun', g.panFor(this.x));
  }

  /** The back door opens and two thugs step out behind it. */
  letOut() {
    const g = this.game;
    const U = TRUCK.unload;
    const bx = -Math.sin(this.heading);
    const bz = -Math.cos(this.heading);
    const back = TRUCK.size.l / 2;
    for (let i = 0; i < U.count; i++) {
      const side = (i - (U.count - 1) / 2) * 1.2;
      const x = this.x + bx * (back + 0.6) + bz * side;
      const z = this.z + bz * (back + 0.6) - bx * side;
      g.enemies.spawn('grunt', { x, z, ex: x + bx * 1.5, ez: z + bz * 1.5 });
    }
    g.notes.log(`貨車開後門放出 ${U.count} 個打手`);
    g.hud.banner('DOOR OPEN', '射後門！', 'clear');
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active || this.state === 'down') return null;
    const { w, l } = TRUCK.size;
    const [ax, az] = this.local(x0, z0);
    const [bx, bz] = this.local(x1, z1);
    const out = {};
    if (!segAABB(ax, az, bx, bz, { minX: -w / 2, maxX: w / 2, minZ: -l / 2, maxZ: l / 2 }, out)) return null;
    // where it meets the box: the back face, with the door open, is the door
    const hz = az + (bz - az) * out.t;
    const hx = ax + (bx - ax) * out.t;
    const door = this.state === 'unload' && this.door > 0.5 && hz < -l / 2 + 0.05 && Math.abs(hx) < w / 2 - 0.15;
    return { t: out.t, part: door ? 'door' : 'armor' };
  }

  shot(b, part) {
    const g = this.game;
    if (part === 'armor') {
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 6, [6, 4.5, 1.8], 7);
      g.audio.impact(g.panFor(b.x));
      return true;
    }
    g.fx.sparks(b.x, GUN_Y, b.z, b.dx, b.dz, 10, [7, 3, 1], 8);
    g.audio.impact(g.panFor(b.x));
    if (++this.doorHits >= TRUCK.unload.hits) {
      // a segment: the door slams and it drives off
      this.doorHits = 0;
      this.state = 'drive';
      this.hurt();
    }
    return true;
  }

  /** Over its roof: a thrown barrel that comes down there goes off on it (thrown.js). */
  under(x, z) {
    if (!this.active || this.state === 'down') return false;
    const [rx, fw] = this.local(x, z);
    return Math.abs(rx) <= TRUCK.size.w / 2 + 0.3 && Math.abs(fw) <= TRUCK.size.l / 2 + 0.3;
  }

  /** A blast beside it (main.js explode): a barrel or a grenade within reach of its side takes a segment. */
  blast(x, z, opts = {}) {
    if (!this.active || this.state === 'down' || this.blastT > 0 || !TRUCK.blast.kinds.includes(opts.kind)) return;
    const { w, l } = TRUCK.size;
    const [rx, fw] = this.local(x, z);
    const dx = Math.max(0, Math.abs(rx) - w / 2);
    const dz = Math.max(0, Math.abs(fw) - l / 2);
    if (Math.hypot(dx, dz) > TRUCK.blast.radius) return;
    this.blastT = TRUCK.blast.cool;
    this.game.shake(0.4);
    this.hurt();
  }

  /** The last segment: it stops and burns, then blows. */
  goDown() {
    const g = this.game;
    this.state = 'down';
    this.timer = TRUCK.wreck.burn;
    this.gunState = 'idle';
    this.lock = null;
    g.notes.log('貨車起火');
    g.hud.banner('BOSS DOWN', '快離開貨車！', 'clear');
  }

  updateWreck(dt) {
    const g = this.game;
    const before = Math.floor(this.timer * 12);
    this.timer -= dt;
    if (Math.floor(this.timer * 12) !== before) g.fx.sparks(this.x, TRUCK.size.h, this.z, 0, 0, 3, [6, 2.5, 0.8], 3, Math.PI); // burning: a few sparks, twelve times a second
    if (this.timer > 0) {
      this.sync();
      return;
    }
    g.explode(this.x, this.z, TRUCK.wreck.radius, { source: '爆炸的貨車', kind: 'truck' });
    this.root.visible = false;
    this.strip.visible = false;
    this.laser.hide();
    this.finish();
  }

  /** Where everything is drawn: the truck, its gun and door, the red line, the painted path. */
  sync() {
    const { l } = TRUCK.size;
    this.root.position.set(this.x, 0, this.z);
    this.root.rotation.y = this.heading;
    const aimAt = this.lock || this.game.player;
    this.turret.rotation.y = Math.atan2(aimAt.x - this.x, aimAt.z - this.z) - this.heading;
    this.doorMesh.rotation.y = -this.door * 1.6;
    const red = this.gunState === 'warn' || this.gunState === 'fire';
    if (red && this.lock) this.laser.set(this.x, this.z, this.lock.x, this.lock.z, 0.06, this.gunState === 'warn' ? 1.5 + 2 * clamp(1 - this.gunTimer / TRUCK.gun.warn, 0, 1) : 3, GUN_Y);
    else this.laser.hide();
    const painted = this.state === 'warn' || this.state === 'charge';
    this.strip.visible = painted;
    if (painted) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const left = this.run - this.ran;
      this.strip.position.set(this.x + fx * l * 0.5, 0.03, this.z + fz * l * 0.5);
      this.strip.rotation.y = this.heading;
      this.strip.scale.set(TRUCK.size.w, 1, Math.max(0.01, left));
    }
  }
}

/** A polyline walked by distance: point and direction at `s` m along it (looping if `loop`). */
/** The docks' heavy gunner. */
class Gunner extends Boss {
  constructor(game) {
    super(game, GUNNER);
    this.rig = null;
    this.wallSrc = { cfg: { label: '重炮的彈幕' } }; // what his slow wall says hit the player (bullets.js: `source.cfg.label`)
    this.reset();
  }

  reset() {
    if (this.rig) {
      const g = this.game;
      g.scene.remove(this.rig.root);
      disposeRig(this.rig);
      for (const m of this.plateMats) m.dispose();
      this.laser.dispose(g.scene);
      this.rig = null;
    }
    super.reset();
    this.state = 'idle';
  }

  /** Its wave on the docks: `def` is the map's (maps.js `boss`: `from` off the map, `at` just inside it). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    this.from = { x: def.from[0], z: def.from[1] };
    this.at = { x: def.at[0], z: def.at[1] };
    this.x = this.from.x;
    this.z = this.from.z;
    this.facing = angleTo(this.x, this.z, this.at.x, this.at.z);
    this.state = 'enter'; // enter (in through the gate), walk (after the player), plant (the sweep), stagger, down
    this.timer = 0;
    this.gunState = 'idle'; // idle, warn, fire
    this.gunT = GUNNER.gun.first;
    this.gunTimer = 0;
    this.shots = 0;
    this.lock = null;
    this.lineA = 0; // where the line points while he fires
    this.mortarT = GUNNER.mortar.first;
    this.hits = 0; // on his back, towards the next segment
    this.blind = false; // in the dark or in a cloud: he sees nobody
    this.blindLogged = false;
    this.plateLogT = 0;
    this.firstWarn = true;
    this.path = null;
    this.pathT = 0;
    this.phase = 0;
    this.flash = 0;
    this.plateFlash = 0;
    this.raging = false; // his partner down (a duo): shells more often (enrage)
    this.danmaku = !!def.danmaku; // his slow wall (GUNNER.wall)
    this.wallState = 'idle'; // idle, warn
    this.wallT = GUNNER.wall.first;
    this.wallTimer = 0;
    this.firstWall = true;
    this.build();
  }

  /** The look: the brute's rig a size up with the minigun, a steel plate with an orange strap in front of him, his red line. */
  build() {
    const g = this.game;
    this.rig = buildCharacter({ body: 0x3b3e48, pants: 0x22242c, accent: 0xff8a2a, hair: 0x55585f, weapon: 'minigun', scale: 1.35, ring: 0.5, model: 'brute' });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.45, metalness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0xff8a2a, emissive: 0xff8a2a, emissiveIntensity: 0.9 });
    this.plateMats = [panelMat, strapMat];
    const plate = new THREE.Group();
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.08), panelMat);
    panel.position.set(0, 0.75, 0);
    const strap = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.1, 0.1), strapMat);
    strap.position.set(0, 1.35, 0);
    plate.add(panel, strap);
    for (const m of plate.children) m.castShadow = true;
    plate.position.set(0, 0.2, 0.5); // hinged low in front: it tilts forward when he staggers
    this.rig.inner.add(plate);
    g.style.dress(plate);
    this.plate = plate;
    this.laser = new Laser(g.scene, 0xff2020);
    g.scene.add(this.rig.root);
    this.sync();
  }

  faceTo(x, z, maxStep) {
    this.facing = turnTowards(this.facing, angleTo(this.x, this.z, x, z), maxStep);
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const L = g.level;
    this.t += dt;
    this.timer -= dt;
    this.plateLogT -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.plateFlash = Math.max(0, this.plateFlash - dt * 6);
    this.blind = this.state !== 'enter' && (L.darkAt(this.x, this.z) || L.smokeAt(this.x, this.z));
    if (this.blind && !this.blindLogged) {
      this.blindLogged = true;
      g.notes.log(L.darkAt(this.x, this.z) ? '重炮在黑暗中失去目標' : '重炮在白霧中失去目標');
    } else if (!this.blind) this.blindLogged = false;
    switch (this.state) {
      case 'enter': {
        // in through the gate (and the fence) at a steady walk
        const d = Math.hypot(this.at.x - this.x, this.at.z - this.z);
        const step = Math.min(GUNNER.enter * dt, d);
        this.facing = angleTo(this.x, this.z, this.at.x, this.at.z);
        this.x += Math.sin(this.facing) * step;
        this.z += Math.cos(this.facing) * step;
        this.phase += dt * GUNNER.enter * 2.2;
        if (d <= 0.05) this.state = 'walk';
        break;
      }
      case 'walk':
        this.walk(dt);
        break;
      case 'plant':
        if (this.lock) this.faceTo(this.lock.x, this.lock.z, GUNNER.turn * 2 * dt);
        break;
      case 'stagger':
        if (this.timer <= 0) this.state = 'walk';
        break;
    }
    if (this.state !== 'enter') {
      L.collideCircle(this, GUNNER.radius);
      this.shove();
      this.bowled();
    }
    if (this.state === 'walk' || this.state === 'plant') {
      this.updateGun(dt);
      this.updateMortar(dt);
      this.updateWall(dt);
    }
    this.sync();
  }

  /** The slow wall (danmaku): planted, his plate alight for the warning, then the fan with its gap. */
  updateWall(dt) {
    if (!this.danmaku) return;
    const g = this.game;
    const p = g.player;
    const W = GUNNER.wall;
    if (this.wallState === 'idle') {
      this.wallT -= dt;
      if (this.wallT > 0 || this.state !== 'walk' || this.gunState !== 'idle' || this.blind || !p.alive || !this.mayTell()) return;
      this.wallState = 'warn';
      this.wallTimer = W.warn;
      this.state = 'plant';
      this.lock = { x: p.x, z: p.z };
      this.plateFlash = 1; // the plate alight from the first step of the warning
      g.audio.aimWarn(g.panFor(this.x));
      g.fx.ring(this.x, this.z, 1.6, W.warn, 0xff8a2a, 3);
      if (this.firstWall) {
        this.firstWall = false;
        g.notes.log('重炮鋼板發光：慢彈幕牆要來，有缺口');
        g.hud.banner('SLOW WALL', '鋼板發光：慢彈幕牆，找缺口或繞到背後', 'clear');
      }
      return;
    }
    this.plateFlash = 1;
    this.wallTimer -= dt;
    if (this.wallTimer > 0) return;
    this.fireWall();
    this.wallState = 'idle';
    this.wallT = W.every;
    if (this.gunState === 'idle') {
      this.lock = null;
      if (this.state === 'plant') this.state = 'walk';
    }
  }

  /** The fan of slow rounds across his front (GUNNER.wall), `gap` of them missing somewhere inside. */
  fireWall() {
    const g = this.game;
    const W = GUNNER.wall;
    const gapAt = g.rng.int(1, W.count - 1 - W.gap);
    const step = (W.spread * 2) / (W.count - 1);
    for (let i = 0; i < W.count; i++) {
      if (i >= gapAt && i < gapAt + W.gap) continue;
      const a = this.facing - W.spread + i * step;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      g.bullets.spawn({ x: this.x + dx * 1.2, z: this.z + dz * 1.2, dx, dz, speed: W.speed, owner: 'enemy', damage: W.dmg, range: W.range, source: this.wallSrc, look: 'danmaku' });
    }
    g.audio.shot('shotgun', g.panFor(this.x));
    this.flash = 0.4;
  }

  /** After the player along the nav grid, turning on him at his own slow rate; this close he stands and turns. */
  walk(dt) {
    const g = this.game;
    const L = g.level;
    const p = g.player;
    if (!p.alive) return;
    this.faceTo(p.x, p.z, GUNNER.turn * dt);
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (dist < GUNNER.near) return;
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0) {
      this.path = L.nav.findPath(this.x, this.z, p.x, p.z) || [{ x: p.x, z: p.z }];
      this.pathT = 0.4;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 0.5) this.path.shift();
    const w = this.path[0];
    const a = angleTo(this.x, this.z, w.x, w.z);
    this.x += Math.sin(a) * GUNNER.speed * dt;
    this.z += Math.cos(a) * GUNNER.speed * dt;
    this.phase += dt * GUNNER.speed * 2.2;
  }

  /** The sweep: a red line onto the player, then the burst across it; he stands for it, and loses it blinded. */
  updateGun(dt) {
    const g = this.game;
    const G = GUNNER.gun;
    switch (this.gunState) {
      case 'idle':
        this.gunT -= dt;
        if (this.gunT <= 0 && this.canSweep() && this.mayTell()) this.startSweep();
        break;
      case 'warn':
        this.gunTimer -= dt;
        if (this.blind) {
          this.endSweep();
          g.notes.log('重炮看不見了，收起紅線');
        } else if (this.gunTimer <= 0) {
          this.gunState = 'fire';
          this.shots = G.shots;
          this.gunTimer = 0;
        }
        break;
      case 'fire':
        this.gunTimer -= dt;
        while (this.gunTimer <= 0 && this.shots > 0) {
          this.fire();
          this.shots--;
          this.gunTimer += G.interval;
        }
        if (this.shots <= 0) this.endSweep();
        break;
    }
  }

  /** Free to plant and sweep: walking, seeing, the player alive, in range and in sight. */
  canSweep() {
    const g = this.game;
    const p = g.player;
    return this.state === 'walk' && this.gunState === 'idle' && !this.blind && p.alive && Math.hypot(p.x - this.x, p.z - this.z) < GUNNER.gun.range && g.level.hasLOS(this.x, this.z, p.x, p.z);
  }

  /** The sweep begins: he plants his feet and the red line goes onto the player. */
  startSweep() {
    const g = this.game;
    const p = g.player;
    this.gunState = 'warn';
    this.gunTimer = GUNNER.gun.warn;
    this.lock = { x: p.x, z: p.z };
    this.lineA = angleTo(this.x, this.z, p.x, p.z);
    this.state = 'plant';
    g.audio.aimWarn(g.panFor(this.x));
    if (this.firstWarn) {
      this.firstWarn = false;
      g.hud.banner('STEEL PLATE', '正面打不穿：繞到他背後', 'clear');
    }
  }

  /** Open to the player: once in through the gate, his back takes shots (and a stagger, his front), always. */
  vulnerable() {
    return this.active && this.state !== 'enter';
  }

  /** Free for the combo: walking and seeing. Unlike his own sweep he needs no clear line: cover between is the player's. */
  comboReady() {
    return this.active && this.state === 'walk' && this.gunState === 'idle' && !this.blind && this.game.player.alive;
  }

  /** The combo: the sweep across the player's spot, now. */
  combo() {
    this.startSweep();
  }

  endSweep() {
    this.gunState = 'idle';
    this.gunT = GUNNER.gun.every;
    this.lock = null;
    if (this.state === 'plant') this.state = 'walk';
  }

  /** One round of the sweep, across the locked spot from one side to the other. */
  fire() {
    const g = this.game;
    const G = GUNNER.gun;
    const k = G.shots > 1 ? (G.shots - this.shots) / (G.shots - 1) : 0.5;
    const a = (this.lineA = angleTo(this.x, this.z, this.lock.x, this.lock.z) + (k - 0.5) * 2 * G.sweep);
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    // the source is the boss as the game sees it (game.boss): its label names the bullets that hit
    g.bullets.spawn({ x: this.x + dx * 1.2, z: this.z + dz * 1.2, dx, dz, speed: G.speed, owner: 'enemy', damage: G.dmg, range: G.range, source: this.team ? this : g.boss });
    g.audio.shot('minigun', g.panFor(this.x));
  }

  /** The mortar: shells onto the player's spot, rings on the ground first; none while he cannot see. */
  updateMortar(dt) {
    const g = this.game;
    const p = g.player;
    const M = GUNNER.mortar;
    this.mortarT -= dt;
    if (this.mortarT > 0 || this.blind || !p.alive || !this.mayTell()) return;
    this.mortarT = M.every * (this.raging ? 0.6 : 1);
    for (let i = 0; i < M.rounds; i++) {
      const a = g.rng.range(0, Math.PI * 2);
      const r = i === 0 ? 0 : g.rng.range(0.8, M.scatter);
      g.grenades.lob(this.x, this.z, p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, M.lob, this.team ? this : MORTAR_SOURCE); // in a duo, his own (CROSSFIRE)
    }
    g.audio.shot('launcher', g.panFor(this.x));
    g.notes.log('重炮發射迫擊砲：看地上的紅圈');
  }

  /** He reels for `t` s: plate down (shots from the front count), the sweep dropped. */
  stagger(t, how) {
    if (!this.active || this.state === 'enter') return;
    this.state = 'stagger';
    this.timer = Math.max(this.timer, t);
    this.flash = 1;
    this.endSweep();
    this.path = null;
    if (how) this.game.notes.log(how);
  }

  /** Nobody stands inside him, and barrels and pans roll out of his way. */
  shove() {
    const g = this.game;
    const out = (o, r) => {
      const dx = o.x - this.x;
      const dz = o.z - this.z;
      const d = Math.hypot(dx, dz);
      const rr = GUNNER.radius + r;
      if (d >= rr || d < 1e-4) return;
      o.x += (dx / d) * (rr - d);
      o.z += (dz / d) * (rr - d);
    };
    const p = g.player;
    if (p.alive) out(p, 0.35);
    for (const e of g.enemies.list) if (e.alive) out(e, e.radius);
    for (const o of g.level.props) if (o.alive && !o.carried && !o.fixed && (o.y || 0) < 1) out(o, o.r);
  }

  /** A thug kicked into him (bowling) knocks him off balance. */
  bowled() {
    for (const e of this.game.enemies.list) {
      if (e.stunT <= 0) {
        e.bowledBoss = false;
        continue;
      }
      if (!e.alive || e.bowledBoss || e.cfg.fly || Math.hypot(e.vx, e.vz) < GUNNER.bowl) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) > GUNNER.radius + e.radius + 0.15) continue;
      e.bowledBoss = true;
      e.vx *= 0.2;
      e.vz *= 0.2;
      this.game.audio.kick(true);
      this.stagger(GUNNER.stagger.bowl, '打手撞到重炮身上，他一個踉蹌');
    }
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active) return null;
    const t = segCircle(x0, z0, x1, z1, this.x, this.z, GUNNER.radius);
    if (t < 0) return null;
    // where on him it lands: within the plate's arc of his facing it glances off, unless he staggers
    const hx = x0 + (x1 - x0) * t;
    const hz = z0 + (z1 - z0) * t;
    const a = Math.abs(wrapAngle(Math.atan2(hx - this.x, hz - this.z) - this.facing));
    const plate = this.state !== 'stagger' && a <= (GUNNER.plate * Math.PI) / 180;
    return { t, part: plate ? 'plate' : 'body' };
  }

  shot(b, part) {
    const g = this.game;
    if (part === 'plate') {
      this.plateFlash = 1;
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 6, [7, 5, 2], 7);
      g.audio.deflect(g.panFor(b.x));
      if (this.plateLogT <= 0) {
        this.plateLogT = 2;
        g.notes.log('子彈打在重炮的鋼板上：繞到背後');
      }
      return true;
    }
    this.flash = 1;
    g.fx.blood(b.x, GUN_Y, b.z, b.dx, b.dz, 8);
    g.audio.flesh(g.panFor(b.x));
    if (++this.hits >= GUNNER.perSegment) {
      this.hits = 0;
      this.hurt(this.state === 'stagger' ? '踉蹌中中彈' : '背後中彈');
    }
    return true;
  }

  /** The player's kick or pan smash (player.js): he staggers, plate down; no segment. */
  melee(inCone, reach, kind) {
    if (!this.active || this.state === 'enter') return false;
    const dir = inCone(this.x, this.z, reach + GUNNER.radius);
    if (!dir) return false;
    this.x += dir.x * 0.3;
    this.z += dir.z * 0.3;
    this.stagger(kind === 'smash' ? GUNNER.stagger.smash : GUNNER.stagger.kick, kind === 'smash' ? '鑊擊中重炮：鋼板垂下' : '踢得重炮一個踉蹌');
    return true;
  }

  rammed(x, z, r) {
    return this.active && this.state !== 'enter' && Math.hypot(x - this.x, z - this.z) <= GUNNER.radius + r + 0.1;
  }

  /** A blast beside him takes a segment and staggers him. */
  blast(x, z, opts = {}) {
    if (!this.active || this.state === 'enter' || Math.hypot(x - this.x, z - this.z) > GUNNER.blast) return;
    this.flash = 1;
    this.hits = 0;
    this.hurt(opts.rocket ? '被火箭油桶炸中' : '被炸到');
    if (this.active) this.stagger(GUNNER.stagger.blast);
  }

  /** His partner down (a duo): his shells come half as often again. */
  enrage() {
    this.raging = true;
  }

  /** The last segment: he goes down where he stands. */
  goDown() {
    const g = this.game;
    this.state = 'down';
    this.endSweep();
    g.fx.flash(this.x, 1.4, this.z, 0xff8a2a, 40, 0.4, 10);
    g.fx.blood(this.x, 1, this.z, 0, 0, 20);
    g.notes.log('重炮倒下');
    g.hud.banner('BOSS DOWN', '重炮倒下了', 'clear');
    this.finish();
    this.sync();
  }

  /** Where he is drawn: the walk, the plate (tilted forward when he staggers), his red line, down on the ground at the end. */
  sync() {
    const g = this.game;
    const r = this.rig;
    const S = this.state;
    r.root.position.set(this.x, g.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    setFlash(r, this.flash * 2.5);
    this.plateMats[0].emissiveIntensity = this.plateFlash * 1.5;
    r.ring.material.color.setRGB(this.gunState === 'idle' && this.wallState === 'idle' ? 1 : 2.2, 0.35, 0.08);
    if (this.gunState === 'warn' && this.lock) this.laser.set(this.x, this.z, this.lock.x, this.lock.z, 0.07, 1.5 + 2 * clamp(1 - this.gunTimer / GUNNER.gun.warn, 0, 1), GUN_Y);
    else if (this.gunState === 'fire') this.laser.set(this.x, this.z, this.x + Math.sin(this.lineA) * GUNNER.gun.range, this.z + Math.cos(this.lineA) * GUNNER.gun.range, 0.05, 3, GUN_Y);
    else this.laser.hide();
    if (!g.style.poseDue(r, g.worldTime)) return;
    const walking = S === 'enter' || (S === 'walk' && this.path);
    animateRig(r, this.phase, walking ? 1 : 0, this.facing);
    this.plate.rotation.x = S === 'stagger' ? 1.1 : S === 'down' ? 1.5 : 0;
    r.inner.rotation.x = S === 'down' ? 1.45 : S === 'stagger' ? -0.25 : 0;
    r.inner.position.y = S === 'down' ? 0.15 : 0;
    finishRig(r, g.worldTime);
  }
}

/** Senado's marksman: a long gun from one of the map's posts, his red line the warning; between posts, in the open. */
class Marksman extends Boss {
  constructor(game) {
    super(game, MARKSMAN);
    this.rig = null;
    this.reset();
  }

  reset() {
    if (this.rig) {
      const g = this.game;
      g.scene.remove(this.rig.root);
      disposeRig(this.rig);
      this.laser.dispose(g.scene);
      this.rig = null;
    }
    super.reset();
    this.state = 'idle';
  }

  /** His wave: `def` is the map's (maps.js `boss`: `from` a street's mouth, `posts` where he shoots from, the first his first). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    this.posts = def.posts.map(([x, z]) => ({ x, z }));
    this.target = this.posts[0];
    this.x = def.from[0];
    this.z = def.from[1];
    this.facing = angleTo(this.x, this.z, this.target.x, this.target.z);
    this.state = 'enter'; // enter, post (his line swings onto the player), lock (it stands still), cycle (the bolt), move, stagger, down
    this.lineA = this.facing; // where his line points
    this.lineT = 0; // s before his line is up, at a post
    this.timer = 0;
    this.shots = 0; // rounds from this post
    this.lostT = 0; // s his line has been broken
    this.moveT = 0; // s on the way to the next post
    this.hits = 0; // towards the next segment
    this.path = null;
    this.pathT = 0;
    this.phase = 0;
    this.flash = 0;
    this.firstLine = true;
    this.raging = false; // his partner down (a duo): enrage
    this.build();
  }

  /** The look: the rifleman's rig a size up in a dark coat, the long rifle, his red line. */
  build() {
    const g = this.game;
    this.rig = buildCharacter({ body: 0x23262c, pants: 0x15171b, accent: 0xff3030, hair: 0x101010, weapon: 'sniper', scale: 1.1, ring: 0.45, model: 'rifle' });
    this.laser = new Laser(g.scene, 0xff1a1a, true); // painted on, not added: Senado's paving is white
    g.scene.add(this.rig.root);
    this.sync();
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    switch (this.state) {
      case 'enter':
        if (this.walkTo(this.target, MARKSMAN.enter, dt, false)) this.arrive();
        break;
      case 'move':
        this.moveT += dt;
        if (this.walkTo(this.target, MARKSMAN.speed, dt, true)) this.arrive();
        else if (this.moveT > MARKSMAN.move.giveUp) this.moveOn();
        break;
      case 'post':
        this.aim(dt);
        break;
      case 'lock':
        this.timer -= dt;
        if (!this.lineClear()) {
          this.state = 'post';
          g.notes.log('白鴿驚起，擋住長槍手的紅線');
        } else if (this.timer <= 0) {
          this.fire();
          this.state = 'cycle';
          this.timer = MARKSMAN.line.cycle;
        }
        break;
      case 'cycle':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.shots >= MARKSMAN.move.shots + (this.raging ? 1 : 0) && !this.holding) this.moveOn('長槍手開完槍，換位');
          else this.state = 'post';
        }
        break;
      case 'stagger':
        this.timer -= dt;
        if (this.timer <= 0) this.moveOn();
        break;
    }
    if (this.state !== 'enter' && this.state !== 'down') {
      g.level.collideCircle(this, MARKSMAN.radius);
      this.bowled();
    }
    this.sync();
  }

  /** A step towards `to` (along the nav grid if `nav`); true on arrival. */
  walkTo(to, speed, dt, nav) {
    const L = this.game.level;
    let w = to;
    if (nav) {
      this.pathT -= dt;
      if (!this.path || this.pathT <= 0) {
        this.path = L.nav.findPath(this.x, this.z, to.x, to.z) || [{ x: to.x, z: to.z }];
        this.pathT = 0.6;
      }
      while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 0.5) this.path.shift();
      w = this.path[0];
    }
    const d = Math.hypot(w.x - this.x, w.z - this.z);
    const step = Math.min(speed * dt, d);
    if (d > 1e-4) {
      this.facing = angleTo(this.x, this.z, w.x, w.z);
      this.x += Math.sin(this.facing) * step;
      this.z += Math.cos(this.facing) * step;
    }
    this.phase += dt * speed * 2.2;
    return Math.hypot(to.x - this.x, to.z - this.z) < 0.3;
  }

  /** At a post: his line comes up along the way he came, and has to swing round to the player. */
  arrive() {
    this.state = 'post';
    this.path = null;
    this.lineA = this.facing;
    this.lineT = MARKSMAN.line.first;
    this.shots = 0;
    this.lostT = 0;
  }

  /** At a post: the line swings onto the player; on him and clear, it stops (lock); broken too long, or the player too near or far, he moves on. */
  aim(dt) {
    const g = this.game;
    const p = g.player;
    const M = MARKSMAN;
    if (!p.alive) return;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (dist < M.move.near) return this.moveOn('長槍手被逼近，換位');
    if (dist > M.move.far) return this.moveOn('長槍手換位追上');
    this.lineT -= dt;
    if (this.lineT > 0) return;
    const want = angleTo(this.x, this.z, p.x, p.z);
    this.lineA = turnTowards(this.lineA, want, M.line.track * (this.raging ? 1.5 : 1) * dt);
    this.facing = this.lineA;
    const clear = dist < M.line.range && g.level.hasLOS(this.x, this.z, p.x, p.z) && !g.level.flockBlocks(this.x, this.z, p.x, p.z);
    this.lostT = clear ? 0 : this.lostT + dt;
    if (this.lostT >= M.move.lost && !this.holding) return this.moveOn('長槍手看不到你，換位');
    if (clear && Math.abs(wrapAngle(want - this.lineA)) <= M.line.on && this.mayTell()) this.lock();
  }

  /** The line stops on the player: `warn` s, then the round. */
  lock() {
    const g = this.game;
    const p = g.player;
    this.state = 'lock';
    this.timer = MARKSMAN.line.warn;
    this.lineA = this.facing = angleTo(this.x, this.z, p.x, p.z);
    g.audio.aimWarn(g.panFor(this.x));
    if (this.firstLine && !this.team) {
      this.firstLine = false;
      g.hud.banner('MARKSMAN', '紅線停住一秒就開槍：躲到柱後，或者射驚白鴿', 'clear');
    }
  }

  /** How far his line reaches: to the first solid along it, or its range. */
  lineLength() {
    return this.game.level.rayLength(this.x, this.z, Math.sin(this.lineA), Math.cos(this.lineA), MARKSMAN.line.range);
  }

  /** The stopped line still holds: no flock has burst into the air across it. */
  lineClear() {
    const n = this.lineLength();
    return !this.game.level.flockBlocks(this.x, this.z, this.x + Math.sin(this.lineA) * n, this.z + Math.cos(this.lineA) * n);
  }

  /** The round, down the line. */
  fire() {
    const g = this.game;
    const M = MARKSMAN.line;
    const dx = Math.sin(this.lineA);
    const dz = Math.cos(this.lineA);
    // the source is the boss as the game sees it (game.boss): its label names the bullets that hit
    g.bullets.spawn({ x: this.x + dx * 0.8, z: this.z + dz * 0.8, dx, dz, speed: M.speed, owner: 'enemy', damage: M.dmg, range: M.range, source: this.team ? this : g.boss });
    g.audio.shot('sniper', g.panFor(this.x));
    this.shots++;
  }

  /** On to another post: one MARKSMAN.move.band m from the player, seeing him if it can, the nearer of those; `why` for the notes. */
  moveOn(why) {
    const g = this.game;
    const p = g.player;
    const [lo, hi] = MARKSMAN.move.band;
    let best = null;
    let bs = -Infinity;
    for (const q of this.posts) {
      if (q === this.target) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      let s = -Math.abs(d - (lo + hi) / 2) * 0.5 - Math.hypot(q.x - this.x, q.z - this.z) * 0.3;
      if (d < lo || d > hi) s -= 20;
      if (g.level.hasLOS(q.x, q.z, p.x, p.z)) s += 6;
      if (s > bs) {
        bs = s;
        best = q;
      }
    }
    this.target = best || this.target;
    this.state = 'move';
    this.path = null;
    this.moveT = 0;
    if (why) g.notes.log(why);
  }

  /** Open to the player once he is in: at his posts and on the move between them. */
  vulnerable() {
    return this.active && this.state !== 'enter';
  }

  /** One of a duo with the combo due (Duo): he keeps his post for it (but for a player at close quarters). */
  get holding() {
    return !!this.team && !this.team.raged && this.team.comboT <= 0;
  }

  /** Free for a combo: at a post with his line up. Like the gunner's, his part needs no clear line: cover between is the player's. */
  comboReady() {
    return this.active && this.state === 'post' && this.lineT <= 0 && this.game.player.alive;
  }

  /** His part of a combo: the line straight onto the player, stopped there now. */
  combo() {
    this.lock();
  }

  /** His partner down (a duo): his line swings faster and he fires once more from each post. */
  enrage() {
    this.raging = true;
  }

  /** A thug kicked into him knocks him off balance. */
  bowled() {
    for (const e of this.game.enemies.list) {
      if (e.stunT <= 0) {
        e.bowledBoss = false;
        continue;
      }
      if (!e.alive || e.bowledBoss || e.cfg.fly || Math.hypot(e.vx, e.vz) < MARKSMAN.bowl) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) > MARKSMAN.radius + e.radius + 0.15) continue;
      e.bowledBoss = true;
      e.vx *= 0.2;
      e.vz *= 0.2;
      this.game.audio.kick(true);
      this.stagger('打手撞到長槍手身上');
    }
  }

  /** He reels `MARKSMAN.stagger` s, his line down; then he moves on. */
  stagger(how) {
    if (!this.active || this.state === 'enter') return;
    this.state = 'stagger';
    this.timer = MARKSMAN.stagger;
    this.flash = 1;
    if (how) this.game.notes.log(how);
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active || this.state === 'enter') return null; // on his way in the shot flies past
    const t = segCircle(x0, z0, x1, z1, this.x, this.z, MARKSMAN.radius);
    return t < 0 ? null : { t, part: 'body' };
  }

  shot(b) {
    const g = this.game;
    this.flash = 1;
    g.fx.blood(b.x, GUN_Y, b.z, b.dx, b.dz, 8);
    g.audio.flesh(g.panFor(b.x));
    if (++this.hits >= MARKSMAN.perSegment) {
      this.hits = 0;
      this.hurt(this.state === 'move' ? '換位時中彈' : '中彈');
    }
    return true;
  }

  /** The player's kick or pan smash (player.js): he staggers, and moves on after; no segment. */
  melee(inCone, reach, kind) {
    if (!this.active || this.state === 'enter') return false;
    const dir = inCone(this.x, this.z, reach + MARKSMAN.radius);
    if (!dir) return false;
    this.x += dir.x * 0.4;
    this.z += dir.z * 0.4;
    this.stagger(kind === 'smash' ? '鑊擊中長槍手' : '踢中長槍手');
    return true;
  }

  rammed(x, z, r) {
    return this.active && this.state !== 'enter' && Math.hypot(x - this.x, z - this.z) <= MARKSMAN.radius + r + 0.1;
  }

  /** A blast beside him takes a segment and staggers him. */
  blast(x, z, opts = {}) {
    if (!this.active || this.state === 'enter' || Math.hypot(x - this.x, z - this.z) > MARKSMAN.blast) return;
    this.flash = 1;
    this.hits = 0;
    this.hurt(opts.rocket ? '被火箭油桶炸中' : '被炸到');
    if (this.active) this.stagger();
  }

  /** The last segment: he goes down where he stands. */
  goDown() {
    const g = this.game;
    this.state = 'down';
    g.fx.blood(this.x, 1, this.z, 0, 0, 16);
    g.notes.log('長槍手倒下');
    g.hud.banner('BOSS DOWN', '長槍手倒下了', 'clear');
    this.finish();
    this.sync();
  }

  /** Where he is drawn, and his line: faint while it swings, bright and growing once it stops. */
  sync() {
    const g = this.game;
    const r = this.rig;
    const S = this.state;
    r.root.position.set(this.x, g.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    setFlash(r, this.flash * 2.5);
    const up = (S === 'post' && this.lineT <= 0) || S === 'lock';
    if (up) {
      const n = this.lineLength();
      const k = S === 'lock' ? clamp(1 - this.timer / MARKSMAN.line.warn, 0, 1) : 0;
      this.laser.set(this.x, this.z, this.x + Math.sin(this.lineA) * n, this.z + Math.cos(this.lineA) * n, S === 'lock' ? 0.1 + 0.06 * k : 0.05, S === 'lock' ? 1.5 + 2.5 * k : 0.8, GUN_Y);
    } else this.laser.hide();
    r.ring.material.color.setRGB(S === 'lock' ? 2.2 : 1, 0.3, 0.1);
    if (!g.style.poseDue(r, g.worldTime)) return;
    const walking = S === 'enter' || S === 'move';
    animateRig(r, this.phase, walking ? 1 : 0, this.facing);
    r.inner.rotation.x = S === 'down' ? 1.45 : S === 'stagger' ? -0.25 : 0;
    r.inner.position.y = S === 'down' ? 0.15 : 0;
    finishRig(r, g.worldTime);
  }
}

/** Senado's shotgunner, the marksman's partner: after the player, a braced blast at close range, a rush for the combo. */
class Buckshot extends Boss {
  constructor(game) {
    super(game, BUCKSHOT);
    this.rig = null;
    this.reset();
  }

  reset() {
    if (this.rig) {
      const g = this.game;
      g.scene.remove(this.rig.root);
      disposeRig(this.rig);
      for (const l of this.fan) l.dispose(g.scene);
      this.rig = null;
    }
    super.reset();
    this.state = 'idle';
  }

  /** His wave: `def` is the map's (`from` his street's mouth, `at` just inside). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    this.at = { x: def.at[0], z: def.at[1] };
    this.x = def.from[0];
    this.z = def.from[1];
    this.facing = angleTo(this.x, this.z, this.at.x, this.at.z);
    this.state = 'enter'; // enter, chase, tell (braced, the fan), pump, windup, rush, brace (the combo's), stagger, down
    this.timer = 0;
    this.gunT = BUCKSHOT.gun.first;
    this.aimA = 0; // where the blast goes
    this.rushTo = null;
    this.rushV = 0;
    this.rushT = 0; // s since his part of the combo began
    this.hits = 0;
    this.path = null;
    this.pathT = 0;
    this.phase = 0;
    this.flash = 0;
    this.raging = false;
    this.build();
  }

  /** The look: the shotgunner's rig a size up, a pale shirt, the shotgun; his fan of three lines. */
  build() {
    const g = this.game;
    this.rig = buildCharacter({ body: 0xd8cfc0, pants: 0x2a2620, accent: 0xff7a1a, hair: 0x1a1410, weapon: 'shotgun', scale: 1.2, ring: 0.5, model: 'shotgun' });
    this.fan = [0, 1, 2].map(() => new Laser(g.scene, 0xff5a10, true)); // painted on: Senado's paving is white
    g.scene.add(this.rig.root);
    this.sync();
  }

  /** One logic step. */
  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const p = g.player;
    const B = BUCKSHOT;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.timer -= dt;
    switch (this.state) {
      case 'enter': {
        const d = Math.hypot(this.at.x - this.x, this.at.z - this.z);
        const step = Math.min(B.enter * dt, d);
        this.facing = angleTo(this.x, this.z, this.at.x, this.at.z);
        this.x += Math.sin(this.facing) * step;
        this.z += Math.cos(this.facing) * step;
        this.phase += dt * B.enter * 2.2;
        if (d <= 0.05) this.state = 'chase';
        break;
      }
      case 'chase':
        this.chase(dt);
        break;
      case 'tell':
        if (this.timer <= 0) this.fire();
        break;
      case 'pump':
      case 'stagger':
        if (this.timer <= 0) this.state = 'chase';
        break;
      case 'windup':
        this.rushT += dt;
        this.facing = angleTo(this.x, this.z, this.rushTo.x, this.rushTo.z);
        if (this.timer <= 0) this.state = 'rush';
        break;
      case 'rush': {
        // straight at the spot; a player still on it, he stops short of
        this.rushT += dt;
        const d = Math.hypot(this.rushTo.x - this.x, this.rushTo.z - this.z);
        const step = Math.min(this.rushV * dt, d);
        this.facing = angleTo(this.x, this.z, this.rushTo.x, this.rushTo.z);
        this.x += Math.sin(this.facing) * step;
        this.z += Math.cos(this.facing) * step;
        this.phase += dt * this.rushV * 1.6;
        if (d <= 0.05 || (p.alive && Math.hypot(p.x - this.x, p.z - this.z) <= B.rush.short) || this.rushT > B.rush.windup + B.rush.time + 0.5) {
          // there (or as near as he gets): braced till the marksman's round has come, a beat after the rush was due
          this.state = 'brace';
          this.timer = Math.max(B.rush.brace, B.rush.windup + B.rush.time + B.rush.brace - this.rushT);
          this.aimA = this.facing = angleTo(this.x, this.z, p.x, p.z);
          g.notes.log('散彈手衝到');
        }
        break;
      }
      case 'brace':
        this.aimA = this.facing = angleTo(this.x, this.z, p.x, p.z);
        if (this.timer <= 0) this.fire();
        break;
    }
    if (this.state !== 'enter' && this.state !== 'down') {
      g.level.collideCircle(this, B.radius);
      this.bowled();
    }
    this.sync();
  }

  /** After the player on the nav grid; near enough, in sight and free to warn, the brace (tell). */
  chase(dt) {
    const g = this.game;
    const L = g.level;
    const p = g.player;
    const B = BUCKSHOT;
    if (!p.alive) return;
    this.gunT -= dt;
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    if (this.gunT <= 0 && dist <= B.gun.reach && L.hasLOS(this.x, this.z, p.x, p.z) && this.mayTell()) {
      this.state = 'tell';
      this.timer = B.gun.tell;
      this.aimA = this.facing = angleTo(this.x, this.z, p.x, p.z); // the fan where the player stands now: step out of it
      g.audio.aimWarn(g.panFor(this.x));
      return;
    }
    this.facing = turnTowards(this.facing, angleTo(this.x, this.z, p.x, p.z), 6 * dt);
    if (dist < 2.5) return; // close enough: he stands and turns
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0) {
      this.path = L.nav.findPath(this.x, this.z, p.x, p.z) || [{ x: p.x, z: p.z }];
      this.pathT = 0.4;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 0.5) this.path.shift();
    const w = this.path[0];
    const a = angleTo(this.x, this.z, w.x, w.z);
    this.x += Math.sin(a) * B.speed * dt;
    this.z += Math.cos(a) * B.speed * dt;
    this.phase += dt * B.speed * 2.2;
  }

  /** The blast across the fan; then the slide (pump), the moment to get him. */
  fire() {
    const g = this.game;
    const G = BUCKSHOT.gun;
    for (let i = 0; i < G.pellets; i++) {
      const a = this.aimA + (G.pellets > 1 ? i / (G.pellets - 1) - 0.5 : 0) * 2 * G.spread;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      g.bullets.spawn({ x: this.x + dx * 0.8, z: this.z + dz * 0.8, dx, dz, speed: G.speed, owner: 'enemy', damage: G.dmg, range: G.range, source: this.team ? this : g.boss });
    }
    g.audio.shot('shotgun', g.panFor(this.x));
    this.state = 'pump';
    this.timer = G.pump * (this.raging ? 0.7 : 1);
    this.gunT = G.every * (this.raging ? 0.6 : 1);
  }

  vulnerable() {
    return this.active && this.state !== 'enter';
  }

  /** Free for a combo: after the player, not mid-blast. */
  comboReady() {
    return this.active && this.state === 'chase' && this.game.player.alive;
  }

  /** His part of a combo: a rush onto the spot the player stands on now, to be there as the marksman's round comes. */
  combo() {
    const g = this.game;
    const p = g.player;
    const R = BUCKSHOT.rush;
    this.rushTo = { x: p.x, z: p.z };
    this.rushV = clamp(Math.hypot(p.x - this.x, p.z - this.z) / R.time, BUCKSHOT.speed, R.max);
    this.rushT = 0;
    this.state = 'windup';
    this.timer = R.windup;
    this.path = null;
    g.notes.log('散彈手衝向紅線');
  }

  /** His partner down (a duo): he blasts more often and pumps quicker. */
  enrage() {
    this.raging = true;
  }

  /** A thug kicked into him knocks him off balance. */
  bowled() {
    for (const e of this.game.enemies.list) {
      if (e.stunT <= 0) {
        e.bowledBoss = false;
        continue;
      }
      if (!e.alive || e.bowledBoss || e.cfg.fly || Math.hypot(e.vx, e.vz) < BUCKSHOT.bowl) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) > BUCKSHOT.radius + e.radius + 0.15) continue;
      e.bowledBoss = true;
      e.vx *= 0.2;
      e.vz *= 0.2;
      this.game.audio.kick(true);
      this.stagger('打手撞到散彈手身上');
    }
  }

  stagger(how) {
    if (!this.active || this.state === 'enter') return;
    this.state = 'stagger';
    this.timer = BUCKSHOT.stagger;
    this.flash = 1;
    this.path = null;
    if (how) this.game.notes.log(how);
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active || this.state === 'enter') return null;
    const t = segCircle(x0, z0, x1, z1, this.x, this.z, BUCKSHOT.radius);
    return t < 0 ? null : { t, part: 'body' };
  }

  /** A shot on him: perSegment to a segment; his partner's round, one outright (the duo scores it: CROSSFIRE). */
  shot(b) {
    const g = this.game;
    this.flash = 1;
    g.fx.blood(b.x, GUN_Y, b.z, b.dx, b.dz, 8);
    g.audio.flesh(g.panFor(b.x));
    if (this.team && b.source && b.source !== this && b.source.team === this.team) {
      this.hits = 0;
      this.hurt('被長槍手誤中');
      if (this.active) this.stagger();
      return true;
    }
    if (++this.hits >= BUCKSHOT.perSegment) {
      this.hits = 0;
      this.hurt(this.state === 'pump' ? '上膛時中彈' : '中彈');
    }
    return true;
  }

  melee(inCone, reach, kind) {
    if (!this.active || this.state === 'enter') return false;
    const dir = inCone(this.x, this.z, reach + BUCKSHOT.radius);
    if (!dir) return false;
    this.x += dir.x * 0.4;
    this.z += dir.z * 0.4;
    this.stagger(kind === 'smash' ? '鑊擊中散彈手' : '踢中散彈手');
    return true;
  }

  rammed(x, z, r) {
    return this.active && this.state !== 'enter' && Math.hypot(x - this.x, z - this.z) <= BUCKSHOT.radius + r + 0.1;
  }

  blast(x, z, opts = {}) {
    if (!this.active || this.state === 'enter' || Math.hypot(x - this.x, z - this.z) > BUCKSHOT.blast) return;
    this.flash = 1;
    this.hits = 0;
    this.hurt(opts.rocket ? '被火箭油桶炸中' : '被炸到');
    if (this.active) this.stagger();
  }

  goDown() {
    const g = this.game;
    this.state = 'down';
    g.fx.blood(this.x, 1, this.z, 0, 0, 16);
    g.notes.log('散彈手倒下');
    this.finish();
    this.sync();
  }

  /** Where he is drawn; braced, his fan of three lines on the floor, brighter as the blast comes; the rush's line to the spot. */
  sync() {
    const g = this.game;
    const r = this.rig;
    const S = this.state;
    const G = BUCKSHOT.gun;
    r.root.position.set(this.x, g.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    setFlash(r, this.flash * 2.5);
    if (S === 'tell' || S === 'brace') {
      const k = S === 'tell' ? clamp(1 - this.timer / G.tell, 0, 1) : 1;
      this.fan.forEach((l, i) => {
        const a = this.aimA + (i - 1) * G.spread;
        const n = g.level.rayLength(this.x, this.z, Math.sin(a), Math.cos(a), G.range);
        l.set(this.x, this.z, this.x + Math.sin(a) * n, this.z + Math.cos(a) * n, 0.06 + 0.05 * k, 1.5 + 2.5 * k, 0.05);
      });
    } else if (S === 'windup' && this.rushTo) {
      this.fan[0].set(this.x, this.z, this.rushTo.x, this.rushTo.z, 0.12, 2.5, 0.05); // where he will run: on the floor
      this.fan[1].hide();
      this.fan[2].hide();
    } else for (const l of this.fan) l.hide();
    r.ring.material.color.setRGB(S === 'tell' || S === 'brace' || S === 'windup' ? 2.2 : 1, 0.4, 0.1);
    if (!g.style.poseDue(r, g.worldTime)) return;
    const walking = S === 'enter' || S === 'chase' || S === 'rush';
    animateRig(r, this.phase, walking ? 1 : 0, this.facing);
    r.inner.rotation.x = S === 'down' ? 1.45 : S === 'stagger' ? -0.25 : S === 'windup' ? 0.3 : 0;
    r.inner.position.y = S === 'down' ? 0.15 : S === 'windup' ? -0.12 : 0;
    finishRig(r, g.worldTime);
  }
}

/** 大三巴's shield man: a big shield before him, his back the way in; a bash up close, a revolver further off. */
class Bulwark extends Boss {
  constructor(game) {
    super(game, BULWARK);
    this.rig = null;
    this.reset();
  }

  reset() {
    if (this.rig) {
      const g = this.game;
      g.scene.remove(this.rig.root);
      disposeRig(this.rig);
      this.shieldMat.dispose();
      this.shieldLit.dispose();
      this.laser.dispose(g.scene);
      this.rig = null;
    }
    super.reset();
    this.state = 'idle';
  }

  /** His wave: `def` is the map's (maps.js `boss`: `from` behind the façade, `at` on the terrace before it). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    this.x = def.from[0];
    this.z = def.from[1];
    this.at = { x: def.at[0], z: def.at[1] };
    this.facing = angleTo(this.x, this.z, this.at.x, this.at.z);
    this.state = 'enter'; // enter, chase, aim (the revolver's line), brace, bash, spent, stagger, down; 'stand' holds him (tests)
    this.timer = 0;
    this.bashT = BULWARK.bash.first;
    this.gunT = BULWARK.gun.first;
    this.shots = 0;
    this.lock = null;
    this.bashDir = [0, 0];
    this.bashHit = false;
    this.seen = null; // where he last saw the player
    this.unseen = 0; // s since he last saw him
    this.searching = false; // on his way to `seen`, the player lost
    this.searchT = 0;
    this.lookT = 0; // s left looking round, there
    this.hits = 0;
    this.blocked = 0; // shots his shield has turned aside (tests)
    this.blockLogT = 0;
    this.path = null;
    this.pathTo = null;
    this.pathT = 0;
    this.phase = 0;
    this.flash = 0;
    this.lit = 0; // the shield's glow, braced for the bash
    this.firstBrace = true;
    this.raging = false;
    this.build();
  }

  /** The look: the brute's rig a size up, a tall shield before him with a band of light, his red line. */
  build() {
    const g = this.game;
    this.rig = buildCharacter({ body: 0x2d3038, pants: 0x1c1e24, accent: 0xffb02a, hair: 0x22242a, weapon: 'pistol', scale: 1.3, ring: 0.55, model: 'brute' });
    this.shieldMat = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.4, metalness: 0.6, emissive: 0xffb02a, emissiveIntensity: 0 });
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.75, 0.1), this.shieldMat);
    shield.position.set(0, 0.95, 0.55);
    shield.castShadow = true;
    this.rig.inner.add(shield);
    g.style.dress(shield);
    this.shieldLit = shield.material; // its toon twin (style.js) once dressed: the one whose glow shows
    this.shield = shield;
    this.laser = new Laser(g.scene, 0xff2020);
    g.scene.add(this.rig.root);
    this.sync();
  }

  /** His shield is up: not after a bash, not reeling. */
  get shieldUp() {
    return this.active && this.state !== 'spent' && this.state !== 'stagger' && this.state !== 'down';
  }

  update(dt) {
    if (!this.active) return;
    const g = this.game;
    const L = g.level;
    const p = g.player;
    const B = BULWARK;
    this.t += dt;
    this.timer -= dt;
    this.blockLogT -= dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.lit = this.state === 'brace' ? Math.min(1, this.lit + dt * 3) : Math.max(0, this.lit - dt * 4);
    this.lookT -= dt;
    if (p.alive && L.hasLOS(this.x, this.z, p.x, p.z) && L.sameLevel(this.x, this.z, p.x, p.z)) {
      // searching he notices the player only right before his shield
      if (this.searching && Math.hypot(p.x - this.x, p.z - this.z) <= B.bash.reach && Math.abs(wrapAngle(angleTo(this.x, this.z, p.x, p.z) - this.facing)) <= (B.shield * Math.PI) / 180) this.alert();
      if (!this.searching) {
        this.unseen = 0;
        this.seen = { x: p.x, z: p.z };
      }
    } else {
      this.unseen += dt;
      if (this.state === 'chase' && !this.searching && this.seen && this.unseen > B.lost.after) {
        this.searching = true;
        this.searchT = B.lost.search;
        this.path = null;
        g.notes.log('鐵盾跟丟了人');
      }
    }
    switch (this.state) {
      case 'enter': {
        const d = Math.hypot(this.at.x - this.x, this.at.z - this.z);
        const step = Math.min(B.enter * dt, d);
        this.facing = angleTo(this.x, this.z, this.at.x, this.at.z);
        this.x += Math.sin(this.facing) * step;
        this.z += Math.cos(this.facing) * step;
        this.phase += dt * B.enter * 2.2;
        if (d <= 0.05) this.state = 'chase';
        break;
      }
      case 'chase':
        this.chase(dt);
        break;
      case 'aim':
        // the red line onto where the player stood; then the rounds down it
        if (this.timer <= 0 && this.shots > 0) {
          this.fire();
          this.shots--;
          this.timer = this.shots > 0 ? B.gun.interval : 0.3;
        } else if (this.timer <= 0) {
          this.lock = null;
          this.state = 'chase';
        }
        break;
      case 'brace':
        if (this.timer <= 0) {
          this.state = 'bash';
          this.timer = B.bash.time;
          this.bashDir = [Math.sin(this.facing), Math.cos(this.facing)];
          this.bashHit = false;
          g.audio.kick(true);
        }
        break;
      case 'bash': {
        const v = B.bash.dist / B.bash.time;
        const [dx, dz] = this.bashDir;
        const x0 = this.x;
        const z0 = this.z;
        this.x += dx * v * dt;
        this.z += dz * v * dt;
        L.collideCircle(this, B.radius);
        const stopped = Math.hypot(this.x - x0, this.z - z0) < v * dt * 0.3; // into a wall
        if (!this.bashHit && p.alive && Math.hypot(p.x - this.x, p.z - this.z) < B.radius + 0.5) {
          this.bashHit = true;
          if (p.hurt(B.bash.dmg, dx, dz, false, '鐵盾撞飛')) {
            p.vx += dx * B.bash.knock;
            p.vz += dz * B.bash.knock;
            g.shake(0.35);
          }
        }
        if (this.timer <= 0 || stopped) {
          this.state = 'spent';
          this.timer = B.bash.spent;
          this.bashT = B.bash.every * (this.raging ? 0.6 : 1);
        }
        break;
      }
      case 'spent':
      case 'stagger':
        if (this.timer <= 0) this.state = 'chase';
        break;
    }
    if (this.state !== 'enter' && this.state !== 'down') {
      if (this.state !== 'bash') L.collideCircle(this, B.radius);
      this.rolled();
      this.bowled();
      this.shove();
    }
    this.sync();
  }

  /**
   * After the player on the nav grid, his shield turned slowly onto him while he sees him. Out of sight (behind the
   * façade) more than lost.after s, he goes to where he last saw him, facing the way he walks and paying the player no
   * heed (unless right before his shield, or shot), and there looks round lost.look s; then on after him. So a player
   * who goes in by one doorway and out by another comes out at his side or his back. The bash and the revolver.
   */
  chase(dt) {
    const g = this.game;
    const L = g.level;
    const p = g.player;
    const B = BULWARK;
    if (!p.alive) return;
    this.bashT -= dt;
    this.gunT -= dt;
    const turn = B.turn * (this.raging ? 1.3 : 1) * dt;
    if (this.searching) {
      this.searchT -= dt;
      if (Math.hypot(this.seen.x - this.x, this.seen.z - this.z) > 0.6 && this.searchT > 0) return this.walk(this.seen, dt, turn);
      this.searching = false;
      this.seen = null;
      this.path = null;
      this.lookT = B.lost.look;
    }
    if (this.lookT > 0) return; // looking round for him
    const dist = Math.hypot(p.x - this.x, p.z - this.z);
    const sight = L.hasLOS(this.x, this.z, p.x, p.z) && L.sameLevel(this.x, this.z, p.x, p.z);
    if (sight) {
      this.facing = turnTowards(this.facing, angleTo(this.x, this.z, p.x, p.z), turn);
      const off = Math.abs(wrapAngle(angleTo(this.x, this.z, p.x, p.z) - this.facing));
      if (dist <= B.bash.reach && this.bashT <= 0 && off <= (B.bash.aim * Math.PI) / 180 && this.mayTell()) return this.brace();
      if (dist > B.bash.reach && dist < B.gun.range && this.gunT <= 0 && this.mayTell()) return this.aim();
      if (dist < B.near) return;
    }
    this.walk(p, dt, sight ? 0 : turn); // out of sight, on after him all the same: he hears where he went
  }

  /** A step along the nav grid to `to`, turning `turn` rad towards the way he walks. */
  walk(to, dt, turn) {
    const L = this.game.level;
    const B = BULWARK;
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0 || Math.hypot(to.x - this.pathTo.x, to.z - this.pathTo.z) > 1) {
      this.path = L.nav.findPath(this.x, this.z, to.x, to.z) || [{ x: to.x, z: to.z }];
      this.pathTo = { x: to.x, z: to.z };
      this.pathT = 0.4;
    }
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.x, this.path[0].z - this.z) < 0.5) this.path.shift();
    const w = this.path[0];
    const a = angleTo(this.x, this.z, w.x, w.z);
    this.x += Math.sin(a) * B.speed * dt;
    this.z += Math.cos(a) * B.speed * dt;
    this.phase += dt * B.speed * 2.2;
    this.facing = turnTowards(this.facing, a, turn);
  }

  /** Shot, kicked, knocked about, or the player right before him: he knows where the player is again. */
  alert() {
    const p = this.game.player;
    this.searching = false;
    this.lookT = 0;
    this.unseen = 0;
    this.seen = { x: p.x, z: p.z };
    this.path = null;
  }

  /** The bash's wind-up: he plants his feet behind the shield, lit. */
  brace() {
    const g = this.game;
    this.state = 'brace';
    this.timer = BULWARK.bash.tell;
    this.path = null;
    g.audio.aimWarn(g.panFor(this.x));
    if (this.firstBrace && !this.team) {
      this.firstBrace = false;
      g.hud.banner('BULWARK', '正面打不穿：由門洞繞到他背後，或者由石階頂滾個油桶落去', 'clear');
    }
  }

  /** The revolver: a red line onto where the player stands. */
  aim() {
    const g = this.game;
    const p = g.player;
    this.state = 'aim';
    this.timer = BULWARK.gun.warn;
    this.shots = BULWARK.gun.shots;
    this.lock = { x: p.x, z: p.z };
    this.gunT = BULWARK.gun.every;
    g.audio.aimWarn(g.panFor(this.x));
  }

  fire() {
    const g = this.game;
    const G = BULWARK.gun;
    const a = angleTo(this.x, this.z, this.lock.x, this.lock.z);
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    // round the shield's edge: from his right hand
    const sx = this.x + Math.cos(this.facing) * 0.6 + dx * 0.6;
    const sz = this.z - Math.sin(this.facing) * 0.6 + dz * 0.6;
    g.bullets.spawn({ x: sx, z: sz, dx, dz, speed: G.speed, owner: 'enemy', damage: G.dmg, range: G.range, source: this.team ? this : g.boss });
    g.audio.shot('pistol', g.panFor(this.x));
  }

  vulnerable() {
    return this.active && this.state !== 'enter';
  }

  /** A barrel rolling down the steps into him (level.js Barrel, rolling) bowls him over: a segment, ROLLING, his shield down. */
  rolled() {
    const g = this.game;
    for (const b of g.level.barrels) {
      if (!b.rolling) {
        b.rolledBoss = false;
        continue;
      }
      if (!b.alive || b.rolledBoss || Math.hypot(b.vx, b.vz) < BULWARK.roll) continue;
      if (Math.hypot(b.x - this.x, b.z - this.z) > BULWARK.radius + 0.55) continue;
      b.rolledBoss = true;
      b.vx *= ENV.roll.knock;
      b.vz *= ENV.roll.knock;
      g.shake(0.25);
      g.score.style('ROLLING', ENV.roll.pts);
      this.hits = 0;
      this.hurt('被滾落的油桶撞倒');
      if (this.active) this.stagger(BULWARK.stagger.roll);
    }
  }

  /** A thug kicked into him knocks him off balance. */
  bowled() {
    for (const e of this.game.enemies.list) {
      if (e.stunT <= 0) {
        e.bowledBoss = false;
        continue;
      }
      if (!e.alive || e.bowledBoss || e.cfg.fly || Math.hypot(e.vx, e.vz) < 5) continue;
      if (Math.hypot(e.x - this.x, e.z - this.z) > BULWARK.radius + e.radius + 0.15) continue;
      e.bowledBoss = true;
      e.vx *= 0.2;
      e.vz *= 0.2;
      this.game.audio.kick(true);
      this.stagger(BULWARK.stagger.bowl, '打手撞到鐵盾身上');
    }
  }

  /** Nobody stands inside him. */
  shove() {
    const p = this.game.player;
    if (!p.alive) return;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz);
    const rr = BULWARK.radius + 0.35;
    if (d >= rr || d < 1e-4) return;
    p.x += (dx / d) * (rr - d);
    p.z += (dz / d) * (rr - d);
  }

  /** He reels `t` s, his shield down. */
  stagger(t, how) {
    if (!this.active || this.state === 'enter') return;
    this.state = 'stagger';
    this.timer = Math.max(this.timer, t);
    this.flash = 1;
    this.lock = null;
    this.alert();
    if (how) this.game.notes.log(how);
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active || this.state === 'enter') return null; // on his way out the shot flies past
    const t = segCircle(x0, z0, x1, z1, this.x, this.z, BULWARK.radius);
    if (t < 0) return null;
    const hx = x0 + (x1 - x0) * t;
    const hz = z0 + (z1 - z0) * t;
    const a = Math.abs(wrapAngle(Math.atan2(hx - this.x, hz - this.z) - this.facing));
    return { t, part: this.shieldUp && a <= (BULWARK.shield * Math.PI) / 180 ? 'shield' : 'body' };
  }

  shot(b, part) {
    const g = this.game;
    this.alert();
    if (part === 'shield') {
      this.blocked++;
      g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, 6, [7, 5, 2], 7);
      g.audio.deflect(g.panFor(b.x));
      if (this.blockLogT <= 0) {
        this.blockLogT = 2;
        g.notes.log('子彈打在鐵盾的盾上：繞到背後');
      }
      return true;
    }
    this.flash = 1;
    g.fx.blood(b.x, GUN_Y, b.z, b.dx, b.dz, 8);
    g.audio.flesh(g.panFor(b.x));
    if (++this.hits >= BULWARK.perSegment) {
      this.hits = 0;
      this.hurt(this.shieldUp ? '背後中彈' : '盾垂下時中彈');
    }
    return true;
  }

  /** The player's kick or pan smash: he staggers, shield down; no segment. */
  melee(inCone, reach, kind) {
    if (!this.active || this.state === 'enter') return false;
    const dir = inCone(this.x, this.z, reach + BULWARK.radius);
    if (!dir) return false;
    this.x += dir.x * 0.3;
    this.z += dir.z * 0.3;
    this.stagger(kind === 'smash' ? BULWARK.stagger.smash : BULWARK.stagger.kick, kind === 'smash' ? '鑊擊中鐵盾：盾垂下' : '踢得鐵盾一個踉蹌');
    return true;
  }

  rammed(x, z, r) {
    return this.active && this.state !== 'enter' && Math.hypot(x - this.x, z - this.z) <= BULWARK.radius + r + 0.1;
  }

  blast(x, z, opts = {}) {
    if (!this.active || this.state === 'enter' || Math.hypot(x - this.x, z - this.z) > BULWARK.blast) return;
    this.flash = 1;
    this.hits = 0;
    this.hurt(opts.rocket ? '被火箭油桶炸中' : '被炸到');
    if (this.active) this.stagger(BULWARK.stagger.blast);
  }

  /** His partner down (a duo): he bashes more often and turns quicker. */
  enrage() {
    this.raging = true;
  }

  goDown() {
    const g = this.game;
    this.state = 'down';
    this.lock = null;
    g.fx.blood(this.x, 1, this.z, 0, 0, 20);
    g.notes.log('鐵盾倒下');
    if (!this.team) g.hud.banner('BOSS DOWN', '鐵盾倒下了', 'clear');
    this.finish();
    this.sync();
  }

  /** Where he is drawn: the shield (lit when braced, down when spent or reeling), his red line, down at the end. */
  sync() {
    const g = this.game;
    const r = this.rig;
    const S = this.state;
    r.root.position.set(this.x, g.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    setFlash(r, this.flash * 2.5);
    this.shieldLit.emissiveIntensity = this.lit * 2.4;
    r.ring.material.color.setRGB(S === 'brace' || S === 'aim' ? 2.2 : 1, 0.45, 0.1);
    if (S === 'aim' && this.lock) this.laser.set(this.x, this.z, this.lock.x, this.lock.z, 0.06, 1.5 + 2 * clamp(1 - this.timer / BULWARK.gun.warn, 0, 1), GUN_Y);
    else this.laser.hide();
    if (!g.style.poseDue(r, g.worldTime)) return;
    const walking = S === 'enter' || S === 'bash' || (S === 'chase' && this.path);
    animateRig(r, this.phase, walking ? 1 : 0, this.facing);
    this.shield.rotation.x = S === 'spent' || S === 'stagger' ? 1.1 : S === 'down' ? 1.5 : 0;
    this.shield.position.y = S === 'spent' || S === 'stagger' ? 0.5 : 0.95;
    r.inner.rotation.x = S === 'down' ? 1.45 : S === 'brace' ? 0.15 : S === 'stagger' ? -0.25 : 0;
    r.inner.position.y = S === 'down' ? 0.15 : 0;
    finishRig(r, g.worldTime);
  }
}

const MORTAR_SOURCE = { cfg: { label: '重炮' } }; // names the shells that hurt the player (weapons.js lob)

class Road {
  constructor(points, loop) {
    this.pts = points.map(([x, z]) => ({ x, z }));
    this.loop = loop;
    this.lens = [];
    this.length = 0;
    const n = loop ? this.pts.length : this.pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = this.pts[i];
      const b = this.pts[(i + 1) % this.pts.length];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      this.lens.push(d);
      this.length += d;
    }
  }

  at(s, out) {
    const n = this.lens.length;
    if (this.loop) s = ((s % this.length) + this.length) % this.length;
    let i = 0;
    if (s < 0) i = 0; // before the start: on along the first leg, backwards
    else {
      while (i < n - 1 && s > this.lens[i]) {
        s -= this.lens[i];
        i++;
      }
    }
    const a = this.pts[i];
    const b = this.pts[(i + 1) % this.pts.length];
    const k = s / this.lens[i];
    out.x = a.x + (b.x - a.x) * k;
    out.z = a.z + (b.z - a.z) * k;
    out.heading = Math.atan2(b.x - a.x, b.z - a.z);
    return out;
  }
}

/** Senado's taxi convoy. */
class Convoy extends Boss {
  constructor(game) {
    super(game, CONVOY);
    this.cars = [];
    this.laser = new Laser(game.scene, new THREE.Color(1, 0.05, 0.05));
    this.reset();
  }

  reset() {
    const g = this.game;
    for (const c of this.cars) {
      g.scene.remove(c.mesh);
      c.mesh.traverse((m) => {
        if (m.geometry) m.geometry.dispose();
      });
    }
    this.cars = [];
    super.reset();
    this.laser.hide();
    this.state = 'drive';
  }

  /** Its wave in Senado: `def` is the map's (maps.js `boss`: the road in, and the loop round the fountain). */
  start(def, size) {
    this.reset();
    super.start(def, size);
    this.entry = new Road(def.entry, false);
    this.ring = new Road(def.loop, true);
    // where the road in meets the loop
    const end = def.entry[def.entry.length - 1];
    const k = def.loop.findIndex(([x, z]) => x === end[0] && z === end[1]);
    this.ringFrom = this.ring.lens.slice(0, Math.max(0, k)).reduce((a, b) => a + b, 0);
    const C = CONVOY;
    this.cars = Array.from({ length: C.cars }, (_, i) => ({ lead: i === 0, s: -i * C.gap, x: 0, z: 0, heading: 0, tyres: C.tyres, out: false, aside: null, ramT: 0, mesh: null }));
    for (const c of this.cars) this.place(c, true);
    this.state = 'drive'; // drive, stop, down
    this.timer = 0;
    this.stopT = C.stop.first;
    this.gunState = 'idle';
    this.gunT = C.gun.first;
    this.blastT = 0;
    this.taken = 0;
    this.build();
  }

  /** A car where its distance along the road puts it; `snap` faces the road at once. */
  place(c, snap = false, dt = 0) {
    const p = this.pathAt(c.s);
    c.x = p.x;
    c.z = p.z;
    c.heading = snap ? p.heading : wrapAngle(c.heading + clamp(wrapAngle(p.heading - c.heading), -CONVOY.turn * dt, CONVOY.turn * dt));
  }

  pathAt(s) {
    const out = {};
    return s < this.entry.length ? this.entry.at(s, out) : this.ring.at(this.ringFrom + s - this.entry.length, out);
  }

  get lead() {
    return this.cars[0];
  }

  get alone() {
    return this.cars.every((c) => c.lead || c.out);
  }

  /** The look: black block taxis, the lead with a red light on its roof. */
  build() {
    const g = this.game;
    const L = g.level;
    const { w, l, h } = CONVOY.size;
    const box = (bw, bh, bd, x, y, z, rgb) => {
      const geo = new THREE.BoxGeometry(bw, bh, bd).translate(x, y, z);
      const col = new THREE.Color(rgb);
      const n = geo.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      return geo;
    };
    for (const car of this.cars) {
      const parts = [
        box(w, h * 0.45, l, 0, 0.3 + (h * 0.45) / 2, 0, 0x15161a), // the body
        box(w * 0.86, h * 0.35, l * 0.5, 0, 0.3 + h * 0.45 + (h * 0.35) / 2, -l * 0.05, 0x2a3540), // the cabin
        box(0.5, 0.14, 0.22, 0, 0.3 + h * 0.8 + 0.07, -l * 0.05, car.lead ? 0xff2244 : 0xf2c94c), // the roof sign
        box(w + 0.04, 0.08, l * 0.9, 0, 0.62, 0, car.lead ? 0xd9a530 : 0x1d1f24), // a stripe: gold on the lead
      ];
      for (const [sx, sz] of [
        [-1, 1],
        [1, 1],
        [-1, -1],
        [1, -1],
      ]) {
        const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10).rotateZ(Math.PI / 2).translate((sx * w) / 2, 0.34, sz * l * 0.32);
        const col = new Float32Array(wheel.attributes.position.count * 3).fill(0.04);
        wheel.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(wheel);
      }
      const geo = mergeGeometries(parts);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });
      addCutaway(mat, L.cut);
      car.mesh = new THREE.Mesh(geo, mat);
      car.mesh.castShadow = true;
      g.style.retone(car.mesh, 'char', L.cut);
      g.style.outline(car.mesh, 'char');
      g.scene.add(car.mesh);
    }
    this.sync();
  }

  /** (x, z) in car `c`'s own frame: [right, forward]. */
  local(c, x, z) {
    const s = Math.sin(c.heading);
    const k = Math.cos(c.heading);
    const dx = x - c.x;
    const dz = z - c.z;
    return [dx * k - dz * s, dx * s + dz * k];
  }

  update(dt) {
    if (!this.active) return;
    const C = CONVOY;
    this.t += dt;
    if (this.blastT > 0) this.blastT -= dt;
    if (this.state === 'down') {
      this.updateWreck(dt);
      return;
    }
    for (const c of this.cars) if (c.ramT > 0) c.ramT -= dt;
    // the stops: on the loop only
    const onRing = this.lead.s >= this.entry.length;
    if (this.state === 'drive') {
      if (onRing) this.stopT -= dt;
      if (this.stopT <= 0) {
        this.state = 'stop';
        this.timer = C.stop.wait;
        this.letOut();
      }
    } else if (this.state === 'stop') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = 'drive';
        this.stopT = C.stop.every;
      }
    }
    const moving = this.state === 'drive';
    const speed = this.alone ? C.slow : C.speed;
    for (const c of this.cars) {
      if (c.out) {
        // pulling aside on flat tyres
        if (c.aside && c.aside.k < 1) {
          c.aside.k = Math.min(1, c.aside.k + dt / 0.6);
          const k = smoothstep(0, 1, c.aside.k);
          c.x = lerp(c.aside.x0, c.aside.x1, k);
          c.z = lerp(c.aside.z0, c.aside.z1, k);
          c.heading = c.aside.h0 + c.aside.turn * k;
        }
        continue;
      }
      if (moving) c.s += speed * dt;
      this.place(c, false, dt);
    }
    this.updateGun(dt);
    this.push(moving);
    this.sync();
  }

  /** Each moving car lets thugs out of its right-hand door. */
  letOut() {
    const g = this.game;
    let n = 0;
    for (const c of this.cars) {
      if (c.out) continue;
      for (let i = 0; i < CONVOY.stop.thugs; i++) {
        const rx = Math.cos(c.heading);
        const rz = -Math.sin(c.heading);
        const x = c.x + rx * (CONVOY.size.w / 2 + 0.6);
        const z = c.z + rz * (CONVOY.size.w / 2 + 0.6);
        g.enemies.spawn('grunt', { x, z, ex: x + rx * 1.2, ez: z + rz * 1.2 });
        n++;
      }
    }
    g.notes.log(`車隊停下，放出 ${n} 個打手`);
  }

  /** Nothing stands inside a car; a moving one runs into the player. */
  push(moving) {
    const g = this.game;
    const { w, l } = CONVOY.size;
    const p = g.player;
    for (const c of this.cars) {
      const sh = Math.sin(c.heading);
      const ch = Math.cos(c.heading);
      const shove = (o, r, speed) => {
        const [rx, fw] = this.local(c, o.x, o.z);
        const ox = w / 2 + r - Math.abs(rx);
        const oz = l / 2 + r - Math.abs(fw);
        if (ox <= 0 || oz <= 0) return false;
        const side = ox < oz;
        const sgn = (side ? rx : fw) >= 0 ? 1 : -1;
        const ux = side ? ch * sgn : sh * sgn;
        const uz = side ? -sh * sgn : ch * sgn;
        const d = side ? ox : oz;
        o.x += ux * d;
        o.z += uz * d;
        if (speed && o.vx !== undefined) {
          o.vx += ux * speed;
          o.vz += uz * speed;
        }
        return { ux, uz };
      };
      if (p.alive) {
        const hit = shove(p, 0.35, 0);
        if (hit && moving && !c.out && c.ramT <= 0 && !p.sliding && !p.spinning) {
          c.ramT = CONVOY.ram.cool;
          p.hurt(CONVOY.ram.dmg, hit.ux, hit.uz, true, c.lead ? '頭車' : '護衛車');
        }
      }
      for (const e of g.enemies.list) if (e.alive) shove(e, e.radius, 0);
      for (const o of g.level.props) if (o.alive && !o.carried && !o.fixed && (o.y || 0) < 1) shove(o, o.r, 4);
    }
  }

  /** The gunman in the lead's window: a red line onto the player, then a short burst. */
  updateGun(dt) {
    const g = this.game;
    const p = g.player;
    const G = CONVOY.gun;
    const c = this.lead;
    switch (this.gunState) {
      case 'idle':
        this.gunT -= dt;
        if (this.gunT <= 0 && p.alive && Math.hypot(p.x - c.x, p.z - c.z) < G.range && g.level.hasLOS(c.x, c.z, p.x, p.z)) {
          this.gunState = 'warn';
          this.gunTimer = G.warn;
          this.lock = { x: p.x, z: p.z };
          g.audio.aimWarn(g.panFor(c.x));
        }
        break;
      case 'warn':
        this.gunTimer -= dt;
        if (this.gunTimer <= 0) {
          this.gunState = 'fire';
          this.shots = G.shots;
          this.gunTimer = 0;
        }
        break;
      case 'fire':
        this.gunTimer -= dt;
        while (this.gunTimer <= 0 && this.shots > 0) {
          const dx = this.lock.x - c.x;
          const dz = this.lock.z - c.z;
          const d = Math.hypot(dx, dz) || 1;
          // the source is the boss as the game sees it (game.boss): its label names the bullets that hit
          g.bullets.spawn({ x: c.x + (dx / d) * 1.2, z: c.z + (dz / d) * 1.2, dx: dx / d, dz: dz / d, speed: G.speed, owner: 'enemy', damage: G.dmg, range: G.range, source: g.boss });
          g.audio.shot('pistol', g.panFor(c.x));
          this.shots--;
          this.gunTimer += G.interval;
        }
        if (this.shots <= 0) {
          this.gunState = 'idle';
          this.gunT = G.every;
          this.lock = null;
        }
        break;
    }
  }

  shotAt(x0, z0, x1, z1) {
    if (!this.active || this.state === 'down') return null;
    const { w, l } = CONVOY.size;
    let best = null;
    const out = {};
    this.cars.forEach((c, i) => {
      const [ax, az] = this.local(c, x0, z0);
      const [bx, bz] = this.local(c, x1, z1);
      if (segAABB(ax, az, bx, bz, { minX: -w / 2, maxX: w / 2, minZ: -l / 2, maxZ: l / 2 }, out) && (!best || out.t < best.t)) best = { t: out.t, part: i };
    });
    return best;
  }

  shot(b, i) {
    const g = this.game;
    const c = this.cars[i];
    const armour = c.out || (c.lead && !this.alone);
    g.fx.sparks(b.x, GUN_Y, b.z, -b.dx, -b.dz, armour ? 5 : 8, armour ? [6, 4.5, 1.8] : [7, 3, 1], 7);
    g.audio.impact(g.panFor(b.x));
    if (armour) return true;
    if (!c.lead) {
      if (--c.tyres <= 0) this.flatten(c);
      return true;
    }
    if (++this.taken >= CONVOY.perSegment) {
      this.taken = 0;
      this.hurt();
    }
    return true;
  }

  /** An escort's tyres go: it pulls aside, off the road, on the side with room, and stops for good. */
  flatten(c) {
    const g = this.game;
    const L = g.level;
    c.out = true;
    c.tyres = 0;
    const rx = Math.cos(c.heading);
    const rz = -Math.sin(c.heading);
    const free = (sx) => {
      const x = c.x + rx * sx * CONVOY.aside;
      const z = c.z + rz * sx * CONVOY.aside;
      const fx = Math.sin(c.heading) * CONVOY.size.l * 0.4;
      const fz = Math.cos(c.heading) * CONVOY.size.l * 0.4;
      return [0, 1, -1].every((k) => L.nav.isWalkable(x + fx * k, z + fz * k));
    };
    const side = free(1) ? 1 : free(-1) ? -1 : 1;
    c.aside = { k: 0, x0: c.x, z0: c.z, x1: c.x + rx * side * CONVOY.aside, z1: c.z + rz * side * CONVOY.aside, h0: c.heading, turn: side * 0.45 };
    const left = this.cars.filter((x) => !x.lead && !x.out).length;
    g.notes.log(`護衛車爆胎（剩 ${left} 架）`);
    g.shake(0.25);
    if (left > 0) g.hud.banner('TYRES OUT', `護衛車停下 · 剩 ${left} 架`, 'clear');
    else g.hud.banner('LEAD EXPOSED', '頭車慢下來了，射它！', 'clear');
  }

  blast(x, z, opts = {}) {
    if (!this.active || this.state === 'down' || !CONVOY.blast.kinds.includes(opts.kind)) return;
    const { w, l } = CONVOY.size;
    for (const c of this.cars) {
      if (c.out) continue;
      const [rx, fw] = this.local(c, x, z);
      if (Math.hypot(Math.max(0, Math.abs(rx) - w / 2), Math.max(0, Math.abs(fw) - l / 2)) > CONVOY.blast.radius) continue;
      if (!c.lead) this.flatten(c);
      else if (this.alone && this.blastT <= 0) {
        this.blastT = CONVOY.blast.cool;
        this.taken = 0;
        this.hurt();
      }
    }
  }

  /** Over a car's roof: a thrown barrel that comes down there goes off on it (thrown.js). */
  under(x, z) {
    if (!this.active || this.state === 'down') return false;
    const { w, l } = CONVOY.size;
    return this.cars.some((c) => {
      if (c.out) return false;
      const [rx, fw] = this.local(c, x, z);
      return Math.abs(rx) <= w / 2 + 0.3 && Math.abs(fw) <= l / 2 + 0.3;
    });
  }

  goDown() {
    const g = this.game;
    this.state = 'down';
    this.timer = CONVOY.wreck.burn;
    this.gunState = 'idle';
    this.lock = null;
    g.notes.log('頭車起火');
    g.hud.banner('BOSS DOWN', '快離開頭車！', 'clear');
  }

  updateWreck(dt) {
    const g = this.game;
    const c = this.lead;
    const before = Math.floor(this.timer * 12);
    this.timer -= dt;
    if (Math.floor(this.timer * 12) !== before) g.fx.sparks(c.x, CONVOY.size.h, c.z, 0, 0, 3, [6, 2.5, 0.8], 3, Math.PI); // burning
    if (this.timer > 0) {
      this.sync();
      return;
    }
    g.explode(c.x, c.z, CONVOY.wreck.radius, { source: '爆炸的頭車', kind: 'taxi' });
    c.mesh.visible = false;
    this.laser.hide();
    this.finish();
  }

  sync() {
    for (const c of this.cars) {
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.heading;
    }
    const red = this.gunState === 'warn' || this.gunState === 'fire';
    const c = this.lead;
    if (red && this.lock) this.laser.set(c.x, c.z, this.lock.x, this.lock.z, 0.05, this.gunState === 'warn' ? 1.5 + 2 * clamp(1 - this.gunTimer / CONVOY.gun.warn, 0, 1) : 3, GUN_Y);
    else this.laser.hide();
  }
}

/** Every kind of boss, by the name a map's `boss.kind` uses. */
/** Two at once (雙頭目): the duo's own numbers; each of the two keeps its kind's. */
export const DUO = {
  label: 'DUO',
  name: '雙頭目',
  short: '雙頭目',
  downed: '打倒',
  pull: false,
  segments: 3, // each of the two, in the run's last wave; a stage's (waves.js MODES midBoss `each`) fewer
  bonus: 2000,
  gap: 0.6, // s at least between the two starting a warning (a red line, a ring of shells, the blades raised)
  rage: { pause: 1.5, speed: 1.2 }, // one down, the other stands still this many s (any hit then takes a segment), then fights this much faster
  doubleKo: { within: 3, pts: 500 }, // DOUBLE KO: the second down within this many s of the first
  crossfire: 300, // CROSSFIRE: one of the two takes a segment from the other's bullet or blast
  // the combo (合招): the two start their attacks at the player at once (the one exception to `gap`), first `first` s
  // into the fight and then every `every` s; once it is due neither starts an attack of its own, and when both are not
  // free within `wait` s (the gunner without a line on the player) this one is let go.
  // A map's duo can name its own (maps.js `boss.combo`); the solution: the queen between the player and the gunner, the
  // sweep hits her (CROSSFIRE)
  // (the queen goes `lag` s after the gunner's red line goes on: she stands with her blades up in front of the player
  // as the middle of his sweep, aimed at the player, arrives)
  combo: { first: 10, every: 15, wait: 3, lag: 1, name: '夾擊', en: 'PINCER', hint: '讓刀后擋在你和重炮之間：掃射打中她' },
};

/** The two at once: one boss to the game, two inside (the comment at the top). */
class Duo extends Boss {
  constructor(game) {
    super(game, DUO);
    this.members = [];
    this.made = []; // the members' objects by slot and kind, made once and reused (two of a kind are two objects)
  }

  /** Its wave: `def.pair` the two (each a map's boss def of its kind); `size` a stage's shorter fight. */
  start(def, size) {
    this.reset();
    super.start(def, size);
    const g = this.game;
    const each = size ? { segments: size.each || 2, bonus: 0 } : { segments: DUO.segments, bonus: 0 };
    this.members = def.pair.map((d, i) => {
      const slot = this.made[i] || (this.made[i] = {});
      const m = slot[d.kind] || (slot[d.kind] = BOSSES[d.kind].make(g));
      m.start(d, each);
      m.team = this;
      return m;
    });
    this.segments = this.members.reduce((s, m) => s + m.segments, 0);
    this.hp = this.segments;
    this.lastTell = -Infinity;
    this.lastTeller = null;
    this.firstDown = -Infinity; // world time the first of the two went down
    this.raged = null; // the one left standing
    this.rageT = 0; // its pause before the rage
    this.comboDef = { ...DUO.combo, ...(def.combo || {}) };
    this.comboT = this.comboDef.first; // world s to the next combo
    this.comboWait = 0; // s it has waited for both to be free
    this.combos = 0;
    this.comboAt = -Infinity; // world time of the last
    this.sync();
  }

  reset() {
    for (const m of this.members) {
      m.reset();
      m.team = null;
    }
    this.members = [];
    super.reset();
  }

  /**
   * The combo: when it is due and both are free, both start their attacks now (the queen off her perch, the gunner's red
   * line), named on a banner; not both free within `wait` s, this one is let go. None once one of the two is down.
   */
  updateCombo(dt) {
    const g = this.game;
    const C = this.comboDef;
    this.comboT -= dt;
    if (this.comboT > 0) return;
    if (this.members.every((m) => m.active && m.comboReady())) {
      for (const m of this.members) m.combo();
      this.lastTell = g.worldTime;
      this.lastTeller = this; // neither starts another warning on top of it for DUO.gap s
      this.comboT = C.every;
      this.comboWait = 0;
      this.combos++;
      this.comboAt = g.worldTime;
      g.hud.banner('COMBO', `合招「${C.name}」${C.en} · ${C.hint}`, 'stage');
      g.notes.log(`合招：${C.name}`);
    } else if ((this.comboWait += dt) > C.wait) {
      this.comboT = C.every;
      this.comboWait = 0;
    }
  }

  /** One of the two may start a warning: not within DUO.gap s (world time) of the other's, nor while a combo is due. */
  mayTell(m) {
    const t = this.game.worldTime;
    if (!this.raged && this.comboT <= 0) return false;
    if (this.lastTeller && this.lastTeller !== m && this.lastTeller.active && t - this.lastTell < DUO.gap) return false;
    this.lastTell = t;
    this.lastTeller = m;
    return true;
  }

  /**
   * One of the two is down (its own finish). The other stands still for DUO.rage.pause s, open to anything (a shot then
   * takes a segment), and then fights DUO.rage.speed times as fast and its own harder way (enrage). Both down: the
   * duo is (the BOSS bonus, the clip, the wave's end), a DOUBLE KO if the second fell within DUO.doubleKo.within s.
   */
  memberDown(m) {
    const g = this.game;
    this.sync();
    const up = this.members.find((o) => o.active);
    if (up) {
      this.firstDown = g.worldTime;
      this.raged = up;
      this.rageT = DUO.rage.pause;
      up.enrage();
      g.notes.log(`${m.cfg.short}倒下，${up.cfg.short}發狂`);
      g.hud.banner('RAGE', `${up.cfg.short}發狂：停一停就衝過來`, 'stage');
      return;
    }
    if (g.worldTime - this.firstDown <= DUO.doubleKo.within) {
      g.score.style('DOUBLE KO', DUO.doubleKo.pts);
      g.notes.log(`DOUBLE KO：${DUO.doubleKo.within} 秒內打倒兩個`);
    }
    this.finish();
  }

  /** CROSSFIRE: `m` lost a segment to its partner's bullet or blast. */
  crossfire(m) {
    const g = this.game;
    g.score.style('CROSSFIRE', DUO.crossfire);
    g.notes.log(`${m.cfg.short}被拍檔誤傷（CROSSFIRE）`);
  }

  /** The duo as one boss: health the sum of the two, where it is the first one standing. */
  sync() {
    this.hp = this.members.reduce((s, m) => s + Math.max(0, m.hp), 0);
    const up = this.members.find((m) => m.active) || this.members[0];
    if (up) {
      this.x = up.x;
      this.z = up.z;
    }
  }

  update(dt) {
    if (!this.active) return;
    if (!this.raged) this.updateCombo(dt);
    for (const m of this.members) {
      if (!m.active) continue;
      if (m !== this.raged) m.update(dt);
      else if (this.rageT > 0) this.rageT -= dt; // its pause: it stands where it is
      else m.update(dt * DUO.rage.speed);
    }
    if (this.active) this.sync();
  }

  vulnerable() {
    return this.members.some((m) => m.active && (m === this.raged && this.rageT > 0 ? true : m.vulnerable()));
  }

  // the rest of the game talks to the duo as to one boss: each call goes to the one of the two it meets
  blast(x, z, opts = {}) {
    for (const m of this.members) {
      if (!m.active) continue;
      const hp = m.hp;
      if (m === this.raged && this.rageT > 0 && Math.hypot(m.x - x, m.z - z) < 4) m.hurt('發狂前被炸到');
      else m.blast(x, z, opts);
      if (m.hp < hp && opts.by && opts.by !== m && this.members.includes(opts.by)) this.crossfire(m);
    }
  }

  under(x, z) {
    return this.members.some((m) => m.active && m.under(x, z));
  }

  /** Where a shot first meets one of the two; `except` the one who fired it (a partner's bullet: bullets.js). */
  shotAt(x0, z0, x1, z1, except = null) {
    let best = null;
    for (const m of this.members) {
      if (!m.active || m === except) continue;
      const h = m === this.raged && this.rageT > 0 ? this.bodyAt(m, x0, z0, x1, z1) : m.shotAt(x0, z0, x1, z1);
      if (h && (!best || h.t < best.t)) best = { t: h.t, part: { member: m, part: h.part } };
    }
    return best;
  }

  /** The one standing still before its rage: its body, anywhere, takes a shot. */
  bodyAt(m, x0, z0, x1, z1) {
    const t = segCircle(x0, z0, x1, z1, m.x, m.z, 0.8);
    return t >= 0 ? { t, part: 'rage' } : null;
  }

  shot(b, part) {
    const m = part.member;
    const hp = m.hp;
    let stop = true;
    if (part.part === 'rage') m.hurt('發狂前中彈');
    else stop = m.shot(b, part.part);
    if (m.hp < hp && b.source && b.source !== m && this.members.includes(b.source)) this.crossfire(m);
    return stop;
  }

  shotSolid(s, b) {
    for (const m of this.members) if (m.active) m.shotSolid(s, b);
  }

  rammed(x, z, r) {
    return this.members.some((m) => m.active && m.rammed(x, z, r));
  }

  melee(inCone, reach, how) {
    let struck = false;
    for (const m of this.members) if (m.active && m.melee(inCone, reach, how)) struck = true;
    return struck;
  }
}

export const BOSSES = {
  heli: { make: (game) => new Heli(game), cfg: HELI },
  dj: { make: (game) => new Dj(game), cfg: DJ },
  blade: { make: (game) => new Blade(game), cfg: BLADE },
  truck: { make: (game) => new Truck(game), cfg: TRUCK },
  gunner: { make: (game) => new Gunner(game), cfg: GUNNER },
  convoy: { make: (game) => new Convoy(game), cfg: CONVOY },
  marksman: { make: (game) => new Marksman(game), cfg: MARKSMAN },
  buckshot: { make: (game) => new Buckshot(game), cfg: BUCKSHOT },
  bulwark: { make: (game) => new Bulwark(game), cfg: BULWARK },
  duo: { make: (game) => new Duo(game), cfg: DUO },
};

/** Kinds no map may use any more (同一水平 and 頭目全部是人, DECISIONS 2026-10-22): vehicles, and one who only waits behind glass. */
export const RETIRED = { heli: 'vehicle', truck: 'vehicle', convoy: 'vehicle', dj: 'waits' };

/** The run's boss: none until a boss wave starts one; each kind is built once and reused. */
export class Bosses {
  constructor(game) {
    this.game = game;
    this.none = new Boss(game);
    this.made = {};
    this.current = this.none;
    // game.boss: one object that is always the current boss (its fields and methods), so whoever holds it
    // (a test, from before the boss wave) sees the boss of the moment
    this.view = new Proxy(
      {},
      {
        get: (_, key) => {
          const v = this.current[key];
          return typeof v === 'function' ? v.bind(this.current) : v;
        },
        set: (_, key, value) => {
          this.current[key] = value;
          return true;
        },
      },
    );
  }

  /** A boss wave on a map with a boss: `def` is the map's (maps.js `boss`), `size` a stage's shorter fight (Boss.start). */
  start(def, size = null) {
    this.reset();
    const kind = BOSSES[def.kind];
    if (!kind) return;
    this.current = this.made[def.kind] || (this.made[def.kind] = kind.make(this.game));
    this.current.start(def, size);
  }

  /** No boss (a new run, a restart, the title). */
  reset() {
    this.current.reset();
    this.current = this.none;
  }
}
