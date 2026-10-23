// Senado's boss (議事亭頭目): an arcade run that ends in the Largo do Senado
// meets the gang's taxi convoy on its last wave: three black taxis in along
// the avenue and round the fountain. They stop now and then to let thugs out.
// Six hits (or a blast) flatten an escort's tyres: it pulls aside and stops
// for good. Until both escorts are out the lead shrugs everything off; alone,
// it slows down and five hits take a segment. A moving car runs into a player
// in its way (12 HP; a slide gets through). Five segments: it burns, blows,
// BOSS +2,000, the clip, RUN CLEAR. Senado's boss is now the marksman
// (test/senado-boss.test.mjs); the convoy stays a kind a map can ask for, and
// this test puts it back on the square.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=17'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    // the convoy back on the square, on the road it had (maps.js before 議事亭：頭目 ①)
    g.maps.find((m) => m.id === 'senado').boss = {
      kind: 'convoy',
      entry: [[31, 65.6], [3, 65.6], [-3.5, 46.7]],
      loop: [[-8.9, 34.5], [-8.9, 41.5], [-3.5, 46.7], [4.5, 46.7], [11.7, 40.5], [11.7, 34.8], [8.6, 29.2], [-4, 29.2], [-7.6, 31]],
    };
    /** An arcade run from the club, moved on to its third stage (Senado) and the start of wave 12. */
    window.toFinal = () => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(1);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.player.x = 18; // off the road, by the east side of the square
      g.player.z = 50;
      g.waves.wave = 11;
      g.waves.startWave();
    };
    /** One logic step; the player kept whole and still unless `hurt`, nobody else about unless `crowd`. */
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
    /** Steps until the lead is on the loop round the fountain, with its gunman and its stops held off. */
    window.arrive = () => {
      const b = g.boss;
      let n = 0;
      while (b.lead.s < b.entry.length + 4 && n++ < 120 * 30) {
        b.gunT = b.stopT = 999;
        window.step();
      }
    };
    /** `n` shots into car `i` from 5 m off whichever side has a clear line to it (not across the fountain or another car), each flown home before the next. */
    window.shootCar = (i, n) => {
      const b = g.boss;
      const c = b.cars[i];
      const held = b.state;
      b.state = 'stop'; // the convoy holds still while the shots fly (no thugs: a stop lets them out only as it begins)
      b.timer = 999;
      for (let k = 0; k < n; k++) {
        let rx = Math.cos(c.heading);
        let rz = -Math.sin(c.heading);
        const clear = (sx) => {
          const x = c.x + rx * sx * 5;
          const z = c.z + rz * sx * 5;
          const hit = g.boss.shotAt(x, z, c.x, c.z);
          return g.level.hasLOS(x, z, c.x, c.z) && hit && hit.part === i;
        };
        if (!clear(1)) [rx, rz] = [-rx, -rz];
        g.bullets.spawn({ x: c.x + rx * 5, z: c.z + rz * 5, dx: -rx, dz: -rz, speed: 80, owner: 'player', damage: 1 });
        for (let j = 0; j < 12; j++) window.step();
      }
      if (b.state === 'stop') b.state = held;
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 in Senado is the taxi convoy: in along the avenue, nose to tail, round the fountain; inside the render budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal();
    const start = b.cars.map((c) => Math.round(c.x));
    window.arrive();
    const gaps = b.cars.slice(1).map((c, i) => Math.round((b.cars[i].s - c.s) * 10) / 10);
    const ring = b.cars.map((c) => Math.round(Math.hypot(c.x - 0.2, c.z - 37.7)));
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const bar = document.getElementById('boss-bar');
    const info = g.renderer.info.render;
    return { map: g.level.map.id, kind: b.def.kind, start, gaps, ring, name: bar.querySelector('.boss-name').textContent, calls: info.calls, tris: info.triangles, budget: g.level.map.budget };
  });
  await page.screenshot({ path: new URL('boss-convoy.png', OUT).pathname });
  assert.deepEqual([r.map, r.kind, r.name], ['senado', 'convoy', '的士車隊 TAXI CONVOY']);
  assert.ok(r.start.every((x) => x > 26), `they start off the map, east along the avenue (${r.start})`);
  assert.deepEqual(r.gaps, [7.5, 7.5], 'nose to tail, 7.5 m apart');
  assert.ok(r.ring[0] >= 7 && r.ring[0] <= 13, `the lead round the fountain (${r.ring[0]} m from it)`);
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('the escorts: six hits flatten one, it pulls aside and stops; until both are out the lead takes nothing; then it slows and five hits take a segment', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal();
    window.arrive();
    window.shootCar(0, 6);
    const leadEarly = b.hp;
    window.shootCar(1, 5);
    const five = { out: b.cars[1].out, tyres: b.cars[1].tyres };
    window.shootCar(1, 1);
    const at = { x: b.cars[1].x, z: b.cars[1].z };
    for (let i = 0; i < 240; i++) {
      b.gunT = b.stopT = 999;
      window.step();
    }
    const parked = { out: b.cars[1].out, moved: Math.hypot(b.cars[1].x - at.x, b.cars[1].z - at.z) };
    window.shootCar(0, 6);
    const leadOne = b.hp;
    const s0 = b.lead.s;
    for (let i = 0; i < 120; i++) {
      b.gunT = b.stopT = 999;
      window.step();
    }
    const fast = b.lead.s - s0;
    g.explode(b.cars[2].x, b.cars[2].z + 2, 1, { kind: 'grenade' });
    const second = b.cars[2].out;
    const s1 = b.lead.s;
    for (let i = 0; i < 120; i++) {
      b.gunT = b.stopT = 999;
      window.step();
    }
    const slow = b.lead.s - s1;
    window.shootCar(0, 4);
    const four = b.hp;
    window.shootCar(0, 1);
    return { leadEarly, five, parked, leadOne, fast, second, slow, four, fifth: b.hp, log: g.notes.events.map((e) => e.text).filter((t) => /護衛車|頭車中彈/.test(t)) };
  });
  assert.equal(r.leadEarly, 5, 'the lead takes nothing with both escorts about');
  assert.deepEqual(r.five, { out: false, tyres: 1 }, 'five hits: still rolling');
  assert.ok(r.parked.out && r.parked.moved > 2 && r.parked.moved < 3, `the sixth: it pulls aside and stops (${r.parked.moved.toFixed(2)} m)`);
  assert.equal(r.leadOne, 5, 'one escort left: still nothing');
  assert.ok(Math.abs(r.fast - 6) < 0.05, `6 m/s while escorted (${r.fast.toFixed(2)})`);
  assert.equal(r.second, true, 'a grenade by the other escort flattens it');
  assert.ok(Math.abs(r.slow - 3.2) < 0.05, `alone, 3.2 m/s (${r.slow.toFixed(2)})`);
  assert.equal(r.four, 5, 'four hits on the lead: not yet');
  assert.equal(r.fifth, 4, 'the fifth takes a segment');
  assert.ok(r.log.includes('護衛車爆胎（剩 1 架）') && r.log.includes('護衛車爆胎（剩 0 架）') && r.log.includes('頭車中彈（剩 4 段）'));
  assert.deepEqual(problems(logs), []);
});

