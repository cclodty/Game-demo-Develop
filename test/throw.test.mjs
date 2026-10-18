// Throwing: G picks up a pan or barrel and throws it at the cursor, a thrown
// thing stuns the enemy it hits (a barrel explodes), an emptied special weapon
// can be thrown from the hand, and a pan in the air scatters a player bullet
// into three. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open());
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    const S = (window.S = { tags: [], spawned: [] });
    const kill0 = g.score.kill.bind(g.score);
    g.score.kill = (tags) => {
      S.tags.push(tags.map((t) => t.label));
      return kill0(tags);
    };
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      const b = spawn0(o);
      S.spawned.push(b);
      return b;
    };
    // step n frames; enemies and bullets are left alone unless asked
    window.step = (n, { fire = false, press = [], keys = [], god = true } = {}) => {
      const inp = g.input;
      for (let i = 0; i < n; i++) {
        g.time += 1 / 60;
        inp.pressed.clear();
        inp.keys.clear();
        inp.mouse.leftPressed = inp.mouse.rightPressed = inp.mouse.rightReleased = false;
        inp.mouse.left = fire;
        for (const k of keys) inp.keys.add(k);
        if (i === 0) for (const k of press) inp.pressed.add(k);
        if (god) g.player.hp = 100;
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
    // aim six metres from the player in direction (ddx, ddz); returns the aim direction actually used
    window.aimDir = (ddx, ddz) => {
      const p = g.player;
      const v = new g.aimPoint.constructor(p.x + 6 * ddx, 1.38, p.z + 6 * ddz).project(g.camera);
      g.input.mouse.x = (v.x * 0.5 + 0.5) * innerWidth;
      g.input.mouse.y = (-v.y * 0.5 + 0.5) * innerHeight;
      g.updateAim();
      const dx = g.aimPoint.x - p.x;
      const dz = g.aimPoint.z - p.z;
      const l = Math.hypot(dx, dz) || 1;
      return { dx: dx / l, dz: dz / l };
    };
    window.aimEast = () => window.aimDir(1, 0);
    // park every pan and barrel far from the player with no speed, and run time at full speed, so nothing left over interferes
    window.parkProps = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.setFocus(false);
      g.focusAmt = 0;
      g.level.props.forEach((q, i) => {
        q.carried = false;
        q.thrown = false;
        q.x = -18 + i * 1.5;
        q.z = -12;
        q.vx = q.vz = 0;
        q.vy = 0;
        q.y = q.kind === 'pan' ? 0.05 : 0;
      });
      g.thrown.carry = null;
    };
    window.placeEnemy = (dist, dir) => {
      const p = g.player;
      const e = g.enemies.spawn('grunt', g.level.spawns[0]);
      e.state = 'move';
      e.spawnLock = 0;
      e.x = p.x + dir.dx * dist;
      e.z = p.z + dir.dz * dist;
      e.update = () => {}; // stands still: the tests aim at where it was put
      return e;
    };
    // an open spot on the rooftop
    g.player.x = 0;
    g.player.z = 0;
  });
});
after(async () => {
  await h.close();
});

