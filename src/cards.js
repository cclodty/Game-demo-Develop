// The style cards (彈幕 ② C②, F④a, F④b): at the end of a floor the player is shown three and keeps one for the rest of
// the run. Each card is one switch its system reads (`game.cards.has(id)`): the action cards change what a move does,
// the slow-mo cards what bullet time does; a combo card (`needs`) is on only while the other cards held carry the tags
// it needs; a cost card (`cost`) gives one thing and takes another. Which three come is drawn from the run's seed (rng.fork('cards', floor)), with
// both kinds among them; a card held is never offered again. The pick is a press of 1, 2 or 3 in the step's input
// (input.js BUTTONS Digit1–3), so a replay picks the same card; the card screen's buttons, a touch and a pad make
// that press (main.js). The numbers are in config.js CARDS.
import { CARDS as NUM, CHALLENGE } from './config.js';

/**
 * The cards: `name` and `en` show on the card, `text` says what it does, `tags` what it plays with (TAGS: shown on the
 * card; the combo cards count them). The first batch (C②), the second (F④a), the combo and cost cards (F④b): each one
 * switch. A combo card's `needs` are tags the other cards held must carry (one card each; a tag named twice wants two),
 * and its own tags are those; a cost card's `text` says both what it gives and what it takes.
 */
export const CARDS = {
  slideReflect: { kind: 'action', tags: ['slide', 'bounce'], name: '滑鏟反彈', en: 'SLIDE DEFLECT', text: '滑鏟時本來飛過頭頂的子彈彈回去，算你開的槍' },
  shoveBoom: { kind: 'action', tags: ['shield'], name: '人盾引爆', en: 'SHOVE BLAST', text: '推出去的人盾撞到人或落地就爆' },
  tableBounce: { kind: 'action', tags: ['bounce'], name: '枱面反彈', en: 'TABLE BOUNCE', text: '翻起的枱把敵人的子彈彈回去' },
  grazeReflect: { kind: 'slowmo', tags: ['slowmo', 'bounce'], name: '擦彈反彈', en: 'GRAZE RETURN', text: '慢鏡中擦過的子彈掉頭飛回去' },
  killSlow: { kind: 'slowmo', tags: ['slowmo'], name: '擊殺慢鏡', en: 'KILL SLOW-MO', text: '每次擊殺自動入慢鏡半秒，不耗表' },
  deepSlow: { kind: 'slowmo', tags: ['slowmo'], name: '深慢鏡', en: 'DEEP SLOW-MO', text: '慢鏡時世界慢一倍，表耗快六成' },
  kickReturn: { kind: 'action', tags: ['kick', 'bounce'], name: '踢彈', en: 'KICK RETURN', text: '踢出去嗰下，面前的子彈掉頭飛回去' },
  slideTrip: { kind: 'action', tags: ['slide', 'kick'], name: '滑鏟絆倒', en: 'SLIDE TRIP', text: '滑鏟撞到敵人就絆倒佢，暈住可以處決' },
  shieldReturn: { kind: 'action', tags: ['shield', 'bounce'], name: '人盾反彈', en: 'SHIELD RETURN', text: '射中你手上人盾的子彈彈回去' },
  lastRound: { kind: 'action', tags: ['gun'], name: '最後一發', en: 'LAST ROUND', text: '彈匣最後一粒子彈穿過人繼續飛' },
  slideSlow: { kind: 'slowmo', tags: ['slide', 'slowmo'], name: '滑鏟慢鏡', en: 'SLIDE SLOW-MO', text: '滑鏟期間自動入慢鏡，不耗表' },
  grazeReload: { kind: 'slowmo', tags: ['slowmo', 'gun'], name: '擦彈上膛', en: 'GRAZE RELOAD', text: '慢鏡中每擦一粒子彈，彈匣加返一粒' },
  slideGrab: { kind: 'action', tags: ['slide', 'shield'], needs: ['slide', 'shield'], name: '滑鏟抓人', en: 'SLIDE GRAB', text: '滑鏟撞到人就順手抓佢做人盾' },
  chainBounce: { kind: 'action', tags: ['bounce'], needs: ['bounce', 'bounce'], name: '連環反彈', en: 'CHAIN BOUNCE', text: '彈回去的子彈打中人之後，再彈去下一個' },
  kickReload: { kind: 'action', tags: ['kick', 'gun'], needs: ['kick', 'gun'], name: '踢出彈匣', en: 'KICK RELOAD', text: '踢倒或者絆倒一個人，雙槍彈匣即刻補滿' },
  noSlow: { kind: 'slowmo', tags: ['slowmo'], cost: true, name: '冇慢鏡・雙倍', en: 'NO SLOW-MO', text: 'Style 雙倍；代價：成局冇子彈時間（連飛撲）' },
  pistolsOnly: { kind: 'slowmo', tags: ['gun', 'slowmo'], cost: true, name: '淨係手槍・慢鏡無限', en: 'PISTOLS ONLY', text: '慢鏡唔耗表；代價：執唔到特別武器' },
  halfHp: { kind: 'action', tags: [], cost: true, name: '半條命・四選一', en: 'HALF HP', text: '之後揀卡四選一；代價：血量上限減半' },
};
export const CARD_IDS = Object.keys(CARDS);
export const KINDS = { action: { name: '動作', en: 'ACTION' }, slowmo: { name: '慢鏡', en: 'SLOW-MO' } };
/** The badge a combo card and a cost card carry over their kind's (F④b). */
export const SORTS = { combo: { name: '組合', en: 'COMBO' }, cost: { name: '代價', en: 'COST' } };
const NUMERAL = ['', '一', '二', '三', '四', '五', '六'];
/** What a card plays with (F④a), on the card under its text. */
export const TAGS = {
  slide: { name: '滑鏟', en: 'SLIDE' },
  shield: { name: '人盾', en: 'SHIELD' },
  slowmo: { name: '慢鏡', en: 'SLOW-MO' },
  bounce: { name: '反彈', en: 'BOUNCE' },
  gun: { name: '槍', en: 'GUN' },
  kick: { name: '踢', en: 'KICK' },
};

