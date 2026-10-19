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
// Toms fall in pitch through the bar, so a run of them is a fill. A swell rises
// from its step to the end of the bar. With `kit: 'epic'` the kick is a taiko
// and the snare a trailer hit, both through the hall (`hall`: a made-up room).
// Parts may name a voice: strings or organ (an arp), brass (a pad, its filter
// opening like a swell) or organ (a pad), horn (a lead); `choir` is a second
// pad. `shepard` is a tone that seems to rise for ever (`rise` semitones a bar).
//
// In the game a song plays at a level (AudioSys.musicLevel, set each wave): a
// part with `level: 1` waits for a stage's later waves, and at level 2 (the
// last wave, a boss) the song's `boss` changes take over, its boss section.
// A lead is a list of [bar, step, semitones above the key, steps long, slide].
//
// The music follows the fight too (音樂 ③): while a beat's doors are telegraphed
// (waves.js, AudioSys.kickOnly) only the kick plays, and everything comes back
// as the beat lands; a song's `slow` says what of it is left in bullet time
// (`parts`, and `drums` within the drums), the rest dropping out. Cantonese
// opera percussion (鑼鼓): block 木魚, shadi 沙的, gong 大鑼, cymbal 鈸; and a
// brush for a brushed snare. A bass may be an upright (voice 'upright'), a lead
// a muted trumpet ('mute') or a suona ('suona').

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

/**
 * 暗湧 UNDERTOW: tension in the manner of a Hans Zimmer score (the developer's other pick). A low
 * drone, a sixteenth-note string ostinato, one brass braam a bar whose filter opens, a ticking clock,
 * a slow horn that climbs, over i–VI–iv–V in A minor.
 */
const undertow = {
  name: '暗湧 UNDERTOW',
  bpm: 120,
  key: 220,
  bars: 4,
  kit: 'epic',
  hall: { seconds: 3.6, send: 0.5 },
  chords: [CHORD.m(0), CHORD.M(-4), CHORD.m(5), CHORD.M(7)],
  delay: { steps: 3, send: 0.1, feedback: 0.25 },
  mix: { tick: 6, swell: 4 },
  drums: {
    kick: ['x...............', 'x...............', 'x...............', 'x.......x...x.x.'],
    tick: 'x.x.x.x.x.x.x.x.',
    swell: ['................', '................', '................', '........x.......'],
  },
  bass: { pattern: 'r---------------', type: 'sawtooth', filter: 320, vol: 0.22, len: 1, sub: 0.9 },
  arp: { pattern: '0.10.10.0.10.10.', voice: 'strings', octave: -1, vol: 0.3, filter: 2600 },
  pad: { voice: 'brass', octave: -1, vol: 0.15, filter: 1800, from: 0 },
  choir: { vol: 0.11, from: 4, level: 1 },
  lead: {
    voice: 'horn',
    vol: 0.32,
    filter: 1500,
    octave: 0,
    from: 4,
    level: 1,
    notes: [
      [0, 0, 12, 8], [0, 8, 11, 4], [0, 12, 12, 4],
      [1, 0, 15, 8], [1, 8, 12, 8],
      [2, 0, 17, 8], [2, 8, 15, 8],
      [3, 0, 11, 8], [3, 8, 19, 8],
    ],
  },
};

/**
 * 倒數 COUNTDOWN: the undertow's sister, more urgent. Sixteenth-note ticking, a tone that seems to rise
 * for ever, a pulsing bass and relentless strings over i–i–VI–V in D minor; a horn line that climbs.
 */
const countdown = {
  name: '倒數 COUNTDOWN',
  bpm: 126,
  key: 146.83,
  bars: 4,
  kit: 'epic',
  hall: { seconds: 3.2, send: 0.45 },
  chords: [CHORD.m(0), CHORD.m(0), CHORD.M(-4), CHORD.M(7)],
  delay: { steps: 3, send: 0.08, feedback: 0.2 },
  mix: { tick: 5, swell: 4 },
  drums: {
    kick: ['x.......x.......', 'x.......x.......', 'x.......x.......', 'x...x...x.x.x.x.'],
    tick: 'xxxxxxxxxxxxxxxx',
    swell: ['................', '................', '................', '........x.......'],
  },
  bass: { pattern: 'r.r.r.r.r.r.r.r.', type: 'sawtooth', filter: 380, vol: 0.24, len: 0.5, sub: 0.7 },
  arp: { pattern: '0101010101010101', voice: 'strings', octave: 0, vol: 0.25, filter: 2800 },
  pad: { voice: 'brass', octave: -1, vol: 0.12, filter: 1600, from: 2 },
  shepard: { vol: 0.1, rise: 2, from: 0 },
  lead: {
    voice: 'horn',
    vol: 0.3,
    filter: 1600,
    octave: 1,
    from: 4,
    level: 1,
    notes: [
      [0, 0, 7, 8], [0, 8, 8, 8],
      [1, 0, 10, 8], [1, 8, 12, 8],
      [2, 0, 15, 8], [2, 8, 17, 8],
      [3, 0, 19, 12], [3, 12, 18, 4],
    ],
  },
};

