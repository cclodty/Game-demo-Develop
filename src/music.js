// Background music as data (音樂). A song is a tempo, a loop of chords and
// sixteenth-step patterns for drums, bass, keys and a lead, played by
// AudioSys's synth voices (tone, noise) on its music buses; slow motion slows
// and lowers it like a tape deck (AudioSys.musicRate). config.js MUSIC.song
// picks the song the game plays; ?music=<id> tries another.
//
// Patterns are 16 characters, one per sixteenth of a bar, or a list of them
// taken bar by bar. Drums: x hit, X accent, g ghost. Bass: r root, o root an
// octave up, 5 fifth, 3 and 7 the chord's second and fourth tones, - holds the
// note before. Keys: x the chord, - holds. Arp: a digit picks a chord tone.
// Toms fall in pitch through the bar, so a run of them is a fill.
// A lead is a list of [bar, step, semitones above the key, steps long, slide].

/** The chord of a bar: semitones above the key's root, the root first. */
const CHORD = {
  m: (r) => [r, r + 3, r + 7],
  M: (r) => [r, r + 4, r + 7],
  m7: (r) => [r, r + 3, r + 7, r + 10],
  M7: (r) => [r, r + 4, r + 7, r + 11],
  d7: (r) => [r, r + 4, r + 7, r + 10],
};

/** The tune the game started with: four bars of A minor, a square arpeggio over a pad. */
const classic = {
  name: '原本 ORIGINAL',
  bpm: 124,
  key: 220,
  bars: 4,
  chords: [CHORD.m(0), CHORD.M(-4), CHORD.M(3), CHORD.M(-2)],
  drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.X.x.X.x.X.x.X.' },
  mix: { kick: 1.55, snare: 0.33, hat: 0.25 }, // its levels as they were: the kick well over the rest
  bass: { pattern: 'r..r..r.r.rr..o.', type: 'sawtooth', filter: 520, vol: 0.2 },
  arp: { pattern: '0121201202120121', octave: 1, upper: 8, type: 'square', vol: 0.028, filter: 2600 },
  pad: { vol: 0.022, filter: 900 },
};

/** 霓虹 NEON: synthwave. Four on the floor, an octave-jumping bass, a pentatonic hook through a delay. */
const neon = {
  name: '霓虹 NEON',
  bpm: 126,
  key: 220,
  bars: 4,
  chords: [CHORD.m(0), CHORD.M(-4), CHORD.M(3), CHORD.M(-2)],
  delay: { steps: 3, send: 0.32, feedback: 0.38 },
  drums: {
    kick: 'x...x...x...x...',
    clap: '....x.......x...',
    hat: '.x.x.x.x.x.x.x.x',
    open: '..x...x...x...x.',
  },
  bass: { pattern: 'rorororororororo', type: 'sawtooth', filter: 760, vol: 0.3, len: 0.8 },
  pad: { vol: 0.027, filter: 1400, from: 0 },
  arp: { pattern: '0.1.2.1.0.1.2.1.', octave: 0, type: 'triangle', vol: 0.1, filter: 1800, from: 2 },
  lead: {
    type: 'sawtooth',
    vol: 0.2,
    filter: 3200,
    octave: 2,
    from: 4,
    notes: [
      [0, 0, 7, 3], [0, 3, 10, 3], [0, 6, 12, 2], [0, 8, 10, 2], [0, 10, 7, 2], [0, 12, 5, 4],
      [1, 0, 3, 3], [1, 3, 5, 3], [1, 6, 7, 6], [1, 12, 3, 4],
      [2, 0, 7, 3], [2, 3, 10, 3], [2, 6, 15, 2], [2, 8, 17, 2], [2, 10, 15, 2], [2, 12, 10, 4],
      [3, 0, 12, 3], [3, 3, 10, 3], [3, 6, 5, 3], [3, 9, 7, 7, 0.5],
    ],
  },
};

