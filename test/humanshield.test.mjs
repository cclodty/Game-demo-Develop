// The human shield (人盾 ①): E by a man in front, with no weapon there to swap
// and nothing to pick up, holds him up in front (PLAYER.humanShield) for 1.5 s
// or until E again. Enemy bullets from within ±60° of the facing hit him, not
// the player, a hit of his hp each; from behind they hit the player; shot
// dead, he drops. Held, the player walks at 0.6 of the pace and fires the left
// gun alone, past him. Not a riot-shield man, a brute, a bomber, a drone, or a
// man behind the player or out of reach.
// Let go (人盾 ②), he is shoved out ahead about 6 m, bowling over whoever is
// in the way; shot dead by his own side while held, he is a HUMAN SHIELD.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=7'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on the rooftop, the player at (x, z) in the top-down view, no weapons about. */
    window.begin = (x = -6, z = 4) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.pickups.clear();
      g.bullets.clear();
      g.setFocus(false);
      g.view = 0;
      g.updateCamera(1, true);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** A man of `type` standing at (x, z) who does not shoot on his own. */
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move'; // in the fight, as a kick leaves him
      e.fireCd = 999;
      return e;
    };
    /** 120 Hz steps holding `held` (Mouse0 is the left button), pressing `press` on the first, aiming east. */
    window.play = (n, held = [], press = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = held.includes('Mouse0');
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.aimPoint.set(g.player.x + 6, g.aimPoint.y, g.player.z);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
      g.input.keys.clear();
      g.input.mouse.left = false;
    };
    /** An enemy bullet fired at the player from `d` m away, from `deg` degrees round from the east (the facing). */
    window.shootAt = (deg, d = 8) => {
      const p = g.player;
      const a = (deg * Math.PI) / 180;
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      return g.bullets.spawn({ x: p.x + ox * d, z: p.z + oz * d, dx: -ox, dz: -oz, speed: 60, owner: 'enemy', damage: 10 });
    };
  });
});
after(async () => {
  await h.close();
});

test('E: a weapon to swap first, then a thing to pick up, then the man in front; not a riot shield, a brute, a bomber, a drone, a man behind or out of reach', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    // a weapon at his feet to swap for the one in slot 2: the swap
    window.begin();
    p.giveWeapon('shotgun', 10);
    g.pickups.spawn('rifle', p.x, p.z);
    window.post('grunt', p.x + 1, p.z);
    window.play(2);
    window.play(1, [], ['KeyE']);
    const swap = { weapon: p.special && p.special.id, held: !!p.hostage };
    // a pan on the floor by him: the pan
    window.begin();
    const pan = g.level.props.find((q) => q.kind === 'pan' && q.alive);
    pan.x = p.x + 0.4;
    pan.z = p.z + 0.4;
    window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    const prop = { carry: g.thrown.carry && g.thrown.carry.kind, held: !!p.hostage };
    // nothing else: the man
    window.begin();
    const e = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    const man = { held: p.hostage === e, flag: e.held, gap: Math.hypot(e.x - p.x, e.z - p.z), east: e.x > p.x, note: g.notes.events.at(-1).text };
    const refuse = {};
    for (const [type, dx] of [['shield', 1], ['brute', 1.2], ['bomber', 1], ['drone', 1], ['grunt', -1], ['grunt', 2.2]]) {
      window.begin();
      window.post(type, p.x + dx, p.z);
      window.play(1, [], ['KeyE']);
      refuse[`${type} ${dx}`] = !!p.hostage;
    }
    return { swap, prop, man, refuse };
  });
  assert.deepEqual(r.swap, { weapon: 'rifle', held: false }, 'a weapon to swap: E swaps it');
  assert.deepEqual(r.prop, { carry: 'pan', held: false }, 'a pan to pick up: E picks it up');
  assert.equal(r.man.held, true, 'nothing else: E holds the man in front');
  assert.equal(r.man.flag, true);
  assert.ok(r.man.east && Math.abs(r.man.gap - 0.75) < 0.05, `held 0.75 m in front (${r.man.gap.toFixed(2)})`);
  assert.match(r.man.note, /抓住人盾/);
  assert.deepEqual(Object.values(r.refuse), Object.values(r.refuse).map(() => false), JSON.stringify(r.refuse));
  assert.deepEqual(problems(logs), []);
});

