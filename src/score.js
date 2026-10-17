// Score, combo multiplier and "style" bonuses.

import { COMBO_WINDOW, RATING } from './config.js';

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

export class Score {
  constructor(game) {
    this.game = game;
    this.useBest(game.mode);
    this.reset();
  }

  /** Each mode keeps its own best (endless keeps the key the game always had). */
  useBest(mode) {
    this.key = mode === 'endless' ? KEY : `${KEY}.${mode}`;
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
  }

  get mult() {
    return Math.max(1, Math.min(this.combo, 16));
  }

  update(dt) {
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
    let total = 0;
    for (const t of tags) total += t.pts;
    this.score += total * m;
    this.game.hud.feedKill(tags, m);
    if (this.combo > 1) this.game.audio.combo(this.combo);
  }

  /** A non-kill style bonus (close call, deflect, ...). */
  style(label, pts, refresh = true) {
    const m = this.mult;
    this.score += pts * m;
    if (refresh && this.combo > 0) this.comboT = Math.min(COMBO_WINDOW, this.comboT + 0.8);
    this.game.hud.feed(label, pts * m);
  }

  bonus(label, pts) {
    this.score += pts;
    this.game.hud.feed(label, pts, 'gold');
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
