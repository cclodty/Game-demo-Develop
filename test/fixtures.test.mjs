// Fixtures (環境互動件 ①): a street lamp shot out twice goes dark for 10 s and
// nobody aims from inside its pool (a kill there is BLACKOUT); three bullets
// on a hanging sign's bracket drop the board on whoever stands under it
// (CRUSHED), and the board stays on the floor as cover. Both come back for
// the next run. Numbers in config.js ENV. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=4'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet rooftop run; window.play(n) steps n 60 Hz frames with the player still and safe from dying. */
    window.begin = () => {
      g.setRules('normal', []);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
    };
    window.play = (n) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.vx = g.player.vz = 0;
        g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
      }
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

test('every map carries fixtures, and they stand in the props as fixed things nobody picks up or pushes', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = [];
    for (const m of g.maps) {
      g.level.load(m);
      const f = g.level.fixtures;
      out.push({ map: m.id, lamps: f.filter((x) => x.kind === 'lamp').length, signs: f.filter((x) => x.kind === 'sign').length, inProps: f.every((x) => g.level.props.includes(x) && x.fixed) });
    }
    return out;
  });
  for (const m of r) {
    assert.ok(m.lamps >= 1 && m.signs >= 1, `${m.map}: ${m.lamps} lamps, ${m.signs} signs`);
    assert.equal(m.inProps, true, `${m.map}: fixtures are fixed props`);
  }
});

test('a lamp: two bullets put it out, the enemy under it loses his aim and cannot aim again, his death there is a BLACKOUT, and it comes back on after 10 s', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin();
    const lamp = L.fixtures.find((f) => f.kind === 'lamp' && f.x > 0); // (6, 7)
    const p = g.player;
    p.x = lamp.x;
    p.z = lamp.z - 6;
    const e = window.post('grunt', lamp.x + 1, lamp.z);
    e.startAim();
    const aiming = e.state;
    const tags = window.tags();
    window.shoot(p.x, p.z, lamp.x, lamp.z);
    window.play(20);
    const afterOne = { hp: lamp.hp, dark: lamp.dark };
    window.shoot(p.x, p.z, lamp.x, lamp.z);
    window.play(20);
    const afterTwo = { dark: lamp.dark, state: e.state, darkAt: L.darkAt(e.x, e.z), playerDark: L.darkAt(p.x, p.z) };
    // half a second more: with the player in sight and his gun ready he still does not aim
    let aimed = false;
    for (let i = 0; i < 60; i++) {
      window.play(1);
      if (e.state === 'aim' || e.state === 'fire') aimed = true;
    }
    e.die(0, 1, { cause: 'bullet' });
    const log = g.notes.events.map((x) => x.text).filter((t) => t.includes('街燈'));
    window.pic = true;
    return { aiming, afterOne, afterTwo, aimed, tags, log, glow: lamp.glassMat.emissiveIntensity };
  });
  assert.equal(r.aiming, 'aim');
  assert.deepEqual(r.afterOne, { hp: 1, dark: 0 }, 'one bullet: still lit');
  assert.ok(r.afterTwo.dark > 9 && r.afterTwo.dark <= 10, `two bullets: dark for ${r.afterTwo.dark}`);
  assert.notEqual(r.afterTwo.state, 'aim', 'his aim broke');
  assert.equal(r.afterTwo.darkAt, true, 'he stands in the dark');
  assert.equal(r.afterTwo.playerDark, false, 'the player 6 m off does not');
  assert.equal(r.aimed, false, 'no aim from the dark');
  assert.ok(r.tags[0].includes('BLACKOUT'), `a kill in the dark: ${r.tags[0]}`);
  assert.deepEqual(r.log, ['街燈被打熄']);
  assert.equal(r.glow, 0, 'the glass is out');
  await snap(page, 'fixture-blackout.png');
  const back = await page.evaluate(() => {
    const g = window.game;
    const lamp = g.level.fixtures.find((f) => f.kind === 'lamp' && f.x > 0);
    window.play(60 * 10);
    return { dark: lamp.dark, hp: lamp.hp, glow: lamp.glassMat.emissiveIntensity, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('復亮')).length };
  });
  assert.deepEqual(back, { dark: 0, hp: 2, glow: 0.6, log: 1 }, 'lit again, ready to be shot out once more');
  assert.deepEqual(problems(logs), []);
});

