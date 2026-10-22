// 福隆新街 Rua da Felicidade (新地圖 ①): the fifth map. A straight street 6 m
// wide and about 60 m long between two rows of two-storey shops, red wooden
// fronts on grey brick; enemies come in at both ends of the street and both
// ends of a lane across it. Six shops are open (maps.js `shops`): a room of
// about 4 × 5 m behind a wooden door on the street (kicked open), the two on
// the lane with a back door onto it, the one at the lane's mouth behind a
// roller shutter. In the street: hanging signs, lamps, LPG cylinders, pans and
// mahjong tables for cover. Warm red light, cyan neon. The shop names are made
// up. In MAPS (fifth, key 5) and in the daily rotation (two days of it).
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
    window.felicidade = () => g.maps.findIndex((m) => m.id === 'felicidade');
    /** The map loaded on its own (no run). */
    window.load = () => {
      g.level.load(g.maps[window.felicidade()]);
      return g.level;
    };
    /**
     * Cells reachable on the nav grid from (x, z), with the doors and shutters in `closed` treated as walls
     * (the grid itself lets paths through a door). Returns the count and whether (tx, tz) was reached.
     */
    window.flood = (x, z, closed, tx, tz) => {
      const L = g.level;
      const nav = L.nav;
      const shut = (cx, cz) => closed.some((f) => (f.kind === 'door' ? Math.abs((cx - f.x) * f.dir.x + (cz - f.z) * f.dir.z) < 0.6 && Math.abs((cx - f.x) * f.dir.ax + (cz - f.z) * f.dir.az) < f.w / 2 + 0.3 : Math.abs((cx - f.midX) * f.dir.ax + (cz - f.midZ) * f.dir.az) < 0.6 && Math.abs((cx - f.midX) * f.dir.x + (cz - f.midZ) * f.dir.z) < f.w / 2 + 0.3));
      const seen = new Uint8Array(nav.cols * nav.rows);
      const s0 = nav.row(z) * nav.cols + nav.col(x);
      const goal = nav.row(tz) * nav.cols + nav.col(tx);
      const queue = [s0];
      seen[s0] = 1;
      let n = 0;
      while (queue.length) {
        const c = queue.pop();
        n++;
        const cc = c % nav.cols;
        const rr = (c / nav.cols) | 0;
        for (const [dc, dr] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nc = cc + dc;
          const nr = rr + dr;
          if (nc < 0 || nr < 0 || nc >= nav.cols || nr >= nav.rows) continue;
          const ni = nr * nav.cols + nc;
          if (seen[ni] || nav.blocked[ni]) continue;
          if (shut(nav.minX + (nc + 0.5) * nav.cell, nav.minZ + (nr + 0.5) * nav.cell)) continue;
          seen[ni] = 1;
          queue.push(ni);
        }
      }
      return { cells: n, reached: !!seen[goal] };
    };
  });
});
after(async () => {
  await h.close();
});

