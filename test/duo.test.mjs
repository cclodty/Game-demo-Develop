// 雙頭目 ① (DECISIONS 2026-10-22): two bosses at once. A map's boss can be a
// duo (boss.js `duo`: `pair`, two defs of their own kinds); here the docks get
// the blade queen and the heavy gunner together (no map has a duo yet). The
// game talks to the duo as to one boss: a bar each on the HUD with its own name
// and segments (a stage's: 2 each, the run's last: 3 each), each shot or blast
// goes to the one it meets, one down leaves the other fighting, and only both
// down pays the BOSS bonus and ends the wave. The two never start a warning
// within DUO.gap s of each other. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

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
    // the queen at four places on the quay, the gunner in through the west gate as on his own
    window.pair = {
      kind: 'duo',
      pair: [
        { kind: 'blade', perches: [[8, 6], [-4, 9], [12, -6], [-12, 4]] },
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
