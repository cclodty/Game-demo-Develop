// Tools ④ (工具 ④): two new things on the docks. A fishing net: E takes it
// into the hand, G throws it; where it lands (or on whoever it meets in the
// air) it falls over ENV.net.radius m for ENV.net.time s, and everyone under
// it is held there, dazed (F executes them one after another); a kill while
// netted is NETTED +150. A hand trolley: kicked, it rolls a long way and
// bowls over whoever is in its road; two or more in one roll is BOWLING
// +200. Numbers in config.js ENV.net and ENV.trolley. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=21'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on the docks, the player at (x, z). */
    window.begin = (x = 0, z = 2) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(2);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** A thug keeping his post at (x, z), ready to be hit. */
    window.thug = (x, z) => {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      return e;
    };
    /** Step 120 Hz frames, aiming at (ax, az): `keys` pressed on the first; the player kept alive and still. */
    window.play = (n, ax, az, keys = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.vx = p.vz = 0;
        p.hp = 100;
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        g.aimPoint.set(ax, g.aimPoint.y, az);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
    };
  });
});
after(async () => {
  await h.close();
});

test('the docks have two nets and two trolleys; E takes a net into the hand (the left gun still out); a trolley is not picked up', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const nets = g.level.tools.filter((t) => t.kind === 'net');
    const trolleys = g.level.tools.filter((t) => t.kind === 'trolley');
    const p = g.player;
    // at a trolley (moved into the open, nothing else in reach): E takes nothing
    const t = trolleys[0];
    t.x = -5;
    t.z = 0.8;
    p.x = t.x + 0.9;
    p.z = t.z;
    window.play(2, p.x + 3, p.z, ['KeyE']);
    const tookTrolley = !!g.thrown.carry;
    // at a net: E takes it
    const n = nets[0];
    p.x = n.x + 0.6;
    p.z = n.z;
    window.play(2, p.x, p.z - 5, ['KeyE']);
    g.thrown.update(0);
    return {
      nets: nets.length,
      trolleys: trolleys.length,
      tookTrolley,
      took: g.thrown.carry === n,
      inHand: g.thrown.inHand,
      leftGun: p.rig.weaponParts.filter((m) => m.parent === p.rig.armL).every((m) => m.visible),
      prompt: g.thrown.prompt,
    };
  });
  assert.deepEqual([r.nets, r.trolleys], [2, 2]);
  assert.equal(r.tookTrolley, false, 'a trolley is too big to pick up');
  assert.deepEqual([r.took, r.inHand, r.leftGun], [true, true, true], 'the net in the right hand, the left gun out');
  assert.match(r.prompt, /擲出/);
  assert.deepEqual(problems(logs), []);
});

test('a thrown net falls over two thugs: both held, dazed, for its time; one outside it is not; F executes them one after another; a kill under it is NETTED', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin(0, 2);
    const p = g.player;
    const net = g.level.tools.find((t) => t.kind === 'net');
    const a = window.thug(-0.8, -4);
    const b = window.thug(0.8, -4);
    const far = window.thug(5, -4);
    g.thrown.pickUp(net);
    // G: thrown at the spot between the two (two steps first: a step takes the cursor every other one)
    window.play(2, 0, -4);
    window.play(1, 0, -4, ['KeyG']);
    let n = 0;
    while (net.castT <= 0 && n++ < 240) window.play(1, 0, -4);
    const cast = { at: [Math.round(net.x * 10) / 10, Math.round(net.z * 10) / 10], castT: net.castT };
    const held = [a, b, far].map((e) => ({ stun: Math.round(e.stunT * 10) / 10, cause: e.stunCause, net: e.netT > 0 }));
    // F twice, within reach (PLAYER.execRange): the two under the net, one after the other (each execution takes its time)
    p.x = -0.8;
    p.z = -3;
    window.play(1, 0, -4, ['KeyF']);
    const first = [a, b].filter((e) => !e.alive).length;
    window.play(120, 0, -4);
    p.x = 0.8;
    p.z = -3;
    window.play(1, 0, -4, ['KeyF']);
    window.play(60, 0, -4);
    const second = [a, b].filter((e) => !e.alive).length;
    // a third under a second net, shot dead: NETTED (once the execution is over: nothing is thrown during one)
    n = 0;
    while (p.execT > 0 && n++ < 240) window.play(1, 0, -4);
    g.enemies.clear(); // the one left outside has walked up to the player by now: the net would fall on him in the air
    const c = window.thug(-2, -6);
    const net2 = g.level.tools.find((t) => t.kind === 'net' && t !== net);
    p.x = 0;
    p.z = 2;
    g.thrown.pickUp(net2);
    window.play(2, -2, -6); // the aim taken after the move (until then a step keeps the old aim beside the player)
    window.play(1, -2, -6, ['KeyG']);
    n = 0;
    while (net2.castT <= 0 && n++ < 240) window.play(1, -2, -6);
    const under = { net: [net2.x, net2.z].map((v) => Math.round(v * 10) / 10), netT: Math.round(c.netT * 10) / 10 };
    const before = g.notes.events.length;
    c.hp = 1;
    c.die(0, -1, { cause: 'bullet' });
    const killLog = g.notes.events.slice(before).map((e) => e.text).find((t) => t.startsWith('擊殺')) || '';
    // its time runs out: the net is gone
    n = 0;
    while (net.alive && n++ < 600) window.play(1, 0, -4);
    return { cast, held, first, second, under, killLog, gone: !net.alive, logged: g.notes.events.some((e) => e.text.startsWith('漁網罩住')) };
  });
  assert.ok(Math.hypot(r.cast.at[0], r.cast.at[1] + 4) < 1, `it fell where it was thrown (${r.cast.at})`);
  assert.deepEqual(r.held.slice(0, 2).map((x) => [x.cause, x.net]), [['net', true], ['net', true]], 'both under it held by the net');
  assert.ok(r.held[0].stun >= 2 && r.held[1].stun >= 2, `dazed for the net's time (${r.held.map((x) => x.stun)})`);
  assert.equal(r.held[2].net, false, 'the one 5 m off is not under it');
  assert.deepEqual([r.first, r.second], [1, 2], 'F executed them one after another');
  assert.match(r.killLog, /NETTED/, `${r.killLog} (${JSON.stringify(r.under)})`);
  assert.equal(r.gone, true, 'its time over, the net is gone');
  assert.equal(r.logged, true);
  assert.deepEqual(problems(logs), []);
});

