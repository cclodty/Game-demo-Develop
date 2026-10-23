// 大三巴 Ruins of St. Paul's (新地圖 ①; rebuilt to its massing study, 大三巴：重建 ①):
// the seventh map, stylised, at the real size: from the forecourt in the south
// 68 steps climb north 42.7 m and about 10 m in three flights with two landings
// to the terrace under the façade (massing/ruins/checks.json). The ground's height
// is the map's `ground` (level.js groundY): the player and the enemies walk up
// and down the steps on it, and the camera rises with the player. Two levels
// (同一水平, DECISIONS 2026-10-22; test/levels.test.mjs): the forecourt and the
// terrace each fight on their own, the steps between: nobody fires from one
// level onto another and a shot stops at the edge of a flight. In MAPS (key 7),
// in the daily rotation, and taken by the back end. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runChecks } from '../scripts/massing/checks.mjs';
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
    window.begin = (x = -4, z = 56) => {
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

test('the rebuild against its study (massing/ruins/checks.json): the steps’ foot, the terrace’s height, 68 steps, the steps’ and the terrace’s widths, the façade’s width and top', () => {
  const ids = ['steps-foot', 'terrace-rise', 'steps-count', 'steps-width', 'terrace-width', 'facade-width', 'facade-top'];
  const checks = JSON.parse(fs.readFileSync(new URL('../massing/ruins/checks.json', import.meta.url), 'utf8')).filter((c) => ids.includes(c.id));
  const map = JSON.parse(fs.readFileSync(new URL('../assets/maps/ruins.json', import.meta.url), 'utf8'));
  assert.equal(checks.length, ids.length);
  const failed = runChecks(map, checks).filter((c) => !c.ok);
  assert.deepEqual(failed, [], failed.map((c) => `${c.what} ${c.value} (real ${c.real} ± ${c.tol})`).join('; '));
});

test('the forecourt, 68 steps in three flights with two landings 42.7 m up to the terrace 10 m above it, the façade: about 48 × 106 m to walk; spawns below and at the top; seventh in MAPS, in the daily rotation, and the back end takes it', async () => {
  const r = await page.evaluate(async () => {
    const { DAILY_ROTATION } = await import('/src/rules.js');
    const { LIMITS } = await import('/backend/worker.js');
    const g = window.game;
    const i = window.ruins();
    const L = window.load();
    const { halfW, halfD } = L.bounds;
    const at = (z) => Math.round(L.groundY(-4, z) * 100) / 100;
    // up the middle of the steps, every 10 cm: never down, and where it is flat
    const profile = [];
    for (let z = 45; z >= -20; z -= 0.1) profile.push(L.groundY(-4, z));
    const rises = profile.every((y, k) => k === 0 || y >= profile[k - 1] - 1e-9);
    const flats = [];
    for (let k = 1; k < profile.length; k++) {
      const flat = Math.abs(profile[k] - profile[k - 1]) < 1e-9;
      const y = Math.round(profile[k] * 100) / 100;
      if (flat && (!flats.length || flats[flats.length - 1].y !== y)) flats.push({ y });
    }
    const path = L.nav.findPath(-4, 50, -4, -12);
    const walk = [[-4, 76], [-7, -26], [-4, 40], [12.8, 20]].map(([x, z]) => L.nav.isWalkable(x, z));
    const shut = [[-4, 79], [-20, 20], [7.2, 20]].map(([x, z]) => L.nav.isWalkable(x, z));
    const behind = L.nav.findPath(-4, 50, 0, -40); // the open ground past the hill at the nave's back: no way there
    const facade = L.solids.find((s) => s.matKey === 'facade');
    return {
      index: i,
      count: g.maps.length,
      name: [g.maps[i].name, g.maps[i].en],
      size: [halfW * 2, halfD * 2],
      walk,
      shut,
      behind,
      heights: { forecourt: at(50), landing1: at(24.2), landing2: at(8.8), terrace: at(-12) },
      rises,
      levels: flats.map((f) => f.y),
      steps: g.maps[i].steps.flights.reduce((a, b) => a + b, 0),
      path: !!path,
      facade: facade ? { h: facade.h, z: (facade.minZ + facade.maxZ) / 2 } : null,
      low: L.spawns.filter((s) => s.ez > 38.1).length,
      top: L.spawns.filter((s) => s.ez < -4.6).length,
      daily: DAILY_ROTATION.filter((d) => d.map === i).length,
      backend: LIMITS.maps,
    };
  });
  assert.equal(r.index, 6, 'the seventh map');
  assert.deepEqual(r.name, ['大三巴', "RUINS OF ST. PAUL'S"]);
  assert.deepEqual(r.size, [48, 160], 'the bounds');
  assert.deepEqual(r.walk, [true, true, true, true], 'the forecourt’s south end, the nave, the steps’ foot and the walkway are walkable');
  assert.deepEqual(r.shut, [false, false, false], 'past the south rows, the west wall and the zigzag planter are not');
  assert.equal(r.behind, null, 'nor is there a way round behind the nave');
  assert.deepEqual(r.heights, { forecourt: 0, landing1: 3.45, landing2: 6.9, terrace: 10.2 });
  assert.equal(r.rises, true, 'up the steps the ground never drops');
  assert.deepEqual(r.levels, [0, r.heights.landing1, r.heights.landing2, r.heights.terrace], 'four levels: the forecourt, two landings, the terrace');
  assert.equal(r.steps, 68, '68 steps');
  assert.equal(r.path, true, 'from the forecourt up to the terrace on foot');
  assert.ok(r.facade && r.facade.h > 20 && r.facade.z < -20, `the façade across the top (${JSON.stringify(r.facade)})`);
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
    window.begin(-4, 40);
    let worst = 0;
    const heights = [];
    for (let i = 0; i < 120 * 12 && p.z > -10; i++) {
      window.play(1, ['KeyW']);
      worst = Math.max(worst, Math.abs(p.rig.root.position.y - L.groundY(p.x, p.z)));
      if (i % 60 === 0) heights.push(Math.round(p.rig.root.position.y * 10) / 10);
    }
    const top = { z: p.z, y: p.rig.root.position.y, cam: g.camTarget.y };
    // an enemy walks down from the terrace towards the player at the bottom
    p.x = -4;
    p.z = 50;
    const e = g.enemies.spawn('rusher', { x: -4, z: -12, ex: -4, ez: -11.9, stay: false });
    e.spawnLock = 0;
    let enemyWorst = 0;
    let lowest = 99;
    for (let i = 0; i < 120 * 12 && e.alive; i++) {
      window.play(1);
      p.x = -4;
      p.z = 50;
      enemyWorst = Math.max(enemyWorst, Math.abs(e.rig.root.position.y - L.groundY(e.x, e.z)));
      lowest = Math.min(lowest, e.rig.root.position.y);
      if (e.z > 38.6) break;
    }
    return { worst, heights, top, enemyWorst, enemyDown: e.z > 38.1, lowest, camBottom: g.camTarget.y };
  });
  assert.ok(r.top.z < -9, `the player got to the terrace (z ${r.top.z.toFixed(1)})`);
  assert.ok(r.top.y > 10, `up there, ${r.top.y.toFixed(2)} m up`);
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
    window.begin(-4, -17.5);
    // a barrel 3 m from him towards the camera (the 45° view's, south-west)
    const barrel = L.barrels.find((b) => b.alive && b.variant === 'barrel');
    barrel.x = -6.3;
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
    const floor = new THREE.Vector3(-5.5, L.groundY(-5.5, -14), -14);
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
  assert.ok(r.ground > 10, `the player stands on the terrace (${r.ground.toFixed(1)} m up)`);
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

test('no high ground: a man on a landing does not see over a forecourt planter to the player below; the player up there cannot shoot down at a man behind it, nor at a barrel on the forecourt', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(-8, 48.2);
    // the planter at (-8, 46.5): the player crouched behind it, south of it
    const low = window.post('grunt', -8, 41);
    const high = window.post('grunt', -4, 24.2); // on the first landing, 3.45 m up, clear of its urns
    window.play(30);
    const sight = { low: low.los, high: high.los };
    // the player up on the first landing fires at a man behind that planter
    window.begin(-6, 24.2);
    const behind = window.post('grunt', -8, 44.8);
    behind.hp = 1;
    window.play(90, ['Mouse0'], [-8, 44.8]);
    const shotDown = !behind.alive;
    // and at a barrel on the forecourt
    window.begin(-6, 24.2);
    const barrel = L.barrels.find((b) => b.alive && b.kind === 'barrel' && b.variant === 'barrel');
    barrel.x = -8;
    barrel.z = 41;
    window.play(90, ['Mouse0'], [-8, 41]);
    return { sight, shotDown, barrel: barrel.fuse >= 0 || !barrel.alive || barrel.hp < barrel.maxHp };
  });
  assert.equal(r.sight.low, false, 'from the forecourt, the planter hides the player');
  assert.equal(r.sight.high, false, 'from the landing, 3.45 m up, not a line on him either: another level');
  assert.equal(r.shotDown, false, 'the player’s shots from the landing stop at the edge of the flight');
  assert.equal(r.barrel, false, 'and a barrel below is untouched');
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

