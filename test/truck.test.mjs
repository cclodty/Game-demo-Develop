// The docks' boss (碼頭頭目): an arcade run that ends on the docks meets the
// armoured truck on its last wave. It drives in and round a loop between the
// containers, shoving barrels aside. Its roof gun sweeps a burst onto a red
// line; every so often it turns on the player, paints its path red for 1.2 s
// and charges (35 HP to a player in the way; a slide or a spin gets through).
// Bullets do nothing to the armour; a blast beside it takes a segment, and so
// do four shots into its back door while it lets thugs out. Five segments:
// it burns, blows, BOSS +2,000, the clip, RUN CLEAR.
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
    /** An arcade run from the rooftop, moved on to its third stage (the docks) and the start of wave 12. */
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
      g.waves.wave = 11;
      g.waves.startWave();
    };
    /** One logic step; the player kept whole unless `hurt`, nobody else about unless `crowd`. */
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
    /** Steps until the truck is on its loop. */
    window.arrive = () => {
      let n = 0;
      while (g.boss.state === 'enter' && n++ < 2000) window.step();
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 on the docks is the armoured truck: it drives in and round its loop; it stays inside the render budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal();
    const start = { x: b.x, z: b.z, state: b.state };
    window.arrive();
    const arrived = { t: Math.round(b.t * 10) / 10, x: b.x, z: b.z };
    // half a lap with nothing else going on
    b.chargeT = b.unloadT = b.gunT = 999;
    const seen = new Set();
    for (let i = 0; i < 120 * 8; i++) {
      window.step();
      seen.add(b.seg);
    }
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const bar = document.getElementById('boss-bar');
    const info = g.renderer.info.render;
    return { map: g.level.map.id, kind: b.def.kind, start, arrived, segs: seen.size, name: bar.querySelector('.boss-name').textContent, calls: info.calls, tris: info.triangles, budget: g.level.map.budget };
  });
  await page.screenshot({ path: new URL('boss-truck.png', OUT).pathname });
  assert.deepEqual([r.map, r.kind, r.start.state, r.name], ['docks', 'truck', 'enter', '裝甲貨車 ARMORED TRUCK']);
  assert.ok(r.start.x < -24, 'it starts off the map');
  assert.ok(Math.abs(r.arrived.t - 2.4) < 0.05 && r.arrived.x === -16, `in 2.4 s, on the loop (${JSON.stringify(r.arrived)})`);
  assert.ok(r.segs >= 2, `it drives on round the loop (${r.segs} legs)`);
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the charge: it turns on the player, paints its path for 1.2 s, then runs it down; a slide gets through', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const charge = (slide) => {
      window.toFinal();
      window.arrive();
      b.gunT = b.unloadT = 999;
      // the player 10 m along the middle lane, in front of it
      p.x = b.x + 10;
      p.z = b.z;
      b.chargeT = 0;
      let n = 0;
      while (b.state !== 'warn' && n++ < 400) window.step();
      const facing = Math.round((b.heading * 180) / Math.PI);
      const painted = b.strip.visible;
      const run = b.run;
      n = 0;
      while (b.state === 'warn' && n++ < 400) window.step();
      const warned = n / 120;
      p.hp = 100;
      n = 0;
      while (b.state === 'charge' && n++ < 400) {
        if (slide) p.slideT = 0.3;
        const at = [p.x, p.z];
        window.step(true);
        [p.x, p.z] = at;
      }
      return { facing, painted, run, warned, lost: 100 - p.hp, after: b.state };
    };
    return { hit: charge(false), slid: charge(true) };
  });
  assert.equal(r.hit.facing, 90, 'nose onto the player (east)');
  assert.equal(r.hit.painted, true, 'its path painted red');
  assert.ok(r.hit.run > 10, `room to run (${r.hit.run.toFixed(1)} m)`);
  assert.ok(Math.abs(r.hit.warned - 1.2) <= 1 / 120 + 1e-9, `1.2 s of warning (${r.hit.warned})`);
  assert.equal(r.hit.lost, 35, 'run down: 35 HP');
  assert.equal(r.hit.after, 'back', 'then it backs up to its loop');
  assert.equal(r.slid.lost, 0, 'a slide gets under it');
  assert.deepEqual(problems(logs), []);
});

