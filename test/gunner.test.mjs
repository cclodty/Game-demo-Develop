// The docks' boss, remade (頭目重做 ②, playtest feedback ②): an arcade run that
// ends on the docks meets the heavy gunner on its last wave. He walks in
// through the west gate behind a steel plate and after the player at 1.5 m/s,
// turning slowly. Shots from the front glance off the plate; four on his back
// take a segment. Every 4 s he plants his feet, draws a red line onto the
// player for 0.8 s and sweeps a long burst across it; every 12 s he lobs three
// mortar shells onto the player's spot, each ringed on the ground for 1.5 s
// first. In the dark under a lamp shot out he cannot see: no sweep, no shells.
// A blast beside him (a grenade, a kicked LPG cylinder that runs into him) takes
// a segment and staggers him; a kick or a thug bowled into him only staggers
// him, plate down, when shots from the front count too. The fifth segment:
// BOSS +2,000, the clip, RUN CLEAR. He fights alone.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=13'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** An arcade run from the rooftop, moved on to its third stage (the docks) and the start of wave 12; the player mid-map. */
    window.toFinal = () => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.player.x = -8;
      g.player.z = -8;
      g.waves.wave = 11;
      g.waves.startWave();
    };
    /** One logic step; the player still, unhurt unless `hurt`, nobody else about unless `crowd`. */
    window.step = (hurt = false, crowd = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      if (!crowd) {
        g.enemies.clear();
        g.waves.pending.length = 0;
      }
    };
    /** Steps until `cond()` holds (at most `max`); how many it took. */
    window.until = (cond, max = 3000) => {
      let n = 0;
      while (!cond() && n++ < max) window.step();
      return n;
    };
    /** The player `d` m from the boss, `where` 'front' (along his facing) or 'back'; facing him. */
    window.stand = (where, d = 5) => {
      const b = g.boss;
      const p = g.player;
      const s = where === 'front' ? 1 : -1;
      p.x = b.x + Math.sin(b.facing) * d * s;
      p.z = b.z + Math.cos(b.facing) * d * s;
      p.facing = Math.atan2(b.x - p.x, b.z - p.z);
    };
    /** `n` player shots from where the player stands at the boss, each flown home before the next. */
    window.fire = (n, steps = 12) => {
      const p = g.player;
      const b = g.boss;
      for (let i = 0; i < n; i++) {
        const dx = b.x - p.x;
        const dz = b.z - p.z;
        const d = Math.hypot(dx, dz);
        g.bullets.spawn({ x: p.x, z: p.z, dx: dx / d, dz: dz / d, speed: 60, owner: 'player', damage: 1 });
        for (let k = 0; k < steps; k++) window.step();
      }
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 on the docks is the heavy gunner, in through the west gate; the route names him; it stays inside the render budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFinal();
    const b = g.boss;
    const start = { state: b.state, x: b.x, z: b.z };
    const steps = window.until(() => b.state !== 'enter');
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const bar = document.getElementById('boss-bar');
    const info = g.renderer.info.render;
    return {
      map: g.level.map.id,
      kind: b.active && b.def.kind,
      start,
      steps,
      state: b.state,
      at: [Math.round(b.x * 10) / 10, Math.round(b.z * 10) / 10],
      queue: g.waves.queue.length,
      bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent,
      segs: bar.querySelectorAll('.boss-segs i:not(.lost)').length,
      banner: document.getElementById('banner').textContent,
      route: g.routeText(0, 'arcade'),
      calls: info.calls,
      tris: info.triangles,
      budget: g.level.map.budget,
    };
  });
  await page.screenshot({ path: new URL('boss-gunner.png', OUT).pathname });
  assert.deepEqual([r.map, r.kind, r.start.state, r.queue, r.bar, r.segs], ['docks', 'gunner', 'enter', 0, '碼頭重炮 HEAVY GUNNER', 5]);
  assert.ok(r.start.x < -24, `he starts off the map to the west (${r.start.x})`);
  assert.ok(r.steps > 250 && r.steps < 400 && r.state === 'walk', `in through the gate in about 2.6 s (${r.steps} steps, then ${r.state})`);
  assert.deepEqual(r.at, [-19.5, -8]);
  assert.match(r.banner, /BOSS/);
  assert.ok(r.route.endsWith('、重炮）'), r.route); // the route's last boss: his
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the plate: shots from the front glance off, four on his back take a segment; he walks at the player at 1.5 m/s and turns slowly', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    window.until(() => b.state === 'walk');
    b.gunT = b.mortarT = 999; // he only walks
    // from the front: nothing
    window.stand('front');
    window.fire(6);
    const front = { hp: b.hp, hits: b.hits, log: g.notes.events.some((e) => e.text.startsWith('子彈打在重炮的鋼板上')) };
    // from behind: four to a segment
    window.stand('back');
    window.fire(3);
    const three = { hp: b.hp, hits: b.hits };
    window.fire(1);
    const four = { hp: b.hp, hits: b.hits };
    // his walk: a second of it, towards a player 8 m off behind him, and how far round he turns in it
    const f0 = b.facing;
    p.x = b.x - Math.sin(f0) * 8;
    p.z = b.z - Math.cos(f0) * 8;
    b.path = null; // he had a path to where the player stood
    const x0 = b.x;
    const z0 = b.z;
    for (let i = 0; i < 120; i++) window.step();
    const walked = Math.hypot(b.x - x0, b.z - z0);
    const turned = Math.abs(((b.facing - f0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    return { front, three, four, walked: Math.round(walked * 100) / 100, turned: Math.round(turned * 100) / 100, state: b.state, log: g.notes.events.map((e) => e.text).filter((t) => t.includes('重炮')) };
  });
  assert.deepEqual(r.front, { hp: 5, hits: 0, log: true }, 'the plate takes every shot from the front');
  assert.deepEqual(r.three, { hp: 5, hits: 3 });
  assert.deepEqual(r.four, { hp: 4, hits: 0 }, 'the fourth on his back takes a segment');
  assert.ok(r.walked > 1.2 && r.walked < 1.7, `1.5 m/s at the player (${r.walked} m in a second)`);
  assert.ok(r.turned > 1.1 && r.turned <= 1.5, `turning about 1.4 rad in it (${r.turned})`);
  assert.ok(r.log.includes('重炮背後中彈（剩 4 段）'), r.log.join(' | '));
  assert.deepEqual(problems(logs), []);
});

