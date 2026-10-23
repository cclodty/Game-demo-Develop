// Enemy moves ①: the dodge roll (試玩回饋 ④, DECISIONS 2026-10-23). A gunman
// or a blade with the player's aim on him (game.cmd) for AI.dodge.watch s
// while the player fires crouches for AI.dodge.tell s (the tell), then rolls
// AI.dodge.dist m to the side, off the line of fire; once each AI.dodge.cooldown
// s. A brute, a shield man and a drone never roll; nobody rolls into a wall
// or off the floor. The way through: bullet time shows the tell, and he is
// shot as he lands, or where he will land.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { AI } from '../src/config.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;

/** The page's helpers: a run on the rooftop with nobody about; `aimed(e, s)` holds the fire button with the aim on him for `s` s. */
async function setup(p) {
  await p.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.begin = (type, dx = 0, dz = -8, map = 0) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      // open floor: the player and him with 3 m clear to either side of him
      const L = g.level;
      let at = null;
      for (const [x, z] of [[0, 4], [-6, 4], [6, 4], [0, 8], [-8, 8], [8, 8], [-4, 0], [4, 0]]) {
        const ex = x + dx;
        const ez = z + dz;
        if (L.nav.isWalkable(x, z) && L.nav.lineWalkable(ex - 3.2, ez, ex + 3.2, ez) && L.hasLOS(x, z, ex, ez)) {
          at = [x, z];
          break;
        }
      }
      if (at) [p.x, p.z] = at; // else where the map starts him
      p.vx = p.vz = 0;
      const e = g.enemies.spawn(type, { x: p.x + dx, z: p.z + dz, ex: p.x + dx, ez: p.z + dz + 0.1, stay: true });
      e.state = e.rushes ? 'chase' : 'move';
      e.spawnLock = 0;
      e.hp = 1e6; // the shots do not end it
      e.fireCd = 99; // nor do his
      return e;
    };
    /** One logic step with the fire button held and the aim on `at` (or off to the side), the player standing, unhurt. */
    window.step = (at, fire = true) => {
      const p = g.player;
      g.killcamT = g.hitstopT = 0;
      p.hp = 100;
      p.vx = p.vz = 0;
      g.aimPoint.set(at ? at.x : p.x + 6, g.aimPoint.y, at ? at.z : p.z);
      g.aimFresh = true;
      g.input.mouse.left = fire;
      g.updatePlay(1 / 120);
      g.input.mouse.left = false;
    };
    /** Fire at `e` (the aim following him) for `s` s; what he did, step by step. */
    window.aimed = (e, s) => {
      const out = [];
      for (let i = 0; i < Math.round(s * 120); i++) {
        window.step(e);
        out.push({ t: (i + 1) / 120, state: e.state, x: e.x, z: e.z });
      }
      return out;
    };
  });
}

before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=53'));
  await setup(page);
});
after(async () => {
  await h.close();
});

/** When each state was first seen in a trace. */
const first = (trace, state) => (trace.find((s) => s.state === state) || {}).t ?? null;

test('fired at, a thug crouches (the tell) within 1 s, then rolls off the line of fire, 1.5 m or more; no second roll inside the cooldown', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const e = window.begin('grunt');
    const p = g.player;
    const from = { x: e.x, z: e.z };
    const line = { x: p.x, z: p.z };
    const trace = window.aimed(e, 4);
    const rolled = trace.findIndex((s) => s.state === 'roll');
    const landed = trace.findIndex((s, i) => i > rolled && s.state !== 'roll');
    const start = rolled > 0 ? trace[rolled - 1] : from; // where he was as the roll began
    const at = trace[landed];
    const notes = g.notes.events.slice(-30).map((x) => x.text);
    return { trace, from: start, line, at, notes, label: e.cfg.label };
  });
  const tell = first(r.trace, 'tell');
  const roll = first(r.trace, 'roll');
  assert.ok(tell !== null && tell <= 1, `the tell at ${tell} s`);
  assert.ok(tell >= AI.dodge.watch - 1e-9, `not before ${AI.dodge.watch} s of aim (${tell})`);
  assert.ok(roll !== null && Math.abs(roll - tell - AI.dodge.tell) < 0.02, `the roll ${AI.dodge.tell} s after the tell (${roll - tell})`);
  // off the line from the player through where he stood
  const dx = r.from.x - r.line.x;
  const dz = r.from.z - r.line.z;
  const l = Math.hypot(dx, dz);
  const off = Math.abs((r.at.x - r.line.x) * dz - (r.at.z - r.line.z) * dx) / l;
  assert.ok(off >= 1.5, `${off.toFixed(2)} m off the line of fire`);
  assert.ok(Math.abs(Math.hypot(r.at.x - r.from.x, r.at.z - r.from.z) - AI.dodge.dist) < 0.3, 'about AI.dodge.dist from where the roll began');
  // the rest of the 4 s, still fired at: no second roll before the cooldown is out
  const tells = r.trace.filter((s, i) => s.state === 'tell' && (i === 0 || r.trace[i - 1].state !== 'tell'));
  assert.ok(tells.length === 1 || tells[1].t - tells[0].t >= AI.dodge.cooldown - 1e-9, `rolls at ${tells.map((s) => s.t)}`);
  assert.ok(r.notes.some((t) => t.includes('翻滾閃避')), r.notes.join(' / '));
});

