// Senado's two (議事亭：頭目 ②, ROADMAP §4: one far, one near): the marksman
// (test/senado-boss.test.mjs) and his partner, the shotgunner (散彈手 BUCKSHOT),
// in from the west end of the avenue. The shotgunner comes after the player
// (slower than him) and, near enough and in sight, braces 0.6 s, his fan red on
// the floor, before the blast; then he works the slide, open. Their combo 紅線
// 衝鋒 RED LINE RUSH: the marksman's line stops on the player and the
// shotgunner rushes the spot he stood on, to be there as the round comes. The
// way through: out of the line, and the shotgunner runs into it: the round
// takes his segment (CROSSFIRE). Both down within 3 s: DOUBLE KO. Neither is
// out of reach for long, and the bot beats the two.
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
    /** An arcade run from the club, moved on to its third stage (Senado) and the start of wave `wave`; the player up the square. */
    window.toWave = (wave = 12) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(1);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.player.x = 4; // in the open, north of the fountain
      g.player.z = 48;
      g.waves.wave = wave - 1;
      g.waves.startWave();
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** One logic step; the player still, unhurt unless `hurt`, nobody else about. */
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.enemies.clear();
      g.waves.pending.length = 0;
    };
    window.until = (cond, max = 3600, hurt = false) => {
      let n = 0;
      while (!cond() && n++ < max) window.step(hurt);
      return n;
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 in Senado is the two: a bar each, three segments each, the shotgunner in from the west of the avenue; the route names both', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const [, buck] = g.boss.members;
    const from = { x: buck.x, z: buck.z, state: buck.state };
    const enter = window.until(() => buck.state !== 'enter');
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const bar = document.getElementById('boss-bar');
    const info = g.renderer.info.render;
    return {
      kind: g.boss.def.kind,
      members: g.boss.members.map((m) => [m.def.kind, m.cfg.short, m.segments]),
      rows: [...bar.querySelectorAll('.boss-row')].map((row) => [row.querySelector('.boss-name').textContent, row.querySelectorAll('.boss-segs i:not(.lost)').length]),
      route: g.routeText(1, 'arcade'),
      from,
      enter: enter / 120,
      calls: info.calls,
      budget: g.level.map.budget,
    };
  });
  await page.screenshot({ path: new URL('senado-duo-bars.png', OUT).pathname });
  assert.equal(r.kind, 'duo');
  assert.deepEqual(r.members, [['marksman', '長槍手', 3], ['buckshot', '散彈手', 3]]);
  assert.deepEqual(r.rows, [['議事亭長槍手 MARKSMAN', 3], ['議事亭散彈手 BUCKSHOT', 3]]);
  assert.ok(r.route.endsWith('、長槍手與散彈手）'), r.route);
  assert.ok(r.from.state === 'enter' && r.from.x < -20, `he comes in from the west end of the avenue (${JSON.stringify(r.from)})`);
  assert.ok(r.enter <= 3, `in within 3 s (${r.enter})`);
  assert.ok(r.calls <= r.budget.calls, `${r.calls} draw calls, budget ${r.budget.calls}`);
  assert.deepEqual(problems(logs), []);
});

