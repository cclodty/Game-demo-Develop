// 雙頭目 ① (DECISIONS 2026-10-22): two bosses at once. A map's boss can be a
// duo (boss.js `duo`: `pair`, two defs of their own kinds); here the docks get
// the blade queen and the heavy gunner together (no map has a duo yet). The
// game talks to the duo as to one boss: a bar each on the HUD with its own name
// and segments (a stage's: 2 each, the run's last: 3 each), each shot or blast
// goes to the one it meets, one down leaves the other fighting, and only both
// down pays the BOSS bonus and ends the wave. The two never start a warning
// within DUO.gap s of each other. 雙頭目 ②: one down, the other stands still
// 1.5 s (any shot then takes a segment) and then fights faster and harder;
// both down within 3 s is a DOUBLE KO; one hurt by the other's bullet or shell
// is a CROSSFIRE; neither is ever out of reach for long (the no-waiting rule);
// and the bot beats the two. The combo (合招, here 夾擊 PINCER): every 15 s
// from 10 s in, the two start together, named on a banner (the one exception
// to the gap): the gunner's red line, the queen crouched, going 1 s later so
// that her blades are up as his rounds cross; with her between him and the
// player, the sweep cuts into her (CROSSFIRE). Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=21'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    const docks = g.maps.find((m) => m.id === 'docks');
    window.single = docks.boss;
    // the queen at four places on the quay (on the walkable grid: she stands on them), the gunner in through the west
    // gate as on his own
    window.pair = {
      kind: 'duo',
      pair: [
        { kind: 'blade', perches: [[6.5, 6.5], [-4, 9], [11.5, -7.5], [-12, 4]] },
        { kind: 'gunner', from: [-26, -8], at: [-19.5, -8] },
      ],
    };
    /** An arcade run from the rooftop moved on to the docks (its third stage) and the start of wave `wave`. */
    window.toWave = (wave) => {
      docks.boss = window.pair;
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.player.x = 4;
      g.player.z = 2;
      g.waves.wave = wave - 1;
      g.waves.startWave();
    };
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.enemies.clear();
      g.waves.pending.length = 0;
    };
  });
});
after(async () => {
  await page.evaluate(() => {
    window.game.maps.find((m) => m.id === 'docks').boss = window.single;
  });
  await h.close();
});

test('wave 12 on the docks is the two of them: a bar each with its own name, three segments each; the route names both', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    for (let i = 0; i < 30; i++) window.step();
    g.hud.update(1 / 60);
    const bar = document.getElementById('boss-bar');
    return {
      kind: g.boss.def.kind,
      members: g.boss.members.map((m) => [m.cfg.short, m.segments, m.active]),
      hp: g.boss.hp,
      rows: [...bar.querySelectorAll('.boss-row')].map((row) => [row.querySelector('.boss-name').textContent, row.querySelectorAll('.boss-segs i:not(.lost)').length]),
      duo: bar.classList.contains('duo') && !bar.classList.contains('hidden'),
      route: g.routeText(0, 'arcade'),
    };
  });
  assert.equal(r.kind, 'duo');
  assert.deepEqual(r.members, [['刀后', 3, true], ['重炮', 3, true]]);
  assert.equal(r.hp, 6);
  assert.deepEqual(
    r.rows.map(([name, n]) => [name.split(' ')[0], n]),
    [['夜店刀后', 3], ['碼頭重炮', 3]],
  );
  assert.equal(r.duo, true, 'two bars side by side');
  assert.match(r.route, /刀后與重炮/);
  await page.screenshot({ path: new URL('duo-bars.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('a stage’s duo (wave 4) is two segments each', async () => {
  const r = await page.evaluate(() => {
    window.toWave(4);
    return window.game.boss.members.map((m) => m.segments);
  });
  assert.deepEqual(r, [2, 2]);
});

test('one down, the other fights on and the wave goes on; both down, one BOSS bonus, the clip, and the wave ends', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    for (let i = 0; i < 30; i++) window.step();
    const [blade, gunner] = g.boss.members;
    const score0 = g.score.score;
    // the run's clip: a boss going down claims it (clip.js kill with the highest score there is)
    let clips = 0;
    const kill0 = g.clip.kill.bind(g.clip);
    g.clip.kill = (pts) => {
      if (pts === Number.MAX_SAFE_INTEGER) clips++;
      return kill0(pts);
    };
    for (let i = 0; i < 3; i++) blade.hurt('測試');
    for (let i = 0; i < 60; i++) window.step();
    const one = { blade: blade.downed, gunner: gunner.active, duo: g.boss.active, downed: g.boss.downed, wave: g.waves.state, hp: g.boss.hp, bonus: g.score.score - score0, clips };
    for (let i = 0; i < 3; i++) gunner.hurt('測試');
    for (let i = 0; i < 2; i++) window.step();
    const both = { downed: g.boss.downed, active: g.boss.active, bonuses: g.notes.events.filter((e) => /BOSS \+/.test(e.text)).length, clips };
    for (let i = 0; i < 120 * 3 && g.waves.state === 'active'; i++) window.step();
    both.wave = g.waves.state;
    g.clip.kill = kill0;
    return { one, both };
  });
  assert.equal(r.one.blade, true, 'the queen is down');
  assert.equal(r.one.gunner, true, 'the gunner fights on');
  assert.equal(r.one.duo, true);
  assert.equal(r.one.downed, false, 'the duo is not down');
  assert.equal(r.one.wave, 'active', 'the wave goes on');
  assert.equal(r.one.hp, 3);
  assert.equal(r.one.bonus, 0, 'no BOSS bonus yet');
  assert.equal(r.one.clips, 0, 'nor the clip');
  assert.equal(r.both.downed, true);
  assert.equal(r.both.active, false);
  assert.equal(r.both.bonuses, 1, 'one BOSS bonus');
  assert.equal(r.both.clips, 1, 'the clip, once');
  assert.notEqual(r.both.wave, 'active', `and the wave ends (${r.both.wave})`);
  assert.deepEqual(problems(logs), []);
});