test('a blade rolls too; a brute, a shield man and a drone never do', async () => {
  const r = await page.evaluate(() => {
    const out = {};
    for (const type of ['rusher', 'brute', 'shield', 'drone']) {
      const e = window.begin(type, 0, -9);
      out[type] = window.aimed(e, 2.5).some((s) => s.state === 'tell' || s.state === 'roll');
    }
    return out;
  });
  assert.deepEqual(r, { rusher: true, brute: false, shield: false, drone: false });
});

test('beside a wall he rolls the other way; with no room either side he does not roll; nor without the fire button held', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    // a spot with a wall 1–2 m to its west and open floor to its east
    let spot = null;
    for (let x = -20; x <= 20 && !spot; x += 0.5) {
      for (let z = -14; z <= 14 && !spot; z += 0.5) {
        if (!L.nav.isWalkable(x, z) || L.nav.isWalkable(x - 1.5, z) || !L.nav.lineWalkable(x, z, x + 3.2, z)) continue;
        if (L.nav.isWalkable(x, z + 8) && L.hasLOS(x, z + 8, x, z)) spot = [x, z];
      }
    }
    const e = window.begin('grunt');
    const p = g.player;
    p.x = spot[0];
    p.z = spot[1] + 8;
    e.x = spot[0];
    e.z = spot[1];
    const wall = window.aimed(e, 1.5);
    const r0 = wall.findIndex((s) => s.state === 'roll');
    const r1 = wall.findIndex((s, i) => i > r0 && s.state !== 'roll');
    const east = r0 > 0 && r1 > r0 ? wall[r1].x - wall[r0 - 1].x : null;
    // fenced in: walls cleared out of reach either side (the nav grid says nothing is walkable 1 m off him)
    const e2 = window.begin('grunt');
    const isW = L.nav.isWalkable.bind(L.nav);
    L.nav.isWalkable = (x, z) => Math.abs(x - e2.x) < 0.6 && isW(x, z);
    const fenced = window.aimed(e2, 1.5).some((s) => s.state === 'roll');
    L.nav.isWalkable = isW;
    // aimed at but not fired at
    const e3 = window.begin('grunt');
    let calm = false;
    for (let i = 0; i < 240; i++) {
      window.step(e3, false);
      calm = calm || e3.state === 'tell' || e3.state === 'roll';
    }
    return { spot, east, fenced, calm };
  });
  assert.ok(r.east !== null && r.east > 1.5, `he rolled away from the wall to his west: ${r.east} m east`);
  assert.equal(r.fenced, false, 'no room: no roll');
  assert.equal(r.calm, false, 'the aim alone, no fire: no roll');
});

test('the same seed and the same input roll the same way; ?style=off too', async () => {
  const run = (p) =>
    p.evaluate(() => {
      const e = window.begin('grunt');
      const trace = window.aimed(e, 1.5);
      return trace.filter((_, i) => i % 6 === 0).map((s) => [s.state, s.x.toFixed(4), s.z.toFixed(4)].join(' '));
    });
  const a = await run(page);
  const b = await run(page);
  const { page: off, logs: offLogs } = await h.open('?seed=53&style=off');
  await setup(off);
  const c = await run(off);
  assert.ok(a.some((s) => s.startsWith('roll')), 'he rolled');
  assert.deepEqual(b, a, 'the same again');
  assert.deepEqual(c, a, 'and with the style off');
  assert.deepEqual(problems(offLogs), []);
  await off.close();
});

