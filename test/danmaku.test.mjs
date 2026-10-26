// 彈幕試驗 ③: three ordinary enemies, each firing a bullet pattern of its own
// (Enter the Gungeon's way: the pattern is the enemy), and grazing.
//   環形手 RING: a ring of bullets outward, a gap in it, the next ring turned;
//   螺旋手 SPIRAL: arms of bullets turning as he fires, a stream;
//   扇形手 FAN: a fan at the player, densest in the middle.
// Each stands and glows before firing (the tell); every pattern has a way
// through wider than the player's hitbox; the same seed fires the same
// pattern. Their bullets have a look of their own: solid, not additive glow,
// so a dense pattern still shows every bullet (800 of the old ones bloomed
// into one glare, 彈幕試驗 ①). In 彈幕試驗 a bullet passing close (GRAZE)
// gives focus and Style, each one counted; in bullet time the hitbox shows.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=29'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run, nobody about; the player at (-3, 0): in the lanes between the tables (rooms.js), clear to the north and the west. */
    window.toRoom = () => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.player.x = -3;
      g.player.z = 0;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /**
     * One of `type` 6.5 m north of the player, up the lane, made to fire at once: how long his tell is (standing, glowing), and
     * the bullets of each volley he fires (their angles out from him), until he is done.
     */
    window.pattern = (type) => {
      window.toRoom();
      const e = g.enemies.spawn(type, { x: -3, z: -6.5, ex: -3, ez: -6.4, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = 0;
      // the bullets as he fires them (a step can end one: those into the wall behind him)
      let fired = [];
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      g.bullets.spawn = (o) => {
        const b = spawn0(o);
        if (o.source === e) fired.push(b);
        return b;
      };
      const volleys = [];
      let tell = 0;
      let still = true;
      let glow = 0;
      let at = null;
      for (let i = 0; i < 120 * 8; i++) {
        const x0 = e.x;
        const z0 = e.z;
        window.step();
        if (e.state === 'aim') {
          tell++;
          still = still && Math.hypot(e.x - x0, e.z - z0) < 1e-6;
          glow = Math.max(glow, e.glow || 0);
        }
        const fresh = fired.map((b) => ({ dx: b.dx, dz: b.dz, look: b.look }));
        fired = [];
        if (fresh.length) {
          at = at ?? i;
          volleys.push({ t: (i - at) / 120, looks: [...new Set(fresh.map((b) => b.look))], angles: fresh.map((b) => Math.atan2(b.dx, b.dz)), from: [e.x, e.z] });
        }
        if (at !== null && e.state !== 'fire' && e.state !== 'aim') break;
      }
      g.bullets.spawn = spawn0;
      return { tell: tell / 120, still, glow, volleys, toPlayer: Math.atan2(g.player.x - e.x, g.player.z - e.z) };
    };
  });
});
after(async () => {
  await h.close();
});

/** The widest gap between neighbouring angles of a whole ring (wrapping round). */
function widestRingGap(angles) {
  const a = angles.map((x) => (x + 2 * Math.PI) % (2 * Math.PI)).sort((p, q) => p - q);
  let w = 2 * Math.PI - a[a.length - 1] + a[0];
  for (let i = 1; i < a.length; i++) w = Math.max(w, a[i] - a[i - 1]);
  return w;
}
/** Neighbouring gaps of a spread of angles (not wrapping), sorted by angle. */
function gaps(angles) {
  const a = [...angles].sort((p, q) => p - q);
  return a.slice(1).map((x, i) => x - a[i]);
}
const HIT = 0.22; // config.js PLAYER.hitRadius: a bullet within this of his middle hits

test('環形手 RING: a tell standing and glowing, then rings of bullets outward, each with a gap the player fits through 2 m out where the rest are closer; the next ring turned; the same seed, the same rings', async () => {
  const r = await page.evaluate(() => [window.pattern('ringer'), window.pattern('ringer')]);
  const [a, b] = r;
  assert.ok(a.tell >= 0.6 && a.tell <= 1.2, `the tell ${a.tell} s`);
  assert.equal(a.still, true, 'he stands for it');
  assert.ok(a.glow > 0.5, `and glows (${a.glow})`);
  assert.ok(a.volleys.length >= 3, `${a.volleys.length} rings`);
  for (const v of a.volleys) {
    assert.deepEqual(v.looks, ['danmaku'], 'in the bullets’ own look');
    assert.ok(v.angles.length >= 24, `${v.angles.length} bullets a ring`);
    const wide = widestRingGap(v.angles);
    const step = (2 * Math.PI) / (v.angles.length + 3);
    assert.ok(wide * 2 > 2 * HIT + 0.3, `the gap ${(wide * 2).toFixed(2)} m wide 2 m out`);
    assert.ok(step * 2 < 2 * HIT + 0.3, 'the rest too close to pass between there');
  }
  assert.notEqual(a.volleys[0].angles[0].toFixed(4), a.volleys[1].angles[0].toFixed(4), 'the next ring turned');
  assert.deepEqual(a.volleys.map((v) => v.angles.map((x) => x.toFixed(5))), b.volleys.map((v) => v.angles.map((x) => x.toFixed(5))), 'the same seed, the same rings');
});

