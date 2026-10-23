// The run gets harder as it goes (試玩回饋 ④, DECISIONS 2026-10-23): each
// stage the enemies aim and come again faster (config.js RAMP.perStage, on
// top of the difficulty's aim, rules.js), and more of them may stand at once
// while a wave trickles in (RAMP.maxAlive). 正常 aims faster than it did, 芭蕾
// faster still; 街頭 is as it was, for whoever wants it easy.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMP } from '../src/config.js';
import { DIFFICULTIES, rulesFor } from '../src/rules.js';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=47'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A run under `difficulty`, nobody about; the waves at `n` as if played to there. */
    window.at = (difficulty, n, mode = 'arcade') => {
      g.setRules(difficulty, []);
      g.setMode(mode);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.waves.wave = n;
    };
    /** A thug 7 m north of the player, facing him; his aim and, from his first shot, the gap he waits (every draw at its top). */
    window.thug = () => {
      const p = g.player;
      const e = g.enemies.spawn('grunt', { x: p.x, z: p.z - 7, ex: p.x, ez: p.z - 6.9, stay: true });
      const aim = e.aimTime;
      const range = g.rng.range.bind(g.rng);
      g.rng.range = (a, b) => b; // the cooldown drawn at its longest, so it is the type's top × the stage's pace
      let gap = null;
      for (let i = 0; i < 1200 && gap === null; i++) {
        const was = e.state;
        g.player.hp = 100;
        g.player.vx = g.player.vz = 0;
        g.updatePlay(1 / 120);
        if (was === 'fire' && e.state !== 'fire') gap = e.fireCd;
      }
      g.rng.range = range;
      g.enemies.clear();
      g.bullets.clear();
      return { aim, gap, base: e.cfg.aimTime, top: e.cfg.cooldown[1] };
    };
  });
});
after(async () => {
  await page.evaluate(() => window.game.setRules('normal', []));
  await h.close();
});

test('the difficulties: 正常 aims at ×0.85, 芭蕾 at ×0.6, 街頭 as it was (×1.4)', () => {
  assert.deepEqual(
    ['street', 'normal', 'ballet'].map((d) => rulesFor(d).aimMul),
    [1.4, 0.85, 0.6],
  );
  assert.match(DIFFICULTIES.normal.desc, /0\.85/);
  assert.match(DIFFICULTIES.ballet.desc, /0\.6/);
});

test('each stage, at each difficulty, a thug aims and comes again faster by RAMP.perStage: waves 1, 5 and 9', async () => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const d of ['street', 'normal', 'ballet']) {
      out[d] = [1, 5, 9].map((n) => {
        window.at(d, n);
        return window.thug();
      });
    }
    return out;
  });
  for (const d of ['street', 'normal', 'ballet']) {
    const mul = rulesFor(d).aimMul;
    r[d].forEach((t, stage) => {
      const pace = (1 - RAMP.perStage) ** stage;
      assert.ok(Math.abs(t.aim - t.base * mul * pace) < 1e-9, `${d}, stage ${stage + 1}: aim ${t.aim} (${t.base} × ${mul} × ${pace})`);
      assert.ok(t.gap !== null, `${d}, stage ${stage + 1}: he fired`);
      assert.ok(Math.abs(t.gap - t.top * pace) < 1e-6, `${d}, stage ${stage + 1}: the gap after a shot ${t.gap} (${t.top} × ${pace})`);
    });
    assert.ok(r[d][2].aim < r[d][1].aim && r[d][1].aim < r[d][0].aim, `${d}: faster each stage`);
  }
});

test('as many as RAMP.maxAlive stand at once while a wave trickles in (endless), not more', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const caps = [];
    for (const n of [9, 11, 12, 14, 20]) {
      window.at('normal', n - 1, 'endless');
      g.waves.startWave();
      caps.push(g.waves.maxAlive);
    }
    // wave 20 of an endless run, played for 40 s with the player standing and unhurt: the most standing at once
    let most = 0;
    for (let i = 0; i < 120 * 40; i++) {
      g.player.hp = 100;
      g.player.vx = g.player.vz = 0;
      g.updatePlay(1 / 120);
      most = Math.max(most, g.enemies.aliveCount);
    }
    g.waves.state = 'done';
    g.enemies.clear();
    return { caps, most };
  });
  assert.equal(RAMP.maxAlive, 11);
  assert.deepEqual(r.caps, [9, 10, 11, 11, 11], 'the cap rises with the wave to 11');
  assert.ok(r.most > 9 && r.most <= 11, `${r.most} standing at once`);
  assert.deepEqual(problems(logs), []);
});
