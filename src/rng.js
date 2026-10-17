// Seeded random numbers. Game logic (wave rosters, spawn picks, enemy
// decisions, bullet spread, drops, weapon pads) draws from game.rng, which is
// reseeded at the start of every run: ?seed=123 plays the same run each time,
// and replays and the daily challenge build on that. Effects (particles,
// decals, sounds, set dressing) draw from vfxRng through rand / randInt / pick
// in utils.js, so adding or removing an effect never changes the game.
// Nothing in src/ calls Math.random (eslint enforces it).

/** mulberry32: one 32-bit word of state, fast, and plenty for a game. */
export class Rng {
  constructor(seed = 0) {
    this.reset(seed);
  }

  /** Start the sequence again from `seed` (an unsigned 32-bit integer). */
  reset(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** A float in [0, 1). */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A float in [a, b). */
  range(a, b) {
    return a + this.next() * (b - a);
  }

  /** An integer in [a, b], both ends included. */
  int(a, b) {
    return Math.floor(a + this.next() * (b - a + 1));
  }

  /** One element of a non-empty array. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

/** A fresh seed from the browser's entropy source, for runs without ?seed=. */
export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** "123" is seed 123; any other text (a date, a word) hashes to a seed. */
export function seedFrom(text) {
  const s = String(text).trim();
  if (/^\d+$/.test(s)) return Number(s) >>> 0;
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The ?seed= in the page address, or null when there is none. */
export function readSeed() {
  const s = new URLSearchParams(location.search).get('seed');
  return s ? seedFrom(s) : null;
}

/** The effects RNG: seeded once per page load and never from the run, so effects can't steer the game. */
export const vfxRng = new Rng(randomSeed());
