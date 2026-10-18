// Input recording: the StepInput of every fixed logic step, stored as changes
// only. With the run's seed and map it is everything needed to play the run
// again; this module only records and reads back (playing a run is the replay
// card's job). A ten-minute run must stay under 100 KB.
//
// Layout: a 15-byte header ("BB", version, logic Hz, seed u32, map index,
// step count u32, mode index with bit 7 set when the run opened with the
// warm-up, the run rules as rules.js packRules makes them; little-endian),
// then one entry per step whose input
// differs from the step before. An entry starts with a varint holding
// (unchanged steps skipped since the previous entry) * 32 + flags, followed by
// the fields the flags name: held controls, pressed controls (varints), the
// aim offset's change, either as one byte (x and z each -8..7 units: most
// changes are small) or as two zigzag varints, and the yaw change (zigzag
// varint). Steps after the last entry repeat it; the header's step count says
// how many there are.

import { StepInput } from './input.js';

const VERSION = 4;
const HEADER = 15;
const F_KEYS = 1;
const F_PRESSED = 2;
const F_AIM = 4;
const F_YAW = 8;
const F_NUDGE = 16; // a small aim change, packed into one byte

export class InputRecord {
  constructor({ seed = 0, map = 0, mode = 0, warmup = false, rules = 0, hz = 120 } = {}) {
    this.seed = seed >>> 0;
    this.map = map;
    this.mode = mode; // index into MODE_IDS (waves.js)
    this.warmup = warmup; // the run opened with the first-run warm-up (tutorial.js)
    this.rules = rules; // difficulty and variants, packed (rules.js packRules)
    this.hz = hz;
    this.steps = 0;
    this.buf = new Uint8Array(1 << 14);
    this.length = 0;
    this.skip = 0; // unchanged steps since the last entry
    this.prev = new StepInput(); // what the reader will have after the last entry
  }

  /** Bytes the record takes as encode() would write it now. */
  get size() {
    return HEADER + this.length;
  }

  /** Add one logic step's input. */
  push(cmd) {
    const p = this.prev;
    const dx = cmd.aimQX - p.aimQX;
    const dz = cmd.aimQZ - p.aimQZ;
    let flags = 0;
    if (cmd.keys !== p.keys) flags |= F_KEYS;
    if (cmd.pressed) flags |= F_PRESSED;
    if (dx || dz) flags |= dx >= -8 && dx <= 7 && dz >= -8 && dz <= 7 ? F_NUDGE : F_AIM;
    if (cmd.yawQ !== p.yawQ) flags |= F_YAW;
    this.steps++;
    if (!flags) {
      this.skip++;
      return;
    }
    this.uint(this.skip * 32 + flags);
    if (flags & F_KEYS) this.uint(cmd.keys);
    if (flags & F_PRESSED) this.uint(cmd.pressed);
    if (flags & F_NUDGE) this.byte(((dx + 8) << 4) | (dz + 8));
    if (flags & F_AIM) {
      this.int(dx);
      this.int(dz);
    }
    if (flags & F_YAW) this.int(cmd.yawQ - p.yawQ);
    p.keys = cmd.keys;
    p.aimQX = cmd.aimQX;
    p.aimQZ = cmd.aimQZ;
    p.yawQ = cmd.yawQ;
    this.skip = 0;
  }

  /** The record as bytes: header, then the entries. */
  encode() {
    const out = new Uint8Array(HEADER + this.length);
    const v = new DataView(out.buffer);
    out[0] = 0x42; // "BB"
    out[1] = 0x42;
    out[2] = VERSION;
    out[3] = this.hz;
    v.setUint32(4, this.seed, true);
    out[8] = this.map;
    v.setUint32(9, this.steps, true);
    out[13] = this.mode | (this.warmup ? 0x80 : 0);
    out[14] = this.rules;
    out.set(this.buf.subarray(0, this.length), HEADER);
    return out;
  }

  byte(b) {
    if (this.length === this.buf.length) {
      const grown = new Uint8Array(this.buf.length * 2);
      grown.set(this.buf);
      this.buf = grown;
    }
    this.buf[this.length++] = b;
  }

  uint(v) {
    while (v >= 128) {
      this.byte((v % 128) | 128);
      v = Math.floor(v / 128);
    }
    this.byte(v);
  }

  int(v) {
    this.uint(v < 0 ? -2 * v - 1 : 2 * v);
  }
}

