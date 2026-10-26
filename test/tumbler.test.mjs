// New enemy ①: 飛仔 TUMBLER (試玩回饋 ④, DECISIONS 2026-10-23). As nimble as
// the player: he closes in roll after roll (AI.tumble), bullets passing
// through him while he rolls; each landing leaves him open AI.tumble.land s;
// after AI.tumble.rolls rolls he stops to catch his breath AI.tumble.pant s;
// near enough, he kicks. The way through: bullet time to wait for the
// landing, a shotgun or a blast over where he will land, or kick him down
// while he pants and execute him. From wave 5, at most two a wave; a block
// rig in his own colours and a headband, no model file.
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
  ({ page, logs } = await h.open('?seed=59'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A tumbler `d` m north of the player on open floor, nobody else about. */
    window.begin = (d) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      const L = g.level;
      for (const [x, z] of [[0, 8], [-6, 8], [6, 8], [0, 4], [-8, 6], [8, 6]]) {
        if (L.nav.isWalkable(x, z) && L.nav.lineWalkable(x, z, x, z - d) && L.nav.lineWalkable(x - 2, z - d, x + 2, z - d)) {
          p.x = x;
          p.z = z;
          break;
        }
      }
      p.vx = p.vz = 0;
      const e = g.enemies.spawn('tumbler', { x: p.x, z: p.z - d, ex: p.x, ez: p.z - d + 0.1 });
      e.state = 'chase';
      e.spawnLock = 0;
      return e;
    };
    /** One logic step, the player standing, unhurt unless `hurt`. */
    window.step = (hurt = false) => {
      const p = g.player;
      g.killcamT = g.hitstopT = 0;
      if (!hurt) p.hp = 100;
      p.vx = p.vz = 0;
      p.invuln = 0;
      g.aimPoint.set(p.x + 6, g.aimPoint.y, p.z);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /** A player bullet at `e` from 3 m south of him; flown until it is spent; did it hurt him, is it still going past. */
    window.shoot = (e) => {
      const hp = e.hp;
      const b = g.bullets.spawn({ x: e.x, z: e.z + 3, dx: 0, dz: -1, speed: 80, owner: 'player', damage: 1 });
      let past = false;
      for (let i = 0; i < 6 && b.alive; i++) {
        g.updatePlay(1 / 120);
        past = past || (b.alive && b.z < e.z - 0.5);
      }
      return { hurt: hp - e.hp, past };
    };
  });
});
after(async () => {
  await h.close();
});

test('he closes in roll after roll: three, then stops to catch his breath for AI.tumble.pant s; nearer each roll', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const e = window.begin(15);
    const p = g.player;
    const trace = [];
    for (let i = 0; i < 120 * 6; i++) {
      window.step();
      trace.push([e.state, Math.hypot(e.x - p.x, e.z - p.z)]);
    }
    return { trace, notes: g.notes.events.map((x) => x.text) };
  });
  // the runs of each state, in order
  const runs = [];
  for (const [s, d] of r.trace) {
    if (!runs.length || runs.at(-1).s !== s) runs.push({ s, n: 0, d0: d, d1: d });
    runs.at(-1).n++;
    runs.at(-1).d1 = d;
  }
  const seq = runs.map((x) => x.s);
  const pant = seq.indexOf('pant');
  assert.ok(pant > 0, `he pants (${seq.join(' ')})`);
  assert.equal(seq.slice(0, pant).filter((s) => s === 'tumble').length, AI.tumble.rolls, `three rolls before (${seq.slice(0, pant).join(' ')})`);
  for (const x of runs.slice(0, pant).filter((y) => y.s === 'tumble')) assert.ok(x.d1 < x.d0 - 1, `each roll brings him nearer (${x.d0.toFixed(1)} → ${x.d1.toFixed(1)})`);
  for (const x of runs.slice(0, pant).filter((y) => y.s === 'land')) assert.ok(Math.abs(x.n / 120 - AI.tumble.land) < 0.02, `down for ${AI.tumble.land} s after each (${x.n / 120})`);
  assert.ok(Math.abs(runs[pant].n / 120 - AI.tumble.pant) < 0.02, `a ${AI.tumble.pant} s breather (${runs[pant].n / 120})`);
  assert.ok(r.notes.some((t) => t.includes('飛仔喘氣')), r.notes.slice(-10).join(' / '));
});

