// Run rules (變體規則與難度): a difficulty, any of the variants and a ladder level (F⑥a), picked on
// the title screen before a run. Every rule is data, one switch or one number
// of BASE, and each is read in one place by the system it belongs to (see the
// comments in BASE). The game holds the result as game.ruleset for the whole
// run; the input record keeps the picks (packRules; the ladder's level in the mode byte: replay.js), so a replay
// plays under the same rules.

/** How a run plays when nothing is picked; difficulties and variants change these. */
export const BASE = {
  slowmo: true, // Shift / Q enter bullet time (main.js toggleFocus)
  pads: true, // the weapon pads fill, once a stage (config.js FIREPOWER, waves.js startWave)
  drops: true, // enemies drop their guns (enemies.js dropWeapon)
  glassUpTo: 0, // cover up to this height (m) is glass instead; 0 for none (level.js load)
  aimMul: 1, // enemies' aim time × (enemies.js aimTime)
  styleMul: 1, // Style points × (score.js kill and style)
  pansAsBarrels: false, // the map's pans are barrels instead (level.js load)
  startWeapon: 'pistols', // what the player starts with (player.js reset); 'none' for empty hands (player.js unarmed)
  // the ladder's (F⑥a: LADDER)
  enemyHpMul: 1, // men's health × (enemies.js, as each comes in)
  focusRegenMul: 1, // the focus meter's refill × (main.js logic)
  bossSegments: 0, // segments more on a boss's bar, each of a duo's (boss.js start)
  lasers: true, // the men's red aim lines; false: all of them as 盲射 (enemies.js updateLaser)
  affixesEach: 0, // 0: the affixes as config.js AFFIX deals them; n: n in every room from the first floor (waves.js affixesFor)
  cardOffer: 0, // 0: config.js CARDS.offer at a floor's end or a door (cards.js offerSize)
  lives: true, // lives can be won (challenge.js addLife)
  enemyBulletMul: 1, // the men's rounds' speed × (bullets.js spawn)
  gap: true, // the gap guarantee (enemies.js gapAllows, config.js HELL.gap)
};

export const DIFFICULTIES = {
  street: { name: '街頭', en: 'STREET', desc: '敵人瞄準慢（×1.4）', color: '#4cd6a0', set: { aimMul: 1.4 } },
  normal: { name: '正常', en: 'NORMAL', desc: '敵人瞄準 ×0.85，每關再快一點', color: '#9aa0c8', set: { aimMul: 0.85 } },
  ballet: { name: '芭蕾', en: 'BALLET', desc: '敵人瞄準快（×0.6），Style 分 ×1.5', color: '#ff4fd8', set: { aimMul: 0.6, styleMul: 1.5 } },
};
export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);

export const VARIANTS = {
  dualist: { name: '雙槍主義', en: 'DUALIST', desc: '只有雙槍：武器台不刷新，敵人不掉槍', color: '#ffc861', set: { pads: false, drops: false } },
  noSlowmo: { name: '沒有慢鏡', en: 'NO SLOW-MO', desc: '子彈時間關閉，Style 分 ×2', color: '#4fd8ff', set: { slowmo: false, styleMul: 2 } },
  glassCity: { name: '玻璃之城', en: 'GLASS CITY', desc: '所有掩體換成玻璃，一槍就碎', color: '#9fe8ff', set: { glassUpTo: 1.8 } },
  // opened by an achievement (achievements.js): hidden on the title until then
  barrelFest: { name: '油桶節', en: 'BARREL FEST', desc: '平底鑊全部換成油桶', color: '#ff6a3a', set: { pansAsBarrels: true }, unlock: 'useEverything' },
  smgStart: { name: '雙衝鋒槍起手', en: 'SMG START', desc: '開局就拿著雙衝鋒槍', color: '#ffe066', set: { startWeapon: 'smg' }, unlock: 'bankShot' },
  noGuns: { name: '無槍', en: 'NO GUNS', desc: '空手開局：武器台不刷新，敵人不掉槍，全靠工具與環境', color: '#ff8a5c', set: { startWeapon: 'none', pads: false, drops: false }, unlock: 'bareHands' },
};
export const VARIANT_IDS = Object.keys(VARIANTS);

/**
 * The ladder (F⑥a, REDESIGN §6, first version): a cleared 彈幕 run opens the next level, kept in this browser
 * (ladderReached). Each level is one fixed change, its own only (the developer's REDESIGN: level 10 is all of them).
 */