test('screenshots in bullet time: the tell, and half way through the roll', async () => {
  const tell = await page.evaluate(() => {
    const g = window.game;
    const e = window.begin('grunt', 1.5, -6);
    g.setFocus(true);
    let n = 0;
    while (e.state !== 'tell' && n++ < 2400) {
      g.focusMeter = 1;
      window.step(e);
    }
    g.updateCamera(1, true);
    g.render();
    return { state: e.state, focus: g.focusActive };
  });
  assert.deepEqual(tell, { state: 'tell', focus: true });
  await page.screenshot({ path: new URL('enemy-dodge-tell.png', OUT).pathname });
  const roll = await page.evaluate((half) => {
    const g = window.game;
    const e = g.enemies.list.find((x) => x.alive);
    let n = 0;
    while ((e.state !== 'roll' || e.timer > half) && n++ < 2400) {
      g.focusMeter = 1;
      window.step(e);
    }
    g.updateCamera(1, true);
    g.render();
    return { state: e.state, focus: g.focusActive };
  }, AI.dodge.roll / 2);
  assert.deepEqual(roll, { state: 'roll', focus: true });
  await page.screenshot({ path: new URL('enemy-dodge-roll.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

// Enemy moves ②: on the move while firing, over low cover, back when hurt (試玩回饋 ④). A rifleman or a
// shotgunner steps sideways while he aims and fires (AI.strafe); a man whose way is blocked by low cover vaults it
// (AI.vault: in the air, no shot, no roll: the moment to get him); a gunman down to half his health falls back to
// cover away from the player, unless he is the last (AI.retreat).

test('a rifleman and a shotgunner move sideways while they aim and fire: 1 m or more across within 3 s', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = {};
    for (const type of ['rifle', 'shotgun']) {
      const e = window.begin(type, 0, -9);
      e.fireCd = 0;
      e.coverRest = 99; // in the open: no cover sought
      const p = g.player;
      const ax = e.x - p.x;
      const az = e.z - p.z;
      const l = Math.hypot(ax, az);
      let lo = Infinity;
      let hi = -Infinity;
      let firing = 0;
      for (let i = 0; i < 360; i++) {
        window.step(null, false); // the player stands and does not fire (no roll)
        if (e.state === 'aim' || e.state === 'fire') {
          firing++;
          const side = ((e.x - p.x) * az - (e.z - p.z) * ax) / l; // across the first line between them
          lo = Math.min(lo, side);
          hi = Math.max(hi, side);
        }
      }
      out[type] = { across: hi - lo, firing: firing / 120 };
    }
    return out;
  });
  for (const t of ['rifle', 'shotgun']) {
    assert.ok(r[t].firing > 0.5, `${t}: ${r[t].firing.toFixed(2)} s aiming and firing`);
    assert.ok(r[t].across >= 1, `${t}: ${r[t].across.toFixed(2)} m across while he does`);
  }
});

test('low cover in a blade’s straight way: he vaults it (in the air, then down on the far side), and reaches the player sooner than going round', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { AI } = await import('./src/config.js');
    // a low box, thin enough across one axis, with open floor 1.4 m before it and 4 m past it there: the first map with one
    let pick = null;
    for (let map = 0; map < g.maps.length && !pick; map++) {
      window.begin('rusher', 0, -8, map);
      const L = g.level;
      for (const s of L.solids) {
      if (!s.alive || s.poly || s.kind === 'glass' || s.h > AI.vault.maxH || s.edge) continue;
      const cx = (s.minX + s.maxX) / 2;
      const cz = (s.minZ + s.maxZ) / 2;
      for (const [ux, uz, depth, half] of [[1, 0, s.maxX - s.minX, s.maxZ - s.minZ], [0, 1, s.maxZ - s.minZ, s.maxX - s.minX]]) {
        if (depth > AI.vault.depth || half < 1.6) continue;
        const a = [cx - ux * (depth / 2 + 1.4), cz - uz * (depth / 2 + 1.4)];
        const b = [cx + ux * (depth / 2 + 4), cz + uz * (depth / 2 + 4)];
        if (L.nav.isWalkable(...a) && L.nav.isWalkable(...b) && L.nav.lineWalkable(cx + ux * (depth / 2 + 0.6), cz + uz * (depth / 2 + 0.6), ...b)) pick = pick || { a, b, h: s.h, kind: s.kind, map, id: L.map.id };
      }
      }
    }
    const run = (vault) => {
      const e = window.begin('rusher', 0, -8, pick.map);
      const p = g.player;
      p.x = pick.b[0];
      p.z = pick.b[1];
      e.x = pick.a[0];
      e.z = pick.a[1];
      e.state = 'chase';
      e.cfg.vault = vault;
      const states = new Set();
      let maxY = 0;
      let n = 0;
      while (Math.hypot(e.x - p.x, e.z - p.z) > 1.8 && n++ < 1200) {
        window.step(null, false);
        states.add(e.state);
        maxY = Math.max(maxY, e.y);
      }
      e.cfg.vault = true;
      return { t: n / 120, states: [...states], maxY, y: e.y, notes: g.notes.events.map((x) => x.text) };
    };
    const over = run(true);
    const round = run(false);
    return { pick, over, round, notes: over.notes };
  });
  assert.ok(r.pick, 'a low box to try it on');
  assert.ok(r.over.states.includes('vault'), `he vaults (${r.over.states})`);
  assert.ok(r.over.maxY > r.pick.h * 0.6, `up over the ${r.pick.h} m ${r.pick.kind} on ${r.pick.id} (${r.over.maxY.toFixed(2)} m)`);
  assert.ok(r.over.t < r.round.t, `over it in ${r.over.t} s, round it ${r.round.t} s`);
  assert.ok(!r.round.states.includes('vault'), 'without it he goes round');
  assert.ok(r.notes.some((t) => t.includes('翻過矮掩體')), r.notes.join(' / '));
});