test('螺旋手 SPIRAL: a tell, then arms of bullets that turn as he fires: a stream, the arms far enough apart to pass between 3 m out', async () => {
  const a = await page.evaluate(() => window.pattern('spiraler'));
  assert.ok(a.tell >= 0.5 && a.tell <= 1.2, `the tell ${a.tell} s`);
  assert.equal(a.still, true);
  assert.ok(a.volleys.length >= 15, `a stream: ${a.volleys.length} shots`);
  const arms = a.volleys[0].angles.length;
  assert.ok(arms >= 3 && a.volleys.every((v) => v.angles.length === arms), `${arms} arms each shot`);
  assert.ok(((2 * Math.PI) / arms) * 3 > 2 * HIT + 0.3, 'room between the arms 3 m out');
  const turn = Math.atan2(Math.sin(a.volleys[1].angles[0] - a.volleys[0].angles[0]), Math.cos(a.volleys[1].angles[0] - a.volleys[0].angles[0]));
  assert.ok(Math.abs(turn) > 0.05 && Math.abs(turn) < 0.6, `the arms turn ${turn.toFixed(2)} rad a shot`);
  assert.deepEqual(a.volleys[0].looks, ['danmaku']);
});

test('扇形手 FAN: a tell, then fans at the player, densest in the middle; the widest gap 4 m out fits the player', async () => {
  const a = await page.evaluate(() => window.pattern('fanner'));
  assert.ok(a.tell >= 0.5 && a.tell <= 1.2, `the tell ${a.tell} s`);
  assert.equal(a.still, true);
  assert.ok(a.volleys.length >= 2, `${a.volleys.length} fans`);
  for (const v of a.volleys) {
    assert.ok(v.angles.length >= 7, `${v.angles.length} bullets a fan`);
    const mid = v.angles.reduce((s, x) => s + x, 0) / v.angles.length;
    assert.ok(Math.abs(Math.atan2(Math.sin(mid - a.toPlayer), Math.cos(mid - a.toPlayer))) < 0.15, 'at the player');
    const gs = gaps(v.angles);
    const middle = gs[Math.floor(gs.length / 2)];
    assert.ok(middle < gs[0] && middle < gs[gs.length - 1], 'densest in the middle');
    assert.ok(Math.max(...gs) * 4 > 2 * HIT + 0.3, `the widest gap ${(Math.max(...gs) * 4).toFixed(2)} m wide 4 m out`);
  }
});

test('the bullets’ own look is solid, not additive glow; 600 of them cost no more draw calls than one', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const L = g.bullets.looks.danmaku;
    const draw = () => {
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      g.render();
      return g.renderer.info.render.calls;
    };
    const p = g.player;
    const add = (n) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 * 9;
        const rr = 1.5 + (i % 60) * 0.12;
        g.bullets.spawn({ x: p.x + Math.sin(a) * rr, z: p.z - 3 + Math.cos(a) * rr, dx: 1, dz: 0, speed: 0, owner: 'enemy', damage: 0, look: 'danmaku' });
      }
    };
    add(1);
    const one = draw();
    g.bullets.clear();
    add(600);
    const many = draw();
    return { additive: L.head.blending === 2 || L.trail.blending === 2, one, many };
  });
  await page.screenshot({ path: new URL('danmaku-600.png', OUT).pathname });
  assert.equal(r.additive, false, 'normal blending, head and rim');
  assert.equal(r.many, r.one, `one ${r.one}, 600 ${r.many}`);
});

test('grazing in 彈幕試驗: every bullet that passes within GRAZE.radius without hitting gives focus and GRAZE; one farther off, or one that hits, does not; in the arcade the old CLOSE CALL', async () => {
  const r = await page.evaluate(async () => {
    const { GRAZE } = await import('./src/config.js');
    const g = window.game;
    const run = (offsets, mode = 'danmaku') => {
      window.toRoom();
      if (mode !== 'danmaku') {
        g.setMode(mode);
        g.startRun(0);
        g.waves.state = 'done';
        g.enemies.clear();
      }
      const p = g.player;
      g.focusMeter = 0.2;
      const f0 = g.focusMeter;
      const n0 = g.grazes;
      const styles = [];
      const style0 = g.score.style.bind(g.score);
      g.score.style = (l, pts, ...a) => {
        styles.push(l);
        return style0(l, pts, ...a);
      };
      // side by side, the same step: bullets from the west past the player, `off` m north of his middle
      for (const off of offsets) g.bullets.spawn({ x: p.x - 4, z: p.z - off, dx: 1, dz: 0, speed: 20, owner: 'enemy', damage: 1, look: 'danmaku' });
      for (let i = 0; i < 90; i++) window.step();
      g.score.style = style0;
      return { focus: g.focusMeter - f0, grazes: g.grazes - n0, styles };
    };
    return { radius: GRAZE.radius, two: run([0.35, -0.4]), far: run([0.9]), hit: run([0.05]), arcade: run([0.6], 'arcade') };
  });
  assert.ok(r.radius <= 0.6, `GRAZE.radius ${r.radius} m`);
  assert.equal(r.two.grazes, 2, 'two bullets past, side by side: both count');
  assert.ok(r.two.focus > 0, 'focus');
  assert.ok(r.two.styles.includes('GRAZE'), `Style (${r.two.styles})`);
  assert.equal(r.far.grazes, 0, 'farther off: none');
  assert.equal(r.hit.grazes, 0, 'a hit is no graze');
  assert.equal(r.arcade.grazes, 0, 'not in the arcade');
  assert.ok(r.arcade.styles.includes('CLOSE CALL'), `the arcade keeps its CLOSE CALL (${r.arcade.styles})`);
});