test('the stops let a thug out of each moving car; a moving car runs into the player, a slide gets through', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    window.arrive();
    b.stopT = 0;
    window.step(false, true);
    const stop = { state: b.state, thugs: g.enemies.list.length };
    g.enemies.clear();
    let n = 0;
    while (b.state === 'stop' && n++ < 1000) window.step();
    const waited = n / 120;
    // the player on the road a few metres ahead of the lead
    const ram = (slide) => {
      const c = b.lead;
      const ahead = b.pathAt(c.s + 4);
      p.x = ahead.x;
      p.z = ahead.z;
      p.hp = 100;
      let k = 0;
      while (k++ < 240) {
        b.gunT = b.stopT = 999;
        if (slide) p.slideT = 0.3;
        window.step(true);
        if (p.hp < 100) break;
      }
      return 100 - p.hp;
    };
    return { stop, waited, hit: ram(false), slid: ram(true) };
  });
  assert.deepEqual(r.stop, { state: 'stop', thugs: 3 }, 'three cars, three thugs');
  assert.ok(Math.abs(r.waited - 3.5) < 0.05, `a 3.5 s stop (${r.waited})`);
  assert.equal(r.hit, 12, 'run into: 12 HP');
  assert.equal(r.slid, 0, 'a slide gets through');
  assert.deepEqual(problems(logs), []);
});

test('the fifth segment: the lead burns, blows up, BOSS +2,000, the clip, RUN CLEAR', { timeout: 300000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const clipped = [];
    const kill0 = g.clip.kill.bind(g.clip);
    g.clip.kill = (points) => {
      clipped.push(points);
      return kill0(points);
    };
    window.toFinal();
    window.arrive();
    for (const c of b.cars.slice(1)) b.flatten(c);
    const s0 = g.score.score;
    for (let seg = 0; seg < 5; seg++) {
      b.blastT = 0;
      g.explode(b.lead.x, b.lead.z + 2, 1, { kind: 'barrel' });
    }
    const burning = b.state;
    let n = 0;
    while (b.active && n++ < 600) window.step();
    const bonus = g.score.score - s0;
    let m = 0;
    while (g.state === 'playing' && m++ < 120 * 6) window.step();
    return { burning, burn: n / 120, downed: b.downed, bonus, clip: Math.max(0, ...clipped), cleared: g.waves.state, state: g.state, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('擊毀頭車')) };
  });
  await page.screenshot({ path: new URL('boss-convoy-down.png', OUT).pathname });
  assert.equal(r.burning, 'down');
  assert.ok(Math.abs(r.burn - 1.6) <= 1 / 60, `1.6 s burning (${r.burn})`);
  assert.equal(r.downed, true);
  assert.ok(r.bonus >= 2000, `BOSS +2,000 (${r.bonus})`);
  assert.equal(r.clip, Number.MAX_SAFE_INTEGER);
  assert.equal(r.cleared, 'done');
  assert.equal(r.state, 'over');
  assert.ok(r.log.some((t) => t.startsWith('擊毀頭車：BOSS +2000')));
  assert.deepEqual(problems(logs), []);
});
