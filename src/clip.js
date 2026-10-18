// The best-kill clip (最佳片段錄影). While a run plays, short screen recordings
// overlap: a new one starts every CLIP.every seconds, and each lives long
// enough to hold CLIP.before seconds ahead of a kill and CLIP.after after it.
// The run's best kill (the most points) claims the recording that covers it;
// the others are dropped as soon as a newer one can do their job. The end
// screen plays the clip before the score and offers it as a .webm.
//
// Recording is only shown, never read by the game: it runs on real time and
// draws no game.rng, so a run plays the same with it on or off. Browsers
// without MediaRecorder or canvas.captureStream get no clip and no errors.

import { CLIP } from './config.js';

const PREF_KEY = 'bullet-ballet.clip';

/**
 * The buffer and the choice, with no browser API in it (the tests drive it).
 * `open(t)` starts a recording at real time t (seconds) and returns
 * { stop(): Promise<Blob|null>, drop() }.
 */
export class ClipPlan {
  constructor(open, cfg = CLIP) {
    this.open = open;
    this.cfg = cfg;
    this.live = [];
    this.claim = null;
    this.reset();
  }

  /** A new run: drop every recording, forget the best kill and the clip. */
  reset() {
    for (const s of this.live) s.handle.drop();
    if (this.claim) this.claim.seg.handle.drop();
    this.live = []; // recordings still running and unclaimed: { start, handle }
    this.lastStart = -Infinity;
    this.best = 0; // points of the best kill so far
    this.claim = null; // the best kill's recording until it has run CLIP.after past the kill
    this.clip = null; // the finished best clip: { blob, offset, length, points }
    this.pending = null; // the claim being stopped
  }

  /** Recordings running now (for the stats panel and the tests). */
  get running() {
    return this.live.length + (this.claim ? 1 : 0);
  }

  /** Real time t: start a recording when one is due, drop the ones a newer one covers, finish the best kill's. */
  tick(t) {
    const { before, after, every } = this.cfg;
    if (t - this.lastStart >= every) {
      this.live.push({ start: t, handle: this.open(t) });
      // keep to the every-second grid (ticks come once a frame), unless a pause left a gap
      this.lastStart = t - this.lastStart > 2 * every ? t : this.lastStart + every;
    }
    // a kill from now on takes the newest recording that started `before` seconds ahead
    // of it: once a newer one has, the older ones can go
    const ready = this.live.filter((s) => s.start <= t - before);
    for (const s of ready.slice(0, -1)) {
      s.handle.drop();
      this.live.splice(this.live.indexOf(s), 1);
    }
    if (this.claim && t >= this.claim.kill + after) this.finishClaim(t);
  }

  /** A kill worth `points` at real time t; it becomes the clip if it is the run's best. Returns whether it did. */
  kill(t, points) {
    if (points <= this.best) return false;
    const { before } = this.cfg;
    const pool = this.claim ? [...this.live, this.claim.seg] : this.live;
    if (!pool.length) return false;
    // the newest recording that started `before` seconds ahead; early in a run, the oldest there is
    const ready = pool.filter((s) => s.start <= t - before);
    const seg = ready.length ? ready.reduce((a, b) => (b.start > a.start ? b : a)) : pool.reduce((a, b) => (b.start < a.start ? b : a));
    if (this.claim && this.claim.seg !== seg) this.claim.seg.handle.drop(); // an earlier best still recording gives way
    this.live = this.live.filter((s) => s !== seg);
    this.claim = { seg, kill: t, points };
    this.best = points;
    return true;
  }

  /** Stop the best kill's recording at real time t; the clip runs from `before` seconds ahead of the kill to t, at most `after` past it. */
  finishClaim(t) {
    const c = this.claim;
    this.claim = null;
    const { before, after } = this.cfg;
    const offset = Math.max(0, c.kill - before - c.seg.start);
    const length = Math.min(t, c.kill + after) - c.seg.start - offset;
    this.pending = c.seg.handle.stop().then((blob) => {
      if (blob && (!this.clip || c.points >= this.clip.points)) this.clip = { blob, offset, length, points: c.points };
      return this.clip;
    });
    return this.pending;
  }

  /** The run is over at real time t: cut the best kill's recording short if it is still going, drop the rest; resolves to the clip or null. */
  async end(t) {
    for (const s of this.live) s.handle.drop();
    this.live = [];
    this.lastStart = Infinity; // nothing new starts until reset
    if (this.claim) this.finishClaim(t);
    if (this.pending) await this.pending;
    return this.clip;
  }
}

/** Whether this browser can record the canvas. */
export function canRecord() {
  return typeof MediaRecorder === 'function' && typeof HTMLCanvasElement !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

/** The game's recorder: a small copy of the screen, recorded through ClipPlan. */
export class Clip {
  constructor(game) {
    this.game = game;
    this.supported = canRecord();
    this.mime = this.supported ? ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) : null;
    if (!this.mime) this.supported = false;
    let on = true;
    try {
      on = localStorage.getItem(PREF_KEY) !== 'off';
    } catch {
      /* storage unavailable */
    }
    if (new URLSearchParams(location.search).get('clip') === '0') on = false;
    this.on = on;
    this.copyT = 0;
    this.plan = new ClipPlan((t) => this.record(t));
  }

  get active() {
    return this.supported && this.on;
  }

  /** Turn recording on or off (the stats panel); remembered. */
  setOn(on) {
    this.on = on;
    try {
      localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    if (!on) this.plan.reset();
  }

  /** The small canvas the recordings read, made the first time it is needed. */
  ensureCanvas() {
    if (this.canvas) return;
    const src = this.game.renderer.domElement;
    this.canvas = document.createElement('canvas');
    this.canvas.width = CLIP.width;
    this.canvas.height = Math.round((CLIP.width * src.height) / Math.max(1, src.width) / 2) * 2;
    this.ctx = this.canvas.getContext('2d');
    // frames go out when we copy one (requestFrame), not when the browser happens to look
    this.stream = this.canvas.captureStream(0);
    this.track = this.stream.getVideoTracks()[0];
  }

  record() {
    this.ensureCanvas();
    const chunks = [];
    const rec = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: CLIP.bitrate });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.start(1000);
    return {
      stop: () =>
        new Promise((resolve) => {
          if (rec.state === 'inactive') return resolve(chunks.length ? new Blob(chunks, { type: this.mime }) : null);
          rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: this.mime }) : null);
          rec.stop();
          return undefined;
        }),
      drop: () => {
        rec.ondataavailable = null;
        if (rec.state !== 'inactive') rec.stop();
      },
    };
  }

  /** A new run. */
  start() {
    this.plan.reset();
  }

  /** After a frame is drawn during a run: copy it into the recording, CLIP.fps times a second. */
  frame(realDt) {
    if (!this.active) return;
    this.ensureCanvas();
    this.copyT -= realDt;
    if (this.copyT <= 0) {
      this.copyT += 1 / CLIP.fps;
      if (this.copyT < 0) this.copyT = 0;
      this.ctx.drawImage(this.game.renderer.domElement, 0, 0, this.canvas.width, this.canvas.height);
      if (this.track && this.track.requestFrame) this.track.requestFrame();
    }
    this.plan.tick(performance.now() / 1000);
  }

  /** A kill worth `points` (its tags times the combo). */
  kill(points) {
    if (this.active) this.plan.kill(performance.now() / 1000, points);
  }

  /** The run ended: resolves to the best clip ({ blob, offset, length, points }) or null. */
  finish() {
    return this.active ? this.plan.end(performance.now() / 1000) : Promise.resolve(null);
  }
}