/**
 * 深淵 ABYSS: the undertow's slow, deep sister. Organ chords and a slow organ arpeggio, a choir, a drone,
 * a boom a bar and a quarter-note tick over i–iv–i–VI in E minor; a horn holds long notes above.
 */
const abyss = {
  name: '深淵 ABYSS',
  bpm: 96,
  key: 164.81,
  bars: 4,
  kit: 'epic',
  hall: { seconds: 4, send: 0.55 },
  chords: [CHORD.m(0), CHORD.m(5), CHORD.m(0), CHORD.M(-4)],
  delay: { steps: 4, send: 0.1, feedback: 0.3 },
  mix: { tick: 5, swell: 4 },
  drums: {
    kick: ['x...............', 'x...............', 'x...............', 'x.......x.....x.'],
    tick: 'x...x...x...x...',
    swell: ['................', '................', '................', 'x...............'],
  },
  bass: { pattern: 'r---------------', type: 'sawtooth', filter: 260, vol: 0.24, len: 1, sub: 1 },
  pad: { voice: 'organ', octave: 0, vol: 0.06, from: 0 },
  arp: { pattern: '0.1.2.1.0.1.2.1.', voice: 'organ', octave: 1, vol: 0.1, from: 2 },
  choir: { vol: 0.12, from: 4, level: 1 },
  lead: {
    voice: 'horn',
    vol: 0.3,
    filter: 1400,
    octave: 1,
    from: 4,
    level: 1,
    notes: [
      [0, 0, 7, 16],
      [1, 0, 12, 16],
      [2, 0, 11, 16],
      [3, 0, 7, 8], [3, 8, 3, 8],
    ],
  },
};

// the boss sections: the drums double up with trailer hits on two and four, the strings run in sixteenths
undertow.boss = {
  drums: {
    kick: ['x.......x.......', 'x.......x.......', 'x.......x.......', 'x...x...x.x.x.xx'],
    snare: '....x.......x...',
    tick: 'xxxxxxxxxxxxxxxx',
    swell: ['................', '................', '................', '........x.......'],
  },
  arp: { ...undertow.arp, pattern: '0101010101010101' },
};
countdown.boss = {
  drums: {
    kick: ['x...x...x...x...', 'x...x...x...x...', 'x...x...x...x...', 'x.x.x.x.x.xxxxxx'],
    snare: '....x.......x...',
    tick: 'xxxxxxxxxxxxxxxx',
    swell: ['................', '................', '................', 'x...............'],
  },
  bass: { ...countdown.bass, pattern: 'rrrrrrrrrrrrrrrr' },
};
abyss.boss = {
  drums: {
    kick: ['x.......x.......', 'x.......x.......', 'x.......x.......', 'x...x...x.x.xxxx'],
    snare: '........x.......',
    tick: 'x.x.x.x.x.x.x.x.',
    swell: ['................', '................', '................', '........x.......'],
  },
  arp: { ...abyss.arp, pattern: '0121012101210121' },
};

/**
 * 鑼鼓電子 GONG & DRUM (音樂 ③, a new direction): Cantonese opera percussion over a house floor. Woodblock
 * and shadi keep a busy time, the big gong and cymbals punctuate the phrase, a four-on-the-floor kick
 * and an off-beat bass carry it, and a suona line comes in for the later waves. In bullet time only the
 * 鑼鼓 are left. i–i–VII–i in A minor.
 */
