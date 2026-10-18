// The club's boss (夜店頭目): an arcade run that ends in the club meets the DJ
// on its last wave. The DJ is behind bulletproof glass round the booth. The
// dance floor works to the beat (0.5 s of world time): a pattern of tiles
// lights up red for two beats, then zaps a player standing on a lit tile (a
// spin rides it out). Ten hits blow a speaker by the booth and the glass
// slides down for 4 s; three hits on the DJ then take a segment and the glass
// comes back up. The fifth segment: BOSS +2,000, the run's clip, RUN CLEAR.
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
    /** An arcade run from Senado, moved on to its third stage (the club) and the start of wave 12. */
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
    /** `n` player shots from where the player stands at (tx, tz), each flown home before the next. */
    window.fire = (tx, tz, n) => {
      const p = g.player;
      for (let i = 0; i < n; i++) {
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        g.bullets.spawn({ x: p.x, z: p.z, dx: dx / d, dz: dz / d, speed: 60, owner: 'player', damage: 1 });
        for (let k = 0; k < 30; k++) window.step();
      }
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 in the club is the DJ behind the glass; it stays inside the render budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFinal();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const bar = document.getElementById('boss-bar');
    const info = g.renderer.info.render;
    return {
      map: g.level.map.id,
      kind: g.boss.active && g.boss.def.kind,
      queue: g.waves.queue.length,
      bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent,
      segs: bar.querySelectorAll('.boss-segs i:not(.lost)').length,
      banner: document.getElementById('banner').textContent,
      calls: info.calls,
      tris: info.triangles,
      budget: g.level.map.budget,
    };
  });
  await page.screenshot({ path: new URL('boss-dj.png', OUT).pathname });
  assert.deepEqual([r.map, r.kind, r.queue, r.bar, r.segs], ['club', 'dj', 0, '夜店 DJ CLUB DJ', 5]);
  assert.match(r.banner, /BOSS/);
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the floor: tiles light up on the beat, zap two beats on; a lit tile hurts, an unlit one does not, a spin rides it out', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    p.x = 0.5;
    p.z = -0.5;
    // one cycle: the time it lights, the time it zaps, and the HP lost standing where `where` puts the player
    const cycle = (where, spin = false) => {
      let n = 0;
      while (b.state !== 'warn' && n++ < 2000) window.step();
      const lit = b.t;
      const tiles = [...b.lit];
      const { x0, z0, cols } = b.floor;
      const i = tiles.findIndex((v) => v === (where === 'lit' ? 1 : 0));
      p.x = x0 + (i % cols) + 0.5;
      p.z = z0 + Math.floor(i / cols) + 0.5;
      p.hp = 100;
      const at = [p.x, p.z];
      while (b.state === 'warn' && n++ < 4000) {
        if (spin) p.spinT = 0.5; // spinning on the spot (a spin carries the player along: held here)
        window.step(true);
        [p.x, p.z] = at;
      }
      return { lit: Math.round(lit * 100) / 100, zap: Math.round(b.t * 100) / 100, lost: 100 - p.hp, onFloor: !!b.tileAt(p.x, p.z), share: tiles.filter(Boolean).length / tiles.length };
    };
    return [cycle('lit'), cycle('dark'), cycle('lit', true)];
  });
  const [lit, dark, spun] = r;
  assert.ok(Math.abs(lit.lit - 3) < 0.02, `the first pattern on beat 6 (${lit.lit} s)`);
  assert.ok(Math.abs(lit.zap - lit.lit - 1) < 0.02, `the zap two beats on (${lit.zap} s)`);
  assert.ok(Math.abs(dark.lit - lit.lit - 3) < 0.02, `the next pattern six beats after the last (${dark.lit} s)`);
  assert.equal(lit.lost, 18, 'a lit tile: 18 HP');
  assert.equal(dark.lost, 0, 'an unlit tile: nothing');
  assert.equal(spun.lost, 0, 'a spin rides it out');
  for (const c of r) {
    assert.equal(c.onFloor, true);
    assert.ok(c.share > 0.05 && c.share < 0.8, `a pattern lights some of the floor (${c.share})`);
  }
  assert.deepEqual(problems(logs), []);
});

