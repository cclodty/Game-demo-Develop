// The sniper (狙擊手), from wave 7: he comes in by a door at least 18 m off,
// stands his ground while he can see the player, holds a long red line on him
// for 2.4 s and fires once for 40; then 2 s with the rifle down, the moment to
// get him. A spin or a slide lets the shot through, as it does any bullet.
// While he aims, the edge of the screen on his side glows red.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=41'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /**
     * A quiet run on `map`, the player on open floor and a sniper `d` m off with a clear line to
     * him (no wall, no pan or barrel near it: a pan would bounce the test's shots), ready to aim.
     */
    window.setup = (map, d = 19) => {
      g.setRules('normal', []);
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const L = g.level;
      const p = g.player;
      const clear = (x, z, sx, sz) =>
        L.props.every((pr) => {
          const t = Math.max(0, Math.min(1, ((pr.x - x) * (sx - x) + (pr.z - z) * (sz - z)) / (d * d)));
          return Math.hypot(pr.x - (x + (sx - x) * t), pr.z - (z + (sz - z) * t)) > 1.2;
        });
      const { halfW, halfD } = L.bounds;
      for (let z = -halfD + 2; z < halfD - 2; z += 2) {
        for (let x = -halfW + 2; x < halfW - 2; x += 2) {
          if (!L.nav.isWalkable(x, z)) continue;
          for (let a = 0; a < 360; a += 10) {
            const sx = x + Math.sin((a * Math.PI) / 180) * d;
            const sz = z + Math.cos((a * Math.PI) / 180) * d;
            if (!L.nav.isWalkable(sx, sz) || !L.hasLOS(sx, sz, x, z) || !clear(x, z, sx, sz)) continue;
            p.x = x;
            p.z = z;
            p.vx = p.vz = 0;
            p.hp = 100;
            const e = g.enemies.spawn('sniper', { x: sx, z: sz, ex: sx, ez: sz + 0.1, stay: true });
            e.spawnLock = 0;
            e.state = 'move';
            e.fireCd = 0;
            window.home = { x, z };
            return e;
          }
        }
      }
      return null;
    };
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120); // one logic step
    };
  });
});
after(async () => {
  await h.close();
});

test('2.4 s on the red line, one shot for 40, then 2 s with the rifle down in which he can be shot', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const e = window.setup(0);
    let n = 0;
    while (e.state !== 'aim' && n++ < 240) window.step();
    let aim = 0;
    const lit = [];
    while (e.state === 'aim' && aim < 600) {
      window.step();
      aim++;
      if (aim === 120) lit.push(e.laser.mesh.visible);
    }
    // the shot, the hit, and the reload window, until he moves again
    const hp0 = g.player.hp;
    const states = new Set();
    let shots = 0;
    let rec = 0;
    n = 0;
    while (e.state !== 'move' && n++ < 600) {
      window.step();
      states.add(e.state);
      if (e.state === 'recover') rec++;
      shots = Math.max(shots, g.bullets.list.filter((b) => b.alive && b.source === e).length);
    }
    return { aim: aim / 120, shots, dmg: hp0 - g.player.hp, window: rec / 120, states: [...states], lit };
  });
  assert.ok(Math.abs(r.aim - 2.4) <= 1 / 120 + 1e-9, `2.4 s aiming (${r.aim})`);
  assert.deepEqual(r.lit, [true], 'the red line is on while he aims');
  assert.equal(r.shots, 1, 'then one shot');
  assert.equal(r.dmg, 40, '40 damage');
  assert.ok(Math.abs(r.window - 2) <= 1 / 120 + 1e-9, `2 s with the rifle down (${r.window})`);
  assert.ok(!r.states.includes('aim'), `no aiming in the window (${r.states})`);
  // and in the window he can be killed
  const k = await page.evaluate(() => {
    const g = window.game;
    const e = window.setup(0);
    let n = 0;
    while (e.state !== 'recover' && n++ < 800) window.step();
    // (his shot still in the air would meet ours: a DEFLECT)
    while (g.bullets.list.some((b) => b.alive && b.source === e)) window.step();
    const inWindow = e.state === 'recover';
    const d = Math.hypot(e.x - g.player.x, e.z - g.player.z);
    for (let i = 0; i < 3; i++) g.bullets.spawn({ x: g.player.x, z: g.player.z, dx: (e.x - g.player.x) / d, dz: (e.z - g.player.z) / d, speed: 62, owner: 'player', damage: 1 });
    n = 0;
    while (e.alive && e.state === 'recover' && n++ < 120) window.step();
    return { inWindow, dead: e.dead, state: e.state };
  });
  assert.equal(k.inWindow, true);
  assert.equal(k.dead, true, `killed while reloading (${k.state})`);
});

