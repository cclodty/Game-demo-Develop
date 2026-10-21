// The dive (飛撲 ①): in bullet time, Space with a direction held throws the
// player sideways through the air about PLAYER.dive.dist m, guns still firing,
// and lands in a roll; outside bullet time (or with no direction) Space is the
// spin as before, so no new control and old replays play the same. In the air
// bullets pass under the body (a blast still hurts); a wall stops the dive at
// the wall. ?style=off plays it the same.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** A quiet run on the rooftop with helpers: the player at (x, z), bullet time on or off. */
const setup = (page) =>
  page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.begin = (x, z, focus) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
      g.setFocus(focus);
      g.focusMeter = 1;
      // the top-down view: D is due east (in the 45° side view it is east-north-east on the floor)
      g.view = 0;
      g.updateCamera(1, true);
    };
    /** Step 120 Hz frames holding `held`, pressing `press` on the first; returns where the player was each step. */
    window.play = (n, held = [], press = []) => {
      const track = [];
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
        track.push([g.player.x, g.player.z, g.player.diving, g.player.rolling, g.timeScale * g.playerVelScale]);
      }
      g.input.pressed.clear();
      g.input.keys.clear();
      g.input.mouse.left = false;
      return track;
    };
  });

test('in bullet time Space with a direction is a dive: about 4 m through the air, then a roll; without bullet time, or with no direction, it is the spin', async () => {
  const { page, logs } = await h.open('?seed=5');
  try {
    await setup(page);
    const r = await page.evaluate(async () => {
      const g = window.game;
      const p = g.player;
      const { PLAYER } = await import('/src/config.js');
      window.begin(-6, 4, true);
      const [x0, z0] = [p.x, p.z];
      const track = window.play(240, ['KeyD'], ['Space', 'KeyD']);
      const air = track.filter((t) => t[2]).length;
      // the player's clock runs at t[4] of real time (easing into bullet time): PLAYER.dive.air of it in the air
      const airTime = track.filter((t) => t[2]).reduce((sum, t) => sum + t[4] / 120, 0);
      const airStep = track[1][4] / 120;
      const roll = track.filter((t) => t[3]).length;
      const landedAt = track.findIndex((t, i) => i > 0 && track[i - 1][2] && !t[2]);
      const flown = Math.hypot(track[landedAt][0] - x0, track[landedAt][1] - z0);
      const east = (track[landedAt][0] - x0) / flown;
      const spunInDive = p.spinT > 0;
      const log = g.notes.events.map((e) => e.text).filter((t) => t.includes('飛撲'));
      // outside bullet time: the spin
      window.begin(-6, 4, false);
      window.play(1, ['KeyD'], ['Space', 'KeyD']);
      const spin = { spinning: p.spinT > 0, diving: !!p.diving };
      // in bullet time with no direction: the spin too
      window.begin(-6, 4, true);
      window.play(1, [], ['Space']);
      const still = { spinning: p.spinT > 0, diving: !!p.diving };
      return { air, airTime, airStep, airWant: PLAYER.dive.air, roll, flown, east, spunInDive, spin, still, log };
    });
    assert.ok(r.air > 0 && r.roll > 0, `in the air for ${r.air} steps, then a roll of ${r.roll}`);
    assert.ok(Math.abs(r.airTime - r.airWant) <= r.airStep, `in the air PLAYER.dive.air of the player's time (${r.airTime.toFixed(3)} s, ${r.air} steps)`);
    assert.ok(r.flown > 3.6 && r.flown < 4.4, `about 4 m through the air (${r.flown.toFixed(2)})`);
    assert.ok(r.east > 0.99, 'the way the key points (D: east, in the top-down view)');
    assert.equal(r.spunInDive, false, 'a dive is not a spin');
    assert.deepEqual(r.spin, { spinning: true, diving: false }, 'outside bullet time: the spin');
    assert.deepEqual(r.still, { spinning: true, diving: false }, 'no direction: the spin');
    assert.ok(r.log.length >= 1, 'the notes say 飛撲');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('in the air the guns fire and bullets pass under the body; a blast still hurts; a wall stops the dive', async () => {
  const { page, logs } = await h.open('?seed=5');
  try {
    await setup(page);
    const r = await page.evaluate(() => {
      const g = window.game;
      const p = g.player;
      window.begin(-6, 4, true);
      window.play(1, ['KeyD', 'Mouse0'], ['Space', 'KeyD']);
      const shotsBefore = g.bullets.list.filter((b) => b.owner === 'player').length;
      window.play(20, ['KeyD', 'Mouse0']);
      const shot = g.bullets.list.filter((b) => b.owner === 'player').length > shotsBefore || g.bullets.list.some((b) => b.owner === 'player');
      const airborne = !!p.diving;
      // an enemy bullet head-on: it passes under and flies on
      g.bullets.clear();
      const b = g.bullets.spawn({ x: p.x + 2, z: p.z, dx: -1, dz: 0, speed: 60, owner: 'enemy', damage: 10 });
      const hp0 = p.hp;
      window.play(30, ['KeyD']); // the world at a fifth of the speed: it takes this long to meet and pass
      const under = { hp: p.hp - hp0, alive: b.alive && g.bullets.list.includes(b), past: b.x < p.x - 1, diving: !!p.diving };
      const bullet = p.hurt(20, 1, 0, false, 'test');
      const blast = p.hurt(20, 1, 0, true, 'test');
      // a wall: the rooftop's east parapet, dived at from 1.5 m
      const W = g.level.bounds.halfW;
      window.begin(W - 2, 0, true);
      window.play(240, ['KeyD'], ['Space', 'KeyD']);
      return { shot, airborne, under, bullet, blast, x: p.x, W };
    });
    assert.equal(r.airborne, true);
    assert.equal(r.shot, true, 'the guns fire in the air');
    assert.deepEqual(r.under, { hp: 0, alive: true, past: true, diving: true }, 'an enemy bullet passes under the dive and flies on');
    assert.equal(r.bullet, false, 'a bullet passes under');
    assert.equal(r.blast, true, 'a blast still hurts');
    assert.ok(r.x < r.W, `stopped by the wall (${r.x.toFixed(2)} of ${r.W})`);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('?style=off dives the same, step for step', async () => {
  const runs = [];
  for (const q of ['?seed=5', '?seed=5&style=off']) {
    const { page } = await h.open(q);
    try {
      await setup(page);
      runs.push(
        await page.evaluate(() => {
          window.begin(-6, 4, true);
          return window.play(120, ['KeyS'], ['Space', 'KeyS']).map(([x, z]) => `${x.toFixed(4)},${z.toFixed(4)}`);
        }),
      );
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(runs[1], runs[0]);
});

test('a dive is in the input record: Shift, then Space with D, replays to the same place step for step', async () => {
  const { page, logs } = await h.open('?seed=5');
  try {
    await setup(page);
    const r = await page.evaluate(async () => {
      const g = window.game;
      const { RecordReader } = await import('/src/replay.js');
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      const trace = [];
      const step0 = g.step.bind(g);
      g.step = () => {
        step0();
        trace.push(`${g.player.x.toFixed(4)},${g.player.z.toFixed(4)},${g.player.diving ? 1 : 0}`);
      };
      window.play(30);
      window.play(2, [], ['ShiftLeft']);
      const focus = g.focusActive;
      window.play(160, ['KeyD'], ['Space', 'KeyD']);
      const live = trace.slice();
      const dived = live.some((t) => t.endsWith(',1'));
      const rd = new RecordReader(g.record.encode());
      g.startRun(rd.map);
      g.feed = (game) => rd.next(game.player.x, game.player.z);
      trace.length = 0;
      while (trace.length < live.length) g.updatePlay(1 / 120);
      g.feed = null;
      g.step = step0;
      return { focus, dived, live, again: trace.slice(0, live.length) };
    });
    assert.equal(r.focus, true, 'Shift: bullet time');
    assert.equal(r.dived, true, 'Space with D: a dive');
    assert.deepEqual(r.again, r.live);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('screenshot: mid-dive in bullet time, worn model and block rig', async () => {
  for (const [q, name] of [['?seed=5', 'dive.png'], ['?seed=5&models=off', 'dive-blocks.png']]) {
    const { page } = await h.open(q);
    try {
      await setup(page);
      await page.evaluate(() => {
        const g = window.game;
        window.begin(-4, 4, true);
        // the 45° side view, moved in: the dive seen from the side, the guns firing across it
        g.view = 2;
        window.play(16, ['KeyD', 'Mouse0'], ['Space', 'KeyD']);
        window.play(10, ['KeyD']); // the shots in flight, the muzzle flashes gone
        g.present(1 / 60);
        g.updateCamera(1, true);
        g.camera.position.lerp(g.camTarget, 0.55);
        g.render();
      });
      await page.screenshot({ path: new URL(name, OUT).pathname });
    } finally {
      await page.close();
    }
  }
});
