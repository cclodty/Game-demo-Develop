// Every pickup weapon fires, the E swap is deterministic, and a long looting
// run through stage changes stays error-free. Slow: npm run test:game
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from '../helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open());
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    g.startRun(0);
    const S = (window.S = { errors: [], pickups: 0, swaps: 0, maps: [], transitions: 0, shotsByWeapon: {}, grenades: 0, kills: 0 });
    const give0 = g.player.giveWeapon.bind(g.player);
    g.player.giveWeapon = (k, a, r) => {
      S.pickups++;
      if (r) S.swaps++;
      return give0(k, a, r);
    };
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.owner === 'player') S.shotsByWeapon[o.weapon || 'pistols'] = (S.shotsByWeapon[o.weapon || 'pistols'] || 0) + 1;
      return spawn0(o);
    };
    const grenade0 = g.grenades.spawn.bind(g.grenades);
    g.grenades.spawn = (...a) => {
      S.grenades++;
      return grenade0(...a);
    };
    const transition0 = g.beginStageTransition.bind(g);
    g.beginStageTransition = () => {
      S.transitions++;
      return transition0();
    };
    let i = 0;
    window.step = (n, opts = {}) => {
      const inp = g.input;
      for (let k = 0; k < n; k++, i++) {
        g.time += 1 / 60;
        inp.pressed.clear();
        inp.keys.clear();
        inp.wheel = 0;
        inp.mouse.leftPressed = inp.mouse.rightPressed = inp.mouse.rightReleased = false;
        const p = g.player;
        if (opts.god) p.hp = 100;
        let t = null;
        let best = 1e9;
        for (const e of g.enemies.list) {
          if (!e.alive || e.state === 'enter') continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d < best) {
            best = d;
            t = e;
          }
        }
        let goal = null;
        if (opts.loot && !p.special) {
          for (const q of g.pickups.list) {
            const d = Math.hypot(q.x - p.x, q.z - p.z);
            if (!goal || d < goal.d) goal = { x: q.x, z: q.z, d };
          }
        }
        if (goal) {
          const path = g.level.nav.findPath(p.x, p.z, goal.x, goal.z);
          const wp = path && path[0];
          if (wp) {
            const dx = wp.x - p.x;
            const dz = wp.z - p.z;
            if (dx > 0.3) inp.keys.add('KeyD');
            if (dx < -0.3) inp.keys.add('KeyA');
            if (dz > 0.3) inp.keys.add('KeyS');
            if (dz < -0.3) inp.keys.add('KeyW');
          }
        }
        if (t) {
          const v = new g.aimPoint.constructor(t.x, 1.35, t.z).project(g.camera);
          inp.mouse.x = (v.x * 0.5 + 0.5) * innerWidth;
          inp.mouse.y = (-v.y * 0.5 + 0.5) * innerHeight;
          inp.mouse.left = true;
        } else inp.mouse.left = opts.fire === true;
        if (opts.focus && g.enemies.list.some((e) => e.aiming) && !g.focusActive && g.focusMeter > 0.5) inp.pressed.add('ShiftLeft');
        if (opts.swapSlots && i % 700 === 300 && p.special) inp.pressed.add(p.slot === 'pistols' ? 'Digit2' : 'Digit1');
        try {
          g.updateAim();
          if (g.state === 'playing' || g.state === 'dying') g.updatePlay(1 / 60);
          else g.updateIdle(1 / 60);
        } catch (err) {
          S.errors.push(String((err && err.stack) || err));
          return false;
        }
        const id = g.level.map.id;
        if (S.maps[S.maps.length - 1] !== id) S.maps.push(id);
        if (g.state === 'over') {
          S.errors.push('died in god mode');
          g.startRun(0);
        }
      }
      S.kills = g.score.kills;
      return true;
    };
  });
});
after(async () => {
  await h.close();
});

const KINDS = ['smg', 'shotgun', 'rifle', 'sniper', 'launcher', 'minigun'];

test('every pickup weapon fires', { timeout: 10 * 60 * 1000 }, async () => {
  await page.evaluate(() => window.step(60 * 4, { god: true }));
  for (const k of KINDS) {
    const shots = await page.evaluate((k) => {
      const g = window.game;
      const before = window.S.shotsByWeapon[k] || 0;
      g.player.giveWeapon(k, 999);
      // aim at the far side of the map so there is always something to shoot at
      g.input.mouse.x = 900;
      g.input.mouse.y = 200;
      window.step(60 * 2.5, { god: true, fire: true, focus: k === 'shotgun' || k === 'sniper' });
      const p = g.player;
      return { n: (window.S.shotsByWeapon[k] || 0) - before + (k === 'launcher' ? window.S.grenades : 0), debug: { held: p.weapon.id, slot: p.slot, special: p.special, fireCd: p.fireCd, reloadT: p.reloadT, state: g.state, counts: window.S.shotsByWeapon } };
    }, k);
    await snap(page, `weapon-${k}.png`);
    assert.ok(shots.n > 0, `${k} never fired: ${JSON.stringify(shots.debug)}`);
  }
});

test('E swaps the held weapon for the one on the floor, deterministically', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    g.pickups.clear();
    p.giveWeapon('shotgun', 10);
    g.pickups.spawn('sniper', p.x, p.z, { ammo: 7 });
    window.step(1, { god: true });
    const clear0 = g.input.pressed.clear.bind(g.input.pressed);
    g.input.pressed.clear = () => {};
    g.input.pressed.add('KeyE');
    g.updatePlay(1 / 60);
    g.input.pressed.clear = clear0;
    g.input.pressed.clear();
    const out = { special: p.special && p.special.id, ammo: p.special && p.special.ammo, floor: g.pickups.list.map((q) => `${q.kind}:${q.ammo}`) };
    g.pickups.clear();
    p.special = null;
    p.equip('pistols');
    return out;
  });
  assert.equal(r.special, 'sniper');
  assert.equal(r.ammo, 7);
  assert.ok(r.floor.includes('shotgun:10'), `the shotgun should be on the floor, got ${r.floor}`);
});

test('a long looting run through stage changes has no errors', { timeout: 20 * 60 * 1000 }, async () => {
  for (let c = 0; c < Number(process.env.WEAPON_CHUNKS || 24); c++) {
    const ok = await page.evaluate(() => window.step(60 * 5, { god: true, loot: true, focus: true, swapSlots: true }));
    if (!ok) break;
  }
  const S = await page.evaluate(() => ({ ...window.S, wave: window.game.waves.wave }));
  console.log(`wave ${S.wave}, maps ${S.maps.join(' → ')}, pickups ${S.pickups}, swaps ${S.swaps}, shots ${JSON.stringify(S.shotsByWeapon)}`);
  assert.deepEqual(S.errors, []);
  assert.ok(S.wave >= 2);
  assert.deepEqual(problems(logs), []);
});