test('G picks up a pan, throws it at the cursor, and the hit enemy is stunned', { timeout: 60000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const S = window.S;
    g.enemies.clear();
    window.parkProps();
    const pan = g.level.pans[0];
    pan.x = p.x + 1;
    pan.z = p.z;
    pan.y = 0.05;
    pan.vx = pan.vz = pan.vy = 0;
    window.step(1);
    const before = { prompt: g.thrown.prompt };
    window.step(1, { press: ['KeyG'] });
    const held = { carry: g.thrown.carry === pan, carried: pan.carried, y: pan.y, prompt: g.thrown.prompt, hud: document.getElementById('prompt').textContent };
    window.step(10);
    const rides = Math.hypot(pan.x - p.x, pan.z - p.z) < 0.01 && (pan.y > 2 || g.thrown.inHand); // a barrel overhead, a pan in the hand (test/pan.test.mjs)
    const dir = window.aimEast();
    const e = window.placeEnemy(4, dir);
    window.step(1, { press: ['KeyG'] });
    const thrown = { thrown: pan.thrown, carry: g.thrown.carry, y: pan.y, vy: pan.vy, along: pan.vx * dir.dx + pan.vz * dir.dz };
    let stunned = null;
    for (let i = 0; i < 60 && !stunned; i++) {
      window.step(1);
      if (e.stunT > 0) stunned = { cause: e.stunCause, alive: e.alive, panThrown: pan.thrown, frame: i };
    }
    S.tags.length = 0;
    e.hit({ owner: 'player', damage: 999, dx: 1, dz: 0, knock: 1 });
    const tags = S.tags.pop();
    return { before, held, rides, thrown, stunned, tags, events: g.notes.events.slice(-6).map((x) => x.text) };
  });
  assert.match(r.before.prompt, /拿起平底鑊/);
  assert.equal(r.held.carry, true, 'G picks the pan up');
  assert.equal(r.held.carried, true);
  assert.match(r.held.hud, /擲出/);
  assert.equal(r.rides, true, 'the pan rides with the player');
  assert.equal(r.thrown.thrown, true, 'G again throws it');
  assert.equal(r.thrown.carry, null);
  assert.ok(r.thrown.vy > 0 && r.thrown.along > 3, `launched up and towards the cursor: ${JSON.stringify(r.thrown)}`);
  assert.ok(r.stunned && r.stunned.cause === 'throw' && r.stunned.alive, `the enemy is stunned by the pan: ${JSON.stringify(r.stunned)}`);
  assert.ok(r.tags.includes('JUGGLE'), `a kill while stunned by a throw is a JUGGLE: ${r.tags}`);
  assert.ok(r.events.some((t) => t.startsWith('擲中')), r.events.join(' | '));
  assert.deepEqual(problems(logs), []);
});

test('a player bullet that hits a pan in the air scatters into three', { timeout: 60000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const S = window.S;
    g.enemies.clear();
    g.bullets.clear();
    window.parkProps();
    const pan = g.level.pans[0];
    pan.x = p.x + 3;
    pan.z = p.z;
    pan.y = 1.3;
    pan.vx = pan.vz = pan.vy = 0;
    const es = [window.placeEnemy(7, { dx: 1, dz: 0 }), window.placeEnemy(6, { dx: 0.7, dz: 0.7 }), window.placeEnemy(6, { dx: 0.7, dz: -0.7 })];
    for (const e of es) e.hp = 1;
    S.spawned.length = 0;
    S.tags.length = 0;
    g.bullets.spawn({ x: p.x, z: p.z, dx: 1, dz: 0, speed: 62, owner: 'player', damage: 1, weapon: 'pistols' });
    const first = S.spawned[0];
    window.step(4); // 3 m at 62 m/s is about three frames
    const afterHit = { scatter: first.scatter, ricochet: first.ricochet, extra: S.spawned.filter((b) => b !== first && b.scatter).length, offThePan: first.ignore === pan, debug: { panY: pan.y, panX: pan.x - p.x, panZ: pan.z - p.z, alive: first.alive, bx: first.x - p.x, bz: first.z - p.z, traveled: first.traveled, ignore: first.ignore && first.ignore.kind, hits: first.hits.length, carried: pan.carried, props: g.level.props.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4).map((q) => `${q.kind}@${(q.x - p.x).toFixed(1)},${(q.z - p.z).toFixed(1)}`) } };
    window.step(30);
    const killed = es.filter((e) => !e.alive).length;
    const scatterTags = S.tags.filter((t) => t.includes('SCATTER')).length;
    const plainRicochet = S.tags.filter((t) => t.includes('RICOCHET')).length;
    g.enemies.clear();
    return { afterHit, killed, scatterTags, plainRicochet };
  });
  assert.equal(r.afterHit.scatter, true, `the bullet became a scatter bullet: ${JSON.stringify(r.afterHit)}`);
  assert.equal(r.afterHit.extra, 2, 'two more bullets were spawned');
  assert.equal(r.afterHit.offThePan, true, `the bullet came off the pan: ${JSON.stringify(r.afterHit)}`);
  assert.ok(r.killed >= 2, `the scattered bullets killed ${r.killed} of 3`);
  assert.ok(r.scatterTags >= 2, `SCATTER tags: ${r.scatterTags}`);
  assert.equal(r.plainRicochet, 0, 'SCATTER replaces RICOCHET for these');
  assert.deepEqual(problems(logs), []);
});

