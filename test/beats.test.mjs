// Waves in beats (波次拍子): in arcade and the daily challenge a wave comes in
// beats, each 3–6 enemies at one spot together after a 1.2 s telegraph, with
// quiet between; the next beat comes once one enemy is left or 12 s have
// passed. A beat cleared without a hit is a CLEAN BEAT. Endless keeps the
// trickle. Numbers in config.js BEATS. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=11'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    // a run in `mode` on the rooftop, parked just before wave `wave` starts; spawns are recorded
    window.begin = (mode, wave) => {
      g.setMode(mode);
      g.setRules('normal', []);
      g.startRun(0);
      g.enemies.clear();
      const w = g.waves;
      w.wave = wave - 1;
      w.state = 'intermission';
      w.timer = 0;
      w.stageNext = false;
      window.spawns = [];
      if (!g.enemies.spawn.wrapped) {
        const spawn0 = g.enemies.spawn.bind(g.enemies);
        g.enemies.spawn = (type, sp) => {
          window.spawns.push({ t: g.waves.clock, type, at: g.level.spawns.indexOf(sp) });
          return spawn0(type, sp);
        };
        g.enemies.spawn.wrapped = true;
      }
    };
    // one logic step; the player stays safe and still
    window.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.hp = 100;
        p.invuln = 1;
        p.vx = p.vz = 0;
        g.aimPoint.set(p.x, g.aimPoint.y, p.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
    };
    window.alive = () => g.enemies.list.filter((e) => e.alive);
    window.killAllBut = (keep) => {
      for (const e of window.alive().slice(keep)) e.die(0, 1, { cause: 'bullet' });
    };
  });
});
after(async () => {
  await h.close();
});

test('the modes: arcade, the daily and 澳門一夜 play in beats, endless and 彈幕試驗 do not', async () => {
  const m = await page.evaluate(async () => {
    const { MODES } = await import('/src/waves.js');
    return Object.fromEntries(Object.entries(MODES).map(([k, v]) => [k, !!v.beats]));
  });
  assert.deepEqual(m, { arcade: true, endless: false, daily: true, night: true, danmaku: false });
});

// (wave 4 is a stage's boss now, boss.js: the waves in beats are the others)
test('arcade wave 5 (eleven enemies) comes in two beats: together, after a telegraph, and the second only after 12 s while two or more stand', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin('arcade', 5);
    let n = 0;
    while (g.waves.wave < 5 && n++ < 600) window.step();
    const roster = [...g.waves.queue];
    const beats = g.waves.beats.map((b) => b.length);
    const t0 = g.waves.clock;
    // 20 s with nobody killed
    while (g.waves.clock - t0 < 20) window.step();
    const S = window.spawns;
    const times = S.map((s) => s.t);
    const first = times.slice(0, beats[0]);
    const doors = [...new Set(S.slice(0, beats[0]).map((s) => s.at))];
    return {
      roster: roster.length,
      beats,
      spawned: S.length,
      firstSpread: Math.max(...first) - Math.min(...first),
      telegraph: first[0] - t0,
      gap: times[beats[0]] - times[0],
      doors: doors.length,
      maxAlive: Math.max(...[g.enemies.list.length]),
      stage: g.waves.stage && g.waves.stage.en,
      stageOrder: [...g.waves.stageOrder],
      stageCount: (g.level.map.stages || []).length,
    };
  });
  assert.ok(r.stage, 'the beat plays at a named stage of the map');
  assert.equal(new Set(r.stageOrder).size, r.stageCount, 'the wave visits every stage once before repeating');
  assert.equal(r.roster, 11, 'wave 5 is eleven enemies (compose: 3 + 8, one of them a brute)');
  assert.deepEqual(r.beats, [6, 5], `two beats, as even as eleven allows (${r.beats})`);
  assert.equal(r.spawned, 11, 'the whole roster came in 20 s');
  assert.ok(r.firstSpread <= 0.3, `the first beat came together (${r.firstSpread.toFixed(2)} s apart)`);
  assert.ok(r.telegraph >= 1.2 && r.telegraph < 2.2, `after its telegraph (${r.telegraph.toFixed(2)} s)`);
  assert.ok(r.gap >= 12 && r.gap < 16, `the second beat waited the 12 s (${r.gap.toFixed(1)} s)`);
  assert.ok(r.doors <= 2, `one spot: at most two doors (${r.doors})`);
  assert.deepEqual(problems(logs), []);
});

test('one left standing: the next beat follows after the quiet and the telegraph; a beat cleared unhurt is a CLEAN BEAT, a hurt one is not', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin('arcade', 5);
    let n = 0;
    while (g.waves.wave < 5 && n++ < 600) window.step();
    const [b0, b1] = g.waves.beats.map((b) => b.length);
    n = 0;
    while (window.spawns.length < b0 && n++ < 1200) window.step();
    const tFirst = g.waves.clock;
    // a step for the HUD, then kill all but one
    g.hud.update(1 / 60);
    const sub = document.getElementById('wave-sub').textContent;
    window.killAllBut(1);
    n = 0;
    while (window.spawns.length < b0 + b1 && n++ < 1200) window.step();
    const tNext = g.waves.clock;
    // the second beat: clear it at once, unhurt
    const logBefore = g.notes.events.length;
    window.killAllBut(0);
    window.step(30);
    const clean = g.notes.events.slice(logBefore).some((e) => e.text.includes('CLEAN BEAT'));
    // a hurt beat earns nothing: wave 6, first beat, a hit, then a clear
    window.begin('arcade', 6);
    n = 0;
    while (window.spawns.length < 1 && n++ < 1200) window.step();
    window.step(5);
    g.player.invuln = 0;
    g.player.hurt(10, 0, 1);
    const logHurt = g.notes.events.length;
    window.killAllBut(0);
    window.step(30);
    const hurtClean = g.notes.events.slice(logHurt).some((e) => e.text.includes('CLEAN BEAT'));
    return { sub, wait: tNext - tFirst, clean, hurtClean };
  });
  assert.match(r.sub, /拍/, `the HUD shows the beat (${r.sub})`);
  assert.ok(r.wait >= 2.5 && r.wait <= 3.5, `quiet 1.5 s + telegraph 1.2 s before the next beat (${r.wait.toFixed(2)} s)`);
  assert.equal(r.clean, true, 'CLEAN BEAT for a beat cleared without a hit');
  assert.equal(r.hurtClean, false, 'nothing for a beat with a hit taken');
  await snap(page, 'beats-telegraph.png');
  assert.deepEqual(problems(logs), []);
});

test('endless keeps the trickle: one at a time, never above maxAlive', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin('endless', 4);
    let n = 0;
    while (g.waves.wave < 4 && n++ < 600) window.step();
    const t0 = g.waves.clock;
    let most = 0;
    while (g.waves.clock - t0 < 8) {
      window.step();
      most = Math.max(most, window.alive().length);
    }
    const t = window.spawns.map((s) => s.t);
    return { beats: g.waves.beats.length, gap: t.length > 1 ? t[1] - t[0] : null, most, maxAlive: g.waves.maxAlive };
  });
  assert.equal(r.beats, 0, 'no beats in endless');
  assert.ok(r.gap !== null && r.gap >= 0.5, `the second came at least 0.5 s after the first (${r.gap})`);
  assert.ok(r.most <= r.maxAlive, `never more than ${r.maxAlive} alive (${r.most})`);
  assert.deepEqual(problems(logs), []);
});
