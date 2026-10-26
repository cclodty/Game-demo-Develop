// 彈幕 ② A③: fast and slow together. The slow walls: the pattern men of 彈幕試驗 ③ (rings, spirals, fans, 6–8 m/s in
// the solid pink look) come back as elites, one in a room's first wave from wave 3, to push the player about; the
// pressers: the heavy three of ⑦ keep their patterns (the stream, the squad's row, the blast) with fast rounds in the
// arcade's look, among the arcade's men from wave 2 (waves.js MODES.danmaku roster `also`, `elite`). The fast rounds
// come between the slow walls; both looks tell apart on one screen; the gap guarantee (A②) counts the walls' rounds
// as lines of fire and holds the pressers like any gun, never the walls (their gaps are their own).
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

test('the roster: an elite (a slow wall) in a room’s first wave from wave 3, one a room, none before; the heavy three among the arcade’s men from wave 2; the same seed, the same roster', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const waves = Array.from({ length: 6 }, (_, i) => g.waves.compose(i + 1));
    window.toRoom();
    const again = Array.from({ length: 6 }, (_, i) => g.waves.compose(i + 1));
    return { waves, again, perStage: g.waves.rules.perStage };
  });
  const walls = ['ringer', 'spiraler', 'fanner'];
  const heavy = ['hoser', 'volleyer', 'blaster'];
  const elites = r.waves.map((w) => w.filter((t) => walls.includes(t)).length);
  assert.deepEqual(elites, [0, 0, 0, 0, 0, 0], `none on the first floor (the elites come from the second: test/floors.test.mjs): ${elites}`);
  assert.ok(heavy.some((t) => r.waves.slice(1).flat().includes(t)), `pressers from wave 2: ${r.waves.map((w) => w.join(' ')).join(' / ')}`);
  assert.ok(!heavy.some((t) => r.waves[0].includes(t)), 'none in wave 1');
  assert.ok(r.waves.flat().includes('grunt'), 'the arcade’s men still');
  assert.deepEqual(r.again, r.waves, 'the same seed, the same roster');
});

test('a wall’s rounds are slow and solid pink, a presser’s fast and in the arcade’s look; the gap guarantee counts a wall’s rounds as lines of fire', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(-3, 2.5);
    const ringer = window.put('ringer', -9, -5.5);
    const hoser = window.put('hoser', -3, -6.5);
    const shots = window.watch([ringer, hoser], 120 * 4);
    const by = (k) => shots.filter((s) => s.who === k);
    const p = g.player;
    // the ring's rounds about the player are lines of fire for the gate (fireLines counts every enemy round)
    const ringAbout = g.bullets.list.filter((b) => b.owner === 'enemy' && b.look === 'danmaku' && Math.hypot(b.x - p.x, b.z - p.z) < 6).length;
    const lines = window.fireLines(g.bullets.list, p.x, p.z, 6).length;
    // a blaster on his own (beside a ring's wall his fan would close every spot, and the gate holds him: the next test)
    window.toRoom(-3, 2.5);
    const blaster = window.put('blaster', 2, 0, 0.6);
    const blast = window.watch([blaster], 120 * 4).map((s) => ({ ...s, who: 2 }));
    return { ring: by(0), hose: by(1), blast, ringAbout, lines };
  });
  assert.ok(r.ring.length > 20 && r.ring.every((s) => s.speed <= 8 && s.look === 'danmaku'), `the ring: ${r.ring.length} slow pink rounds`);
  assert.ok(r.hose.length > 20 && r.hose.every((s) => s.speed >= 17 && s.look === 'enemy'), `the stream: ${r.hose.length} fast rounds in the arcade's look`);
  assert.ok(r.blast.length > 10 && r.blast.every((s) => s.speed >= 15 && s.look === 'enemy'), `the blast: ${r.blast.length} fast pellets`);
  assert.ok(r.ringAbout > 0 && r.lines >= r.ringAbout, `the ring's ${r.ringAbout} rounds about the player are among the ${r.lines} lines of fire`);
});

test('six blasters round the player are held for the gap like any gun; six ringers round him are not (their rings have gaps of their own)', { timeout: 10 * 60 * 1000 }, async () => {
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
    const blasters = waits(ring('blaster'), 120 * 8);
    const ringers = waits(ring('ringer'), 120 * 8);
    return { blasters, ringers };
  });
  assert.ok(r.blasters > 0, `blasters held for the gap (${r.blasters} man-steps)`);
  assert.equal(r.ringers, 0, 'ringers never');
});

test('screenshot: a ring’s slow wall and the thugs’ fast rounds in the teahouse, the player in bullet time', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom(-3, 2.5);
    window.put('ringer', -3, -5.5);
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