test('bullets from within 60° of the front hit the man held there, not the player; from behind they hit the player; shot dead, he drops', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.begin();
    const e = window.post('shotgun', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    const hp0 = e.hp;
    const out = {};
    for (const deg of [0, 50, -50, 180, 110]) {
      p.hp = 100;
      p.invuln = 0;
      const manHp = e.hp;
      window.shootAt(deg);
      window.play(24);
      out[deg] = { player: 100 - Math.round(p.hp), man: Math.round(((manHp - e.hp) / e.tough) * 1000) / 1000 }; // in hits (config.js ENEMY_HP: as many as ever)
    }
    const held = !!p.hostage;
    // his last hit
    e.hp = 1;
    window.shootAt(0);
    window.play(24);
    const after = { hostage: p.hostage, alive: e.alive, notes: g.notes.events.slice(-4).map((x) => x.text) };
    // two bullets in the same step: the first kills him, the second goes on to the player
    window.begin();
    const e2 = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    e2.hp = 1;
    p.invuln = 0;
    window.shootAt(0);
    window.shootAt(0); // the same place: both arrive in one step
    window.play(24);
    const twice = { alive: e2.alive, player: 100 - Math.round(p.hp) };
    // the player shot down holding him: he is free
    window.begin();
    const e3 = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    p.invuln = 0;
    p.hurt(999, 1, 0, true, 'test');
    window.play(4);
    return { hp0, out, held, after, twice, freed: !e3.held && !p.alive };
  });
  for (const deg of ['0', '50', '-50']) assert.deepEqual(r.out[deg], { player: 0, man: 1 }, `from ${deg}°: the man takes it`);
  for (const deg of ['180', '110']) assert.deepEqual(r.out[deg], { player: 10, man: 0 }, `from ${deg}°: the player`);
  assert.equal(r.held, true, 'still held');
  assert.equal(r.after.alive, false, 'shot dead');
  assert.equal(r.after.hostage, null, 'and dropped');
  assert.ok(r.after.notes.some((t) => t.includes('人盾被打死')), r.after.notes.join(' | '));
  assert.deepEqual(r.twice, { alive: false, player: 10 }, 'the man dead, the next bullet is not stopped by his body');
  assert.equal(r.freed, true, 'the player down: the man is free');
  assert.deepEqual(problems(logs), []);
});

test('held 1.5 s or until E; a walk at 0.6 of the pace; the left gun alone, its shots past him', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const p = g.player;
    const { PLAYER } = await import('/src/config.js');
    window.begin();
    const e = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    let steps = 1;
    while (p.hostage && steps < 600) {
      window.play(1);
      steps++;
    }
    const time = { steps, freed: !e.held, stumbles: e.stunT > 0 };
    // E lets go
    window.begin();
    const e2 = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    window.play(20);
    window.play(1, [], ['KeyE']);
    const letGo = { hostage: p.hostage, held: e2.held, note: g.notes.events.at(-1).text };
    // walking with him, and without
    const pace = (hold) => {
      window.begin(-8, 4);
      window.post('grunt', p.x + 1, p.z);
      if (hold) window.play(1, [], ['KeyE']);
      window.play(60, ['KeyD']);
      return Math.hypot(p.vx, p.vz);
    };
    const walk = { held: pace(true), free: pace(false), want: PLAYER.speed * PLAYER.humanShield.walkMul };
    // firing with him held: the left gun alone, and he is not hit
    window.begin();
    const e3 = window.post('grunt', p.x + 1, p.z);
    const full = e3.hp; // what he came in with (config.js ENEMY_HP)
    window.play(1, [], ['KeyE']);
    let left = 0;
    let right = 0;
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      const n = g.bullets.list.length;
      window.play(1, ['Mouse0']);
      shots += Math.max(0, g.bullets.list.length - n);
      left = Math.max(left, p.recoilL);
      right = Math.max(right, p.recoilR);
    }
    return { time, hold: PLAYER.humanShield.hold, letGo, walk, fire: { shots, left, right, manHp: e3.hp, full } };
  });
  assert.ok(Math.abs(r.time.steps / 120 - r.hold) <= 1 / 60, `held ${(r.time.steps / 120).toFixed(3)} s`);
  assert.equal(r.time.freed, true);
  assert.equal(r.time.stumbles, true, 'let go, he stumbles a moment');
  assert.deepEqual(r.letGo, { hostage: null, held: false, note: '推出人盾' }, 'E again: let go');
  assert.ok(Math.abs(r.walk.held - r.walk.want) < 0.15, `a walk with him: ${r.walk.held.toFixed(2)} m/s, ${r.walk.want.toFixed(2)} wanted`);
  assert.ok(r.walk.free > r.walk.held * 1.5, `and faster without (${r.walk.free.toFixed(2)} m/s)`);
  assert.ok(r.fire.shots > 0 && r.fire.left > 0, 'the left gun fires');
  assert.equal(r.fire.right, 0, 'the right one does not');
  assert.equal(r.fire.manHp, r.fire.full, 'its shots go past the man held');
  assert.deepEqual(problems(logs), []);
});

