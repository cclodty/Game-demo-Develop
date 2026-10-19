// Gamepads (手掣): a pad in the standard layout drives the same controls as
// the keyboard and mouse. The left stick moves (as WASD), the right stick aims
// (the aim offset, pulled onto the nearest enemy within 6°), RT fires, LB and RB
// together toggle bullet time, LT is the right mouse button (split aim), A spin,
// B slide, X kick, Y throw, LB alone reloads and RB alone takes the other weapon
// (when let go), the d-pad's up swaps for a floor weapon, Start pauses. All of it
// goes through StepInput, so a pad run records and replays like any other.
// While a pad is connected the hint bar, the warm-up and the prompts name the
// pad's buttons. The tests hand the page a fake navigator.getGamepads.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

/** Two [x, z] offsets within 5 cm (the record keeps the aim in 2 cm units). */
const near = (a, b, msg) => assert.ok(Math.abs(a[0] - b[0]) <= 0.05 && Math.abs(a[1] - b[1]) <= 0.05, `${msg}: ${a} against ${b}`);

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** A fake standard pad (window.pad; window.pads is what navigator.getGamepads returns) and frame helpers. */
const install = (page) =>
  page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    const pad = { id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.pad = pad;
    window.pads = [pad];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.pads });
    window.press = (i, on = true) => (pad.buttons[i] = { pressed: on, value: on ? 1 : 0 });
    window.stick = (x, y, right = false) => {
      pad.axes[right ? 2 : 0] = x;
      pad.axes[right ? 3 : 1] = y;
    };
    /** n display frames at 60 Hz, as the real loop runs them: the pad, the aim, the logic. */
    window.frames = (n = 1, hp = true) => {
      for (let i = 0; i < n; i++) {
        if (hp) g.player.hp = 100;
        g.pollPad();
        if (g.state === 'paused') continue;
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
    /** A quiet run on `map`: nobody about. */
    window.run = (map) => {
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.player.x = 0;
      g.player.z = 3;
      g.killcamT = 0;
      g.hitstopT = 0;
      g.setFocus(false);
    };
    window.rel = () => [Math.round((g.cmd.aim.x - g.player.x) * 100) / 100, Math.round((g.cmd.aim.z - g.player.z) * 100) / 100];
  });

