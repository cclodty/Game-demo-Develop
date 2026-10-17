// Wave director: builds each wave's roster and feeds enemies in through the
// stairwell doors and over the roof ledges, telegraphing each spawn.

import { TYPES } from './enemies.js';
import { rand } from './utils.js';

export class Waves {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.queue = [];
    this.pending = [];
    this.state = 'intermission';
    this.timer = 2.4;
    this.maxAlive = 3;
    this.spawnCd = 0;
    this.clock = 0;
    this.stageNext = false;
  }

  get remaining() {
    return this.queue.length + this.pending.length + this.game.enemies.aliveCount;
  }

  get finishedSpawning() {
    return this.state === 'active' && this.queue.length === 0 && this.pending.length === 0;
  }

  compose(n) {
    const total = 3 + Math.floor(n * 1.7);
    const brutes = n >= 4 ? 1 + Math.floor((n - 4) / 3) : 0;
    const weights = [
      ['grunt', 6],
      ['shotgun', n >= 2 ? 2.5 : 0],
      ['rifle', n >= 2 ? 2 : 0],
      ['rusher', n >= 3 ? 2.2 : 0],
    ];
    const sum = weights.reduce((a, w) => a + w[1], 0);
    const list = [];
    for (let i = 0; i < total - brutes; i++) {
      let r = Math.random() * sum;
      for (const [type, w] of weights) {
        r -= w;
        if (r <= 0) {
          list.push(type);
          break;
        }
      }
    }
    for (let b = 0; b < brutes; b++) list.splice(Math.floor(rand(list.length * 0.4, list.length)), 0, 'brute');
    return list;
  }

  startWave() {
    const g = this.game;
    this.wave++;
    this.queue = this.compose(this.wave);
    const count = {};
    for (const t of this.queue) count[t] = (count[t] || 0) + 1;
    g.notes.log(`第 ${this.wave} 波開始：${Object.entries(count).map(([t, n]) => `${TYPES[t] ? TYPES[t].label : t}×${n}`).join(' ')}`);
    this.maxAlive = Math.min(3 + Math.floor(this.wave * 0.7), 9);
    this.state = 'active';
    this.spawnCd = 0.3;
    const tips = [
      '敵人的紅色激光變亮 = 即將開槍',
      '按 Shift 進入子彈時間，看清每一顆子彈',
      '射擊平底鍋，子彈會自動反彈到最近的敵人',
      'Space 旋轉時子彈會穿身而過',
      '旋轉時按住開槍，子彈會向四周掃射：PIROUETTE',
      '踢飛的敵人落地前射殺：JUGGLE',
      '彈匣空了就旋轉，轉完就裝好',
      '跑動中按 C 滑鏟，子彈從頭頂飛過，滑行中可以開槍：SLIDE KILL',
      '按住右鍵：左手槍鎖定另一個目標',
      '金色武器台每波都會刷出新武器',
      '把敵人踢向同伴，可以打保齡球',
      '狙擊槍的子彈會穿透敵人和玻璃',
      '站在另一把武器上按 E 交換；1 / 2 或滾輪切換',
    ];
    g.hud.banner(`WAVE ${this.wave}`, tips[(this.wave - 1) % tips.length]);
    g.audio.waveStart();
    g.pickups.refillPads();
  }

  pickSpawn() {
    const { player, level } = this.game;
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
    const choice = pool[Math.floor(Math.random() * Math.min(2, pool.length))];
    choice.lastUsed = this.clock;
    return choice;
  }

  update(dt, realDt) {
    this.clock += dt;
    if (this.state === 'intermission') {
      this.timer -= realDt;
      if (this.timer <= 0 && this.game.player.alive) {
        if (this.stageNext) {
          // every third wave the fight moves to the next map
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
      this.spawnCd = rand(0.5, 1.3);
    }

    if (!this.queue.length && !this.pending.length && enemies.aliveCount === 0) {
      this.state = 'intermission';
      this.timer = 3.8;
      this.stageNext = this.wave % 3 === 0;
      this.game.onWaveClear(this.wave, this.stageNext);
    }
  }
}
