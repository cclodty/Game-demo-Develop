// The rooftop boss, part two (頭目 ②): only a blast right under the helicopter
// hurts it, a thrown barrel or a grenade; each takes one of its five segments and
// it reels for 3 s without firing. The fifth brings it down onto the pad, where it
// bursts (get clear); BOSS +2,000, the shoot-down becomes the run's clip, and the
// run is cleared.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=71'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.toFinal = (startMap) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(startMap);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.waves.wave = 11;
      g.waves.startWave();
    };
    /** One logic step; the player kept alive and still unless told otherwise. */
    window.step = (keep = true, aim = null) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (keep) g.player.hp = 100;
      g.player.vx = g.player.vz = 0;
      const a = aim || { x: g.player.x, z: g.player.z - 5 };
      g.aimPoint.set(a.x, g.aimPoint.y, a.z);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /** Steps until it has flown in; no thugs on ropes here (part one tests those), so nothing gets in the way. */
    window.arrive = () => {
      let n = 0;
      while (g.boss.t < 3.5 && n++ < 1000) window.step();
      g.boss.rappelT = Infinity;
      g.enemies.clear();
    };
    window.reelOut = () => {
      let n = 0;
      while (g.boss.reelT > 0 && n++ < 1000) window.step();
    };
  });
});
after(async () => {
  await h.close();
});

test('a thrown barrel and a launcher grenade under it each take a segment; it reels 3 s without firing; bullets, kicks and other blasts do nothing', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal(2);
    window.arrive();
    const out = { start: b.hp };
    // a barrel picked up and thrown at the spot under it
    const barrel = g.level.barrels.find((x) => x.alive && x.variant === 'barrel');
    p.x = b.x + 4;
    p.z = b.z + 1;
    barrel.x = p.x + 0.4;
    barrel.z = p.z;
    window.step();
    g.input.pressed.add('KeyG'); // pick it up
    window.step(true, { x: b.x, z: b.z });
    out.carried = g.thrown.carry === barrel;
    g.input.pressed.add('KeyG'); // and throw it under the helicopter
    let n = 0;
    while (b.hp === out.start && n++ < 240) window.step(true, { x: b.x, z: b.z });
    out.afterBarrel = b.hp;
    out.reel = b.reelT;
    // while it reels: no locking on, even with the player standing in its light
    p.x = b.spot.x;
    p.z = b.spot.z;
    const states = new Set();
    let reelSteps = 0;
    while (b.reelT > 0 && reelSteps < 600) {
      window.step();
      states.add(b.state);
      reelSteps++;
      // a second blast while it reels counts for nothing
      if (reelSteps === 60) g.explode(b.x, b.z, 4.4, { kind: 'barrel' });
    }
    out.reelFor = reelSteps / 120;
    out.reelStates = [...states];
    out.duringReel = b.hp;
    // a launcher grenade fired at the floor under it
    p.giveWeapon('launcher', 8);
    p.x = b.x + 6;
    p.z = b.z;
    p.equip('special');
    for (let i = 0; i < 30; i++) window.step(true, { x: b.x, z: b.z });
    g.input.mouse.left = true;
    n = 0;
    while (b.hp === out.duringReel && n++ < 240) window.step(true, { x: b.x, z: b.z });
    g.input.mouse.left = false;
    out.afterGrenade = b.hp;
    window.reelOut();
    // what does nothing: bullets, a kick under it, a drone's crash or a bomber going off right under it
    const hp = b.hp;
    for (let i = 0; i < 6; i++) g.bullets.spawn({ x: b.x - 3, z: b.z, dx: 1, dz: 0, speed: 62, owner: 'player', damage: 3 });
    p.x = b.x;
    p.z = b.z;
    p.kickCd = 0;
    g.input.pressed.add('KeyF');
    for (let i = 0; i < 30; i++) window.step();
    g.explode(b.x, b.z, 1.5, { source: 'DRONE 墜毀' });
    g.explode(b.x, b.z, 4.4, { chain: true, source: '炸彈客爆炸' });
    window.step();
    out.untouched = b.hp === hp;
    out.log = g.notes.events.map((x) => x.text).filter((t) => t.startsWith('直升機中彈'));
    return out;
  });
  assert.equal(r.start, 5);
  assert.equal(r.carried, true, 'the barrel was picked up');
  assert.equal(r.afterBarrel, 4, 'the thrown barrel went off under it: one segment');
  assert.ok(Math.abs(r.reel - 3) < 0.05, `it reels for 3 s (${r.reel})`);
  assert.ok(Math.abs(r.reelFor - r.reel) <= 1 / 120 + 1e-9);
  assert.deepEqual(r.reelStates, ['search'], 'no lock, no fire while it reels');
  assert.equal(r.duringReel, 4, 'a second blast while it reels counts for nothing');
  assert.equal(r.afterGrenade, 3, 'a launcher grenade under it: another segment');
  assert.equal(r.untouched, true, 'bullets, a kick, a crash and a bomber do nothing to it');
  assert.equal(r.log.length, 2);
});

