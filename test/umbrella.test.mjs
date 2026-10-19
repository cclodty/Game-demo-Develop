// The umbrella (工具 ③, revised after playtest feedback ②): G takes it into
// the hand; F held keeps it open in front, and every enemy bullet in the ±70°
// arc stops in the canopy (PARASOL +40 each, 200 at most per opening); a
// bullet from behind still lands; let go and it shuts, with 0.4 s before it
// opens again. Open, the player walks at 0.6× and cannot slide. It takes six
// bullets, then the ribs give: it falls from the hand inside out and is gone.
// Tools on the floor carry a marker ring like a pan's. G throws it like a
// dart that dazes and hurts whoever it hits. Numbers in config.js UMBRELLA.
// Run: npm test
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
    /** Step 120 Hz frames: `keys` pressed on the first, `hold` held throughout, aiming north; `walk` also holds W. */
    window.play = (n, keys = [], hold = [], walk = false) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        if (!walk) p.vx = p.vz = 0;
        p.invuln = 0;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of hold) g.input.keys.add(k);
        if (walk) g.input.keys.add('KeyW');
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        g.aimPoint.set(0, g.aimPoint.y, -6);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
      g.input.keys.clear();
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

test('held open: three bullets from the front stop in it (PARASOL), one from behind lands; let go and it shuts, and will not open again inside 0.4 s', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const u = window.begin();
    const p = g.player;
    window.play(1, ['KeyG']);
    const held = { inHand: g.thrown.inHand, kind: g.thrown.carry && g.thrown.carry.kind, prompt: g.thrown.prompt };
    const e = window.post('grunt', 0, -6);
    const S = window.watch();
    p.hp = 100;
    // F held: it opens and stays open
    window.play(18, [], ['KeyF']);
    const opened = { on: p.shieldOn, open: u.canopy.scale.x };
    const front = [window.bullet(e, -0.3, 2.4, 0, 1), window.bullet(e, 0, 2.4, 0, 1), window.bullet(e, 0.3, 2.4, 0, 1)];
    window.play(24, [], ['KeyF']); // 0.2 s: 4 m at 20 m/s, more than enough
    const caught = { alive: front.map((b) => b.alive), hp: p.hp, parasol: S.filter((s) => s[0] === 'PARASOL').length, on: p.shieldOn };
    // one from behind, while it is still held open
    const back = window.bullet(e, 0, 5.6, 0, -1);
    window.play(24, [], ['KeyF']);
    const behind = { alive: back.alive, hp: p.hp, on: p.shieldOn };
    // let go: it shuts; F again at once does nothing; after the cooldown it opens again
    window.play(20);
    const shut = { on: p.shieldOn, open: u.canopy.scale.x };
    window.play(6, [], ['KeyF']);
    const refused = p.shieldOn;
    window.play(60);
    window.play(6, [], ['KeyF']);
    const again = p.shieldOn;
    window.play(6);
    return { held, opened, caught, behind, shut, refused, again, hits: u.hits, broken: u.broken };
  });
  assert.deepEqual([r.held.inHand, r.held.kind], [true, 'umbrella'], 'the umbrella is in the hand');
  assert.match(r.held.prompt, /按住.*開傘/);
  assert.equal(r.opened.on, true, 'F held opens it');
  assert.ok(r.opened.open > 0.9, `the canopy is open (${r.opened.open.toFixed(2)})`);
  assert.deepEqual(r.caught.alive, [false, false, false], 'the three bullets from the front are gone');
  assert.equal(r.caught.hp, 100, 'the player was not hit');
  assert.equal(r.caught.parasol, 3, 'PARASOL three times');
  assert.equal(r.caught.on, true, 'still open while held');
  assert.deepEqual([r.behind.alive, r.behind.hp], [false, 80], 'the one from behind landed');
  assert.ok(!r.shut.on && r.shut.open < 0.5, `let go: shut (${r.shut.open.toFixed(2)})`);
  assert.equal(r.refused, false, 'F again inside the cooldown does nothing');
  assert.equal(r.again, true, 'and opens again after it');
  assert.deepEqual([r.hits, r.broken], [3, false], 'three bullets worn, not broken yet');
  assert.deepEqual(problems(logs), []);
});

