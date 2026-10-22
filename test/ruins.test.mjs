// 大三巴 Ruins of St. Paul's (新地圖 ①): the seventh map, about 40 × 60 m,
// stylised. From the forecourt in the south 68 steps climb north in three
// flights with two landings to the terrace under the façade. The ground's height
// is the map's `ground` (level.js groundY): the player and the enemies walk up
// and down the steps on it, and the camera rises with the player. From up the
// steps a man sees and shoots over cover lower than where he stands
// (enemies.js over; the player's shots too), so the landings are the high
// ground to take. In MAPS (key 7), in the daily rotation, and taken by the back
// end. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=47'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.ruins = () => g.maps.findIndex((m) => m.id === 'ruins');
    window.load = () => {
      g.level.load(g.maps[window.ruins()]);
      return g.level;
    };
    /** A quiet run here: no waves, the player at (x, z). */
    window.begin = (x = -3, z = 21) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(window.ruins());
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** 120 Hz steps holding `held`, aiming at (ax, az) or 5 m north. */
    window.play = (n, held = [], aim = null) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = held.includes('Mouse0');
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
        g.present(1 / 120);
      }
      g.input.keys.clear();
      g.input.mouse.left = false;
    };
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
  });
});
after(async () => {
  await h.close();
});

test('the forecourt, 68 steps in three flights with two landings, the terrace under the façade: about 40 × 60 m; spawns below and at the top; seventh in MAPS, in the daily rotation, and the back end takes it', async () => {
  const r = await page.evaluate(async () => {
    const { DAILY_ROTATION } = await import('/src/rules.js');
    const { LIMITS } = await import('/backend/worker.js');
    const g = window.game;
    const i = window.ruins();
    const L = window.load();
    const { halfW, halfD } = L.bounds;
    const at = (z) => Math.round(L.groundY(0, z) * 100) / 100;
    // up the middle of the steps, every 10 cm: never down, and where it is flat
    const profile = [];
    for (let z = 12; z >= -20; z -= 0.1) profile.push(L.groundY(0, z));
    const rises = profile.every((y, k) => k === 0 || y >= profile[k - 1] - 1e-9);
    const flats = [];
    for (let k = 1; k < profile.length; k++) {
      const flat = Math.abs(profile[k] - profile[k - 1]) < 1e-9;
      if (flat && (!flats.length || flats[flats.length - 1].y !== profile[k])) flats.push({ y: Math.round(profile[k] * 100) / 100 });
    }
    const path = L.nav.findPath(0, 25, 0, -16);
    const facade = L.solids.find((s) => s.matKey === 'facade');
    return {
      index: i,
      count: g.maps.length,
      name: [g.maps[i].name, g.maps[i].en],
      size: [halfW * 2, halfD * 2],
      heights: { forecourt: at(20), landing1: at(2.5), landing2: at(-5.5), terrace: at(-16) },
      rises,
      levels: flats.map((f) => f.y),
      steps: g.maps[i].flights.reduce((a, b) => a + b, 0),
      path: !!path,
      facade: facade ? { h: facade.h, z: (facade.minZ + facade.maxZ) / 2 } : null,
      low: L.spawns.filter((s) => s.ez > 9).length,
      top: L.spawns.filter((s) => s.ez < -12).length,
      daily: DAILY_ROTATION.filter((d) => d.map === i).length,
      backend: LIMITS.maps,
    };
  });
  assert.equal(r.index, 6, 'the seventh map');
  assert.deepEqual(r.name, ['大三巴', "RUINS OF ST. PAUL'S"]);
  assert.ok(r.size[0] >= 36 && r.size[0] <= 44 && r.size[1] >= 56 && r.size[1] <= 64, `about 40 × 60 m (${r.size})`);
  assert.equal(r.heights.forecourt, 0);
  assert.ok(r.heights.landing1 > 1 && r.heights.landing2 > r.heights.landing1 && r.heights.terrace > r.heights.landing2, JSON.stringify(r.heights));
  assert.equal(r.rises, true, 'up the steps the ground never drops');
  assert.deepEqual(r.levels, [0, r.heights.landing1, r.heights.landing2, r.heights.terrace], 'four levels: the forecourt, two landings, the terrace');
  assert.equal(r.steps, 68, '68 steps');
  assert.equal(r.path, true, 'from the forecourt up to the terrace on foot');
  assert.ok(r.facade && r.facade.h > 15 && r.facade.z < -18, `the façade across the top (${JSON.stringify(r.facade)})`);
  assert.ok(r.low >= 3 && r.top >= 2, `spawns: ${r.low} round the forecourt, ${r.top} at the top`);
  assert.ok(r.daily >= 1, 'in the daily rotation');
  assert.equal(r.backend, r.count, 'the leaderboard back end takes every map');
  assert.deepEqual(problems(logs), []);
});

