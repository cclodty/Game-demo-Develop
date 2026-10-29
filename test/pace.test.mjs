// 試玩回饋 ⑤ (2026-10-28): the developer found the men in a room slow to start ("most of them stand idle a while after
// coming in, so a room is wiped quickly") and asked for twice the speed and reaction. In a room (config.js HELL) a man
// walks HELL.moveMul × his type's speed but never past HELL.speedCap × the player's (he can still be outrun), aims in
// HELL.aimMul × the time, waits HELL.firstMul × as long before his first shot, and on his way to his post fires when he
// sees the player (HELL.walkFire). Outside rooms (the legacy modes) nothing changes. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=62'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run in the first floor's second room (the banquet room), the player at (x, z), nobody about. */
    window.quiet = (x = 0, z = 4) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'banquet';
      g.floor = g.floors.flat();
      g.stage = 1;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.setFocus(false);
      g.player.placeAtStart();
      g.player.x = x;
      g.player.z = z;
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** 120 Hz steps, the player kept whole and where he is. */
    window.play = (n) => {
      const p = g.player;
      const [x, z] = [p.x, p.z];
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        p.hp = 100;
        p.invuln = 0;
        g.aimPoint.set(p.x, g.aimPoint.y, p.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
        p.x = x;
        p.z = z;
      }
    };
    /**
     * Men of `types` in by the room's doors at once, the player at (0, 4): for each, the seconds from coming in to his
     * first aim and to his first shot, with `hell` set on HELL for the run (restored after).
     */
    window.firstAims = async (types, hell) => {
      const { HELL } = await import('./src/config.js');
      const keep = Object.fromEntries(Object.keys(hell).map((k) => [k, HELL[k]]));
      Object.assign(HELL, hell);
      window.quiet(0, 4);
      const men = types.map((t, i) => g.enemies.spawn(t, g.level.spawns[i % g.level.spawns.length]));
      const aim = men.map(() => -1);
      const fire = men.map(() => -1);
      for (let i = 0; i < 120 * 12 && fire.some((t) => t < 0); i++) {
        window.play(1);
        men.forEach((e, k) => {
          if (aim[k] < 0 && e.state === 'aim') aim[k] = i / 120;
          if (fire[k] < 0 && e.state === 'fire') fire[k] = i / 120;
        });
      }
      Object.assign(HELL, keep);
      return { aim, fire };
    };
  });
});
after(async () => {
  await h.close();
});

test('in a room every man walks twice his type’s speed, capped at 0.9 of the player’s, and aims in half the time (a barrage’s tell as long as ever); in the arcade, as ever', async () => {
  const r = await page.evaluate(async () => {
    const { HELL, PLAYER } = await import('./src/config.js');
    const { TYPES, WEAPONS } = await import('./src/enemies.js');
    const g = window.game;
    const types = ['grunt', 'shotgun', 'rifle', 'rusher', 'tumbler', 'captain', 'brute', 'shield', 'bomber', 'grenadier', 'volleyer', 'blaster', 'hoser', 'ringer'];
    const at = (mode) => {
      g.setRules('normal', []);
      g.setMode(mode);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      const sp = g.level.spawns[0];
      return Object.fromEntries(
        types.map((t) => {
          const e = g.enemies.spawn(t, sp);
          const out = { speed: e.speed, aim: e.aimTime };
          g.enemies.clear();
          return [t, out];
        }),
      );
    };
    const patterns = types.filter((t) => WEAPONS[TYPES[t].weapon] && WEAPONS[TYPES[t].weapon].pattern);
    return { room: at('danmaku'), arcade: at('arcade'), patterns, base: Object.fromEntries(types.map((t) => [t, TYPES[t].speed])), cap: PLAYER.speed * HELL.speedCap, HELL: { moveMul: HELL.moveMul, aimMul: HELL.aimMul } };
  });
  assert.deepEqual(r.HELL, { moveMul: 2, aimMul: 0.5 });
  for (const [t, base] of Object.entries(r.base)) {
    const want = Math.min(base * 2, Math.max(base, r.cap));
    assert.ok(Math.abs(r.room[t].speed - want) < 1e-9, `${t}: ${r.room[t].speed} m/s in a room (${base} × 2, capped at ${r.cap.toFixed(2)})`);
    assert.ok(r.room[t].speed <= Math.max(base, r.cap) + 1e-9, `${t}: never past the cap`);
    assert.equal(r.arcade[t].speed, base, `${t}: the arcade's own`);
    const k = r.patterns.includes(t) ? 1 : 0.5; // a barrage's tell keeps its time
    if (r.arcade[t].aim > 0) assert.ok(Math.abs(r.room[t].aim / r.arcade[t].aim - k) < 1e-9, `${t}: aims in ${k === 1 ? 'the same' : 'half the'} time (${r.room[t].aim.toFixed(3)} / ${r.arcade[t].aim.toFixed(3)})`);
  }
  assert.ok(r.room.rusher.speed < 7.4 && r.room.bomber.speed < 7.4, 'the blade and the bomber can still be outrun');
  assert.deepEqual(problems(logs), []);
});

