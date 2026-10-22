// 手機版 ①: on a phone (a coarse pointer) the game plays by touch. A stick under
// the left thumb moves (the WASD the logic already reads), one under the right
// aims where it points and fires while it is pushed (the aim and the fire
// button), and holding 子彈時間 is bullet time for as long as it is held. Nothing
// new is recorded: a touch run's record replays step for step. A phone starts on
// low quality. A desktop without touch is as it was. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

const PHONE = { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true };

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=31', PHONE));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A finger on the touch layer (what a phone's browser sends for a touch): its pointer events, on `id` or the layer. */
    window.finger = (type, n, x, y, on = 'touch') =>
      document.getElementById(on).dispatchEvent(new window.PointerEvent(type, { pointerId: n, pointerType: 'touch', isPrimary: n === 1, clientX: x, clientY: y, bubbles: true }));
    /** Display frames of play, as the page's loop runs them (the touch and the aim read once a frame); `raw`: no kill-cam or hit-stop cut short (what a replay sees). */
    window.frames = (n, raw = false) => {
      for (let i = 0; i < n; i++) {
        if (!raw) {
          g.killcamT = 0;
          g.hitstopT = 0;
        }
        g.pollTouch();
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
    window.quiet = () => {
      g.setMode('arcade');
      g.setRules('normal', []);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.player.hp = 100;
    };
  });
});
after(async () => {
  await h.close();
});

test('a phone: the touch layer is up during a run and the quality starts low; a desktop has no touch layer and keeps its quality', async () => {
  const phone = await page.evaluate(() => {
    const g = window.game;
    window.quiet();
    const layer = document.getElementById('touch');
    return { touch: g.touchOn, quality: g.quality, shown: getComputedStyle(layer).display !== 'none', focus: !!document.getElementById('touch-focus') };
  });
  assert.deepEqual(phone, { touch: true, quality: 'low', shown: true, focus: true });
  const desk = await h.open('?seed=31');
  try {
    const r = await desk.page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      g.startRun(0);
      return { touch: g.touchOn, quality: g.quality, shown: getComputedStyle(document.getElementById('touch')).display !== 'none' };
    });
    assert.deepEqual(r, { touch: false, quality: 'high', shown: false });
    assert.deepEqual(problems(desk.logs), []);
  } finally {
    await desk.page.close();
  }
  assert.deepEqual(problems(logs), []);
});

test('the left stick moves (up the screen is W); the right aims where it points and fires while pushed; let go and the firing stops', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.quiet();
    const p = g.player;
    const z0 = p.z;
    // left thumb: down, then up the screen
    window.finger('pointerdown', 1, 150, 260);
    window.finger('pointermove', 1, 150, 190);
    window.frames(20);
    const moving = { w: g.cmd.down('KeyW'), s: g.cmd.down('KeyS'), a: g.cmd.down('KeyA'), d: g.cmd.down('KeyD'), dz: p.z - z0 };
    window.finger('pointerup', 1, 150, 190);
    window.frames(4);
    const stopped = g.cmd.down('KeyW', 'KeyA', 'KeyS', 'KeyD');
    // right thumb: down, then to the right of the screen
    const ammo0 = p.ammo;
    window.finger('pointerdown', 2, 640, 260);
    window.finger('pointermove', 2, 710, 260);
    window.frames(30);
    const c = Math.cos(g.camYaw);
    const n = Math.sin(g.camYaw);
    const ax = g.cmd.aim.x - p.x;
    const az = g.cmd.aim.z - p.z;
    const l = Math.hypot(ax, az) || 1;
    const aiming = { fire: g.cmd.mouse.left, along: (ax * c - az * n) / l, fired: p.ammo < ammo0 || p.reloadT > 0 };
    window.finger('pointerup', 2, 710, 260);
    window.frames(4);
    return { moving, stopped, aiming, after: g.cmd.mouse.left };
  });
  assert.deepEqual([r.moving.w, r.moving.s, r.moving.a, r.moving.d], [true, false, false, false], 'up the screen is W alone');
  assert.ok(Math.abs(r.moving.dz) > 0.5, `the player moved (${r.moving.dz.toFixed(2)} m along z)`);
  assert.equal(r.stopped, false, 'let go: no movement key held');
  assert.equal(r.aiming.fire, true, 'pushing the right stick holds the trigger');
  assert.equal(r.aiming.fired, true, 'and the guns fire');
  assert.ok(r.aiming.along > 0.9, `the aim is where the stick points (${r.aiming.along.toFixed(2)})`);
  assert.equal(r.after, false, 'let go: the firing stops');
  assert.deepEqual(problems(logs), []);
});

