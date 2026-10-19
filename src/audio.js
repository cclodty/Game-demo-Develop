// All sound is synthesized with WebAudio, so it can be pitched and stretched
// with the game's time scale: slow motion drops pitch, muffles the mix and
// slows the music down like a tape deck.

import { MUSIC } from './config.js';
import { playStep, SONGS } from './music.js';
import { clamp, lerp, rand } from './utils.js';

const noteHz = (semi, base = 440) => base * Math.pow(2, semi / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.musicVol = 1; // the settings' volumes (setVolumes), 0–1 on top of the mix
    this.sfxVol = 1;
    this.pitch = 1;
    this.musicRate = 1;
    this.slow = 0;
    this.last = new Map();
    // the background songs (music.js): config.js MUSIC.playlist, one a stage; the settings' choice of one song instead
    // (setChoice); or ?music=<id> for just that one on this visit, over both
    const asked = new URLSearchParams(location.search).get('music');
    this.asked = SONGS[asked] ? asked : null;
    this.defaultPlaylist = MUSIC.playlist.filter((id) => SONGS[id]);
    if (!this.defaultPlaylist.length) this.defaultPlaylist = ['classic'];
    this.choice = null;
    this.playlist = this.asked ? [this.asked] : this.defaultPlaylist;
    this.song = SONGS[this.playlist[0]];
    this.nextSong = null; // the stage's song, waiting for the bar line
    this.musicLevel = 0; // how much of the song plays (music.js): 0 the base, 1 its later layers, 2 its boss section
    this.kickOnly = false; // a beat's doors telegraphed (waves.js setBeat): the kick alone until it lands
  }

  /** The settings' choice (settings.js `song`): a song's id to play for every stage, or 'auto' for the playlist; ?music= wins. */
  setChoice(id) {
    this.choice = id !== 'auto' && SONGS[id] ? id : null;
    this.playlist = this.asked ? [this.asked] : this.choice ? [this.choice] : this.defaultPlaylist;
  }

  /** The song for stage `i` of a run. */
  songFor(i) {
    return SONGS[this.playlist[i % this.playlist.length]];
  }

  /** The song playing now, or the one it changes to at the next bar line. */
  get upcoming() {
    return this.nextSong || this.song;
  }

  /** Stage `i`'s song: at the next bar line, or `now` from its start (a new run). */
  setStage(i, now = false) {
    const song = this.songFor(i);
    if (now) {
      this.nextSong = null;
      this.useSong(song);
      this.step = 0;
      if (this.ctx) this.nextStep = this.ctx.currentTime + 0.05;
    } else this.nextSong = song === this.song ? null : song;
  }

  /** 0 the base of the song, 1 with its later layers, 2 its boss section (waves.js sets it each wave). */
  setLevel(n) {
    this.musicLevel = n;
  }

  /** The beats (waves.js): 'telegraph' leaves only the kick playing, 'live' and 'quiet' bring the song back. */
  setBeat(phase) {
    this.kickOnly = phase === 'telegraph';
  }

  /** The music's level with everything on: the mix's, the settings' volume, muted when off. */
  get musicGain() {
    return this.musicOn ? 0.32 * this.musicVol : 0;
  }

  /** A big sound (an explosion, the player's death): the music dips to `depth` of itself for `hold` s and comes back over `release` s. */
  duck(depth = 0.3, hold = 0.12, release = 0.6, at = null) {
    if (!this.ctx) return;
    const g = this.music.gain;
    const t = at ?? this.ctx.currentTime;
    const base = this.musicGain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(base * depth, t + 0.03);
    g.setValueAtTime(base * depth, t + hold);
    g.setTargetAtTime(base, t + hold, release / 3);
  }

  /** A song takes over the music: its echo's timing and its hall. */
  useSong(song) {
    this.song = song;
    if (!this.delay) return;
    const dl = song.delay || { steps: 3, send: 0, feedback: 0 };
    this.delay.delayTime.value = (60 / song.bpm / 4) * dl.steps;
    this.delaySend.gain.value = dl.send;
    this.delayFb.gain.value = dl.feedback;
    if (this.hallSend) this.hallSend.gain.value = song.hall ? song.hall.send : 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.build(new AC());
    this.step = 0;
    this.nextStep = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.scheduleMusic(), 25);
  }

  /** The mixing graph on `ctx` (a live AudioContext, or an OfflineAudioContext to render the music to a file). */
  build(ctx) {
    this.ctx = ctx;
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
    this.sfx.gain.value = 0.9 * this.sfxVol;
    this.sfx.connect(this.sfxFilter);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 16000;
    this.musicFilter.Q.value = 0.9;
    this.musicFilter.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.32 * this.musicVol : 0;
    this.music.connect(this.musicFilter);
    // the song's echo: what goes to musicWet also repeats through a filtered feedback delay
    const dl = this.song.delay || { steps: 3, send: 0, feedback: 0 };
    this.musicWet = ctx.createGain();
    this.musicWet.connect(this.music);
    const send = ctx.createGain();
    send.gain.value = dl.send;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = (60 / this.song.bpm / 4) * dl.steps;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    const fb = ctx.createGain();
    fb.gain.value = dl.feedback;
    this.musicWet.connect(send);
    send.connect(delay);
    delay.connect(tone);
    tone.connect(fb);
    fb.connect(delay);
    tone.connect(this.music);
    Object.assign(this, { delay, delaySend: send, delayFb: fb, hallSend: null });
    // a song may ask for a hall (song.hall): what goes to musicWet also rings out in a made-up room (one for every song played here)
    const hall = this.song.hall || this.playlist.map((id) => SONGS[id].hall).find(Boolean);
    if (hall) {
      const n = Math.ceil(ctx.sampleRate * hall.seconds);
      const ir = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < n; i++) d[i] = rand(-1, 1) * Math.pow(1 - i / n, 2.6);
      }
      const room = ctx.createConvolver();
      room.buffer = ir;
      const hs = ctx.createGain();
      hs.gain.value = this.song.hall ? this.song.hall.send : 0;
      this.musicWet.connect(hs);
      hs.connect(room);
      room.connect(this.music);
      this.hallSend = hs;
    }

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = rand(-1, 1);
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
    if (this.music) {
      this.music.gain.cancelScheduledValues(this.ctx.currentTime);
      this.music.gain.setTargetAtTime(this.musicGain, this.ctx.currentTime, 0.1);
    }
    return this.musicOn;
  }

  /** The settings page's volumes, 0–1 each (settings.js): the music's and the sound effects' gains follow. */
  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.cancelScheduledValues(t);
    this.music.gain.setTargetAtTime(this.musicGain, t, 0.05);
    this.sfx.gain.setTargetAtTime(0.9 * sfx, t, 0.05);
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
    src.start(t, rand(0, 1.5));
    src.stop(t + dur + 0.05);
  }

  // `filter` a lowpass (or `filterType`) at that frequency, opening (or closing) to `filterTo` over `sweep` s (the whole note if 0)
  tone({ type = 'sine', f0, f1 = 0, dur, vol, attack = 0.003, delay = 0, pan = 0, bus = this.sfx, at = 0, filter = 0, filterTo = 0, sweep = 0, filterType = 'lowpass', q = 1 }) {
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
      f.type = filterType;
      f.Q.value = q;
      f.frequency.setValueAtTime(filter, t);
      if (filterTo) f.frequency.exponentialRampToValueAtTime(filterTo, t + (sweep || dur));
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
      case 'smg':
        if (!this.limit('smg', 35)) return;
        this.noise({ type: 'bandpass', freq: 2800 * p, freqEnd: 900 * p, q: 0.9, dur: 0.09 / p, vol: 0.34, pan });
        this.tone({ type: 'square', f0: 300 * p, f1: 90 * p, dur: 0.05 / p, vol: 0.1, pan, filter: 2200 });
        break;
      case 'pshotgun':
        this.noise({ type: 'lowpass', freq: 4200 * p, freqEnd: 200 * p, dur: 0.42 / p, vol: 0.8, pan });
        this.tone({ type: 'sine', f0: 140 * p, f1: 36 * p, dur: 0.26 / p, vol: 0.6, pan });
        this.noise({ type: 'bandpass', freq: 1800 * p, q: 4, dur: 0.05, vol: 0.18, delay: 0.28 / p, pan });
        this.noise({ type: 'bandpass', freq: 1400 * p, q: 4, dur: 0.06, vol: 0.18, delay: 0.4 / p, pan });
        break;
      case 'prifle':
        if (!this.limit('prifle', 40)) return;
        this.noise({ type: 'bandpass', freq: 3200 * p, freqEnd: 700 * p, q: 0.8, dur: 0.12 / p, vol: 0.42, pan });
        this.tone({ type: 'sawtooth', f0: 260 * p, f1: 70 * p, dur: 0.07 / p, vol: 0.14, pan, filter: 2400 });
        break;
      case 'sniper':
        this.noise({ type: 'highpass', freq: 3000 * p, dur: 0.06 / p, vol: 0.5, pan });
        this.noise({ type: 'lowpass', freq: 2600 * p, freqEnd: 90 * p, dur: 1.1 / p, vol: 0.75, pan });
        this.tone({ type: 'sine', f0: 110 * p, f1: 30 * p, dur: 0.5 / p, vol: 0.55, pan });
        this.noise({ type: 'bandpass', freq: 2200 * p, q: 5, dur: 0.05, vol: 0.16, delay: 0.42 / p, pan });
        this.noise({ type: 'bandpass', freq: 1600 * p, q: 5, dur: 0.06, vol: 0.16, delay: 0.55 / p, pan });
        break;
      case 'launcher':
        this.tone({ type: 'sine', f0: 190 * p, f1: 55 * p, dur: 0.25 / p, vol: 0.6, pan });
        this.noise({ type: 'lowpass', freq: 900 * p, dur: 0.2 / p, vol: 0.4, pan });
        break;
      case 'pminigun':
        if (!this.limit('pminigun', 40)) return;
        this.noise({ type: 'bandpass', freq: 2000 * p, freqEnd: 700 * p, q: 1, dur: 0.07 / p, vol: 0.3, pan });
        this.tone({ type: 'square', f0: 140 * p, f1: 60 * p, dur: 0.04 / p, vol: 0.08, pan, filter: 1500 });
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
    this.duck();
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

  toss() {
    if (!this.ready) return;
    const p = this.pitch;
    this.noise({ type: 'bandpass', freq: 400 * p, freqEnd: 1900 * p, q: 1.4, dur: 0.26 / p, vol: 0.18, attack: 0.02 });
  }

  slide() {
    if (!this.ready) return;
    const p = this.pitch;
    this.noise({ type: 'lowpass', freq: 900 * p, freqEnd: 260 * p, q: 0.8, dur: 0.45 / p, vol: 0.2, attack: 0.03 });
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

  /** A bomber's vest lit: three quick rising beeps. */
  fuse(pan = 0) {
    if (!this.ready) return;
    const p = this.pitch;
    for (let i = 0; i < 3; i++) this.tone({ type: 'square', f0: (1500 + i * 260) * p, dur: 0.05, vol: 0.06, delay: (i * 0.11) / p, pan, filter: 5000 });
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

  pickup() {
    if (!this.ready) return;
    this.tone({ type: 'triangle', f0: 660, dur: 0.1, vol: 0.12 });
    this.tone({ type: 'triangle', f0: 990, dur: 0.16, vol: 0.12, delay: 0.07 });
    this.noise({ type: 'bandpass', freq: 2500, q: 3, dur: 0.05, vol: 0.12 });
  }

  /** Pigeons taking off: a burst of soft wing claps. */
  flutter(n, pan = 0) {
    if (!this.ready || !this.limit('flutter', 400)) return;
    const p = this.pitch;
    for (let i = 0; i < Math.min(10, n * 2); i++) {
      this.noise({ type: 'bandpass', freq: rand(500, 1100) * p, q: 1.2, dur: 0.07 / p, vol: 0.07, delay: (i * rand(0.03, 0.07)) / p, pan });
    }
  }

  weaponSwitch() {
    if (!this.ready || !this.limit('switch', 80)) return;
    this.noise({ type: 'bandpass', freq: 1800, q: 4, dur: 0.04, vol: 0.14 });
    this.noise({ type: 'bandpass', freq: 2600, q: 4, dur: 0.04, vol: 0.12, delay: 0.06 });
  }

  padSpawn() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: 520, f1: 1040, dur: 0.35, vol: 0.08 });
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

  /** A beat is coming: a knock and a rising tick at its doors. */
  beat() {
    if (!this.ready) return;
    this.tone({ type: 'sine', f0: 70, dur: 0.35, vol: 0.25 });
    this.tone({ type: 'square', f0: 330, f1: 660, dur: 0.12, vol: 0.05, filter: 1800, delay: 0.05 });
  }

  waveClear() {
    if (!this.ready) return;
    [0, 3, 7, 12].forEach((s, i) => this.tone({ type: 'triangle', f0: noteHz(s, 523.25), dur: 0.35, vol: 0.09, delay: i * 0.08 }));
  }

  death() {
    if (!this.ready) return;
    this.duck(0.2, 0.6, 1.5);
    this.tone({ type: 'sine', f0: 320, f1: 35, dur: 1.8, vol: 0.45 });
    this.noise({ type: 'lowpass', freq: 1500, freqEnd: 60, dur: 1.8, vol: 0.4 });
  }

  // ----------------------------------------------------------------- music

  scheduleMusic() {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    if (this.nextStep < c.currentTime - 0.1) this.nextStep = c.currentTime + 0.02;
    while (this.nextStep < c.currentTime + 0.15) {
      // a new stage's song comes in on the bar line, from its start
      if (this.nextSong && this.step % 16 === 0) {
        this.useSong(this.nextSong);
        this.nextSong = null;
        this.step = 0;
      }
      if (this.musicOn) playStep(this, this.song, this.step, this.nextStep, this.musicRate);
      this.nextStep += 60 / this.song.bpm / 4 / this.musicRate;
      this.step++;
    }
  }

  /**
   * Schedule `seconds` of the song from the start, at music `level` and tape `rate` (1, or musicRate in bullet time: setSlow first),
   * on an offline graph (build() first); ctx.startRendering() then plays it out.
   */
  scheduleSong(seconds, level = 1, rate = 1) {
    this.musicLevel = level;
    const dt = 60 / this.song.bpm / 4 / rate;
    for (let n = 0, t = 0.05; t < seconds; n++, t += dt) playStep(this, this.song, n, t, rate);
  }
}
