// 彈幕 ② D②: the heavy gunner in a room. The back hall (rooms.js BACKHALL) is the other boss room a floor can end in
// (MODES.danmaku floor.boss, one drawn a floor); its last wave is the heavy gunner (boss.js Gunner) with his slow
// wall on (the room's def `danmaku`): every nine seconds he plants his feet, his plate lights for 0.6 s, then a fan of
// thirteen slow rounds (the pattern men's look) across his front with two missing: the way through, or round him to
// his open back. His sweep (the red line, 24 fast rounds) and his mortar are the docks' (test/boss.test.mjs). The
// docks' gunner, without `danmaku`, walls nothing.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=37'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** The run moved on to the back hall at the end of floor `floor` (made the gunner's, whichever boss room the seed drew) and the start of its last wave; the player at (x, z). */
    window.toHall = (floor = 0, x = 0, z = 4) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[floor][g.floors[floor].length - 1] = 'backhall';
      g.floor = g.floors.flat();
      g.stage = g.floors.slice(0, floor + 1).flat().length - 1;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.player.x = x;
      g.player.z = z;
      g.waves.wave = (g.stage + 1) * g.waves.rules.perStage - 1;
      g.waves.startWave();
      g.enemies.clear();
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** One logic step; the player still and unhurt, nobody else about. */
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.enemies.clear();
      g.waves.pending.length = 0;
    };
    /** `steps` steps: every enemy round spawned ({ speed, look, label, dx, dz, at }). */
    window.watch = (steps) => {
      const shots = [];
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      g.bullets.spawn = (o) => {
        if (o.owner === 'enemy') shots.push({ speed: o.speed, look: o.look || 'enemy', label: o.source && o.source.cfg ? o.source.cfg.label : '', dx: o.dx, dz: o.dz, at: g.stepCount });
        return spawn0(o);
      };
      for (let i = 0; i < steps; i++) window.step();
      g.bullets.spawn = spawn0;
      return shots;
    };
  });
});
after(async () => {
  await h.close();
});