test('the shotgunner: after the player slower than him; near and in sight he braces 0.6 s with his fan drawn, then the blast hurts a player who stays, not one who steps out of the fan; then the slide, open', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const run = (sidestep) => {
      window.toWave(12);
      const [mark, buck] = g.boss.members;
      mark.hurt = () => {};
      mark.lineT = 999; // the marksman holds his fire throughout
      window.until(() => buck.state !== 'enter');
      g.boss.comboT = 999; // no combo now
      const x0 = buck.x;
      const z0 = buck.z;
      const d0 = Math.hypot(p.x - x0, p.z - z0);
      let t = 0;
      window.until(() => {
        mark.lineT = 999;
        t++;
        return buck.state === 'tell';
      }, 120 * 20);
      const speed = (d0 - Math.hypot(p.x - buck.x, p.z - buck.z)) / (t / 120);
      const near = Math.hypot(p.x - buck.x, p.z - buck.z);
      g.updateCamera(1, true);
      buck.sync();
      const fan = buck.fan.every((l) => l.mesh.visible);
      const hp0 = p.hp;
      let tell = 0;
      window.until(
        () => {
          mark.lineT = 999;
          if (buck.state === 'tell') tell++;
          if (sidestep && buck.state === 'tell' && buck.timer < 0.3) {
            const a = buck.aimA + Math.PI / 2;
            p.x += Math.sin(a) * 3.5; // across the fan
            p.z += Math.cos(a) * 3.5;
            sidestep = false;
          }
          return buck.state === 'pump';
        },
        400,
        true,
      );
      window.until(() => !g.bullets.list.some((x) => x.alive && x.owner === 'enemy'), 240, true);
      const lost = hp0 - p.hp;
      const open = buck.vulnerable();
      delete mark.hurt;
      return { speed, near, fan, tell: tell / 120, lost, open };
    };
    return { stay: run(false), step: run(true), player: g.player.speed ?? null };
  });
  assert.ok(r.stay.speed > 3 && r.stay.speed < 6, `after the player at ${r.stay.speed.toFixed(1)} m/s (the player runs 7.4)`);
  assert.ok(r.stay.near <= 7.1, `the brace begins within 7 m (${r.stay.near.toFixed(1)})`);
  assert.ok(r.stay.fan, 'his fan is drawn on the floor');
  assert.ok(Math.abs(r.stay.tell - 0.6) < 0.02, `0.6 s of it (${r.stay.tell})`);
  assert.ok(r.stay.lost > 0, `the blast hurts a player who stays (${r.stay.lost})`);
  assert.equal(r.step.lost, 0, 'and not one who steps out of the fan');
  assert.ok(r.stay.open, 'working the slide he is open');
});

test('the combo 紅線衝鋒 RED LINE RUSH: 10 s in, the marksman’s line stops on the player and the shotgunner crouches to rush, the same step, named on a banner; the rush ends on the spot as the round comes; the next 15 s on', { timeout: 300000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const [mark, buck] = g.boss.members;
    for (const m of g.boss.members) m.hurt = () => {};
    const t0 = g.worldTime;
    const banners = [];
    const banner0 = g.hud.banner.bind(g.hud);
    g.hud.banner = (title, text, kind) => {
      banners.push([g.worldTime - t0, title, text]);
      return banner0(title, text, kind);
    };
    const events = [];
    let prev = { m: mark.state, b: buck.state };
    let spot = null;
    for (let i = 0; i < 120 * 40; i++) {
      window.step();
      const t = g.worldTime - t0;
      if (mark.state === 'lock' && prev.m !== 'lock') events.push([t, 'line stops']);
      if (buck.state === 'windup' && prev.b !== 'windup') {
        events.push([t, 'crouch']);
        spot = { x: buck.rushTo.x, z: buck.rushTo.z };
      }
      if (mark.state === 'cycle' && prev.m !== 'cycle') events.push([t, 'round', buck.state, spot && Math.hypot(buck.x - spot.x, buck.z - spot.z)]);
      prev = { m: mark.state, b: buck.state };
    }
    g.hud.banner = banner0;
    for (const m of g.boss.members) delete m.hurt;
    return { events, combos: banners.filter((b) => b[1] === 'COMBO'), said: g.notes.events.filter((e) => e.text === '合招：紅線衝鋒').length };
  });
  assert.ok(r.combos.length >= 2, `two combos in 40 s (${JSON.stringify(r.combos)})`);
  assert.match(r.combos[0][2], /紅線衝鋒.*RED LINE RUSH/, 'named');
  assert.equal(r.said, r.combos.length, 'and each in the notes');
  assert.ok(r.combos[0][0] >= 10 - 1e-6 && r.combos[0][0] <= 16 + 1e-6, `the first at 10 s, or within 6 s after while the marksman reaches a post (${r.combos[0][0].toFixed(2)})`);
  assert.ok(r.combos[1][0] - r.combos[0][0] >= 15 - 1e-6, `the next 15 s on (${(r.combos[1][0] - r.combos[0][0]).toFixed(2)})`);
  for (const [t] of r.combos) {
    const at = (what) => r.events.filter(([te, w]) => w === what && te - t > -0.01 && te - t < 2.5);
    assert.ok(at('line stops').some(([te]) => Math.abs(te - t) < 0.01), `the line stops on him with it (${JSON.stringify(r.events)})`);
    assert.ok(at('crouch').some(([te]) => Math.abs(te - t) < 0.01), 'and the shotgunner crouches to rush');
    const round = at('round')[0];
    assert.ok(round && round[2] === 'brace' && round[3] < 2, `as the round comes he is braced on the spot, or short of the player still on it (${JSON.stringify(round)})`);
  }
  assert.deepEqual(problems(logs), []);
});

