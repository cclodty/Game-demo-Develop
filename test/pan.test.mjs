// The pan in hand (工具 ①): G takes a pan into the right hand instead of
// overhead; the left pistol keeps firing; F swings the pan: whoever is in the
// arc flies and is dazed (a kill is PAN SMASH, an execution follows), a
// barrel is batted off and goes off where it lands; G throws the pan as
// before. Numbers in config.js PAN. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=8'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet rooftop run with the player at (0, 4) facing north and a pan at his feet. */
    window.begin = () => {
      g.setRules('normal', []);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = 0;
      p.z = 4;
      p.vx = p.vz = 0;
      const pan = g.level.pans[0];
      pan.x = 0.6;
      pan.z = 4;
      pan.y = 0.05;
      pan.vx = pan.vz = pan.vy = 0;
      return pan;
    };
    window.play = (n, keys = [], mouse = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.vx = p.vz = 0;
        p.hp = 100;
        g.input.pressed.clear();
        g.input.mouse.leftPressed = false;
        g.input.mouse.left = false;
        if (i === 0) {
          for (const k of keys) g.input.pressed.add(k);
          if (mouse.click) {
            g.input.mouse.leftPressed = true;
            g.input.mouse.left = true;
          }
        }
        g.aimPoint.set(0, g.aimPoint.y, -6);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
      }
      g.input.pressed.clear();
      g.input.mouse.leftPressed = g.input.mouse.left = false;
    };
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.update = () => {};
      return e;
    };
    window.tags = () => {
      const tags = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        tags.push(t.map((x) => x.label));
        return kill0(t);
      };
      return tags;
    };
    /** Which side of the player a bullet left from: -1 his left, 1 his right (facing north). */
    window.sideOf = (b) => {
      const p = g.player;
      const fx = Math.sin(p.facing);
      const fz = Math.cos(p.facing);
      return Math.sign(fx * (b.z - p.z) - fz * (b.x - p.x));
    };
    /** The sides the player's shots leave from, in order, from now on (measured as each is spawned). */
    window.sides = [];
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.owner === 'player') window.sides.push(window.sideOf(o));
      return spawn0(o);
    };
  });
});
after(async () => {
  await h.close();
});

test('G takes the pan into the right hand: the right pistol is put away, the left one alone fires, F is the swing', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const pan = window.begin();
    const p = g.player;
    // without the pan the two pistols take turns
    window.sides.length = 0;
    window.play(1, [], { click: true });
    window.play(8);
    window.play(1, [], { click: true });
    const free = window.sides.slice();
    const alternate = free.length === 2 && free[0] !== free[1] && free.every((s) => s !== 0);
    window.play(30);
    g.bullets.clear();
    window.play(1, ['KeyG']);
    const held = { inHand: g.thrown.inHand, carry: g.thrown.carry === pan, parent: pan.mesh.parent === p.rig.armR, slot: p.slot, rightGun: p.rig.weaponParts.filter((m) => m.parent === p.rig.armR).map((m) => m.visible), prompt: g.thrown.prompt };
    g.hud.update(1 / 60);
    const hud = document.getElementById('prompt').textContent;
    window.sides.length = 0;
    for (let i = 0; i < 3; i++) {
      window.play(1, [], { click: true });
      window.play(8);
    }
    const sides = window.sides.slice();
    g.bullets.clear();
    return { alternate, held, hud, sides };
  });
  assert.equal(r.alternate, true, 'free-handed, the pistols take turns');
  assert.deepEqual([r.held.inHand, r.held.carry, r.held.parent, r.held.slot], [true, true, true, 'pistols'], 'the pan is in the right hand');
  assert.ok(r.held.rightGun.length > 0 && r.held.rightGun.every((v) => v === false), 'the right pistol is put away');
  assert.match(r.held.prompt, /鑊擊/);
  assert.match(r.hud, /鑊擊/);
  assert.ok(r.sides.length === 3 && r.sides.every((s) => s === -1), `every shot from the left (${r.sides})`);
  assert.deepEqual(problems(logs), []);
});

