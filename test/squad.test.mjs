// F⑧a: three of REDESIGN §5's missing behaviours, a problem each. 帶頭大佬 (the captain): as he takes aim his guards
// take theirs, and a guard's aim done waits for his shot, so the squad fires on the one beat (AI.captain.wait); with him
// held or down they fire as they please. 飛仔 (the tumbler): a player's round on its way into him and he rolls across
// its line, out of it, a roll like his others (AI.tumble.dodge); the way through: rounds from two sides (a spin), or
// his landing. 環形手 (the ring man) held up as a human shield: his ring goes out round the player, the rounds the
// player's own, a kill SHIELD RING (PLAYER.humanShield.ringEvery). Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { AI, PLAYER } from '../src/config.js';
import { TRICKS } from '../src/codex.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

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

test('the ring man held up as a human shield: his ring goes round the player every PLAYER.humanShield.ringEvery s, the player’s own rounds; a man it kills is SHIELD RING, a trick in the book; screenshot', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const p = g.player;
    const ring = window.put('ringer', 0, 7);
    ring.fireCd = 99;
    const man = window.put('grunt', 0, 2);
    man.fireCd = 99;
    man.hp = 1;
    p.facing = Math.PI; // north, at the man
    const kills = [];
    const kill0 = g.onEnemyKilled.bind(g);
    g.onEnemyKilled = (e, info, ...rest) => {
      const out = kill0(e, info, ...rest);
      kills.push({ type: e.type, ring: !!(info && info.bullet && info.bullet.shieldRing) });
      return out;
    };
    // the steps a ring goes out on
    let step = 0;
    const rings = [];
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.shieldRing && rings[rings.length - 1] !== step) rings.push(step);
      return spawn0(o);
    };
    // grab him
    p.grab(ring);
    const grabbed = p.hostage === ring;
    window.step();
    const first = g.bullets.list.filter((b) => b.shieldRing);
    const out = { grabbed, n: first.length, mine: first.every((b) => b.owner === 'player') };
    // every direction round the player
    const angles = first.map((b) => Math.atan2(b.dx, b.dz));
    out.spread = Math.max(...angles) - Math.min(...angles);
    for (step = 1; step < 120 * 2; step++) {
      p.hostageT = 9;
      window.step();
    }
    g.bullets.spawn = spawn0;
    g.onEnemyKilled = kill0;
    out.again = rings.length > 1 ? (rings[1] - rings[0]) / 120 : -1;
    out.kills = kills;
    out.notes = g.notes.events.map((e) => e.text).filter((x) => x.startsWith('人盾放環'));
    return out;
  });
  assert.ok(r.grabbed, 'held up');
  assert.ok(r.n >= 20 && r.mine, `a ring of the player’s own rounds: ${r.n}`);
  assert.ok(r.spread > 5.5, `all the way round: ${r.spread.toFixed(2)} rad`);
  assert.ok(Math.abs(r.again - PLAYER.humanShield.ringEvery) < 0.05, `again ${PLAYER.humanShield.ringEvery} s later (${r.again})`);
  assert.ok(r.kills.some((k) => k.type === 'grunt' && k.ring), `the thug down to the ring: ${JSON.stringify(r.kills)}`);
  assert.equal(r.notes.length, 1, 'a line in the notes');
  assert.ok(TRICKS['SHIELD RING'] && TRICKS['SHIELD RING'].kind === 'shield', 'a trick of the shield’s in the book');
  await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const p = g.player;
    const ring = window.put('ringer', 0, 7);
    ring.fireCd = 99;
    for (const [x, z] of [[-4, 2], [4, 2], [0, 1]]) window.put('grunt', x, z).fireCd = 99;
    p.facing = Math.PI;
    p.grab(ring);
    for (let i = 0; i < 30; i++) {
      p.hostageT = 9;
      window.step();
    }
    g.updateCamera(1, true);
    g.render();
  });
  await page.screenshot({ path: new URL('squad-ring.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
