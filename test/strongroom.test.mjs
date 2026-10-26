// 彈幕 ② D③: the bulwark in a room. The strongroom (rooms.js STRONGROOM) is the third boss room a floor can end in
// (MODES.danmaku floor.boss, one drawn a floor); its last wave is the bulwark (boss.js Bulwark) with his slow wall on
// (the room's def `danmaku`): the moment his bash is spent, shield down, a ring of fourteen slow rounds (the pattern
// men's look) goes out from him with three missing: the way in to him while he is open. His bash and his revolver
// (fast, round the shield's edge) are 大三巴's (test/ruins-boss.test.mjs). 大三巴's bulwark, without `danmaku`, rings
// nothing.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=41'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** The run moved on to the strongroom at the end of floor `floor` (made the bulwark's, whichever boss room the seed drew) and the start of its last wave; the player at (x, z). */
    window.toRoom = (floor = 0, x = 0, z = 4) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[floor][g.floors[floor].length - 1] = 'strongroom';
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
        if (o.owner === 'enemy') shots.push({ speed: o.speed, look: o.look || 'enemy', label: o.source && o.source.cfg ? o.source.cfg.label : '', dx: o.dx, dz: o.dz, at: g.stepCount, state: g.boss.state });
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

test('the strongroom is among the boss rooms a floor can end in; its last wave is the bulwark in by the north, four segments; the route names him; the budget holds', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(0);
    const rooms = g.waves.rules.floor.boss; // the run's rules, once one has begun
    const b = g.boss;
    for (let i = 0; i < 120 * 3; i++) window.step(); // in through the door
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    const bar = document.getElementById('boss-bar');
    return { rooms, room: g.level.map.id, kind: b.active && b.def.kind, danmaku: b.danmaku, state: b.state, inside: Math.abs(b.x) < 11 && Math.abs(b.z) < 7.5, segs: b.segments, bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent, route: g.routeText(0, 'danmaku'), calls: info.calls, tris: info.triangles, budget: g.level.map.budget };
  });
  await page.screenshot({ path: new URL('strongroom.png', OUT).pathname });
  assert.ok(r.rooms.includes('strongroom'), `in the draw: ${r.rooms}`);
  assert.deepEqual([r.room, r.kind, r.danmaku, r.segs, r.bar], ['strongroom', 'bulwark', true, 4, '大三巴鐵盾 BULWARK']);
  assert.ok(r.inside && r.state !== 'enter', `in the room after three seconds (${r.state})`);
  assert.match(r.route, /庫房：鐵盾/, r.route);
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the slow wall: the bash spent, shield down, eleven slow rounds in the pattern men’s look go out from him, three missing: a gap over 1.2 m wide 3 m out; the revolver still, fast; 大三巴’s bulwark rings nothing', { timeout: 5 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    // the player 5 m before his way in: within the bash's reach once he is in
    window.toRoom(0, 0, 0);
    const shots = window.watch(120 * 20);
    const wall = shots.filter((s) => s.label === '鐵盾的盾震');
    const gun = shots.filter((s) => s.label !== '鐵盾的盾震');
    const at = wall.length ? wall[0].at : -1;
    const one = wall.filter((s) => s.at === at);
    const angles = one.map((s) => Math.atan2(s.dx, s.dz)).sort((x, y) => x - y);
    let widest = 0;
    for (let i = 0; i < angles.length; i++) {
      const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
      widest = Math.max(widest, next - angles[i]);
    }
    const gapAt3m = 2 * 3 * Math.sin(widest / 2);
    const notes = g.notes.events.map((e) => e.text);
    // 大三巴's bulwark, the same seed's arcade run: no wall
    g.setMode('arcade');
    g.startRun(g.maps.findIndex((m) => m.id === 'ruins'));
    g.waves.state = 'done';
    g.enemies.clear();
    g.player.placeAtStart();
    g.waves.wave = 3;
    g.waves.startWave();
    g.enemies.clear();
    const ruins = { kind: g.boss.def.kind, danmaku: g.boss.danmaku };
    const ruinsWall = window.watch(120 * 20).filter((s) => s.label === '鐵盾的盾震').length;
    return { n: one.length, when: one.length ? one[0].state : '', speeds: [...new Set(one.map((s) => s.speed))], looks: [...new Set(one.map((s) => s.look))], gapAt3m, gun: gun.length, gunSpeed: [...new Set(gun.map((s) => s.speed))], notes: notes.filter((t) => t.includes('盾震')), ruins, ruinsWall, state: b.state };
  });
  assert.equal(r.n, 11, `fourteen less three: ${r.n} (${r.state})`);
  assert.equal(r.when, 'spent', 'as the bash is spent');
  assert.deepEqual([r.speeds, r.looks], [[5.5], ['danmaku']], 'slow, in the pattern men’s look');
  assert.ok(r.gapAt3m > 1.2, `the gap 3 m out: ${r.gapAt3m.toFixed(2)} m`);
  assert.ok(r.gun >= 3 && r.gunSpeed.includes(26), `the revolver still: ${r.gun} rounds at ${r.gunSpeed}`);
  assert.ok(r.notes.length >= 1, `the note: ${r.notes}`);
  assert.deepEqual(r.ruins, { kind: 'bulwark', danmaku: false });
  assert.equal(r.ruinsWall, 0, '大三巴’s bulwark rings nothing');
});

test('the bot beats him in the strongroom in god mode within four minutes; then the style cards and the exit', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 9, mode: 'danmaku', restart: false });
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(0, 0, 4);
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
  assert.equal(r.downed, true, `down (${r.s} s)`);
  assert.ok(r.bonus && r.offered && r.held === 1 && r.open, `BOSS +1,500, the cards, one picked, the exit open: ${JSON.stringify(r)}`);
  assert.deepEqual(problems(logs), []);
});