test('in by the doors, the men aim and fire in half the time they took before (the same room, the same seed)', async () => {
  const r = await page.evaluate(async () => {
    const types = ['grunt', 'rifle', 'shotgun', 'grunt'];
    const before = await window.firstAims(types, { moveMul: 1, aimMul: 1, firstMul: 1, walkFire: false });
    const now = await window.firstAims(types, {});
    return { before, now };
  });
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(r.before.fire.every((t) => t > 0) && r.now.fire.every((t) => t > 0), `everyone fired: ${JSON.stringify(r)}`);
  const [b, n] = [mean(r.before.fire), mean(r.now.fire)];
  assert.ok(n <= b * 0.5, `the first shot after ${n.toFixed(2)} s, before ${b.toFixed(2)} s (at most half)`);
  assert.ok(mean(r.now.aim) <= mean(r.before.aim) * 0.5, `the first aim after ${mean(r.now.aim).toFixed(2)} s, before ${mean(r.before.aim).toFixed(2)} s`);
  assert.deepEqual(problems(logs), []);
});

test('on his way to his post he aims and fires when he sees the player; with HELL.walkFire off he holds his fire till he is there', async () => {
  const r = await page.evaluate(async () => {
    const { HELL } = await import('./src/config.js');
    const g = window.game;
    const run = (walkFire) => {
      HELL.walkFire = walkFire;
      window.quiet(0, 4);
      const e = g.enemies.spawn('grunt', g.level.spawns[0]);
      let onWay = false;
      let held = false;
      for (let i = 0; i < 120 * 8 && !held; i++) {
        window.play(1);
        if (e.state === 'hold') held = true;
        else if ((e.state === 'aim' || e.state === 'fire') && e.post) onWay = true;
      }
      HELL.walkFire = true;
      return { onWay, held };
    };
    return { on: run(true), off: run(false) };
  });
  assert.equal(r.on.onWay, true, 'he fires on the way');
  assert.equal(r.off.onWay, false, 'with it off, not before his post');
  assert.equal(r.off.held, true, 'and he reaches his post');
  assert.deepEqual(problems(logs), []);
});

test('the stats panel tunes the walk and the aim live, read where they are used', async () => {
  const r = await page.evaluate(async () => {
    const { TUNABLES } = await import('./src/notes.js');
    const g = window.game;
    window.quiet(0, 4);
    const e = g.enemies.spawn('grunt', g.level.spawns[0]);
    const before = { speed: e.speed, aim: e.aimTime };
    g.notes.tune('HELL.moveMul', 1.5);
    g.notes.tune('HELL.aimMul', 1);
    const tuned = { speed: e.speed, aim: e.aimTime };
    g.notes.resetTuning();
    return { paths: TUNABLES.map((t) => t.path), before, tuned, reset: { speed: e.speed, aim: e.aimTime }, base: e.cfg.speed };
  });
  assert.ok(r.paths.includes('HELL.moveMul') && r.paths.includes('HELL.aimMul'), 'on the panel');
  assert.ok(Math.abs(r.tuned.speed - r.base * 1.5) < 1e-9, `the walk at once (${r.tuned.speed})`);
  assert.ok(Math.abs(r.tuned.aim / r.before.aim - 2) < 1e-9, 'the aim at once');
  assert.deepEqual(r.reset, r.before, 'back to config.js');
  assert.deepEqual(problems(logs), []);
});
