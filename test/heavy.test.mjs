// 彈幕試驗 ⑦: heavy fire. The developer, after playing the trial (2026-10-26): not the patterns all round, but the
// bullet hell that heavy fire from the other side makes. The three pattern men (rings, spirals, fans) are no longer sent;
// three who aim at the player and fire a great deal take their place, each with the pattern men's tell (he stands and
// glows) and their slow, solid bullets (bullets.js 'danmaku'):
//   機槍手 MG: a stream two seconds long that turns after the player only so fast: standing in it he is hit, running
//     across it he leaves it behind;
//   排槍手 VOLLEY: every one of them in the room fires on the squad's beat, the same logic step, a row of rounds; between
//     beats none of theirs: the time to move;
//   霰彈手 BLAST: comes in close for two wide blasts that die out within their range: back off, or out of the fan.
// The same seed, the same fire. Only 彈幕試驗 sends them.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=43'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run, nobody about; the player at (x, z) in the teahouse's lanes (the lane at x −3 is clear north to south). */
    window.toRoom = (x = -3, z = 0) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.player.x = x;
      g.player.z = z;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /** One of `type` at (x, z), standing, made ready to fire at once (after `wait` s). */
    window.put = (type, x, z, wait = 0) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.fireCd = wait;
      return e;
    };
    /**
     * Run `steps` logic steps with `men` about, the player moved by `move(i)` each step (or still): every round they fire
     * ({ who, i: its step, angle out, speed, range, look, b: the bullet }), the hits the player takes, and each man's tell
     * (steps in 'aim', whether he stood, his brightest glow).
     */
    window.watch = (men, steps, move = null) => {
      const shots = [];
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      let i = 0;
      g.bullets.spawn = (o) => {
        const b = spawn0(o);
        const who = men.indexOf(o.source);
        if (who >= 0) shots.push({ who, i, angle: Math.atan2(o.dx, o.dz), speed: o.speed, range: o.range, look: o.look, x0: o.x, z0: o.z, b });
        return b;
      };
      let hits = 0;
      const hurt0 = g.player.hurt.bind(g.player);
      g.player.hurt = (...a) => {
        const r = hurt0(...a);
        if (r) hits++;
        return r;
      };
      const tells = men.map(() => ({ steps: 0, still: true, glow: 0 }));
      const aims = men.map(() => []); // his aim each step he fires
      for (; i < steps; i++) {
        const at = men.map((e) => [e.x, e.z]);
        if (move) move(i);
        window.step();
        men.forEach((e, k) => {
          if (e.state === 'aim') {
            tells[k].steps++;
            tells[k].still = tells[k].still && Math.hypot(e.x - at[k][0], e.z - at[k][1]) < 1e-6;
            tells[k].glow = Math.max(tells[k].glow, e.glow || 0);
          }
          if (e.state === 'fire') aims[k].push(e.aimAngle);
        });
        // how far each round has got, while it flies (bullets are pooled: one seen gone is done with)
        for (const s of shots) {
          if (s.done) continue;
          if (!s.b.alive) s.done = true;
          else s.far = Math.max(s.far || 0, Math.hypot(s.b.x - s.x0, s.b.z - s.z0));
        }
      }
      g.bullets.spawn = spawn0;
      g.player.hurt = hurt0;
      return { shots, hits, tells, aims };
    };
  });
});
after(async () => {
  await h.close();
});

const HIT = 0.22; // config.js PLAYER.hitRadius
const SPEED = 7.4; // config.js PLAYER.speed
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