test('the boss rooms are drawn a floor: over the seeds some floors end in the back hall, some in the arena; its last wave is the heavy gunner in by the north; the route names both; the budget holds', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const ends = [];
    const seed0 = g.fixedSeed;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      g.fixedSeed = seed;
      g.setMode('danmaku');
      g.startRun(0);
      ends.push(...g.floors.map((f) => f[f.length - 1]));
    }
    g.fixedSeed = seed0;
    window.toHall(0);
    const b = g.boss;
    for (let i = 0; i < 120 * 3; i++) window.step(); // in through the door
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    const bar = document.getElementById('boss-bar');
    return { ends, room: g.level.map.id, kind: b.active && b.def.kind, danmaku: b.danmaku, state: b.state, inside: Math.abs(b.x) < 11 && Math.abs(b.z) < 7.5, segs: b.segments, bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent, route: g.routeText(0, 'danmaku'), calls: info.calls, tris: info.triangles, budget: g.level.map.budget };
  });
  await page.screenshot({ path: new URL('backhall.png', OUT).pathname });
  assert.ok(r.ends.includes('backhall') && r.ends.includes('arena'), `both boss rooms over eight seeds: ${[...new Set(r.ends)]}`);
  assert.ok(r.ends.every((id) => ['arena', 'backhall'].includes(id)), 'nothing else at a floor’s end');
  assert.deepEqual([r.room, r.kind, r.danmaku, r.segs, r.bar], ['backhall', 'gunner', true, 4, '碼頭重炮 HEAVY GUNNER']);
  assert.ok(r.inside && r.state !== 'enter', `in the room after three seconds (${r.state})`);
  assert.match(r.route, /層尾大廳：刀后或後廳：重炮/, r.route);
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the slow wall: planted, his plate alight for 0.6 s, then eleven slow rounds in the pattern men’s look across his front, two missing inside: a gap over 1.2 m wide 3 m out; his sweep still comes, fast; the docks’ gunner walls nothing', { timeout: 5 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toHall(0, 0, 5);
    const shots = window.watch(120 * 16);
    const wall = shots.filter((s) => s.label === '重炮的彈幕');
    const sweep = shots.filter((s) => s.label !== '重炮的彈幕');
    const at = wall.length ? wall[0].at : -1;
    const one = wall.filter((s) => s.at === at);
    const angles = one.map((s) => Math.atan2(s.dx, s.dz)).sort((x, y) => x - y);
    let widest = 0;
    for (let i = 0; i + 1 < angles.length; i++) widest = Math.max(widest, angles[i + 1] - angles[i]);
    const gapAt3m = 2 * 3 * Math.sin(widest / 2);
    const spread = angles.length ? angles[angles.length - 1] - angles[0] : 0;
    const notes = g.notes.events.map((e) => e.text);
    // the warning before it: the plate alight, planted
    window.toHall(0, 0, 5);
    let planted = null;
    for (let i = 0; i < 120 * 8 && !planted; i++) {
      window.step();
      if (b.wallState === 'warn') planted = { state: b.state, timer: b.wallTimer, glow: b.plateFlash };
    }
    // the docks' gunner, the same seed's arcade run: no wall
    g.setMode('arcade');
    g.startRun((g.maps.findIndex((m) => m.id === 'docks') - 2 + g.maps.length) % g.maps.length);
    g.waves.state = 'done';
    g.enemies.clear();
    g.stage = 2;
    g.level.load(g.stageMap);
    g.applyMapView();
    g.player.placeAtStart();
    g.waves.wave = 11;
    g.waves.startWave();
    g.enemies.clear();
    const docks = { kind: g.boss.def.kind, danmaku: g.boss.danmaku };
    const docksWall = window.watch(120 * 16).filter((s) => s.label === '重炮的彈幕').length;
    return { n: one.length, speeds: [...new Set(one.map((s) => s.speed))], looks: [...new Set(one.map((s) => s.look))], spread, widest, gapAt3m, sweep: sweep.length, sweepSpeed: [...new Set(sweep.map((s) => s.speed))], planted, notes: notes.filter((t) => t.includes('鋼板發光')), docks, docksWall };
  });
  assert.equal(r.n, 11, `thirteen less two: ${r.n}`);
  assert.deepEqual([r.speeds, r.looks], [[6], ['danmaku']], 'slow, in the pattern men’s look');
  assert.ok(r.spread > 2.0 && r.spread <= 2.2 + 1e-6, `across ± 1.1 rad: ${r.spread.toFixed(2)}`);
  assert.ok(r.gapAt3m > 1.2, `the gap 3 m out: ${r.gapAt3m.toFixed(2)} m`);
  assert.ok(r.sweep >= 24 && r.sweepSpeed.includes(30), `the sweep still: ${r.sweep} rounds at ${r.sweepSpeed}`);
  assert.ok(r.planted && r.planted.state === 'plant' && r.planted.glow > 0.9 && r.planted.timer <= 0.6, `planted and alight for the warning: ${JSON.stringify(r.planted)}`);
  assert.ok(r.notes.length >= 1, `the note: ${r.notes}`);
  assert.deepEqual(r.docks, { kind: 'gunner', danmaku: false });
  assert.equal(r.docksWall, 0, 'the docks’ gunner walls nothing');
});

test('the bot beats him in the back hall in god mode within four minutes; then the style cards and the exit', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 9, mode: 'danmaku', restart: false });
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toHall(0, 0, 4);
    g.player.hurt = () => false; // god mode
    let frames = 0;
    while (!g.boss.downed && frames < 60 * 240) {
      window.simStep(60);
      frames += 60;
    }
    const downed = g.boss.downed;
    // the cards come (the bot picks one), the exit opens, and the bot, standing by it (behind the gunner at the north), may be
    // through it in the same frame: the exit seen open, or the next room begun, counts
    const stage0 = g.stage;
    let open = false;
    for (let i = 0; i < 120 && !open; i++) {
      window.simStep(1);
      if (g.waves.state === 'exit') open = !g.level.exit.locked;
      if (g.transition || g.stage > stage0) open = true;
    }
    const notes = g.notes.events.map((e) => e.text);
    delete g.player.hurt;
    return { downed, s: frames / 60, offered: notes.some((t) => t.startsWith('風格卡三選一')), held: g.cards.held.length, open, bonus: notes.some((t) => t.includes('BOSS +1500')) };
  });
  assert.equal(r.downed, true, `down (${r.s} s)`);
  assert.ok(r.bonus && r.offered && r.held === 1 && r.open, `BOSS +1,500, the cards, one picked, the exit open: ${JSON.stringify(r)}`);
  assert.deepEqual(problems(logs), []);
});