test('the street: 6 m wide, about 60 m long and open end to end between two-storey shops; spawns at both ends of the street and of the lane; fifth in MAPS, two days in the daily rotation, and the back end takes it', async () => {
  const r = await page.evaluate(async () => {
    const { DAILY_ROTATION } = await import('/src/rules.js');
    const { LIMITS } = await import('/backend/worker.js');
    const g = window.game;
    const i = window.felicidade();
    const L = window.load();
    const { halfW, halfD } = L.bounds;
    // the open width across the street at each metre along it (what stands in the street itself aside)
    const widths = [];
    for (let x = -halfW + 2; x <= halfW - 2; x += 1) {
      const wall = (z) => L.solids.some((s) => s.alive && s.kind === 'wall' && !s.edge && s.h >= 3 && x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ);
      let n = 0;
      let s = 0;
      while (!wall(-n * 0.1) && n < 100) n++;
      while (!wall(s * 0.1) && s < 100) s++;
      widths.push(Math.round((n + s) * 10) / 100);
    }
    widths.sort((a, b) => a - b);
    // the buildings that face the street: how tall
    const fronts = L.solids.filter((s) => s.kind === 'wall' && !s.edge && (Math.abs(s.maxZ + 3) < 0.05 || Math.abs(s.minZ - 3) < 0.05));
    const path = L.nav.findPath(-halfW + 1.5, 0, halfW - 1.5, 0);
    const spawns = L.spawns.map((s) => [s.ex, s.ez]);
    return {
      index: i,
      count: g.maps.length,
      size: [halfW * 2, halfD * 2],
      medianWidth: widths[widths.length >> 1],
      path: path ? path.length : 0,
      fronts: fronts.length,
      lowFront: fronts.filter((s) => s.h < 6).length,
      west: spawns.filter(([x, z]) => x < -halfW + 4 && Math.abs(z) < 3).length,
      east: spawns.filter(([x, z]) => x > halfW - 4 && Math.abs(z) < 3).length,
      laneEnds: spawns.filter(([, z]) => Math.abs(z) > halfD - 4),
      daily: DAILY_ROTATION.filter((d) => d.map === i).length,
      backend: LIMITS.maps,
      name: [g.maps[i].name, g.maps[i].en],
    };
  });
  assert.equal(r.index, 4, 'the fifth map');
  assert.deepEqual(r.name, ['福隆新街', 'RUA DA FELICIDADE']);
  assert.ok(r.size[0] >= 58 && r.size[0] <= 64, `about 60 m long (${r.size[0]})`);
  assert.ok(Math.abs(r.medianWidth - 6) < 0.3, `6 m between the shop fronts (${r.medianWidth})`);
  assert.ok(r.path > 0, 'open from one end of the street to the other');
  assert.ok(r.fronts >= 10 && r.lowFront === 0, `${r.fronts} buildings face the street, every one two storeys (${r.lowFront} lower)`);
  assert.deepEqual([r.west >= 1, r.east >= 1], [true, true], 'spawns at both ends of the street');
  assert.equal(r.laneEnds.length, 2, 'and at both ends of the lane');
  assert.ok(Math.abs(r.laneEnds[0][0] - r.laneEnds[1][0]) < 0.5 && Math.sign(r.laneEnds[0][1]) !== Math.sign(r.laneEnds[1][1]), `the lane crosses the street (${JSON.stringify(r.laneEnds)})`);
  assert.equal(r.daily, 2, 'two days of the rotation');
  assert.equal(r.backend, r.count, 'the leaderboard back end takes every map');
  assert.deepEqual(problems(logs), []);
});

