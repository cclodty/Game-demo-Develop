// F②a: the room challenges (src/challenge.js). Before a fight room's first wave a sign over its entry offers one,
// drawn from the room's stream (the same seed, the same challenge); a press of Y takes it on (in the input record, so
// a replay takes it on the same step), and the first wave starting takes an unanswered sign down. 無傷 (no hit from
// taking it on to the room cleared) gives a life: an HP of nothing stands the player up again, whole and untouchable
// for CHALLENGE.lifeInvuln s; 限時 (the room cleared within CHALLENGE.time s of fighting, the waits between waves not
// counted, real time) gives a special weapon, full, at his feet. Either done scores CHALLENGE Style; either broken says
// so at once and costs nothing. A boss room and the arcade have none. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=71'));
  await page.evaluate(async () => {
    const g = window.game;
    window.cfg = await import('./src/config.js');
    window.weapons = await import('./src/weapons.js');
    g.frame = () => {};
    /** A 彈幕試驗 run from its start (with `seed` the run's seed): the teahouse, its sign about to go up, the player at the entry. */
    window.toStart = (seed = null) => {
      const keep = g.fixedSeed;
      if (seed !== null) g.fixedSeed = seed;
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.fixedSeed = keep;
      g.setFocus(false);
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** 120 Hz steps, `press` on the first; with `whole` the player kept at full HP and where he is. */
    window.play = (n, { press = [], whole = true } = {}) => {
      const p = g.player;
      const [x, z] = [p.x, p.z];
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.input.pressed.clear();
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.aimPoint.set(p.x, g.aimPoint.y, p.z - 5);
        g.aimFresh = true;
        if (whole) {
          p.hp = 100;
          p.invuln = 0;
        }
        g.updatePlay(1 / 120);
        if (whole) {
          p.x = x;
          p.z = z;
        }
      }
      g.input.pressed.clear();
    };
    /** Up to `max` s of steps until `done()`; the seconds it took, or -1. */
    window.until = (done, max = 30, opts = {}) => {
      for (let i = 0; i < 120 * max; i++) {
        if (done()) return i / 120;
        window.play(1, opts);
      }
      return done() ? max : -1;
    };
    /** The wave under way down at once: its men gone, nobody more to come. */
    window.clearWave = () => {
      g.waves.queue.length = 0;
      g.waves.pending.length = 0;
      g.enemies.clear();
      g.bullets.clear();
    };
    /** The room's two waves fought through and cleared (each down the moment it is under way, unless `fight` s are fought first). */
    window.clearRoom = (fight = 0) => {
      for (let k = 0; k < 2; k++) {
        window.until(() => g.waves.state === 'active');
        if (fight) window.play(Math.round(120 * fight));
        window.clearWave();
        window.play(2);
      }
      return g.waves.state;
    };
    window.styles = () => {
      const seen = [];
      const style0 = g.score.style.bind(g.score);
      g.score.style = (label, pts, ...a) => {
        seen.push(`${label}:${pts}`);
        return style0(label, pts, ...a);
      };
      return seen;
    };
  });
});
after(async () => {
  await h.close();
});

test('a fight room’s sign goes up before its first wave, from the room’s stream: the same seed the same challenge, both over the seeds; the wait is CHALLENGE.window; unanswered, the first wave takes it down; a boss room and the arcade have none', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const draws = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      window.toStart(seed);
      window.play(1);
      draws.push({ seed, id: g.challenge.offer && g.challenge.offer.id, timer: g.waves.timer });
    }
    window.toStart(4);
    window.play(1);
    const again = g.challenge.offer.id;
    // unanswered: the wave starts and the sign comes down
    const waited = window.until(() => g.waves.state === 'active');
    const down = { offer: g.challenge.offer, active: g.challenge.active, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('挑戰')) };
    // the floor's boss room: nothing goes up
    const boss = g.floors[0].length - 1;
    g.challenge.reset();
    g.challenge.before(boss, g.waves);
    const bossOffer = g.challenge.offer;
    // the arcade
    g.setMode('arcade');
    g.startRun(0);
    window.play(5);
    const arcade = g.challenge.offer;
    g.setMode('danmaku');
    return { draws, again, waited, down, bossRoom: g.mapAt(boss).id, bossOffer, arcade, window: window.cfg.CHALLENGE.window };
  });
  for (const d of r.draws) {
    assert.ok(['nohit', 'clock'].includes(d.id), `seed ${d.seed}: a sign (${d.id})`);
    assert.ok(d.timer > r.window - 0.05, `seed ${d.seed}: the wave waits ${d.timer.toFixed(2)} s`);
  }
  assert.equal(r.again, r.draws[3].id, 'the same seed, the same challenge');
  assert.deepEqual([...new Set(r.draws.map((d) => d.id))].sort(), ['clock', 'nohit'], 'both over the seeds');
  assert.ok(r.waited >= r.window - 0.1, `the first wave after ${r.waited} s`);
  assert.equal(r.down.offer, null, 'unanswered, the sign is down');
  assert.equal(r.down.active, null, 'and nothing is under way');
  assert.ok(r.down.notes.some((t) => t.startsWith('挑戰：')) && r.down.notes.some((t) => t.startsWith('冇接受挑戰')), `the notes: ${r.down.notes.join(' / ')}`);
  assert.equal(r.bossOffer, null, `no sign in the boss room (${r.bossRoom})`);
  assert.equal(r.arcade, null, 'none in the arcade');
  assert.deepEqual(problems(logs), []);
});

