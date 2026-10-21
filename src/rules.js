// Run rules (變體規則與難度): a difficulty and any of the variants, picked on
// the title screen before a run. Every rule is data, one switch or one number
// of BASE, and each is read in one place by the system it belongs to (see the
// comments in BASE). The game holds the result as game.ruleset for the whole
// run; the input record keeps the picks (packRules), so a replay plays under
// the same rules.

/** How a run plays when nothing is picked; difficulties and variants change these. */
export const BASE = {
  slowmo: true, // Shift / Q enter bullet time (main.js toggleFocus)
  pads: true, // the weapon pads fill at every wave (waves.js startWave)
  drops: true, // enemies drop their guns (enemies.js dropWeapon)
  glassUpTo: 0, // cover up to this height (m) is glass instead; 0 for none (level.js load)
  aimMul: 1, // enemies' aim time × (enemies.js aimTime)
  styleMul: 1, // Style points × (score.js kill and style)
  pansAsBarrels: false, // the map's pans are barrels instead (level.js load)
  startWeapon: 'pistols', // what the player starts with (player.js reset); 'none' for empty hands (player.js unarmed)
};

export const DIFFICULTIES = {
  street: { name: '街頭', en: 'STREET', desc: '敵人瞄準慢（×1.4）', color: '#4cd6a0', set: { aimMul: 1.4 } },
  normal: { name: '正常', en: 'NORMAL', desc: '原本的節奏', color: '#9aa0c8', set: {} },
  ballet: { name: '芭蕾', en: 'BALLET', desc: '敵人瞄準快（×0.7），Style 分 ×1.5', color: '#ff4fd8', set: { aimMul: 0.7, styleMul: 1.5 } },
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

/** What each day's challenge plays, in turn (daily.js: the day's number modulo the table); another row is another day. */
export const DAILY_ROTATION = [
  { map: 0, difficulty: 'normal', variants: [] },
  { map: 1, difficulty: 'ballet', variants: [] },
  { map: 2, difficulty: 'normal', variants: ['glassCity'] },
  { map: 3, difficulty: 'normal', variants: [] },
  { map: 0, difficulty: 'normal', variants: ['dualist'] },
  { map: 1, difficulty: 'street', variants: ['noSlowmo'] },
  { map: 2, difficulty: 'ballet', variants: ['dualist'] },
];

/** The rules of a run: BASE, then the difficulty's and each variant's settings (multipliers multiply, the rest replace). */
export function rulesFor(difficulty = 'normal', variants = []) {
  const d = DIFFICULTIES[difficulty] ? difficulty : 'normal';
  const vs = VARIANT_IDS.filter((id) => variants.includes(id)); // known ones, in a fixed order
  const r = { ...BASE };
  for (const pick of [DIFFICULTIES[d], ...vs.map((id) => VARIANTS[id])]) {
    for (const [k, v] of Object.entries(pick.set)) r[k] = k.endsWith('Mul') ? r[k] * v : v;
  }
  return Object.assign(r, { difficulty: d, variants: vs, label: rulesLabel(d, vs) });
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

/** What the HUD and the notes call the picks: '芭蕾 · 玻璃之城'; '' for a normal run without variants. */
export function rulesLabel(difficulty, variants) {
  const parts = difficulty === 'normal' ? [] : [DIFFICULTIES[difficulty].name];
  for (const id of variants) parts.push(VARIANTS[id].name);
  return parts.join(' · ');
}
