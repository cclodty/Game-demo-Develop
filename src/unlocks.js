// The unlock table (F⑥b, REDESIGN §6 解鎖表, first version): some style cards, special weapons and rule variants are
// shut at first, each hung on a room challenge won (challenge.js: a kind's first win opens what it lists first, the
// second win the next) or a ladder level opened (rules.js LADDER). Everything the table does not name is open from the
// start: eight of the eighteen cards, five of the seven weapons. What has opened is kept in this browser (like the
// achievements); a replay being watched opens nothing. A run's table is fixed as it starts (main.js startRun: what
// opens during it comes with the next run) and goes into the input record as a mask, one bit an entry, so a replay
// draws the same cards and weapons.
import { CARD_IDS } from './cards.js';
import { ladderReached, VARIANT_IDS, VARIANTS } from './rules.js';

/**
 * Each thing shut at the start: `what` it is (a card: cards.js CARDS, a weapon: weapons.js PLAYER_WEAPONS, a
 * variant: rules.js VARIANTS, whose `ladder` is named there with the rest of the variant), its `id`, and what opens
 * it: `challenge` (a kind in challenge.js CHALLENGES) won `win` times, or `ladder` (that level opened). The table only
 * grows at its end (a new variant's line too, after the ones there): the input record keeps it as bits.
 */
export const UNLOCKS = [
  { what: 'card', id: 'slideTrip', challenge: 'nohit', win: 1 },
  { what: 'card', id: 'halfHp', challenge: 'nohit', win: 2 },
  { what: 'weapon', id: 'launcher', challenge: 'clock', win: 1 },
  { what: 'card', id: 'pistolsOnly', challenge: 'clock', win: 2 },
  { what: 'card', id: 'shieldReturn', challenge: 'noshot', win: 1 },
  { what: 'card', id: 'kickReload', challenge: 'noshot', win: 2 },
  { what: 'card', id: 'slideSlow', challenge: 'noslow', win: 1 },
  { what: 'card', id: 'noSlow', challenge: 'noslow', win: 2 },
  { what: 'card', id: 'chainBounce', ladder: 1 },
  { what: 'card', id: 'grazeReload', ladder: 2 },
  { what: 'weapon', id: 'minigun', ladder: 3 },
  { what: 'card', id: 'slideGrab', ladder: 4 },
  ...VARIANT_IDS.filter((id) => VARIANTS[id].ladder)
    .map((id) => ({ what: 'variant', id, ladder: VARIANTS[id].ladder }))
    .sort((a, b) => a.ladder - b.ladder),
];

/** What each `what` is called on the end screen and in the notes. */
export const WHAT = { card: '風格卡', weapon: '武器', variant: '變體' };

/** The mask with every entry open: a record from before the table (and a run of the tests) plays with everything. */
export const ALL_OPEN = 2 ** UNLOCKS.length - 1;

/** Whether `what` `id` is open under `mask` (bits over UNLOCKS; null: all of them). What the table does not name always is. */
export function unlocked(mask, what, id) {
  if (mask == null) return true;
  const i = UNLOCKS.findIndex((u) => u.what === what && u.id === id);
  return i < 0 || !!(mask & (1 << i));
}

/** The cards a run with `mask` draws from, in CARD_IDS order. */
export function cardPool(mask) {
  return CARD_IDS.filter((id) => unlocked(mask, 'card', id));
}

/** The weapons of `list` open under `mask` (the whole list where none is: there is always something to hand out). */
export function openWeapons(list, mask) {
  const open = list.filter((id) => unlocked(mask, 'weapon', id));
  return open.length ? open : list;
}

/** How entry `u` opens, for the title's table: '無傷挑戰第 1 次', '階梯第 2 級'. */
export function howToOpen(u, challengeNames = {}) {
  if (u.challenge) return `${challengeNames[u.challenge] || u.challenge}挑戰第 ${u.win} 次`;
  return `階梯第 ${u.ladder} 級`;
}

const KEY = 'bullet-ballet.unlocks';
const key = (u) => `${u.what}:${u.id}`;

export class Unlocks {
  /** `storage` is localStorage or a stand-in. */
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let data = null;
    try {
      data = JSON.parse(storage.getItem(KEY) || 'null');
    } catch {
      data = null;
    }
    this.opened = new Set(data && Array.isArray(data.opened) ? data.opened : []); // 'card:slideTrip', …
    this.wins = data && typeof data.wins === 'object' && data.wins ? { ...data.wins } : {}; // challenge kind -> wins
    this.watching = false;
    this.fresh = []; // the entries opened this run, for the end screen
  }

  startRun() {
    this.fresh = [];
  }

  /** Whether entry `u` is open: opened, or its ladder level reached (a ladder climbed before the table opens its share). */
  isOpen(u) {
    return this.opened.has(key(u)) || (!!u.ladder && u.ladder <= ladderReached(this.storage));
  }

  /** Whether `what` `id` is open now (the title's variants; anything the table does not name is). */
  has(what, id) {
    const u = UNLOCKS.find((x) => x.what === what && x.id === id);
    return !u || this.isOpen(u);
  }

  /** The table as a run starting now plays it: one bit an entry, set when open. */
  mask() {
    return UNLOCKS.reduce((m, u, i) => (this.isOpen(u) ? m | (1 << i) : m), 0);
  }

  /** Challenge `kind` won (challenge.js roomClear): what its wins so far open; the entries opened now. */
  challengeWon(kind) {
    if (this.watching) return [];
    this.wins[kind] = (this.wins[kind] || 0) + 1;
    return this.open(UNLOCKS.filter((u) => u.challenge === kind && u.win <= this.wins[kind]));
  }

  /** Ladder level `level` opened (main.js onRunClear): what it opens; the entries opened now. */
  ladderOpened(level) {
    if (this.watching || !level) return [];
    return this.open(UNLOCKS.filter((u) => u.ladder === level));
  }

  open(list) {
    const now = list.filter((u) => !this.opened.has(key(u)));
    for (const u of now) this.opened.add(key(u));
    this.fresh.push(...now);
    try {
      this.storage.setItem(KEY, JSON.stringify({ opened: [...this.opened], wins: this.wins }));
    } catch {
      // a full or blocked storage: open for this visit only
    }
    return now;
  }
}
