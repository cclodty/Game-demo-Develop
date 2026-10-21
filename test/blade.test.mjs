// The club's boss, remade (頭目重做 ①, playtest feedback ②): an arcade run that
// ends in the club meets the blade queen on its last wave. She crouches at a
// perch, where a blade turns shots aside, dashes at the player (shots pass
// through her), stops short and raises both blades for half a second: the
// window. Her dashes through the player (a feint's hop, the dash off to a
// perch) knock him flying unless he slides under or spins past. A shot in
// it takes a segment, a pan smash or a batted-back bullet two, a kick shoves
// her back and holds the window open; then she cuts (a spin dodges it) and
// dashes off to another perch. A blast beside her takes a segment. The fifth:
// BOSS +2,000, the run's clip, RUN CLEAR. She fights alone.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=11'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** An arcade run from Senado, moved on to its third stage (the club) and the start of wave 12; the player mid-floor. */
    window.toFinal = () => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(3);
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
    };
    /** One logic step; the player still, unhurt unless `hurt`, and nobody else about. */
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
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
    window.dist = () => Math.hypot(g.boss.x - g.player.x, g.boss.z - g.player.z);
    /** One player shot from where the player stands at the boss, then `steps` steps (60 m/s: home within a few). */
    window.fire = (steps = 8, homeRun = false) => {
      const p = g.player;
      const b = g.boss;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      const shot = g.bullets.spawn({ x: p.x, z: p.z, dx: dx / d, dz: dz / d, speed: 60, owner: 'player', damage: 1 });
      shot.homeRun = homeRun;
      for (let k = 0; k < steps; k++) window.step();
    };
    window.face = () => {
      g.player.facing = Math.atan2(g.boss.x - g.player.x, g.boss.z - g.player.z);
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 in the club is the blade queen at a perch; the route names her; it stays inside the render budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFinal();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const b = g.boss;
    const bar = document.getElementById('boss-bar');
    const info = g.renderer.info.render;
    const perch = b.def.perches.some(([x, z]) => Math.hypot(x - b.x, z - b.z) < 0.01);
    return {
      map: g.level.map.id,
      kind: b.active && b.def.kind,
      state: b.state,
      perch,
      queue: g.waves.queue.length,
      bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent,
      segs: bar.querySelectorAll('.boss-segs i:not(.lost)').length,
      banner: document.getElementById('banner').textContent,
      route: g.routeText(3, 'arcade'),
      calls: info.calls,
      tris: info.triangles,
      budget: g.level.map.budget,
    };
  });
  await page.screenshot({ path: new URL('boss-blade.png', OUT).pathname });
  assert.deepEqual([r.map, r.kind, r.state, r.perch, r.queue, r.bar, r.segs], ['club', 'blade', 'perch', true, 0, '夜店刀后 BLADE QUEEN', 5]);
  assert.match(r.banner, /BOSS/);
  assert.ok(r.route.endsWith('、刀后）'), r.route); // the route's last boss: hers
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('perched she turns shots aside; the dash: shots pass through, she stops short and raises the blades for 0.5 s, then cuts; a spin dodges the cut; she retreats to a perch', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal();
    // shots at a perched queen do nothing
    window.fire(30);
    window.fire(30);
    const guarded = { hp: b.hp, state: b.state, log: g.notes.events.some((e) => e.text.startsWith('刀后格開子彈')) };
    // she dashes in: shots through where she is find nothing
    const toDash = window.until('dash');
    const speed0 = b.speed();
    let n = 0;
    while (window.dist() > 6 && b.state === 'dash' && n++ < 2000) window.step();
    const through = g.boss.shotAt(b.x - 1, b.z, b.x + 1, b.z);
    const ghosts = g.style.ghosts.live.length;
    const toTell = window.until('tell');
    const tell = { dist: Math.round(window.dist() * 100) / 100, hp: b.hp, t: b.t };
    // the camera on the moment, for the eye (and the draw calls mid-fight, afterimages and all)
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = { calls: g.renderer.info.render.calls, budget: g.level.map.budget.calls };
    return { guarded, toDash, speed0, through, ghosts, toTell, tell, info };
  });
  await page.screenshot({ path: new URL('boss-blade-tell.png', OUT).pathname });
  const r2 = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const t0 = b.t;
    // the window lasts 0.5 s; then the cut lands on a player standing there
    p.hp = 100;
    let n = 0;
    while (b.state === 'tell' && n++ < 200) window.step(true);
    const window1 = Math.round((b.t - t0) * 100) / 100;
    while (b.state === 'cut' && n++ < 200) window.step(true);
    const cut = { lost: 100 - p.hp, hit: g.notes.events.some((e) => e.text.includes('刀后的刀')) };
    // off to a perch
    const toPerch = window.until('perch');
    const perched = b.def.perches.some(([x, z]) => Math.hypot(x - b.x, z - b.z) < 0.05);
    // the next cut: a spin rides it out
    window.until('tell');
    p.hp = 100;
    n = 0;
    while (b.state !== 'retreat' && n++ < 400) {
      p.spinT = 0.5;
      window.step(true);
    }
    const spun = { lost: 100 - p.hp, dodge: g.notes.events.some((e) => e.text === '旋轉閃過刀后的刀') };
    p.spinT = 0;
    return { window1, cut, toPerch, perched, spun };
  });
  Object.assign(r, r2);
  assert.deepEqual(r.guarded, { hp: 5, state: 'perch', log: true }, 'a perched queen turns shots aside');
  assert.ok(r.toDash + 60 > 180 && r.toDash + 60 < 240, `she waits about 1.6 s at the first perch (${r.toDash + 60} steps)`);
  assert.equal(r.speed0, 14);
  assert.equal(r.through, null, 'a shot through a dashing queen finds nothing');
  assert.ok(r.ghosts > 0, 'afterimages behind her dash');
  assert.ok(r.toTell < 400, `she reaches the player within a few seconds (${r.toTell} steps)`);
  assert.ok(r.tell.dist > 1.3 && r.tell.dist < 2.1, `she stops about 1.7 m short (${r.tell.dist} m)`);
  assert.equal(r.tell.hp, 5);
  assert.ok(r.info.calls <= r.info.budget, `${r.info.calls} draw calls mid-fight, budget ${r.info.budget}`);
  assert.ok(Math.abs(r.window1 - 0.5) < 0.02, `the blades are up for 0.5 s (${r.window1} s)`);
  assert.deepEqual(r.cut, { lost: 28, hit: true }, 'the cut: 28 HP');
  assert.ok(r.toPerch < 600 && r.perched, `then she is back at a perch (${r.toPerch} steps, at one: ${r.perched})`);
  assert.deepEqual(r.spun, { lost: 0, dodge: true }, 'a spin dodges the cut');
  assert.deepEqual(problems(logs), []);
});

