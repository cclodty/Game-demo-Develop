// The doors' prizes (F③b, REDESIGN §6). Where a room's two doors give a choice (F③a: main.js setExits), each carries
// a prize, drawn from the room's own stream (rng.fork('door-prize', stage): the same seed, the same prizes), the two
// different. The one walked through comes with the next room as it begins (main.js takeExit, updateTransition): a gun
// on the floor before its entry, a style card picked before its first wave, an elite room (an affix more, its wave
// clears scoring twice: waves.js affixesFor, main.js onWaveClear), or a heal (DOORS.heal of a full meter; at full HP a
// life instead, while fewer than CHALLENGE.maxLives are in hand). Each is data: its name on the door's sign, whether it
// fits the run's rules. The numbers are in config.js DOORS.
import { CHALLENGE, DOORS } from './config.js';
import { openWeapons } from './unlocks.js';
import { PLAYER_WEAPONS } from './weapons.js';

/** `name` and `en` on the door's sign; `fits` whether it can be offered (a gun is none where no gun is handed out: rules.js `drops`). */
export const PRIZES = {
  gun: { name: '一支槍', en: 'GUN', fits: (g) => g.ruleset.drops !== false && g.ruleset.pads !== false && !g.cards.has('pistolsOnly') },
  card: { name: '一張卡', en: 'CARD', fits: (g) => g.cards.pool.filter((id) => !g.cards.held.includes(id)).length >= 3 },
  elite: { name: '精英房', en: 'ELITE', fits: () => true },
  heal: { name: '回血', en: 'HEAL', fits: () => true },
};
export const PRIZE_IDS = Object.keys(PRIZES);

/** Two different prizes for room `stage`'s two doors, from its stream (fewer when fewer fit). */
export function drawPrizes(g, stage) {
  const r = g.rng.fork('door-prize', stage);
  const ids = PRIZE_IDS.filter((id) => PRIZES[id].fits(g));
  const out = [];
  while (out.length < 2 && ids.length) out.push(ids.splice(r.int(0, ids.length - 1), 1)[0]);
  return out;
}

/** Prize `id`, won at the door into room `stage`, given as that room begins, the player at its entry. */
export function givePrize(g, id, stage) {
  const p = g.player;
  const L = g.level;
  if (id === 'gun') {
    // a special weapon, full, on the floor a little way in from the entry (slot 2 empty, walking over it takes it)
    const r = g.rng.fork('door-gun', stage);
    const list = openWeapons(DOORS.weapons, g.unlockMask); // the unlock table's (F⑥b)
    const kind = list[r.int(0, list.length - 1)];
    const a = (L.map.entry[2] * Math.PI) / 180;
    g.pickups.spawn(kind, L.start.x + Math.sin(a) * DOORS.gunIn, L.start.z + Math.cos(a) * DOORS.gunIn, { ttl: DOORS.gunTtl });
    g.notes.log(`門的獎勵：${PLAYER_WEAPONS[kind].name}喺入口前面`);
  } else if (id === 'card') {
    if (!g.cards.showDoor(stage)) g.notes.log('門的獎勵：風格卡已經揀晒');
  } else if (id === 'elite') {
    g.eliteStage = stage;
    g.notes.log('門的獎勵：精英房（多一個詞綴，清波分數加倍）');
    g.hud.banner('ELITE ROOM', '精英房 · 多一個詞綴 · 清波分數加倍', 'stage');
  } else if (id === 'heal') {
    if (p.hp < p.maxHp) {
      const before = Math.ceil(p.hp);
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * DOORS.heal);
      g.notes.log(`門的獎勵：回血 HP ${before} → ${Math.ceil(p.hp)}`);
    } else if (g.challenge.addLife()) {
      // at full HP a heal is nothing: a life instead (the developer 10-29), while fewer than CHALLENGE.maxLives are in hand
      g.notes.log(`門的獎勵：血滿，改為多一條命（共 ${g.challenge.lives}）`);
      g.hud.banner('EXTRA LIFE', '血滿 · 改為多一條命', 'clear');
    } else g.notes.log(`門的獎勵：血滿，命已經有 ${CHALLENGE.maxLives} 條`);
  }
}