test('機槍手 MG: a tell (he stands and glows), then a stream of solid rounds two seconds long at the player, turning after him only so fast; standing in it he is hit, running across it he leaves it behind; the same seed, the same stream', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (moving) => {
      // standing: 9 m south of him up the clear lane; running: from 9 m south-west, east across his front
      window.toRoom(moving ? -9 : -3, 2.5);
      const e = window.put('hoser', -3, -6.5);
      const toPlayer = Math.atan2(g.player.x - e.x, g.player.z - e.z);
      let started = -1;
      const w = window.watch([e], 120 * 5, (i) => {
        // once he opens up, the player runs east flat out (moved by hand: the step holds him still otherwise)
        if (moving && e.state === 'fire') started = started < 0 ? i : started;
        if (moving && started >= 0) g.player.x = Math.min(10, g.player.x + 7.4 / 120);
      });
      return { toPlayer, tell: w.tells[0], hits: w.hits, aims: w.aims[0], shots: w.shots.map((s) => ({ i: s.i, angle: s.angle, look: s.look })) };
    };
    return { still: run(false), again: run(false), moving: run(true) };
  });
  const s = r.still;
  assert.ok(s.tell.steps / 120 >= 0.6 && s.tell.steps / 120 <= 1.3, `the tell ${(s.tell.steps / 120).toFixed(2)} s`);
  assert.equal(s.tell.still, true, 'he stands for it');
  assert.ok(s.tell.glow > 0.5, `and glows (${s.tell.glow})`);
  assert.ok(s.shots.length >= 25, `${s.shots.length} rounds`);
  const span = (s.shots[s.shots.length - 1].i - s.shots[0].i) / 120;
  assert.ok(span >= 1.8, `a stream ${span.toFixed(2)} s long`);
  assert.ok(s.shots.every((x) => x.look === 'danmaku'), 'in the solid look');
  const err = s.shots.map((x) => Math.abs(wrap(x.angle - s.toPlayer)));
  assert.ok(Math.max(...err) < 0.15, `at the player, standing still (worst ${Math.max(...err).toFixed(3)} rad off)`);
  assert.ok(s.hits >= 10, `standing in it he is hit (${s.hits} times)`);
  // running across: his aim turns after the player at most WEAPONS.hose.track rad/s, slower than a run 9 m off
  const aims = r.moving.aims;
  let fastest = 0;
  for (let k = 1; k < aims.length; k++) fastest = Math.max(fastest, Math.abs(wrap(aims[k] - aims[k - 1])) * 120);
  assert.ok(aims.length > 120 * 1.5, 'he fires on while the player runs');
  assert.ok(fastest > 0.1 && fastest < SPEED / 9, `it turns after him at ${fastest.toFixed(2)} rad/s at most: a run across 9 m off is ${(SPEED / 9).toFixed(2)}`);
  assert.ok(r.moving.hits <= 2, `running across it at ${SPEED} m/s he leaves it behind (${r.moving.hits} hits)`);
  assert.deepEqual(r.again.shots.map((x) => x.angle.toFixed(5)), s.shots.map((x) => x.angle.toFixed(5)), 'the same seed, the same stream');
});

test('排槍手 VOLLEY: three in the room, ready at different times, open up on the same logic step, a row of rounds each at the player; the next row a beat later; between beats none of theirs', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(-3, 0);
    // each with a clear line to the player between the tables; ready at 0, 0.4 and 0.9 s
    const men = [window.put('volleyer', -9, -5.5, 0), window.put('volleyer', 6, -5.5, 0.4), window.put('volleyer', 3, -6, 0.9)];
    const toPlayer = men.map((e) => Math.atan2(g.player.x - e.x, g.player.z - e.z));
    const w = window.watch(men, 120 * 7);
    return { toPlayer, tells: w.tells, shots: w.shots.map((s) => ({ who: s.who, i: s.i, angle: s.angle, look: s.look })) };
  });
  assert.ok(r.shots.length > 0, 'they fire');
  // the rows: rounds closer than 0.5 s together
  const rows = [];
  for (const s of r.shots) {
    const last = rows[rows.length - 1];
    if (last && s.i - last[last.length - 1].i < 60) last.push(s);
    else rows.push([s]);
  }
  assert.ok(rows.length >= 2, `${rows.length} rows in 7 s`);
  for (const row of rows) {
    const who = [...new Set(row.map((s) => s.who))];
    assert.equal(who.length, 3, `all three in every row (${who})`);
    const first = who.map((k) => row.find((s) => s.who === k).i);
    assert.equal(new Set(first).size, 1, `each one’s first round on the same step (${first})`);
    for (const k of who) assert.ok(row.filter((s) => s.who === k).length >= 2, 'a burst each');
    for (const s of row) assert.ok(Math.abs(wrap(s.angle - r.toPlayer[s.who])) < 0.12, `at the player (${wrap(s.angle - r.toPlayer[s.who]).toFixed(3)} rad off)`);
  }
  for (let k = 1; k < rows.length; k++) {
    const quiet = (rows[k][0].i - rows[k - 1][rows[k - 1].length - 1].i) / 120;
    assert.ok(quiet >= 1.4, `between rows ${quiet.toFixed(2)} s with none of theirs`);
  }
  assert.ok(r.tells.every((t) => t.still && t.glow > 0.5), 'each stood and glowed for it');
  assert.ok(r.shots.every((s) => s.look === 'danmaku'));
});

