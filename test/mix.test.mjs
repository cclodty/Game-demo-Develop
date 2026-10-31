// 彈幕 ② A③: the pressers, the heavy three of ⑦, keep their patterns (the stream, the squad's row, the blast) with fast
// rounds in the arcade's look; the gap guarantee (A②) counts their rounds as lines of fire and holds them like any gun.
// Since F⑧b only the machine gunner of the three comes, from the second floor (waves.js MODES.danmaku roster `also`);
// since 試玩回饋 ⑦ the slow walls that came between them (the pattern men, solid pink, 6–8 m/s) are gone, and a room's
// elite is one of three of the twelve with a problem of their own (the riot shield, the sniper, the grenadier).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=61'));
  await page.evaluate(async () => {
    const g = window.game;
    const { fireLines } = await import('./src/gaps.js');
    window.fireLines = fireLines;
    g.frame = () => {};
    window.toRoom = (x = 0, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.player.x = x;
      g.player.z = z;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    window.put = (type, x, z, wait = 0) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = wait;
      return e;
    };
    /** `steps` steps with `men` about: every round each fired ({ who, speed, look }). */
    window.watch = (men, steps) => {
      const shots = [];
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      g.bullets.spawn = (o) => {
        const who = men.indexOf(o.source);
        if (who >= 0) shots.push({ who, speed: o.speed, look: o.look || 'enemy' });
        return spawn0(o);
      };
      for (let i = 0; i < steps; i++) window.step();
      g.bullets.spawn = spawn0;
      return shots;
    };
  });
});
after(async () => {
  await h.close();
});

test('the roster: no elite on the first floor, from the second one in a room’s first wave, a riot shield, a sniper or a grenadier (試玩回饋 ⑦); the presser (the machine gunner) from the second floor, the volley man and the blaster drawn no more (F⑧b: the captain’s squad and the shotgunner have their problems); the same seed, the same roster', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const waves = Array.from({ length: g.waves.totalWaves }, (_, i) => g.waves.compose(i + 1));
    window.toRoom();
    const again = Array.from({ length: g.waves.totalWaves }, (_, i) => g.waves.compose(i + 1));
    const hosers = [];
    const keep = g.fixedSeed;
    for (let seed = 1; seed <= 8; seed++) {
      g.fixedSeed = seed;
      window.toRoom();
      for (let n = 1; n <= g.waves.totalWaves; n++) if (g.waves.compose(n).includes('hoser')) hosers.push(n);
    }
    g.fixedSeed = keep;
    return { waves, again, hosers, firstFloor: g.floors[0].length * g.waves.rules.perStage };
  });
  const per = 2; // waves a room
  const firstWaves = r.waves.filter((_, i) => i % per === 0); // each room's first wave
  const lastOf = firstWaves.map((w) => w[w.length - 1]);
  const elite = ['shield', 'sniper', 'grenadier'];
  const onFirst = lastOf.slice(0, r.firstFloor / per);
  assert.ok(onFirst.filter((t) => elite.includes(t)).length < onFirst.length, `not every first-floor room ends its first wave on an elite: ${onFirst}`);
  assert.ok(lastOf.slice(r.firstFloor / per).every((t) => elite.includes(t)), `from the second floor every room’s first wave ends on one: ${lastOf.slice(r.firstFloor / per)}`);
  assert.ok(!r.waves.flat().some((t) => ['ringer', 'spiraler', 'fanner'].includes(t)), 'no pattern man (試玩回饋 ⑦)');
  assert.ok(r.hosers.length > 0 && Math.min(...r.hosers) > r.firstFloor, `the machine gunner from the second floor: waves ${r.hosers}`);
  assert.ok(!r.waves.flat().some((t) => t === 'volleyer' || t === 'blaster'), 'the volley man and the blaster drawn no more');
  assert.ok(r.waves.flat().includes('grunt'), 'the arcade’s men still');
  assert.deepEqual(r.again, r.waves, 'the same seed, the same roster');
});

test('a presser’s rounds are fast and in the arcade’s look; the gap guarantee counts them as lines of fire', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(-3, 2.5);
    const hoser = window.put('hoser', -3, -6.5);
    const hose = window.watch([hoser], 120 * 4);
    const p = g.player;
    // the stream's rounds about the player are lines of fire for the gate (fireLines counts every enemy round)
    const about = g.bullets.list.filter((b) => b.owner === 'enemy' && Math.hypot(b.x - p.x, b.z - p.z) < 6).length;
    const lines = window.fireLines(g.bullets.list, p.x, p.z, 6).length;
    // a blaster on his own
    window.toRoom(-3, 2.5);
    const blaster = window.put('blaster', 2, 0, 0.6);
    const blast = window.watch([blaster], 120 * 4);
    return { hose, blast, about, lines };
  });
  assert.ok(r.hose.length > 20 && r.hose.every((s) => s.speed >= 17 && s.look === 'enemy'), `the stream: ${r.hose.length} fast rounds in the arcade's look`);
  assert.ok(r.blast.length > 10 && r.blast.every((s) => s.speed >= 15 && s.look === 'enemy'), `the blast: ${r.blast.length} fast pellets`);
  assert.ok(r.lines >= r.about, `the ${r.about} rounds about the player are among the ${r.lines} lines of fire`);
});

test('six blasters round the player are held for the gap like any gun', { timeout: 10 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const ring = (type) => {
      window.toRoom(0, 0);
      return Array.from({ length: 6 }, (_, i) => window.put(type, Math.sin((i / 6) * Math.PI * 2) * 5, Math.cos((i / 6) * Math.PI * 2) * 5, 0));
    };
    const waits = (men, steps) => {
      let n = 0;
      for (let i = 0; i < steps; i++) {
        window.step();
        for (const e of men) if (e.alive && e.gapWait) n++;
      }
      return n;
    };
    return { blasters: waits(ring('blaster'), 120 * 8) };
  });
  assert.ok(r.blasters > 0, `blasters held for the gap (${r.blasters} man-steps)`);
});

test('screenshot: the machine gunner’s stream and the thugs’ fast rounds in the teahouse, the player in bullet time', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom(-3, 2.5);
    window.put('hoser', -3, -5.5);
    window.put('rifle', -9, -5.5, 0.9);
    window.put('rifle', 6, -5.5, 1.1);
    window.put('grunt', 9, -1, 1.0);
    const hurt0 = g.player.hurt;
    g.player.hurt = () => false;
    for (let i = 0; i < 120 * 3.2; i++) window.step();
    g.player.hurt = hurt0;
    g.hurtFx = 0;
    g.setFocus(true);
    g.focusAmt = 1;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('hell-mixed.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