test('the shops: six rooms of about 4 × 5 m, each shut off from the street by its door (one kick opens it) or, at the lane mouth, a roller shutter; the two on the lane have a back door onto it', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = window.load();
    const map = L.map;
    const out = [];
    for (const shop of map.shops) {
      const z = shop.side === 'n' ? -5.8 : 5.8; // the middle of the room
      const fronts = L.fixtures.filter((f) => (f.kind === 'door' || f.kind === 'shutter') && Math.abs(Math.abs(f.kind === 'door' ? f.z : f.midZ) - 3.15) < 0.3 && Math.abs((f.kind === 'door' ? f.x : f.midX) - shop.x) < 1.6);
      const backs = L.fixtures.filter((f) => f.kind === 'door' && !fronts.includes(f) && Math.abs(f.z - z) < 2.6 && Math.abs(f.x - shop.x) < 2.6);
      const street = window.flood(shop.x, z, [...fronts, ...backs], shop.x, 0);
      const lane = backs.length ? window.flood(shop.x, z, fronts, map.lane.x, shop.side === 'n' ? -8 : 8) : null;
      const throughFront = window.flood(shop.x, z, backs, shop.x, 0);
      out.push({ x: shop.x, side: shop.side, name: shop.name, en: shop.en, front: fronts.map((f) => f.kind), backs: backs.length, area: street.cells * 0.25, shut: !street.reached, lane: lane && lane.reached, open: throughFront.reached });
    }
    // a kick opens a front door: the player before it, facing it
    const shop = map.shops.find((s) => s.front === 'door');
    const door = L.fixtures.find((f) => f.kind === 'door' && Math.abs(f.x - shop.x) < 1.6 && Math.abs(Math.abs(f.z) - 3.15) < 0.3);
    g.setRules('normal', []);
    g.startRun(window.felicidade());
    g.waves.state = 'done';
    g.enemies.clear();
    const p = g.player;
    const sz = Math.sign(door.z);
    p.x = door.x;
    p.z = door.z - sz * 1.1;
    for (let i = 0; i < 3; i++) {
      p.hp = 100;
      if (i === 1) g.input.pressed.add('KeyF');
      g.aimPoint.set(door.x, g.aimPoint.y, door.z + sz * 3);
      g.aimFresh = true;
      g.updatePlay(1 / 60);
    }
    return { shops: out, kicked: g.level.fixtures.find((f) => f.kind === 'door' && f.x === door.x && f.z === door.z).open };
  });
  assert.equal(r.shops.length, 6);
  for (const s of r.shops) {
    const where = `${s.name} (${s.x}, ${s.side})`;
    assert.ok(s.name && /^[A-Z][A-Z .'&-]+$/.test(s.en), `${where}: a made-up name and an English label (${s.en})`);
    assert.equal(s.front.length, 1, `${where}: one door or shutter on the street`);
    assert.ok(s.area >= 8 && s.area <= 20, `${where}: a room of about 4 × 5 m (${s.area} m² of floor a body can stand on)`);
    assert.equal(s.shut, true, `${where}: with its doors shut, the room is closed off from the street`);
    assert.equal(s.open, true, `${where}: through its front, the street`);
  }
  assert.deepEqual(r.shops.map((s) => s.front[0]).filter((k) => k === 'shutter').length, 1, 'one roller shutter: the shop at the lane mouth');
  const onLane = r.shops.filter((s) => s.backs > 0);
  assert.equal(onLane.length, 2, 'two shops have a back door');
  assert.ok(onLane.every((s) => s.lane), 'it opens onto the lane');
  assert.ok(onLane.some((s) => s.front[0] === 'shutter'), 'the shuttered one is one of them: when the shutter is down, the back door is the way in');
  assert.equal(r.kicked, true, 'a kick opens the door');
  assert.deepEqual(problems(logs), []);
});

