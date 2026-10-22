// 澳門一夜 A NIGHT IN MACAU: the mode that plays the maps one after another by
// the hour of the night each is set at (maps.js `hour`), each stage opened by a
// line (maps.js `line`). How far the night has got is kept in this browser: a
// stage cleared stays cleared, the next night starts at the first one that is
// not, and 由頭再來 starts it over. Nothing here touches play: the run is an
// arcade run on the night's maps (waves.js MODES.night).

const KEY = 'bullet-ballet.night';

/** The night's maps in order, as indices into `maps`: those with an hour, from the evening on (an hour before noon is after midnight). */
export function nightRoute(maps) {
  const order = (m) => {
    const h = Number(m.hour.split(':')[0]);
    return h < 12 ? h + 24 : h;
  };
  return maps
    .map((m, i) => [m, i])
    .filter(([m]) => m.hour)
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([, i]) => i);
}

/** Where the next night starts: the first stage (its place in the route) not yet cleared. */
export class NightStore {
  constructor(storage = null) {
    this.at = 0;
    try {
      this.storage = storage || globalThis.localStorage; // reading it can throw where site data is blocked
      const kept = JSON.parse(this.storage.getItem(KEY) || '{}');
      if (Number.isInteger(kept.at) && kept.at >= 0) this.at = kept.at;
    } catch {
      /* nothing kept, or nothing readable: a first night */
    }
  }

  /** Stage `i` of a night of `n` is cleared: the next starts after it, or at the start again once all are. */
  cleared(i, n) {
    this.at = i + 1 >= n ? 0 : i + 1;
    this.save();
  }

  /** 由頭再來: the next night starts at the start. */
  reset() {
    this.at = 0;
    this.save();
  }

  save() {
    try {
      this.storage.setItem(KEY, JSON.stringify({ at: this.at }));
    } catch {
      /* storage unavailable: the night goes on, it is only not kept */
    }
  }
}