test('the fifth brings it down onto the pad: the blast catches a player who stays, BOSS +2,000, the clip, RUN CLEAR', { timeout: 300000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    // the clip records only in the real frame loop: here, what the boss hands it
    const clipped = [];
    const kill0 = g.clip.kill.bind(g.clip);
    g.clip.kill = (points) => {
      clipped.push(points);
      kill0(points);
    };
    const run = (stay) => {
      clipped.length = 0;
      window.toFinal(2);
      window.arrive();
      for (let i = 0; i < 4; i++) {
        g.explode(b.x, b.z, 4.4, { kind: 'barrel' });
        window.reelOut();
      }
      // the player on the pad's edge, or well away
      p.x = b.pad.x + (stay ? 3 : 12);
      p.z = b.pad.z;
      const s0 = g.score.score;
      g.explode(b.x, b.z, 3.9, { kind: 'grenade' });
      const falling = { state: b.state, ring: b.crashRing.visible, active: b.active };
      // falling: the player kept whole until it hits, so what the crash does is all that shows
      let n = 0;
      while (b.active && n++ < 600) {
        window.step(false);
        if (!b.active) break;
        p.hp = 100;
      }
      const fall = n / 120;
      const bonus = g.score.score - s0;
      window.step(false);
      const hpAfter = p.hp;
      // the wave (and the run) ends
      let m = 0;
      while (g.state === 'playing' && m++ < 120 * 6) window.step();
      return { falling, fall, downed: b.downed, bonus, hp: hpAfter, hidden: !b.root.visible, clip: Math.max(0, ...clipped), state: g.state, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('擊落')), cleared: g.waves.state };
    };
    return { stay: run(true), away: run(false) };
  });
  const s = r.stay;
  assert.deepEqual(s.falling, { state: 'down', ring: true, active: true }, 'falling, the ring on the pad');
  assert.ok(Math.abs(s.fall - 2.4) <= 1 / 60, `2.4 s falling (${s.fall})`);
  assert.equal(s.downed, true);
  assert.equal(s.hidden, true);
  assert.ok(s.hp < 100, `the player on the pad's edge is caught (${s.hp})`);
  assert.equal(r.away.hp, 100, 'one 12 m off is not');
  assert.ok(s.bonus >= 2000, `BOSS +2,000 (${s.bonus})`);
  assert.equal(s.clip, Number.MAX_SAFE_INTEGER, 'the shoot-down outbids every kill for the clip');
  assert.equal(s.cleared, 'done', 'the wave is cleared');
  assert.equal(s.state, 'over', 'and the run ends cleared');
  assert.ok(s.log.some((t) => t.startsWith('擊落直升機：BOSS +2000')));
});

test('the moment it hits the pad', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal(2);
    window.arrive();
    for (let i = 0; i < 4; i++) {
      g.explode(b.x, b.z, 4.4, { kind: 'barrel' });
      window.reelOut();
    }
    p.x = b.pad.x + 9;
    p.z = b.pad.z + 3;
    g.explode(b.x, b.z, 3.9, { kind: 'grenade' });
    let n = 0;
    while (b.fallT < 2.3 && n++ < 600) window.step();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('boss-down.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
