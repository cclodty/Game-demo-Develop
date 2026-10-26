// Bot measurements for feel changes (試玩回饋 ④): plays arcade runs with the
// test bot (test/helpers.mjs installBot) and reports, wave by wave, how long
// it took, what the player took in damage, the enemies' total health, the
// firepower handed out (weapon pads and drops, as damage: ammo × damage per
// shot) and what the bot picked up, and how much of the time a heavy gun was
// in hand. Same seeds, same bot: run it before and after a change.
//
//   node scripts/measure.mjs [--runs 5] [--map 0] [--god] [--loot] [--json out.json]
//
// --god: hurt as usual but never down, so every wave is played (firepower,
// health, time); without it the run ends where the bot falls (difficulty).
// --loot: the bot walks to a weapon on the floor whenever slot 2 is empty.
import fs from 'node:fs';
import { gameHarness, installBot } from '../test/helpers.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const RUNS = Number(arg('runs', 5));
const MAP = Number(arg('map', 0));
const GOD = !!arg('god', false);
const LOOT = !!arg('loot', false);
const JSON_OUT = arg('json', null);
const LIMIT = Number(arg('minutes', 30)) * 60 * 60; // frames of game time a run may take at most

const h = await gameHarness();
const runs = [];
try {
  for (let r = 0; r < RUNS; r++) {
    const seed = 101 + r;
    const { page } = await h.open(`?seed=${seed}`);
    await installBot(page, { map: MAP, seed, restart: false, god: GOD, loot: LOOT });
    await page.evaluate(async () => {
      const g = window.game;
      const { PLAYER_WEAPONS } = await import('./src/weapons.js');
      // what a gun's ammo is worth in damage: shots × damage × pellets; a grenade counts as its blast's core (main.js explode: 20)
      const worth = (kind, ammo) => {
        const w = PLAYER_WEAPONS[kind];
        return ammo * (w.grenade ? 20 : w.damage * (w.pellets || 1));
      };
      const M = (window.M = { waves: {}, end: null });
      const row = () => {
        const n = g.waves.wave;
        return (M.waves[n] ||= { n, boss: g.waves.bossWave, map: g.level.map.id, floor: g.floors ? g.floorOf(g.stage) + 1 : 0, frames: 0, heavy: 0, hurt: 0, hp: 0, enemies: 0, pads: 0, drops: 0, taken: 0, kills0: g.score.kills, kills: 0 });
      };
      let dropping = false;
      const drop0 = g.pickups.drop.bind(g.pickups);
      g.pickups.drop = (...a) => {
        dropping = true;
        try {
          return drop0(...a);
        } finally {
          dropping = false;
        }
      };
      const spawn0 = g.pickups.spawn.bind(g.pickups);
      g.pickups.spawn = (kind, x, z, o = {}) => {
        const p = spawn0(kind, x, z, o);
        if (o.pad) row().pads += worth(kind, p.ammo);
        else if (dropping) row().drops += worth(kind, p.ammo);
        return p;
      };
      const give0 = g.player.giveWeapon.bind(g.player);
      g.player.giveWeapon = (kind, ammo, replace) => {
        row().taken += worth(kind, ammo);
        return give0(kind, ammo, replace);
      };
      const hurt0 = g.player.hurt;
      g.player.hurt = (d, ...a) => {
        const ok = hurt0(d, ...a);
        if (ok) row().hurt += d;
        return ok;
      };
      const enemy0 = g.enemies.spawn.bind(g.enemies);
      g.enemies.spawn = (type, sp) => {
        const e = enemy0(type, sp);
        const w = row();
        w.hp += e.hp;
        w.enemies++;
        return e;
      };
      window.tick = () => {
        if (g.state !== 'playing' || g.waves.state !== 'active') return;
        const w = row();
        w.frames++;
        const p = g.player;
        if (p.slot === 'special' && p.special && !p.special.empty) w.heavy++;
        w.kills = g.score.kills - w.kills0;
      };
    });
    const t0 = Date.now();
    let frames = 0;
    for (;;) {
      const ok = await page.evaluate(() => {
        for (let k = 0; k < 600; k++) {
          if (!window.simStep(1)) return 'error';
          window.tick();
          if (window.game.state === 'over') return 'over';
        }
        return 'go';
      });
      frames += 600;
      if (ok !== 'go' || frames >= LIMIT) {
        const end = await page.evaluate((why) => {
          const g = window.game;
          return { why, wave: g.waves.wave, cleared: g.waves.state === 'done', alive: g.player.alive, score: g.score.score, errors: window.stats.errors.slice(0, 2) };
        }, ok === 'go' ? 'time' : ok);
        const waves = await page.evaluate(() => Object.values(window.M.waves));
        runs.push({ seed, ...end, frames, minutes: frames / 3600, waves });
        console.error(`run ${r + 1}/${RUNS} seed ${seed}: wave ${end.wave}${end.cleared ? ' (clear)' : ''}, ${(frames / 3600).toFixed(1)} min game time, ${((Date.now() - t0) / 1000).toFixed(0)} s real${end.errors.length ? `, ERROR ${end.errors[0]}` : ''}`);
        break;
      }
    }
    await page.close();
  }
} finally {
  await h.close();
}