/** 城市 CITY: city pop funk. The IV–V–iii–vi turn in seventh chords, a slap bass, electric piano stabs, a swing. */
const city = {
  name: '城市 CITY POP',
  bpm: 112,
  key: 261.63,
  bars: 4,
  swing: 0.14,
  chords: [CHORD.M7(5), CHORD.d7(7), CHORD.m7(4), CHORD.m7(9)],
  delay: { steps: 3, send: 0.18, feedback: 0.3 },
  drums: {
    kick: ['x.....x...x.....', 'x.....x...x..x..'],
    snare: '....x..g.g..x..g',
    hat: 'xxXxxxXxxxXxxxXx',
    open: '..............x.',
  },
  bass: { pattern: ['r..o.r.o..5.o.r.', 'r..o.r.o..r.73.o'], type: 'square', filter: 900, vol: 0.23, len: 0.6, sub: 0.55 },
  keys: { pattern: '..x...x...x...x-', voice: 'epiano', octave: 0, vol: 0.26 },
  lead: {
    type: 'square',
    vol: 0.14,
    filter: 2400,
    octave: 1,
    from: 2,
    notes: [
      [0, 2, 12, 2], [0, 4, 14, 2], [0, 6, 16, 4, -2], [0, 12, 14, 2], [0, 14, 12, 2],
      [1, 0, 11, 4], [1, 6, 14, 2], [1, 8, 19, 6, -1],
      [2, 2, 16, 2], [2, 4, 14, 2], [2, 6, 12, 2], [2, 8, 11, 2], [2, 10, 12, 4],
      [3, 0, 9, 6], [3, 8, 7, 2], [3, 10, 9, 2], [3, 12, 12, 4, 0.5],
    ],
  },
};

/** 碎拍 BREAKS: drum and bass. A two-step break at 172, a detuned reese bass, rave stabs on the bar. */
const breaks = {
  name: '碎拍 BREAKS',
  bpm: 172,
  key: 174.61,
  bars: 4,
  chords: [CHORD.m(0), CHORD.M(-4), CHORD.M(3), CHORD.M(-2)],
  delay: { steps: 6, send: 0.22, feedback: 0.35 },
  drums: {
    kick: ['x.........x.....', 'x.x.......x.....'],
    snare: ['....X..g.g..X...', '....X..g.g..X.gg'],
    hat: 'x.x.x.x.x.x.x.x.',
    from: 0,
  },
  bass: { pattern: 'r-------r---5---', voice: 'reese', filter: 420, vol: 0.1, len: 1, sub: 0.9, from: 2 },
  pad: { vol: 0.029, filter: 1100, from: 0 },
  keys: { pattern: 'x.........x.....', voice: 'stab', octave: 1, vol: 0.23, from: 2 },
  lead: {
    type: 'square',
    vol: 0.15,
    filter: 2600,
    octave: 2,
    from: 6,
    notes: [
      [0, 0, 12, 2], [0, 3, 10, 2], [0, 6, 7, 2], [0, 10, 3, 4],
      [1, 0, 8, 2], [1, 3, 7, 2], [1, 6, 3, 2], [1, 10, 0, 4],
      [2, 0, 15, 2], [2, 3, 12, 2], [2, 6, 10, 2], [2, 10, 7, 4],
      [3, 0, 10, 2], [3, 3, 7, 2], [3, 6, 5, 2], [3, 10, 7, 6, 0.5],
    ],
  },
};

/**
 * 夢遊 DREAM: eighties synth-pop for slowed time (the developer: "something that brings Quicksilver's
 * slow-motion scene to mind"). Its own tune: a cold drum machine, a sixteenth-note sequenced bass, a
 * long, voice-like line over i–iv–VII–VI in G minor, a dreamy pad; bullet time slows it like tape.
 */