test('the way through the combo: out of the line, the shotgunner runs into it and the round takes his segment: CROSSFIRE; standing in it, the player takes the round', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const run = (out) => {
      window.toWave(12);
      const [mark, buck] = g.boss.members;
      window.until(() => buck.state === 'chase' && mark.state === 'post' && mark.lineT <= 0, 120 * 20);
      // the shotgunner 7 m off the player, square to the marksman's line to him, on whichever side has the floor
      const a = Math.atan2(p.x - mark.x, p.z - mark.z) + Math.PI / 2;
      const side = g.level.nav.isWalkable(p.x + Math.sin(a) * 7, p.z + Math.cos(a) * 7) && g.level.nav.lineWalkable(p.x, p.z, p.x + Math.sin(a) * 7, p.z + Math.cos(a) * 7) ? 1 : -1;
      buck.x = p.x + Math.sin(a) * 7 * side;
      buck.z = p.z + Math.cos(a) * 7 * side;
      g.boss.comboT = 0; // the combo, now
      const hp = buck.hp;
      const php = p.hp;
      const score0 = g.score.score;
      let moved = !out;
      window.until(
        () => {
          if (!moved && mark.state === 'lock' && mark.timer < 0.6) {
            p.x -= Math.sin(a) * 3 * side; // out of the line, square to it, away from him
            p.z -= Math.cos(a) * 3 * side;
            moved = true;
          }
          return mark.state === 'cycle';
        },
        600,
        true,
      );
      window.until(() => !g.bullets.list.some((x) => x.alive && x.owner === 'enemy' && x.source === mark), 240, true);
      return { combo: g.boss.combos, lost: hp - buck.hp, took: php - p.hp, crossfire: g.notes.events.some((e) => e.text.includes('CROSSFIRE')), scored: g.score.score - score0 };
    };
    return { out: run(true), stay: run(false) };
  });
  assert.equal(r.out.combo, 1);
  assert.equal(r.out.lost, 1, `the shotgunner lost ${r.out.lost}`);
  assert.equal(r.out.crossfire, true, 'CROSSFIRE');
  assert.ok(r.out.scored >= 300, `scored (${r.out.scored})`);
  assert.equal(r.stay.lost, 0, 'standing in the line, the round is not his');
  assert.ok(r.stay.took >= 40, `it is the player’s (${r.stay.took})`);
  assert.equal(r.stay.crossfire, false);
});

