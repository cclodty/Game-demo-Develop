// F⑨: the wall run (player.js wallRun, config.js PLAYER.wallRun). C beside an inner wall a room marks (rooms.js
// `wallrun`), heading into it, runs the player along it a metre up: the rounds pass under, the guns fire, a kill on it
// is a WALL KILL; it ends after PLAYER.wallRun.time s or at the wall's end; C again kicks off the wall into a dive,
// away from it. Every themed room (E①–E⑦) has a wall to run along. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/config.js';
import { TRICKS } from '../src/codex.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

const THEMED = ['plaza', 'racebend', 'steps', 'shopstreet', 'quay', 'roof', 'disco'];

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=29'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕 run in room `id`, quiet, the player standing beside its first wall-run wall's south face (`north`: its north). */
    window.toWall = (id = 'plaza', at = 0.1, north = false) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.challenge.offer = null;
      g.level.load(g.rooms[id]);
      g.enemies.clear();
      g.bullets.clear();
      g.view = 0; // the top-down view: W is north, the camera has no yaw to turn the keys
      g.updateCamera(1, true);
      const s = g.level.wallruns[0];
      const p = g.player;
      p.x = s.minX + (s.maxX - s.minX) * at;
      p.z = north ? s.minZ - window.PLAYER_R - 0.3 : s.maxZ + window.PLAYER_R + 0.3;
      p.vx = p.vz = 0;
      p.facing = Math.PI / 2;
      return s;
    };
    /** 120 Hz steps holding `keys`, pressing `press` on the first; the player kept whole. */
    window.play = (n, keys = [], press = []) => {
      const p = g.player;
      for (let i = 0; i < n; i++) {
        g.killcamT = g.hitstopT = 0;
        p.hp = 100;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of keys) g.input.keys.add(k);
        g.input.mouse.left = keys.includes('Mouse0');
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.aimPoint.set(p.x + 6, g.aimPoint.y, p.z);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
      g.input.keys.clear();
      g.input.mouse.left = false;
    };
  });
  await page.evaluate(async (r) => {
    window.PLAYER_R = r;
    window.cfgPlayer = (await import('./src/config.js')).PLAYER; // the live numbers (the stats panel's)
  }, PLAYER.radius);
});
after(async () => {
  await h.close();
});

test('every themed room has an inner wall to run along, marked as it loads', async () => {
  const r = await page.evaluate((ids) => {
    const g = window.game;
    return ids.map((id) => {
      g.level.load(g.rooms[id]);
      const s = g.level.wallruns;
      return { id, n: s.length, long: s.every((w) => Math.max(w.maxX - w.minX, w.maxZ - w.minZ) >= 4), tall: s.every((w) => w.h >= 1.5) };
    });
  }, THEMED);
  for (const x of r) assert.ok(x.n >= 1 && x.long && x.tall, `${x.id}: ${JSON.stringify(x)}`);
});

test('C beside the wall heading into it: along it a metre up, held off its face; enemy rounds pass under; off its end he is down', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const s = window.toWall('plaza');
    const x0 = p.x;
    window.play(1, ['KeyW', 'KeyD'], ['KeyC']);
    const on = { running: p.wallRunning, z: p.z, face: s.maxZ };
    window.play(20, ['KeyD']);
    on.moved = p.x - x0;
    p.syncRig();
    on.y = p.rig.root.position.y - g.level.groundY(p.x, p.z);
    // a round at him from the south: it passes under
    const b = g.bullets.spawn({ x: p.x, z: p.z + 5, dx: 0, dz: -1, speed: 40, owner: 'enemy', damage: 30 });
    const hp0 = p.hp;
    let hurt = false;
    const hurt0 = p.hurt.bind(p);
    p.hurt = (...a) => {
      hurt = true;
      return hurt0(...a);
    };
    for (let i = 0; i < 20; i++) window.play(1, ['KeyD']);
    p.hurt = hurt0;
    on.passed = !hurt && !b.alive ? 'spent' : !hurt;
    on.hp = hp0;
    // on to the wall's end: down
    for (let i = 0; i < 240 && p.wallRunning; i++) window.play(1, ['KeyD']);
    on.endX = p.x;
    on.end = s.maxX;
    on.after = p.wallRunning;
    on.notes = g.notes.events.map((e) => e.text).filter((t) => t.startsWith('牆跑'));
    return on;
  });
  assert.equal(r.running, true, 'on the wall');
  assert.ok(Math.abs(r.z - (r.face + 0.32)) < 0.05, `held a body’s width off its face (${r.z} by ${r.face})`);
  assert.ok(r.moved > 1, `along it (${r.moved.toFixed(2)} m)`);
  assert.ok(Math.abs(r.y - PLAYER.wallRun.height) < 0.01, `a metre up (${r.y})`);
  assert.ok(r.passed, 'the round passed under');
  assert.equal(r.after, false, 'down at its end');
  assert.ok(r.endX >= r.end - 0.2 && r.endX <= r.end + 0.6, `at the wall’s end (${r.endX.toFixed(2)} by ${r.end})`);
  assert.deepEqual(r.notes, ['牆跑', '牆跑落地']);
  assert.deepEqual(problems(logs), []);
});