test('a shot meets the one it hits: shots on the queen go to her, a kick reaches whichever is near', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const [blade, gunner] = g.boss.members;
    blade.update = () => {};
    gunner.update = () => {};
    // the queen crouched at a perch: a shot at her is turned aside by a blade (her `guard`), and only she sees it
    const p = g.player;
    const hit = g.boss.shotAt(blade.x - 6, blade.z, blade.x + 1, blade.z);
    const who = hit && hit.part.member === blade;
    delete blade.update;
    delete gunner.update;
    return { who, part: hit && hit.part.part, px: p.x };
  });
  assert.equal(r.who, true, 'the shot is the queen’s');
  assert.ok(r.part, 'and names her part');
});

test('the two never start a warning within 0.6 s of each other over a minute of the fight', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const duo = g.boss;
    const starts = [];
    const may = duo.mayTell.bind(duo);
    duo.mayTell = (m) => {
      const ok = may(m);
      if (ok) starts.push({ who: m.cfg.short, t: g.worldTime });
      return ok;
    };
    for (let i = 0; i < 120 * 60 && duo.active; i++) window.step();
    delete duo.mayTell;
    let closest = Infinity;
    for (let i = 1; i < starts.length; i++) if (starts[i].who !== starts[i - 1].who) closest = Math.min(closest, starts[i].t - starts[i - 1].t);
    return { starts: starts.length, who: [...new Set(starts.map((s) => s.who))], closest };
  });
  assert.ok(r.starts >= 6, `warnings started (${r.starts})`);
  assert.deepEqual(r.who.sort(), ['刀后', '重炮'].sort(), 'both warned');
  assert.ok(r.closest >= 0.6 - 1e-9, `never within 0.6 s of the other (closest ${r.closest.toFixed(2)} s)`);
  assert.deepEqual(problems(logs), []);
});

test('one down, the other stands still 1.5 s (a shot then takes a segment), then fights 1.2 times as fast and harder', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const [blade, gunner] = g.boss.members;
    // the gunner in through the gate first (he does not walk while he stands still for the rage)
    for (let i = 0; i < 120 * 5 && gunner.state === 'enter'; i++) window.step();
    for (let i = 0; i < 3; i++) blade.hurt('測試');
    const at = { x: gunner.x, z: gunner.z };
    for (let i = 0; i < 60; i++) window.step(); // half a second
    const still = Math.hypot(gunner.x - at.x, gunner.z - at.z);
    // a shot at his front, his plate towards it: in the pause it takes a segment all the same
    const hp = gunner.hp;
    const p = g.player;
    const b = g.bullets.spawn({ x: gunner.x + Math.sin(gunner.facing) * 4, z: gunner.z + Math.cos(gunner.facing) * 4, dx: -Math.sin(gunner.facing), dz: -Math.cos(gunner.facing), speed: 60, owner: 'player', damage: 1 });
    for (let i = 0; i < 30 && b.alive; i++) g.bullets.update(1 / 120);
    const took = hp - gunner.hp;
    for (let i = 0; i < 150; i++) window.step(); // the pause is over
    const t0 = gunner.mortarT;
    window.step();
    return { still, took, raging: gunner.raging, rate: (t0 - gunner.mortarT) / (1 / 120), said: g.notes.events.some((e) => e.text.includes('發狂')), px: p.x };
  });
  assert.ok(r.still < 0.01, `he stood still (${r.still.toFixed(3)} m)`);
  assert.equal(r.took, 1, 'a shot on his plate in the pause took a segment');
  assert.equal(r.raging, true, 'his shells come more often');
  assert.ok(Math.abs(r.rate - 1.2) < 0.01, `his world runs 1.2 times as fast (${r.rate.toFixed(3)})`);
  assert.equal(r.said, true);
});

