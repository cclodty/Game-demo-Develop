// Execution (處決): F by an enemy still dazed from a kick or from something
// thrown at him, within 1.2 m, finishes him: a sure kill, EXECUTION +200, a
// quarter of the focus bar back, 0.6 s standing over him, the first 0.3 s
// untouchable. Not dazed, or too far, and F is the usual kick.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=81'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.run = () => {
      g.setRules('normal', []);
      g.startRun(1);
      g.waves.state = 'done';
      g.enemies.clear();
      g.player.x = 0;
      g.player.z = 3;
      g.player.vx = g.player.vz = 0;
      g.setFocus(false);
    };
    window.thug = (x, z) => {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.fireCd = 99;
      return e;
    };
    /** One logic step, aiming at (ax, az), with `keys` held. */
    window.step = (ax, az, keys = []) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.input.keys.clear();
      for (const k of keys) g.input.keys.add(k);
      g.aimPoint.set(ax, g.aimPoint.y, az);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    window.press = (code) => g.input.pressed.add(code);
    /** The movement keys that best head for (tx, tz): W is up the screen, so turned by the camera's yaw. */
    window.toward = (tx, tz) => {
      const c = Math.cos(g.camYaw);
      const n = Math.sin(g.camYaw);
      const dx = tx - g.player.x;
      const dz = tz - g.player.z;
      let best = [];
      let bd = -Infinity;
      for (const ix of [-1, 0, 1]) {
        for (const iz of [-1, 0, 1]) {
          if (!ix && !iz) continue;
          const l = Math.hypot(ix, iz);
          const wx = (ix * c + iz * n) / l;
          const wz = (-ix * n + iz * c) / l;
          const dot = wx * dx + wz * dz;
          if (dot > bd) {
            bd = dot;
            best = [ix > 0 ? 'KeyD' : ix < 0 ? 'KeyA' : '', iz > 0 ? 'KeyS' : iz < 0 ? 'KeyW' : ''].filter(Boolean);
          }
        }
      }
      return best;
    };
  });
});
after(async () => {
  await h.close();
});

test('F on a thug not dazed is a kick; F on him dazed within 1.2 m is an execution: sure kill, EXECUTION +200, focus +0.25, 0.6 s, 0.3 s untouchable', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.run();
    const e = window.thug(0, 2);
    window.step(0, -5);
    // F: he is not dazed, so a kick (he flies off, dazed)
    window.press('KeyF');
    window.step(0, -5);
    const kicked = { alive: e.alive, stun: e.stunT > 0, cause: e.stunCause, kickT: p.kickT > 0 };
    // run after him while he is still dazed (a kick sends him about 3.4 m)
    let n = 0;
    while (Math.hypot(e.x - p.x, e.z - p.z) > 1.0 && e.stunT > 0 && n++ < 240) window.step(e.x, e.z, window.toward(e.x, e.z));
    p.kickCd = 0;
    g.focusMeter = 0.3;
    const near = Math.hypot(e.x - p.x, e.z - p.z);
    const stunLeft = e.stunT;
    const keys = window.toward(e.x, e.z);
    window.press('KeyF');
    window.step(e.x, e.z, keys);
    const at = { x: p.x, z: p.z };
    const right = {
      dead: e.dead,
      execT: p.execT,
      invuln: p.invuln,
      focus: g.focusMeter,
      kill: g.notes.events.map((x) => x.text).filter((t) => t.startsWith('擊殺 THUG')).at(-1),
    };
    // holding the keys does not move him while it lasts; then it is over
    let steps = 0;
    while (p.execT > 0 && steps < 200) {
      window.step(0, -5, keys);
      steps++;
    }
    const moved = Math.hypot(p.x - at.x, p.z - at.z);
    return { kicked, near, stunLeft, right, steps: steps / 120, moved };
  });
  assert.deepEqual(r.kicked, { alive: true, stun: true, cause: 'kick', kickT: true }, 'not dazed: F kicks');
  assert.ok(r.near <= 1.2 && r.stunLeft > 0, `close (${r.near.toFixed(2)} m) and still dazed (${r.stunLeft.toFixed(2)} s)`);
  assert.equal(r.right.dead, true, 'a sure kill');
  assert.match(r.right.kill, /EXECUTION/);
  assert.ok(Math.abs(r.right.execT - 0.6) < 1e-6, `0.6 s (${r.right.execT})`);
  assert.ok(r.right.invuln >= 0.3 - 1e-6, `untouchable for 0.3 s (${r.right.invuln})`);
  // (plus the step's own slow refill, a fraction of a thousandth)
  assert.ok(Math.abs(r.right.focus - (0.3 + 0.25)) < 0.001, `a quarter of the focus bar back (${r.right.focus})`);
  assert.ok(Math.abs(r.steps - 0.6) <= 1 / 120 + 1e-9, `standing for 0.6 s (${r.steps})`);
  assert.ok(r.moved < 0.05, `held in place while it lasts (${r.moved})`);
});