test('it lasts PLAYER.wallRun.time s at most; nothing beside a wall, or heading away from it, and C is the slide as ever', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const W = window.cfgPlayer.wallRun;
    const speed0 = W.speed;
    W.speed = 2; // slower than its wall is long, so the clock ends it
    window.toWall('plaza', 0.05);
    window.play(1, ['KeyW', 'KeyD'], ['KeyC']);
    let t = 0;
    while (p.wallRunning && t < 400) {
      window.play(1, ['KeyD']);
      t++;
    }
    W.speed = speed0;
    const lasted = t / 120;
    // heading away from it: no wall run (a slide, running)
    window.toWall('plaza');
    window.play(30, ['KeyS']);
    window.play(1, ['KeyS'], ['KeyC']);
    const away = { wall: p.wallRunning, slide: p.sliding };
    // in the open, far from any: the slide
    p.x = 6;
    p.z = 3;
    window.play(30, ['KeyD']);
    window.play(1, ['KeyD'], ['KeyC']);
    const open = { wall: p.wallRunning, slide: p.sliding };
    return { lasted, away, open };
  });
  assert.ok(Math.abs(r.lasted - PLAYER.wallRun.time) < 0.05, `the clock: ${r.lasted} s`);
  assert.deepEqual(r.away, { wall: false, slide: true }, 'heading away: the slide');
  assert.deepEqual(r.open, { wall: false, slide: true }, 'in the open: the slide');
});

test('C again kicks off the wall into a dive, away from it, a dive’s distance; a man shot from the wall is a WALL KILL, a trick in the book; screenshot', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    // from its north face, so the dive goes out into the room
    window.toWall('plaza', 0.1, true);
    window.play(1, ['KeyS', 'KeyD'], ['KeyC']);
    window.play(10, ['KeyD']);
    const z0 = p.z;
    window.play(1, [], ['KeyC']);
    const kicked = { wall: p.wallRunning, diving: p.diving, dz: p.diveDirZ };
    for (let i = 0; i < 120 && (p.diving || p.rolling); i++) window.play(1);
    kicked.away = z0 - p.z;
    // a thug ahead of the wall run, shot from it
    window.toWall('plaza');
    const man = g.enemies.spawn('grunt', { x: p.x + 4, z: p.z, ex: p.x + 4, ez: p.z + 0.1, stay: true });
    man.spawnLock = 0;
    man.fireCd = 999;
    man.hp = 1;
    let wallKill = false;
    const kill0 = g.onEnemyKilled.bind(g);
    g.onEnemyKilled = (e, info, ...rest) => {
      wallKill = wallKill || !!(info && info.bullet && info.bullet.wallShot);
      return kill0(e, info, ...rest);
    };
    window.play(1, ['KeyW', 'KeyD'], ['KeyC']);
    let i = 0;
    while (man.alive && i++ < 90) window.play(1, ['KeyD', 'Mouse0']);
    g.onEnemyKilled = kill0;
    return { kicked, dead: !man.alive, wallKill, lit: g.codex.has('WALL KILL'), notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('WALL KILL')).length };
  });
  assert.deepEqual([r.kicked.wall, r.kicked.diving], [false, true], 'off the wall into a dive');
  assert.ok(r.kicked.dz < -0.9, `away from the wall (${r.kicked.dz})`);
  assert.ok(r.kicked.away >= PLAYER.dive.dist * 0.8, `a dive’s distance off (${r.kicked.away.toFixed(2)} m)`);
  assert.ok(r.dead && r.wallKill, `the thug down, by a round fired from the wall (${JSON.stringify(r)})`);
  assert.ok(TRICKS['WALL KILL'], 'a trick in the book');
  assert.ok(r.lit, 'lit in the book');
  await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.toWall('plaza');
    for (const [x, z] of [[-2, -2], [2, -3], [5, -1]]) {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.fireCd = 999;
    }
    window.play(1, ['KeyW', 'KeyD'], ['KeyC']);
    window.play(30, ['KeyD', 'Mouse0']);
    g.updateCamera(1, true);
    p.syncRig();
    g.render();
  });
  await page.screenshot({ path: new URL('wallrun.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