test('up on the terrace, 10 m up, the camera still shows the terrace’s edge and the head of the steps', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = [];
    for (const view of [0, 1, 2]) {
      g.view = view;
      // 4.4 m back from its edge: the edge; at the edge: the top of the last flight below it
      window.begin(-4, -9);
      window.play(30);
      g.updateCamera(1, true);
      g.camera.updateMatrixWorld(true);
      const edge = g.camera.position.clone().set(-4, 10.2, -4.6).project(g.camera);
      window.begin(-4, -6);
      window.play(30);
      g.updateCamera(1, true);
      g.camera.updateMatrixWorld(true);
      const head = g.camera.position.clone().set(-4, 9.5, -2).project(g.camera);
      out.push({ view, edge: [edge.x, edge.y], head: [head.x, head.y] });
    }
    return out;
  });
  for (const v of r) {
    assert.ok(Math.abs(v.edge[0]) < 0.95 && Math.abs(v.edge[1]) < 0.95, `view ${v.view}: the terrace’s edge on the screen (${v.edge.map((x) => x.toFixed(2))})`);
    assert.ok(Math.abs(v.head[0]) < 0.95 && Math.abs(v.head[1]) < 0.95, `view ${v.view}: the head of the steps too (${v.head.map((x) => x.toFixed(2))})`);
  }
  assert.deepEqual(problems(logs), []);
});

