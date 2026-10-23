// The bomber (新敵人：炸彈客): from wave 6, at most two a wave. He runs at the
// player; within 1.5 m his vest lights, he stands and beeps, and 0.4 s later
// it goes off with a barrel's blast (no kill for anyone). Shot dead he goes
// off a moment later wherever he lies, and whoever his blast kills is a
// CHAIN (+120). A kick sends his charge the way the kick went; kicked into
// his own people, he lights up among them.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=23'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    g.startRun(1); // the club: plain barrels, open floor in the middle
    g.waves.state = 'done';
    g.enemies.clear();
    /** Step n 60 Hz frames; the player's health is topped up unless `hurt` is set. */
    window.play = (n, hurt = false) => {
      for (let i = 0; i < n; i++) {
        if (!hurt) g.player.hp = 100;
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
    window.tags = [];
    const kill0 = g.score.kill.bind(g.score);
    g.score.kill = (t) => {
      window.tags.push(t.map((x) => `${x.label} +${x.pts}`));
      return kill0(t);
    };
    window.booms = [];
    const explode0 = g.explode.bind(g);
    g.explode = (x, z, r, opts = {}) => {
      window.booms.push({ x, z, r, chain: !!opts.chain });
      return explode0(x, z, r, opts);
    };
    /** A fresh scene: the player at (px, pz), nobody else, nothing burning. */
    window.reset = (px, pz) => {
      g.enemies.clear();
      g.player.x = px;
      g.player.z = pz;
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.player.invuln = 0;
      window.tags = [];
      window.booms = [];
    };
    /** An enemy of `type` at (x, z) who has finished walking in. */
    window.put = (type, x, z, state) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.01, stay: true });
      e.spawnLock = 0;
      e.state = state || (type === 'bomber' ? 'chase' : 'idle');
      return e;
    };
  });
});
after(async () => {
  await h.close();
});

test('within 1.5 m he lights up, stands, and 0.4 s later goes off with a barrel blast', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.reset(0, 3);
    const e = window.put('bomber', 0, -5);
    let n = 0;
    while (e.fuseT < 0 && n++ < 240) window.play(1);
    const litAt = Math.hypot(e.x - p.x, e.z - p.z);
    const log = g.notes.events.at(-1).text;
    // he stands and beeps; the player stays put and takes it
    let steps = 0;
    while (e.alive && steps++ < 120) {
      p.x = 0;
      p.z = 3;
      p.vx = p.vz = 0;
      g.player.hp = 100;
      g.updatePlay(1 / 120);
    }
    const fuse = steps / 120;
    const boom = window.booms[0];
    const d = Math.hypot(boom.x - 0, boom.z - 3);
    const lost = 100 - p.hp;
    const selfLog = g.notes.events.map((x) => x.text).filter((t) => t.includes('炸彈客'));
    // the same blast from a barrel, standing where he stood
    window.reset(0, 3);
    const b = g.level.barrels.find((q) => q.blast === boom.r);
    b.x = boom.x;
    b.z = boom.z;
    b.alive = true;
    b.ignite(0.001);
    for (let i = 0; i < 4 && window.booms.length === 0; i++) {
      p.x = 0;
      p.z = 3;
      g.updatePlay(1 / 120);
    }
    return { litAt, log, fuse, lost, barrel: 100 - p.hp, d, r: boom.r, tags: window.tags.length, selfLog, dead: !e.alive };
  });
  assert.ok(r.litAt <= 1.5 && r.litAt > 1.2, `lit at ${r.litAt.toFixed(2)} m`);
  assert.equal(r.log, '炸彈客點火');
  assert.ok(Math.abs(r.fuse - 0.4) < 0.02, `went off after ${r.fuse.toFixed(3)} s`);
  assert.equal(r.dead, true);
  assert.equal(r.r, 4.4, "a plain barrel's blast radius");
  assert.ok(r.lost > 0, `the player took ${r.lost}`);
  assert.equal(r.lost, r.barrel, `the bomber did ${r.lost}, a barrel at ${r.d.toFixed(2)} m does ${r.barrel}`);
  assert.equal(r.tags, 0, 'going off on his own is nobody’s kill');
  assert.deepEqual(r.selfLog, ['炸彈客點火', '炸彈客自爆', `被炸彈客爆炸打中 −${r.lost}（HP ${100 - r.lost}）`], 'the notes say who hurt the player');
});

