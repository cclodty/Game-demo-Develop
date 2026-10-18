// The daily challenge (每日挑戰). Every UTC day the whole world plays the same
// run: the seed is a hash of the date, and the map and rules come from a fixed
// rotation table by the day's number. Each browser gets one try a day; after
// it the day's run can only be watched as a replay. The end screen shows the
// day's score, the last fourteen days, and a share code (date, score, grade
// and a check) that anyone can read back. The date is read once, when a daily
// run starts; the game itself never looks at a clock.

import { seedFrom } from './rng.js';
import { DAILY_ROTATION as ROTATION } from './rules.js';

export { ROTATION };

const DAY_MS = 86400000;
const KEY = 'bullet-ballet.daily';
const KEEP_DAYS = 30;

/** 'YYYY-MM-DD' of a moment (ms since 1970), in UTC. */
export function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Days since 1970-01-01 of a 'YYYY-MM-DD'. */
export function dayNumber(day) {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

/** The day `n` days before `day`. */
export function dayBefore(day, n = 1) {
  return utcDay(Date.parse(`${day}T00:00:00Z`) - n * DAY_MS);
}

/** The run of a day: its seed, map and rules. */
export function dailyFor(day) {
  const pick = ROTATION[((dayNumber(day) % ROTATION.length) + ROTATION.length) % ROTATION.length];
  return { day, seed: seedFrom(`daily/${day}`), map: pick.map, difficulty: pick.difficulty, variants: [...pick.variants] };
}

/** Milliseconds from `ms` to the next UTC midnight. */
export function msToNextDay(ms) {
  return DAY_MS - (((ms % DAY_MS) + DAY_MS) % DAY_MS);
}

/** 'HH:MM:SS' of a span in ms. */
export function countdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

const GRADES = ['S', 'A', 'B', 'C', 'D'];
const check = (text) => (seedFrom(`bb-share/${text}`) % 1679616).toString(36).toUpperCase().padStart(4, '0'); // four base-36 digits

/** A share code: BB-20261018-48250-B-7Q2K (date, score, grade, check). */
export function shareCode({ day, score, grade }) {
  const body = `${day.replace(/-/g, '')}-${Math.max(0, Math.round(score))}-${GRADES.includes(grade) ? grade : 'D'}`;
  return `BB-${body}-${check(body)}`;
}

/** A share code read back: { day, score, grade }, or null when it is not one or its check fails. */
export function readShareCode(code) {
  const m = /^BB-(\d{8})-(\d{1,9})-([SABCD])-([0-9A-Z]{4})$/.exec(String(code).trim().toUpperCase());
  if (!m) return null;
  const body = `${m[1]}-${m[2]}-${m[3]}`;
  if (check(body) !== m[4]) return null;
  return { day: `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}`, score: Number(m[2]), grade: m[3] };
}

/** This browser's daily results (the last KEEP_DAYS days) and the latest day's record for its replay. */
export class DailyStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let data = null;
    try {
      data = JSON.parse(storage.getItem(KEY) || 'null');
    } catch {
      data = null;
    }
    this.days = data && typeof data.days === 'object' && data.days ? data.days : {};
    this.replay = data && data.replay && typeof data.replay.data === 'string' ? data.replay : null; // { day, data }
  }

  /** Whether `day`'s try is still to come. */
  canPlay(day) {
    return !this.days[day];
  }

  /** A day's result: { score, grade, wave, cleared }; `record` is its input record as base64. */
  finish(day, result, record = null) {
    this.days[day] = result;
    const keep = Object.keys(this.days).sort().slice(-KEEP_DAYS);
    this.days = Object.fromEntries(keep.map((d) => [d, this.days[d]]));
    if (record) this.replay = { day, data: record };
    this.save();
  }

  /** A day taken from the start (the run began): if the page closes mid-run, the try is spent. */
  begin(day) {
    if (!this.days[day]) this.days[day] = { score: 0, grade: '', wave: 0, cleared: false, left: true };
    this.save();
  }

  save() {
    try {
      this.storage.setItem(KEY, JSON.stringify({ days: this.days, replay: this.replay }));
    } catch {
      /* storage full or unavailable: the day is not remembered */
    }
  }

  /** The fourteen days up to `day`, oldest first: { day, result | null }. */
  last14(day) {
    return Array.from({ length: 14 }, (_, i) => dayBefore(day, 13 - i)).map((d) => ({ day: d, result: this.days[d] || null }));
  }
}