// the summary: per wave over the runs, per stage, and waves 5–12
const fmt = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
const all = runs.flatMap((r) => r.waves.filter((w) => w.n > 0));
const sum = (list, k) => list.reduce((a, w) => a + w[k], 0);
console.log(`\n${RUNS} runs, map ${MAP}${GOD ? ', god' : ''}${LOOT ? ', loot' : ''}`);
console.log('wave | runs | time s | hurt | enemy hp | pads | drops | handed ÷ hp | taken ÷ hp | heavy in hand');
for (let n = 1; n <= 12; n++) {
  const ws = all.filter((w) => w.n === n);
  if (!ws.length) continue;
  const hp = sum(ws, 'hp');
  const handed = sum(ws, 'pads') + sum(ws, 'drops');
  console.log(`${n}${ws[0].boss ? ' (boss)' : ''} | ${ws.length} | ${fmt(sum(ws, 'frames') / 60 / ws.length)} | ${fmt(sum(ws, 'hurt') / ws.length)} | ${fmt(hp / ws.length)} | ${fmt(sum(ws, 'pads') / ws.length, 0)} | ${fmt(sum(ws, 'drops') / ws.length, 0)} | ${fmt(handed / hp, 2)} | ${fmt(sum(ws, 'taken') / hp, 2)} | ${fmt((100 * sum(ws, 'heavy')) / sum(ws, 'frames'), 0)}%`);
}
const stage = (a, b) => {
  const ws = all.filter((w) => w.n >= a && w.n <= b);
  const hp = sum(ws, 'hp');
  return { handed: (sum(ws, 'pads') + sum(ws, 'drops')) / hp, taken: sum(ws, 'taken') / hp, heavy: sum(ws, 'heavy') / sum(ws, 'frames'), hurt: sum(ws, 'hurt') / runs.length };
};
for (const [a, b] of [
  [1, 4],
  [5, 8],
  [9, 12],
  [5, 12],
]) {
  const s = stage(a, b);
  console.log(`waves ${a}–${b}: handed ÷ hp ${fmt(s.handed, 2)}, taken ÷ hp ${fmt(s.taken, 2)}, heavy in hand ${fmt(100 * s.heavy, 0)}%, hurt ${fmt(s.hurt, 0)} a run`);
}
const cleared = runs.filter((r) => r.cleared).length;
console.log(`ended at wave ${runs.map((r) => r.wave).join(', ')} (mean ${fmt(runs.reduce((a, r) => a + r.wave, 0) / runs.length)}); cleared ${cleared}/${runs.length}; ${fmt(runs.reduce((a, r) => a + r.minutes, 0) / runs.length)} min a run`);
// a floor run (彈幕 ② C①): a line a floor, over the runs
const floors = [...new Set(all.map((w) => w.floor).filter((f) => f > 0))].sort((a, b) => a - b);
for (const f of floors) {
  const rows = all.filter((w) => w.floor === f);
  const n = new Set(rows.map((w) => w.n)).size;
  console.log(`floor ${f}: ${n} waves, ${fmt(rows.reduce((a, w) => a + w.frames, 0) / 60 / runs.length, 0)} s a run, hurt ${fmt(rows.reduce((a, w) => a + w.hurt, 0) / runs.length, 0)} a run`);
}
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(runs, null, 1));