test('her dash off runs through a player in its way: knocked flying, unless he slides under it', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    /** Into the path of her dash off to a perch, `slide` or standing: the HP lost over the next steps. */
    const inPath = (slide) => {
      window.until('retreat');
      // out of her way while she gets up to speed (a player she stood beside is passed, not hit), then into it
      p.x = 0;
      p.z = 12;
      let n = 0;
      while (b.dashT < 0.1 && b.state === 'retreat' && n++ < 200) window.step();
      p.x = b.x + Math.sin(b.facing) * 0.5;
      p.z = b.z + Math.cos(b.facing) * 0.5;
      p.hp = 100;
      for (let i = 0; i < 6; i++) {
        if (slide) p.slideT = 0.5;
        window.step(true);
      }
      p.slideT = 0;
      const lost = 100 - p.hp;
      window.until('perch');
      p.x = 0;
      p.z = 0;
      return lost;
    };
    const standing = inPath(false);
    const sliding = inPath(true);
    return { standing, sliding, log: g.notes.events.map((e) => e.text).filter((t) => /撞飛|閃過刀后的衝刺/.test(t)) };
  });
  assert.equal(r.standing, 20, 'run through: 20 HP');
  assert.equal(r.sliding, 0, 'a slide passes under her');
  assert.ok(r.log.some((t) => t.includes('刀后撞飛')) && r.log.includes('閃過刀后的衝刺'), r.log.join(' | '));
  assert.deepEqual(problems(logs), []);
});

