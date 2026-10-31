// F⑧a: three of REDESIGN §5's missing behaviours, a problem each. 帶頭大佬 (the captain): as he takes aim his guards
// take theirs, and a guard's aim done waits for his shot, so the squad fires on the one beat (AI.captain.wait); with him
// held or down they fire as they please. 飛仔 (the tumbler): a player's round on its way into him and he rolls across
// its line, out of it, a roll like his others (AI.tumble.dodge); the way through: rounds from two sides (a spin), or
// his landing. (The third, 環形手 the ring man held up letting his ring go round the player, went with him: 試玩回饋 ⑦.)
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { AI } from '../src/config.js';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=83'));
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
      g.bullets.clear();
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

test('整隊齊射: a captain’s guards fire on the step he does (a step apart at most), their aims held for his shot; with him held or down they fire on their own', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    /** `s` s of a captain and his two guards 9 m off, the times each opens fire. */
    const run = (s, what = null) => {
      window.begin();
      const c = window.put('captain', 0, -1);
      const guards = g.enemies.list.filter((e) => e.escortOf === c);
      for (const e of guards) e.spawnLock = 0;
      const fires = new Map(g.enemies.list.map((e) => [e, []]));
      const held = [];
      if (what === 'held') {
        c.x = g.player.x;
        c.z = g.player.z - 1;
        g.player.grab(c);
      }
      if (what === 'down') c.die(0, -1, {});
      const was = new Map();
      for (let i = 0; i < 120 * s; i++) {
        window.step();
        if (what === 'held') g.player.hostageT = 9; // kept held
        for (const e of g.enemies.list) {
          if (e.state === 'fire' && was.get(e) !== 'fire') fires.get(e).push(i);
          if (e.escortOf === c && e.readyAt >= 0 && e.state === 'aim') held.push(i);
          was.set(e, e.state);
        }
      }
      return { captain: c.alive ? fires.get(c) : [], guards: guards.map((e) => fires.get(e)), held: held.length };
    };
    return { squad: run(8), held: run(4, 'held'), down: run(10, 'down') };
  });
  const { squad } = r;
  assert.ok(squad.captain.length >= 2, `the captain fires: ${squad.captain}`);
  const all = squad.guards.flat();
  assert.ok(all.length >= 2, `his guards fire: ${JSON.stringify(squad.guards)}`);
  const near = (i) => squad.captain.some((c) => Math.abs(c - i) <= 1);
  const onBeat = all.filter(near).length;
  assert.ok(onBeat / all.length >= 0.75, `most of their shots on his step: ${onBeat} of ${all.length} (${JSON.stringify(squad)})`);
  assert.ok(squad.held > 0, 'a guard held his aim for the captain');
  // held up as a shield (B②): his men hold their fire; down: they fire as they please, off any beat
  assert.equal(r.held.guards.flat().length, 0, `held: his guards hold their fire (${JSON.stringify(r.held.guards)})`);
  assert.ok(r.down.guards.flat().length >= 1, `down: they fire on their own (${JSON.stringify(r.down.guards)})`);
  assert.deepEqual(problems(logs), []);
});

test('飛仔翻滾躲子彈: a round on its way into him from 4 m and he rolls across its line, out of it, unhurt; not again within AI.tumble.dodge.cooldown s, so a second as he lands finds him', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const e = window.put('tumbler', 0, -2);
    e.state = 'chase';
    e.fireCd = 99;
    const shoot = (dx) => g.bullets.spawn({ x: e.x + dx * 4, z: e.z, dx: -Math.sign(dx), dz: 0, speed: 40, owner: 'player', damage: 1 });
    const hp0 = e.hp;
    const x0 = e.x;
    const z0 = e.z;
    shoot(1);
    window.step();
    const rolled = { state: e.state, rolls: e.rolls, across: Math.abs(e.rollZ), along: Math.abs(e.rollX) };
    for (let i = 0; i < 40; i++) window.step();
    const moved = Math.hypot(e.x - x0, e.z - z0);
    const after = { hp: e.hp, moved };
    // again within the cooldown: no roll for it; once it is over, a roll
    g.bullets.clear();
    e.state = 'chase';
    e.dodgeCd = 0.5;
    shoot(1);
    const second = { within: e.tumbleDodge(), state: e.state };
    e.dodgeCd = 0;
    second.after = e.tumbleDodge();
    // a fresh one: a round, he rolls; a second as he lands from it (the cooldown not over) finds him
    window.begin();
    const f = window.put('tumbler', 0, -2);
    f.state = 'chase';
    f.fireCd = 99;
    const hp2 = f.hp;
    g.bullets.spawn({ x: f.x + 4, z: f.z, dx: -1, dz: 0, speed: 40, owner: 'player', damage: 1 });
    for (let i = 0; i < 120 && f.state !== 'land'; i++) window.step();
    const landing = f.state;
    g.bullets.spawn({ x: f.x + 3, z: f.z, dx: -1, dz: 0, speed: 40, owner: 'player', damage: 1 });
    for (let i = 0; i < 20; i++) window.step();
    return { rolled, after, hp0, second, landing, followUp: hp2 - f.hp };
  });
  assert.equal(r.rolled.state, 'tumble', 'he rolls');
  assert.ok(r.rolled.across > 0.9 && r.rolled.along < 0.2, `across the round’s line: ${JSON.stringify(r.rolled)}`);
  assert.equal(r.after.hp, r.hp0, 'unhurt');
  assert.ok(r.after.moved >= AI.tumble.dodge.dist * 0.8, `out of its line: ${r.after.moved.toFixed(2)} m`);
  assert.deepEqual(r.second, { within: false, state: 'chase', after: true }, 'none within the cooldown, one after it');
  assert.equal(r.landing, 'land', 'down from the roll');
  assert.ok(r.followUp > 0, 'a second round as he lands finds him');
  assert.deepEqual(problems(logs), []);
});
