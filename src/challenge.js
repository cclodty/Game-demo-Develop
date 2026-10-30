// The room challenges (F②a, F②b, REDESIGN §6): before a fight room's first wave, a sign over its entry offers one
// challenge, drawn from the room's own stream (rng.fork('challenge', stage): the same seed, the same challenge). A
// press of Y (input.js BUTTONS; the sign is a button too, and a pad's d-pad down makes the press: main.js) takes it
// on, so a replay takes it on the same step; the room's first wave starting closes the sign unanswered. Taken on, the
// HUD shows it under way; done when the room is cleared, it scores CHALLENGE Style and gives its reward for the rest
// of the run; broken, it says so at once, and costs nothing. A boss room has none. Each challenge is data: what
// breaks it is counted from the game's own events (a hit taken, the fighting clock, a shot fired, bullet time put on),
// its reward is one switch or number the game reads (`lives`, a weapon dropped, a style card picked, `focusMax`). The
// numbers are in config.js CHALLENGE.
import { CHALLENGE } from './config.js';
import { PLAYER_WEAPONS } from './weapons.js';

/**
 * The challenges: `name` and `en` on the sign, `text()` what it asks (from config.js, read when shown), `prize` the
 * reward's name; `fits` whether it can be offered under the run's rules (a weapon is no prize where no gun is handed
 * out: rules.js `drops`; no shot is nothing to ask with no gun in hand, no bullet time with none to put on).
 */
export const CHALLENGES = {
  nohit: { name: '無傷', en: 'NO HIT', text: () => '成間房冇中過', prize: '一條命', reward: 'life', fits: () => true },
  clock: { name: '限時', en: 'TIME LIMIT', text: () => `打鬥 ${CHALLENGE.time} 秒內清房`, prize: '一支特別武器', reward: 'weapon', fits: (g) => g.ruleset.drops !== false && g.ruleset.pads !== false && !g.cards.has('pistolsOnly') },
  noshot: { name: '不開槍', en: 'NO SHOTS', text: () => '成間房一槍都唔開', prize: `一張風格卡（${CHALLENGE.cards} 選一）`, reward: 'card', fits: (g) => g.ruleset.startWeapon !== 'none' },
  noslow: { name: '不用慢鏡', en: 'NO SLOW-MO', text: () => '成間房唔開子彈時間', prize: '專注上限 +1 格', reward: 'focus', fits: (g) => g.ruleset.slowmo !== false && !g.cards.has('noSlow') },
};
export const CHALLENGE_IDS = Object.keys(CHALLENGES);