test('dazed by a throw: an execution too; too far, or dazed by a blast: a kick; a drone never', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const out = {};
    // a thug hit by a thrown pan is dazed: execution
    window.run();
    let e = window.thug(0, 2.2);
    window.step(0, -5);
    g.thrown.hitEnemy(e, { x: 0, z: 3 }, 0);
    p.kickCd = 0;
    window.press('KeyF');
    window.step(e.x, e.z);
    out.thrown = { cause: e.stunCause, dead: e.dead };
    // dazed by a kick but 1.5 m away: a kick
    window.run();
    e = window.thug(0, 1.5);
    e.kick(0, -1, 0.01);
    window.step(0, -5);
    p.kickCd = 0;
    window.press('KeyF');
    window.step(0, -5);
    out.far = { dead: e.dead, kicked: p.kickT > 0 };
    // dazed by a blast: not a knock-down to finish
    window.run();
    e = window.thug(0, 2);
    e.blast(0, -1, 0, false);
    window.step(0, -5);
    p.kickCd = 0;
    window.press('KeyF');
    window.step(0, -5);
    out.blast = { dead: e.dead, kicked: p.kickT > 0 };
    // a drone overhead, however close
    window.run();
    const d = g.enemies.spawn('drone', { x: 0, z: 2.2, ex: 0, ez: 2.3 });
    d.spawnLock = 0;
    d.fireCd = 99;
    d.stunT = 1;
    d.stunCause = 'kick';
    window.step(0, -5);
    p.kickCd = 0;
    window.press('KeyF');
    window.step(0, -5);
    out.drone = d.alive;
    // the stamp, as it looks
    window.run();
    e = window.thug(0.4, 2.2);
    window.step(0, -5);
    g.render(); // the first picture compiles the shaders (seconds here): before, so the kill feed is still up after
    e.kick(0, -1, 0.01);
    p.kickCd = 0;
    window.press('KeyF');
    window.step(e.x, e.z);
    // a fifth of a second in, the stamp at its lowest; seen as the last kill of a wave is, close up
    for (let i = 0; i < 22; i++) window.step(e.x, e.z);
    g.killcamT = 1;
    g.killcamPos.set(e.x, 0, e.z);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return out;
  });
  await page.waitForTimeout(400); // the kill feed fades in
  await page.screenshot({ path: new URL('execution.png', OUT).pathname });
  assert.deepEqual(r.thrown, { cause: 'throw', dead: true }, 'dazed by a throw: finished');
  assert.deepEqual(r.far, { dead: false, kicked: true }, 'too far: a kick');
  assert.deepEqual(r.blast, { dead: false, kicked: true }, 'dazed by a blast: not a knock-down to finish, so a kick');
  assert.equal(r.drone, true, 'a drone cannot be executed');
  assert.deepEqual(problems(logs), []);
});
