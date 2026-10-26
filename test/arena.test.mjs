// 彈幕 ② D①: the floor boss in a room. Every floor ends in the arena (rooms.js ARENA, MODES.danmaku floor.boss), whose
// last wave is the blade queen (boss.js Blade) with her bullet-hell moves on (the room's def `danmaku`): from a perch,
// before a dash, a red line on the player and then two fans of three fast knives (the arcade's look) a quarter second
// apart, the second between the first's; as she lands on a perch, a ring of sixteen slow blades (the pattern men's
// look) with three missing: the way through. The rest of her fight is the club's (test/blade.test.mjs): the dash, the
// window with the blades up, the cut. A floor's fight is four segments (floorBoss), the last floor's five; down, the
// style cards come and the exit opens. The club's queen, without `danmaku`, throws nothing and rings nothing.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=31'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** The run moved on to the arena at the end of floor `floor` (0-based; made the blade queen's, whichever boss room the seed drew) and the start of its last wave: the boss; the player at (x, z). */
    window.toArena = (floor = 0, x = 0, z = 4) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[floor][g.floors[floor].length - 1] = 'arena';
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
    /** Steps until the boss is in `state` (at most `max`); how many it took. */
    window.until = (state, max = 3000) => {
      let n = 0;
      while (g.boss.state !== state && n++ < max) window.step();
      return n;
    };
    /** `steps` steps: every enemy round spawned ({ speed, look, label }). */
    window.watch = (steps) => {
      const shots = [];
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      g.bullets.spawn = (o) => {
        if (o.owner === 'enemy') shots.push({ speed: o.speed, look: o.look, label: o.source && o.source.cfg ? o.source.cfg.label : '', dx: o.dx, dz: o.dz, x: o.x, z: o.z, at: g.stepCount });
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

test('every floor ends in a boss room; the arena’s last wave is the blade queen at a perch, four segments on the first floor, five on the last; the route and the boss bar name her; the budget holds', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toArena(0);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const b = g.boss;
    const bar = document.getElementById('boss-bar');
    const info = g.renderer.info.render;
    const first = { room: g.level.map.id, kind: b.active && b.def.kind, danmaku: b.danmaku, state: b.state, perch: b.def.perches.some(([x, z]) => Math.hypot(x - b.x, z - b.z) < 0.01), segs: b.segments, bonus: b.bonus, queue: g.waves.queue.length, bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent, banner: document.getElementById('banner').textContent, calls: info.calls, tris: info.triangles, budget: g.level.map.budget };
    const floors = g.floors.map((f) => f[f.length - 1]);
    const bossRooms = g.waves.rules.floor.boss;
    window.toArena(2);
    const last = { segs: g.boss.segments, bonus: g.boss.bonus, isFinal: g.waves.isFinal };
    return { first, floors, bossRooms, last, route: g.routeText(0, 'danmaku') };
  });
  await page.screenshot({ path: new URL('arena.png', OUT).pathname });
  assert.ok(r.floors.every((id) => r.bossRooms.includes(id)) && r.floors[2] === 'arena', `a boss room at every floor’s end (${r.floors}), the last made the arena`);
  assert.deepEqual([r.first.room, r.first.kind, r.first.danmaku, r.first.state, r.first.perch, r.first.queue, r.first.bar], ['arena', 'blade', true, 'perch', true, 0, '夜店刀后 BLADE QUEEN']);
  assert.deepEqual([r.first.segs, r.first.bonus], [4, 1500], 'a floor’s fight: four segments');
  assert.deepEqual([r.last.segs, r.last.bonus, r.last.isFinal], [5, 2000, true], 'the last floor’s: in full, the run’s last wave');
  assert.match(r.first.banner, /BOSS/);
  assert.match(r.route, /層尾大廳：刀后/, r.route);
  assert.ok(r.first.calls <= r.first.budget.calls && r.first.tris <= r.first.budget.tris, `${r.first.calls} draw calls, ${r.first.tris} triangles, budget ${r.first.budget.calls} / ${r.first.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the knives: from her perch a red line on the player for 0.4 s (shots turned aside meanwhile), then two fans of three fast knives in the arcade’s look a quarter second apart, the second between the first’s; then the dash', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toArena(0, 0, 4);
    const toThrow = window.until('throw');
    const laser = b.laser.mesh.visible;
    const tellT = b.timer;
    // a shot at her through the tell: turned aside, no segment
    const p = g.player;
    const d = Math.hypot(b.x - p.x, b.z - p.z);
    g.bullets.spawn({ x: p.x, z: p.z, dx: (b.x - p.x) / d, dz: (b.z - p.z) / d, speed: 60, owner: 'player', damage: 1 });
    const hp0 = b.hp;
    const shots = window.watch(120);
    const guarded = b.hp === hp0;
    const knives = shots.filter((s) => s.label === '刀后的飛刀');
    const volleys = [...new Set(knives.map((s) => s.at))];
    const angles = knives.map((s) => Math.atan2(s.dx, s.dz));
    const spread = Math.max(...angles) - Math.min(...angles);
    const first = knives.filter((s) => s.at === volleys[0]).map((s) => Math.atan2(s.dx, s.dz)).sort((a, c) => a - c);
    const second = knives.filter((s) => s.at === volleys[1]).map((s) => Math.atan2(s.dx, s.dz)).sort((a, c) => a - c);
    const between = second.length ? second.every((a) => first.some((f) => Math.abs(a - f) > 0.1)) : false;
    const after = b.state;
    return { toThrow, laser, tellT, guarded, n: knives.length, speeds: [...new Set(knives.map((s) => s.speed))], looks: [...new Set(knives.map((s) => s.look))], volleys: volleys.length, gapSteps: volleys.length > 1 ? volleys[1] - volleys[0] : 0, spread, between, after, notes: g.notes.events.map((x) => x.text).filter((t) => t.includes('飛刀')) };
  });
  assert.ok(r.toThrow < 3000 && r.laser, 'she throws from her perch, the red line on');
  assert.ok(Math.abs(r.tellT - 0.4) < 0.02, `the tell: ${r.tellT} s`);
  assert.ok(r.guarded, 'a shot through the tell is turned aside');
  assert.equal(r.n, 5, `two fans, three and two knives (the shifted fan's last falls outside the spread): ${r.n}`);
  assert.deepEqual([r.speeds, r.looks], [[24], ['enemy']], 'fast, in the arcade’s look');
  assert.equal(r.volleys, 2);
  assert.ok(Math.abs(r.gapSteps - 30) <= 1, `a quarter second apart: ${r.gapSteps} steps`);
  assert.ok(r.spread <= 0.9 + 1e-6, `within ± 0.45 rad: ${r.spread}`);
  assert.ok(r.between, 'the second fan’s knives between the first’s');
  assert.ok(['dash', 'feint', 'tell', 'cut', 'retreat'].includes(r.after), `then the dash: ${r.after}`);
  assert.ok(r.notes.length >= 1, `the note: ${r.notes}`);
});

test('the ring: as she lands on a perch sixteen slow blades go out in the pattern men’s look, three missing: a gap over 1.2 m wide 3 m out; the club’s queen (no `danmaku`) throws and rings nothing', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toArena(0, 0, 4);
    // through a throw, the dash and the cut to her retreat and her landing
    window.until('retreat');
    const shots = window.watch(600);
    const ring = shots.filter((s) => s.label === '刀后的刀氣');
    const at = ring.length ? ring[0].at : -1;
    const one = ring.filter((s) => s.at === at);
    const angles = one.map((s) => Math.atan2(s.dx, s.dz)).sort((a, c) => a - c);
    let widest = 0;
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
      widest = Math.max(widest, next - angles[i]);
    }
    const gapAt3m = 2 * 3 * Math.sin(widest / 2);
    // the club's queen: the same seed's club fight, no knives, no ring
    g.setMode('arcade');
    g.startRun((g.maps.findIndex((m) => m.id === 'club') - 2 + g.maps.length) % g.maps.length);
    g.waves.state = 'done';
    g.enemies.clear();
    g.stage = 2;
    g.level.load(g.stageMap);
    g.applyMapView();
    g.player.placeAtStart();
    g.player.x = 0;
    g.player.z = 0;
    g.waves.wave = 11;
    g.waves.startWave();
    g.enemies.clear();
    const club = { danmaku: g.boss.danmaku, kind: g.boss.def.kind };
    const clubShots = window.watch(120 * 12).filter((s) => s.label.startsWith('刀后'));
    return { n: one.length, speeds: [...new Set(one.map((s) => s.speed))], looks: [...new Set(one.map((s) => s.look))], widest, gapAt3m, club, clubShots: clubShots.length, state: g.boss.state };
  });
  assert.equal(r.n, 13, `sixteen less three: ${r.n}`);
  assert.deepEqual([r.speeds, r.looks], [[6.5], ['danmaku']], 'slow, in the pattern men’s look');
  assert.ok(r.gapAt3m > 1.2, `the gap 3 m out: ${r.gapAt3m.toFixed(2)} m`);
  assert.deepEqual(r.club, { danmaku: false, kind: 'blade' });
  assert.equal(r.clubShots, 0, `the club’s queen throws nothing (${r.state})`);
});