export class Challenges {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.offer = null; // the sign up: { id, stage }
    this.active = null; // the one taken on: { id, stage, t: fighting seconds, failed }
    this.openedFor = -1; // the room (stage) whose sign has been put up
    this.lives = 0; // lives in hand (無傷's prize, a door's heal): an HP of nothing spends one instead of ending the run
    this.focusUp = 0; // focus segments won (不用慢鏡's prize): the meter's cap is focusMax
    this.won = 0;
  }

  /** How full the focus meter can be (main.js): one meter, and CHALLENGE.focusStep more for each segment won. */
  get focusMax() {
    return 1 + this.focusUp * CHALLENGE.focusStep;
  }

  /**
   * Room `stage` begins (main.js: a run's first room, or the room walked into), its first wave to come after `waves`'
   * wait: once a room, in a mode of rooms, its sign goes up, if it is a fight room (no boss) and a challenge fits;
   * the wait is CHALLENGE.window at least, so it can be read.
   */
  before(stage, waves) {
    if (this.openedFor === stage || !waves.rules.floor) return;
    this.openedFor = stage;
    const g = this.game;
    const map = g.mapAt(stage);
    if (!map || map.boss) return;
    const ids = CHALLENGE_IDS.filter((id) => CHALLENGES[id].fits(g));
    if (!ids.length) return;
    const r = g.rng.fork('challenge', stage);
    const id = ids[r.int(0, ids.length - 1)];
    this.offer = { id, stage };
    waves.timer = Math.max(waves.timer, CHALLENGE.window);
    const c = CHALLENGES[id];
    g.notes.log(`挑戰：${c.name}（${c.text()}，獎勵${c.prize}），按 Y 接受`);
  }

  /** A logic step: the sign taken on by the step's press; the clock of 限時 runs while a wave is being fought. */
  update(cmd, h) {
    const g = this.game;
    if (this.offer && cmd.hit('KeyY')) {
      const c = CHALLENGES[this.offer.id];
      this.active = { id: this.offer.id, stage: this.offer.stage, t: 0, failed: false };
      this.offer = null;
      g.notes.log(`接受挑戰：${c.name}`);
      g.audio.pickup();
    }
    const a = this.active;
    if (a && !a.failed && a.id === 'clock' && g.waves.state === 'active') {
      a.t += h;
      if (a.t > CHALLENGE.time) this.fail(`超過 ${CHALLENGE.time} 秒`);
    }
  }

  /** The room's first wave starts (waves.js startWave): an unanswered sign comes down. */
  waveStarts() {
    if (!this.offer) return;
    this.game.notes.log(`冇接受挑戰：${CHALLENGES[this.offer.id].name}`);
    this.offer = null;
  }

  /** The player is hit (main.js onPlayerHurt): 無傷 is broken. */
  hurt() {
    if (this.active && !this.active.failed && this.active.id === 'nohit') this.fail('中咗');
  }

  /** The player fires (player.js): 不開槍 is broken. */
  shot() {
    if (this.active && !this.active.failed && this.active.id === 'noshot') this.fail('開咗槍');
  }

  /** The player puts bullet time on (main.js toggleFocus; the card 擊殺慢鏡's own half second is not his): 不用慢鏡 is broken. */
  slowmo() {
    if (this.active && !this.active.failed && this.active.id === 'noslow') this.fail('開咗慢鏡');
  }

  fail(why) {
    const c = CHALLENGES[this.active.id];
    this.active.failed = true;
    this.game.notes.log(`挑戰失敗：${c.name}（${why}）`);
    this.game.hud.banner('CHALLENGE FAILED', `挑戰失敗 · ${c.name}`, 'fail');
  }

  /** The room is cleared (waves.js): a challenge under way and not broken is done; its Style and its prize. */
  roomClear() {
    const a = this.active;
    this.offer = null;
    if (!a) return;
    this.active = null;
    if (a.failed) return;
    const g = this.game;
    const c = CHALLENGES[a.id];
    this.won++;
    g.score.style('CHALLENGE', CHALLENGE.style);
    if (c.reward === 'focus') this.focusUp++;
    let prize = c.prize;
    if (c.reward === 'life' && !this.addLife()) prize = `（命已經有 ${CHALLENGE.maxLives} 條）`;
    // the cards to pick one from, on the card screen, the exit opening on the pick (waves.js 'cards'); none left to offer, the Style alone
    if (c.reward === 'card' && !g.cards.showPrize(a.stage)) prize = '（風格卡已經揀晒）';
    if (c.reward === 'weapon') {
      // a special weapon at the player's feet, full, drawn from the room's stream after the challenge
      const r = g.rng.fork('challenge', a.stage);
      r.next();
      const kind = CHALLENGE.weapons[r.int(0, CHALLENGE.weapons.length - 1)];
      const p = g.player;
      g.pickups.spawn(kind, p.x, p.z, { ttl: CHALLENGE.weaponTtl });
      prize = `${PLAYER_WEAPONS[kind].name}`;
    }
    g.notes.log(`挑戰成功：${c.name}${a.id === 'clock' ? `（${a.t.toFixed(1)} 秒）` : ''}，獎勵${prize}`);
    g.hud.banner('CHALLENGE CLEAR', `挑戰成功 · ${c.name} · ${prize}`, 'clear');
  }

  /** A life won (無傷, a door's heal: prizes.js), while fewer than CHALLENGE.maxLives are in hand; false at the cap. */
  addLife() {
    if (this.lives >= CHALLENGE.maxLives) return false;
    this.lives++;
    return true;
  }

  /**
   * An HP of nothing (player.js hurt): with a life in hand, the player is up again at once, whole and untouchable
   * CHALLENGE.lifeInvuln s, and the life is spent. False with none.
   */
  spendLife(p) {
    if (this.lives <= 0) return false;
    this.lives--;
    p.hp = p.maxHp;
    p.invuln = CHALLENGE.lifeInvuln;
    this.game.notes.log(`用咗一條命（剩 ${this.lives}）`);
    this.game.hud.banner('EXTRA LIFE', '多一條命 · 企返起身', 'clear');
    return true;
  }
}
