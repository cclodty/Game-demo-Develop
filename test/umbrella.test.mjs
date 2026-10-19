// The umbrella (工具 ③): G takes it into the hand; F opens it in front for
// 0.8 s and every enemy bullet in the ±70° arc stops in the canopy (PARASOL
// +40 each, 200 at most per opening), then 1.2 s before it opens again; a
// bullet from behind still lands; G throws it like a dart that dazes and
// hurts whoever it hits. Numbers in config.js UMBRELLA. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=16'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet rooftop, the player at (0, 4) facing north with an umbrella at his feet. */
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
      const u = g.level.tools.find((t) => t.kind === 'umbrella');
      u.x = 0.6;
      u.z = 4;
      u.y = 0;
      u.vx = u.vz = u.vy = 0;
      return u;
    };
    window.play = (n, keys = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.vx = p.vz = 0;
        p.invuln = 0;
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        g.aimPoint.set(0, g.aimPoint.y, -6);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
    };
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.update = () => {};
      return e;
    };
    /** An enemy bullet at (x, z) flying along (dx, dz). */
    window.bullet = (e, x, z, dx, dz) => g.bullets.spawn({ x, z, dx, dz, speed: 20, owner: 'enemy', damage: 20, range: 70, source: e });
    window.watch = () => {
      const S = [];
      const style0 = g.score.style.bind(g.score);
      g.score.style = (label, pts, refresh) => {
        S.push([label, pts]);
        return style0(label, pts, refresh);
      };
      return S;
    };
  });
});
after(async () => {
  await h.close();
});

test('G takes the umbrella; F opens it: three bullets from the front stop in it (PARASOL), one from behind lands; it closes, and will not open again inside 1.2 s', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const u = window.begin();
    const p = g.player;
    window.play(1, ['KeyG']);
    const held = { inHand: g.thrown.inHand, kind: g.thrown.carry && g.thrown.carry.kind, prompt: g.thrown.prompt };
    const e = window.post('grunt', 0, -6);
    const S = window.watch();
    p.hp = 100;
    // open, then three bullets 1.6 m ahead flying in
    window.play(1, ['KeyF']);
    const opened = p.shieldT;
    const front = [window.bullet(e, -0.3, 2.4, 0, 1), window.bullet(e, 0, 2.4, 0, 1), window.bullet(e, 0.3, 2.4, 0, 1)];
    window.play(24); // 0.2 s: 4 m at 20 m/s, more than enough
    const caught = { alive: front.map((b) => b.alive), hp: p.hp, parasol: S.filter((s) => s[0] === 'PARASOL').length, open: u.canopy.scale.x };
    // one from behind, while it is still open
    const back = window.bullet(e, 0, 5.6, 0, -1);
    window.play(24);
    const behind = { alive: back.alive, hp: p.hp };
    // it closes after 0.8 s all told, and F does nothing until the cooldown is over
    window.play(60);
    const closed = { shieldT: p.shieldT, open: u.canopy.scale.x };
    window.play(1, ['KeyF']);
    const refused = p.shieldT;
    window.play(150); // past the 1.2 s
    window.play(1, ['KeyF']);
    const again = p.shieldT;
    return { held, opened, caught, behind, closed, refused, again };
  });
  assert.deepEqual([r.held.inHand, r.held.kind], [true, 'umbrella'], 'the umbrella is in the hand');
  assert.match(r.held.prompt, /開傘/);
  assert.ok(r.opened > 0.7, `F opened it (${r.opened.toFixed(2)} s to go)`);
  assert.deepEqual(r.caught.alive, [false, false, false], 'the three bullets from the front are gone');
  assert.equal(r.caught.hp, 100, 'the player was not hit');
  assert.equal(r.caught.parasol, 3, 'PARASOL three times');
  assert.ok(r.caught.open > 0.9, `the canopy is open (${r.caught.open.toFixed(2)})`);
  assert.deepEqual([r.behind.alive, r.behind.hp], [false, 80], 'the one from behind landed');
  assert.ok(r.closed.shieldT <= 0 && r.closed.open < 0.35, 'closed again');
  assert.ok(r.refused <= 0, 'F inside the cooldown does nothing');
  assert.ok(r.again > 0.7, 'and opens again after it');
  await snap(page, 'umbrella-open.png');
  assert.deepEqual(problems(logs), []);
});

test('PARASOL is capped at 200 per opening; G throws the umbrella like a dart that dazes and hurts', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    window.play(1, ['KeyG']);
    const e = window.post('grunt', 0, -6);
    const S = window.watch();
    window.play(1, ['KeyF']);
    const many = [];
    for (let i = 0; i < 8; i++) many.push(window.bullet(e, -0.7 + i * 0.2, 2.4, 0, 1));
    window.play(24);
    const cap = { gone: many.every((b) => !b.alive), parasol: S.filter((s) => s[0] === 'PARASOL').reduce((a, s) => a + s[1], 0) };
    // the dart
    const u = g.thrown.carry;
    const t = window.post('grunt', 0, 0);
    window.play(1, ['KeyG']);
    const thrown = { inHand: g.thrown.inHand, flying: u.thrown };
    let hit = null;
    for (let i = 0; i < 120 && !hit; i++) {
      window.play(1);
      if (t.stunT > 0 || t.dead) hit = { cause: t.stunCause, hp: t.hp, dead: t.dead };
    }
    return { cap, thrown, hit };
  });
  assert.equal(r.cap.gone, true, 'all eight bullets stopped');
  assert.equal(r.cap.parasol, 200, `PARASOL capped at 200 (${r.cap.parasol})`);
  assert.deepEqual(r.thrown, { inHand: false, flying: true }, 'G throws it');
  assert.ok(r.hit && (r.hit.dead || (r.hit.cause === 'throw' && r.hit.hp <= 0)), `the dart took the thug (${JSON.stringify(r.hit)})`);
  assert.deepEqual(problems(logs), []);
});
