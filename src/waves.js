// Wave director: builds each wave's roster and feeds enemies in through the
// stairwell doors and over the roof ledges, telegraphing each spawn.

import { TYPES } from './enemies.js';

/**
 * The ways to play a run. Arcade ends: its last wave stands in for a boss
 * for now, half as big again with one more brute. Input records store a
 * mode's place in this list, so only ever append.
 */
export const MODES = {
  arcade: { name: '街機', en: 'ARCADE', color: '#ffc861', desc: '12 波一局，約十分鐘 · 打完有結算', waves: 12, perStage: 4, finale: { size: 1.5, brutes: 1, maxAlive: 11 }, graded: true },
  endless: { name: '無盡', en: 'ENDLESS', color: '#2ee8ff', desc: '打到倒下為止', waves: Infinity, perStage: 3 },
};
export const MODE_IDS = Object.keys(MODES);

export class Waves {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.queue = [];
    this.pending = [];
    this.state = 'intermission'; // then 'active', 'transition', and 'done' once an arcade run is cleared; 'warmup' before wave 1 of a first run
    this.timer = 2.4;
    this.maxAlive = 3;
    this.spawnCd = 0;
    this.clock = 0;
    this.stageNext = false;
    this.hurt = false; // the player took damage this wave
    this.cleanWaves = 0;
  }

  get rules() {
    return MODES[this.game.mode];
  }

  get isFinal() {
    return this.wave === this.rules.waves;
  }

  get remaining() {
    return this.queue.length + this.pending.length + this.game.enemies.aliveCount;
  }

  get finishedSpawning() {
    return this.state === 'active' && this.queue.length === 0 && this.pending.length === 0;
  }

  compose(n) {
    const rng = this.game.rng;
    const finale = n === this.rules.waves ? this.rules.finale : null;
    let total = 3 + Math.floor(n * 1.7);
    let brutes = n >= 4 ? 1 + Math.floor((n - 4) / 3) : 0;
    if (finale) {
      total = Math.round(total * finale.size);
      brutes += finale.brutes;
    }
    const weights = [
      ['grunt', 6],
      ['shotgun', n >= 2 ? 2.5 : 0],
      ['rifle', n >= 2 ? 2 : 0],
      ['rusher', n >= 3 ? 2.2 : 0],
    ];
    const sum = weights.reduce((a, w) => a + w[1], 0);
    const list = [];
    for (let i = 0; i < total - brutes; i++) {
      let r = rng.next() * sum;
      for (const [type, w] of weights) {
        r -= w;
        if (r <= 0) {
          list.push(type);
          break;
        }
      }
    }
    for (let b = 0; b < brutes; b++) list.splice(Math.floor(rng.range(list.length * 0.4, list.length)), 0, 'brute');
    return list;
  }

  startWave() {
    const g = this.game;
    this.wave++;
    this.queue = this.compose(this.wave);
    const count = {};
    for (const t of this.queue) count[t] = (count[t] || 0) + 1;
    g.notes.log(`第 ${this.wave} 波開始：${Object.entries(count).map(([t, n]) => `${TYPES[t] ? TYPES[t].label : t}×${n}`).join(' ')}`);
    this.maxAlive = this.isFinal ? this.rules.finale.maxAlive : Math.min(3 + Math.floor(this.wave * 0.7), 9);
    this.state = 'active';
    this.spawnCd = 0.3;
    this.hurt = false;
    const tips = [
      '敵人的紅色激光變亮 = 即將開槍',
      '按 Shift 進入子彈時間，看清每一顆子彈',
      '射擊平底鍋，子彈會自動反彈到最近的敵人',
      'Space 旋轉時子彈會穿身而過',
      '旋轉時按住開槍，子彈會向四周掃射：PIROUETTE',
      '踢飛的敵人落地前射殺：JUGGLE',
      '彈匣空了就旋轉，轉完就裝好',
      '跑動中按 C 滑鏟，子彈從頭頂飛過，滑行中可以開槍：SLIDE KILL',
      '按 G 拿起平底鑊或油桶擲向敵人；空中的平底鑊被子彈打中會散射：SCATTER',
      '特殊武器打空後按 G 把空槍丟向敵人，打暈他',
      '按住右鍵：左手槍鎖定另一個目標',
      '金色武器台每波都會刷出新武器',
      '把敵人踢向同伴，可以打保齡球',
      '狙擊槍的子彈會穿透敵人和玻璃',
      '站在另一把武器上按 E 交換；1 / 2 或滾輪切換',
    ];
    if (this.isFinal) g.hud.banner('FINAL WAVE', `最後一波 · 撐過去就通關`, 'stage');
    else g.hud.banner(`WAVE ${this.wave}`, tips[(this.wave - 1) % tips.length]);
    g.audio.waveStart();
    g.pickups.refillPads();
  }

  pickSpawn() {
    const { player, level, rng } = this.game;
    const dist = (sp) => Math.hypot(sp.ex - player.x, sp.ez - player.z);
    // Not on top of the player, but not a long walk away either (the Senado strip is 148 m long).
    let pool = level.spawns.filter((sp) => dist(sp) > 9 && dist(sp) < 45);
    if (pool.length < 2) {
      pool = level.spawns
        .filter((sp) => dist(sp) > 7.5)
        .sort((a, b) => dist(a) - dist(b))
        .slice(0, 3);
    }
    if (!pool.length) pool = level.spawns;
    pool.sort((a, b) => a.lastUsed - b.lastUsed);
    const choice = pool[rng.int(0, Math.min(2, pool.length) - 1)];
    choice.lastUsed = this.clock;
    return choice;
  }

  /** The first run's warm-up holds wave 1 back until endWarmup(). */
  startWarmup() {
    this.state = 'warmup';
  }

  endWarmup() {
    this.state = 'intermission';
    this.timer = 1.5;
  }

  update(dt, realDt) {
    this.clock += dt;
    if (this.state === 'warmup') return;
    if (this.state === 'intermission') {
      this.timer -= realDt;
      if (this.timer <= 0 && this.game.player.alive) {
        if (this.stageNext) {
          // the wave before was a stage end: move to the next map first
          this.stageNext = false;
          this.state = 'transition';
          this.game.beginStageTransition();
        } else {
          this.startWave();
        }
      }
      return;
    }
    if (this.state !== 'active') return;
    const enemies = this.game.enemies;

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      p.sp.heat = 1;
      if (p.t <= 0) {
        enemies.spawn(p.type, p.sp);
        this.pending.splice(i, 1);
      }
    }

    this.spawnCd -= dt;
    if (this.queue.length && this.spawnCd <= 0 && enemies.aliveCount + this.pending.length < this.maxAlive) {
      const type = this.queue.shift();
      this.pending.push({ type, sp: this.pickSpawn(), t: 0.9 });
      this.spawnCd = this.game.rng.range(0.5, 1.3);
    }

    if (!this.queue.length && !this.pending.length && enemies.aliveCount === 0) {
      if (!this.hurt) this.cleanWaves++;
      if (this.isFinal) {
        this.state = 'done';
        this.game.onRunClear(this.wave);
        return;
      }
      this.state = 'intermission';
      this.timer = 3.8;
      // every few waves the fight moves to the next map
      this.stageNext = this.wave % this.rules.perStage === 0;
      this.game.onWaveClear(this.wave, this.stageNext);
    }
  }
}
