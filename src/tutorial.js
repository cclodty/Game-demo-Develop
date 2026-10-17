// The 60-second warm-up (60 秒新手熱身). The first run ever opens with three
// enemies, one at a time, each teaching one tool: bullet time against the
// first one's aim, a shot off a pan for the second, a barrel for the third.
// Clearing them (or Esc, or the time limit) hands over to wave 1; it plays
// once, remembered in localStorage, and ?tutorial=1 plays it again. It is
// logic: it spawns through the enemy manager, counts logic steps and reads
// only game.cmd, so a recorded run replays it (the input record keeps
// whether it ran).

import { WARMUP } from './config.js';

const KEY = 'bullet-ballet.tutorial';

/**
 * The steps, in order. `at` says where the enemy stands: in front of the
 * player, behind the nearest pan (away from the player), or beside the
 * nearest barrel. `aimHint` waits for the enemy to start aiming.
 */
export const STEPS = [
  { type: 'grunt', at: 'front', aimHint: true, hint: '他在瞄準你：按 <b>Shift</b> 或 <b>Q</b> 進入子彈時間，避開再還擊', log: '熱身 1／3：子彈時間' },
  { type: 'grunt', at: 'pan', hint: '射<b>平底鑊</b>：子彈會反彈，飛向最近的敵人', log: '熱身 2／3：平底鑊' },
  { type: 'grunt', at: 'barrel', hint: '射<b>油桶</b>：爆炸會炸死旁邊的敵人', log: '熱身 3／3：油桶' },
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
    let z = p.z - WARMUP.front; // the player starts facing north (-z)
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
    const prop = kind === 'pan' ? nearest(g.level.pans) : kind === 'barrel' ? nearest(g.level.barrels) : null;
    if (prop) {
      // on the far side of the prop from the player
      const d = Math.hypot(prop.x - p.x, prop.z - p.z) || 1;
      const off = kind === 'pan' ? WARMUP.behindPan : WARMUP.besideBarrel;
      x = prop.x + ((prop.x - p.x) / d) * off;
      z = prop.z + ((prop.z - p.z) / d) * off;
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
