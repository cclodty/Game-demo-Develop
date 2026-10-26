// 彈幕 ② A②: the gap guarantee (src/gaps.js, config.js HELL). Pillar 3 of the third roadmap: the barrage is a
// problem with a way through. In a room, at every logic step, there is a clear spot by the player, a circle HELL.gap
// m across within HELL.gapReach m of him on open ground, that no enemy round within HELL.gapRange m is on its way
// through; a man whose shot would close the last one holds his aim (his laser bright) and looks again next beat
// (HELL.beat). The same seed, the same fire.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=53'));
  await page.evaluate(async () => {
    const g = window.game;
    const { fireLines, safeSpot } = await import('./src/gaps.js');
    const { HELL } = await import('./src/config.js');
    window.gaps = { fireLines, safeSpot, HELL };
    g.frame = () => {};
    /** A 彈幕試驗 run, nobody about, the player at (x, z) in the teahouse. */
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
    /** One of `type` at (x, z), standing where he is (no posts, no cover), ready to fire after `wait` s. */
    window.put = (type, x, z, wait = 0) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = wait;
      return e;
    };
    /** The clear spot by the player now, from the rounds in the air (what the guarantee promises: 1.2 m across within 2 m, whatever the gate is set to), or null. */
    window.spotNow = () => {
      const p = g.player;
      const L = g.level;
      const lines = fireLines(g.bullets.list, p.x, p.z, 6);
      return { lines: lines.length, spot: safeSpot(lines, p.x, p.z, { reach: 2, gap: 1.2, walkable: (x, z) => Math.abs(x) < L.bounds.halfW && Math.abs(z) < L.bounds.halfD && L.nav.isWalkable(x, z) }) };
    };
    /**
     * The room's first `seconds` s, the player standing still: every step the clear spot is looked for; the steps
     * without one, the steps someone held his aim for the gap (and whether his laser showed and he fired none that
     * step), the shots as [step, who] (the same seed should give the same), and the most lines of fire at once.
     */
    window.runWave = (seconds, wave = true) => {
      const shots = [];
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      let firing = null;
      g.bullets.spawn = (o) => {
        firing = o.source;
        return spawn0(o);
      };
      if (wave) {
        g.waves.state = 'intermission';
        g.waves.timer = 0;
      }
      let none = 0;
      let waits = 0;
      let waitLaserOff = 0;
      let waitFired = 0;
      let mostLines = 0;
      let busiest = -1;
      for (let i = 0; i < seconds * 120; i++) {
        firing = null;
        window.step();
        if (firing) shots.push([i, g.enemies.list.indexOf(firing)]);
        const { lines, spot } = window.spotNow();
        if (!spot) none++;
        if (lines > mostLines) {
          mostLines = lines;
          busiest = i;
        }
        for (const e of g.enemies.list) {
          if (!e.alive || !e.gapWait) continue;
          waits++;
          if (!e.laser.mesh.visible && e.state === 'aim') waitLaserOff++;
          if (firing === e) waitFired++;
        }
      }
      g.bullets.spawn = spawn0;
      return { none, waits, waitLaserOff, waitFired, shots, mostLines, busiest, wave: g.waves.wave };
    };
  });
});
after(async () => {
  await h.close();
});

test('the geometry: no fire, the spot is where the player stands; a line through him, the spot is beside it; lines a step apart all over, no spot; a round long gone is no line of fire, one just past still is', async () => {
  const r = await page.evaluate(() => {
    const { fireLines, safeSpot } = window.gaps;
    const open = () => true;
    const opts = { reach: 3, gap: 1.2, walkable: open };
    const none = safeSpot([], 0, 0, opts);
    const through = safeSpot([[0, -10, 0, 1]], 0, 0, opts); // from the north, straight at him
    const dense = [];
    for (let x = -4; x <= 4; x += 0.5) dense.push([x, -10, 0, 1]);
    const noSpot = safeSpot(dense, 0, 0, opts);
    const lines = fireLines(
      [
        { owner: 'enemy', x: 0, z: -3, dx: 0, dz: 1 }, // coming
        { owner: 'enemy', x: 0, z: 3, dx: 0, dz: 1 }, // just gone by: still on its way through the ground by him
        { owner: 'enemy', x: 0, z: 7, dx: 0, dz: 1 }, // long gone
        { owner: 'enemy', x: 20, z: 0, dx: 0, dz: 1 }, // far off to the side
        { owner: 'player', x: 0, z: -3, dx: 0, dz: 1 }, // his own
      ],
      0,
      0,
      6,
    );
    return { none, through, noSpot, lines };
  });
  assert.deepEqual(r.none, { x: 0, z: 0 });
  assert.ok(r.through && Math.abs(r.through.x) >= 0.6 && Math.abs(r.through.x) <= 1, `beside the line: ${JSON.stringify(r.through)}`);
  assert.equal(r.noSpot, null);
  assert.deepEqual(r.lines, [[0, -3, 0, 1], [0, 3, 0, 1]]);
});