test('an emptied special weapon stays in slot 2 and G throws it', { timeout: 60000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    g.enemies.clear();
    g.bullets.clear();
    g.pickups.clear();
    window.parkProps();
    window.aimDir(-1, 0); // empty the shotgun away from where the enemy will stand
    p.giveWeapon('shotgun', 1);
    p.fireCd = 0;
    window.step(1, { fire: true });
    const empty = { empty: p.special && p.special.empty, slot: p.slot, hud: document.getElementById('slots').textContent, prompt: g.thrown.prompt };
    window.step(5);
    const dir = window.aimEast();
    const e = window.placeEnemy(4, dir);
    window.step(1, { press: ['KeyG'] });
    const thrown = { flying: g.thrown.list.length, special: p.special, slot: p.slot };
    let stunned = null;
    for (let i = 0; i < 60 && !stunned; i++) {
      window.step(1);
      if (e.stunT > 0) stunned = { cause: e.stunCause, frame: i };
    }
    window.step(60);
    g.enemies.clear();
    return { empty, thrown, stunned, left: g.thrown.list.length, events: g.notes.events.slice(-5).map((x) => x.text) };
  });
  assert.equal(r.empty.empty, true, 'the shotgun is kept, marked empty');
  assert.equal(r.empty.slot, 'pistols', 'and the pistols come out');
  assert.match(r.empty.hud, /散彈槍（空）/);
  assert.match(r.empty.prompt, /擲出空的散彈槍/);
  assert.equal(r.thrown.flying, 1, 'G throws it');
  assert.equal(r.thrown.special, null);
  assert.ok(r.stunned && r.stunned.cause === 'throw', `the gun stuns the enemy: ${JSON.stringify(r.stunned)}`);
  assert.equal(r.left, 0, 'the thrown gun is gone afterwards');
  assert.ok(r.events.some((t) => t.includes('擲出空的散彈槍')), r.events.join(' | '));
  assert.deepEqual(problems(logs), []);
});

test('a thrown barrel explodes where it lands', { timeout: 60000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    g.enemies.clear();
    window.parkProps();
    const barrel = g.level.barrels[0];
    barrel.x = p.x - 1;
    barrel.z = p.z;
    barrel.vx = barrel.vz = 0;
    window.step(1, { press: ['KeyG'] });
    const held = g.thrown.carry === barrel;
    window.aimEast();
    window.step(1, { press: ['KeyG'] });
    const thrown = barrel.thrown;
    let landedAt = -1;
    let exploded = -1;
    for (let i = 0; i < 120; i++) {
      window.step(1);
      if (landedAt < 0 && barrel.y <= 0 && !barrel.thrown) landedAt = i;
      if (!barrel.alive) {
        exploded = i;
        break;
      }
    }
    return { held, thrown, landedAt, exploded, hp: p.hp, where: { x: barrel.x - p.x, z: barrel.z - p.z } };
  });
  assert.equal(r.held, true);
  assert.equal(r.thrown, true);
  assert.ok(r.landedAt >= 0, 'the barrel landed');
  assert.ok(r.exploded > 0 && r.exploded - r.landedAt < 6, `it exploded on landing (landed ${r.landedAt}, exploded ${r.exploded})`);
  assert.ok(Math.abs(r.where.x) > 3, `it landed well away from the player: ${JSON.stringify(r.where)}`);
  await snap(page, 'throw-barrel.png');
  assert.deepEqual(problems(logs), []);
});