test('the window: a shot takes a segment (one a window), a kick shoves her and holds it open, a blast at her perch counts, a batted-back bullet and a pan smash take two; the fifth brings her down: BOSS +2,000, the clip, RUN CLEAR', { timeout: 300000 }, async () => {
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
    const s0 = g.score.score;
    // 1. a shot in the window: one segment, and she reels off; a second shot in the same window takes nothing more
    window.until('tell');
    window.fire(6);
    const one = { hp: b.hp, state: b.state };
    window.fire(6);
    const two = { hp: b.hp };
    // 2. a kick in the window: no segment, she is shoved back, the window lasts longer
    window.until('tell');
    const d0 = window.dist();
    const t0 = b.t;
    window.face();
    p.kick();
    for (let i = 0; i < 12; i++) window.step();
    const kicked = { hp: b.hp, pushed: Math.round((window.dist() - d0) * 100) / 100, state: b.state };
    let n = 0;
    while (b.state === 'tell' && n++ < 300) window.step(true);
    const window2 = Math.round((b.t - t0) * 100) / 100;
    // 3. a blast beside her perch
    window.until('perch');
    g.explode(b.x + 1, b.z, 1, { kind: 'grenade' });
    const blasted = { hp: b.hp, state: b.state };
    // 4. a batted-back bullet (HOME RUN) in the window: two segments
    window.until('tell');
    window.fire(6, true);
    const homeRun = { hp: b.hp };
    const speed = b.speed();
    // 5. a pan smash in the window: two segments, more than she has left
    const tray = g.level.props.find((q) => q.kind === 'pan' && q.alive);
    tray.x = p.x;
    tray.z = p.z;
    tray.y = 0;
    g.thrown.pickAction();
    const inHand = g.thrown.inHand;
    window.until('tell');
    window.face();
    p.smash();
    const down = { active: b.active, downed: b.downed, hp: b.hp, state: b.state };
    const bonus = g.score.score - s0;
    n = 0;
    while (g.state === 'playing' && n++ < 120 * 6) window.step();
    return {
      one,
      two,
      kicked,
      window2,
      blasted,
      homeRun,
      speed,
      inHand,
      down,
      bonus,
      clip: Math.max(0, ...clipped),
      cleared: g.waves.state,
      state: g.state,
      log: g.notes.events.map((x) => x.text).filter((t) => /刀后/.test(t)),
    };
  });
  await page.screenshot({ path: new URL('boss-blade-down.png', OUT).pathname });
  assert.deepEqual(r.one, { hp: 4, state: 'reel' }, 'a shot in the window: a segment, and she reels');
  assert.equal(r.two.hp, 4, 'one segment a window');
  assert.equal(r.kicked.hp, 4, 'a kick takes no segment');
  assert.ok(r.kicked.pushed > 0.5, `but shoves her back (${r.kicked.pushed} m)`);
  assert.equal(r.kicked.state, 'tell', 'and the blades stay up');
  assert.ok(r.window2 > 0.9 && r.window2 < 1.1, `the window held open to about 1 s (${r.window2} s)`);
  assert.deepEqual(r.blasted, { hp: 3, state: 'reel' }, 'a blast beside her perch: a segment');
  assert.equal(r.homeRun.hp, 1, 'a batted-back bullet: two');
  assert.equal(r.speed, 24, 'four segments down she dashes at 24 m/s');
  assert.equal(r.inHand, true, 'the tray in hand');
  assert.deepEqual(r.down, { active: false, downed: true, hp: 0, state: 'down' }, 'the smash takes the last');
  assert.ok(r.bonus >= 2000, `BOSS +2,000 (${r.bonus})`);
  assert.equal(r.clip, Number.MAX_SAFE_INTEGER, 'bringing her down outbids every kill for the clip');
  assert.equal(r.cleared, 'done');
  assert.equal(r.state, 'over', 'the run ends cleared');
  for (const want of ['刀后中彈（剩 4 段）', '踢退刀后：刀還亮着', '刀后被炸到（剩 3 段）', '刀后被擋回的子彈打中（剩 1 段）', '鑊擊中刀后', '刀后倒下']) assert.ok(r.log.includes(want), `${want} in ${r.log.join(' | ')}`);
  assert.ok(r.log.some((t) => t.startsWith('擊倒刀后：BOSS +2000')));
  assert.deepEqual(problems(logs), []);
});