test('the hitbox: in 彈幕試驗 in bullet time a dot at the player shows where a bullet hits him; not out of bullet time, not in the arcade', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const shown = (mode, focus) => {
      window.toRoom();
      if (mode !== 'danmaku') {
        g.setMode(mode);
        g.startRun(0);
      }
      g.focusAmt = focus;
      g.updateCamera(1, true);
      g.render();
      const hb = g.hitbox;
      return { visible: hb.visible, at: [hb.position.x - g.player.x, hb.position.z - g.player.z], size: hb.scale.x };
    };
    return { slow: shown('danmaku', 1), fast: shown('danmaku', 0), arcade: shown('arcade', 1) };
  });
  assert.equal(r.slow.visible, true);
  assert.ok(Math.hypot(...r.slow.at) < 1e-6, 'on him');
  assert.equal(r.fast.visible, false);
  assert.equal(r.arcade.visible, false);
});

test('the pattern men are in no mode’s waves now: 彈幕試驗 sends the heavy guns instead (彈幕試驗 ⑦: test/heavy.test.mjs), the arcade and endless never did', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const danmaku = Array.from({ length: 6 }, (_, i) => g.waves.compose(i + 1));
    g.setMode('arcade');
    g.startRun(0);
    const arcade = Array.from({ length: 12 }, (_, i) => g.waves.compose(i + 1));
    g.setMode('endless');
    g.startRun(0);
    const endless = Array.from({ length: 20 }, (_, i) => g.waves.compose(i + 1));
    return { danmaku, arcade, endless };
  });
  const pattern = ['ringer', 'spiraler', 'fanner'];
  const all = r.danmaku.flat();
  assert.ok(!all.some((t) => pattern.includes(t)), `none in 彈幕試驗 (${[...new Set(all)]})`);
  assert.ok(all.length > 0, 'which still sends men');
  assert.ok(!r.arcade.flat().some((t) => pattern.includes(t)) && !r.endless.flat().some((t) => pattern.includes(t)), 'none in the arcade or endless');
});

test('screenshot: the three firing in the teahouse, the player in bullet time, his hitbox showing', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom();
    const put = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = 0;
      return e;
    };
    // each with a clear line to the player (-3, 0) between the tables
    put('ringer', -9, -5.5);
    put('spiraler', 6, -5.5);
    put('fanner', 3, -6);
    for (let i = 0; i < 120 * 2.6; i++) window.step();
    g.setFocus(true);
    g.focusAmt = 1;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('danmaku-three.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('the bot clears 彈幕試驗’s floor in god mode, six waves in its three rooms; the notes say in Chinese what the heavy guns are and how the grazes go', { timeout: 15 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 11, mode: 'danmaku', restart: false, god: true });
  const r = await page.evaluate(() => {
    const g = window.game;
    const said = []; // all of it (the notes keep the last 40 events)
    const log0 = g.notes.log.bind(g.notes);
    g.notes.log = (text) => {
      said.push(text);
      return log0(text);
    };
    let frames = 0;
    const rooms = [g.level.map.id]; // the rooms it fought in, in order (彈幕試驗 ⑤: the bot walks out of each cleared room's exit)
    while (g.state === 'playing' && g.waves.state !== 'done' && frames < 60 * 60 * 8) {
      window.simStep(60);
      frames += 60;
      if (g.level.map.id !== rooms[rooms.length - 1]) rooms.push(g.level.map.id);
    }
    g.notes.log = log0;
    return { wave: g.waves.wave, done: g.waves.state === 'done', s: frames / 60, grazes: g.grazes, notes: said, errors: window.stats.errors, rooms, floor: g.floor };
  });
  assert.deepEqual(r.errors, [], 'nothing thrown on the way (the bot catches what the game throws)');
  assert.equal(r.done, true, `cleared (wave ${r.wave}, ${r.s} s, in ${r.rooms.join(' → ')})`);
  assert.equal(r.wave, 6, 'after six waves');
  assert.deepEqual(r.rooms, r.floor, 'through the floor’s three rooms, in its order');
  for (const name of ['機槍手', '排槍手', '霰彈手']) assert.ok(r.notes.some((t) => t.includes(name)), `${name} in the notes (the heavy guns: 彈幕試驗 ⑦)`);
  assert.ok(r.notes.some((t) => t.includes('擦彈')), r.notes.slice(-12).join(' / '));
  assert.deepEqual(problems(logs), []);
});
