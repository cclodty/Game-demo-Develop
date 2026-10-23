// Thicker enemies (試玩回饋 ④, DECISIONS 2026-10-23): every enemy comes in
// with ENEMY_HP.base times the health he had, and each stage of a run adds
// ENEMY_HP.perStage more (config.js), so a gun takes more shots; but what is
// not a bullet (a kick, a throw, a pan, a door, a barrel, a gunman's stray
// shot, his mate's rounds into the human shield) is made as much stronger,
// and an execution, a fall, the water still take him at once: the number it
// takes is what it was. A hit that does not kill shows: he rocks back and
// flashes white (KEY_POSES.flinch).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_HP, ENV, PAN, UMBRELLA } from '../src/config.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
let TYPES; // the enemy types' health as enemies.js has it: what each had before ENEMY_HP
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=43'));
  TYPES = await page.evaluate(async () => Object.fromEntries(Object.entries((await import('./src/enemies.js')).TYPES).map(([k, t]) => [k, { hp: t.hp }])));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    g.setRules('normal', []);
    g.setMode('arcade');
    g.startRun(0);
    g.waves.state = 'done';
    g.enemies.clear();
    /** A `type` come in at wave `n`, 6 m in front of the player, standing (no AI step runs). */
    window.man = (type, n) => {
      g.waves.wave = n;
      const p = g.player;
      return g.enemies.spawn(type, { x: p.x, z: p.z - 6, ex: p.x, ez: p.z - 5.9, stay: true });
    };
    /** How many times `hurt(e)` it takes to kill him (at most 200). */
    window.takes = (e, hurt) => {
      let n = 0;
      while (e.alive && n < 200) {
        hurt(e);
        n++;
      }
      g.enemies.clear();
      return n;
    };
  });
});
after(async () => {
  await h.close();
});

const stageOf = (n) => Math.floor((n - 1) / 4);
const hpAt = (type, n) => Math.round(TYPES[type].hp * ENEMY_HP.base * (1 + ENEMY_HP.perStage * stageOf(n)));

test('a thug comes in at waves 1, 5 and 9 with the health config.js gives (stage 1, 2, 3); every type at wave 1 has ENEMY_HP.base times his old', async () => {
  const types = Object.keys(TYPES);
  const r = await page.evaluate((types) => {
    const out = { grunt: [1, 5, 9].map((n) => window.man('grunt', n).hp), all: {} };
    window.game.enemies.clear();
    for (const t of types) {
      out.all[t] = window.man(t, 1).hp;
      window.game.enemies.clear();
    }
    return out;
  }, types);
  assert.deepEqual(r.grunt, [1, 5, 9].map((n) => hpAt('grunt', n)));
  assert.ok(r.grunt[0] > TYPES.grunt.hp && r.grunt[1] > r.grunt[0] && r.grunt[2] > r.grunt[1], `more each stage (${r.grunt})`);
  for (const t of types) assert.equal(r.all[t], hpAt(t, 1), `${t}`);
});

test('what is not a bullet takes as many to kill as it did, at every stage: kicks, a thrown pan, a pan’s smash, a door slammed into him, a barrel’s blast, a gunman’s stray round, a round the pan batted back, his mate’s rounds into the human shield', async () => {
  const r = await page.evaluate(
    ([pan, slam, dart, bat]) => {
      const ways = {
        kick: (e) => e.kick(0, -1, 14),
        throw: (e) => e.kick(0, -1, 8, 'throw', 2),
        dart: (e) => e.kick(0, -1, 8, 'throw', dart),
        smash: (e) => e.kick(0, -1, 10, 'smash', pan),
        slam: (e) => e.kick(0, -1, 10, 'slam', slam),
        blast: (e) => e.blast(0, -1, 20),
        blastEdge: (e) => e.blast(0, -1, 5),
        stray: (e) => e.hit({ owner: 'enemy', dx: 0, dz: -1, x: e.x, z: e.z + 1, damage: 1 }),
        batted: (e) => e.hit({ owner: 'player', homeRun: true, dx: 0, dz: -1, x: e.x, z: e.z + 1, damage: bat }),
        shield: (e) => e.shieldHit({ dx: 0, dz: -1 }),
      };
      const out = {};
      for (const type of ['grunt', 'shotgun', 'brute']) {
        for (const [way, hurt] of Object.entries(ways)) out[`${type} ${way}`] = [1, 5, 9].map((n) => window.takes(window.man(type, n), hurt));
      }
      // a gun: more shots than before, more each stage
      out['grunt pistol'] = [1, 5, 9].map((n) => window.takes(window.man('grunt', n), (e) => e.hit({ owner: 'player', dx: 0, dz: -1, x: e.x, z: e.z + 1, damage: 1 })));
      return out;
    },
    [PAN.damage, ENV.doorSlam, UMBRELLA.dartDamage, PAN.batDamage],
  );
  const old = { kick: 1, throw: 2, dart: UMBRELLA.dartDamage, smash: PAN.damage, slam: ENV.doorSlam, blast: 20, blastEdge: 5, stray: 3, batted: PAN.batDamage, shield: 1 };
  for (const type of ['grunt', 'shotgun', 'brute']) {
    for (const [way, dmg] of Object.entries(old)) {
      const was = Math.ceil(TYPES[type].hp / dmg);
      assert.deepEqual(r[`${type} ${way}`], [was, was, was], `${type}, ${way}: ${was} as before`);
    }
  }
  assert.deepEqual(r['grunt pistol'], [1, 5, 9].map((n) => hpAt('grunt', n)), 'a pistol: a shot for each point');
});

test('a hit that does not kill shows: he rocks back from it and flashes white', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const e = window.man('grunt', 1);
    e.state = 'move';
    const still = e.rig.inner.rotation.x;
    e.hit({ owner: 'player', dx: 0, dz: 1, x: e.x, z: e.z - 1, damage: 1 }); // from in front of him (he faces the player)
    const flash = e.flash;
    let lean = 0;
    for (let i = 0; i < 12; i++) {
      g.updatePlay(1 / 120);
      lean = Math.min(lean, e.rig.inner.rotation.x);
    }
    g.updateCamera(1, true);
    g.render();
    return { still, lean, flash, alive: e.alive, flinch: e.flinchT };
  });
  await page.screenshot({ path: new URL('enemy-flinch.png', OUT).pathname });
  assert.ok(r.alive);
  assert.equal(r.flash, 1, 'white');
  assert.ok(r.lean < r.still - 0.2, `rocked back (${r.still} → ${r.lean})`);
  assert.deepEqual(problems(logs), []);
});