test('shot dead he goes off where he lies; kills in his blast are CHAIN +120, and a second bomber chains on', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.reset(0, 8);
    const e = window.put('bomber', 0, -4, 'idle');
    const near = window.put('grunt', 1.4, -4.5);
    const other = window.put('bomber', -2.2, -3.6, 'idle');
    const far = window.put('grunt', -5.2, -3.2); // only the second bomber reaches him
    for (const x of [e, near, other, far]) x.facing = 0;
    // as many shots as he has health (config.js ENEMY_HP), all from the same place
    for (let i = 0; i < Math.ceil(e.hp); i++) g.bullets.spawn({ x: 0, z: 2, dx: 0, dz: -1, speed: 62, owner: 'player', damage: 1 });
    window.play(40);
    return { tags: window.tags, booms: window.booms.map((b) => b.chain), alive: [e, near, other, far].map((x) => x.alive), hp: p.hp };
  });
  assert.deepEqual(r.alive, [false, false, false, false]);
  assert.deepEqual(r.booms, [true, true], 'two bomber blasts');
  assert.deepEqual(r.tags[0], ['BOMBER +150'], 'the shot bomber');
  const chained = r.tags.slice(1);
  assert.equal(chained.length, 3);
  for (const t of chained) {
    assert.ok(t.includes('CHAIN +120'), t.join(', '));
    assert.ok(!t.includes('BOOM +120'), 'CHAIN replaces BOOM');
  }
  // a barrel's blast still says BOOM
  const boom = await page.evaluate(() => {
    const g = window.game;
    window.reset(0, 8);
    const e = window.put('grunt', 0, -4);
    const b = g.level.barrels.find((q) => q.blast === 4.4);
    b.x = 0.8;
    b.z = -4;
    b.alive = true;
    b.ignite(0.001);
    window.play(4);
    return { tags: window.tags, alive: e.alive };
  });
  assert.equal(boom.alive, false);
  assert.ok(boom.tags[0].includes('BOOM +120') && !boom.tags[0].includes('CHAIN +120'), boom.tags[0].join(', '));
});

test('a kick sends his charge the way the kick went, until he gives up and comes back', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const L = g.level;
    // a spot with 14 m of open floor to the north of where he gets kicked
    let at = null;
    for (const [x, z] of [[0, 4], [-4, 4], [4, 4], [0, 8], [-8, 6], [8, 6]]) {
      if (L.nav.lineWalkable(x, z - 2, x, z - 16) && L.nav.isWalkable(x, z)) {
        at = { x, z };
        break;
      }
    }
    window.reset(at.x, at.z);
    p.facing = Math.PI; // looking north, at him
    const e = window.put('bomber', at.x, at.z - 6);
    let n = 0;
    while (Math.hypot(e.x - p.x, e.z - p.z) > 2.2 && n++ < 240) window.play(1);
    const before = e.vz; // running south at the player
    p.facing = Math.PI;
    p.kickCd = 0;
    p.kick();
    const log = g.notes.events.at(-1).text;
    // after the kick's flight: still charging north, away from the player
    const vz = [];
    for (let i = 0; i < 150; i++) {
      p.x = at.x;
      p.z = at.z;
      window.play(1);
      if (e.stunT <= 0 && e.turnT > 0) vz.push(e.vz);
    }
    const far = Math.hypot(e.x - p.x, e.z - p.z);
    // then he turns back for the player
    window.play(30);
    return { at, before, log, vz, far, after: e.vz, alive: e.alive, lit: e.fuseT >= 0 };
  });
  assert.ok(r.before > 2, `he charged at the player (vz ${r.before.toFixed(1)})`);
  assert.equal(r.log, '踢中炸彈客，衝刺轉向');
  assert.ok(r.vz.length > 30, `he charged the new way for ${r.vz.length} frames`);
  assert.ok(r.vz.slice(10).every((v) => v < -3), 'north, away from the player');
  assert.ok(r.far > 6, `he ran off to ${r.far.toFixed(1)} m`);
  assert.equal(r.alive, true);
  assert.ok(r.after > 2, `then came back (vz ${r.after.toFixed(1)})`);
  assert.deepEqual(problems(logs), []);
});