test('a wave in the room, the player standing still: at every step there is a clear spot by him; the same seed, the same fire', { timeout: 10 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    window.toRoom(0, 5);
    const a = window.runWave(30);
    window.toRoom(0, 5);
    const b = window.runWave(30);
    return { a, b };
  });
  assert.equal(r.a.wave, 1, 'the first wave');
  assert.equal(r.a.none, 0, `steps with no clear spot by the player: ${r.a.none} of ${30 * 120}`);
  assert.equal(r.a.waitFired, 0, 'nobody fired while he waited');
  assert.deepEqual(r.a.shots, r.b.shots, 'the same seed, the same shots at the same steps');
  console.log(`# wave 1 for 30 s: ${r.a.shots.length} shots, ${r.a.waits} man-steps held for the gap (the far side fires from one way: a sidestep is always there), ${r.a.mostLines} lines of fire at most (step ${r.a.busiest})`);
});

test('six shotgunners round the player, their fans from every side: the gate makes some hold their aim, laser on, firing nothing while they wait, and a clear spot stays at every step; the gate off, no one waits and the spot is gone at times', { timeout: 10 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const { HELL } = window.gaps;
    // six at once, ready together: their fans cover all but 28° either way, and 2 m out that is no room for the spot
    const ring = () => {
      window.toRoom(0, 0);
      for (let i = 0; i < 6; i++) window.put('shotgun', Math.sin((i / 6) * Math.PI * 2) * 5, Math.cos((i / 6) * Math.PI * 2) * 5, 0);
    };
    ring();
    const on = window.runWave(12, false);
    const gap = HELL.gap;
    HELL.gap = 0;
    ring();
    const off = window.runWave(12, false);
    HELL.gap = gap;
    return { on, off, gap: HELL.gap };
  });
  assert.equal(r.gap, 1.2, 'put back');
  assert.ok(r.on.waits > 0, 'someone held his aim for the gap');
  assert.equal(r.on.waitLaserOff, 0, 'his laser stayed on while he waited');
  assert.equal(r.on.waitFired, 0, 'and he fired nothing while he waited');
  assert.equal(r.on.none, 0, `with the gate, steps with no clear spot: ${r.on.none}`);
  assert.equal(r.off.waits, 0, 'the gate off: nobody waits');
  assert.ok(r.off.none > 0, `and the spot is gone at times (${r.off.none} steps)`);
  console.log(`# six shotgunners for 12 s: with the gate ${r.on.shots.length} shots, ${r.on.waits} man-steps held, no step without a spot; without it ${r.off.shots.length} shots, ${r.off.none} steps with no spot`);
});

test('screenshot: six shotgunners round the player, some holding their aim for the gap while the others’ fans fly, the player in bullet time', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom(0, 0);
    for (let i = 0; i < 6; i++) window.put('shotgun', Math.sin((i / 6) * Math.PI * 2) * 5, Math.cos((i / 6) * Math.PI * 2) * 5, 0);
    const hurt0 = g.player.hurt;
    g.player.hurt = () => false;
    for (let i = 0; i < 120 * 12; i++) {
      window.step();
      if (i > 60 && g.enemies.list.some((e) => e.alive && e.gapWait) && g.bullets.list.filter((b) => b.owner === 'enemy').length >= 10) break;
    }
    g.player.hurt = hurt0;
    g.hurtFx = 0;
    g.setFocus(true);
    g.focusAmt = 1;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('hell-gap.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
