// Settings (設定, playtest feedback ②): the music and sound volumes, the song
// (音樂 ④: one for every stage, or the playlist), and which
// key (and which pad button) drives each rebindable action. Kept in
// localStorage. The game logic never sees a key: input.js turns a physical
// key into the action's control code before it reaches a step, so a run
// played on rebound keys is recorded like any other and replays unchanged.

import { ACTIONS, PAD_BUTTONS } from './input.js';

const KEY = 'bullet-ballet.settings';

/** The default pad binding of an action: the button that stands for its control in PAD_BUTTONS, or null. */
const defaultPadButton = (action) => {
  const row = PAD_BUTTONS.find(([, code]) => code === action.control);
  return row ? row[0] : null;
};

export class Settings {
  /** `storage` is localStorage or a stand-in. */
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.music = 1; // 0–1, on top of the mix's own level
    this.sfx = 1;
    this.song = 'auto'; // a song's id (music.js SONGS) for every stage, or 'auto': the playlist, one a stage
    this.keys = {}; // action id → physical key code
    this.pad = {}; // action id → pad button index
    this.reset(false);
    let data = null;
    try {
      data = JSON.parse(storage.getItem(KEY) || 'null');
    } catch {
      data = null;
    }
    if (data && typeof data === 'object') {
      if (Number.isFinite(data.music)) this.music = Math.min(1, Math.max(0, data.music));
      if (Number.isFinite(data.sfx)) this.sfx = Math.min(1, Math.max(0, data.sfx));
      if (typeof data.song === 'string') this.song = data.song;
      for (const a of ACTIONS) {
        if (data.keys && typeof data.keys[a.id] === 'string') this.keys[a.id] = data.keys[a.id];
        if (data.pad && Number.isInteger(data.pad[a.id])) this.pad[a.id] = data.pad[a.id];
      }
    }
  }

  /** Back to the defaults (and saved, unless `save` is false). */
  reset(save = true) {
    this.music = 1;
    this.sfx = 1;
    this.song = 'auto';
    this.keys = {};
    this.pad = {};
    for (const a of ACTIONS) {
      this.keys[a.id] = a.key;
      const b = defaultPadButton(a);
      if (b !== null) this.pad[a.id] = b;
    }
    if (save) this.save();
  }

  save() {
    try {
      this.storage.setItem(KEY, JSON.stringify({ music: this.music, sfx: this.sfx, song: this.song, keys: this.keys, pad: this.pad }));
    } catch {
      /* storage full or unavailable */
    }
  }

  /** Bind `code` to the action; whoever had that key takes the action's old key (a swap), so no key drives two actions. */
  bindKey(id, code) {
    const old = this.keys[id];
    for (const a of ACTIONS) if (a.id !== id && this.keys[a.id] === code) this.keys[a.id] = old;
    this.keys[id] = code;
    this.save();
  }

  /** The same for a pad button. */
  bindPad(id, button) {
    const old = this.pad[id];
    for (const a of ACTIONS) if (a.id !== id && this.pad[a.id] === button) this.pad[a.id] = old;
    this.pad[id] = button;
    this.save();
  }

  /** Which actions are not on their default key, for the feedback export: [[name, key], …]. */
  changedKeys() {
    return ACTIONS.filter((a) => this.keys[a.id] !== a.key).map((a) => [a.name, this.keys[a.id]]);
  }
}
