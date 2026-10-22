// Wave director: builds each wave's roster and feeds enemies in through the
// stairwell doors and over the roof ledges, telegraphing each spawn. Arcade
// and the daily play in beats (config.js BEATS): a few enemies together at
// one spot, quiet, then the next; endless trickles them in.

import { BOSSES } from './boss.js';
import { BEATS } from './config.js';
import { TYPES } from './enemies.js';
import { clamp } from './utils.js';

/**
 * The ways to play a run. In arcade (and the daily) a stage's last wave is
 * that map's boss (maps.js `boss`): the run's last in full, the others
 * shorter (`midBoss`: segments and BOSS bonus); a last stage without a boss
 * gets the big last wave, half as big again with one more brute. Input
 * records store a mode's place in this list, so only ever append.
 */
export const MODES = {
  arcade: { name: '街機', en: 'ARCADE', color: '#ffc861', desc: '12 波一局，約十分鐘 · 打完有結算', waves: 12, perStage: 4, finale: { size: 1.5, brutes: 1, maxAlive: 11 }, midBoss: { segments: 3, bonus: 1000 }, graded: true, beats: true },
  endless: { name: '無盡', en: 'ENDLESS', color: '#2ee8ff', desc: '打到倒下為止', waves: Infinity, perStage: 3 },
  // the daily challenge (daily.js): an arcade run on the day's seed, map and rules; started from its own title card
  daily: { name: '每日挑戰', en: 'DAILY', color: '#ff4fa3', desc: '全世界同一局，每天一次', waves: 12, perStage: 4, finale: { size: 1.5, brutes: 1, maxAlive: 11 }, midBoss: { segments: 3, bonus: 1000 }, graded: true, daily: true, beats: true },
  // 澳門一夜 (night.js): the maps by the hour of the night each is set at (maps.js `hour`), three waves a stage, the
  // third the map's boss where it has one; it goes on from the first stage not yet cleared (main.js route, routeAt)
  night: { name: '澳門一夜', en: 'A NIGHT IN MACAU', color: '#b48cff', desc: '晚上八點到凌晨三點 · 打完一關存進度', waves: 21, perStage: 3, finale: { size: 1.5, brutes: 1, maxAlive: 11 }, midBoss: { segments: 3, bonus: 1000 }, graded: true, night: true, beats: true },
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
    this.bossWave = false;
    this.state = 'intermission'; // then 'active', 'transition', and 'done' once an arcade run is cleared; 'warmup' before wave 1 of a first run
    this.timer = 2.4;
    this.maxAlive = 3;
    this.spawnCd = 0;
    this.clock = 0;
    this.stageNext = false;
    this.order = []; // this wave's spawn points, in the order its stream drew them (indices into level.spawns)
    this.orderI = 0;
    this.wr = null; // this wave's stream
    this.hurt = false; // the player took damage this wave
    this.shots = 0; // the player's shots this wave (player.js fire; none is 赤手空拳)
    this.cleanWaves = 0;
    this.beats = []; // the wave's roster in beats (modes with `beats`); empty for a trickle
    this.beatI = 0; // beats launched so far
    this.beatPhase = 'quiet'; // 'quiet' → 'telegraph' → 'live' → 'quiet' …
    this.beatT = 0;
    this.beatSpots = []; // the spawn points the beat being telegraphed comes through
    this.beatPerches = []; // and the balconies it sends men up to (pickPerches)
    this.beatHurt = false; // the player took damage during the beat that is live
    this.stageOrder = []; // the map's stages (maps.js) in the order this wave's beats visit them
    this.stage = null; // the stage of the beat being telegraphed or live
  }

  /** The beat that is live, or (between beats) the one coming: 1-based, for the HUD; 0 without beats. */
  get beatNo() {
    if (!this.beats.length) return 0;
    return this.beatPhase === 'live' ? this.beatI : Math.min(this.beatI + 1, this.beats.length);
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

  /** Wave n's roster, drawn from `rng` (the wave's own stream unless given). */
  compose(n, rng = this.game.rng.fork('wave', n)) {
    const finale = n === this.rules.waves ? this.rules.finale : null;
    let total = 3 + Math.floor(n * 1.7);
    let brutes = n >= 4 ? 1 + Math.floor((n - 4) / 3) : 0;
    if (finale) {
      total = Math.round(total * finale.size);
      brutes += finale.brutes;
    }
    // who can come, and how often: TYPES[type].spawn (from which wave, weight, most per wave)
    const weights = Object.entries(TYPES)
      .filter(([, t]) => t.spawn)
      .map(([type, t]) => [type, n >= t.spawn.from ? t.spawn.weight : 0, t.spawn.max ?? Infinity]);
    const sum = weights.reduce((a, w) => a + w[1], 0);
    const list = [];
    const count = {};
    for (let i = 0; i < total - brutes; i++) {
      let r = rng.next() * sum;
      for (const [type, w, max] of weights) {
        r -= w;
        if (r <= 0) {
          const pick = (count[type] || 0) < max ? type : weights[0][0]; // over its cap: a thug instead
          count[pick] = (count[pick] || 0) + 1;
          list.push(pick);
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
    // the wave's own stream: its roster, spawn order, pacing and pads are the same for
    // every run with this seed, however it is played (rng.js)
    const wr = (this.wr = g.rng.fork('wave', this.wave));
    this.queue = this.compose(this.wave, wr);
    // a stage's last wave on a map with a boss (maps.js `boss`, of a kind boss.js has), in a mode with
    // stage bosses (`midBoss`), and the run's last wave in any: the boss instead of the wave
    const boss = g.stageMap.boss;
    const stageEnd = this.wave % this.rules.perStage === 0;
    this.bossWave = !!boss && !!BOSSES[boss.kind] && (this.isFinal || (stageEnd && !!this.rules.midBoss));
    // the music (audio.js): a stage's first two waves on the base of its song, its later layers after, its boss section for a boss and the last wave
    g.audio.setLevel(this.isFinal || this.bossWave ? 2 : (this.wave - 1) % this.rules.perStage >= 2 ? 1 : 0);
    if (this.bossWave) {
      this.queue = [];
      g.level.restock(); // what the boss is fought with (the barrels the helicopter fears) is back where it began
    }
    this.order = g.level.spawns.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = wr.int(0, i);
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.orderI = 0;
    const count = {};
    for (const t of this.queue) count[t] = (count[t] || 0) + 1;
    g.notes.log(`第 ${this.wave} 波開始：${Object.entries(count).map(([t, n]) => `${TYPES[t] ? TYPES[t].label : t}×${n}`).join(' ')}`);
    this.maxAlive = this.isFinal ? this.rules.finale.maxAlive : Math.min(3 + Math.floor(this.wave * 0.7), 9);
    this.state = 'active';
    this.spawnCd = 0.3;
    this.hurt = false;
    this.shots = 0;
    this.beats = this.rules.beats && !this.bossWave ? this.splitBeats(this.queue) : [];
    this.beatI = 0;
    this.beatPhase = 'quiet';
    this.beatT = 0.3;
    g.audio.setBeat('quiet');
    this.beatSpots = [];
    this.beatPerches = [];
    this.beatHurt = false;
    this.stage = null;
    // the stages the beats visit, in an order of the wave's own (so every run with this seed sees the same)
    const stages = g.level.map.stages || [];
    this.stageOrder = stages.map((_, i) => i);
    for (let i = this.stageOrder.length - 1; i > 0; i--) {
      const j = wr.int(0, i);
      [this.stageOrder[i], this.stageOrder[j]] = [this.stageOrder[j], this.stageOrder[i]];
    }
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
    if (this.bossWave) {
      g.bosses.start(boss, this.isFinal ? null : this.rules.midBoss); // the last in full, a stage's shorter
      g.hud.banner('BOSS', `${g.boss.cfg.name} · ${this.isFinal ? '最後一波' : '打倒就轉場'}`, 'stage');
    } else if (this.isFinal) g.hud.banner('FINAL WAVE', `最後一波 · 撐過去就通關`, 'stage');
    else g.hud.banner(`WAVE ${this.wave}`, tips[(this.wave - 1) % tips.length]);
    g.audio.waveStart();
    if (g.ruleset.pads) g.pickups.refillPads(wr);
  }

  /** The roster cut into beats of BEATS.size (the finale's bigger), as even as that allows, in roster order. */
  splitBeats(list) {
    const [lo, hi] = this.isFinal ? BEATS.finaleSize : BEATS.size;
    const n = list.length;
    if (!n) return [];
    const k = clamp(Math.round(n / ((lo + hi) / 2)), Math.ceil(n / hi), Math.max(1, Math.floor(n / lo)));
    const out = [];
    for (let i = 0; i < k; i++) out.push(list.slice(Math.round((i * n) / k), Math.round(((i + 1) * n) / k)));
    return out;
  }

  /**
   * Where a beat comes through: the next door in the wave's order that suits (pickSpawn, so a
   * sniper's distance counts for the whole beat), and the nearest other door within BEATS.spread
   * m of it to share the crowd; one far from the player is never shared with. 同一水平: the beat
   * plays out on the player's level (level.js zones): its stage and its doors are on his zone, the
   * nearest one when he is on the steps between two.
   */
  pickSpots(beat) {
    const far = beat.find((t) => TYPES[t].spawn && TYPES[t].spawn.minDist);
    const p = this.game.player;
    const L = this.game.level;
    const zone = L.nearestZone(p.x, p.z);
    const here = (x, z) => L.zoneAt(x, z) === zone;
    const stages = L.map.stages;
    if (stages && stages.length && this.stageOrder.length) {
      // a stage to play at, the next in the wave's order on the player's level: the two doors nearest to it that are
      // not on top of the player (a sniper's beat keeps his distance)
      const n = this.stageOrder.length;
      let k = 0;
      while (k < n - 1 && !here(...stages[this.stageOrder[(this.beatI + k) % n]].at)) k++;
      this.stage = stages[this.stageOrder[(this.beatI + k) % n]];
      const min = far ? TYPES[far].spawn.minDist : 7.5;
      const [sx, sz] = this.stage.at;
      const doors = this.levelSpawns();
      const near = doors
        .filter((sp) => Math.hypot(sp.ex - p.x, sp.ez - p.z) > min)
        .sort((a, b) => Math.hypot(a.ex - sx, a.ez - sz) - Math.hypot(b.ex - sx, b.ez - sz));
      const spots = near.length ? near : [...doors].sort((a, b) => Math.hypot(b.ex - p.x, b.ez - p.z) - Math.hypot(a.ex - p.x, a.ez - p.z));
      const anchor = spots[0];
      const second = spots[1] && Math.hypot(spots[1].ex - anchor.ex, spots[1].ez - anchor.ez) < BEATS.spread ? spots[1] : anchor;
      return [anchor, second];
    }
    this.stage = null;
    const anchor = this.pickSpawn(far || beat[0]);
    let second = null;
    let bd = BEATS.spread;
    for (const sp of this.levelSpawns()) {
      if (sp === anchor || Math.hypot(sp.ex - p.x, sp.ez - p.z) < 7.5) continue;
      const d = Math.hypot(sp.ex - anchor.ex, sp.ez - anchor.ez);
      if (d < bd) {
        bd = d;
        second = sp;
      }
    }
    return [anchor, second || anchor];
  }

  /**
   * The balconies a beat sends men up to (maps.js perches, level.js balconies): none to BEATS.perch of its men who
   * can stand on one (enemies.js TYPES `perch`), as many as the wave's stream draws, each to a balcony nobody stands
   * on that is not over the player (BEATS.perchClear), nearest where the beat plays out first. None on a map without.
   */
  pickPerches(beat) {
    const g = this.game;
    const L = g.level;
    if (!L.balconies.length) return [];
    const most = Math.min(BEATS.perch, beat.filter((t) => TYPES[t].perch).length);
    const n = Math.floor(this.wr.range(0, most + 1));
    if (!n) return [];
    const p = g.player;
    const taken = new Set(g.enemies.list.filter((e) => e.alive && e.perch).map((e) => e.sp));
    const [sx, sz] = this.stage ? this.stage.at : [this.beatSpots[0].ex, this.beatSpots[0].ez];
    return L.balconies
      .filter((b) => !taken.has(b) && Math.hypot(b.ex - p.x, b.ez - p.z) > BEATS.perchClear)
      .sort((a, b) => Math.hypot(a.ex - sx, a.ez - sz) - Math.hypot(b.ex - sx, b.ez - sz))
      .slice(0, n);
  }

  /** The beats of a wave: quiet, the telegraph at the beat's doors, then everyone in at once; the next when few stand or time is up. */
  updateBeats(dt, enemies) {
    const g = this.game;
    if (this.beatPhase === 'quiet') {
      this.beatT -= dt;
      if (this.beatT > 0 || this.beatI >= this.beats.length) return;
      this.beatSpots = this.pickSpots(this.beats[this.beatI]);
      this.beatPerches = this.pickPerches(this.beats[this.beatI]);
      this.beatPhase = 'telegraph';
      this.beatT = BEATS.telegraph;
      g.audio.beat();
      g.audio.setBeat('telegraph'); // the music drops to the kick until they come
    } else if (this.beatPhase === 'telegraph') {
      for (const sp of [...this.beatSpots, ...this.beatPerches]) sp.heat = 1;
      this.beatT -= dt;
      if (this.beatT > 0) return;
      const beat = this.beats[this.beatI];
      const up = [...this.beatPerches];
      beat.forEach((type, i) => {
        const far = TYPES[type].spawn && TYPES[type].spawn.minDist; // a sniper keeps to the door picked for his distance
        const sp = TYPES[type].perch && up.length ? up.shift() : far ? this.beatSpots[0] : this.beatSpots[i % 2];
        this.pending.push({ type, sp, t: 0.05 * i });
      });
      this.queue.splice(0, beat.length);
      this.beatI++;
      this.beatPhase = 'live';
      this.beatT = 0;
      this.beatHurt = false;
      g.audio.setBeat('live');
      const count = {};
      for (const t of beat) count[t] = (count[t] || 0) + 1;
      const perched = this.beatPerches.length ? `，${this.beatPerches.length} 個上露台` : '';
      g.notes.log(`第 ${this.beatI} 拍${this.stage ? `（${this.stage.name}）` : ''}出場：${Object.entries(count).map(([t, n]) => `${TYPES[t].label}×${n}`).join(' ')}${perched}`);
    } else {
      this.beatT += dt;
      if (this.pending.length) return;
      const standing = enemies.aliveCount;
      if (standing > BEATS.next && this.beatT < BEATS.after) return;
      if (standing === 0 && !this.beatHurt && g.player.alive) {
        g.score.style('CLEAN BEAT', BEATS.clean);
        g.notes.log('一拍無傷清場（CLEAN BEAT）');
      }
      this.beatPhase = 'quiet';
      this.beatT = BEATS.quiet;
    }
  }

  /**
   * The next point in the wave's spawn order that is neither on top of the player nor a long
   * walk away (the Senado strip is 148 m long); only a player standing by a door moves an
   * enemy on to the next one.
   */
  pickSpawn(type) {
    const { player, level } = this.game;
    const S = level.spawns;
    const L = this.levelSpawns();
    const dist = (sp) => Math.hypot(sp.ex - player.x, sp.ez - player.z);
    const min = (TYPES[type] && TYPES[type].spawn && TYPES[type].spawn.minDist) || 9; // a sniper wants a far door
    for (let k = 0; k < S.length; k++) {
      const sp = S[this.order[(this.orderI + k) % S.length]];
      const d = dist(sp);
      if (d > min && d < 45 && (L === S || L.includes(sp))) {
        this.orderI += k + 1;
        return sp;
      }
    }
    // nowhere suits: the nearest point not on top of the player (the furthest, for one who wants a far door), or the next in order
    if (min > 9) return [...L].sort((a, b) => dist(b) - dist(a))[0];
    const near = L.filter((sp) => dist(sp) > 7.5).sort((a, b) => dist(a) - dist(b))[0];
    return near || S[this.order[this.orderI++ % S.length]];
  }

  /**
   * 同一水平: the doors whose way in is on the player's level (his zone, the nearest one when he is on the steps
   * between two); all of them on a map of one zone, or when none is on his.
   */
  levelSpawns() {
    const { player, level } = this.game;
    if (level.zones.length < 2) return level.spawns;
    const zone = level.nearestZone(player.x, player.z);
    const here = level.spawns.filter((sp) => level.zoneAt(sp.ex, sp.ez) === zone);
    return here.length ? here : level.spawns;
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

    if (this.beats.length) this.updateBeats(dt, enemies);
    else {
      // the trickle: one at a time, up to maxAlive standing
      this.spawnCd -= dt;
      if (this.queue.length && this.spawnCd <= 0 && enemies.aliveCount + this.pending.length < this.maxAlive) {
        const type = this.queue.shift();
        this.pending.push({ type, sp: this.pickSpawn(type), t: 0.9 });
        this.spawnCd = this.wr.range(0.5, 1.3);
      }
    }

    // a boss wave ends with the boss down, whoever is left; any other when nobody is
    const bossDown = this.bossWave && this.game.boss.downed;
    if (bossDown || (!this.queue.length && !this.pending.length && enemies.aliveCount === 0 && !this.game.boss.active)) {
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