const dream = {
  name: '夢遊 DREAM',
  bpm: 124,
  key: 196,
  bars: 4,
  chords: [CHORD.m(0), CHORD.m(5), CHORD.M(-2), CHORD.M(-4)],
  delay: { steps: 3, send: 0.3, feedback: 0.42 },
  drums: {
    kick: ['x.....x.x.......', 'x.....x.x.....x.'],
    snare: '....x.......x...',
    clap: '....x.......x...',
    hat: 'x.X.x.X.x.X.x.X.',
  },
  bass: { pattern: 'ro.ro.5.ro.ro.3.', type: 'square', filter: 700, vol: 0.28, len: 0.7, sub: 0.5 },
  pad: { vol: 0.03, filter: 1200, from: 0 },
  arp: { pattern: '0.2.1.2.0.2.1.2.', octave: 1, type: 'sine', vol: 0.05, filter: 4000, from: 2 },
  lead: {
    type: 'triangle',
    vol: 0.26,
    filter: 2400,
    octave: 1,
    from: 4,
    notes: [
      [0, 0, 7, 6], [0, 6, 10, 2], [0, 8, 7, 4], [0, 12, 5, 4],
      [1, 0, 8, 6], [1, 6, 7, 2], [1, 8, 5, 8],
      [2, 0, 17, 4], [2, 4, 14, 4], [2, 8, 10, 8, -2],
      [3, 0, 12, 6], [3, 6, 10, 2], [3, 8, 8, 4], [3, 12, 7, 4, 0.5],
    ],
  },
};

/**
 * 血債 VENDETTA: dark industrial pop for a vendetta (the developer: "something that brings John Wick to
 * mind"). Its own tune: half-time drums at 140 with a tom fill, a rough bass, string-like stabs and a
 * line that leans on the flat second (E Phrygian: E minor, F, E minor, D).
 */
const vendetta = {
  name: '血債 VENDETTA',
  bpm: 140,
  key: 164.81,
  bars: 4,
  chords: [CHORD.m(0), CHORD.M(1), CHORD.m(0), CHORD.M(-2)],
  delay: { steps: 2, send: 0.16, feedback: 0.3 },
  drums: {
    kick: ['x.........x.x...', 'x.x.......x...x.', 'x.........x.x...', 'x.x.......x.....'],
    snare: '........X.......',
    clap: '........x.......',
    hat: 'x.x.x.x.x.x.x.x.',
    open: '..............x.',
    tom: ['................', '................', '................', '..........x.xxxx'],
  },
  bass: { pattern: 'r.r.rr.r.r.rr.r.', voice: 'grit', filter: 950, vol: 0.2, len: 0.75, sub: 0.6 },
  pad: { vol: 0.024, filter: 700, from: 0 },
  keys: { pattern: 'x.....x.....x...', voice: 'stab', octave: 1, vol: 0.27, from: 2 },
  lead: {
    type: 'square',
    vol: 0.15,
    filter: 2200,
    octave: 1,
    from: 4,
    notes: [
      [0, 0, 12, 2], [0, 2, 13, 2], [0, 4, 12, 2], [0, 6, 7, 2], [0, 8, 10, 4], [0, 12, 7, 4],
      [1, 0, 13, 2], [1, 2, 12, 2], [1, 4, 13, 4], [1, 8, 17, 6], [1, 14, 15, 2],
      [2, 0, 12, 2], [2, 2, 13, 2], [2, 4, 12, 2], [2, 6, 19, 2], [2, 8, 17, 4], [2, 12, 15, 4],
      [3, 0, 14, 6], [3, 6, 12, 2], [3, 8, 10, 8, -1],
    ],
  },
};

export const SONGS = { classic, neon, city, breaks, dream, vendetta };

const hz = (semi, base) => base * Math.pow(2, semi / 12);
const at16 = (p, bar) => (Array.isArray(p) ? p[bar % p.length] : p);
const on = (part, bar) => part && bar >= (part.from || 0);

/** How many sixteenths a note at `s` lasts: itself and the holds (-) after it. */
function held(pattern, s) {
  let n = 1;
  while (s + n < 16 && pattern[s + n] === '-') n++;
  return n;
}

/** A bass note below middle: the chord's root folded into the octave around the key. */
const bassSemi = (root) => {
  const s = ((root % 12) + 12) % 12;
  return s > 6 ? s - 12 : s;
};