test('無傷 kept from Y to the room cleared: CHALLENGE +500 Style, a life, on the HUD; a hit breaks it at once (crossed out on the HUD) and the room cleared gives nothing', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (hit) => {
      window.toStart(3);
      window.play(1);
      g.challenge.offer.id = 'nohit';
      window.play(1, { press: ['KeyY'] });
      const taken = g.challenge.active && g.challenge.active.id;
      g.hud.update(1 / 60);
      const tag = document.getElementById('challenge-on').textContent;
      const seen = window.styles();
      let failedTag = '';
      if (hit) {
        window.until(() => g.waves.state === 'active');
        g.player.hurt(10, 0, 1, false, '測試');
        g.hud.update(1 / 60);
        failedTag = document.getElementById('challenge-on').textContent;
      }
      const state = window.clearRoom();
      g.hud.update(1 / 60);
      return { taken, tag, failedTag, state, lives: g.challenge.lives, styles: seen.filter((s) => s.startsWith('CHALLENGE')), livesTag: document.getElementById('lives').textContent, livesShown: !document.getElementById('lives').classList.contains('hidden'), notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('挑戰')) };
    };
    return { kept: run(false), broken: run(true), style: window.cfg.CHALLENGE.style };
  });
  assert.equal(r.kept.taken, 'nohit', 'Y takes it on');
  assert.match(r.kept.tag, /挑戰中 · 無傷/, `the HUD: ${r.kept.tag}`);
  assert.equal(r.kept.state, 'exit', 'the room cleared, its exit open');
  assert.deepEqual(r.kept.styles, [`CHALLENGE:${r.style}`], 'CHALLENGE Style');
  assert.equal(r.kept.lives, 1, 'a life');
  assert.ok(r.kept.livesShown && r.kept.livesTag.includes('×1'), `on the HUD: ${r.kept.livesTag}`);
  assert.ok(r.kept.notes.some((t) => t.startsWith('挑戰成功：無傷')), r.kept.notes.join(' / '));
  assert.match(r.broken.failedTag, /✗ 失敗/, `broken at once: ${r.broken.failedTag}`);
  assert.equal(r.broken.state, 'exit');
  assert.deepEqual(r.broken.styles, [], 'no Style');
  assert.equal(r.broken.lives, 0, 'no life');
  assert.ok(r.broken.notes.some((t) => t.startsWith('挑戰失敗：無傷')), r.broken.notes.join(' / '));
  assert.deepEqual(problems(logs), []);
});

test('限時: the room cleared inside CHALLENGE.time s of fighting gives a special weapon, full, at the player’s feet (E takes it); fought past it, broken; the clock runs in real time in bullet time and stops between waves', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { PLAYER_WEAPONS } = window.weapons;
    const take = () => {
      window.toStart(3);
      window.play(1);
      g.challenge.offer.id = 'clock';
      window.play(1, { press: ['KeyY'] });
    };
    // fast: each wave down 3 s in
    take();
    window.until(() => g.waves.state === 'active');
    g.setFocus(true);
    g.focusMeter = 1;
    const t0 = g.challenge.active.t;
    window.play(240); // two seconds in bullet time
    const inFocus = g.challenge.active.t - t0;
    g.setFocus(false);
    window.clearWave();
    window.play(2);
    const between0 = g.challenge.active.t;
    window.play(120);
    const between = g.challenge.active.t - between0;
    window.until(() => g.waves.state === 'active');
    window.play(360);
    // a gun in slot 2 already, so the prize lies at his feet for E (with slot 2 empty he takes it at once, as any gun walked over)
    const p = g.player;
    p.special = { id: 'sniper', ammo: 3, empty: false };
    window.clearWave();
    window.play(2);
    const prize = g.pickups.list.filter((q) => !q.pad).map((q) => ({ kind: q.kind, at: Math.hypot(q.x - p.x, q.z - p.z), ammo: q.ammo, full: PLAYER_WEAPONS[q.kind].ammo }));
    window.play(2, { press: ['KeyE'] });
    const held = p.special && p.special.id;
    const fast = { state: g.waves.state, inFocus, between, prize, held, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('挑戰')) };
    // slow: a wave fought past the clock
    take();
    window.until(() => g.waves.state === 'active');
    g.player.special = null;
    window.play(Math.round(120 * (window.cfg.CHALLENGE.time + 0.5)));
    const failed = g.challenge.active.failed;
    g.hud.update(1 / 60);
    const tag = document.getElementById('challenge-on').textContent;
    window.clearRoom();
    const slow = { failed, tag, pickups: g.pickups.list.filter((q) => !q.pad).length + (g.player.special ? 1 : 0), notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('挑戰')) };
    return { fast, slow, time: window.cfg.CHALLENGE.time };
  });
  assert.ok(Math.abs(r.fast.inFocus - 2) < 0.02, `two seconds of bullet time count two on the clock (${r.fast.inFocus.toFixed(3)})`);
  assert.equal(r.fast.between, 0, 'the wait between the waves does not count');
  assert.equal(r.fast.state, 'exit', 'the room cleared');
  assert.equal(r.fast.prize.length, 1, `a weapon on the floor: ${JSON.stringify(r.fast.prize)}`);
  assert.ok(r.fast.prize[0].at < 0.5 && r.fast.prize[0].ammo === r.fast.prize[0].full, `at his feet, full: ${JSON.stringify(r.fast.prize)}`);
  assert.equal(r.fast.held, r.fast.prize[0].kind, 'E takes it');
  assert.ok(r.fast.notes.some((t) => t.startsWith('挑戰成功：限時')), r.fast.notes.join(' / '));
  assert.equal(r.slow.failed, true, `past ${r.time} s, broken`);
  assert.match(r.slow.tag, /✗ 失敗/);
  assert.equal(r.slow.pickups, 0, 'no weapon');
  assert.ok(r.slow.notes.some((t) => t.startsWith('挑戰失敗：限時')), r.slow.notes.join(' / '));
  assert.deepEqual(problems(logs), []);
});

