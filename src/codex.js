// The tricks (F⑤a, ROADMAP 精通可以研究): every move, kill and stunt the game already names in its Style feed, one row
// each, keyed by that name (a kill tag main.js onEnemyKilled gives, or a Style line's: score.js style). A room's
// rating counts how many different ones it saw (score.js roomTricks; config.js ROOM_RATING), not how many men fell;
// the trick book (F⑤b) lights each once it is done. The men's and the bosses' names, the wave and room bonuses and the
// bullet patterns are not tricks. A `basic` one (being in bullet time, a graze, a shot's range) is in the book but not
// counted for a rating: nearly every kill has one.

/** The sorts of trick, in the order the book shows them. */
export const KINDS = {
  gun: { name: '槍', en: 'GUN' },
  move: { name: '動作', en: 'MOVE' },
  shield: { name: '人盾', en: 'SHIELD' },
  stage: { name: '環境', en: 'STAGE' },
  slowmo: { name: '慢鏡', en: 'SLOW-MO' },
  card: { name: '卡', en: 'CARD' },
};

/**
 * Each trick: its sort, its name in Chinese (the English is its key, as the feed shows it), and for about half of them
 * a `hint` the book shows before it is done (F⑤b; the rest show ？？？ until then).
 */
export const TRICKS = {
  // the guns
  PIROUETTE: { kind: 'gun', name: '旋轉掃射', hint: '旋轉閃避嗰陣開槍' },
  'SPLIT AIM': { kind: 'gun', name: '分離瞄準', hint: '右鍵鎖住一個，雙槍各打一個' },
  RICOCHET: { kind: 'gun', name: '鑊邊反彈', hint: '射中平底鑊，子彈會轉彎' },
  SCATTER: { kind: 'gun', name: '天女散花', hint: '射中半空嘅鑊' },
  COLLATERAL: { kind: 'gun', name: '一彈多命', hint: '一粒子彈打穿幾個人' },
  'MULTI KILL': { kind: 'gun', name: '連殺', hint: '半秒內連殺兩個' },
  'LAUNDRY DAY': { kind: 'gun', name: '隔衫射', hint: '隔住晾緊嘅衫開槍' },
  BLACKOUT: { kind: 'gun', name: '黑燈擊殺' },
  SMOKE: { kind: 'gun', name: '煙中擊殺' },
  DEFLECT: { kind: 'gun', name: '子彈撞子彈', hint: '用子彈打子彈' },
  AIRBURST: { kind: 'gun', name: '空中引爆', hint: '手榴彈喺半空就射佢' },
  'POINT BLANK': { kind: 'gun', name: '貼身', basic: true },
  'LONG SHOT': { kind: 'gun', name: '遠射', basic: true },
  // the moves
  KICK: { kind: 'move', name: '踢殺', hint: '踢死一個人' },
  EXECUTION: { kind: 'move', name: '處決', hint: '踢暈之後撳 F' },
  'SPIN KILL': { kind: 'move', name: '旋轉擊殺' },
  'SLIDE KILL': { kind: 'move', name: '滑鏟擊殺' },
  'DIVE KILL': { kind: 'move', name: '飛撲擊殺', hint: '慢鏡中方向＋Space 飛撲，半空開槍' },
  JUGGLE: { kind: 'move', name: '浮空連擊', hint: '打飛起嘅人' },
  DODGE: { kind: 'move', name: '閃避' },
  'SPIN RELOAD': { kind: 'move', name: '旋轉換彈', hint: '冇子彈嗰陣旋轉' },
  'CLEAN BEAT': { kind: 'move', name: '一拍無傷', hint: '一拍彈幕一下都唔中' },
  'CLOSE CALL': { kind: 'move', name: '擦身而過', basic: true },
  GRAZE: { kind: 'move', name: '擦彈', basic: true },
  // the human shield
  'HUMAN SHIELD': { kind: 'shield', name: '人盾擋殺', hint: '抓住人做盾，等佢自己人射佢' },
  'HOSTAGE FIRE': { kind: 'shield', name: '借槍', hint: '抓住機槍手，用佢支槍' },
  'SHIELD BOWLING': { kind: 'shield', name: '人盾保齡', hint: '推出人盾撞倒其他人' },
  'SHIELD RING': { kind: 'shield', name: '人盾放環', hint: '抓住環形手，佢個環由你身邊放出去' },
  // the place
  BOOM: { kind: 'stage', name: '油桶爆', hint: '射油桶' },
  CHAIN: { kind: 'stage', name: '連環爆', hint: '一個爆炸引爆另一個' },
  'ROCKET CAN': { kind: 'stage', name: '石油氣罐', hint: '踢石油氣罐' },
  'STRIKE!': { kind: 'stage', name: '撞飛' },
  CRUSHED: { kind: 'stage', name: '壓死' },
  SLAM: { kind: 'stage', name: '門撞' },
  SHUTTER: { kind: 'stage', name: '閘門', hint: '閘落嗰陣有人喺下面' },
  SPLASH: { kind: 'stage', name: '落水', hint: '踢人落水' },
  'PAN SMASH': { kind: 'stage', name: '鑊擊', hint: '揸住鑊撳 F' },
  'HOME RUN': { kind: 'stage', name: '鑊打回頭', hint: '揮鑊嗰下打返子彈' },
  GONG: { kind: 'stage', name: '鑊擋狙擊' },
  PONG: { kind: 'stage', name: '碰', hint: '擲麻雀牌暈到幾個人' },
  PARASOL: { kind: 'stage', name: '雨傘擋彈' },
  FLIP: { kind: 'stage', name: '翻枱', hint: '踢枱，翻起做掩護' },
  BOWLING: { kind: 'stage', name: '手推車保齡', hint: '踢手推車撞人' },
  ROLLING: { kind: 'stage', name: '滾油桶' },
  'FRIENDLY FIRE': { kind: 'stage', name: '同伴誤殺' },
  'GRAND PRIX': { kind: 'stage', name: '賽車', hint: '賽車經過嗰陣引人出跑道' },
  'PIGEON STRIKE': { kind: 'stage', name: '白鴿', hint: '嚇起白鴿遮住敵人視線' },
  NETTED: { kind: 'stage', name: '漁網' },
  FALL: { kind: 'stage', name: '跌落露台', hint: '擲嘢上露台' },
  CROSSFIRE: { kind: 'stage', name: '自己人交火' },
  'DOUBLE KO': { kind: 'stage', name: '雙殺' },
  // bullet time
  'SLOW-MO': { kind: 'slowmo', name: '慢鏡擊殺', basic: true },
  // the style cards' (cards.js)
  'SLIDE DEFLECT': { kind: 'card', name: '滑鏟反彈' },
  'TABLE BOUNCE': { kind: 'card', name: '枱面反彈' },
  'GRAZE RETURN': { kind: 'card', name: '擦彈反彈' },
  'KICK RETURN': { kind: 'card', name: '踢彈' },
  'SHIELD RETURN': { kind: 'card', name: '人盾反彈' },
  'SLIDE TRIP': { kind: 'card', name: '滑鏟絆倒' },
  'SLIDE GRAB': { kind: 'card', name: '滑鏟抓人' },
  'LAST ROUND': { kind: 'card', name: '最後一發' },
  'CHAIN BOUNCE': { kind: 'card', name: '連環反彈' },
};
export const TRICK_IDS = Object.keys(TRICKS);