test('the glass stops every shot until a speaker blows; then three hits take a segment and the glass comes back', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    p.x = 6;
    p.z = -4;
    window.fire(b.x, b.z, 6);
    const shut = { hp: b.hp, down: b.down };
    p.x = 2.6;
    window.fire(2.6, -10.6, 9);
    const nine = { speaker: b.speakers[0].hp, open: b.openT };
    window.fire(2.6, -10.6, 1);
    const blown = { speaker: b.speakers[0].hp, open: b.openT > 0, down: b.down };
    p.x = 6;
    window.fire(b.x, b.z, 2);
    const two = { hp: b.hp, down: b.down };
    window.fire(b.x, b.z, 1);
    const three = { hp: b.hp };
    for (let i = 0; i < 60; i++) window.step();
    const back = { down: b.down };
    window.fire(b.x, b.z, 3);
    // the blown speaker stands again 14 s on
    let n = 0;
    while (b.speakers[0].hp <= 0 && n++ < 120 * 20) window.step();
    return { shut, nine, blown, two, three, back, again: b.hp, rebuilt: Math.round(n / 12) / 10, log: g.notes.events.map((e) => e.text).filter((t) => /喇叭|DJ中彈/.test(t)) };
  });
  assert.deepEqual(r.shut, { hp: 5, down: 0 }, 'the glass up: no shot gets through');
  assert.equal(r.nine.speaker, 1);
  assert.equal(r.nine.open, 0, 'nine hits: the speaker still stands');
  assert.deepEqual([r.blown.speaker <= 0, r.blown.open], [true, true], 'the tenth blows it: the glass comes down');
  assert.deepEqual(r.two, { hp: 5, down: 1 }, 'two hits on the DJ: not yet');
  assert.equal(r.three.hp, 4, 'the third takes a segment');
  assert.equal(r.back.down, 0, 'and the glass is back up');
  assert.equal(r.again, 4, 'shots on the glass again do nothing');
  assert.ok(r.rebuilt > 11 && r.rebuilt < 15, `the speaker is back after about 14 s (${r.rebuilt} s on)`);
  assert.ok(r.log.includes('射爆 DJ 的喇叭箱：玻璃降下') && r.log.includes('DJ中彈（剩 4 段）'));
  assert.deepEqual(problems(logs), []);
});

test('a blast by a speaker counts too; the fifth segment brings the DJ down: BOSS +2,000, the clip, RUN CLEAR', { timeout: 300000 }, async () => {
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
    p.x = 6;
    p.z = -4;
    // two blasts by the right-hand speaker blow it
    g.explode(10.5, -9, 1, { kind: 'grenade' });
    const oneBlast = b.speakers[1].hp;
    g.explode(10.5, -9, 1, { kind: 'grenade' });
    const twoBlasts = b.openT > 0;
    const s0 = g.score.score;
    for (let seg = 0; seg < 5; seg++) {
      b.openT = 4; // as if a speaker had just blown
      for (let i = 0; i < 50; i++) window.step();
      window.fire(b.x, b.z, 3);
    }
    const bonus = g.score.score - s0;
    const down = { active: b.active, downed: b.downed, hp: b.hp };
    let m = 0;
    while (g.state === 'playing' && m++ < 120 * 6) window.step();
    return { oneBlast, twoBlasts, down, bonus, clip: Math.max(0, ...clipped), cleared: g.waves.state, state: g.state, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('擊倒DJ')) };
  });
  await page.screenshot({ path: new URL('boss-dj-down.png', OUT).pathname });
  assert.equal(r.oneBlast, 5, 'a blast counts as five hits');
  assert.equal(r.twoBlasts, true, 'two blow it');
  assert.deepEqual(r.down, { active: false, downed: true, hp: 0 });
  assert.ok(r.bonus >= 2000, `BOSS +2,000 (${r.bonus})`);
  assert.equal(r.clip, Number.MAX_SAFE_INTEGER, 'bringing the DJ down outbids every kill for the clip');
  assert.equal(r.cleared, 'done');
  assert.equal(r.state, 'over', 'the run ends cleared');
  assert.ok(r.log.some((t) => t.startsWith('擊倒DJ：BOSS +2000')));
  assert.deepEqual(problems(logs), []);
});