test('one down, the other rages; both down within 3 s: DOUBLE KO, further apart none; the notes say so in Chinese', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (gap) => {
      window.toWave(12);
      for (let i = 0; i < 30; i++) window.step();
      const [mark, buck] = g.boss.members;
      const before = g.notes.events.filter((e) => e.text.startsWith('DOUBLE KO')).length;
      for (let i = 0; i < 3; i++) buck.hurt('測試');
      const raged = g.boss.raged === mark;
      for (let i = 0; i < gap * 120; i++) window.step();
      for (let i = 0; i < 3; i++) mark.hurt('測試');
      window.step();
      return { ko: g.notes.events.filter((e) => e.text.startsWith('DOUBLE KO')).length - before, raged, downed: g.boss.downed };
    };
    const quick = run(2);
    const slow = run(4);
    return { quick, slow, notes: g.notes.events.map((e) => e.text) };
  });
  assert.equal(r.quick.raged, true, 'the shotgunner down, the marksman rages');
  assert.equal(r.quick.ko, 1);
  assert.equal(r.slow.ko, 0);
  assert.ok(r.quick.downed && r.slow.downed);
  assert.ok(r.notes.some((t) => t.includes('散彈手倒下，長槍手發狂')), r.notes.slice(-8).join(' / '));
});

test('no waiting: neither is out of the player’s reach for more than 3 s at a time, each’s first chance within 15 s', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    for (const m of g.boss.members) m.hurt = () => {};
    const each = g.boss.members.map((m) => ({ who: m.cfg.short, m, first: null, longest: 0, run: 0 }));
    for (let i = 0; i < 120 * 45; i++) {
      window.step();
      const t = i / 120;
      for (const e of each) {
        if (e.m.vulnerable()) {
          if (e.first === null) e.first = t;
          e.run = 0;
        } else {
          e.run += 1 / 120;
          e.longest = Math.max(e.longest, e.run);
        }
      }
    }
    for (const m of g.boss.members) delete m.hurt;
    return each.map(({ who, first, longest }) => ({ who, first, longest }));
  });
  for (const e of r) {
    assert.ok(e.first !== null && e.first <= 15, `${e.who}: the first chance at ${e.first} s`);
    assert.ok(e.longest <= 3, `${e.who}: out of reach ${e.longest.toFixed(2)} s at the longest`);
  }
});

test('screenshot: the combo, the shotgunner rushing into the marksman’s line as the player steps out of it', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.toWave(12);
    const [mark, buck] = g.boss.members;
    window.until(() => buck.state === 'chase' && mark.state === 'post' && mark.lineT <= 0, 120 * 20);
    // as in the way through: him 7 m off the player, square to the line, and the player stepping away from him out of it
    const a = Math.atan2(p.x - mark.x, p.z - mark.z) + Math.PI / 2;
    const side = g.level.nav.isWalkable(p.x + Math.sin(a) * 7, p.z + Math.cos(a) * 7) && g.level.nav.lineWalkable(p.x, p.z, p.x + Math.sin(a) * 7, p.z + Math.cos(a) * 7) ? 1 : -1;
    buck.x = p.x + Math.sin(a) * 7 * side;
    buck.z = p.z + Math.cos(a) * 7 * side;
    g.boss.comboT = 0;
    let moved = false;
    window.until(() => {
      if (!moved && mark.state === 'lock' && mark.timer < 0.6) {
        p.x -= Math.sin(a) * 3 * side;
        p.z -= Math.cos(a) * 3 * side;
        moved = true;
      }
      return mark.state === 'lock' && mark.timer < 0.08;
    }, 600);
    g.updateCamera(1, true);
    for (const m of g.boss.members) m.sync();
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('senado-duo-combo.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('the bot beats the two in Senado, in god mode, within four minutes of the fight', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 1, view: 2, seed: 9, mode: 'arcade', restart: false });
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    g.player.hurt = () => false; // god mode
    let frames = 0;
    while (!g.boss.downed && frames < 60 * 240) {
      window.simStep(60);
      frames += 60;
    }
    delete g.player.hurt;
    return { downed: g.boss.downed, s: frames / 60, hp: g.boss.members.map((m) => m.hp) };
  });
  assert.equal(r.downed, true, `both down (${r.s} s, ${r.hp})`);
  assert.deepEqual(problems(logs), []);
});