// ------------------------------------------------------------------ voices

const voice = {
  kick(a, at, r, vol, bus) {
    a.tone({ type: 'sine', f0: 155 * r, f1: 44 * r, dur: 0.3 / r, vol, at, bus });
    a.noise({ type: 'highpass', freq: 3500 * r, dur: 0.012 / r, vol: vol * 0.18, at, bus });
  },
  snare(a, at, r, vol, bus) {
    a.noise({ type: 'bandpass', freq: 1900 * r, q: 0.7, dur: 0.2 / r, vol, at, bus });
    a.tone({ type: 'triangle', f0: 210 * r, f1: 120 * r, dur: 0.1 / r, vol: vol * 0.45, at, bus });
  },
  clap(a, at, r, vol, bus) {
    for (const d of [0, 0.011, 0.023]) a.noise({ type: 'bandpass', freq: 1400 * r, q: 0.6, dur: 0.02 / r, vol, at, delay: d / r, bus });
    a.noise({ type: 'bandpass', freq: 1500 * r, q: 0.5, dur: 0.26 / r, vol: vol * 0.7, at, delay: 0.03 / r, bus });
  },
  tom(a, at, r, vol, bus, pitch = 1) {
    a.tone({ type: 'sine', f0: 200 * pitch * r, f1: 72 * pitch * r, dur: 0.3 / r, vol, at, bus });
    a.noise({ type: 'bandpass', freq: 900 * pitch * r, q: 0.8, dur: 0.05 / r, vol: vol * 0.25, at, bus });
  },
  hat(a, at, r, vol, bus, open = false) {
    a.noise({ type: 'highpass', freq: (open ? 7000 : 8500) * r, dur: (open ? 0.22 : 0.035) / r, vol, at, bus });
  },
  bass(a, at, r, f, dur, b, bus) {
    if (b.voice === 'reese') {
      for (const k of [0.994, 1.006]) a.tone({ type: 'sawtooth', f0: f * k * r, dur, vol: b.vol, attack: 0.02 / r, at, bus, filter: b.filter * r });
    } else if (b.voice === 'grit') {
      // rough: a saw and a square a hair apart, through one filter
      a.tone({ type: 'sawtooth', f0: f * r, dur, vol: b.vol, at, bus, filter: b.filter * r });
      a.tone({ type: 'square', f0: f * 1.005 * r, dur, vol: b.vol * 0.7, at, bus, filter: b.filter * r });
    } else {
      a.tone({ type: b.type || 'sawtooth', f0: f * r, dur, vol: b.vol, at, bus, filter: b.filter * r + 100 });
    }
    if (b.sub) a.tone({ type: 'sine', f0: f * r, dur, vol: b.vol * b.sub, attack: 0.008 / r, at, bus });
  },
  keys(a, at, r, chord, base, dur, k, bus) {
    const n = chord.length;
    for (const semi of chord) {
      const f = hz(semi + 12 * (k.octave || 0), base) * r;
      if (k.voice === 'epiano') {
        a.tone({ type: 'sine', f0: f, dur: Math.max(dur, 0.22 / r), vol: k.vol / n, at, bus });
        a.tone({ type: 'triangle', f0: f * 2, dur: 0.08 / r, vol: (k.vol * 0.4) / n, at, bus });
      } else {
        for (const d of [0.996, 1.004]) a.tone({ type: 'sawtooth', f0: f * d, dur: Math.max(dur, 0.16 / r), vol: k.vol / n, at, bus, filter: 2400 * r });
      }
    }
  },
  pad(a, at, r, chord, base, dur, p, bus) {
    for (const semi of chord) {
      for (const d of [0.997, 1.003]) a.tone({ type: 'sawtooth', f0: hz(semi, base) * r * d, dur, vol: p.vol, attack: 0.4 / r, at, bus, filter: p.filter * r });
    }
  },
};