test('both down within 3 s: DOUBLE KO; further apart, none', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (gap) => {
      window.toWave(12);
      for (let i = 0; i < 30; i++) window.step();
      const [blade, gunner] = g.boss.members;
      const before = g.notes.events.filter((e) => e.text.startsWith('DOUBLE KO')).length;
      for (let i = 0; i < 3; i++) blade.hurt('測試');
      for (let i = 0; i < gap * 120; i++) window.step();
      for (let i = 0; i < 3; i++) gunner.hurt('測試');
      window.step();
      return g.notes.events.filter((e) => e.text.startsWith('DOUBLE KO')).length - before;
    };
    return { quick: run(2), slow: run(4) };
  });
  assert.equal(r.quick, 1);
  assert.equal(r.slow, 0);
});

test('CROSSFIRE: the gunner’s shell bursting by the queen takes her segment, and scores', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    for (let i = 0; i < 30; i++) window.step();
    const [blade, gunner] = g.boss.members;
    const hp = blade.hp;
    g.explode(blade.x + 0.5, blade.z, 2.4, { kind: 'grenade', source: '重炮 的榴彈', by: gunner });
    return { lost: hp - blade.hp, said: g.notes.events.some((e) => e.text.includes('CROSSFIRE')) };
  });
  assert.equal(r.lost, 1);
  assert.equal(r.said, true);
});

test('no waiting: neither of the two is out of the player’s reach for more than 3 s at a time, each’s first chance within 15 s', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    // both kept up for the 45 s (his own shells and their crossfire would bring them down with nobody shooting)
    for (const m of g.boss.members) m.hurt = () => {};
    // each of the two on its own (Boss.vulnerable: the queen whenever she is not mid-dash, a blast, and with her blades
    // up a shot too; the gunner once in through the gate)
    const each = g.boss.members.map((m) => ({ who: m.cfg.short, m, first: null, longest: 0, run: 0, open: 0 }));
    for (let i = 0; i < 120 * 45; i++) {
      window.step();
      const t = i / 120;
      for (const e of each) {
        if (e.m.vulnerable()) {
          if (e.first === null) e.first = t;
          e.run = 0;
          e.open++;
        } else {
          e.run += 1 / 120;
          // out of reach from the first chance on (the gunner walking in through the gate is the first 15 s' business)
          if (e.first !== null) e.longest = Math.max(e.longest, e.run);
        }
      }
    }
    for (const m of g.boss.members) delete m.hurt; // the two are made once and kept: the next test has them as they are
    return each.map(({ who, first, longest, open }) => ({ who, first, longest, open: open / 120 }));
  });
  for (const e of r) {
    assert.ok(e.first !== null && e.first <= 15, `${e.who}: the first chance at ${e.first} s`);
    assert.ok(e.longest <= 3, `${e.who}: out of reach ${e.longest.toFixed(2)} s at the longest`);
  }
  // the measure measures: the queen is out of reach while she dashes (the gunner, once in, never is: his back)
  assert.ok(r.some((e) => e.open < 45 - e.first - 1), `one of them is out of reach at times (${JSON.stringify(r)})`);
});

test('the bot beats the two on the docks, in god mode, within four minutes of the fight', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 9, mode: 'arcade', restart: false });
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
    return { downed: g.boss.downed, s: frames / 60, state: g.waves.state };
  });
  assert.equal(r.downed, true, `both down (${r.s} s)`);
  assert.deepEqual(problems(logs), []);
});