test('up the steps and down: the player and an enemy stand on the ground’s height every step of the way; the camera rises with the player', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const L = g.level;
    window.begin(0, 12);
    let worst = 0;
    const heights = [];
    for (let i = 0; i < 120 * 8 && p.z > -15; i++) {
      window.play(1, ['KeyW']);
      worst = Math.max(worst, Math.abs(p.rig.root.position.y - L.groundY(p.x, p.z)));
      if (i % 60 === 0) heights.push(Math.round(p.rig.root.position.y * 10) / 10);
    }
    const top = { z: p.z, y: p.rig.root.position.y, cam: g.camTarget.y };
    // an enemy walks down from the terrace towards the player at the bottom
    p.x = 0;
    p.z = 20;
    const e = g.enemies.spawn('rusher', { x: 0, z: -16, ex: 0, ez: -15.9, stay: false });
    e.spawnLock = 0;
    let enemyWorst = 0;
    let lowest = 99;
    for (let i = 0; i < 120 * 8 && e.alive; i++) {
      window.play(1);
      p.x = 0;
      p.z = 20;
      enemyWorst = Math.max(enemyWorst, Math.abs(e.rig.root.position.y - L.groundY(e.x, e.z)));
      lowest = Math.min(lowest, e.rig.root.position.y);
      if (e.z > 9.5) break;
    }
    return { worst, heights, top, enemyWorst, enemyDown: e.z > 9, lowest, camBottom: g.camTarget.y };
  });
  assert.ok(r.top.z < -14, `the player got to the terrace (z ${r.top.z.toFixed(1)})`);
  assert.ok(r.top.y > 4, `up there, ${r.top.y.toFixed(2)} m up`);
  assert.ok(r.worst < 0.02, `on the ground all the way up (off by ${r.worst.toFixed(3)} at most): ${r.heights.join(' ')}`);
  assert.ok(Math.abs(r.top.cam - r.top.y) < 0.6, `the camera rose with him (${r.top.cam.toFixed(2)})`);
  assert.equal(r.enemyDown, true, 'the enemy came down the steps');
  assert.ok(r.enemyWorst < 0.02 && r.lowest < 0.1, `on the ground all the way down (off by ${r.enemyWorst.toFixed(3)} at most)`);
  assert.deepEqual(problems(logs), []);
});