test('the sweep: a red line on the player for 0.8 s, then a burst swept across it; the mortar: three rings, shells 1.5 s later; in the dark he does neither', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    window.until(() => b.state === 'walk');
    b.mortarT = 999;
    window.stand('front', 7);
    // the line comes on; he stands for it
    const toWarn = window.until(() => b.gunState === 'warn');
    const warn = { state: b.state, laser: b.laser.mesh.visible, lock: !!b.lock, t: b.t };
    const x0 = b.x;
    const spawned = [];
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.owner === 'enemy') spawned.push(Math.atan2(o.dx, o.dz));
      return spawn0(o);
    };
    window.until(() => b.gunState === 'fire');
    const warned = Math.round((b.t - warn.t) * 100) / 100;
    window.until(() => b.gunState === 'idle');
    g.bullets.spawn = spawn0;
    const span = Math.max(...spawned) - Math.min(...spawned);
    const sweep = { shots: spawned.length, span: Math.round(span * 100) / 100, stood: Math.round(Math.abs(b.x - x0) * 100) / 100, state: b.state };
    // the mortar: rings first, then the bursts; a player standing on the first ring is hurt
    b.gunT = 999;
    b.mortarT = 0.01;
    window.until(() => g.grenades.list.length > 0);
    const shells = g.grenades.list.filter((q) => q.owner === 'enemy');
    const rings = { count: shells.length, ringed: shells.every((q) => q.ring && q.ring.visible !== false), onPlayer: Math.hypot(shells[0].tx - p.x, shells[0].tz - p.z) < 0.05, flight: shells[0].T };
    const t0 = b.t;
    p.hp = 100;
    let n = 0;
    while (g.grenades.list.length > 0 && n++ < 600) window.step(true);
    const mortar = { lost: 100 - p.hp, took: Math.round((b.t - t0) * 100) / 100, log: g.notes.events.some((e) => e.text.startsWith('重炮發射迫擊砲')) };
    // in the dark: the lamp over him shot out, and no line, no shells
    const lamp = g.level.fixtures.find((f) => f.kind === 'lamp');
    b.x = lamp.x + 1.5;
    b.z = lamp.z;
    p.x = b.x + 6;
    p.z = b.z;
    while (lamp.dark <= 0) lamp.shot({ x: lamp.x, z: lamp.z, dx: 0, dz: 1 });
    b.gunT = 0.01;
    b.mortarT = 0.01;
    for (let i = 0; i < 240; i++) window.step();
    const dark = { blind: b.blind, gun: b.gunState, laser: b.laser.mesh.visible, shells: g.grenades.list.length, log: g.notes.events.some((e) => e.text === '重炮在黑暗中失去目標') };
    return { toWarn, warn, warned, sweep, rings, mortar, dark };
  });
  await page.screenshot({ path: new URL('boss-gunner-dark.png', OUT).pathname });
  assert.deepEqual([r.warn.state, r.warn.laser, r.warn.lock], ['plant', true, true], 'he plants his feet and the line comes on');
  assert.ok(Math.abs(r.warned - 0.8) < 0.03, `the line for 0.8 s (${r.warned} s)`);
  assert.equal(r.sweep.shots, 24, 'then 24 rounds');
  assert.ok(r.sweep.span > 1.3 && r.sweep.span < 1.5, `swept across about 1.4 rad (${r.sweep.span})`);
  assert.equal(r.sweep.stood, 0, 'standing still for it');
  assert.equal(r.sweep.state, 'walk', 'then on he comes');
  assert.deepEqual(r.rings, { count: 3, ringed: true, onPlayer: true, flight: 1.5 }, 'three shells, the first onto the player, each ringed for 1.5 s');
  assert.ok(r.mortar.lost >= 20, `a player standing on the ring is hurt (${r.mortar.lost} HP)`);
  assert.ok(r.mortar.took > 1.4 && r.mortar.took < 1.8, `the shells burst on landing (${r.mortar.took} s)`);
  assert.equal(r.mortar.log, true);
  assert.deepEqual(r.dark, { blind: true, gun: 'idle', laser: false, shells: 0, log: true }, 'in the dark: no line, no shells');
  assert.deepEqual(problems(logs), []);
});