test('the combo 夾擊 PINCER: 10 s into the fight the gunner’s red line and the queen crouching start together, named on a banner; she goes 1 s later; the next one 15 s after', { timeout: 300000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const [blade, gunner] = g.boss.members;
    for (const m of g.boss.members) m.hurt = () => {}; // both up for the 40 s
    const t0 = g.worldTime;
    const banners = [];
    const banner0 = g.hud.banner.bind(g.hud);
    g.hud.banner = (title, text, kind) => {
      banners.push([g.worldTime - t0, title, text]);
      return banner0(title, text, kind);
    };
    const events = []; // [t, what]
    let prev = { lag: 0, state: blade.state, gun: gunner.gunState };
    for (let i = 0; i < 120 * 40; i++) {
      window.step();
      const t = g.worldTime - t0;
      if (blade.comboLag > 0 && !(prev.lag > 0)) events.push([t, 'queen crouches']);
      if (blade.state === 'dash' && prev.state !== 'dash') events.push([t, 'queen goes']);
      if (gunner.gunState === 'warn' && prev.gun !== 'warn') events.push([t, 'red line']);
      prev = { lag: blade.comboLag, state: blade.state, gun: gunner.gunState };
    }
    g.hud.banner = banner0;
    for (const m of g.boss.members) delete m.hurt;
    return { events, combos: banners.filter((b) => b[1] === 'COMBO'), count: g.boss.combos, said: g.notes.events.filter((e) => e.text === '合招：夾擊').length };
  });
  assert.ok(r.combos.length >= 2, `two combos in 40 s (${JSON.stringify(r.combos)})`);
  assert.match(r.combos[0][2], /夾擊.*PINCER/, 'named');
  assert.equal(r.said, r.combos.length, 'and each in the notes');
  assert.ok(r.combos[0][0] >= 10 - 1e-6 && r.combos[0][0] <= 13 + 1e-6, `the first at 10 s, or within 3 s after when one of them was busy (${r.combos[0][0].toFixed(2)})`);
  assert.ok(r.combos[1][0] - r.combos[0][0] >= 15 - 1e-6, `the next 15 s on (${(r.combos[1][0] - r.combos[0][0]).toFixed(2)})`);
  for (const [t] of r.combos) {
    const at = (what) => r.events.filter(([te, w]) => w === what && Math.abs(te - t) < 1.5).map(([te]) => te - t);
    assert.deepEqual(at('red line').map((d) => Math.abs(d) < 0.01), [true], `the red line goes on with it (${JSON.stringify(r.events)})`);
    assert.deepEqual(at('queen crouches').map((d) => Math.abs(d) < 0.01), [true], 'and the queen crouches, lit');
    const goes = at('queen goes').filter((d) => d > 0);
    assert.ok(goes.length && Math.abs(goes[0] - 1) < 0.02, `she goes 1 s later (${goes[0]})`);
  }
  assert.deepEqual(problems(logs), []);
});

test('the way through the combo: the queen between the player and the gunner, his sweep cuts into her: a segment off her and CROSSFIRE', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const [blade, gunner] = g.boss.members;
    // the gunner in, walking, to the west; the queen crouched on a perch on the line between him and the player
    const p = g.player;
    p.x = 0;
    p.z = 0;
    gunner.state = 'walk';
    gunner.x = -11;
    gunner.z = 0;
    gunner.gunT = 99;
    gunner.mortarT = 99;
    blade.perches = [{ x: -5, z: 0, y: 0 }];
    blade.perchI = 0;
    blade.x = -5;
    blade.z = 0;
    blade.state = 'perch';
    blade.timer = 99;
    g.boss.comboT = 0; // the combo, now
    const hp = blade.hp;
    const score0 = g.score.score;
    for (let i = 0; i < 120 * 3; i++) {
      window.step();
      p.x = 0;
      p.z = 0;
    }
    return { lost: hp - blade.hp, crossfire: g.notes.events.some((e) => e.text.includes('CROSSFIRE')), combos: g.boss.combos, scored: g.score.score - score0 };
  });
  assert.equal(r.combos, 1);
  assert.ok(r.lost >= 1, `the queen lost ${r.lost}`);
  assert.equal(r.crossfire, true, 'CROSSFIRE');
  assert.ok(r.scored >= 300, `and scored (${r.scored})`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the combo, the queen’s blades up between the player and the gunner as his sweep comes across', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.toWave(12);
    const [blade, gunner] = g.boss.members;
    const p = g.player;
    g.view = 2;
    p.x = 0;
    p.z = 0;
    gunner.state = 'walk';
    gunner.x = -11;
    gunner.z = 0;
    gunner.gunT = 99;
    gunner.mortarT = 99;
    blade.perches = [{ x: -5, z: 0, y: 0 }];
    blade.perchI = 0;
    blade.x = -5;
    blade.z = 0;
    blade.state = 'perch';
    blade.timer = 99;
    g.boss.comboT = 0;
    // to the middle of her raised blades, his rounds on the way
    for (let i = 0; i < 120 * 3 && !(blade.state === 'tell' && blade.timer < 0.35); i++) {
      window.step();
      p.x = 0;
      p.z = 0;
    }
    g.updateCamera(1, true);
    g.present(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('duo-combo.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