test('a kicked trolley rolls a long way and bowls over the thugs in its road: two in one roll is BOWLING +200', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    // a clear lane east at z = -1 (the middle road at z = 0.8 has a barrel by it)
    window.begin(-16, -1);
    const p = g.player;
    const t = g.level.tools.find((q) => q.kind === 'trolley');
    t.x = -14.8;
    t.z = -1;
    t.vx = t.vz = 0;
    const a = window.thug(-9, -1);
    const b = window.thug(-6.5, -0.9);
    p.facing = Math.PI / 2;
    const score0 = g.score.score;
    window.play(1, 0, -1, ['KeyF']);
    const kicked = Math.round(Math.hypot(t.vx, t.vz) * 10) / 10;
    let n = 0;
    let far = 0;
    while (n++ < 480) {
      window.play(1, 0, -1);
      far = Math.max(far, t.x + 14.8);
      if (Math.hypot(t.vx, t.vz) < 0.2 && n > 60) break;
    }
    const events = g.notes.events.map((e) => e.text);
    return {
      kicked,
      far: Math.round(far * 10) / 10,
      hit: [a, b].map((e) => !e.alive || e.stunCause === 'strike'),
      bowling: events.filter((t) => t.includes('BOWLING')),
      gained: g.score.score - score0,
    };
  });
  assert.ok(r.kicked > 8, `kicked off fast (${r.kicked} m/s)`);
  assert.ok(r.far > 10, `it rolled ${r.far} m`);
  assert.deepEqual(r.hit, [true, true], 'both thugs in its road bowled over');
  assert.equal(r.bowling.length, 1, `one BOWLING for the roll (${r.bowling})`);
  assert.ok(r.gained >= 200, `the bonus is paid (${r.gained})`);
  assert.deepEqual(problems(logs), []);
});

test('screenshots: a net over two thugs; a trolley in the middle of its roll', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.begin(0, 2);
    const net = g.level.tools.find((t) => t.kind === 'net');
    window.thug(-0.8, -4);
    window.thug(0.8, -4);
    g.thrown.pickUp(net);
    window.play(2, 0, -4);
    window.play(1, 0, -4, ['KeyG']);
    let n = 0;
    while (net.castT <= 0 && n++ < 240) window.play(1, 0, -4);
    window.play(20, 0, -4);
    g.updateCamera(1, true);
    g.render();
  });
  await page.screenshot({ path: new URL('tool-net.png', OUT).pathname });
  await page.evaluate(() => {
    const g = window.game;
    window.begin(-16, -1);
    const t = g.level.tools.find((q) => q.kind === 'trolley');
    t.x = -14.8;
    t.z = -1;
    window.thug(-9, -1);
    window.thug(-6.5, -0.9);
    g.player.facing = Math.PI / 2;
    window.play(1, 0, -1, ['KeyF']);
    window.play(70, 0, -1);
    g.updateCamera(1, true);
    g.render();
  });
  await page.screenshot({ path: new URL('tool-trolley.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