/** Whether `label` (a kill tag or a Style line's name) is a trick a room's rating counts. */
export function rated(label) {
  const t = TRICKS[label];
  return !!t && !t.basic;
}

/** A room's rating from how many different tricks it saw (config.js ROOM_RATING: the fewest for each, best first). */
export function roomRating(n, grades) {
  for (const [grade, least] of grades) if (n >= least) return grade;
  return grades[grades.length - 1][0];
}

/** The run's rooms' grades as one (the end screen): each worth its place from the bottom, the mean rounded to a grade. */
export function averageRating(got, grades) {
  if (!got.length) return null;
  const worth = (g) => grades.length - grades.findIndex(([x]) => x === g); // the best is grades.length, the last 1
  const mean = got.reduce((a, g) => a + worth(g), 0) / got.length;
  const i = Math.max(0, Math.min(grades.length - 1, grades.length - Math.round(mean)));
  return grades[i][0];
}

const KEY = 'bullet-ballet.codex';

/**
 * The trick book (F⑤b): which tricks have been done in this browser (kept like the achievements), each lit the first
 * time; `fresh` lists the ones first done this run, for the end screen. A replay being watched lights nothing.
 */
export class Codex {
  /** `storage` is localStorage or a stand-in. */
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let data = null;
    try {
      data = JSON.parse(storage.getItem(KEY) || 'null');
    } catch {
      data = null;
    }
    this.lit = data && typeof data.lit === 'object' && data.lit ? data.lit : {}; // id -> when first done
    this.watching = false;
    this.fresh = [];
  }

  startRun() {
    this.fresh = [];
  }

  has(id) {
    return !!this.lit[id];
  }

  /** A kill tag or a Style line: lit if it is a trick not yet done (true then). */
  see(label) {
    if (this.watching || !TRICKS[label] || this.lit[label]) return false;
    this.lit[label] = Date.now();
    this.fresh.push(label);
    try {
      this.storage.setItem(KEY, JSON.stringify({ lit: this.lit }));
    } catch {
      // a full or a blocked storage: lit for this visit only
    }
    return true;
  }

  get count() {
    return TRICK_IDS.filter((id) => this.lit[id]).length;
  }
}