test('kicked into his own people he lights up among them, and their deaths are CHAIN', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const L = g.level;
    let at = null;
    for (const [x, z] of [[0, 4], [-4, 4], [4, 4], [0, 8], [-8, 6], [8, 6]]) {
      if (L.nav.lineWalkable(x, z - 1, x, z - 8) && L.nav.isWalkable(x, z)) {
        at = { x, z };
        break;
      }
    }
    window.reset(at.x, at.z);
    const e = window.put('bomber', at.x, at.z - 2);
    const a = window.put('grunt', at.x - 0.6, at.z - 6.2);
    const b = window.put('grunt', at.x + 0.7, at.z - 6);
    p.facing = Math.PI;
    p.kickCd = 0;
    p.kick();
    let n = 0;
    while (e.fuseT < 0 && e.alive && n++ < 120) window.play(1);
    const litNear = Math.min(Math.hypot(a.x - e.x, a.z - e.z), Math.hypot(b.x - e.x, b.z - e.z));
    const toPlayer = Math.hypot(p.x - e.x, p.z - e.z);
    const hp = p.hp;
    window.play(40, true);
    return { litNear, toPlayer, lost: hp - p.hp, alive: [a.alive, b.alive], tags: window.tags, booms: window.booms.length };
  });
  assert.ok(r.litNear < 1.5, `lit ${r.litNear.toFixed(2)} m from a thug`);
  assert.ok(r.toPlayer > 3, `${r.toPlayer.toFixed(1)} m from the player`);
  assert.equal(r.booms, 1);
  assert.deepEqual(r.alive, [false, false], 'both thugs went with him');
  assert.equal(r.tags.length, 2);
  for (const t of r.tags) assert.ok(t.includes('CHAIN +120'), t.join(', '));
  assert.equal(r.lost, 0, 'the player stood clear');
});

test('bombers come from wave 6, at most two a wave', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const per = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      g.rng.reset(seed);
      for (let n = 1; n <= 12; n++) per.push([n, g.waves.compose(n).filter((t) => t === 'bomber').length]);
    }
    return per;
  });
  assert.ok(r.filter(([n]) => n < 6).every(([, c]) => c === 0), 'none before wave 6');
  assert.ok(r.every(([, c]) => c <= 2), 'never more than two in a wave');
  assert.ok(r.some(([n, c]) => n >= 6 && c > 0), 'they do show up');
});

test('pictures: a lit bomber in front of the player, and a chain going off', async () => {
  /** A fresh run on `map`, nobody about; the player at its start. */
  const fresh = (map) =>
    page.evaluate((map) => {
      const g = window.game;
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      const s = g.level.start;
      window.reset(s.x, s.z);
      return { x: s.x, z: s.z };
    }, map);
  /** Frame the camera between the player and (x, z), closer than in play. */
  const frame = (x, z) =>
    page.evaluate(
      ([x, z]) => {
        const g = window.game;
        g.camTarget.set(x, 0, z);
        g.updateCamera(1, true);
        g.camTarget.set(x, 0, z);
        g.camera.position.lerp(g.camTarget, 0.6);
        g.render();
      },
      [x, z],
    );
  let s = await fresh(3); // the Senado square in daylight shows his vest best
  await page.evaluate((s) => {
    const g = window.game;
    g.aimPoint.set(s.x, 0, s.z - 4);
    const e = window.put('bomber', s.x, s.z - 5);
    let n = 0;
    while (e.fuseT < 0 && n++ < 240) window.play(1);
    window.play(5);
  }, s);
  await frame(s.x, s.z - 1);
  await snap(page, 'bomber-lit.png');
  s = await fresh(1); // the club at night shows the blast best
  await page.evaluate((s) => {
    const g = window.game;
    g.aimPoint.set(s.x, 0, s.z - 6);
    const e = window.put('bomber', s.x, s.z - 6, 'idle');
    window.put('grunt', s.x + 1.4, s.z - 6.5);
    window.put('grunt', s.x - 1.2, s.z - 5.4);
    e.die(0, -1, { cause: 'bullet' }); // shot from where the player stands
    let n = 0;
    while (window.booms.length === 0 && n++ < 60) window.play(1);
    window.play(5);
  }, s);
  await frame(s.x, s.z - 3.5);
  await snap(page, 'bomber-chain.png');
  assert.deepEqual(problems(logs), []);
});
