// 彈幕 ② D④: the marksman and the shotgunner in a room, two at once (boss.js Duo). The front hall (rooms.js FRONTHALL)
// is the fourth boss room a floor can end in (MODES.danmaku floor.boss, one drawn a floor); its last wave is the pair:
// the marksman at six posts round the room with his one fast round down the red line (72 m/s), the shotgunner after
// the player with his fan; with his slow wall on (his def's `danmaku`) every blast of his is followed by a slow fan of
// nine rounds (the pattern men's look) with two missing inside: the way through. Two segments each on a floor; the
// combo (RED LINE RUSH) and the rest as on Senado (test/senado-duo.test.mjs). Senado's shotgunner walls nothing.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=43'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** The run moved on to the front hall at the end of floor `floor` (made the pair's, whichever boss room the seed drew) and the start of its last wave; the player at (x, z). */
    window.toHall = (floor = 0, x = 0, z = 4) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[floor][g.floors[floor].length - 1] = 'fronthall';
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

test('the front hall is among the boss rooms a floor can end in; its last wave is the pair, two segments each on a floor, a bar each; the route names them; the budget holds', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toHall(0);
    const rooms = g.waves.rules.floor.boss; // the run's rules, once one has begun
    const b = g.boss;
    for (let i = 0; i < 120 * 4; i++) window.step(); // in
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    const bar = document.getElementById('boss-bar');
    return { rooms, room: g.level.map.id, kind: b.active && b.def.kind, members: b.members.map((m) => [m.def.kind, m.segments, !!m.danmaku, m.state]), segs: b.segments, bars: bar.querySelectorAll('.boss-row').length, inside: b.members.every((m) => Math.abs(m.x) < 11 && Math.abs(m.z) < 7.5), route: g.routeText(0, 'danmaku'), calls: info.calls, tris: info.triangles, budget: g.level.map.budget };
  });
  await page.screenshot({ path: new URL('fronthall.png', OUT).pathname });
  assert.ok(r.rooms.includes('fronthall'), `in the draw: ${r.rooms}`);
  assert.deepEqual([r.room, r.kind, r.segs, r.bars], ['fronthall', 'duo', 4, 2]);
  assert.deepEqual(r.members.map((m) => m.slice(0, 3)), [['marksman', 2, false], ['buckshot', 2, true]], `the pair: ${JSON.stringify(r.members)}`);
  assert.ok(r.inside && r.members.every((m) => m[3] !== 'enter'), `both in the room after four seconds: ${JSON.stringify(r.members)}`);
  assert.match(r.route, /前廳：雙頭目/, r.route);
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the slow wall: every blast of the shotgunner is followed by seven slow rounds in the pattern men’s look across ± 0.9 rad, two missing inside: a gap over 1.2 m wide 3 m out; the marksman’s round is fast; Senado’s shotgunner walls nothing', { timeout: 5 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toHall(0, 0, 3);
    const shots = window.watch(120 * 20);
    const wall = shots.filter((s) => s.label === '散彈手的慢彈');
    const fast = shots.filter((s) => s.label !== '散彈手的慢彈');
    const at = wall.length ? wall[0].at : -1;
    const one = wall.filter((s) => s.at === at);
    const angles = one.map((s) => Math.atan2(s.dx, s.dz)).sort((x, y) => x - y);
    let widest = 0;
    for (let i = 0; i + 1 < angles.length; i++) widest = Math.max(widest, angles[i + 1] - angles[i]);
    const gapAt3m = 2 * 3 * Math.sin(widest / 2);
    const spread = angles.length ? angles[angles.length - 1] - angles[0] : 0;
    // the blast right before it: the shotgun's fast pellets in the same step
    const blastBefore = fast.filter((s) => s.at === at && s.speed === 20).length;
    const notes = g.notes.events.map((e) => e.text);
    // Senado's pair, the same seed's arcade run: no wall
    g.setMode('arcade');
    g.startRun(g.maps.findIndex((m) => m.id === 'senado'));
    g.waves.state = 'done';
    g.enemies.clear();
    g.player.placeAtStart();
    g.waves.wave = 3;
    g.waves.startWave();
    g.enemies.clear();
    const senado = { kind: g.boss.def.kind, danmaku: g.boss.members.map((m) => !!m.danmaku) };
    const senadoWall = window.watch(120 * 20).filter((s) => s.label === '散彈手的慢彈').length;
    return { n: one.length, speeds: [...new Set(one.map((s) => s.speed))], looks: [...new Set(one.map((s) => s.look))], spread, gapAt3m, blastBefore, fastest: Math.max(0, ...fast.map((s) => s.speed)), notes: notes.filter((t) => t.includes('慢彈')), senado, senadoWall };
  });
  assert.equal(r.n, 7, `nine less two: ${r.n}`);
  assert.deepEqual([r.speeds, r.looks], [[6], ['danmaku']], 'slow, in the pattern men’s look');
  assert.ok(r.spread > 1.6 && r.spread <= 1.8 + 1e-6, `across ± 0.9 rad: ${r.spread.toFixed(2)}`);
  assert.ok(r.gapAt3m > 1.2, `the gap 3 m out: ${r.gapAt3m.toFixed(2)} m`);
  assert.ok(r.blastBefore >= 7, `the blast's own pellets in the same step: ${r.blastBefore}`);
  assert.equal(r.fastest, 72, 'the marksman’s round: 72 m/s');
  assert.ok(r.notes.length >= 1, `the note: ${r.notes}`);
  assert.deepEqual(r.senado, { kind: 'duo', danmaku: [false, false] });
  assert.equal(r.senadoWall, 0, 'Senado’s shotgunner walls nothing');
});

test('the bot beats the two in the front hall in god mode within four minutes; then the style cards and the exit', { timeout: 10 * 60 * 1000 }, async () => {
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
  assert.equal(r.downed, true, `both down (${r.s} s)`);
  assert.ok(r.bonus && r.offered && r.held === 1 && r.open, `BOSS +1,500, the cards, one picked, the exit open: ${JSON.stringify(r)}`);
  assert.deepEqual(problems(logs), []);
});
