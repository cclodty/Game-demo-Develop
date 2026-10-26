// The 60-second warm-up (60 秒新手熱身). The first run ever opens with three
// enemies, one at a time, each teaching one thing of the game as it is now
// (彈幕 ② C③): bullet time against the first one's laser and glow, the second
// held up as a human shield and shoved, a table flipped against the third.
// Clearing them (or Esc, or the time limit) hands over to wave 1; it plays
// once, remembered in localStorage, and ?tutorial=1 plays it again. It is
// logic: it spawns through the enemy manager, counts logic steps and reads
// only game.cmd, so a recorded run replays it (the input record keeps
// whether it ran).

import { WARMUP } from './config.js';

const KEY = 'bullet-ballet.tutorial';

/**
 * The steps, in order. `at` says where the enemy stands: `front`, WARMUP.front m in front of the player; `near`,
 * WARMUP.near m in front, within a step of the arms; `table`, behind the nearest upright table (away from the
 * player), or in front where there is none. `aimHint` waits for the enemy to start aiming.
 */
export const STEPS = [
  { type: 'grunt', at: 'front', aimHint: true, hint: '紅線對住你，他一發光就開槍：按 {focus} 進入子彈時間，看清楚再避開', log: '熱身 1／3：快彈與紅線' },
  { type: 'grunt', at: 'near', hint: '走到他面前按 {pick} 抓住他做<b>人盾</b>，他替你擋子彈；再按 {pick} 推出去', log: '熱身 2／3：人盾' },
  { type: 'grunt', at: 'table', hint: '站在<b>圓枱</b>前按 {kick} 翻枱擋子彈，再繞到側面打他', log: '熱身 3／3：翻枱' },
];

/** True when this run should start with the warm-up: never played here before, or ?tutorial=1. */
export function wantWarmup() {
  if (new URLSearchParams(location.search).get('tutorial') === '1') return true;
  try {
    return localStorage.getItem(KEY) !== 'done';
  } catch {
    return false; // no storage: don't make every run a warm-up
  }
}

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.hint = ''; // what the HUD shows (HTML), '' for nothing
  }

  /** Start the warm-up at the beginning of a run. */
  start() {
    this.active = true;
    this.step = -1;
    this.t = 0;
    this.enemy = null;
    this.hint = '';
    this.game.notes.log('熱身開始');
    this.next();
  }

  /** Leave the warm-up without its banner (a restart or the title). */
  stop() {
    this.active = false;
    this.enemy = null;
    this.hint = '';
  }

  next() {
    this.step++;
    if (this.step >= STEPS.length) return this.finish('done');
    const s = STEPS[this.step];
    const g = this.game;
    const at = this.spot(s.at);
    this.enemy = g.enemies.spawn(s.type, { x: at.x, z: at.z, ex: at.x, ez: at.z, stay: true });
    g.fx.ring(at.x, at.z, 1.4, 0.5, 0xff3355, 3);
    this.hint = s.aimHint ? '' : s.hint;
    g.notes.log(s.log);
    return true;
  }

  /** Where a step's enemy stands, on an open nav cell. */
  spot(kind) {
    const g = this.game;
    const p = g.player;
    let x = p.x;
    let z = p.z - (kind === 'near' ? WARMUP.near : WARMUP.front); // the player starts facing north (-z)
    const nearest = (list) => {
      let best = null;
      let bd = Infinity;
      for (const q of list) {
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (q.alive && d < bd) {
          bd = d;
          best = q;
        }
      }
      return best;
    };
    const prop = kind === 'table' ? nearest(g.level.fixtures.filter((f) => f.kind === 'table' && !f.flipped && !f.broken)) : null;
    if (prop) {
      // on the far side of the table from the player
      const d = Math.hypot(prop.x - p.x, prop.z - p.z) || 1;
      x = prop.x + ((prop.x - p.x) / d) * WARMUP.behindTable;
      z = prop.z + ((prop.z - p.z) / d) * WARMUP.behindTable;
    }
    const nav = g.level.nav;
    const i = nav.nearestOpen(x, z);
    return i >= 0 ? { x: nav.centerX(i), z: nav.centerZ(i) } : { x, z };
  }

  /** The warm-up is over: wave 1 comes next, and it does not play again. */
  finish(why) {
    const g = this.game;
    this.active = false;
    this.hint = '';
    for (const e of [...g.enemies.list]) if (e.alive) g.enemies.remove(e);
    this.enemy = null;
    try {
      localStorage.setItem(KEY, 'done');
    } catch {
      /* storage unavailable */
    }
    g.waves.endWarmup();
    const text = { done: '熱身完成', skip: '跳過熱身', time: '熱身時間到' }[why];
    g.notes.log(text);
    g.hud.banner('WARM-UP', `${text} · 第一波來了`, 'clear');
    return true;
  }

  /** One logic step; `h` is its real time. */
  update(h) {
    if (!this.active) return;
    const g = this.game;
    this.t += h;
    if (g.cmd.hit('Escape')) return this.finish('skip');
    if (this.t >= WARMUP.limit) return this.finish('time');
    const e = this.enemy;
    if (!e || !e.alive) return this.next();
    const s = STEPS[this.step];
    if (s.aimHint && !this.hint && (e.state === 'aim' || e.state === 'fire')) this.hint = s.hint;
    return false;
  }
}
