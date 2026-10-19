// Tools and the LPG rocket (環境互動件 ③): a kicked LPG cylinder jets off,
// bouncing off walls, and bursts on the first enemy it meets or after 1.5 s
// (ROCKET CAN); a fire extinguisher shot once bursts into a cloud from which
// no enemy aims (SMOKE) and is gone 6 s later; kicked, it careers about for
// 2.5 s bowling over whoever it meets. Numbers in config.js ENV. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=9'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.begin = (map = 0) => {
      g.setRules('normal', []);
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
    };
    window.play = (n, aim = null, keys = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.vx = g.player.vz = 0;
        g.player.hp = 100;
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
      }
      g.input.pressed.clear();
    };
    window.shoot = (x, z, tx, tz) => {
      const d = Math.hypot(tx - x, tz - z) || 1;
      return g.bullets.spawn({ x, z, dx: (tx - x) / d, dz: (tz - z) / d, speed: 62, owner: 'player', damage: 1 });
    };
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      return e;
    };
    window.tags = () => {
      const tags = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        tags.push(t.map((x) => x.label));
        return kill0(t);
      };
      return tags;
    };
  });
});
after(async () => {
  await h.close();
});

test('a kicked LPG cylinder jets off, bursts on the thug in its way (ROCKET CAN), and on its own 1.5 s after a kick into the open', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(0);
    const lpg = L.barrels.find((b) => b.variant === 'lpg'); // (-9, -11), by the north parapet
    const p = g.player;
    // the player north of it, kicking it south across the open roof at the thug 4 m on
    p.x = lpg.x;
    p.z = lpg.z - 1.1;
    const e = window.post('grunt', lpg.x, lpg.z + 4);
    e.update = () => {};
    const tags = window.tags();
    window.play(1, [lpg.x, lpg.z + 5], ['KeyF']);
    const kicked = { rocket: lpg.rocketT > 0, speed0: Math.hypot(lpg.vx, lpg.vz) };
    window.play(10, [lpg.x, lpg.z + 5]);
    const speed1 = Math.hypot(lpg.vx, lpg.vz);
    let n = 0;
    while (lpg.alive && n++ < 180) window.play(1, [lpg.x, lpg.z + 5]);
    const burst = { t: (10 + n) / 60, alive: lpg.alive, dead: e.dead };
    const log = g.notes.events.map((x) => x.text).filter((t) => t.includes('石油氣樽'));
    // into the open: it goes off on its own when the gas is spent (south again, nobody in the way)
    window.begin(0);
    const lpg2 = L.barrels.find((b) => b.variant === 'lpg');
    p.x = lpg2.x;
    p.z = lpg2.z - 1.1;
    window.play(1, [lpg2.x, lpg2.z + 5], ['KeyF']);
    n = 0;
    while (lpg2.alive && n++ < 240) window.play(1, [lpg2.x, lpg2.z + 5]);
    return { kicked, speed1, burst, tags, log, open: { t: n / 60, alive: lpg2.alive } };
  });
  assert.equal(r.kicked.rocket, true, 'the kick lit the jet');
  assert.ok(r.speed1 > r.kicked.speed0 && r.speed1 > 8, `faster along its way (${r.kicked.speed0.toFixed(1)} → ${r.speed1.toFixed(1)} m/s)`);
  assert.equal(r.burst.alive, false, 'it burst');
  assert.ok(r.burst.t < 1.2, `on the thug, before its time (${r.burst.t.toFixed(2)} s)`);
  assert.equal(r.burst.dead, true, 'the thug is dead');
  assert.ok(r.tags[0].includes('ROCKET CAN') && r.tags[0].includes('BOOM'), `the kill tags: ${r.tags[0]}`);
  assert.deepEqual(r.log.slice(0, 1), ['石油氣樽噴射']);
  assert.equal(r.open.alive, false, 'into the open it still goes off');
  assert.ok(r.open.t > 1.3 && r.open.t < 2.2, `1.5 s of jet plus the fuse (${r.open.t.toFixed(2)} s)`);
  assert.deepEqual(problems(logs), []);
});