test('a sign: three bullets on the bracket drop the board; the thug under it is CRUSHED, the player under one is hurt, and the board lies there as cover', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin();
    const sign = L.fixtures.find((f) => f.kind === 'sign' && f.x > 0); // post (12, -3) facing north: the board at (12, -4.6)
    const p = g.player;
    p.x = sign.x;
    p.z = sign.z + 5;
    const e = window.post('grunt', sign.landX, sign.landZ);
    e.update = () => {}; // stays put under the board
    const tags = window.tags();
    const before = { walkable: L.nav.isWalkable(sign.landX, sign.landZ), ray: !!L.raycast(sign.landX - 2, sign.landZ, sign.landX + 2, sign.landZ) };
    for (let i = 0; i < 3; i++) {
      window.shoot(p.x, p.z, sign.x, sign.z);
      window.play(12);
    }
    const falling = sign.fallT >= 0 && !sign.landed;
    window.play(40);
    const after = { landed: sign.landed, dead: e.dead, walkable: L.nav.isWalkable(sign.landX, sign.landZ), ray: !!L.raycast(sign.landX - 2, sign.landZ, sign.landX + 2, sign.landZ), solids: L.solids.filter((s) => s === sign.solid).length };
    // the other sign, with the player under it
    const other = L.fixtures.find((f) => f.kind === 'sign' && f.x < 0); // post (-12, 11) facing south: the board at (-12, 12.6)
    p.x = other.landX;
    p.z = other.landZ;
    p.hp = 100;
    p.invuln = 0;
    const from = { x: other.x, z: other.z - 5 };
    for (let i = 0; i < 3; i++) {
      window.shoot(from.x, from.z, other.x, other.z);
      window.play(12);
    }
    window.play(40);
    const hurt = { hp: p.hp, landed: other.landed };
    const log = g.notes.events.map((x) => x.text).filter((t) => t.includes('招牌'));
    // a new run (its notes start afresh): both signs hang again, nothing left on the floor
    g.startRun(0);
    g.waves.state = 'done';
    const fresh = { up: L.fixtures.filter((f) => f.kind === 'sign').every((f) => f.fallT < 0 && !f.landed && !f.solid), ray: !!L.raycast(sign.landX - 2, sign.landZ, sign.landX + 2, sign.landZ) };
    return { before, falling, after, tags, hurt, fresh, log };
  });
  assert.deepEqual(r.before, { walkable: true, ray: false }, 'open floor under the sign to begin with');
  assert.equal(r.falling, true, 'three bullets and it falls');
  assert.deepEqual(r.after, { landed: true, dead: true, walkable: false, ray: true, solids: 1 }, 'landed on him, and now cover');
  assert.ok(r.tags[0].includes('CRUSHED'), `the kill tag: ${r.tags[0]}`);
  assert.deepEqual(r.hurt, { hp: 40, landed: true }, 'the player under a sign takes 60');
  assert.deepEqual(r.fresh, { up: true, ray: false }, 'a new run hangs them back up');
  assert.ok(r.log.includes('招牌掉下'), r.log.join(' / '));
  assert.deepEqual(problems(logs), []);
});

test('a picture: the board of a sign on the floor where it fell', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin();
    const sign = L.fixtures.find((f) => f.kind === 'sign' && f.x > 0);
    const p = g.player;
    p.x = sign.x;
    p.z = sign.z + 5;
    window.post('grunt', sign.landX, sign.landZ).update = () => {};
    for (let i = 0; i < 3; i++) {
      window.shoot(p.x, p.z, sign.x, sign.z);
      window.play(12);
    }
    window.play(45);
  });
  await snap(page, 'fixture-sign.png');
  assert.deepEqual(problems(logs), []);
});