const gong = {
  name: '鑼鼓電子 GONG & DRUM',
  bpm: 128,
  key: 220,
  bars: 4,
  chords: [CHORD.m(0), CHORD.m(0), CHORD.M(-2), CHORD.m(0)],
  delay: { steps: 3, send: 0.14, feedback: 0.22 },
  mix: { kick: 1, hat: 0.8 },
  drums: {
    kick: 'x...x...x...x...',
    open: '..x...x...x...x.',
    block: ['x.xx.x.xx.x.x.xx', 'x.xx.x.xx.x.xxxx', 'x.xx.x.xx.x.x.xx', 'xxxxx.x.xxxxX.X.'],
    shadi: ['x..x..x...x..x..', 'x..x..x...x.x.x.', 'x..x..x...x..x..', 'x.x.x.x.xxxxx...'],
    gong: ['............x...', '................', '............x...', 'X...........x...'],
    cymbal: ['....x.......x...', '....x.......x...', '....x.......x...', '....x...x.x.X...'],
  },
  bass: { pattern: '..r...r...r...r.', type: 'sawtooth', filter: 520, vol: 0.27, len: 0.9, sub: 0.8 },
  lead: {
    voice: 'suona',
    vol: 0.34,
    filter: 1900,
    octave: 1,
    from: 4,
    level: 1,
    notes: [
      [0, 0, 12, 2], [0, 2, 15, 2], [0, 4, 12, 4], [0, 8, 10, 2], [0, 10, 7, 6],
      [1, 0, 5, 2], [1, 2, 7, 2], [1, 4, 10, 4], [1, 8, 12, 8],
      [2, 0, 15, 2], [2, 2, 17, 2], [2, 4, 15, 4], [2, 8, 12, 2], [2, 10, 10, 6],
      [3, 0, 7, 4], [3, 4, 5, 4], [3, 8, 0, 8, 2],
    ],
  },
  slow: { parts: ['drums'], drums: ['block', 'shadi', 'gong', 'cymbal'] }, // bullet time: the 鑼鼓 alone
  // the boss section: the percussion doubles up, the gong every two bars
  boss: {
    mix: { kick: 1.15, hat: 0.8 },
    drums: {
      kick: 'x...x...x...x.x.',
      open: '..x...x...x...x.',
      block: 'xxxxx.xxxxxxx.xx',
      shadi: 'x.x.x.x.x.x.xxxx',
      gong: ['X...............', '............x...'],
      cymbal: 'x...x...x...X.x.',
    },
  },
};

/**
 * 電子搖擺 ELECTRO SWING (音樂 ③, a new direction): a brushed kit swung over a house kick, a walking upright
 * bass, electric piano stabs on the off-beats and a muted trumpet for the later waves. i–iv–V7–i in A minor
 * at 118 BPM; bullet time plays it at tape half speed like the others.
 */
const swing = {
  name: '電子搖擺 ELECTRO SWING',
  bpm: 118,
  key: 220,
  bars: 4,
  swing: 0.4,
  chords: [CHORD.m(0), CHORD.m(5), CHORD.d7(7), CHORD.m(0)],
  delay: { steps: 3, send: 0.18, feedback: 0.25 },
  mix: { kick: 0.95, clap: 0.6, hat: 0.9 },
  drums: {
    kick: 'x...x...x...x...',
    brush: 'g.g.X.g.g.g.X.g.',
    hat: '..x...x...x...x.',
    clap: '....x.......x...',
  },
  bass: { pattern: 'r...3...5...7...', voice: 'upright', vol: 0.3, len: 0.9 },
  keys: { pattern: '..x...x...x...x.', voice: 'epiano', vol: 0.24 },
  lead: {
    voice: 'mute',
    vol: 0.3,
    filter: 1500,
    octave: 1,
    from: 4,
    level: 1,
    notes: [
      [0, 0, 12, 3], [0, 3, 15, 1], [0, 4, 12, 2], [0, 6, 10, 2], [0, 8, 7, 4], [0, 12, 10, 4],
      [1, 0, 17, 3], [1, 3, 15, 1], [1, 4, 17, 2], [1, 6, 15, 2], [1, 8, 12, 8],
      [2, 0, 19, 3], [2, 3, 17, 1], [2, 4, 14, 2], [2, 6, 11, 2], [2, 8, 14, 4], [2, 12, 11, 4],
      [3, 0, 12, 6], [3, 6, 10, 2], [3, 8, 7, 4], [3, 12, 12, 4, -2],
    ],
  },
  // the boss section: the brush gives way to a snare on every beat, double-time hats
  boss: {
    mix: { kick: 1, clap: 0.6, hat: 1 },
    drums: {
      kick: 'x...x...x...x...',
      snare: '....X.......X...',
      brush: 'g.g.g.g.g.g.g.g.',
      hat: 'x.x.x.x.x.x.x.x.',
      clap: '....x.......x...',
    },
  },
};