test('up on the terrace the cut-away holes what stands between the camera and the player, never the ground under his feet', async () => {
  const r = await page.evaluate(async () => {
    const THREE = await import('three');
    const g = window.game;
    const L = g.level;
    g.view = 2;
    window.begin(0, -17.5);
    // a barrel 3 m from him towards the camera (the 45° view's, south-west)
    const barrel = L.barrels.find((b) => b.alive && b.variant === 'barrel');
    barrel.x = -2.3;
    barrel.z = -15.5;
    barrel.update(0);
    window.play(30);
    g.updateCamera(1, true);
    const cut = L.cut;
    const R = cut.uCutR.value;
    // how deep a point lies inside the cut's cylinder (the shader's own test: cutaway.js)
    const A = cut.uCutA.value;
    const B = cut.uCutB.value;
    const inside = (v) => {
      const ab = B.clone().sub(A);
      const t = THREE.MathUtils.clamp(v.clone().sub(A).dot(ab) / ab.dot(ab), 0, 1);
      return t < 0.97 ? R - v.distanceTo(A.clone().add(ab.multiplyScalar(t))) : -1;
    };
    const floor = new THREE.Vector3(-1.5, L.groundY(-1.5, -14), -14);
    const onBarrel = new THREE.Vector3(barrel.x, L.groundY(barrel.x, barrel.z) + 0.9, barrel.z);
    const rt = new THREE.WebGLRenderTarget(640, 360);
    const shot = () => {
      g.renderer.setRenderTarget(rt);
      g.renderer.render(g.scene, g.camera);
      g.renderer.setRenderTarget(null);
      return [floor, onBarrel].map((v) => {
        const p = v.clone().project(g.camera);
        const px = new Uint8Array(4);
        g.renderer.readRenderTargetPixels(rt, Math.round(((p.x + 1) / 2) * 640), Math.round(((p.y + 1) / 2) * 360), 1, 1, px);
        return [...px.slice(0, 3)];
      });
    };
    const holed = shot();
    cut.uCutR.value = 0;
    const whole = shot();
    cut.uCutR.value = R;
    rt.dispose();
    return { R, depth: { floor: inside(floor), barrel: inside(onBarrel) }, holed, whole, ground: B.y - 1.2 };
  });
  assert.ok(r.ground > 4.5, `the player stands on the terrace (${r.ground.toFixed(1)} m up)`);
  assert.ok(r.depth.floor > 0.7 && r.depth.barrel > 0.7, `both points lie well inside the cut (${r.depth.floor.toFixed(2)}, ${r.depth.barrel.toFixed(2)} m of ${r.R})`);
  assert.deepEqual(r.holed[0], r.whole[0], 'the terrace floor in front of him is drawn as without the cut');
  assert.notDeepEqual(r.holed[1], r.whole[1], 'the barrel between him and the camera is cut away');
  await page.evaluate(() => {
    const g = window.game;
    g.level.barrels.find((b) => b.alive && b.variant === 'barrel').reset(); // home again: the picture is of the terrace
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('ruins-terrace.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('the high ground: a man on a landing sees over a forecourt planter that hides the player from one on the forecourt; the player up there shoots over it, and still hits a barrel', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    const p = g.player;
    window.begin(-9, 21.2);
    // the planter at (-9, 19.5): the player crouched behind it, south of it
    const low = window.post('grunt', -9, 15);
    const high = window.post('grunt', -3, 2.5); // on the first landing, clear of its urns
    window.play(30);
    const sight = { low: low.los, high: high.los, overLow: low.over, overHigh: high.over };
    // the player up on the first landing shoots a man behind that planter (north of it now, the player above)
    window.begin(-8, 3);
    const behind = window.post('grunt', -9, 17.6);
    behind.hp = 1;
    window.play(90, ['Mouse0'], [-9, 17.6]);
    const shotOver = !behind.alive;
    // and from there a barrel on the forecourt still takes the shot
    window.begin(-8, 3);
    const barrel = L.barrels.find((b) => b.alive && b.kind === 'barrel' && b.variant === 'barrel');
    barrel.x = -9;
    barrel.z = 14;
    window.play(90, ['Mouse0'], [-9, 14]);
    return { sight, shotOver, barrel: barrel.fuse >= 0 || !barrel.alive || barrel.hp < barrel.maxHp, overPlayer: p.over };
  });
  assert.equal(r.sight.low, false, 'from the forecourt, the planter hides the player');
  assert.equal(r.sight.high, true, `from the landing, ${r.sight.overHigh.toFixed(1)} m up, over it`);
  assert.equal(r.shotOver, true, 'the player on the landing shoots over the planter');
  assert.equal(r.barrel, true, 'and a barrel below still takes the shot');
  assert.deepEqual(problems(logs), []);
});

test('seven map cards on the title, no scrolling at 1280 × 720; key 7 starts here', async () => {
  await page.evaluate(() => window.game.toTitle());
  if (await page.isVisible('#telemetry-ok')) await page.click('#telemetry-ok');
  const r = await page.evaluate(() => ({
    cards: document.querySelectorAll('#map-cards .map-card').length,
    scroll: document.scrollingElement.scrollHeight > innerHeight + 1,
    title: document.getElementById('title').scrollHeight <= document.getElementById('title').clientHeight + 1,
    note: document.querySelector('.start span').textContent,
  }));
  assert.equal(r.cards, 7);
  assert.equal(r.scroll, false, 'the page does not scroll');
  assert.equal(r.title, true, 'nor does the title');
  assert.match(r.note, /1–7/);
  await page.screenshot({ path: new URL('ruins-title.png', OUT).pathname });
  await page.keyboard.press('Digit7');
  const started = await page.evaluate(() => ({ state: window.game.state, map: window.game.level.map.id, start: window.game.startMap }));
  assert.deepEqual(started, { state: 'playing', map: 'ruins', start: 6 });
  await page.evaluate(() => window.game.toTitle());
  assert.deepEqual(problems(logs), []);
});

test('screenshots: up the steps from their foot (the default camera); the whole map from above', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.begin(-1, 11.5);
    for (const [x, z] of [
      [-5, 2.5],
      [6, -5],
      [1, -15],
    ]) {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
    }
    window.play(60, [], [0, 2]);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('ruins-steps.png', OUT).pathname });
  await page.evaluate(() => {
    const g = window.game;
    document.getElementById('hud').style.visibility = 'hidden';
    g.level.cut.uFadeSet.value.fill(0);
    g.level.cut.uCutR.value = 0;
    const cam = g.camera;
    cam.position.set(0, 75, 0.01);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    g.renderer.render(g.scene, cam);
  });
  await page.screenshot({ path: new URL('ruins-top.png', OUT).pathname });
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = '';
    window.game.camera.up.set(0, 1, 0);
  });
  assert.deepEqual(problems(logs), []);
});

test('an arcade run from 大三巴: a god-mode bot plays it to the end of wave 4 and on to the next stage', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 6, view: 0, seed: 9, mode: 'arcade', restart: false });
  const r = await page.evaluate(() => {
    const g = window.game;
    const hurt0 = g.player.hurt.bind(g.player);
    g.player.hurt = (...a) => {
      const hit = hurt0(...a);
      g.player.hp = 100;
      return hit;
    };
    const seen = { spawns: new Set(), stages: [], high: 0 };
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
    for (let chunk = 0; chunk < 90 && g.level.map.id === 'ruins' && g.state === 'playing'; chunk++) {
      window.simStep(600);
      seen.high = Math.max(seen.high, g.level.groundY(g.player.x, g.player.z));
    }
    return { map: g.level.map.id, stages: seen.stages, spawns: seen.spawns.size, high: seen.high, minutes: g.stepCount / 120 / 60, errors: window.stats.errors };
  });
  console.log(`大三巴: waves 1-4 in ${r.minutes.toFixed(1)} min, ${r.spawns} spawn points used, the bot up to ${r.high.toFixed(1)} m`);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.stages, [4], 'the stage moves on after wave 4');
  assert.equal(r.map, 'rooftop', 'to the next map');
  assert.ok(r.spawns >= 3, `enemies came in at ${r.spawns} of the spawn points`);
  assert.deepEqual(problems(logs), []);
});
