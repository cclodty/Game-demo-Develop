// The firepower curve (試玩回饋 ④, DECISIONS 2026-10-23): a heavy gun is
// something to save. The weapon pads fill once a stage, at its first wave,
// not every wave, and what is left on them stays till the next map; a brute
// drops his minigun only some of the time, and every dropped gun comes with
// part of its ammo (config.js FIREPOWER). A replay from before still plays,
// marked as recorded under other rules (maps.js PLAY_REV).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { FIREPOWER } from '../src/config.js';
import { MAPS, MAPS_REV, PLAY_REV } from '../src/maps.js';
import { ROOMS } from '../src/rooms.js';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=41'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** The waves a run in `mode` fills the pads at, of its first `n`; each wave's start on its own stage's map, the pads emptied before it. */
    window.padWaves = (mode, n) => {
      g.setRules('normal', []);
      g.setMode(mode);
      g.startRun(0);
      const per = g.waves.rules.perStage;
      const out = [];
      for (let w = 1; w <= n; w++) {
        const stage = Math.floor((w - 1) / per);
        if (stage !== g.stage) {
          g.stage = stage;
          g.pickups.clear();
          g.level.load(g.stageMap);
          g.player.placeAtStart();
        }
        for (const p of g.level.pads) if (p.pickup) g.pickups.remove(p.pickup);
        g.bosses.reset();
        g.enemies.clear();
        g.waves.wave = w - 1;
        g.waves.startWave();
        const filled = g.level.pads.filter((p) => p.pickup).length;
        if (filled) out.push(w);
        if (filled && filled !== g.level.pads.length) out.push(`only ${filled} of ${g.level.pads.length} at ${w}`);
      }
      g.bosses.reset();
      g.waves.state = 'done';
      g.enemies.clear();
      return out;
    };
  });
});
after(async () => {
  await h.close();
});

test('the weapon pads fill once a stage, at its first wave (arcade 1, 5, 9; endless 1, 4, 7), and a gun left on a pad stays there through the stage', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const arcade = window.padWaves('arcade', 12);
    const endless = window.padWaves('endless', 9);
    // a stage's pads, one gun taken: the next wave leaves the other where it is
    g.setMode('arcade');
    g.startRun(0);
    g.waves.wave = 0;
    g.waves.startWave();
    const pads = g.level.pads.map((p) => p.pickup && p.pickup.kind);
    g.pickups.remove(g.level.pads[0].pickup);
    g.enemies.clear();
    g.waves.startWave();
    const after = g.level.pads.map((p) => p.pickup && p.pickup.kind);
    g.waves.state = 'done';
    g.enemies.clear();
    const notes = g.notes.events.filter((e) => e.text === '武器台刷新').length;
    return { arcade, endless, pads, after, notes };
  });
  assert.equal(FIREPOWER.pads, 'stage');
  assert.deepEqual(r.arcade, [1, 5, 9], 'arcade: four waves a stage');
  assert.deepEqual(r.endless, [1, 4, 7], 'endless: three');
  assert.ok(r.pads.length >= 2 && r.pads.every(Boolean), `the first wave fills every pad (${r.pads})`);
  assert.deepEqual(r.after, [null, ...r.pads.slice(1)], 'wave 2: the taken one stays empty, the other keeps its gun');
  assert.ok(r.notes >= 1, 'the notes say when the pads fill');
  assert.deepEqual(problems(logs), []);
});

test('a brute drops his minigun with FIREPOWER’s chance; every dropped gun comes with FIREPOWER.dropAmmo of its ammo', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { PLAYER_WEAPONS } = await import('./src/weapons.js');
    g.setRules('normal', []);
    g.setMode('arcade');
    g.startRun(0);
    g.waves.state = 'done';
    g.enemies.clear();
    const p = g.player;
    const kill = (type, n) => {
      const got = [];
      for (let i = 0; i < n; i++) {
        g.pickups.clear();
        const e = g.enemies.spawn(type, { x: p.x, z: p.z - 5, ex: p.x, ez: p.z - 4.9, stay: true });
        e.die(0, -1, { cause: 'bullet' });
        for (const q of g.pickups.list) got.push([q.kind, q.ammo]);
        g.enemies.clear();
      }
      return got;
    };
    const brute = kill('brute', 400);
    const shotgun = kill('shotgun', 200);
    g.pickups.clear();
    return { brute, shotgun, full: { minigun: PLAYER_WEAPONS.minigun.ammo, shotgun: PLAYER_WEAPONS.shotgun.ammo } };
  });
  const [[, chance]] = FIREPOWER.drops.brute;
  const sd = Math.sqrt(400 * chance * (1 - chance));
  assert.ok(chance < 1, 'not every brute');
  assert.ok(Math.abs(r.brute.length - 400 * chance) < 4 * sd, `${r.brute.length} minigun drops of 400 brutes (${400 * chance} expected)`);
  assert.ok(r.brute.every(([k, a]) => k === 'minigun' && a === Math.ceil(r.full.minigun * FIREPOWER.dropAmmo)), `a dropped minigun has ${Math.ceil(r.full.minigun * FIREPOWER.dropAmmo)} rounds (${r.brute[0]})`);
  const [[, sChance]] = FIREPOWER.drops.shotgun;
  assert.ok(Math.abs(r.shotgun.length - 200 * sChance) < 4 * Math.sqrt(200 * sChance * (1 - sChance)), `${r.shotgun.length} shotgun drops of 200`);
  assert.ok(r.shotgun.every(([k, a]) => k === 'shotgun' && a === Math.ceil(r.full.shotgun * FIREPOWER.dropAmmo)), `a dropped shotgun has ${Math.ceil(r.full.shotgun * FIREPOWER.dropAmmo)} shells`);
});

test('a replay recorded before the change still plays, marked as from another version: the play revision is part of the record’s revision byte (test/replays.test.mjs plays one)', () => {
  assert.ok(PLAY_REV >= 1, 'up one for the pads and the drops (2026-10-23)');
  assert.equal(MAPS_REV, (MAPS.reduce((s, m) => s + m.rev, 0) + Object.values(ROOMS).reduce((s, m) => s + m.rev, 0) + PLAY_REV) % 256, 'the byte holds the maps’ (and the rooms’) revisions and the play revision');
});
