// F⑧b: REDESIGN §5's twelve enemies. Every type the rooms send carries `role` (enemies.js TYPES): its number, a
// title and the three columns (the problem his fire sets, what he does held up as a human shield, what beats him);
// the two candidates (the machine gunner from the second floor, the drone kept out) say so; the three merged away (the
// blade, the blaster, the volley man) name whose problem theirs is now, and the rooms draw them no more (the older
// modes still do). The shield column is in play: the riot shield held covers ±70°, the sniper held fires along the
// player's facing. Since 試玩回饋 ⑦ (every round fast) 11 and 12, the umbrella man and the lion dancer of the slow walls,
// are gone: ten numbers taken, two waiting for new men. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '../src/config.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
let TYPES;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=47'));
  TYPES = await page.evaluate(async () => {
    const { TYPES: T } = await import('./src/enemies.js');
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕 run in its first room, quiet, the player where he starts. */
    window.toRoom = (seed = null) => {
      const keep = g.fixedSeed;
      if (seed !== null) g.fixedSeed = seed;
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.fixedSeed = keep;
      g.waves.state = 'done';
      g.challenge.offer = null;
      g.enemies.clear();
      g.bullets.clear();
    };
    window.put = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
    window.step = () => {
      const p = g.player;
      g.killcamT = g.hitstopT = 0;
      p.hp = 100;
      p.invuln = 0;
      p.vx = p.vz = 0;
      g.updatePlay(1 / 120);
    };
    return JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(T).map(([id, t]) => [id, { role: t.role, name: t.name }]))));
  });
});
after(async () => {
  await h.close();
});

test('the twelve: numbers 1 to 10 each taken, 11 and 12 waiting (試玩回饋 ⑦), each with a title and the three columns; two candidates; the merged name whose problem theirs is', () => {
  const roles = Object.entries(TYPES).filter(([, t]) => t.role && t.role.n);
  assert.deepEqual([...new Set(roles.map(([, t]) => t.role.n))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const [id, t] of roles) for (const k of ['title', 'problem', 'shield', 'counter']) assert.ok(t.role[k] && t.role[k].length > 1, `${id}: ${k}`);
  assert.equal(new Set(roles.map(([, t]) => t.role.n)).size, roles.length, 'one man a number');
  for (const id of ['ringer', 'spiraler', 'fanner']) assert.ok(!(id in TYPES), `${id} gone`);
  assert.deepEqual(Object.entries(TYPES).filter(([, t]) => t.role && t.role.candidate).map(([id]) => id).sort(), ['drone', 'hoser']);
  const merged = Object.entries(TYPES).filter(([, t]) => t.role && t.role.merged);
  assert.deepEqual(merged.map(([id, t]) => [id, t.role.merged]).sort(), [['blaster', 'shotgun'], ['rusher', 'tumbler'], ['volleyer', 'captain']]);
  for (const [, t] of merged) assert.ok(TYPES[t.role.merged].role.n, `${t.role.merged} is one of the twelve`);
  assert.deepEqual(Object.keys(TYPES).filter((id) => !TYPES[id].role), [], 'every type has its place');
});

test('the rooms draw the ten (and the machine gunner from the second floor), never the merged three or the drone; over twelve seeds every one of the ten comes', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const seen = {};
    for (let seed = 1; seed <= 12; seed++) {
      window.toRoom(seed);
      for (let n = 1; n <= g.waves.totalWaves; n++) for (const t of g.waves.compose(n)) (seen[t] ||= []).push(n);
    }
    return Object.fromEntries(Object.entries(seen).map(([t, ns]) => [t, Math.min(...ns)]));
  });
  const drawn = Object.keys(r);
  for (const t of drawn) assert.ok(TYPES[t].role.n || TYPES[t].role.candidate, `${t} drawn: one of the twelve or a candidate`);
  for (const t of ['rusher', 'blaster', 'volleyer', 'drone']) assert.ok(!drawn.includes(t), `${t} not drawn`);
  const twelve = [...new Set(drawn.filter((t) => TYPES[t].role.n).map((t) => TYPES[t].role.n))].sort((a, b) => a - b);
  assert.deepEqual(twelve, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], `every one of the ten comes: ${JSON.stringify(r)}`);
  assert.ok(r.hoser >= 7, `the machine gunner from the second floor (wave ${r.hoser})`);
});

test('held up: the riot shield covers ±70° (another man ±60°), the sniper fires along the player’s facing (his rounds the player’s own)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const from = (deg) => {
      // a round coming at the player from `deg` degrees off his facing
      const a = p.facing + (deg * Math.PI) / 180;
      return p.shieldedFrom(-Math.sin(a), -Math.cos(a));
    };
    const out = {};
    for (const type of ['shield', 'grunt']) {
      window.toRoom();
      const e = window.put(type, p.x, p.z - 1);
      p.grab(e);
      out[type] = { 55: from(55), 65: from(65), 75: from(75) };
      p.letGo(false);
    }
    const rounds = (type) => {
      window.toRoom();
      const e = window.put(type, p.x, p.z - 1);
      const seen = [];
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      g.bullets.spawn = (o) => {
        if (o.owner === 'player') seen.push({ dx: o.dx, dz: o.dz, fire: !!o.hostageFire });
        return spawn0(o);
      };
      p.grab(e);
      for (let i = 0; i < 120 * 1.2; i++) {
        p.hostageT = 9;
        window.step();
      }
      g.bullets.spawn = spawn0;
      return { n: seen.length, fire: seen.filter((s) => s.fire).length, along: seen.filter((s) => s.fire).every((s) => Math.abs(Math.atan2(s.dx, s.dz) - p.facing) < 0.1) };
    };
    out.sniper = rounds('sniper');
    return out;
  });
  assert.deepEqual(r.shield, { 55: true, 65: true, 75: false }, 'the riot shield: ±70°');
  assert.deepEqual(r.grunt, { 55: true, 65: false, 75: false }, `another man: ±${PLAYER.humanShield.arc}°`);
  assert.ok(r.sniper.fire === 2 && r.sniper.along, `the sniper: one shot as he is grabbed, another a second later, along the facing (${JSON.stringify(r.sniper)})`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the ten in one room, side by side', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const order = ['grunt', 'rifle', 'shotgun', 'brute', 'captain', 'shield', 'bomber', 'grenadier', 'tumbler', 'sniper'];
    const p = g.player;
    order.forEach((t, i) => {
      const e = window.put(t, -6 + (i % 5) * 3, i < 5 ? -2.5 : 0.5);
      e.facing = 0;
    });
    for (const e of g.enemies.list.filter((m) => m.escortOf)) g.enemies.remove(e); // the captain's guards: not of the line
    p.x = 0;
    p.z = 3.5;
    for (let i = 0; i < 2; i++) window.step();
    g.updateCamera(1, true);
    g.render();
  });
  await page.screenshot({ path: new URL('twelve.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