test('down in the arena: the style cards come, then the exit opens; the bot beats her in god mode within four minutes', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 9, mode: 'danmaku', restart: false });
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toArena(0, 0, 4);
    g.player.hurt = () => false; // god mode
    let frames = 0;
    while (!g.boss.downed && frames < 60 * 240) {
      window.simStep(60);
      frames += 60;
    }
    const downed = g.boss.downed;
    // the wave ends with her: the floor's last wave, so the cards came first (the bot picks one of them: helpers.mjs), then the exit opened
    for (let i = 0; i < 60 && g.waves.state !== 'exit'; i++) window.simStep(1);
    const notes = g.notes.events.map((e) => e.text);
    const cards = { offered: notes.some((t) => t.startsWith('風格卡三選一')), held: g.cards.held.length, state: g.waves.state, open: !g.level.exit.locked };
    delete g.player.hurt;
    return { downed, s: frames / 60, cards, bonus: notes.some((t) => t.includes('BOSS +1500')), tail: notes.slice(-12) };
  });
  assert.equal(r.downed, true, `down (${r.s} s)`);
  assert.ok(r.bonus, 'BOSS +1,500: a floor’s fight');
  assert.deepEqual(r.cards, { offered: true, held: 1, state: 'exit', open: true }, `the cards first, one picked, then the exit open: ${r.tail.join(' / ')}`);
  assert.deepEqual(problems(logs), []);
});
