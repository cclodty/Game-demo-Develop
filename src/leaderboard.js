// Leaderboards (排行榜 ②). With BACKEND.url set (config.js), a daily run and
// an arcade run on the normal rules send their score and input record to the
// back end (backend/worker.js) when they end, and the title's board page
// reads the day's or a start map's top 100 and the player's neighbours, and
// fetches anyone's replay. Without it, or when the back end cannot be reached,
// the same pages show this browser's own board and say so. Nothing here ever
// holds the game up: requests run after the run is over, time out after a
// few seconds, and failing just means the local board.
//
// A player is an anonymous id made up in this browser plus a nickname asked
// for at the first upload (and changeable on the board page).

import { BACKEND } from './config.js';

const PLAYER_KEY = 'bullet-ballet.player';
const LOCAL_KEY = 'bullet-ballet.board';
const KEEP_LOCAL = 50; // rows per local board
const TIMEOUT = 6000; // ms before a request is given up

/** A nickname as the boards show it, or null: 1 to 16 letters (any script), digits, spaces and _ . -, nothing like an address. The back end uses the same rule. */
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
  const length = [...name].length;
  if (length < 1 || length > 16) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]*$/u.test(name)) return null;
  if (/https?|www\.|\.(com|net|org|io|gg)\b/iu.test(name)) return null;
  return name;
}

/** Which board a run belongs on: the day for a daily, the start map for an arcade run. */
export const boardKey = (mode, day, map) => (mode === 'daily' ? `daily/${day}` : `arcade/${map}`);

const newId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export class Leaderboard {
  /** `fetch` and `storage` are the browser's unless a test hands in its own. */
  constructor({ fetch = (...a) => globalThis.fetch(...a), storage = globalThis.localStorage } = {}) {
    this.fetch = fetch;
    this.storage = storage;
    this.last = null; // the latest upload's outcome, for the export
    let me = null;
    try {
      me = JSON.parse(storage.getItem(PLAYER_KEY) || 'null');
    } catch {
      me = null;
    }
    this.me = me && typeof me.id === 'string' ? me : { id: newId(), name: '' };
    try {
      this.local = JSON.parse(storage.getItem(LOCAL_KEY) || '{}') || {};
    } catch {
      this.local = {};
    }
  }

  /** The back end's address, read each time (empty: offline). */
  get url() {
    return String(BACKEND.url || '').replace(/\/+$/, '');
  }

  get online() {
    return this.url !== '';
  }

  /** Set the nickname; returns it tidied, or null when it cannot be one. */
  setName(raw) {
    const name = cleanName(raw);
    if (!name) return null;
    this.me.name = name;
    this.save(PLAYER_KEY, this.me);
    return name;
  }

  save(key, value) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable */
    }
  }

  /** Put a run on this browser's board; returns its place there. */
  addLocal({ mode, day, map, score, grade }) {
    const key = boardKey(mode, day, map);
    const rows = this.local[key] || [];
    const row = { name: this.me.name || '我', score, grade, day, mine: true };
    rows.push(row);
    rows.sort((a, b) => b.score - a.score);
    this.local[key] = rows.slice(0, KEEP_LOCAL);
    this.save(LOCAL_KEY, this.local);
    return { rank: rows.indexOf(row) + 1, total: rows.length };
  }

  /** A board read from this browser: the same shape as the back end's. */
  localBoard(mode, key) {
    const rows = this.local[boardKey(mode, key, key)] || [];
    return { local: true, total: rows.length, top: rows.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, grade: r.grade, me: true, entry: null })), around: [], place: null };
  }

  async request(path, init = {}) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), TIMEOUT);
    try {
      const res = await this.fetch(`${this.url}${path}`, { ...init, signal: ctrl ? ctrl.signal : undefined });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Where a run stands on this browser's board, without adding it. */
  localPlace({ mode, day, map, score }) {
    const rows = this.local[boardKey(mode, day, map)] || [];
    return { rank: rows.filter((r) => r.score > score).length + 1, total: rows.length };
  }

  /**
   * A finished run: onto the local board (unless `local` is false: it is there already); online,
   * also to the back end. Resolves to { local: { rank, total }, online: { rank, total, kept } | null,
   * error: string | null }.
   */
  async submit(run, { local: addLocal = true } = {}) {
    const local = addLocal ? this.addLocal(run) : this.localPlace(run);
    let outcome = { local, online: null, error: null };
    if (this.online && this.me.name) {
      try {
        const res = await this.request('/scores', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: run.mode, day: run.day, map: run.map, score: run.score, grade: run.grade, name: this.me.name, id: this.me.id, replay: run.replay }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) outcome = { ...outcome, online: { rank: body.rank, total: body.total, kept: body.kept !== false } };
        else outcome.error = body.error || `HTTP ${res.status}`;
      } catch (err) {
        outcome.error = err && err.name === 'AbortError' ? 'timeout' : 'unreachable';
      }
    } else if (this.online) outcome.error = 'no name';
    this.last = { ...outcome, mode: run.mode, at: run.day };
    return outcome;
  }

  /** A board: the day's daily ('daily', day) or a start map's arcade board ('arcade', map); the local one when offline or unreachable. */
  async board(mode, key) {
    if (!this.online) return { ...this.localBoard(mode, key), why: 'offline' };
    try {
      const q = mode === 'daily' ? `mode=daily&day=${encodeURIComponent(key)}` : `mode=arcade&map=${Number(key)}`;
      const res = await this.request(`/board?${q}&id=${encodeURIComponent(this.me.id)}`);
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return { local: false, total: body.total, top: body.top, around: body.around || [], place: body.place };
    } catch {
      return { ...this.localBoard(mode, key), why: 'unreachable' };
    }
  }

  /** Someone's run from the board, as input record bytes. */
  async replay(entry) {
    const res = await this.request(`/replay?id=${Number(entry)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** The day's play counts from the back end's /stats, or null. */
  async stats() {
    if (!this.online) return null;
    try {
      const res = await this.request('/stats');
      const body = await res.json();
      return res.ok && body.ok ? body.days : null;
    } catch {
      return null;
    }
  }
}
