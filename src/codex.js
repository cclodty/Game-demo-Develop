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

/** Each trick: its sort, its name in Chinese (the English is its key, as the feed shows it). */
export const TRICKS = {
  // the guns
  PIROUETTE: { kind: 'gun', name: '旋轉掃射' },
  'SPLIT AIM': { kind: 'gun', name: '分離瞄準' },
  RICOCHET: { kind: 'gun', name: '鑊邊反彈' },
  SCATTER: { kind: 'gun', name: '天女散花' },
  COLLATERAL: { kind: 'gun', name: '一彈多命' },
  'MULTI KILL': { kind: 'gun', name: '連殺' },
  'LAUNDRY DAY': { kind: 'gun', name: '隔衫射' },
  BLACKOUT: { kind: 'gun', name: '黑燈擊殺' },
  SMOKE: { kind: 'gun', name: '煙中擊殺' },
  DEFLECT: { kind: 'gun', name: '子彈撞子彈' },
  AIRBURST: { kind: 'gun', name: '空中引爆' },
  'POINT BLANK': { kind: 'gun', name: '貼身', basic: true },
  'LONG SHOT': { kind: 'gun', name: '遠射', basic: true },
  // the moves
  KICK: { kind: 'move', name: '踢殺' },
  EXECUTION: { kind: 'move', name: '處決' },
  'SPIN KILL': { kind: 'move', name: '旋轉擊殺' },
  'SLIDE KILL': { kind: 'move', name: '滑鏟擊殺' },
  'DIVE KILL': { kind: 'move', name: '飛撲擊殺' },
  JUGGLE: { kind: 'move', name: '浮空連擊' },
  DODGE: { kind: 'move', name: '閃避' },
  'SPIN RELOAD': { kind: 'move', name: '旋轉換彈' },
  'CLEAN BEAT': { kind: 'move', name: '一拍無傷' },
  'CLOSE CALL': { kind: 'move', name: '擦身而過', basic: true },
  GRAZE: { kind: 'move', name: '擦彈', basic: true },
  // the human shield
  'HUMAN SHIELD': { kind: 'shield', name: '人盾擋殺' },
  'HOSTAGE FIRE': { kind: 'shield', name: '借槍' },
  'SHIELD BOWLING': { kind: 'shield', name: '人盾保齡' },
  // the place
  BOOM: { kind: 'stage', name: '油桶爆' },
  CHAIN: { kind: 'stage', name: '連環爆' },
  'ROCKET CAN': { kind: 'stage', name: '石油氣罐' },
  'STRIKE!': { kind: 'stage', name: '撞飛' },
  CRUSHED: { kind: 'stage', name: '壓死' },
  SLAM: { kind: 'stage', name: '門撞' },
  SHUTTER: { kind: 'stage', name: '閘門' },
  SPLASH: { kind: 'stage', name: '落水' },
  'PAN SMASH': { kind: 'stage', name: '鑊擊' },
  'HOME RUN': { kind: 'stage', name: '鑊打回頭' },
  GONG: { kind: 'stage', name: '鑊擋狙擊' },
  PONG: { kind: 'stage', name: '碰' },
  PARASOL: { kind: 'stage', name: '雨傘擋彈' },
  FLIP: { kind: 'stage', name: '翻枱' },
  BOWLING: { kind: 'stage', name: '手推車保齡' },
  ROLLING: { kind: 'stage', name: '滾油桶' },
  'FRIENDLY FIRE': { kind: 'stage', name: '同伴誤殺' },
  'GRAND PRIX': { kind: 'stage', name: '賽車' },
  'PIGEON STRIKE': { kind: 'stage', name: '白鴿' },
  NETTED: { kind: 'stage', name: '漁網' },
  FALL: { kind: 'stage', name: '跌落露台' },
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