test('bullets do nothing to the armour; a blast beside it and four shots into the open back door each take a segment', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    window.arrive();
    b.chargeT = b.gunT = b.unloadT = 999;
    const shoot = (tx, tz, n) => {
      for (let i = 0; i < n; i++) {
        const dx = tx - p.x;
        const dz = tz - p.z;
        const d = Math.hypot(dx, dz);
        g.bullets.spawn({ x: p.x, z: p.z, dx: dx / d, dz: dz / d, speed: 60, owner: 'player', damage: 1 });
        for (let k = 0; k < 20; k++) window.step();
      }
    };
    // shots at its side
    p.x = b.x;
    p.z = b.z - 6;
    shoot(b.x, b.z, 6);
    const armour = b.hp;
    // a grenade going off a metre from its side, then another at once (it has to wait), then a far one
    const side = (m) => [b.x + Math.cos(b.heading) * (1.1 + m), b.z - Math.sin(b.heading) * (1.1 + m)];
    g.explode(...side(1), 1, { kind: 'grenade' });
    const blast = b.hp;
    g.explode(...side(1), 1, { kind: 'grenade' });
    const tooSoon = b.hp;
    for (let i = 0; i < 240; i++) window.step();
    g.explode(...side(4), 1, { kind: 'grenade' });
    const far = b.hp;
    // the back door: it stops, thugs step out, four shots into the door
    b.unloadT = 0;
    window.step(false, true);
    const unloading = { state: b.state, thugs: g.enemies.list.length };
    g.enemies.clear();
    for (let i = 0; i < 60; i++) window.step();
    const back = [b.x - Math.sin(b.heading) * 6, b.z - Math.cos(b.heading) * 6];
    p.x = back[0];
    p.z = back[1];
    shoot(b.x, b.z, 3);
    const three = b.hp;
    shoot(b.x, b.z, 1);
    return { armour, blast, tooSoon, far, unloading, three, four: b.hp, after: b.state };
  });
  assert.equal(r.armour, 5, 'six shots into the armour: nothing');
  assert.equal(r.blast, 4, 'a grenade beside it: a segment');
  assert.equal(r.tooSoon, 4, 'a second at once: not yet');
  assert.equal(r.far, 4, 'a blast 4 m off its side: nothing');
  assert.deepEqual(r.unloading, { state: 'unload', thugs: 2 }, 'it stops and lets two thugs out');
  assert.equal(r.three, 4, 'three shots into the door: not yet');
  assert.equal(r.four, 3, 'the fourth takes a segment');
  assert.equal(r.after, 'drive', 'and it drives off');
  assert.deepEqual(problems(logs), []);
});

test('the fifth segment: it burns, blows up beside a player who stays, BOSS +2,000, the clip, RUN CLEAR', { timeout: 300000 }, async () => {
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
    window.arrive();
    b.chargeT = b.gunT = b.unloadT = 999;
    const s0 = g.score.score;
    for (let seg = 0; seg < 5; seg++) {
      b.blastT = 0;
      g.explode(b.x, b.z + 2, 1, { kind: 'barrel' });
    }
    const burning = { state: b.state, active: b.active };
    p.x = b.x + 3;
    p.z = b.z;
    let n = 0;
    while (b.active && n++ < 600) {
      window.step(true);
      if (b.active) p.hp = 100;
    }
    const burn = n / 120;
    const bonus = g.score.score - s0;
    const hp = p.hp;
    let m = 0;
    while (g.state === 'playing' && m++ < 120 * 6) window.step();
    return { burning, burn, downed: b.downed, hidden: !b.root.visible, bonus, hp, clip: Math.max(0, ...clipped), cleared: g.waves.state, state: g.state, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('擊毀')) };
  });
  assert.deepEqual(r.burning, { state: 'down', active: true }, 'burning first');
  assert.ok(Math.abs(r.burn - 1.6) <= 1 / 60, `1.6 s (${r.burn})`);
  assert.deepEqual([r.downed, r.hidden], [true, true]);
  assert.ok(r.hp < 100, `a player 3 m off is caught in the blast (${r.hp})`);
  assert.ok(r.bonus >= 2000, `BOSS +2,000 (${r.bonus})`);
  assert.equal(r.clip, Number.MAX_SAFE_INTEGER);
  assert.equal(r.cleared, 'done');
  assert.equal(r.state, 'over');
  assert.ok(r.log.some((t) => t.startsWith('擊毀貨車：BOSS +2000')));
  assert.deepEqual(problems(logs), []);
});
