// New enemy ②: 帶頭大佬 CAPTAIN (試玩回饋 ④, DECISIONS 2026-10-23). He leads:
// while he stands the rest are bolder (they go round to the player's flanks
// rather than hide: AI.captain); when he falls they waver for AI.captain.panic
// s (slower to aim, falling back). He comes from wave 7, one at most, with
// two thugs at his side, dual pistols in his hands. The way through: pick
// him out and get round his guards to him, or leave him till last and skip
// the change of heart.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { AI } from '../src/config.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=61'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A run on the rooftop, nobody about, the player at (0, 8). */
    window.begin = () => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      p.x = 0;
      p.z = 8;
      p.vx = p.vz = 0;
    };
    /** One of `type` come in at (x, z), into the fight at once. */
    window.put = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1 });
      e.state = e.rushes ? 'chase' : 'move';
      e.spawnLock = 0;
      return e;
    };
    /** One logic step, the player standing, unhurt, not firing. */
    window.step = () => {
      const p = g.player;
      g.killcamT = g.hitstopT = 0;
      p.hp = 100;
      p.invuln = 0;
      p.vx = p.vz = 0;
      g.aimPoint.set(p.x + 6, g.aimPoint.y, p.z);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
  });
});
after(async () => {
  await h.close();
});

test('with him there the others are bolder: more of them go round to the player’s flanks, fewer hide', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const run = (lead, at) => {
      window.begin();
      const men = [-3, -1, 1, 3].map((x) => window.put('grunt', at + x, -6));
      for (const e of men) e.fireCd = 99; // they move; nobody shoots
      if (lead) {
        const c = window.put('captain', at, -8);
        c.fireCd = 99;
        for (const e of g.enemies.list) if (e.escortOf) e.fireCd = 99;
      }
      const ref = Math.atan2(at - p.x, -7 - p.z); // the way they came from
      let flank = 0;
      let hid = 0;
      let n = 0;
      for (let i = 0; i < 120 * 8; i++) {
        window.step();
        if (i % 60 || i < 120 * 2) continue;
        for (const e of men) {
          if (!e.alive) continue;
          const a = Math.abs(((Math.atan2(e.x - p.x, e.z - p.z) - ref + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
          if (a > (50 * Math.PI) / 180) flank++;
          if (e.state === 'duck') hid++;
          n++;
        }
      }
      return { flank, hid, n, notes: g.notes.events.map((x) => x.text).filter((t) => t.includes('帶頭大佬')) };
    };
    // three ways in, north-west, north and north-east of the player
    const sum = (lead) => {
      const rs = [-6, 0, 6].map((at) => run(lead, at));
      const n = rs.reduce((a, x) => a + x.n, 0);
      return { flank: rs.reduce((a, x) => a + x.flank, 0) / n, hid: rs.reduce((a, x) => a + x.hid, 0) / n, notes: rs.flatMap((x) => x.notes), each: rs.map((x) => (x.flank / x.n).toFixed(2)) };
    };
    return { lead: sum(true), alone: sum(false) };
  });
  assert.ok(r.lead.flank >= r.alone.flank + 0.25, `round to the flanks: ${(100 * r.lead.flank).toFixed(0)}% of the time with him, ${(100 * r.alone.flank).toFixed(0)}% without`);
  assert.ok(r.lead.hid < r.alone.hid, `hiding: ${(100 * r.lead.hid).toFixed(0)}% with him, ${(100 * r.alone.hid).toFixed(0)}% without`);
  assert.ok(r.lead.notes.length > 0, 'the notes say he is in');
});

test('when he falls the rest waver for AI.captain.panic s: slower to aim, and back from the player; another man falling does not do it', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const run = (killCaptain) => {
      window.begin();
      const men = [-4, -1.5, 1.5, 4].map((x) => window.put('grunt', x, 0));
      for (const e of men) e.fireCd = 99;
      const c = window.put('captain', 0, -3);
      c.fireCd = 99;
      for (let i = 0; i < 120; i++) window.step();
      const watch = men.slice(1);
      const aim0 = watch.map((e) => e.aimTime);
      const d0 = watch.reduce((a, e) => a + Math.hypot(e.x - p.x, e.z - p.z), 0) / watch.length;
      (killCaptain ? c : men[0]).die(0, -1, { cause: 'bullet' });
      const aim1 = watch.map((e) => e.aimTime);
      for (let i = 0; i < 120 * 3; i++) window.step();
      const d1 = watch.reduce((a, e) => a + Math.hypot(e.x - p.x, e.z - p.z), 0) / watch.length;
      for (let i = 0; i < 120 * 3; i++) window.step();
      const aim2 = watch.map((e) => e.aimTime);
      return { aim0, aim1, aim2, back: d1 - d0, notes: g.notes.events.map((x) => x.text).filter((t) => t.includes('帶頭大佬')) };
    };
    return { fell: run(true), other: run(false) };
  });
  r.fell.aim1.forEach((a, i) => assert.ok(a > r.fell.aim0[i] * 1.2, `slower to aim: ${r.fell.aim0[i].toFixed(2)} → ${a.toFixed(2)} s`));
  r.fell.aim2.forEach((a, i) => assert.ok(Math.abs(a - r.fell.aim0[i]) < 1e-9, `and steady again after (${a})`));
  assert.ok(r.fell.back >= r.other.back + 1, `back from the player: ${r.fell.back.toFixed(1)} m in 3 s (${r.other.back.toFixed(1)} m when another man falls)`);
  r.other.aim1.forEach((a, i) => assert.equal(a, r.other.aim0[i], 'another man falling: no change'));
  assert.ok(r.fell.notes.some((t) => t.includes('倒下')), r.fell.notes.join(' / '));
  assert.ok(AI.captain.panic >= 3);
});

test('he comes in with two thugs who keep at his side; from wave 7, one at most, never before', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const c = window.put('captain', 0, -8);
    c.fireCd = 99;
    const guards = g.enemies.list.filter((e) => e.escortOf === c);
    for (const e of guards) e.fireCd = 99;
    let far = 0;
    for (let i = 0; i < 120 * 6; i++) {
      window.step();
      if (i > 240) for (const e of guards) far = Math.max(far, Math.hypot(e.x - c.x, e.z - c.z));
    }
    const per = {};
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new g.rng.constructor(seed);
      for (let n = 1; n <= 11; n++) per[n] = Math.max(per[n] || 0, g.waves.compose(n, rng).filter((t) => t === 'captain').length);
    }
    return { guards: guards.map((e) => e.type), far, per, weapon: c.cfg.weapon, hp: c.hpMax };
  });
  assert.deepEqual(r.guards, ['grunt', 'grunt'], 'two thugs with him');
  assert.ok(r.far < 5, `and at his side (${r.far.toFixed(1)} m at most)`);
  for (let n = 1; n <= 6; n++) assert.equal(r.per[n], 0, `none in wave ${n}`);
  for (let n = 7; n <= 11; n++) assert.ok(r.per[n] <= 1, `wave ${n}: ${r.per[n]}`);
  assert.ok([7, 8, 9, 10, 11].some((n) => r.per[n] === 1), 'and he does come');
  assert.equal(r.weapon, 'dual');
});

test('screenshot: the captain and his two guards', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const c = window.put('captain', 0, 3);
    c.fireCd = 99;
    for (const e of g.enemies.list) e.fireCd = 99;
    for (let i = 0; i < 60; i++) window.step();
    g.updateCamera(1, true);
    g.render();
  });
  await page.screenshot({ path: new URL('captain.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