test('in the street: hanging signs, lamps, LPG cylinders, pans and mahjong tables; warm red light and cyan neon; key 5 on the title starts here', async () => {
  const r = await page.evaluate(() => {
    const L = window.load();
    const inStreet = (o) => Math.abs(o.z) < 3.2;
    const lights = L.map.theme.points.map(([c]) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]);
    let cyan = 0;
    L.root.traverse((o) => {
      if (o.isMesh && o.material === L.mat.neonCyan) cyan++;
    });
    return {
      signs: L.fixtures.filter((f) => f.kind === 'sign').length,
      lamps: L.fixtures.filter((f) => f.kind === 'lamp' && inStreet(f)).length,
      lpg: L.barrels.filter((b) => b.variant === 'lpg').length,
      pans: L.pans.length,
      mahjong: L.solids.filter((s) => s.matKey === 'mahjong' && inStreet({ z: (s.minZ + s.maxZ) / 2 })).length,
      warm: lights.filter(([r, gr, b]) => r > gr && r > b).length,
      cyan,
      cards: document.querySelectorAll('#map-cards .map-card').length,
    };
  });
  assert.ok(r.signs >= 3, `${r.signs} hanging signs`);
  assert.ok(r.lamps >= 2, `${r.lamps} street lamps`);
  assert.ok(r.lpg >= 2, `${r.lpg} LPG cylinders`);
  assert.ok(r.pans >= 3, `${r.pans} pans`);
  assert.ok(r.mahjong >= 2, `${r.mahjong} mahjong tables in the street`);
  assert.equal(r.warm, 4, 'all four lights warm');
  assert.ok(r.cyan >= 3, `${r.cyan} pieces of cyan neon`);
  assert.equal(r.cards, 7, 'a map card each on the title (大三巴 is the seventh)');
  await page.evaluate(() => window.game.toTitle());
  await page.keyboard.press('Digit5');
  const started = await page.evaluate(() => ({ state: window.game.state, map: window.game.level.map.id, start: window.game.startMap }));
  assert.deepEqual(started, { state: 'playing', map: 'felicidade', start: 4 });
  await page.evaluate(() => window.game.toTitle());
  await page.screenshot({ path: new URL('felicidade-title.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('an arcade run from 福隆新街: a god-mode bot plays it to the end of wave 4 and on to the next stage', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 4, view: 0, seed: 4, mode: 'arcade', restart: false });
  const r = await page.evaluate(async () => {
    const g = window.game;
    const hurt0 = g.player.hurt.bind(g.player);
    g.player.hurt = (...a) => {
      const hit = hurt0(...a);
      g.player.hp = 100;
      return hit;
    };
    const seen = { maps: [g.level.map.id], spawns: new Set(), stages: [], shot: false };
    const spawn0 = g.enemies.spawn.bind(g.enemies);
    g.enemies.spawn = (type, sp, ...a) => {
      seen.spawns.add(`${sp.ex},${sp.ez}`);
      return spawn0(type, sp, ...a);
    };
    const begin0 = g.beginStageTransition.bind(g);
    g.beginStageTransition = () => {
      seen.stages.push(g.waves.wave);
      return begin0();
    };
    for (let chunk = 0; chunk < 90 && g.level.map.id === 'felicidade' && g.state === 'playing'; chunk++) {
      window.simStep(600);
      if (!seen.shot && g.waves.wave === 2 && g.enemies.aliveCount >= 2) {
        seen.shot = true;
        g.updateCamera(1, true);
        g.render();
        await new Promise((ok) => requestAnimationFrame(ok));
      }
    }
    return { map: g.level.map.id, stage: g.stage, wave: g.waves.wave, stages: seen.stages, spawns: seen.spawns.size, minutes: g.stepCount / 120 / 60, errors: window.stats.errors };
  });
  console.log(`福隆新街: waves 1-4 in ${r.minutes.toFixed(1)} min, ${r.spawns} spawn points used`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.stages, [4], 'the stage moves on after wave 4');
  assert.equal(r.map, 'guia', 'to the next map (東望洋跑道)');
  assert.ok(r.spawns >= 3, `enemies came in at ${r.spawns} of the spawn points`);
  assert.deepEqual(problems(logs), []);
});

test('screenshots: the street from the default camera (45° side), a shop with its door kicked open; the whole map from above', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    g.setRules('normal', []);
    g.startRun(window.felicidade());
    g.waves.state = 'done';
    g.enemies.clear();
    const p = g.player;
    const shop = g.level.map.shops.find((s) => s.front === 'door' && s.side === 'n');
    p.x = shop.x + 1.5;
    p.z = -1;
    for (const [x, z] of [
      [shop.x + 5, 1],
      [shop.x - 4, -0.5],
    ]) {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
    }
    const door = g.level.fixtures.find((f) => f.kind === 'door' && Math.abs(f.x - shop.x) < 1.6 && f.z < 0);
    door.kick(door.x, door.z + 1);
    for (let i = 0; i < 40; i++) {
      p.hp = 100;
      g.aimPoint.set(shop.x + 5, g.aimPoint.y, 1);
      g.aimFresh = true;
      g.updatePlay(1 / 60);
    }
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('felicidade-street.png', OUT).pathname });
  // the whole map from straight above, the HUD out of the way
  await page.evaluate(() => {
    const g = window.game;
    document.getElementById('hud').style.visibility = 'hidden';
    g.level.cut.uFadeSet.value.fill(0);
    g.level.cut.uCutR.value = 0;
    const cam = g.camera;
    cam.position.set(0, 66, 0.01);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    g.renderer.render(g.scene, cam);
  });
  await page.screenshot({ path: new URL('felicidade-top.png', OUT).pathname });
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = '';
    window.game.camera.up.set(0, 1, 0);
  });
  assert.deepEqual(problems(logs), []);
});