test('the sticks move and aim, RT fires, the aim leans onto an enemy within 6°, and the buttons do their jobs', async () => {
  const { page, logs } = await h.open('?seed=21');
  try {
    await install(page);
    const r = await page.evaluate(async () => {
      const g = window.game;
      const { PAD } = await import('/src/config.js');
      window.run(1);
      window.frames(2);
      // up the stick is up the screen: in the world, turned by the camera's yaw (the 45° view is diagonal)
      const c = Math.cos(g.camYaw);
      const n = Math.sin(g.camYaw);
      const world = (sx, sy, k = 1) => [(sx * c + sy * n) * k, (-sx * n + sy * c) * k];
      const out = { up: world(0, -1, PAD.aimDistance), right: world(1, 0, PAD.aimDistance) };
      // the left stick, past its dead zone: right; inside it: nothing
      const x0 = g.player.x;
      window.stick(0.9, 0.1);
      window.frames(30);
      const [rx, rz] = world(1, 0);
      const mx = g.player.x - x0;
      const mz = g.player.z - 3;
      out.move = { along: mx * rx + mz * rz, across: mx * rz - mz * rx, keys: [g.cmd.down('KeyD'), g.cmd.down('KeyW'), g.cmd.down('KeyS')] };
      window.stick(0.2, -0.2);
      g.player.vx = g.player.vz = 0;
      const x1 = g.player.x;
      window.frames(30);
      out.dead = Math.abs(g.player.x - x1) + Math.abs(g.cmd.keys & 0xf);
      window.stick(0, 0);
      g.player.x = 0;
      g.player.z = 3;
      // the right stick: up the screen, then right; let go and the aim stays
      window.stick(0, -1, true);
      window.frames(2);
      out.aimUp = window.rel();
      window.stick(1, 0, true);
      window.frames(2);
      out.aimRight = window.rel();
      window.stick(0, 0, true);
      window.frames(2);
      out.kept = window.rel();
      // RT: fire (pistols: 30 rounds)
      const ammo = g.player.ammo;
      window.press(7);
      window.frames(20);
      window.press(7, false);
      out.fired = ammo - g.player.ammo;
      out.bullets = g.bullets.list.filter((b) => b.alive && b.owner === 'player').length;
      // the aim leaning onto an enemy: one 4° off the stick, one 10° off
      window.run(1);
      g.player.vx = g.player.vz = 0;
      const [ux, uz] = world(0, -1);
      const at = (deg, d) => {
        const a = (deg * Math.PI) / 180;
        const x = (ux * Math.cos(a) - uz * Math.sin(a)) * d;
        const z = 3 + (ux * Math.sin(a) + uz * Math.cos(a)) * d;
        const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
        e.spawnLock = 0;
        e.fireCd = 99;
        return e;
      };
      const four = at(4, 7);
      window.stick(0, -1, true);
      window.frames(2);
      out.assist = { aim: window.rel(), enemy: [Math.round(four.x * 100) / 100, Math.round((four.z - 3) * 100) / 100] };
      g.enemies.clear();
      at(10, 7);
      window.frames(2);
      out.noAssist = window.rel();
      g.enemies.clear();
      window.stick(0, 0, true);
      // what each step was handed: bullet time, reload, the other weapon, the right button
      const seen = [];
      const step0 = g.step.bind(g);
      g.step = (...a) => {
        for (const [k, c] of [['both', 'KeyQ'], ['lb', 'KeyR'], ['rb', 'WheelDown']]) if (g.cmd.hit(c)) seen.push(k);
        step0(...a);
      };
      const took = () => seen.splice(0);
      // LB, then RB while LB is down: bullet time, and neither LB's nor RB's own job when they are let go
      g.player.ammo = 5;
      window.press(4);
      window.frames(2);
      window.press(5);
      window.frames(2);
      window.press(4, false);
      window.press(5, false);
      window.frames(2);
      out.focus = g.focusActive;
      out.chord = took();
      window.press(4);
      window.press(5);
      window.frames(2);
      window.press(4, false);
      window.press(5, false);
      window.frames(2);
      out.focusOff = g.focusActive;
      took();
      // LB alone: reload, when let go; RB alone: the other weapon, when let go
      window.press(4);
      window.frames(3);
      out.lbHeld = took();
      window.press(4, false);
      window.frames(1);
      out.lbLetGo = took();
      out.reloading = g.player.reloadT > 0;
      window.press(5);
      window.frames(3);
      out.rbHeld = took();
      window.press(5, false);
      window.frames(1);
      out.rbLetGo = took();
      // LT: the right mouse button, held
      window.press(6);
      window.frames(2);
      out.lt = g.cmd.mouse.right;
      window.press(6, false);
      window.frames(2);
      out.ltOff = g.cmd.mouse.right;
      g.step = step0;
      // A spins; Start pauses and resumes
      window.press(0);
      window.frames(2);
      window.press(0, false);
      out.spin = g.player.spinning;
      window.frames(60);
      window.press(9);
      window.frames(1);
      window.press(9, false);
      out.paused = g.state;
      window.frames(1);
      window.press(9);
      window.frames(1);
      window.press(9, false);
      out.resumed = g.state;
      return out;
    });
    assert.ok(r.move.along > 1.5, `the stick moved the player right on the screen (${r.move.along} m)`);
    assert.ok(Math.abs(r.move.across) < 0.05, `and only right (${r.move.across} m across)`);
    assert.deepEqual(r.move.keys, [true, false, false], 'as D');
    assert.equal(r.dead, 0, 'a stick inside its dead zone does nothing');
    near(r.aimUp, r.up, 'up the screen');
    near(r.aimRight, r.right, 'right');
    near(r.kept, r.right, 'let go: the aim stays');
    assert.ok(r.fired > 0 && r.bullets > 0, `RT fired (${r.fired} rounds)`);
    near(r.assist.aim, r.assist.enemy, 'within 6°: on the enemy');
    near(r.noAssist, r.up, 'at 10°: straight on');
    assert.equal(r.focus, true, 'LB+RB: bullet time');
    assert.deepEqual(r.chord, ['both'], 'together: bullet time only, no reload, no weapon switch');
    assert.equal(r.focusOff, false, 'LB+RB again: off');
    assert.deepEqual([r.lbHeld, r.lbLetGo, r.reloading], [[], ['lb'], true], 'LB alone: reload when let go');
    assert.deepEqual([r.rbHeld, r.rbLetGo], [[], ['rb']], 'RB alone: the other weapon when let go');
    assert.deepEqual([r.lt, r.ltOff], [true, false], 'LT: the right mouse button while held');
    assert.equal(r.spin, true, 'A: spin');
    assert.equal(r.paused, 'paused', 'Start: pause');
    assert.equal(r.resumed, 'playing', 'Start again: on');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('a pad run is recorded through StepInput and replays step for step', { timeout: 300000 }, async () => {
  const { page, logs } = await h.open('?seed=22');
  try {
    await install(page);
    const live = await page.evaluate(() => {
      const g = window.game;
      window.trace = [];
      const step0 = g.step.bind(g);
      g.step = () => {
        step0();
        window.trace.push([g.score.score, g.player.x, g.player.z, g.player.ammo]);
      };
      g.startRun(0);
      // 20 s: the left stick circles, the right stick sweeps, RT in bursts, A, LB+RB and LT now and then
      for (let f = 0; f < 1200 && g.state === 'playing'; f++) {
        const t = f / 60;
        window.stick(Math.cos(t * 0.9), Math.sin(t * 0.9));
        window.stick(Math.cos(t * 2.3), Math.sin(t * 2.3), true);
        window.press(7, f % 50 < 30);
        window.press(0, f % 240 === 100);
        window.press(4, f % 400 === 200); // LB+RB: bullet time
        window.press(5, f % 400 === 200);
        window.press(6, f % 300 > 250); // LT: split aim now and then
        window.frames(1, false);
      }
      return { trace: window.trace, bytes: Array.from(g.record.encode()), steps: g.stepCount };
    });
    assert.ok(live.steps > 2000, `${live.steps} steps`);
    assert.ok(new Set(live.trace.map((s) => s[3])).size > 3, 'it fired');
    const again = await page.evaluate(async (bytes) => {
      const g = window.game;
      const { RecordReader } = await import('/src/replay.js');
      const { unpackRules } = await import('/src/rules.js');
      const rd = new RecordReader(Uint8Array.from(bytes));
      g.fixedSeed = rd.seed;
      g.fixedWarmup = rd.warmup;
      g.fixedRules = unpackRules(rd.rules);
      window.pads = []; // the pad is gone: only the record plays
      g.startRun(rd.map);
      g.feed = (game) => rd.next(game.player.x, game.player.z);
      window.trace = [];
      while (g.stepCount < rd.steps - 8 && g.state === 'playing') {
        g.pollPad();
        g.updateAim();
        g.updatePlay(1 / 60);
      }
      g.feed = null;
      return window.trace;
    }, live.bytes);
    assert.ok(again.length > 2000);
    for (let i = 0; i < again.length; i++) assert.deepEqual(again[i], live.trace[i], `step ${i}`);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('connecting a pad switches the hints to its buttons; unplugging switches them back; the run’s record says which', async () => {
  const { page, logs } = await h.open('?seed=23&tutorial=1');
  try {
    await install(page);
    const read = () =>
      page.evaluate(() => {
        const g = window.game;
        g.hud.update(1 / 60);
        const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
        return {
          pad: document.body.classList.contains('pad'),
          keysBar: shown('hint'),
          padBar: shown('hint-pad'),
          tutorial: document.getElementById('tutorial').textContent,
          focusKey: document.querySelector('.bar-label .key').innerText,
          prompt: document.getElementById('prompt').textContent,
        };
      });
    // a first run: the warm-up, whose first enemy is about to aim
    await page.evaluate(() => {
      window.pads = [];
      const g = window.game;
      g.startRun(1);
      g.tutorial.hint = '';
      let n = 0;
      while (!g.tutorial.hint && n++ < 600) window.frames(1);
    });
    const keys = await read();
    assert.deepEqual([keys.pad, keys.keysBar, keys.padBar], [false, true, false]);
    assert.match(keys.tutorial, /按 Shift 或 Q 進入子彈時間/);
    assert.equal(keys.focusKey, 'Shift / Q');
    await page.evaluate(() => {
      window.pads = [window.pad];
      window.frames(1);
    });
    const pad = await read();
    assert.deepEqual([pad.pad, pad.keysBar, pad.padBar], [true, false, true]);
    assert.match(pad.tutorial, /按 LB\+RB 進入子彈時間/);
    assert.equal(pad.focusKey, 'LB+RB');
    await page.evaluate(() => window.game.render());
    await page.screenshot({ path: new URL('pad-hints.png', OUT).pathname });
    // a prompt: by a pan
    const prompt = await page.evaluate(() => {
      const g = window.game;
      const pan = g.level.pans[0];
      g.tutorial.stop();
      g.enemies.clear();
      g.player.x = pan.x + 0.6;
      g.player.z = pan.z;
      window.frames(2);
      g.hud.update(1 / 60);
      return document.getElementById('prompt').textContent;
    });
    assert.match(prompt, /^十字鍵 ↑ 拿起/); // the pad's pick-up is the swap button (d-pad up)
    // unplugged
    await page.evaluate(() => {
      window.pads = [null];
      window.frames(2);
    });
    const back = await read();
    assert.deepEqual([back.pad, back.keysBar, back.padBar], [false, true, false]);
    assert.equal(back.focusKey, 'Shift / Q');
    assert.match(back.prompt, /^E 拿起/); // E picks up now; G throws
    // the local records say what each run was played with
    const rows = await page.evaluate(() => {
      const g = window.game;
      g.startRun(1); // without the pad
      window.pads = [window.pad];
      window.frames(1);
      g.startRun(1); // with it
      window.frames(1);
      return g.telemetry.runs.slice(-3).map((r) => [r.input, (r.events || []).filter((e) => e.type === 'input').map((e) => e.device)]);
    });
    assert.deepEqual(rows, [
      ['keyboard', ['pad', 'keyboard']],
      ['keyboard', ['pad']],
      ['pad', []],
    ]);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('the pad in use is the last one touched: not a device listed first that only looks like a pad, not a second pad left alone; the title and the export name them', async () => {
  const { page, logs } = await h.open('?seed=25');
  try {
    await install(page);
    const r = await page.evaluate(() => {
      const g = window.game;
      const make = (index, id, mapping, axes, n = 17) => ({ id, index, connected: true, mapping, axes, buttons: Array.from({ length: n }, () => ({ pressed: false, value: 0 })) });
      // what a browser on a gaming PC may list: a mouse with a thumb stick (no standard layout, its
      // triggers resting at -1, one button held all along), a virtual pad a driver left (never
      // moves), then the two real pads
      const mouse = make(0, 'Gaming mouse thumb stick', '', [-1, -1, 0, 0, 0, 0], 8);
      mouse.buttons[0] = { pressed: true, value: 1 };
      const ghost = make(1, 'Virtual pad (STANDARD GAMEPAD Vendor: 0000 Product: 0001)', 'standard', [0, 0, 0, 0]);
      const first = make(2, 'Wireless Controller (STANDARD GAMEPAD Vendor: 1234 Product: 5678)', 'standard', [0, 0, 0, 0]);
      const second = make(3, '1234-9abc-Second Controller', 'standard', [0, 0, 0, 0]);
      const used = () => (g.input.pad ? g.input.pad.index : null);
      const out = {};
      window.pads = [mouse, ghost, first];
      window.run(0);
      window.frames(2);
      out.untouched = { used: used(), title: document.getElementById('pad-name').textContent };
      // the real pad's left stick: it is now the pad in use, and the player walks
      const x0 = g.player.x;
      const z0 = g.player.z;
      first.axes[0] = 0.9;
      window.frames(30);
      out.walked = { used: used(), moved: Math.hypot(g.player.x - x0, g.player.z - z0), title: document.getElementById('pad-name').textContent };
      // its trigger fires
      const ammo = g.player.ammo;
      first.buttons[7] = { pressed: true, value: 1 };
      window.frames(10);
      first.buttons[7] = { pressed: false, value: 0 };
      out.fired = ammo - g.player.ammo;
      // a second pad joins and has A pressed: it takes over; the first's stick, pushed all along, does not take it back
      window.pads = [mouse, ghost, first, second];
      window.frames(1);
      second.buttons[0] = { pressed: true, value: 1 };
      window.frames(1);
      second.buttons[0] = { pressed: false, value: 0 };
      window.frames(5);
      out.second = { used: used(), keys: [...g.input.padKeys], title: document.getElementById('pad-name').textContent };
      // the first pad's stick let go and pushed again: back to the first
      first.axes[0] = 0;
      window.frames(1);
      first.axes[0] = -0.9;
      window.frames(1);
      out.back = used();
      first.axes[0] = 0;
      // the pad in use unplugged: the first standard pad left stands in, never the mouse
      window.pads = [mouse, ghost, second];
      window.frames(1);
      out.unplugged = used();
      // a new device in the unplugged pad's slot is not used until it is touched
      window.pads = [mouse, ghost, make(2, 'Another pad (STANDARD GAMEPAD)', 'standard', [0, 0, 0, 0]), second];
      window.frames(2);
      out.newInSlot = used();
      out.log = g.notes.events.map((e) => e.text).filter((t) => t.startsWith('改用手掣'));
      out.md = g.notes.exportText();
      g.toTitle();
      second.buttons[0] = { pressed: true, value: 1 };
      window.frames(1);
      g.render();
      out.titleName = document.getElementById('pad-name').textContent;
      return out;
    });
    assert.deepEqual(r.untouched, { used: 1, title: '使用中：Virtual pad' }, 'nothing touched yet: the first pad in the standard layout');
    assert.equal(r.walked.used, 2, 'the pad touched is the pad in use');
    assert.ok(r.walked.moved > 1.5, `its stick walks the player (${r.walked.moved.toFixed(2)} m)`);
    assert.equal(r.walked.title, '使用中：Wireless Controller');
    assert.ok(r.fired > 0, `its trigger fires (${r.fired} shots)`);
    assert.deepEqual(r.second, { used: 3, keys: [], title: '使用中：Second Controller' }, 'the second pad, touched last, is in use; the first pad’s held stick does not walk');
    assert.equal(r.back, 2, 'a new push on the first pad takes it back');
    assert.equal(r.unplugged, 1, 'unplugged: the first standard pad left, not the mouse');
    assert.equal(r.newInSlot, 1, 'a new pad in the unplugged one’s slot waits to be touched');
    assert.deepEqual(r.log, ['改用手掣：Wireless Controller', '改用手掣：Second Controller', '改用手掣：Wireless Controller', '改用手掣：Virtual pad']);
    assert.match(r.md, /- 手掣：#0「Gaming mouse thumb stick」（非標準）；使用中 #1「Virtual pad \(STANDARD GAMEPAD Vendor: 0000 Product: 0001\)」（標準佈局）；#2「Another pad \(STANDARD GAMEPAD\)」（標準佈局）；#3「1234-9abc-Second Controller」（標準佈局）/);
    assert.equal(r.titleName, '使用中：Second Controller');
    await page.screenshot({ path: new URL('pad-name.png', OUT).pathname });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
