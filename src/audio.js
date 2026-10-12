// All sound is synthesized with WebAudio, so it can be pitched and stretched
// with the game's time scale: slow motion drops pitch, muffles the mix and
// slows the music down like a tape deck.

import { clamp, lerp, rand } from './utils.js';

const BPM = 124;
// A minor: Am - F - C - G, one bar each. Values are semitones from A.
const CHORDS = [
  [0, 3, 7],
  [-4, 0, 3],
  [3, 7, 10],
  [-2, 2, 5],
];
const BASS_STEPS = new Set([0, 3, 6, 8, 10, 11, 14]);
const ARP = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1];

const noteHz = (semi, base = 440) => base * Math.pow(2, semi / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.pitch = 1;
    this.musicRate = 1;
    this.slow = 0;
    this.last = new Map();
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);

    this.sfxFilter = ctx.createBiquadFilter();
    this.sfxFilter.type = 'lowpass';
    this.sfxFilter.frequency.value = 20000;
    this.sfxFilter.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.9;
    this.sfx.connect(this.sfxFilter);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 16000;
    this.musicFilter.Q.value = 0.9;
    this.musicFilter.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.32 : 0;
    this.music.connect(this.musicFilter);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.step = 0;
    this.nextStep = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.scheduleMusic(), 25);
  }

  get ready() {
    return this.ctx && this.ctx.state === 'running';
  }

  suspend() {
    if (this.ctx) this.ctx.suspend();
  }

  resume() {
    if (this.ctx) this.ctx.resume();
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.music) this.music.gain.setTargetAtTime(this.musicOn ? 0.32 : 0, this.ctx.currentTime, 0.1);
    return this.musicOn;
  }

  /** slow: 0 = real time, 1 = full bullet time. */
  setSlow(slow) {
    this.slow = slow;
    this.pitch = lerp(1, 0.62, slow);
    this.musicRate = lerp(1, 0.55, slow);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxFilter.frequency.setTargetAtTime(lerp(20000, 2400, slow), t, 0.05);
    this.musicFilter.frequency.setTargetAtTime(lerp(16000, 650, slow), t, 0.08);
  }

  // ---------------------------------------------------------------- helpers

  limit(key, ms) {
    const now = performance.now();
    const prev = this.last.get(key) || 0;
    if (now - prev < ms) return false;
    this.last.set(key, now);
    return true;
  }

  out(bus, pan) {
    if (!pan) return bus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(bus);
    return p;
  }

  noise({ dur, vol, type = 'bandpass', freq = 1000, freqEnd = 0, q = 1, attack = 0.002, delay = 0, pan = 0, bus = this.sfx, at = 0 }) {
    const c = this.ctx;
    const t = (at || c.currentTime) + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out(bus, pan));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone({ type = 'sine', f0, f1 = 0, dur, vol, attack = 0.003, delay = 0, pan = 0, bus = this.sfx, at = 0, filter = 0 }) {
    const c = this.ctx;
    const t = (at || c.currentTime) + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.out(bus, pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------- sfx

  shot(kind, pan = 0) {
    if (!this.ready) return;
    const p = this.pitch;
    switch (kind) {
      case 'player':
        this.noise({ type: 'bandpass', freq: 2400 * p, freqEnd: 500 * p, q: 0.7, dur: 0.15 / p, vol: 0.5, pan });
        this.tone({ type: 'square', f0: 240 * p, f1: 50 * p, dur: 0.08 / p, vol: 0.2, pan, filter: 1800 });
        this.noise({ type: 'highpass', freq: 6000 * p, dur: 0.035 / p, vol: 0.22, pan });
        break;
      case 'pistol':
        this.noise({ type: 'bandpass', freq: 1300 * p, freqEnd: 350 * p, q: 0.8, dur: 0.18 / p, vol: 0.35, pan });
        this.tone({ type: 'square', f0: 170 * p, f1: 45 * p, dur: 0.1 / p, vol: 0.16, pan, filter: 1200 });
        break;
      case 'shotgun':
        this.noise({ type: 'lowpass', freq: 3500 * p, freqEnd: 250 * p, dur: 0.35 / p, vol: 0.6, pan });
        this.tone({ type: 'sine', f0: 130 * p, f1: 38 * p, dur: 0.22 / p, vol: 0.45, pan });
        break;
      case 'rifle':
        this.noise({ type: 'bandpass', freq: 2800 * p, freqEnd: 700 * p, q: 0.9, dur: 0.11 / p, vol: 0.32, pan });
        this.tone({ type: 'sawtooth', f0: 320 * p, f1: 80 * p, dur: 0.06 / p, vol: 0.12, pan, filter: 2000 });
        break;
      case 'minigun':
        if (!this.limit('minigun', 45)) return;
        this.noise({ type: 'bandpass', freq: 1700 * p, freqEnd: 600 * p, q: 1, dur: 0.08 / p, vol: 0.24, pan });
        break;
    }
  }

  impact(pan = 0) {
    if (!this.ready || !this.limit('impact', 35)) return;
    const p = this.pitch;
    this.noise({ type: 'bandpass', freq: rand(2500, 4000) * p, q: 2, dur: 0.06 / p, vol: 0.12, pan });
  }

  flesh(pan = 0) {
    if (!this.ready || !this.limit('flesh', 30)) return;
    const p = this.pitch;
    this.noise({ type: 'lowpass', freq: 700 * p, dur: 0.12 / p, vol: 0.45, pan });
    this.tone({ type: 'sine', f0: 110 * p, f1: 45 * p, dur: 0.12 / p, vol: 0.3, pan });
  }

  kill(pan = 0) {
    if (!this.ready) return;
    const p = this.pitch;
    this.tone({ type: 'sine', f0: 160 * p, f1: 35 * p, dur: 0.35 / p, vol: 0.5, pan });
    this.noise({ type: 'lowpass', freq: 900 * p, freqEnd: 120 * p, dur: 0.3 / p, vol: 0.4, pan });
  }

  ricochet(pan = 0) {
    if (!this.ready) return;
    const p = this.pitch;
    this.tone({ type: 'sine', f0: 2700 * p, f1: 1500 * p, dur: 0.4 / p, vol: 0.18, pan });
    this.tone({ type: 'triangle', f0: 4100 * p, f1: 2600 * p, dur: 0.28 / p, vol: 0.08, pan });
    this.noise({ type: 'highpass', freq: 5000 * p, dur: 0.05 / p, vol: 0.2, pan });
  }

  explosion(pan = 0) {
    if (!this.ready) return;
    const p = this.pitch;
    this.noise({ type: 'lowpass', freq: 2200 * p, freqEnd: 70 * p, dur: 1.5 / p, vol: 0.95, attack: 0.004, pan });
    this.tone({ type: 'sine', f0: 80 * p, f1: 24 * p, dur: 1.0 / p, vol: 0.85, pan });
    this.noise({ type: 'bandpass', freq: 600 * p, freqEnd: 150 * p, dur: 0.5 / p, vol: 0.45, pan });
  }

  glass(pan = 0) {
    if (!this.ready) return;
    const p = this.pitch;
    this.noise({ type: 'highpass', freq: 3500 * p, dur: 0.3 / p, vol: 0.35, pan });
    let d = 0;
    for (let i = 0; i < 7; i++) {
      d += rand(0.015, 0.06) / p;
      this.tone({ type: i % 2 ? 'triangle' : 'sine', f0: rand(2500, 5600) * p, dur: rand(0.12, 0.45) / p, vol: 0.05, delay: d, pan });
    }
  }

  focusIn() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: 560, f1: 60, dur: 0.75, vol: 0.32 });
    this.noise({ type: 'bandpass', freq: 1600, freqEnd: 180, q: 1.4, dur: 0.75, vol: 0.28, attack: 0.05 });
    this.tone({ type: 'sine', f0: 52, f1: 40, dur: 1.4, vol: 0.4, attack: 0.02 });
  }

  focusOut() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: 70, f1: 560, dur: 0.45, vol: 0.26 });
    this.noise({ type: 'bandpass', freq: 220, freqEnd: 1800, q: 1.4, dur: 0.45, vol: 0.2, attack: 0.04 });
  }

  heartbeat() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: 62, f1: 40, dur: 0.14, vol: 0.5 });
    this.tone({ type: 'sine', f0: 56, f1: 36, dur: 0.16, vol: 0.38, delay: 0.2 });
  }

  spin() {
    if (!this.ready) return;
    const p = this.pitch;
    this.noise({ type: 'bandpass', freq: 500 * p, freqEnd: 2600 * p, q: 1.6, dur: 0.35 / p, vol: 0.22, attack: 0.04 });
  }

  kick(hit) {
    if (!this.ready) return;
    const p = this.pitch;
    if (hit) {
      this.tone({ type: 'sine', f0: 170 * p, f1: 45 * p, dur: 0.16 / p, vol: 0.55 });
      this.noise({ type: 'lowpass', freq: 1200 * p, dur: 0.1 / p, vol: 0.35 });
    } else {
      this.noise({ type: 'bandpass', freq: 500 * p, freqEnd: 1500 * p, q: 1.2, dur: 0.18 / p, vol: 0.12, attack: 0.03 });
    }
  }

  reload() {
    if (!this.ready) return;
    const p = this.pitch;
    this.tone({ type: 'square', f0: 900 * p, dur: 0.03, vol: 0.07, filter: 3000 });
    this.noise({ type: 'bandpass', freq: 2500 * p, q: 3, dur: 0.05, vol: 0.1 });
  }

  reloadDone() {
    if (!this.ready) return;
    const p = this.pitch;
    this.tone({ type: 'square', f0: 1400 * p, dur: 0.03, vol: 0.08, filter: 3500 });
    this.noise({ type: 'bandpass', freq: 3200 * p, q: 3, dur: 0.05, vol: 0.12, delay: 0.05 });
  }

  empty() {
    if (!this.ready || !this.limit('empty', 150)) return;
    this.tone({ type: 'square', f0: 1600, dur: 0.025, vol: 0.05, filter: 4000 });
  }

  hurt() {
    if (!this.ready) return;
    const p = this.pitch;
    this.tone({ type: 'sawtooth', f0: 240 * p, f1: 70 * p, dur: 0.3 / p, vol: 0.22, filter: 1400 });
    this.noise({ type: 'lowpass', freq: 900 * p, dur: 0.22 / p, vol: 0.45 });
  }

  casing() {
    if (!this.ready || !this.limit('casing', 45)) return;
    const p = this.pitch;
    this.tone({ type: 'sine', f0: rand(3800, 5400) * p, dur: 0.06 / p, vol: 0.035 });
  }

  aimWarn(pan = 0) {
    if (!this.ready || !this.limit('aim', 120)) return;
    const p = this.pitch;
    this.tone({ type: 'sine', f0: 1760 * p, dur: 0.07, vol: 0.035, pan });
  }

  slash() {
    if (!this.ready) return;
    const p = this.pitch;
    this.noise({ type: 'bandpass', freq: 3000 * p, freqEnd: 900 * p, q: 2, dur: 0.18 / p, vol: 0.3 });
  }

  deflect(pan = 0) {
    if (!this.ready) return;
    const p = this.pitch;
    this.tone({ type: 'triangle', f0: 3200 * p, f1: 1900 * p, dur: 0.18 / p, vol: 0.12, pan });
    this.noise({ type: 'highpass', freq: 4500 * p, dur: 0.06 / p, vol: 0.2, pan });
  }

  combo(level) {
    if (!this.ready) return;
    const f = noteHz(Math.min(level, 14) * 2, 440);
    this.tone({ type: 'triangle', f0: f, dur: 0.12, vol: 0.06 });
  }

  denied() {
    if (!this.ready) return;
    this.tone({ type: 'square', f0: 140, dur: 0.15, vol: 0.08, filter: 900 });
  }

  waveStart() {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', f0: 220, f1: 440, dur: 0.5, vol: 0.08, filter: 2200 });
    this.tone({ type: 'sine', f0: 55, dur: 0.6, vol: 0.3 });
  }

  waveClear() {
    if (!this.ready) return;
    [0, 3, 7, 12].forEach((s, i) => this.tone({ type: 'triangle', f0: noteHz(s, 523.25), dur: 0.35, vol: 0.09, delay: i * 0.08 }));
  }

  death() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: 320, f1: 35, dur: 1.8, vol: 0.45 });
    this.noise({ type: 'lowpass', freq: 1500, freqEnd: 60, dur: 1.8, vol: 0.4 });
  }

  // ----------------------------------------------------------------- music

  scheduleMusic() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.nextStep < c.currentTime - 0.1) this.nextStep = c.currentTime + 0.02;
    while (this.nextStep < c.currentTime + 0.15) {
      if (this.musicOn) this.playStep(this.step, this.nextStep);
      this.nextStep += 60 / BPM / 4 / this.musicRate;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, at) {
    const r = this.musicRate;
    const bus = this.music;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar];
    const stepDur = 60 / BPM / 4 / r;

    if (s % 4 === 0) {
      this.tone({ type: 'sine', f0: 150 * r, f1: 42 * r, dur: 0.28 / r, vol: 0.7, at, bus });
    }
    if (s === 4 || s === 12) {
      this.noise({ type: 'bandpass', freq: 1800 * r, q: 0.7, dur: 0.2 / r, vol: 0.28, at, bus });
      this.tone({ type: 'triangle', f0: 210 * r, f1: 120 * r, dur: 0.1 / r, vol: 0.12, at, bus });
    }
    if (s % 2 === 0) {
      this.noise({ type: 'highpass', freq: 8000 * r, dur: (s % 4 === 2 ? 0.08 : 0.03) / r, vol: s % 4 === 2 ? 0.09 : 0.04, at, bus });
    }
    if (BASS_STEPS.has(s)) {
      const semi = chord[0] + (s === 14 ? 12 : 0);
      this.tone({ type: 'sawtooth', f0: noteHz(semi, 55) * r, dur: stepDur * 1.6, vol: 0.2, at, bus, filter: 520 * r + 120 });
    }
    const arpNote = chord[ARP[s]] + (s >= 8 ? 12 : 0);
    this.tone({ type: 'square', f0: noteHz(arpNote, 440) * r, dur: stepDur * 0.9, vol: 0.028, at, bus, filter: 2600 * r });

    if (s === 0) {
      for (const semi of chord) {
        this.tone({ type: 'sawtooth', f0: noteHz(semi, 220) * r * 1.003, dur: stepDur * 16, vol: 0.022, attack: 0.4 / r, at, bus, filter: 900 * r });
        this.tone({ type: 'sawtooth', f0: noteHz(semi, 220) * r * 0.997, dur: stepDur * 16, vol: 0.022, attack: 0.4 / r, at, bus, filter: 900 * r });
      }
    }
  }
}
