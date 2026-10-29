// The style cards (彈幕 ② C②): at the end of a floor the player is shown three and keeps one for the rest of the run.
// Each card is one switch its system reads (`game.cards.has(id)`): the action cards change what a move does, the
// slow-mo cards what bullet time does. Which three come is drawn from the run's seed (rng.fork('cards', floor)), with
// both kinds among them; a card held is never offered again. The pick is a press of 1, 2 or 3 in the step's input
// (input.js BUTTONS Digit1–3), so a replay picks the same card; the card screen's buttons, a touch and a pad make
// that press (main.js). The numbers are in config.js CARDS.
import { CARDS as NUM, CHALLENGE } from './config.js';

/** The first batch: three action cards, three slow-mo cards. `name` and `en` show on the card, `text` says what it does. */
export const CARDS = {
  slideReflect: { kind: 'action', name: '滑鏟反彈', en: 'SLIDE DEFLECT', text: '滑鏟時本來飛過頭頂的子彈彈回去，算你開的槍' },
  shoveBoom: { kind: 'action', name: '人盾引爆', en: 'SHOVE BLAST', text: '推出去的人盾撞到人或落地就爆' },
  tableBounce: { kind: 'action', name: '枱面反彈', en: 'TABLE BOUNCE', text: '翻起的枱把敵人的子彈彈回去' },
  grazeReflect: { kind: 'slowmo', name: '擦彈反彈', en: 'GRAZE RETURN', text: '慢鏡中擦過的子彈掉頭飛回去' },
  killSlow: { kind: 'slowmo', name: '擊殺慢鏡', en: 'KILL SLOW-MO', text: '每次擊殺自動入慢鏡半秒，不耗表' },
  deepSlow: { kind: 'slowmo', name: '深慢鏡', en: 'DEEP SLOW-MO', text: '慢鏡時世界慢一倍，表耗快六成' },
};
export const CARD_IDS = Object.keys(CARDS);
export const KINDS = { action: { name: '動作', en: 'ACTION' }, slowmo: { name: '慢鏡', en: 'SLOW-MO' } };

/**
 * `n` cards to offer, none of `held`, from `rng`: one of each kind first (where one is left), the rest from
 * whatever is left; then shuffled so the kinds mix on the screen. Fewer when fewer are left.
 */
export function drawOffer(rng, held, n = NUM.offer) {
  const left = CARD_IDS.filter((id) => !held.includes(id));
  const out = [];
  for (const kind of Object.keys(KINDS)) {
    const of = left.filter((id) => CARDS[id].kind === kind && !out.includes(id));
    if (of.length && out.length < n) out.push(of[rng.int(0, of.length - 1)]);
  }
  const rest = left.filter((id) => !out.includes(id));
  while (out.length < n && rest.length) out.push(rest.splice(rng.int(0, rest.length - 1), 1)[0]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class Cards {
  constructor(game) {
    this.game = game;
    this.held = []; // the cards kept this run, in the order picked
    this.offer = null; // the three on the screen, or null
    this.offerFloor = -1; // the floor whose end offered them (0-based)
  }

  reset() {
    this.held = [];
    this.offer = null;
    this.offerFloor = -1;
    this.game.hideCards();
  }

  has(id) {
    return this.held.includes(id);
  }

  get pending() {
    return !!this.offer;
  }

  /** The end of floor `floor` (0-based): three cards on the screen, from the run's seed. */
  show(floor) {
    const g = this.game;
    this.offer = drawOffer(g.rng.fork('cards', floor), this.held);
    this.offerFloor = floor;
    g.notes.log(`風格卡三選一：${this.offer.map((id) => CARDS[id].name).join(' / ')}`);
    g.showCards(this.offer);
    return this.offer;
  }

  /**
   * 不開槍's prize (challenge.js, F②b): CHALLENGE.cards on the screen to keep one, from room `stage`'s own stream
   * (the same seed, the same cards); false when none is left to offer.
   */
  showPrize(stage) {
    const g = this.game;
    const offer = drawOffer(g.rng.fork('challenge-cards', stage), this.held, CHALLENGE.cards);
    if (!offer.length) return false;
    this.offer = offer;
    this.offerFloor = -1;
    const n = ['', '一', '二', '三', '四', '五', '六'][offer.length];
    g.notes.log(`風格卡${n}選一（挑戰獎勵）：${offer.map((id) => CARDS[id].name).join(' / ')}`);
    g.showCards(offer, `挑戰獎勵 · 風格卡${n}選一  CHALLENGE PRIZE`);
    return true;
  }

  /** The step's input (a press of 1, 2, 3 or 4) read while an offer is up: the card kept, or null. */
  read(cmd) {
    if (!this.offer) return null;
    const i = cmd.hit('Digit1') ? 0 : cmd.hit('Digit2') ? 1 : cmd.hit('Digit3') ? 2 : cmd.hit('Digit4') ? 3 : -1;
    if (i < 0 || i >= this.offer.length) return null;
    return this.pick(i);
  }

  pick(i) {
    const id = this.offer[i];
    this.held.push(id);
    this.offer = null;
    const g = this.game;
    g.hideCards();
    g.notes.log(`風格卡：${CARDS[id].name}`);
    g.hud.banner(CARDS[id].en, `${CARDS[id].name} · ${CARDS[id].text}`, 'stage');
    g.audio.waveClear();
    return id;
  }

  /** The cards held, named, for the end screen and the feedback export. */
  get names() {
    return this.held.map((id) => CARDS[id].name);
  }
}