test('screenshots: up the steps from their foot (the default camera); the whole map from above; from the forecourt’s south end, as the study’s photograph (massing/ruins/reference/photos/largo.jpg)', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.begin(-4, 41);
    for (const [x, z] of [
      [-7, 24.2],
      [2, 8.8],
      [-2, -10],
    ]) {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
    }
    window.play(60, [], [-4, 30]);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('ruins-steps.png', OUT).pathname });
  const look = async (name, pos, at, up = [0, 1, 0], fov = null) => {
    await page.evaluate(
      ({ pos, at, up, fov }) => {
        const g = window.game;
        document.getElementById('hud').style.visibility = 'hidden';
        g.level.cut.uFadeSet.value.fill(0);
        g.level.cut.uCutR.value = 0;
        const cam = g.camera;
        const fov0 = cam.fov;
        if (fov) cam.fov = fov;
        cam.position.set(...pos);
        cam.up.set(...up);
        cam.lookAt(...at);
        cam.updateProjectionMatrix();
        g.renderer.render(g.scene, cam);
        cam.fov = fov0;
      },
      { pos, at, up, fov },
    );
    await page.screenshot({ path: new URL(name, OUT).pathname });
  };
  await look('ruins-top.png', [-2, 160, 24.01], [-2, 0, 24], [0, 0, -1]);
  // where the photograph was taken (massing/ruins/README.md #8: 1.5 m up, 84 m south of the façade)
  await look('ruins-largo.png', [-4, 1.5, 62.4], [-2, 17, -21.6], [0, 1, 0], 50);
  await page.evaluate(() => {
    document.getElementById('hud').style.visibility = '';
    window.game.camera.up.set(0, 1, 0);
    window.game.camera.updateProjectionMatrix();
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