test('a spin or a slide lets the shot through', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = {};
    for (const how of ['spin', 'slide', 'none']) {
      const e = window.setup(0);
      let n = 0;
      while (e.state !== 'fire' && n++ < 800) window.step();
      const p = g.player;
      if (how === 'spin') p.spinT = 0.5;
      if (how === 'slide') p.slideT = 0.5;
      // the player is held where he stands, so only the move itself can let the shot through
      const hold = () => {
        p.x = window.home.x;
        p.z = window.home.z;
        p.vx = p.vz = 0;
      };
      n = 0;
      while (!g.bullets.list.some((b) => b.alive && b.source === e) && n++ < 30) {
        window.step();
        hold();
      }
      n = 0;
      while (g.bullets.list.some((b) => b.alive && b.source === e) && n++ < 120) {
        window.step();
        hold();
      }
      out[how] = 100 - p.hp;
    }
    return out;
  });
  assert.deepEqual(r, { spin: 0, slide: 0, none: 40 });
});

test('he comes in by a door at least 18 m from the player; others still by the nearer ones', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = [];
    for (let map = 0; map < g.maps.length; map++) {
      window.setup(map);
      g.enemies.clear();
      const L = g.level;
      const S = L.spawns;
      g.waves.order = S.map((_, i) => i); // (a wave's door order; this quiet run has none)
      g.waves.orderI = 0;
      for (const [px, pz] of [L.map.start, [0, 0]]) {
        g.player.x = px;
        g.player.z = pz;
        const dist = (sp) => Math.hypot(sp.ex - px, sp.ez - pz);
        const far = S.some((sp) => dist(sp) > 18 && dist(sp) < 45);
        for (let i = 0; i < S.length; i++) {
          const d = dist(g.waves.pickSpawn('sniper'));
          out.push({ map: L.map.id, far, ok: far ? d > 18 : d === Math.max(...S.map(dist)) });
        }
        const grunt = dist(g.waves.pickSpawn('grunt'));
        out.push({ map: L.map.id, grunt: grunt > 7.5 });
      }
    }
    return out;
  });
  for (const o of r) {
    if ('grunt' in o) assert.ok(o.grunt, `${o.map}: a thug's door`);
    else assert.ok(o.ok, `${o.map}: ${o.far ? 'a door over 18 m' : 'the furthest door'}`);
  }
});

test('while he aims, the screen edge on his side glows red, blinking in his last half second', async () => {
  const look = (until) =>
    page.evaluate((until) => {
      const g = window.game;
      const e = g.enemies.list[0];
      let n = 0;
      while ((e.state !== 'aim' || e.aimT < until) && n++ < 800) window.step();
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      const w = [...document.querySelectorAll('#indicators .snipe-warn')].filter((x) => x.style.display === 'block');
      const m = (w[0].style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/) || []).slice(1).map(Number);
      const p = g.hud.project(g.player.x, 1, g.player.z);
      const s = g.hud.project(e.x, 1, e.z);
      g.render();
      return {
        glows: w.length,
        onEdge: Math.min(m[0], innerWidth - m[0], m[1], innerHeight - m[1]) < 2,
        // on his side of the player, as seen on the screen
        side: (m[0] - p.x) * (s.x - p.x) + (m[1] - p.y) * (s.y - p.y) > 0,
        hot: w[0].classList.contains('hot'),
      };
    }, until);
  const before = await page.evaluate(() => {
    const g = window.game;
    window.setup(0, 21);
    g.hud.update(1 / 60);
    return [...document.querySelectorAll('#indicators .snipe-warn')].filter((w) => w.style.display === 'block').length;
  });
  const mid = await look(1.5);
  await page.screenshot({ path: new URL('sniper-aim.png', OUT).pathname });
  const late = await look(1.9);
  const after = await page.evaluate(() => {
    const g = window.game;
    g.enemies.clear();
    g.hud.update(1 / 60);
    return [...document.querySelectorAll('#indicators .snipe-warn')].filter((w) => w.style.display === 'block').length;
  });
  assert.equal(before, 0, 'nothing before he aims');
  assert.deepEqual(mid, { glows: 1, onEdge: true, side: true, hot: false });
  assert.deepEqual(late, { glows: 1, onEdge: true, side: true, hot: true });
  assert.equal(after, 0, 'gone once nobody aims');
  assert.deepEqual(problems(logs), []);
});
