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
    window.begin = (type, dx = 0, dz = -8) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
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
      p.x = at[0];
      p.z = at[1];
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