test('the swing: the thug in the arc flies dazed (then F executes him), the blade dies to PAN SMASH, the barrel is batted off and goes off', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const pan = window.begin();
    const p = g.player;
    window.play(1, ['KeyG']);
    const tags = window.tags();
    // a thug 1.6 m ahead, a little to the left; a blade 1.6 m ahead to the right
    const thug = window.post('grunt', -0.7, 2.6);
    const blade = window.post('rusher', 0.8, 2.6);
    window.play(1, ['KeyF']);
    const swing = { thug: { stun: thug.stunT > 0, cause: thug.stunCause, hp: thug.hp, alive: thug.alive }, blade: { dead: blade.dead }, swingT: g.player.swingT, pan: g.thrown.inHand && pan.carried };
    window.play(6);
    // the thug flew off dazed: F again, close enough, is an execution
    p.x = thug.x;
    p.z = thug.z + 0.8;
    window.play(1, ['KeyF']);
    window.play(50);
    const executed = { dead: thug.dead, tags: tags.slice() };
    // a barrel 1.5 m ahead: batted off, it lands and goes off, taking the thug standing further on
    window.begin();
    const b = g.level.barrels.find((x) => x.alive && x.variant !== 'lpg');
    b.x = 0;
    b.z = 2.5;
    b.vx = b.vz = b.vy = 0;
    b.y = 0;
    const far = window.post('grunt', 0, -2);
    window.play(1, ['KeyG']);
    window.play(1, ['KeyF']);
    const flying = { y: b.y, thrown: b.thrown, vz: b.vz };
    let n = 0;
    while (b.alive && n++ < 180) window.play(1);
    return { swing, executed, flying, burst: { t: n / 60, alive: b.alive, farDead: far.dead } };
  });
  assert.deepEqual([r.swing.thug.stun, r.swing.thug.cause, r.swing.thug.hp, r.swing.thug.alive], [true, 'smash', 1, true], 'the thug flies dazed, down to 1');
  assert.equal(r.swing.blade.dead, true, 'the blade (2 hp) dies');
  assert.ok(r.swing.swingT > 0 && r.swing.pan, 'the pan stays in hand through the swing');
  assert.ok(r.executed.tags.some((t) => t.includes('PAN SMASH')), `the blade's tags: ${r.executed.tags.map((t) => t.join('+')).join(' | ')}`);
  assert.equal(r.executed.dead, true, 'F by the dazed thug executes him');
  assert.ok(r.executed.tags.some((t) => t.includes('EXECUTION')), 'with the EXECUTION tag');
  assert.ok(r.flying.y > 0 && r.flying.thrown && r.flying.vz < -6, `the barrel flies north (${JSON.stringify(r.flying)})`);
  assert.equal(r.burst.alive, false, `it went off where it landed (${r.burst.t.toFixed(2)} s)`);
  assert.equal(r.burst.farDead, true, 'and took the thug further on');
  await snap(page, 'pan-hold.png');
  assert.deepEqual(problems(logs), []);
});

test('G throws the pan from the hand; the right pistol comes back; a barrel still rides overhead', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const pan = window.begin();
    const p = g.player;
    window.play(1, ['KeyG']);
    const e = window.post('grunt', 0, -1);
    window.play(1, ['KeyG']);
    const thrown = { inHand: g.thrown.inHand, carry: g.thrown.carry, flying: pan.thrown && pan.vy > 0, parent: pan.mesh.parent === g.level.root, rightGun: p.rig.weaponParts.filter((m) => m.parent === p.rig.armR).every((m) => m.visible) };
    let stunned = false;
    for (let i = 0; i < 90 && !stunned; i++) {
      window.play(1);
      if (e.stunT > 0 && e.stunCause === 'throw') stunned = true;
    }
    // a barrel: overhead as ever
    const b = g.level.barrels.find((x) => x.alive && x.variant !== 'lpg');
    b.x = p.x + 0.6;
    b.z = p.z;
    b.y = 0;
    b.vx = b.vz = b.vy = 0;
    window.play(1, ['KeyG']);
    window.play(5);
    const barrel = { carry: g.thrown.carry === b, inHand: g.thrown.inHand, y: b.y };
    return { thrown, stunned, barrel };
  });
  assert.deepEqual([r.thrown.inHand, r.thrown.carry, r.thrown.flying, r.thrown.parent, r.thrown.rightGun], [false, null, true, true, true], 'thrown, and the hand is free again');
  assert.equal(r.stunned, true, 'the thrown pan still dazes');
  assert.deepEqual([r.barrel.carry, r.barrel.inHand], [true, false], 'a barrel goes overhead');
  assert.ok(r.barrel.y > 2, `overhead (${r.barrel.y.toFixed(2)} m)`);
  assert.deepEqual(problems(logs), []);
});