/**
 * Play step `step` (counted from the song's start, so a song can build up bar by bar) at time `at`
 * on AudioSys `a`'s music buses, `r` the tape rate (1, lower in slow motion).
 */
export function playStep(a, song, step, at, r = 1) {
  const bar = Math.floor(step / 16);
  const loopBar = bar % song.bars;
  const s = step % 16;
  const chord = song.chords[loopBar];
  const stepDur = 60 / song.bpm / 4 / r;
  const t = at + (s % 2 === 1 ? (song.swing || 0) * stepDur : 0);
  const dry = a.music;
  const wet = a.musicWet || a.music;
  const base = song.key;

  // drum levels sit against the kick (snare and clap about 4 dB under it, hats about 14); a song's mix scales them
  const mx = { kick: 1, snare: 1, clap: 1, hat: 1, ...song.mix };
  const d = song.drums;
  if (on(d, bar)) {
    const hit = (p) => (p ? at16(p, bar)[s] : '.');
    const k = hit(d.kick);
    if (k !== '.') voice.kick(a, t, r, (k === 'X' ? 0.52 : 0.45) * mx.kick, dry);
    const sn = hit(d.snare);
    if (sn !== '.') voice.snare(a, t, r, (sn === 'g' ? 0.18 : sn === 'X' ? 1 : 0.78) * mx.snare, sn === 'g' ? dry : wet);
    const cl = hit(d.clap);
    if (cl !== '.') voice.clap(a, t, r, 1.3 * mx.clap, wet);
    const h = hit(d.hat);
    if (h !== '.') voice.hat(a, t, r, (h === 'X' ? 0.3 : 0.19) * mx.hat, dry);
    const o = hit(d.open);
    if (o !== '.') voice.hat(a, t, r, 0.09 * mx.hat, dry, true);
    const tm = hit(d.tom);
    if (tm !== '.') voice.tom(a, t, r, (tm === 'X' ? 0.95 : 0.75) * (mx.tom || 1), wet, 1.3 - (s / 16) * 0.6);
  }

  const b = song.bass;
  if (on(b, bar)) {
    const p = at16(b.pattern, bar);
    const c = p[s];
    if (c !== '.' && c !== '-') {
      const root = bassSemi(chord[0]);
      const semi = c === 'o' ? root + 12 : c === '5' ? root + 7 : c === '3' ? root + (chord[1] - chord[0]) : c === '7' ? root + ((chord[3] ?? chord[2]) - chord[0]) : root;
      voice.bass(a, t, r, hz(semi, base / 4), stepDur * held(p, s) * (b.len || 1.6), b, dry);
    }
  }

  const k = song.keys;
  if (on(k, bar)) {
    const p = at16(k.pattern, bar);
    if (p[s] === 'x') voice.keys(a, t, r, chord, base, stepDur * held(p, s) * 0.9, k, wet);
  }

  const ar = song.arp;
  if (on(ar, bar)) {
    const c = at16(ar.pattern, bar)[s];
    if (c >= '0' && c <= '9') {
      const semi = chord[Number(c) % chord.length] + 12 * (ar.octave || 0) + (ar.upper && s >= ar.upper ? 12 : 0);
      a.tone({ type: ar.type, f0: hz(semi, base) * r, dur: stepDur * 0.9, vol: ar.vol, at: t, bus: wet, filter: ar.filter * r });
    }
  }

  const pd = song.pad;
  if (on(pd, bar) && s === 0) voice.pad(a, t, r, chord, base, stepDur * 16, pd, dry);

  const l = song.lead;
  if (on(l, bar)) {
    for (const [nb, ns, semi, len, slide = 0] of l.notes) {
      if (nb !== loopBar || ns !== s) continue;
      const f = hz(semi + 12 * (l.octave || 0) - 12, base) * r;
      a.tone({ type: l.type, f0: f, f1: slide ? f * Math.pow(2, slide / 12) : 0, dur: stepDur * len * 0.95, vol: l.vol, attack: 0.01 / r, at: t, bus: wet, filter: l.filter * r });
    }
  }
}