export const SONGS = { classic, neon, city, breaks, dream, vendetta, undertow, countdown, abyss, gong, swing };

const hz = (semi, base) => base * Math.pow(2, semi / 12);
const at16 = (p, bar) => (Array.isArray(p) ? p[bar % p.length] : p);
const on = (part, bar, level) => part && bar >= (part.from || 0) && (part.level || 0) <= level;

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
  taiko(a, at, r, vol, bus) {
    a.tone({ type: 'sine', f0: 100 * r, f1: 42 * r, dur: 0.7 / r, vol, at, bus });
    a.noise({ type: 'lowpass', freq: 380 * r, dur: 0.14 / r, vol: vol * 0.5, at, bus });
    a.noise({ type: 'bandpass', freq: 1200 * r, q: 0.7, dur: 0.03 / r, vol: vol * 0.15, at, bus });
  },
  hit(a, at, r, vol, bus) {
    a.noise({ type: 'bandpass', freq: 1300 * r, q: 0.5, dur: 0.45 / r, vol, at, bus });
    a.tone({ type: 'triangle', f0: 160 * r, f1: 90 * r, dur: 0.25 / r, vol: vol * 0.5, at, bus });
  },
  tick(a, at, r, vol, bus) {
    a.noise({ type: 'bandpass', freq: 3400 * r, q: 3, dur: 0.012 / r, vol, at, bus });
  },
  swell(a, at, r, len, vol, bus) {
    a.noise({ type: 'highpass', freq: 1800 * r, freqEnd: 7000 * r, attack: len * 0.92, dur: len, vol, at, bus });
  },
  tom(a, at, r, vol, bus, pitch = 1) {
    a.tone({ type: 'sine', f0: 200 * pitch * r, f1: 72 * pitch * r, dur: 0.3 / r, vol, at, bus });
    a.noise({ type: 'bandpass', freq: 900 * pitch * r, q: 0.8, dur: 0.05 / r, vol: vol * 0.25, at, bus });
  },
  hat(a, at, r, vol, bus, open = false) {
    a.noise({ type: 'highpass', freq: (open ? 7000 : 8500) * r, dur: (open ? 0.22 : 0.035) / r, vol, at, bus });
  },
  // Cantonese opera percussion (鑼鼓)
  block(a, at, r, vol, bus) {
    // 木魚: a woody tok
    a.tone({ type: 'sine', f0: 1150 * r, f1: 880 * r, dur: 0.06 / r, vol, at, bus });
    a.noise({ type: 'bandpass', freq: 2600 * r, q: 4, dur: 0.02 / r, vol: vol * 0.5, at, bus });
  },
  shadi(a, at, r, vol, bus) {
    // 沙的: the small high drum, a sharp dik
    a.noise({ type: 'bandpass', freq: 3200 * r, q: 2.5, dur: 0.05 / r, vol, at, bus });
    a.tone({ type: 'triangle', f0: 1400 * r, f1: 700 * r, dur: 0.05 / r, vol: vol * 0.6, at, bus });
  },
  gong(a, at, r, vol, bus) {
    // 大鑼: inharmonic partials that sag in pitch after the hit, the Cantonese gong's "wong"
    for (const [k, w] of [
      [1, 1],
      [1.47, 0.6],
      [2.09, 0.4],
      [2.74, 0.25],
    ])
      a.tone({ type: 'sine', f0: 180 * k * 1.06 * r, f1: 180 * k * 0.94 * r, dur: 1.6 / r, vol: vol * w, attack: 0.02 / r, at, bus });
    a.noise({ type: 'bandpass', freq: 900 * r, q: 1, dur: 0.25 / r, vol: vol * 0.4, at, bus });
  },
  cymbal(a, at, r, vol, bus) {
    // 鈸: a pair of cymbals clashed
    a.noise({ type: 'highpass', freq: 5000 * r, dur: 0.5 / r, vol, at, bus });
    a.noise({ type: 'bandpass', freq: 3300 * r, q: 2, dur: 0.35 / r, vol: vol * 0.7, at, bus });
    a.tone({ type: 'square', f0: 2300 * r, f1: 2100 * r, dur: 0.2 / r, vol: vol * 0.08, at, bus });
  },
  brush(a, at, r, vol, bus, swish = false) {
    // a brushed snare: a swish stirred across the head, or a hit
    a.noise({ type: 'bandpass', freq: 2400 * r, q: 0.6, dur: (swish ? 0.18 : 0.12) / r, attack: (swish ? 0.05 : 0.004) / r, vol, at, bus });
    if (!swish) a.tone({ type: 'triangle', f0: 190 * r, f1: 140 * r, dur: 0.06 / r, vol: vol * 0.3, at, bus });
  },
  bass(a, at, r, f, dur, b, bus) {
    if (b.voice === 'reese') {
      for (const k of [0.994, 1.006]) a.tone({ type: 'sawtooth', f0: f * k * r, dur, vol: b.vol, attack: 0.02 / r, at, bus, filter: b.filter * r });
    } else if (b.voice === 'grit') {
      // rough: a saw and a square a hair apart, through one filter
      a.tone({ type: 'sawtooth', f0: f * r, dur, vol: b.vol, at, bus, filter: b.filter * r });
      a.tone({ type: 'square', f0: f * 1.005 * r, dur, vol: b.vol * 0.7, at, bus, filter: b.filter * r });
    } else if (b.voice === 'upright') {
      // a plucked upright: the string's body, a round fundamental under it, the pluck's click
      a.tone({ type: 'triangle', f0: f * r, dur, vol: b.vol, attack: 0.004 / r, at, bus, filter: 420 * r });
      a.tone({ type: 'sine', f0: f * r, dur: dur * 0.8, vol: b.vol * 0.8, attack: 0.004 / r, at, bus });
      a.noise({ type: 'bandpass', freq: 1200 * r, q: 1.5, dur: 0.015 / r, vol: b.vol * 0.25, at, bus });
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
    const o = 12 * (p.octave || 0);
    for (const semi of chord) {
      const f = hz(semi + o, base) * r;
      if (p.voice === 'brass') {
        // low brass: the filter opens over the first beat, a braam
        for (const d of [0.996, 1.004]) a.tone({ type: 'sawtooth', f0: f * d, dur, vol: p.vol, attack: 0.09 / r, at, bus, filter: 180 * r, filterTo: p.filter * r, sweep: 0.5 / r });
      } else if (p.voice === 'organ') {
        // an organ: the note and its first harmonics, held
        for (const [h, k] of [
          [1, 1],
          [2, 0.5],
          [3, 0.3],
          [4, 0.18],
        ])
          a.tone({ type: 'sine', f0: f * h, dur, vol: p.vol * k, attack: 0.25 / r, at, bus });
      } else if (p.voice === 'choir') {
        // voices: an "ah", two saws through the vowel's band, slow to come in
        for (const d of [0.995, 1.005]) a.tone({ type: 'sawtooth', f0: f * 2 * d, dur, vol: p.vol, attack: 0.6 / r, at, bus, filter: 950 * r, filterType: 'bandpass', q: 1.1 });
      } else {
        for (const d of [0.997, 1.003]) a.tone({ type: 'sawtooth', f0: f * d, dur, vol: p.vol, attack: 0.4 / r, at, bus, filter: p.filter * r });
      }
    }
  },
};