test('霰彈手 BLAST: a tell, then two wide blasts of pellets at the player that die out within their range; a step 2.5 m to the side at 6 m is out of the fan; the same seed, the same blasts', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = () => {
      window.toRoom(-3, 0);
      const e = window.put('blaster', -3, -6);
      const toPlayer = Math.atan2(g.player.x - e.x, g.player.z - e.z);
      g.player.z = 0;
      // one firing: his tell, two blasts (each at the player where he stands), then the player off to the side, so the
      // second's pellets fly their full range; his next aim is two seconds after
      const w = window.watch([e], 120 * 2.6, () => {
        if (e.state === 'recover') g.player.x = -9;
      });
      const far = w.shots.map((s) => ({ d: s.far || 0, range: s.range }));
      return { toPlayer, tell: w.tells[0], from: Math.hypot(e.x + 3, e.z), shots: w.shots.map((s) => ({ i: s.i, angle: s.angle, look: s.look })), far };
    };
    return [run(), run()];
  });
  const [a, b] = r;
  assert.ok(a.tell.steps / 120 >= 0.5 && a.tell.steps / 120 <= 1.1, `the tell ${(a.tell.steps / 120).toFixed(2)} s`);
  assert.equal(a.tell.still, true);
  assert.ok(a.tell.glow > 0.5);
  const blasts = [];
  for (const s of a.shots) {
    const last = blasts[blasts.length - 1];
    if (last && s.i === last[0].i) last.push(s);
    else blasts.push([s]);
  }
  assert.equal(blasts.length, 2, `two blasts (${blasts.map((x) => x.length)})`);
  const gap = (blasts[1][0].i - blasts[0][0].i) / 120;
  assert.ok(gap >= 0.25 && gap <= 0.5, `${gap.toFixed(2)} s apart`);
  for (const blast of blasts) {
    assert.ok(blast.length >= 10, `${blast.length} pellets`);
    const off = blast.map((s) => Math.abs(wrap(s.angle - a.toPlayer)));
    const side = Math.atan2(2.5, 6) - HIT / 6;
    assert.ok(Math.max(...off) < side, `the fan ±${Math.max(...off).toFixed(3)} rad: 2.5 m aside at 6 m (${side.toFixed(3)} rad) is out of it`);
    assert.ok(Math.max(...off) > 0.2, 'and wide');
  }
  assert.ok(a.from <= 7, `he came in close (${a.from.toFixed(1)} m)`);
  const most = Math.max(...a.far.map((f) => f.d));
  assert.ok(most > 6 && a.far.every((f) => f.d <= f.range + 0.5 && f.range <= 12), `the pellets fly on past him and die out within their range (${most.toFixed(1)} m at most)`);
  assert.deepEqual(b.shots.map((s) => s.angle.toFixed(5)), a.shots.map((s) => s.angle.toFixed(5)), 'the same seed, the same blasts');
});

test('彈幕試驗’s waves are the three heavy guns (and a few thugs), never the pattern men; no other mode sends the heavy three; the notes name each the first time it fires', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(-3, 2.5);
    const danmaku = Array.from({ length: 6 }, (_, i) => g.waves.compose(i + 1));
    // each of the three fires: a line in the notes for each, the first time only (a second hoser later says nothing)
    const said = [];
    const log0 = g.notes.log.bind(g.notes);
    g.notes.log = (t) => {
      said.push(t);
      return log0(t);
    };
    for (const [type, x, z] of [['hoser', -3, -6.5], ['volleyer', -9, -5.5], ['blaster', -3, -3.5]]) {
      window.put(type, x, z);
      for (let i = 0; i < 120 * 3; i++) window.step();
    }
    window.put('hoser', 3, -6.5);
    for (let i = 0; i < 120 * 3; i++) window.step();
    g.notes.log = log0;
    g.setMode('arcade');
    g.startRun(0);
    const arcade = Array.from({ length: 12 }, (_, i) => g.waves.compose(i + 1));
    g.setMode('endless');
    g.startRun(0);
    const endless = Array.from({ length: 20 }, (_, i) => g.waves.compose(i + 1));
    return { danmaku, arcade, endless, said: said.filter((t) => t.startsWith('重火力')) };
  });
  const heavy = ['hoser', 'volleyer', 'blaster'];
  const all = r.danmaku.flat();
  assert.ok(heavy.every((t) => all.includes(t)), `all three come (${[...new Set(all)]})`);
  assert.ok(all.every((t) => heavy.includes(t) || t === 'grunt'), `and only they and thugs: no pattern men (${[...new Set(all)]})`);
  assert.ok(r.danmaku.every((w) => w.some((t) => heavy.includes(t))), 'every wave has some');
  assert.ok(!r.arcade.flat().some((t) => heavy.includes(t)) && !r.endless.flat().some((t) => heavy.includes(t)), 'none in the arcade or endless');
  for (const name of ['機槍手', '排槍手', '霰彈手']) assert.equal(r.said.filter((t) => t.includes(name)).length, 1, `${name} once in the notes: ${r.said.join(' / ')}`);
});

test('screenshot: heavy fire across the teahouse: a stream, a row of rounds and a blast, the player in bullet time', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom(-3, 2.5);
    window.put('hoser', -3, -6.5);
    window.put('volleyer', -9, -5.5, 0.2);
    window.put('volleyer', 6, -5.5, 0.2);
    window.put('volleyer', 3, -6, 0.2);
    window.put('blaster', 2, 0, 0.6);
    // the player can't be hurt for the picture (the red of a hit would cover it)
    const hurt0 = g.player.hurt;
    g.player.hurt = () => false;
    for (let i = 0; i < 120 * 2.4; i++) window.step();
    g.player.hurt = hurt0;
    g.hurtFx = 0;
    g.setFocus(true);
    g.focusAmt = 1;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('heavy-fire.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