test('a life: an HP of nothing with one in hand stands the player up whole and untouchable for CHALLENGE.lifeInvuln s; with none left the run ends as ever', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toStart(3);
    window.until(() => g.waves.state === 'active');
    window.clearWave();
    g.challenge.lives = 1;
    const p = g.player;
    p.invuln = 0;
    p.hurt(150, 0, 1, false, '測試');
    const saved = { alive: p.alive, hp: p.hp, invuln: p.invuln, lives: g.challenge.lives, state: g.state };
    p.hurt(150, 0, 1, false, '測試');
    const untouched = p.hp;
    window.play(Math.round(120 * (window.cfg.CHALLENGE.lifeInvuln + 0.1)), { whole: false });
    p.hurt(150, 0, 1, false, '測試');
    return { saved, untouched, after: { alive: p.alive, state: g.state }, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('命') || t.includes('倒下')) };
  });
  assert.deepEqual(r.saved, { alive: true, hp: 100, invuln: 2, lives: 0, state: 'playing' }, 'up again, whole, the life spent');
  assert.equal(r.untouched, 100, 'untouchable a moment');
  assert.deepEqual(r.after, { alive: false, state: 'dying' }, 'none left: down');
  assert.ok(r.notes.some((t) => t.startsWith('用咗一條命')) && r.notes.some((t) => t === '倒下'), r.notes.join(' / '));
  assert.deepEqual(problems(logs), []);
});

test('a replay takes the challenge on: the run recorded with Y on the sign replays with it taken on at the same step', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { RecordReader } = await import('./src/replay.js');
    window.toStart(9);
    window.play(30);
    const id = g.challenge.offer && g.challenge.offer.id;
    window.play(1, { press: ['KeyY'] });
    const at = g.stepCount;
    window.play(30);
    const bytes = g.record.encode();
    const rd = new RecordReader(bytes);
    const keep = g.fixedSeed;
    g.fixedSeed = 9;
    g.startRun(0);
    g.fixedSeed = keep;
    g.feed = (game) => rd.next(game.player.x, game.player.z);
    let replayedAt = -1;
    for (let i = 0; i < 70 && replayedAt < 0; i++) {
      g.updatePlay(1 / 120);
      if (g.challenge.active) replayedAt = g.stepCount;
    }
    g.feed = null;
    return { id, at, replayedAt, replayedId: g.challenge.active && g.challenge.active.id };
  });
  assert.ok(r.id, 'a sign was up');
  assert.equal(r.replayedId, r.id, 'the replay took the same challenge on');
  assert.equal(r.replayedAt, r.at, `at the same step (${r.at})`);
  assert.deepEqual(problems(logs), []);
});

test('screenshots: the sign over the teahouse’s entry; the clock under way in a wave', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.toStart(3);
    window.play(1);
    g.challenge.offer.id = 'clock';
    g.view = 0;
    g.hud.reset();
    g.hud.el.banner.className = '';
    g.hud.el.toast.className = '';
    g.updateCamera(1, true);
    g.camera.updateMatrixWorld();
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('challenge-sign.png', OUT).pathname });
  const r = await page.evaluate(() => {
    const g = window.game;
    window.play(1, { press: ['KeyY'] });
    window.until(() => g.waves.state === 'active');
    window.play(120 * 5);
    g.hurtFx = 0;
    g.hud.el.banner.className = '';
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { sign: !document.getElementById('challenge-sign').classList.contains('hidden'), tag: document.getElementById('challenge-on').textContent };
  });
  await page.screenshot({ path: new URL('challenge-on.png', OUT).pathname });
  assert.equal(r.sign, false, 'the sign is down once the wave is under way');
  assert.match(r.tag, /挑戰中 · 限時 .* · 剩 \d+\.\d 秒/, r.tag);
  assert.deepEqual(problems(logs), []);
});