test('an extinguisher shot once bursts into a cloud: the thug in it loses his aim and cannot aim, his death there is SMOKE, and 6 s later it is gone', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(0);
    const ext = L.tools[0]; // (-13, -9.5)
    const p = g.player;
    p.x = ext.x;
    p.z = ext.z + 5;
    const e = window.post('grunt', ext.x + 1.5, ext.z);
    e.startAim();
    const tags = window.tags();
    window.shoot(p.x, p.z, ext.x, ext.z);
    window.play(8);
    const after = { smoke: ext.smokeT, state: e.state, inSmoke: L.smokeAt(e.x, e.z), playerIn: L.smokeAt(p.x, p.z) };
    let aimed = false;
    for (let i = 0; i < 60; i++) {
      window.play(1);
      if (e.state === 'aim' || e.state === 'fire') aimed = true;
    }
    e.die(0, 1, { cause: 'bullet' });
    window.pic = true;
    return { after, aimed, tags, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('滅火筒')) };
  });
  assert.ok(r.after.smoke > 5 && r.after.smoke <= 6, `a cloud for ${r.after.smoke.toFixed(1)} s`);
  assert.notEqual(r.after.state, 'aim', 'his aim broke');
  assert.deepEqual([r.after.inSmoke, r.after.playerIn], [true, false], 'he is in it, the player 5 m off is not');
  assert.equal(r.aimed, false, 'no aim from the cloud');
  assert.ok(r.tags[0].includes('SMOKE'), `the kill tag: ${r.tags[0]}`);
  assert.ok(r.log.includes('滅火筒爆開，白霧四散'), r.log.join(' / '));
  await snap(page, 'tool-smoke.png');
  const gone = await page.evaluate(() => {
    const g = window.game;
    const ext = g.level.tools[0];
    window.play(60 * 6);
    return { alive: ext.alive, cloud: ext.cloud.visible, smoke: g.level.smokeAt(ext.x, ext.z) };
  });
  assert.deepEqual(gone, { alive: false, cloud: false, smoke: false }, 'gone after six seconds');
  assert.deepEqual(problems(logs), []);
});

test('a kicked extinguisher careers off at 10 m/s, keeps going for 2.5 s, and bowls over the thug in its way', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(0);
    const ext = L.tools[0];
    const p = g.player;
    p.x = ext.x;
    p.z = ext.z + 1.0;
    const e = window.post('grunt', ext.x, ext.z - 2); // he keeps his post (and it is he who meets the can: pushProps)
    window.play(1, [ext.x, ext.z - 5], ['KeyF']);
    const speed0 = Math.hypot(ext.vx, ext.vz);
    window.play(30, [ext.x, ext.z - 5]);
    const hit = { stun: e.stunT > 0 || e.stunCause === 'strike', cause: e.stunCause };
    window.play(60, [ext.x, ext.z - 5]);
    const speed15 = Math.hypot(ext.vx, ext.vz);
    window.play(90, [ext.x, ext.z - 5]);
    const speed4 = Math.hypot(ext.vx, ext.vz);
    return { speed0, hit, speed15, speed4, alive: ext.alive };
  });
  assert.ok(r.speed0 >= 9, `off at ${r.speed0.toFixed(1)} m/s`);
  assert.ok(r.hit.stun && r.hit.cause === 'strike', `the thug in its way was bowled over (${r.hit.cause})`);
  assert.ok(r.speed15 > 6, `still going at 1.5 s (${r.speed15.toFixed(1)} m/s)`);
  assert.ok(r.speed4 < 3, `spent by 4 s (${r.speed4.toFixed(1)} m/s)`);
  assert.equal(r.alive, true);
  assert.deepEqual(problems(logs), []);
});