test('open, the player walks at 0.6× and cannot slide; PARASOL is capped at 200 per opening', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const p = g.player;
    // walking north for a second: with the umbrella shut, then held open
    const z0 = p.z;
    window.play(120, [], [], true);
    const free = z0 - p.z;
    p.x = 0;
    p.z = 4;
    window.play(1, ['KeyG']);
    const z1 = p.z;
    window.play(120, [], ['KeyF'], true);
    const shielded = z1 - p.z;
    const on = p.shieldOn;
    // a slide (C) while it is open does nothing; shut, it slides
    window.play(30, [], ['KeyF'], true);
    window.play(1, ['KeyC'], ['KeyF'], true);
    const slidOpen = p.slideT > 0;
    window.play(30, [], [], true);
    window.play(1, ['KeyC'], [], true);
    const slidShut = p.slideT > 0;
    window.play(60);
    // the cap: five bullets are 200; the sixth breaks it (next test), so a fresh umbrella and five bullets here
    const u2 = window.begin();
    window.play(1, ['KeyG']);
    const e = window.post('grunt', 0, -6);
    const S = window.watch();
    window.play(6, [], ['KeyF']);
    const five = [];
    for (let i = 0; i < 5; i++) five.push(window.bullet(e, -0.4 + i * 0.2, 2.4, 0, 1));
    window.play(24, [], ['KeyF']);
    window.play(6);
    return { free, shielded, on, slidOpen, slidShut, cap: { gone: five.every((b) => !b.alive), parasol: S.filter((s) => s[0] === 'PARASOL').reduce((a, s) => a + s[1], 0), hits: u2.hits, broken: u2.broken } };
  });
  assert.ok(r.free > 3, `walked ${r.free.toFixed(2)} m in a second with it shut`);
  assert.equal(r.on, true, 'held open while walking');
  assert.ok(r.shielded > 1.5 && r.shielded < r.free * 0.72, `walked ${r.shielded.toFixed(2)} m with it open (0.6× of ${r.free.toFixed(2)})`);
  assert.equal(r.slidOpen, false, 'no slide with it open');
  assert.equal(r.slidShut, true, 'a slide once it is shut');
  assert.equal(r.cap.gone, true, 'all five bullets stopped');
  assert.equal(r.cap.parasol, 200, `PARASOL capped at 200 (${r.cap.parasol})`);
  assert.deepEqual([r.cap.hits, r.cap.broken], [5, false]);
  assert.deepEqual(problems(logs), []);
});

test('the sixth bullet breaks it: out of the hand, inside out, gone in 1.5 s, and the next bullet lands; G throws a whole one like a dart; tools carry a marker', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const u = window.begin();
    const p = g.player;
    const markerBefore = { shown: u.marker.visible, ext: g.level.tools.find((t) => t.kind === 'extinguisher').marker.visible };
    window.play(1, ['KeyG']);
    const markerCarried = u.marker.visible;
    const e = window.post('grunt', 0, -6);
    const S = window.watch();
    p.hp = 100;
    window.play(6, [], ['KeyF']);
    const six = [];
    for (let i = 0; i < 6; i++) six.push(window.bullet(e, -0.5 + i * 0.2, 2.4, 0, 1));
    window.play(24, [], ['KeyF']);
    const broke = { gone: six.every((b) => !b.alive), hp: p.hp, inHand: g.thrown.inHand, carry: g.thrown.carry, broken: u.broken, alive: u.alive, canopyY: u.canopy.scale.y, on: p.shieldOn, log: g.notes.events.some((x) => x.text.includes('傘骨外翻')) };
    // nothing to shield with now: the next bullet lands
    window.bullet(e, 0, 2.4, 0, 1);
    window.play(24, [], ['KeyF']);
    const after = { hp: p.hp, parasol: S.filter((s) => s[0] === 'PARASOL').length, pickable: !!g.thrown.nearProp() };
    window.play(200);
    const gone = { alive: u.alive, visible: u.mesh.visible, marker: u.marker.visible };
    // the dart: a whole umbrella again
    const u2 = window.begin();
    const t = window.post('grunt', 0, 0);
    window.play(1, ['KeyG']);
    window.play(1, ['KeyG']);
    const thrown = { inHand: g.thrown.inHand, flying: u2.thrown };
    let hit = null;
    for (let i = 0; i < 120 && !hit; i++) {
      window.play(1);
      if (t.stunT > 0 || t.dead) hit = { cause: t.stunCause, hp: t.hp, dead: t.dead };
    }
    return { markerBefore, markerCarried, broke, after, gone, thrown, hit };
  });
  assert.deepEqual(r.markerBefore, { shown: true, ext: true }, 'the umbrella and the extinguisher are marked on the floor');
  assert.equal(r.markerCarried, false, 'carried, no marker');
  assert.equal(r.broke.gone, true, 'all six bullets stopped');
  assert.equal(r.broke.hp, 100, 'none of them landed');
  assert.deepEqual([r.broke.inHand, r.broke.carry, r.broke.on], [false, null, false], 'the umbrella left the hand and the shield is down');
  assert.deepEqual([r.broke.broken, r.broke.alive], [true, true], 'broken, lying there for the moment');
  assert.ok(r.broke.canopyY < 0, 'inside out');
  assert.equal(r.broke.log, true, 'the notes say so');
  assert.equal(r.after.hp, 80, 'the next bullet landed');
  assert.equal(r.after.parasol, 5, 'PARASOL only up to the cap (five of the six)');
  assert.equal(r.after.pickable, false, 'a broken umbrella is nobody’s to pick up');
  assert.deepEqual(r.gone, { alive: false, visible: false, marker: false }, 'gone after 1.5 s');
  assert.deepEqual(r.thrown, { inHand: false, flying: true }, 'G throws a whole one');
  assert.ok(r.hit && (r.hit.dead || (r.hit.cause === 'throw' && r.hit.hp <= 0)), `the dart took the thug (${JSON.stringify(r.hit)})`);
  await snap(page, 'umbrella-open.png');
  assert.deepEqual(problems(logs), []);
});
