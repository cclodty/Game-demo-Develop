// The grenadier (擲彈兵), from wave 5, at most two a wave: he keeps his distance
// and lobs a grenade over any cover onto where the player stands. A red ring
// marks the spot for the 2.5 s it is in the air; it lands, waits 0.5 s and goes
// off with a 3 m blast. A bullet that meets it in the air sets it off there
// (AIRBURST, +150); a kick in those 0.5 s on the ground sends it back.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=31'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on `map`: nobody about, the player at (x, z) with full health. */
    window.run = (map, x = 0, z = 3) => {
      g.setRules('normal', []);
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.player.x = x;
      g.player.z = z;
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.killcamT = 0;
      g.hitstopT = 0;
      g.setFocus(false);
    };
    /** n 60 Hz frames aiming at (ax, az). */
    window.frames = (n, ax = g.player.x, az = g.player.z - 5) => {
      for (let i = 0; i < n; i++) {
        g.aimPoint.set(ax, g.aimPoint.y, az);
        g.aimFresh = true;
        g.killcamT = 0;
        g.hitstopT = 0;
        g.updatePlay(1 / 60);
      }
    };
    window.grenadier = (x, z, fireCd = 99) => {
      const e = g.enemies.spawn('grenadier', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = fireCd;
      return e;
    };
    window.enemyGrenades = () => g.grenades.list.filter((x) => x.owner === 'enemy');
  });
});
after(async () => {
  await h.close();
});

test('he lobs over cover onto where the player stands: a ring for 2.5 s, 0.5 s on the ground, then the blast', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    // a wall with open floor on both sides: the player 1 m behind it, the grenadier 9 m in front
    let spot = null;
    for (let map = 0; map < g.maps.length && !spot; map++) {
      window.run(map);
      const L = g.level;
      for (const s of L.solids) {
        if (s.poly || s.kind === 'glass' || s.h < 1.4 || s.maxX - s.minX < 1.4) continue;
        const x = (s.minX + s.maxX) / 2;
        const p = { x, z: s.maxZ + 1 };
        const e = { x, z: s.minZ - 9 };
        if (!L.nav.isWalkable(p.x, p.z) || !L.nav.isWalkable(e.x, e.z) || L.hasLOS(e.x, e.z, p.x, p.z)) continue;
        spot = { map, p, e };
        break;
      }
    }
    window.run(spot.map, spot.p.x, spot.p.z);
    const e = window.grenadier(spot.e.x, spot.e.z, 0);
    let steps = 0;
    while (!window.enemyGrenades().length && steps < 600) {
      window.frames(1);
      steps += 2;
    }
    const gr = window.enemyGrenades()[0];
    const thrown = { ring: [gr.ring.position.x, gr.ring.position.z], player: [g.player.x, g.player.z], los: g.level.hasLOS(e.x, e.z, g.player.x, g.player.z), r: gr.r };
    // in flight: count the steps to the ground (no bullet time, nothing slowing the world)
    let flight = 0;
    while (!gr.landed && flight < 1200) {
      window.frames(1);
      flight += 2;
    }
    const landed = { at: [gr.x, gr.z], flight: flight / 120 };
    // on the ground: it waits, then goes off on the player who stayed
    const hp0 = g.player.hp;
    let fuse = 0;
    while (g.grenades.list.includes(gr) && fuse < 240) {
      window.frames(1);
      fuse += 2;
    }
    return {
      map: g.level.map.id,
      thrown,
      landed,
      fuse: fuse / 120,
      hurt: hp0 - g.player.hp,
      log: g.notes.events.map((x) => x.text).filter((t) => t.includes('GRENADIER 的榴彈')),
      ringGone: !g.scene.children.includes(gr.ring),
    };
  });
  assert.equal(r.thrown.los, false, `on ${r.map} the wall is between them`);
  assert.ok(Math.hypot(r.thrown.ring[0] - r.thrown.player[0], r.thrown.ring[1] - r.thrown.player[1]) < 0.05, 'the ring is where the player stood');
  assert.equal(r.thrown.r, 3, 'a 3 m blast');
  assert.ok(Math.abs(r.landed.flight - 2.5) <= 1 / 60, `2.5 s in the air (${r.landed.flight})`);
  assert.ok(Math.hypot(r.landed.at[0] - r.thrown.ring[0], r.landed.at[1] - r.thrown.ring[1]) < 0.01, 'it lands in the ring');
  assert.ok(Math.abs(r.fuse - 0.5) <= 1 / 60, `0.5 s on the ground (${r.fuse})`);
  assert.ok(r.hurt >= 40, `the player who stayed took the blast (${r.hurt})`);
  assert.ok(r.log.length >= 1, 'the hit names the grenadier');
  assert.equal(r.ringGone, true);
});