const STEPS = [
  { name: '敵人血 +10%', en: 'TOUGHER', set: { enemyHpMul: 1.1 } },
  { name: '專注回得慢', en: 'SLOW FOCUS', set: { focusRegenMul: 0.6 } },
  { name: '頭目多一階段', en: 'BOSS PHASE', set: { bossSegments: 1 } },
  { name: '沒有紅線', en: 'NO LASERS', set: { lasers: false } },
  { name: '詞綴每房兩個', en: 'AFFIXES', set: { affixesEach: 2 } },
  { name: '卡兩選一', en: 'TWO CARDS', set: { cardOffer: 2 } },
  { name: '一條命', en: 'NO LIVES', set: { lives: false } },
  { name: '快彈 +10%', en: 'FASTER ROUNDS', set: { enemyBulletMul: 1.1 } },
  { name: '沒有缺口保證', en: 'NO GAPS', set: { gap: false } },
];
export const LADDER = [...STEPS, { name: '全部', en: 'EVERYTHING', set: Object.assign({}, ...STEPS.map((s) => s.set)) }];
export const LADDER_TOP = LADDER.length;

const LADDER_KEY = 'bullet-ballet.ladder';

/** The highest level a cleared run has opened in this browser (0: none yet). */
export function ladderReached(storage = globalThis.localStorage) {
  try {
    const n = Number(storage.getItem(LADDER_KEY));
    return Number.isInteger(n) ? Math.max(0, Math.min(LADDER_TOP, n)) : 0;
  } catch {
    return 0;
  }
}

/** A run cleared at `level` (0 without the ladder): the next one opens; returns the level opened, or 0 when none is new. */
export function openLadder(level, storage = globalThis.localStorage) {
  const next = Math.min(LADDER_TOP, level + 1);
  if (next <= ladderReached(storage)) return 0;
  try {
    storage.setItem(LADDER_KEY, String(next));
  } catch {
    // storage unavailable: opened for this visit only
  }
  return next;
}

/** What each day's challenge plays, in turn (daily.js: the day's number modulo the table); another row is another day. */
export const DAILY_ROTATION = [
  { map: 0, difficulty: 'normal', variants: [] },
  { map: 1, difficulty: 'ballet', variants: [] },
  { map: 2, difficulty: 'normal', variants: ['glassCity'] },
  { map: 3, difficulty: 'normal', variants: [] },
  { map: 0, difficulty: 'normal', variants: ['dualist'] },
  { map: 1, difficulty: 'street', variants: ['noSlowmo'] },
  { map: 2, difficulty: 'ballet', variants: ['dualist'] },
  { map: 4, difficulty: 'normal', variants: [] },
  { map: 4, difficulty: 'street', variants: ['glassCity'] },
  { map: 5, difficulty: 'normal', variants: [] },
  { map: 6, difficulty: 'normal', variants: [] },
];

/**
 * The rules of a run: BASE, then the difficulty's, each variant's and the ladder level's settings (multipliers
 * multiply, the rest replace).
 */
export function rulesFor(difficulty = 'normal', variants = [], ladder = 0) {
  const d = DIFFICULTIES[difficulty] ? difficulty : 'normal';
  const vs = VARIANT_IDS.filter((id) => variants.includes(id)); // known ones, in a fixed order
  const lv = Number.isInteger(ladder) ? Math.max(0, Math.min(LADDER_TOP, ladder)) : 0;
  const r = { ...BASE };
  for (const pick of [DIFFICULTIES[d], ...vs.map((id) => VARIANTS[id]), ...(lv ? [LADDER[lv - 1]] : [])]) {
    for (const [k, v] of Object.entries(pick.set)) r[k] = k.endsWith('Mul') ? r[k] * v : v;
  }
  return Object.assign(r, { difficulty: d, variants: vs, ladder: lv, label: rulesLabel(d, vs, lv) });
}

/** One byte for the input record: the difficulty's index in bits 0-1, then one bit per variant. */
export function packRules(difficulty, variants) {
  let b = Math.max(0, DIFFICULTY_IDS.indexOf(difficulty));
  VARIANT_IDS.forEach((id, i) => {
    if (variants.includes(id)) b |= 4 << i;
  });
  return b;
}

export function unpackRules(b) {
  return { difficulty: DIFFICULTY_IDS[b & 3] || 'normal', variants: VARIANT_IDS.filter((_, i) => b & (4 << i)) };
}

/** What the HUD and the notes call the picks: '芭蕾 · 玻璃之城 · 階梯 3'; '' for a normal run without variants or ladder. */
export function rulesLabel(difficulty, variants, ladder = 0) {
  const parts = difficulty === 'normal' ? [] : [DIFFICULTIES[difficulty].name];
  for (const id of variants) parts.push(VARIANTS[id].name);
  if (ladder) parts.push(`階梯 ${ladder}`);
  return parts.join(' · ');
}