/**
 * The tags combo card `id` needs, each with whether the cards in `held` carry it: the combo cards among them do not
 * count, each card counts once for each tag it carries, a tag named twice wants two cards.
 */
export function comboNeeds(id, held) {
  const count = {};
  for (const h of held) if (h !== id && !CARDS[h].needs) for (const t of CARDS[h].tags) count[t] = (count[t] || 0) + 1;
  return CARDS[id].needs.map((tag) => {
    const ok = count[tag] > 0;
    if (ok) count[tag]--;
    return { tag, ok };
  });
}

/**
 * What card `id` would play with among those `held` (the card screen, F④b): `with`, the cards held sharing one of its
 * tags; `completes`, the combo cards held that it would put on; for a combo card, `needs` (comboNeeds).
 */
export function synergy(id, held) {
  const c = CARDS[id];
  if (c.needs) return { needs: comboNeeds(id, held), with: [], completes: [] };
  const on = (k, hand) => comboNeeds(k, hand).every((n) => n.ok);
  return {
    with: held.filter((h) => !CARDS[h].needs && CARDS[h].tags.some((t) => c.tags.includes(t))),
    completes: held.filter((h) => CARDS[h].needs && !on(h, held) && on(h, [...held, id])),
  };
}

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

  /** Card `id` in play: held, and for a combo card (F④b) its needs met by the other cards held. */
  has(id) {
    return this.held.includes(id) && (!CARDS[id].needs || comboNeeds(id, this.held).every((n) => n.ok));
  }

  /** How many cards a floor's end or a door offers: three (two on the ladder's 卡兩選一: rules.js), four with 半條命・四選一 (F④b). */
  get offerSize() {
    return this.has('halfHp') ? 4 : this.game.ruleset.cardOffer || NUM.offer;
  }

  get pending() {
    return !!this.offer;
  }

  /** The end of floor `floor` (0-based): three cards on the screen, from the run's seed. */
  show(floor) {
    const g = this.game;
    this.offer = drawOffer(g.rng.fork('cards', floor), this.held, this.offerSize);
    this.offerFloor = floor;
    const n = NUMERAL[this.offer.length];
    g.notes.log(`風格卡${n}選一：${this.offer.map((id) => CARDS[id].name).join(' / ')}`);
    g.showCards(this.offer, `風格卡 · ${n}選一  STYLE CARD`);
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
    const n = NUMERAL[offer.length];
    g.notes.log(`風格卡${n}選一（挑戰獎勵）：${offer.map((id) => CARDS[id].name).join(' / ')}`);
    g.showCards(offer, `挑戰獎勵 · 風格卡${n}選一  CHALLENGE PRIZE`);
    return true;
  }

  /** A door's prize (prizes.js, F③b): three on the screen before room `stage`'s first wave, from its stream; false when none is left. */
  showDoor(stage) {
    const g = this.game;
    const offer = drawOffer(g.rng.fork('door-cards', stage), this.held, this.offerSize);
    if (!offer.length) return false;
    this.offer = offer;
    this.offerFloor = -1;
    const n = NUMERAL[offer.length];
    g.notes.log(`風格卡${n}選一（門的獎勵）：${offer.map((id) => CARDS[id].name).join(' / ')}`);
    g.showCards(offer, `門的獎勵 · 風格卡${n}選一  DOOR PRIZE`);
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
    g.player.hp = Math.min(g.player.hp, g.player.maxHp); // 半條命: down to the new cap at once
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