test('a bullet meets the grenade in the air: AIRBURST, +150, and it never lands', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { TYPES } = await import('/src/enemies.js');
    window.run(1);
    const e = window.grenadier(0, -9);
    window.frames(2);
    g.grenades.lob(e.x, e.z, g.player.x, g.player.z, TYPES.grenadier.lob, e);
    const gr = window.enemyGrenades()[0];
    while (gr.t < 1.2) window.frames(1);
    const s0 = g.score.score;
    const dx = gr.x - g.player.x;
    const dz = gr.z - g.player.z;
    const d = Math.hypot(dx, dz);
    g.bullets.spawn({ x: g.player.x, z: g.player.z, dx: dx / d, dz: dz / d, speed: 62, owner: 'player', damage: 1 });
    let n = 0;
    while (g.grenades.list.includes(gr) && n++ < 30) window.frames(1); // about 6 m: six frames
    return {
      gone: !g.grenades.list.includes(gr),
      landed: gr.landed,
      points: g.score.score - s0,
      log: g.notes.events.map((x) => x.text).filter((t) => t.includes('AIRBURST')),
      hp: g.player.hp,
    };
  });
  assert.equal(r.gone, true, 'set off');
  assert.equal(r.landed, false, 'in the air');
  assert.ok(r.points >= 150, `AIRBURST points (${r.points})`);
  assert.deepEqual(r.log, ['空中射爆榴彈（AIRBURST）']);
  assert.equal(r.hp, 100, 'far enough from the player');
});

test('kicked back in its half second on the ground, it kills the grenadier who threw it', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { TYPES } = await import('/src/enemies.js');
    window.run(1);
    const e = window.grenadier(0, -6);
    window.frames(2);
    g.grenades.lob(e.x, e.z, 0, 2.2, TYPES.grenadier.lob, e); // just in front of the player
    const gr = window.enemyGrenades()[0];
    while (!gr.landed) window.frames(1, 0, -6);
    g.player.kickCd = 0;
    g.input.pressed.add('KeyF');
    window.frames(1, 0, -6);
    const owner = gr.owner;
    let n = 0;
    while (g.grenades.list.includes(gr) && n++ < 120) window.frames(1, 0, -6);
    window.frames(4, 0, -6);
    return {
      owner,
      dead: e.dead,
      kill: g.notes.events.map((x) => x.text).filter((t) => t.startsWith('擊殺 GRENADIER')),
      kicked: g.notes.events.some((x) => x.text === '踢回榴彈'),
      hp: g.player.hp,
    };
  });
  assert.equal(r.owner, 'kicked');
  assert.equal(r.kicked, true);
  assert.equal(r.dead, true, 'it went back and got him');
  assert.match(r.kill[0], /BOOM/);
  assert.equal(r.hp, 100, 'and the player is untouched');
});

test('from wave 5, never more than two a wave', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { Rng } = await import('/src/rng.js');
    g.setMode('arcade');
    const per = {};
    let max = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (let n = 1; n <= 12; n++) {
        const k = g.waves.compose(n, new Rng(seed * 100 + n)).filter((t) => t === 'grenadier').length;
        per[n] = (per[n] || 0) + k;
        max = Math.max(max, k);
      }
    }
    return { per, max };
  });
  for (let n = 1; n <= 4; n++) assert.equal(r.per[n], 0, `none in wave ${n}`);
  for (let n = 5; n <= 12; n++) assert.ok(r.per[n] > 0, `some in wave ${n}`);
  assert.equal(r.max, 2, 'two at most');
});

test('a grenade in the air, its ring, and nothing logged as a problem', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.run(1);
    const e = window.grenadier(-1.5, -8);
    e.facing = Math.atan2(1.5, 11);
    window.frames(2);
    e.fireCd = 0;
    let n = 0;
    while (!window.enemyGrenades().length && n++ < 300) window.frames(1);
    const gr = window.enemyGrenades()[0];
    while (gr.t < 1.7) window.frames(1);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('grenadier-lob.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