test('let go, he is shoved out about 6 m and bowls over a man in the way; shot dead held up, he is a HUMAN SHIELD (+200)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const kills = [];
    const kill0 = g.score.kill.bind(g.score);
    g.score.kill = (t) => {
      kills.push(t.map((x) => `${x.label}:${x.pts}`));
      return kill0(t);
    };
    // E again: out he goes, east
    window.begin(-8, 4);
    const e = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    window.play(10);
    const x0 = e.x;
    const hp0 = e.hp;
    window.play(1, [], ['KeyE']);
    let far = 0;
    let drift = 0;
    for (let i = 0; i < 150; i++) {
      window.play(1);
      far = Math.max(far, e.x - x0);
      drift = Math.max(drift, Math.abs(e.z - p.z));
    }
    const shove = { dist: far, drift, hp: hp0 - e.hp };
    /** How far ahead of the player he gets in `n` steps. */
    const furthest = (e, n) => {
      let far = 0;
      for (let i = 0; i < n; i++) {
        window.play(1);
        far = Math.max(far, e.x - p.x);
      }
      return far;
    };
    // the time runs out: out too; F: out too, no kick
    window.begin(-8, 4);
    const e2 = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    const timedOut = furthest(e2, 330);
    window.begin(-8, 4);
    const e3 = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    window.play(1, [], ['KeyF']);
    const kicked = p.kickT > 0;
    const byF = { dist: furthest(e3, 150), kicked };
    // a man 3 m on: bowled over
    window.begin(-8, 4);
    const held = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    const other = window.post('grunt', p.x + 4, p.z);
    window.play(1, [], ['KeyE']);
    let downed = false;
    for (let i = 0; i < 120; i++) {
      window.play(1);
      downed = downed || other.stunT > 0;
    }
    const bowl = { downed, cause: other.stunCause, heldX: held.x };
    // shot dead by his own side, held up in front
    window.begin();
    const e4 = window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    e4.hp = 1;
    kills.length = 0;
    window.shootAt(0);
    window.play(24);
    return { shove, timedOut, byF, bowl, tags: kills.flat(), note: g.notes.events.map((x) => x.text).filter((t) => t.startsWith('擊殺')).at(-1) };
  });
  assert.ok(r.shove.dist > 5 && r.shove.dist < 7, `shoved about 6 m (${r.shove.dist.toFixed(2)})`);
  assert.ok(r.shove.drift < 0.3, 'straight ahead');
  assert.equal(r.shove.hp, 0, 'unhurt by the shove');
  assert.ok(r.timedOut > 5, `the time up: shoved too (${r.timedOut.toFixed(2)} m ahead)`);
  assert.ok(r.byF.dist > 5 && !r.byF.kicked, `F: the shove, not a kick (${r.byF.dist.toFixed(2)} m)`);
  assert.equal(r.bowl.downed, true, 'the man in the way is bowled over');
  assert.equal(r.bowl.cause, 'strike');
  assert.ok(r.tags.includes('HUMAN SHIELD:200'), r.tags.join(','));
  assert.ok(!r.tags.some((t) => t.startsWith('FRIENDLY FIRE')), 'not FRIENDLY FIRE as well');
  assert.match(r.note, /HUMAN SHIELD/);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: a man held up in front, a bullet on its way', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.begin(-7, 0.5);
    g.view = 2;
    window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    window.play(6, ['Mouse0']);
    window.shootAt(10, 5);
    window.play(4);
    g.present(1 / 60);
    g.updateCamera(1, true);
    g.camera.position.lerp(g.camTarget, 0.55);
    g.render();
  });
  await page.screenshot({ path: new URL('human-shield.png', OUT).pathname });
});

test('screenshot: the human shield shoved into the man behind him', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.begin(-8, 0.5);
    g.view = 2;
    window.post('grunt', p.x + 1, p.z);
    window.play(1, [], ['KeyE']);
    window.post('grunt', p.x + 4.5, p.z);
    window.play(1, [], ['KeyE']);
    window.play(26);
    g.present(1 / 60);
    g.updateCamera(1, true);
    g.camera.position.lerp(g.camTarget, 0.55);
    g.render();
  });
  await page.screenshot({ path: new URL('human-shield-shove.png', OUT).pathname });
});
