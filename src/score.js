// Score, combo multiplier and "style" bonuses.

import { COMBO_WINDOW, RANK, RATING } from './config.js';

const KEY = 'bullet-ballet.best';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * The grade for a finished run: { grade, total, parts: { style, clean, time } },
 * each part in points out of its RATING weight. `waves` is the mode's length,
 * so a run that falls early cannot score every clean wave.
 */
export function rate({ score, cleanWaves, waves, seconds, cleared }) {
  const R = RATING;
  const parts = {
    style: R.style * clamp01(score / R.stylePar),
    clean: R.clean * clamp01(cleanWaves / waves),
    time: cleared ? R.time * clamp01((R.timeSlow - seconds) / (R.timeSlow - R.timePar)) : 0,
  };
  const total = parts.style + parts.clean + parts.time;
  const grade = R.grades.find(([, min]) => total >= min)?.[0] ?? 'D';
  return { grade, total, parts };
}

/** The live Style rank: a gauge from 0 (D) to just under RANK.names.length (SSS). Logic only, no DOM. */
export class StyleRank {
  constructor() {
    this.reset();
  }

  reset() {
    this.value = 0;
    this.last = ''; // the move that gained last, and how many times in a row
    this.repeats = 0;
    this.lastGain = 0;
    this.idleT = 0;
    this.campT = 0; // real seconds the player has stood still with enemies about
  }

  /** Standing still long enough for the gauge to drain (RANK.camp). */
  get camping() {
    return this.campT > RANK.camp;
  }

  get index() {
    return Math.min(RANK.names.length - 1, Math.floor(this.value));
  }

  get name() {
    return RANK.names[this.index];
  }

  /** How far into the current rank the gauge is, 0..1. */
  get progress() {
    return this.index === RANK.names.length - 1 ? 1 : this.value - this.index;
  }

  /** Move `id` would gain `base`; the same move straight after itself gains `repeat` times its last gain. */
  add(id, base) {
    this.repeats = id === this.last ? this.repeats + 1 : 0;
    this.last = id;
    this.lastGain = base * RANK.repeat ** this.repeats;
    this.value = Math.min(RANK.names.length - 1e-6, this.value + this.lastGain);
    this.idleT = 0;
    return this.lastGain;
  }

  hit() {
    this.value = Math.max(0, this.value - RANK.hit);
  }

  /** `h`: real seconds of this logic step; `moving`: false while the player stands still with enemies about. */
  update(h, moving = true) {
    this.idleT += h;
    this.campT = moving ? 0 : this.campT + h;
    if (this.camping) this.value = Math.max(0, this.value - RANK.campDrain * h);
    else if (this.idleT > RANK.idle) this.value = Math.max(0, this.value - RANK.drain * h);
  }
}

export class Score {
  constructor(game) {
    this.game = game;
    this.useBest(game.mode);
    this.reset();
  }

  /** Each mode keeps its own best (endless keeps the key the game always had), and so does each set of run rules. */
  useBest(mode, rules = null) {
    this.key = mode === 'endless' ? KEY : `${KEY}.${mode}`;
    if (rules && rules.label) this.key += `.${[rules.difficulty, ...rules.variants].join('+')}`;
    try {
      this.best = Number(localStorage.getItem(this.key)) || 0;
    } catch {
      this.best = 0;
    }
  }

  reset() {
    this.score = 0;
    this.combo = 0;
    this.comboT = 0;
    this.kills = 0;
    this.maxCombo = 0;
    this.rank = new StyleRank();
    this.bestRank = 0;
  }

  get mult() {
    return Math.max(1, Math.min(this.combo, 16));
  }

  /** `h`: real seconds of the logic step (the rank drains in real time, bullet time or not); `moving` as StyleRank.update. */
  update(dt, h = dt, moving = true) {
    this.rank.update(h, moving);
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
  }

  kill(tags) {
    this.combo++;
    this.kills++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboT = COMBO_WINDOW;
    const m = this.mult;
    const rm = this.game.ruleset.styleMul;
    let total = 0;
    for (const t of tags) total += t.pts;
    this.score += total * m * rm;
    // the rank: the first tag names the enemy; the rest are the move
    const moves = tags.slice(1).map((t) => t.label);
    this.raise(moves.length ? moves.sort().join('+') : 'KILL', moves.length ? RANK.move + RANK.extra * (moves.length - 1) : RANK.kill);
    this.game.hud.feedKill(tags, m, rm);
    if (this.combo > 1) this.game.audio.combo(this.combo);
  }

  /** A non-kill style bonus (close call, deflect, ...). */
  style(label, pts, refresh = true) {
    const m = this.mult * this.game.ruleset.styleMul;
    this.score += pts * m;
    this.raise(label, pts * RANK.perPoint);
    if (refresh && this.combo > 0) this.comboT = Math.min(COMBO_WINDOW, this.comboT + 0.8);
    this.game.hud.feed(label, pts * m);
  }

  bonus(label, pts) {
    this.score += pts;
    this.game.hud.feed(label, pts, 'gold');
  }

  raise(id, base) {
    this.rank.add(id, base);
    const i = this.rank.index;
    if (i > this.bestRank) {
      this.bestRank = i;
      if (i >= 4) this.game.notes.log(`Style 評級升到 ${this.rank.name}`); // S and above
    }
  }

  breakCombo() {
    this.combo = 0;
    this.comboT = 0;
  }

  saveBest() {
    if (this.score <= this.best) return false;
    this.best = this.score;
    try {
      localStorage.setItem(this.key, String(this.best));
    } catch {
      /* storage unavailable */
    }
    return true;
  }
}
