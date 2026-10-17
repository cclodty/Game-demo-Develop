// Things in the maps that play along (環境互動第一批). A wooden crate takes
// six bullets, then bursts into planks, stops being cover and opens its nav
// cells, so both sides can walk through; a new run puts it back. A pigeon
// flock bursting into the air within 2 m of an aiming enemy breaks his aim
// for half a second, and a kill in that half second is a PIGEON STRIKE (+80).
// The flocks are logic (seeded), the birds only follow them.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems, snap } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** Start a run on `map` with the real loop stopped and nobody else around; window.play(n) steps n 60 Hz frames. */
const begin = (page, map) =>
  page.evaluate((map) => {
    const g = window.game;
    g.frame = () => {};
    g.startRun(map);
    g.waves.state = 'done'; // no waves: the test places what it needs
    g.enemies.clear();
    window.play = (n) => {
      for (let i = 0; i < n; i++) {
        g.time += 1 / 60;
        g.player.hp = 100;
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
    window.shoot = (x, z, dx, dz) => g.bullets.spawn({ x, z, dx, dz, speed: 62, owner: 'player', damage: 1 });
  }, map);

test('a crate takes six bullets, breaks apart, opens its nav cells, and comes back next run', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  try {
    await begin(page, 2); // the docks
    const r = await page.evaluate(() => {
      const g = window.game;
      const L = g.level;
      // a crate with open floor 2 m to its west
      const s = L.crates.find((c) => L.nav.isWalkable(c.minX - 2, c.z) && !L.raycast(c.minX - 2, c.z, c.minX - 0.05, c.z));
      g.player.x = s.minX - 6;
      g.player.z = s.z + 3;
      const hp = [];
      for (let i = 0; i < 6; i++) {
        window.shoot(s.minX - 1.5, s.z, 1, 0);
        window.play(6);
        hp.push(s.hp);
        if (i === 4) window.before = { alive: s.alive, walkable: L.nav.isWalkable(s.x, s.z) };
      }
      const through = L.nav.findPath(s.minX - 1.5, s.z, s.maxX + 1.5, s.z);
      // a body walks straight through where it stood
      const body = { x: s.x, z: s.z };
      const pushed = L.collideCircle(body, 0.3);
      return { hp, before: window.before, alive: s.alive, walkable: L.nav.isWalkable(s.x, s.z), los: L.hasLOS(s.minX - 1.5, s.z, s.maxX + 1.5, s.z), through: !!through, pushed, log: g.notes.events.map((e) => e.text).filter((t) => t.includes('木箱')), x: s.x, z: s.z };
    });
    assert.deepEqual(r.hp, [5, 4, 3, 2, 1, 0], 'one hit per bullet');
    assert.deepEqual(r.before, { alive: true, walkable: false }, 'five bullets: still cover');
    assert.equal(r.alive, false, 'the sixth breaks it');
    assert.equal(r.walkable, true, 'its nav cells open');
    assert.equal(r.through, true, 'a path leads through where it stood');
    assert.equal(r.los, true, 'it no longer blocks sight or bullets');
    assert.equal(r.pushed, false, 'nothing pushes a body out of its old footprint');
    assert.deepEqual(r.log, ['木箱碎裂']);
    await page.evaluate(() => window.play(4));
    await snap(page, 'crate-broken.png');
    // a new run puts it back
    const back = await page.evaluate(() => {
      const g = window.game;
      g.startRun(2);
      return g.level.crates.every((c) => c.alive && c.hp === 6 && (c.model || c.mesh).visible && !g.level.nav.isWalkable(c.x, c.z));
    });
    assert.equal(back, true, 'every crate is whole again after a restart');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('pigeons bursting up in front of an aiming enemy break his aim for 0.5 s; a kill then is a PIGEON STRIKE', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  try {
    await begin(page, 3); // the Senado square
    const r = await page.evaluate(() => {
      const g = window.game;
      const L = g.level;
      const f = L.flocks[2];
      const p = g.player;
      p.x = f.x - 7;
      p.z = f.z;
      const near = g.enemies.spawn('grunt', { x: f.x + 1.5, z: f.z, ex: f.x + 1.5, ez: f.z, stay: true });
      const far = g.enemies.spawn('grunt', { x: f.x + 1, z: f.z + 4, ex: f.x + 1, ez: f.z + 4, stay: true });
      window.play(30);
      for (const e of [near, far]) {
        e.state = 'move';
        e.startAim();
      }
      const aiming = [near.state, far.state];
      // a player shot across the flock startles it
      window.shoot(f.x - 2, f.z + 0.6, 1, 0);
      let n = 0;
      while (f.away <= 0 && n++ < 30) window.play(1);
      const after = { near: near.state, far: far.state, blind: near.blindT, away: f.away, gen: f.gen };
      // half a second without aiming, even with the player in sight and his gun ready
      let aimedAgain = false;
      for (let i = 0; i < 24; i++) {
        near.fireCd = Math.max(near.fireCd, 0); // nothing else holds him back
        window.play(1);
        if (near.state === 'aim') aimedAgain = true;
      }
      const birds = L.ambient[0].birds.filter((b) => b.flock === 2).map((b) => b.state);
      const tags = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        tags.push(...t.map((x) => `${x.label} +${x.pts}`));
        return kill0(t);
      };
      near.die(0, 1, { cause: 'bullet' });
      const log = g.notes.events.map((e) => e.text).filter((t) => t.includes('白鴿'));
      return { aiming, after, aimedAgain, stillBlind: near.blindT, birds, tags, log };
    });
    assert.deepEqual(r.aiming, ['aim', 'aim']);
    assert.ok(r.after.away > 0 && r.after.gen === 1, 'the flock took off');
    assert.notEqual(r.after.near, 'aim', 'the enemy within 2 m lost his aim');
    assert.equal(r.after.far, 'aim', 'the one 4 m away kept his');
    assert.ok(r.after.blind > 0.45 && r.after.blind <= 0.5, `blind for ${r.after.blind}`);
    assert.equal(r.aimedAgain, false, 'no new aim inside the half second');
    assert.ok(r.birds.length > 0 && r.birds.every((s) => s === 'flee' || s === 'away'), `the birds flew: ${r.birds.join(' ')}`);
    assert.ok(r.tags.includes('PIGEON STRIKE +80'), r.tags.join(', '));
    assert.deepEqual(r.log, ['白鴿驚起，打斷 1 個敵人的瞄準']);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('a flock bursting up makes a picture', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open();
  try {
    await begin(page, 3);
    await page.evaluate(() => {
      const g = window.game;
      const f = g.level.flocks[0];
      g.player.x = f.x - 3.5;
      g.player.z = f.z + 1.5;
      g.aimPoint.set(f.x, 0, f.z);
      // 1.7 m away: inside the 2 m reach, outside the 1.5 m at which walking up startles the flock
      const e = g.enemies.spawn('grunt', { x: f.x + 1.5, z: f.z - 0.8, ex: f.x + 1.5, ez: f.z - 0.8, stay: true });
      window.play(60);
      e.state = 'move';
      e.startAim();
      window.shoot(f.x - 2, f.z + 0.4, 1, 0);
      window.play(8);
      window.pic = { away: f.away, enemy: e.state, blind: e.blindT };
      g.camTarget.set(f.x - 1, 0, f.z); // between the player and the flock, close enough to see the birds
      g.updateCamera(1, true);
      g.camTarget.set(f.x - 1, 0, f.z);
      g.camera.position.lerp(g.camTarget, 0.5);
      g.render();
    });
    const pic = await page.evaluate(() => window.pic);
    assert.ok(pic.away > 0 && pic.enemy !== 'aim' && pic.blind > 0, JSON.stringify(pic));
    await page.screenshot({ path: new URL('pigeon-strike.png', OUT).pathname });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