test('a gunman down to half his health falls back from the player to cover, farther than he would unhurt; the last man standing does not', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    /** A thug free to move, `from` (or 6 m north of the player), with a mate far off unless `alone`; 4 s on, after a wound to half if `hurt`. */
    const run = (hurt, alone, from = null) => {
      const e = window.begin('grunt', 0, -6);
      e.sp.stay = false;
      e.hp = e.hpMax;
      if (from) [e.x, e.z] = from;
      if (!alone) {
        const mate = g.enemies.spawn('grunt', { x: p.x + 30, z: p.z + 30, ex: p.x + 30, ez: p.z + 30.1, stay: true });
        mate.fireCd = 99;
      }
      const d0 = Math.hypot(e.x - p.x, e.z - p.z);
      g.notes.events.length = 0;
      if (hurt) while (e.hp > e.hpMax * 0.5) e.hit({ owner: 'player', dx: 0, dz: -1, x: e.x, z: e.z + 0.5, damage: 1 });
      let far = d0;
      let ducked = false;
      for (let i = 0; i < 120 * 4; i++) {
        window.step(null, false);
        far = Math.max(far, Math.hypot(e.x - p.x, e.z - p.z));
        ducked = ducked || e.state === 'duck';
      }
      // and then back in the fight: free to fire, he aims at the player again within 8 s (fallen back is not hidden for good)
      e.fireCd = 0;
      let back = null;
      for (let i = 0; i < 120 * 8 && back === null; i++) {
        window.step(null, false);
        if (e.state === 'aim' || e.state === 'peek' || e.state === 'fire') back = i / 120;
      }
      return { d0, far, ducked, back, at: [e.x, e.z], alive: e.alive, said: g.notes.events.filter((x) => x.text.includes('受傷後撤')).length };
    };
    // where an unhurt thug hides from here: from there, unhurt he stays; hurt he falls back farther
    const first = run(false, false);
    return { first, calm: run(false, false, first.at), hurt: run(true, false, first.at), last: run(true, true, first.at) };
  });
  assert.ok(r.first.ducked, `unhurt, he takes cover ${r.first.far.toFixed(1)} m off`);
  assert.ok(r.hurt.alive);
  assert.ok(r.hurt.far - r.calm.far >= 1.5, `from there, hurt he falls back to ${r.hurt.far.toFixed(1)} m; unhurt ${r.calm.far.toFixed(1)} m`);
  assert.equal(r.hurt.said, 1, 'the notes say so');
  assert.ok(r.hurt.back !== null, 'and he comes back into the fight (aims again within 8 s)');
  assert.equal(r.calm.said, 0);
  assert.equal(r.last.said, 0, 'the last man: no fall back');
  assert.ok(r.last.far - r.calm.far < 1.5, `the last man stays about as near (${r.last.far.toFixed(1)} m)`);
});