test('a bullet passes through him while he rolls; on landing and while he pants a shot hurts him', async () => {
  const r = await page.evaluate(() => {
    const e = window.begin(15);
    const until = (s) => {
      let n = 0;
      while (e.state !== s && n++ < 2400) window.step();
      return e.state === s;
    };
    const out = {};
    until('tumble');
    out.roll = window.shoot(e);
    until('land');
    out.land = window.shoot(e);
    until('pant');
    out.pant = window.shoot(e);
    return out;
  });
  assert.deepEqual(r.roll, { hurt: 0, past: true }, 'mid-roll: through him and on');
  assert.ok(r.land.hurt > 0, 'landed: hurt');
  assert.ok(r.pant.hurt > 0, 'panting: hurt');
});

test('near enough, he kicks the player; while he pants a kick puts him down, and F then executes him', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const e = window.begin(6);
    let n = 0;
    const hp0 = 100;
    let kicked = null;
    const seen = new Set();
    while (kicked === null && n++ < 120 * 8) {
      window.step(true);
      seen.add(e.state);
      if (p.hp < hp0) kicked = { lost: hp0 - p.hp, d: Math.hypot(e.x - p.x, e.z - p.z) };
    }
    const notes = g.notes.events.map((x) => x.text).filter((t) => t.includes('飛仔'));
    // a second one, caught panting: a kick, then F
    const f = window.begin(15);
    n = 0;
    while (f.state !== 'pant' && n++ < 2400) window.step();
    // the player 0.9 m west of him (PLAYER.execRange is 1.2), facing east as window.step aims
    const press = () => {
      p.x = f.x - 0.9;
      p.z = f.z;
      g.input.pressed.add('KeyF');
      window.step();
    };
    press();
    const down = f.stunT > 0;
    for (let i = 0; i < 12; i++) window.step();
    press(); // the kick sent him off: after him, and F
    for (let i = 0; i < 240 && f.alive; i++) window.step();
    return { kicked, seen: [...seen], notes, down, executed: !f.alive };
  });
  assert.ok(r.kicked, `he kicked (${r.seen})`);
  assert.equal(r.kicked.lost, AI.tumble.kick, `for ${AI.tumble.kick}`);
  assert.ok(r.seen.includes('windup'), 'after a wind-up');
  assert.ok(r.notes.some((t) => t.includes('飛仔')), r.notes.join(' / '));
  assert.ok(r.down, 'panting, a kick puts him down');
  assert.ok(r.executed, 'and F executes him');
});

test('from wave 5, at most two a wave; never before', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.setMode('arcade');
    const per = {};
    for (let seed = 1; seed <= 40; seed++) {
      const rng = new g.rng.constructor(seed);
      for (let n = 1; n <= 11; n++) {
        const c = g.waves.compose(n, rng).filter((t) => t === 'tumbler').length;
        per[n] = Math.max(per[n] || 0, c);
      }
    }
    return per;
  });
  for (let n = 1; n <= 4; n++) assert.equal(r[n], 0, `none in wave ${n}`);
  for (let n = 5; n <= 11; n++) assert.ok(r[n] <= 2, `wave ${n}: ${r[n]}`);
  assert.ok([5, 6, 7, 8, 9, 10, 11].some((n) => r[n] > 0), 'and he does come');
});

test('screenshot: mid-roll, and catching his breath', async () => {
  for (const [state, file] of [
    ['tumble', 'tumbler-roll.png'],
    ['pant', 'tumbler-pant.png'],
  ]) {
    await page.evaluate((state) => {
      const g = window.game;
      const e = window.begin(15);
      let n = 0;
      while ((e.state !== state || e.timer > 0.2) && n++ < 2400) window.step();
      g.updateCamera(1, true);
      g.render();
    }, state);
    await page.screenshot({ path: new URL(file, OUT).pathname });
  }
  assert.deepEqual(problems(logs), []);
});
