// The shield enemy (新敵人：盾牌手): from wave 3, at most two a wave. His riot
// shield stops bullets coming from within ±60° of where he faces, with
// sparks; from the side or behind (a ricochet off a pan, a flank) he is hit
// as usual. A kick drops the shield for 1.5 s; explosions hurt him as usual.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=21'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    g.startRun(1); // the club: open floor in the middle
    g.waves.state = 'done';
    g.enemies.clear();
    window.play = (n) => {
      for (let i = 0; i < n; i++) {
        g.player.hp = 100;
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
    /** A shield enemy at (0, -4) facing south (+z), towards the player at (0, 2); he stays put. */
    window.shieldMan = () => {
      g.enemies.clear();
      g.player.x = 0;
      g.player.z = 2;
      const e = g.enemies.spawn('shield', { x: 0, z: -4, ex: 0, ez: -3.9, stay: true });
      window.play(20); // past his spawn grace, when bullets pass through
      e.state = 'idle';
      e.facing = 0;
      return e;
    };
    /** A player bullet arriving at e from `deg` degrees off his facing (0 = straight at his front). */
    window.shootAt = (e, deg) => {
      const a = e.facing + (deg * Math.PI) / 180;
      const fx = e.x + Math.sin(a) * 3;
      const fz = e.z + Math.cos(a) * 3;
      const d = Math.hypot(e.x - fx, e.z - fz);
      return g.bullets.spawn({ x: fx, z: fz, dx: (e.x - fx) / d, dz: (e.z - fz) / d, speed: 62, owner: 'player', damage: 1 });
    };
    window.sparks = 0;
    const sparks0 = g.fx.sparks.bind(g.fx);
    g.fx.sparks = (...a) => {
      window.sparks++;
      return sparks0(...a);
    };
  });
});
after(async () => {
  await h.close();
});

test('the shield stops bullets from within ±60° in front, with sparks; from the side or behind he is hit', async () => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const deg of [0, 45, 58, 75, 120, 180]) {
      const e = window.shieldMan();
      const hp = e.hp;
      const s0 = window.sparks;
      const b = window.shootAt(e, deg);
      e.facing = 0;
      for (let i = 0; i < 8 && b.alive; i++) {
        e.facing = 0; // hold him square while the bullet flies
        window.play(1);
      }
      out[deg] = { lost: hp - e.hp, sparks: window.sparks - s0, bulletGone: !b.alive };
    }
    return out;
  });
  for (const deg of [0, 45, 58]) {
    assert.equal(r[deg].lost, 0, `${deg}°: blocked`);
    assert.ok(r[deg].sparks > 0, `${deg}°: sparks`);
    assert.equal(r[deg].bulletGone, true, `${deg}°: the bullet stops at the shield`);
  }
  for (const deg of [75, 120, 180]) assert.equal(r[deg].lost, 1, `${deg}°: hit`);
});

test('a kick drops the shield for 1.5 s; explosions hurt him as usual', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const e = window.shieldMan();
    e.kick(0, -1, 4);
    const down = e.shieldDownT;
    const log = g.notes.events.at(-1).text;
    window.play(30); // 0.5 s: still down
    e.stunT = 0;
    e.facing = 0;
    const hp0 = e.hp;
    const b1 = window.shootAt(e, 0);
    for (let i = 0; i < 6 && b1.alive; i++) {
      e.facing = 0;
      window.play(1);
    }
    const hitWhileDown = hp0 - e.hp;
    window.play(66); // past 1.5 s: up again
    e.stunT = 0;
    e.facing = 0;
    const hp1 = e.hp;
    const b2 = window.shootAt(e, 0);
    for (let i = 0; i < 6 && b2.alive; i++) {
      e.facing = 0;
      window.play(1);
    }
    const hitWhenUp = hp1 - e.hp;
    // an explosion right in front of the shield still hurts
    const f = window.shieldMan();
    const hp2 = f.hp;
    g.explode(f.x, f.z + 1.2, 4.4, {});
    return { down, log, hitWhileDown, hitWhenUp, blast: hp2 - f.hp, alive: f.alive };
  });
  assert.equal(r.down, 1.5);
  assert.equal(r.log, '盾牌手的盾被踢開');
  assert.equal(r.hitWhileDown, 1, 'a front shot hits while the shield is down');
  assert.equal(r.hitWhenUp, 0, 'and is stopped again once it is back up');
  assert.ok(r.blast > 0 || !r.alive, 'an explosion hurts him');
  assert.deepEqual(problems(logs), []);
});

test('shield enemies come from wave 3, at most two a wave', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const per = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      g.rng.reset(seed);
      for (let n = 1; n <= 12; n++) per.push([n, g.waves.compose(n).filter((t) => t === 'shield').length]);
    }
    return per;
  });
  assert.ok(r.filter(([n]) => n < 3).every(([, c]) => c === 0), 'none before wave 3');
  assert.ok(r.every(([, c]) => c <= 2), 'never more than two in a wave');
  assert.ok(r.some(([n, c]) => n >= 3 && c > 0), 'they do show up');
});

test('a picture of a shield man blocking', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.startRun(3); // the Senado square in daylight shows the shield best
    g.waves.state = 'done';
    g.enemies.clear();
    const s = g.level.start;
    g.player.x = s.x;
    g.player.z = s.z;
    const e = g.enemies.spawn('shield', { x: s.x, z: s.z - 5, ex: s.x, ez: s.z - 4.9, stay: true });
    window.play(20);
    e.state = 'idle';
    e.facing = 0;
    for (const deg of [-20, 0, 25]) window.shootAt(e, deg);
    for (let i = 0; i < 3; i++) {
      e.facing = 0;
      window.play(1);
    }
    g.camTarget.set(s.x, 0, s.z - 3);
    g.updateCamera(1, true);
    g.camTarget.set(s.x, 0, s.z - 3);
    g.camera.position.lerp(g.camTarget, 0.6);
    g.render();
  });
  await snap(page, 'shield-block.png');
  assert.deepEqual(problems(logs), []);
});