/**
 * Play step `step` (counted from the song's start, so a song can build up bar by bar) at time `at`
 * on AudioSys `a`'s music buses, `r` the tape rate (1, lower in slow motion).
 */
export function playStep(a, song, step, at, r = 1) {
  const level = a.musicLevel ?? 1;
  if (level >= 2 && song.boss) song = { ...song, ...song.boss };
  // what of the song plays now: the kick alone while a beat is telegraphed; in bullet time what its `slow` keeps
  const kickOnly = !!a.kickOnly;
  const slow = (a.slow || 0) > 0.5 && song.slow ? song.slow : null;
  const plays = (part) => !kickOnly && (!slow || slow.parts.includes(part));
  const drumPlays = (name) => (kickOnly ? name === 'kick' : !slow || !slow.drums || slow.drums.includes(name));
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
  const mx = { kick: 1, snare: 1, clap: 1, hat: 1, block: 1, shadi: 1, gong: 1, cymbal: 1, brush: 1, ...song.mix };
  const d = song.drums;
  if (on(d, bar, level) && (kickOnly || plays('drums'))) {
    const hit = (p, name) => (p && drumPlays(name) ? at16(p, bar)[s] : '.');
    const epic = song.kit === 'epic';
    const k = hit(d.kick, 'kick');
    if (k !== '.') {
      if (epic) voice.taiko(a, t, r, (k === 'X' ? 0.62 : 0.55) * mx.kick, wet);
      else voice.kick(a, t, r, (k === 'X' ? 0.52 : 0.45) * mx.kick, dry);
    }
    const sn = hit(d.snare, 'snare');
    if (sn !== '.') {
      if (epic) voice.hit(a, t, r, (sn === 'X' ? 0.9 : 0.7) * mx.snare, wet);
      else voice.snare(a, t, r, (sn === 'g' ? 0.18 : sn === 'X' ? 1 : 0.78) * mx.snare, sn === 'g' ? dry : wet);
    }
    if (hit(d.tick, 'tick') !== '.') voice.tick(a, t, r, 0.1 * (mx.tick || 1), dry);
    if (hit(d.swell, 'swell') !== '.') voice.swell(a, t, r, stepDur * (16 - s), 0.14 * (mx.swell || 1), wet);
    const cl = hit(d.clap, 'clap');
    if (cl !== '.') voice.clap(a, t, r, 1.3 * mx.clap, wet);
    const h = hit(d.hat, 'hat');
    if (h !== '.') voice.hat(a, t, r, (h === 'X' ? 0.3 : 0.19) * mx.hat, dry);
    const o = hit(d.open, 'open');
    if (o !== '.') voice.hat(a, t, r, 0.09 * mx.hat, dry, true);
    const tm = hit(d.tom, 'tom');
    if (tm !== '.') voice.tom(a, t, r, (tm === 'X' ? 0.95 : 0.75) * (mx.tom || 1), wet, 1.3 - (s / 16) * 0.6);
    // the 鑼鼓 and the brush (a 'g' is a swish): levels against the kick like the rest
    const bl = hit(d.block, 'block');
    if (bl !== '.') voice.block(a, t, r, (bl === 'X' ? 0.3 : 0.22) * mx.block, dry);
    const sd = hit(d.shadi, 'shadi');
    if (sd !== '.') voice.shadi(a, t, r, (sd === 'X' ? 0.4 : 0.3) * mx.shadi, dry);
    const gg = hit(d.gong, 'gong');
    if (gg !== '.') voice.gong(a, t, r, (gg === 'X' ? 0.6 : 0.45) * mx.gong, wet);
    const cy = hit(d.cymbal, 'cymbal');
    if (cy !== '.') voice.cymbal(a, t, r, (cy === 'X' ? 0.45 : 0.32) * mx.cymbal, wet);
    const br = hit(d.brush, 'brush');
    if (br !== '.') voice.brush(a, t, r, (br === 'g' ? 0.14 : br === 'X' ? 0.7 : 0.5) * mx.brush, br === 'g' ? dry : wet, br === 'g');
  }

  const b = song.bass;
  if (on(b, bar, level) && plays('bass')) {
    const p = at16(b.pattern, bar);
    const c = p[s];
    if (c !== '.' && c !== '-') {
      const root = bassSemi(chord[0]);
      const semi = c === 'o' ? root + 12 : c === '5' ? root + 7 : c === '3' ? root + (chord[1] - chord[0]) : c === '7' ? root + ((chord[3] ?? chord[2]) - chord[0]) : root;
      voice.bass(a, t, r, hz(semi, base / 4), stepDur * held(p, s) * (b.len || 1.6), b, dry);
    }
  }

  const k = song.keys;
  if (on(k, bar, level) && plays('keys')) {
    const p = at16(k.pattern, bar);
    if (p[s] === 'x') voice.keys(a, t, r, chord, base, stepDur * held(p, s) * 0.9, k, wet);
  }

  const ar = song.arp;
  if (on(ar, bar, level) && plays('arp')) {
    const c = at16(ar.pattern, bar)[s];
    if (c >= '0' && c <= '9') {
      const semi = chord[Number(c) % chord.length] + 12 * (ar.octave || 0) + (ar.upper && s >= ar.upper ? 12 : 0);
      if (ar.voice === 'strings') {
        // bowed short (spiccato): two saws a hair apart, quick in, quick out
        for (const dt of [0.997, 1.003]) a.tone({ type: 'sawtooth', f0: hz(semi, base) * r * dt, dur: stepDur * 0.6, vol: ar.vol, attack: 0.006 / r, at: t, bus: wet, filter: ar.filter * r });
      } else if (ar.voice === 'organ') {
        for (const [h, k] of [
          [1, 1],
          [2, 0.45],
          [3, 0.2],
        ])
          a.tone({ type: 'sine', f0: hz(semi, base) * r * h, dur: stepDur * 1.8, vol: ar.vol * k, attack: 0.02 / r, at: t, bus: wet });
      } else a.tone({ type: ar.type, f0: hz(semi, base) * r, dur: stepDur * 0.9, vol: ar.vol, at: t, bus: wet, filter: ar.filter * r });
    }
  }

  const pd = song.pad;
  if (on(pd, bar, level) && s === 0 && plays('pad')) voice.pad(a, t, r, chord, base, stepDur * 16, pd, pd.voice === 'brass' ? wet : dry);
  const ch = song.choir;
  if (on(ch, bar, level) && s === 0 && plays('choir')) voice.pad(a, t, r, chord, base, stepDur * 16, { ...ch, voice: 'choir' }, wet);
  const sh = song.shepard;
  if (on(sh, bar, level) && s === 0 && plays('shepard')) {
    // six octaves of one note gliding up `rise` semitones a bar, loudest in the middle octaves: it seems to climb for ever
    const from = (bar * sh.rise) % 12;
    for (let k = 0; k < 6; k++) {
      const pos = (k + from / 12) / 6; // 0..1 across the octaves
      const w = Math.exp(-((pos - 0.5) ** 2) / 0.045);
      const f = (base / 4) * Math.pow(2, k + from / 12) * r;
      a.tone({ type: 'sine', f0: f, f1: f * Math.pow(2, sh.rise / 12), dur: stepDur * 16, vol: sh.vol * w, attack: stepDur * 5, at: t, bus: wet });
    }
  }

  const l = song.lead;
  if (on(l, bar, level) && plays('lead')) {
    for (const [nb, ns, semi, len, slide = 0] of l.notes) {
      if (nb !== loopBar || ns !== s) continue;
      const f = hz(semi + 12 * (l.octave || 0) - 12, base) * r;
      const f1 = slide ? f * Math.pow(2, slide / 12) : 0;
      const dur = stepDur * len * 0.95;
      if (l.voice === 'horn') {
        // a horn: two saws, a soft swell in, the filter opening a little as it sounds
        for (const d of [0.996, 1.004]) a.tone({ type: 'sawtooth', f0: f * d, dur, vol: l.vol, attack: 0.07 / r, at: t, bus: wet, filter: l.filter * 0.6 * r, filterTo: l.filter * r, sweep: 0.25 / r });
      } else if (l.voice === 'mute') {
        // a muted trumpet: a saw through a narrow band (the mute's honk), a thin square for the bite
        a.tone({ type: 'sawtooth', f0: f, f1, dur, vol: l.vol, attack: 0.03 / r, at: t, bus: wet, filter: l.filter * r, filterType: 'bandpass', q: 3 });
        a.tone({ type: 'square', f0: f * 1.003, f1: f1 * 1.003, dur, vol: l.vol * 0.35, attack: 0.03 / r, at: t, bus: wet, filter: 2600 * r });
      } else if (l.voice === 'suona') {
        // a suona: a bright saw through a band round its formant, with a reedy edge an octave up
        a.tone({ type: 'sawtooth', f0: f, f1, dur, vol: l.vol, attack: 0.02 / r, at: t, bus: wet, filter: l.filter * r, filterType: 'bandpass', q: 1.4 });
        a.tone({ type: 'sawtooth', f0: f * 2.004, f1: f1 * 2.004, dur, vol: l.vol * 0.3, attack: 0.02 / r, at: t, bus: wet, filter: l.filter * 2 * r });
      } else a.tone({ type: l.type, f0: f, f1, dur, vol: l.vol, attack: 0.01 / r, at: t, bus: wet, filter: l.filter * r });
    }
  }
}