test('holding 子彈時間 is bullet time while it is held; let go and time runs again', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.quiet();
    g.focusMeter = 1e9;
    window.finger('pointerdown', 3, 780, 120, 'touch-focus');
    window.frames(30);
    const held = g.focusActive;
    window.frames(30);
    const still = g.focusActive;
    window.finger('pointerup', 3, 780, 120, 'touch-focus');
    window.frames(10);
    return { held, still, after: g.focusActive };
  });
  assert.deepEqual(r, { held: true, still: true, after: false });
  assert.deepEqual(problems(logs), []);
});

test('a touch run replays step for step from its record', { timeout: 300000 }, async () => {
  const live = await page.evaluate(() => {
    const g = window.game;
    g.setMode('arcade');
    g.setRules('normal', []);
    g.startRun(1);
    window.trace = [];
    const step0 = g.step.bind(g);
    g.step = () => {
      step0();
      window.trace.push([g.score.score, g.player.x, g.player.z, g.player.hp]);
    };
    // thumbs going round: the left one circles, the right one turns and fires, bullet time held a while
    window.finger('pointerdown', 1, 150, 260);
    window.finger('pointerdown', 2, 640, 260);
    for (let f = 0; f < 900; f++) {
      const a = f / 40;
      window.finger('pointermove', 1, 150 + Math.cos(a) * 50, 260 + Math.sin(a) * 50);
      window.finger('pointermove', 2, 640 + Math.cos(a * 0.7) * 60, 260 + Math.sin(a * 0.7) * 60);
      if (f === 300) window.finger('pointerdown', 3, 780, 120, 'touch-focus');
      if (f === 420) window.finger('pointerup', 3, 780, 120, 'touch-focus');
      window.frames(1, true);
      if (g.state !== 'playing') break;
    }
    window.finger('pointerup', 1, 150, 260);
    window.finger('pointerup', 2, 640, 260);
    return { trace: window.trace, bytes: Array.from(g.record.encode()), steps: g.stepCount };
  });
  const again = await page.evaluate(async (bytes) => {
    const g = window.game;
    const { RecordReader } = await import('/src/replay.js');
    const { MODE_IDS } = await import('/src/waves.js');
    const { unpackRules } = await import('/src/rules.js');
    const rd = new RecordReader(Uint8Array.from(bytes));
    g.fixedSeed = rd.seed;
    g.fixedWarmup = rd.warmup;
    g.fixedRules = unpackRules(rd.rules);
    g.setMode(MODE_IDS[rd.mode]);
    g.startRun(rd.map);
    g.feed = (game) => rd.next(game.player.x, game.player.z);
    window.trace = [];
    while (g.stepCount < rd.steps - 8 && (g.state === 'playing' || g.state === 'dying')) g.updatePlay(1 / 60);
    g.feed = null;
    return { trace: window.trace };
  }, live.bytes);
  assert.ok(live.steps > 1500, `a long enough run (${live.steps} steps)`);
  const n = again.trace.length;
  assert.ok(n > 1500);
  assert.deepEqual(again.trace, live.trace.slice(0, n), 'the replay plays the touch run step for step');
  assert.deepEqual(problems(logs), []);
});

test('screenshot: a phone held sideways, both thumbs down', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.quiet();
    for (const [x, z] of [
      [6, -6],
      [-5, -8],
    ]) {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
    }
    window.finger('pointerdown', 1, 150, 260);
    window.finger('pointermove', 1, 130, 220);
    window.finger('pointerdown', 2, 640, 260);
    window.finger('pointermove', 2, 690, 220);
    window.frames(20);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('touch-phone.png', OUT).pathname });
  await page.evaluate(() => {
    window.finger('pointerup', 1, 130, 220);
    window.finger('pointerup', 2, 690, 220);
  });
  assert.deepEqual(problems(logs), []);
});