test('a kick or a thug bowled into him staggers him, plate down; a blast and a kicked LPG cylinder take a segment; the fifth brings him down: BOSS +2,000, the clip, RUN CLEAR', { timeout: 300000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const clipped = [];
    const kill0 = g.clip.kill.bind(g.clip);
    g.clip.kill = (points) => {
      clipped.push(points);
      return kill0(points);
    };
    window.toFinal();
    window.until(() => b.state === 'walk');
    b.gunT = b.mortarT = 999;
    const s0 = g.score.score;
    // 1. a kick from the front: no segment, he staggers, and the next shots from the front count
    window.stand('front', 1.8);
    p.kick();
    const kicked = { hp: b.hp, state: b.state, timer: Math.round(b.timer * 100) / 100 };
    window.stand('front', 4);
    window.fire(4, 10); // 4 m at 60 m/s: 8 steps home
    const staggered = { hp: b.hp, state: b.state };
    window.until(() => b.state === 'walk');
    // 2. a thug kicked into him
    window.stand('back', 3);
    const e = g.enemies.spawn('grunt', { x: b.x - Math.sin(b.facing) * 1.3, z: b.z - Math.cos(b.facing) * 1.3, ex: 0, ez: 0 });
    e.spawnLock = 0;
    e.state = 'move';
    e.kick(Math.sin(b.facing), Math.cos(b.facing), 14);
    for (let i = 0; i < 6; i++) window.step(false, true);
    const bowled = { state: b.state, hp: b.hp, log: g.notes.events.some((x) => x.text.startsWith('打手撞到重炮身上')) };
    g.enemies.clear();
    window.until(() => b.state === 'walk');
    // 3. a grenade beside him
    g.explode(b.x + 1.5, b.z, 1, { kind: 'grenade' });
    const blasted = { hp: b.hp, state: b.state };
    window.until(() => b.state === 'walk');
    // 4. an LPG cylinder kicked at him jets into him and bursts
    const can = g.level.props.find((q) => q.kind === 'barrel' && q.variant === 'lpg' && q.alive && q.fuse < 0);
    window.stand('front', 6);
    can.x = p.x - Math.sin(p.facing) * -1; // a metre in front of the player, pointed at the gunner
    can.z = p.z - Math.cos(p.facing) * -1;
    can.y = 0;
    can.vx = can.vz = 0;
    const lit = can.rocket(Math.sin(p.facing), Math.cos(p.facing));
    let n = 0;
    while (can.alive && n++ < 400) window.step();
    const rocket = { lit, hp: b.hp, log: g.notes.events.some((x) => x.text === '重炮被火箭油桶炸中（剩 2 段）') };
    window.until(() => b.state === 'walk');
    // 5. the rest on his back
    window.stand('back', 4);
    window.fire(8, 10);
    const down = { active: b.active, downed: b.downed, hp: b.hp, state: b.state };
    const bonus = g.score.score - s0;
    n = 0;
    while (g.state === 'playing' && n++ < 120 * 6) window.step();
    return {
      kicked,
      staggered,
      bowled,
      blasted,
      rocket,
      down,
      bonus,
      clip: Math.max(0, ...clipped),
      cleared: g.waves.state,
      state: g.state,
      log: g.notes.events.map((x) => x.text).filter((t) => /重炮/.test(t)),
    };
  });
  await page.screenshot({ path: new URL('boss-gunner-down.png', OUT).pathname });
  assert.deepEqual(kickedOf(r), { hp: 5, state: 'stagger', timer: 0.7 }, 'a kick: no segment, a 0.7 s stagger');
  assert.deepEqual(r.staggered, { hp: 4, state: 'stagger' }, 'four from the front while he staggers take a segment');
  assert.deepEqual(r.bowled, { state: 'stagger', hp: 4, log: true }, 'a thug bowled into him staggers him');
  assert.deepEqual(r.blasted, { hp: 3, state: 'stagger' }, 'a blast: a segment, and he staggers');
  assert.deepEqual(r.rocket, { lit: true, hp: 2, log: true }, 'the cylinder jets into him and bursts: a segment');
  assert.deepEqual(r.down, { active: false, downed: true, hp: 0, state: 'down' });
  assert.ok(r.bonus >= 2000, `BOSS +2,000 (${r.bonus})`);
  assert.equal(r.clip, Number.MAX_SAFE_INTEGER, 'bringing him down outbids every kill for the clip');
  assert.equal(r.cleared, 'done');
  assert.equal(r.state, 'over', 'the run ends cleared');
  for (const want of ['踢得重炮一個踉蹌', '重炮踉蹌中中彈（剩 4 段）', '重炮被炸到（剩 3 段）', '重炮倒下']) assert.ok(r.log.includes(want), `${want} in ${r.log.join(' | ')}`);
  assert.ok(r.log.some((t) => t.startsWith('擊倒重炮：BOSS +2000')));
  assert.deepEqual(problems(logs), []);
});

const kickedOf = (r) => r.kicked;
