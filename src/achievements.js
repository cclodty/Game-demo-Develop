// Achievements and unlocks (成就與解鎖 ①). Eight achievements, each one row of
// data: what to watch (a kill tag, a per-run count, a set of tags collected
// over all runs, a clean wave, a Style rank on a map, a cleared run), and how
// much of it. The game reports what happens (kills with their tags, close
// calls, waves, rank changes, clears); this keeps the counts and remembers
// what was done in localStorage. Three things unlock: two rule picks in
// rules.js name the achievement that opens them (`unlock`), and the coat
// colours open with COAT_UNLOCK. A replay being watched earns nothing.

/** The kill tags that use the map: barrels, pans (bounced and thrown), pigeons, bombers, bowling, friendly fire. */
export const ENV_TAGS = ['BOOM', 'RICOCHET', 'SCATTER', 'PIGEON STRIKE', 'CHAIN', 'STRIKE!', 'FRIENDLY FIRE'];

export const ACHIEVEMENTS = [
  { id: 'bankShot', name: '一彈兩命', en: 'BANK SHOT', desc: '一發反彈的子彈打死兩個敵人', kill: 'RICOCHET', bulletKills: 2 },
  { id: 'untouched', name: '毫髮無傷', en: 'UNTOUCHED', desc: '一波沒有受傷', cleanWave: true },
  { id: 'closeShave', name: '擦身而過', en: 'CLOSE SHAVE', desc: '一局十次 CLOSE CALL', count: 'CLOSE CALL', need: 10 },
  { id: 'senadoS', name: '議事亭之舞', en: 'SENADO S', desc: '在議事亭前地把 Style 評級打到 S', rank: 'S', map: 'senado' },
  { id: 'useEverything', name: '物盡其用', en: 'USE EVERYTHING', desc: '用五種環境擊殺（油桶、平底鑊反彈、擲鑊散射、白鴿、炸彈客連鎖、撞人、同伴誤殺）', distinct: ENV_TAGS, need: 5 },
  { id: 'scatter', name: '天女散花', en: 'SCATTER', desc: '一次 SCATTER 擊殺', kill: 'SCATTER' },
  { id: 'carousel', name: '旋轉木馬', en: 'CAROUSEL', desc: '一局五次 PIROUETTE', count: 'PIROUETTE', need: 5 },
  { id: 'runClear', name: '十二波', en: 'RUN CLEAR', desc: '街機（或每日挑戰）通關', clear: true },
];

/** The coat colours (the hero's jacket), open once COAT_UNLOCK is done; the first is the usual one. */
export const COATS = [
  { id: 'teal', name: '青', hue: null, rgb: 0x2f9fbf },
  { id: 'pink', name: '粉紅', hue: 325, rgb: 0xd94a9a },
  { id: 'gold', name: '金', hue: 42, rgb: 0xd9a530 },
  { id: 'violet', name: '紫', hue: 268, rgb: 0x7a52d6 },
];
export const COAT_UNLOCK = 'closeShave';

const KEY = 'bullet-ballet.achievements';
const RANKS = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

export class Achievements {
  /** `storage` is localStorage or a stand-in; `onDone(achievement)` hears each new one. */
  constructor(storage = globalThis.localStorage, onDone = () => {}) {
    this.storage = storage;
    this.onDone = onDone;
    let data = null;
    try {
      data = JSON.parse(storage.getItem(KEY) || 'null');
    } catch {
      data = null;
    }
    this.done = data && typeof data.done === 'object' && data.done ? data.done : {}; // id -> when
    this.seen = new Set(data && Array.isArray(data.seen) ? data.seen : []); // distinct tags collected over all runs
    this.coat = data && COATS.some((c) => c.id === data.coat) ? data.coat : 'teal';
    this.watching = false; // a replay is playing: nothing counts
    this.startRun();
  }

  has(id) {
    return !!this.done[id];
  }

  /** A run starts: the per-run counts go back to zero. */
  startRun() {
    this.counts = {};
  }

  save() {
    try {
      this.storage.setItem(KEY, JSON.stringify({ done: this.done, seen: [...this.seen], coat: this.coat }));
    } catch {
      /* storage full or unavailable */
    }
  }

  achieve(a) {
    if (this.done[a.id]) return;
    this.done[a.id] = new Date().toISOString().slice(0, 10);
    this.save();
    this.onDone(a);
  }

  /** How far along an achievement is: { have, need }. */
  progress(a) {
    if (this.done[a.id]) return { have: a.need || 1, need: a.need || 1 };
    if (a.distinct) return { have: a.distinct.filter((t) => this.seen.has(t)).length, need: a.need };
    if (a.count) return { have: this.counts[a.count] || 0, need: a.need };
    return { have: 0, need: 1 };
  }

  /** A kill: its tag labels, and how many the bullet that made it has killed. */
  kill(labels, bulletKills = 0) {
    if (this.watching) return;
    for (const l of labels) this.counts[l] = (this.counts[l] || 0) + 1;
    let fresh = false;
    for (const l of labels) {
      if (ENV_TAGS.includes(l) && !this.seen.has(l)) {
        this.seen.add(l);
        fresh = true;
      }
    }
    if (fresh) this.save();
    for (const a of ACHIEVEMENTS) {
      if (a.kill && labels.includes(a.kill) && bulletKills >= (a.bulletKills || 0)) this.achieve(a);
      if (a.count && (this.counts[a.count] || 0) >= a.need) this.achieve(a);
      if (a.distinct && a.distinct.filter((t) => this.seen.has(t)).length >= a.need) this.achieve(a);
    }
  }

  /** A style bonus that is not a kill (CLOSE CALL, DODGE…). */
  style(label) {
    if (this.watching) return;
    this.counts[label] = (this.counts[label] || 0) + 1;
    for (const a of ACHIEVEMENTS) if (a.count === label && this.counts[label] >= a.need) this.achieve(a);
  }

  /** A wave cleared; `clean` when the player took no damage in it. */
  wave(clean) {
    if (this.watching || !clean) return;
    for (const a of ACHIEVEMENTS) if (a.cleanWave) this.achieve(a);
  }

  /** The Style rank reached `name` on map `mapId`. */
  rank(name, mapId) {
    if (this.watching) return;
    for (const a of ACHIEVEMENTS) if (a.rank && a.map === mapId && RANKS.indexOf(name) >= RANKS.indexOf(a.rank)) this.achieve(a);
  }

  /** A twelve-wave run cleared. */
  clear() {
    if (this.watching) return;
    for (const a of ACHIEVEMENTS) if (a.clear) this.achieve(a);
  }

  setCoat(id) {
    if (!COATS.some((c) => c.id === id)) return;
    this.coat = id;
    this.save();
  }

  get coatOpen() {
    return this.has(COAT_UNLOCK);
  }
}