/** Reads an encoded record back, one StepInput per logic step. */
export class RecordReader {
  constructor(bytes) {
    if (bytes.length < HEADER || bytes[0] !== 0x42 || bytes[1] !== 0x42) throw new Error('not an input record');
    if (bytes[2] !== VERSION) throw new Error(`input record version ${bytes[2]}, expected ${VERSION}`);
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.bytes = bytes;
    this.hz = bytes[3];
    this.seed = v.getUint32(4, true);
    this.map = bytes[8];
    this.steps = v.getUint32(9, true);
    this.mode = bytes[13] & 0x7f;
    this.warmup = (bytes[13] & 0x80) !== 0;
    this.rules = bytes[14];
    this.left = this.steps;
    this.pos = HEADER;
    this.cmd = new StepInput();
    this.head();
  }

  /** The next step's input with its aim placed relative to the player at (ox, oz); null after the last step. */
  next(ox, oz) {
    if (this.left <= 0) return null;
    this.left--;
    const c = this.cmd;
    c.pressed = 0;
    if (this.skip > 0) {
      this.skip--;
      return c.resolve(ox, oz);
    }
    const f = this.flags;
    if (f & F_KEYS) c.keys = this.uint();
    if (f & F_PRESSED) c.pressed = this.uint();
    if (f & F_NUDGE) {
      const b = this.byte();
      c.aimQX += (b >> 4) - 8;
      c.aimQZ += (b & 15) - 8;
    }
    if (f & F_AIM) {
      c.aimQX += this.int();
      c.aimQZ += this.int();
    }
    if (f & F_YAW) c.yawQ += this.int();
    this.head();
    return c.resolve(ox, oz);
  }

  head() {
    if (this.pos >= this.bytes.length) {
      this.skip = Infinity; // the last entry holds to the end
      this.flags = 0;
      return;
    }
    const h = this.uint();
    this.skip = Math.floor(h / 32);
    this.flags = h % 32;
  }

  byte() {
    if (this.pos >= this.bytes.length) throw new Error('input record cut short');
    return this.bytes[this.pos++];
  }

  uint() {
    let v = 0;
    let scale = 1;
    for (;;) {
      const b = this.byte();
      if (scale > 2 ** 35) throw new Error('input record garbled');
      v += (b & 127) * scale;
      if (b < 128) return v;
      scale *= 128;
    }
  }

  int() {
    const u = this.uint();
    return u % 2 ? -(u + 1) / 2 : u / 2;
  }

  /** Read a whole record through once; throws when it is not one, is from another version, or is cut short. */
  static check(bytes) {
    const rd = new RecordReader(bytes);
    while (rd.next(0, 0));
    return rd;
  }
}

const STORE_KEY = 'bullet-ballet.replays';
export const KEEP_REPLAYS = 10;

const toBase64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const pad = (n) => String(n).padStart(2, '0');

/** The file name a replay downloads as: bullet-ballet-20261018-1203-rooftop.bbr */
export function replayName(at, mapId) {
  const d = new Date(at);
  return `bullet-ballet-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${mapId}.bbr`;
}

/**
 * The last KEEP_REPLAYS runs in this browser: each the run's input record with a few facts for the
 * list (map, mode, rules, result, wave, score, grade, time). `storage` is localStorage or a stand-in.
 */
export class ReplayStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    try {
      const list = JSON.parse(storage.getItem(STORE_KEY) || '[]');
      this.list = Array.isArray(list) ? list.filter((r) => r && typeof r.data === 'string') : [];
    } catch {
      this.list = [];
    }
  }

  /** Keep a run's record (newest first); when storage is full the oldest go until it fits. */
  add(meta, bytes) {
    const entry = { ...meta, name: replayName(meta.at, meta.mapId), data: toBase64(bytes) };
    this.list.unshift(entry);
    this.list.length = Math.min(this.list.length, KEEP_REPLAYS);
    while (this.list.length) {
      try {
        this.storage.setItem(STORE_KEY, JSON.stringify(this.list));
        break;
      } catch {
        if (this.list.length === 1) {
          this.list = [];
          break;
        }
        this.list.pop(); // full: drop the oldest and try again
      }
    }
    return this.list[0] === entry ? entry : null;
  }

  /** An entry's record as bytes. */
  bytes(entry) {
    return fromBase64(entry.data);
  }
}
