// 彈幕 ② E③: the stone steps (rooms.js STEPS), an old quarter's steps remade as a fight room in the floors' draw. Its
// own thing: four steps down the middle from the upper level (the entry, the south) to the lower (the posts and the
// exit, the north), planters either side so the flight is the one way between, and three oil drums on the top step
// that, shot or kicked over, roll down it (level.js Barrel: `ground`, `slope`) and bowl over the men in their road,
// ROLLING +150. The rise is under LEVELS.tol, so the room is one level: shots cross it both ways. The room validates
// as the others do (test/maps.test.mjs, test/hell.test.mjs) and is drawn into floors (test/floor.test.mjs).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=53'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on the steps (the first floor's second room made the steps), the player at (x, z), nobody about. */
    window.toSteps = (x = 0, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'steps';
      g.floor = g.floors.flat();
      g.stage = 1;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.setFocus(false);
      g.player.placeAtStart();
      g.player.x = x;
      g.player.z = z;
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** A man of `type` standing at (x, z) who never fires. */
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
    /** 120 Hz steps holding `held` (`press` on the first), aiming at (ax, az); the player kept whole unless `hurt`; `each` after every step. */
    window.play = (n, { held = [], press = [], aim = null, hurt = false, each = null } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        if (!hurt) {
          g.player.hp = 100;
          g.player.invuln = 0;
        }
        g.input.pressed.clear();
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = held.includes('Mouse0');
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
        if (each && each(i) === false) break;
      }
      g.input.keys.clear();
      g.input.mouse.left = false;
    };
    /** The style bonuses scored from now on, as `LABEL:points`. */
    window.styles = () => {
      const seen = [];
      const style0 = g.score.style.bind(g.score);
      g.score.style = (label, pts, ...a) => {
        seen.push(`${label}:${pts}`);
        return style0(label, pts, ...a);
      };
      return seen;
    };
  });
});
after(async () => {
  await h.close();
});

test('the steps are in the floors’ draw; two levels under LEVELS.tol apart, the upper by the entry and the lower by the exit; the flight the one way between, planters either side that shots and sight pass over; three drums on the top step; four lights; the budget', async () => {
  const r = await page.evaluate(async () => {
    const { LEVELS } = await import('/src/config.js');
    const g = window.game;
    window.toSteps();
    const L = g.level;
    const room = L.map;
    const t = room.room.steps;
    const [fx0, fx1] = t.flight;
    // across the middle of the slope, metre by metre: where a body can stand
    const across = [];
    for (let x = -10.5; x <= 10.5; x += 0.5) if (L.nav.isWalkable(x, 0)) across.push(x);
    const planters = L.solids.filter((s) => s.low && s.minZ < 0 && s.maxZ > 0);
    const path = L.nav.findPath(L.start.x, L.start.z, L.exit.at.x, L.exit.at.z);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return {
      pool: g.waves.rules.floor.pool,
      id: room.id,
      tol: LEVELS.tol,
      start: L.groundY(L.start.x, L.start.z),
      exit: L.groundY(L.exit.at.x, L.exit.at.z),
      same: L.sameLevel(L.start.x, L.start.z, L.exit.at.x, L.exit.at.z),
      slopeOn: !!L.slopeAt(0, 0),
      slopeOff: [!!L.slopeAt(0, 4), !!L.slopeAt(0, -4)],
      flight: [fx0, fx1],
      across: [Math.min(...across), Math.max(...across)],
      planters: planters.length,
      overPlanter: L.hasLOS(-8, -4, -8, 4) && !L.raycast(-8, -4, -8, 4),
      path: !!path && path.length > 0,
      drums: L.barrels.filter((b) => b.alive && L.slopeAt(b.x, b.z)).map((b) => [b.x, b.z, +L.groundY(b.x, b.z).toFixed(2)]),
      lights: L.points.length,
      calls: info.calls,
      tris: info.triangles,
      budget: room.budget,
    };
  });
  await page.screenshot({ path: new URL('steps-quiet.png', OUT).pathname });
  assert.ok(r.pool.includes('steps'), `in the draw: ${r.pool}`);
  assert.equal(r.id, 'steps');
  assert.ok(r.start > 0.5 && r.exit === 0, `the start on the upper level (${r.start}), the exit on the lower (${r.exit})`);
  assert.ok(r.start <= r.tol && r.same, `the rise ${r.start} m within LEVELS.tol ${r.tol}: one level`);
  assert.ok(r.slopeOn && !r.slopeOff[0] && !r.slopeOff[1], 'the slope on the steps, level ground either side');
  assert.ok(r.across[0] > r.flight[0] && r.across[1] < r.flight[1], `across the slope a body stands only on the flight (${r.across} within ${r.flight})`);
  assert.equal(r.planters, 2, 'a planter either side');
  assert.ok(r.overPlanter, 'shots and sight pass over a planter');
  assert.ok(r.path, 'a way from the start down to the exit');
  assert.equal(r.drums.length, 3, `three drums on the steps: ${JSON.stringify(r.drums)}`);
  assert.equal(r.lights, 4, 'four point lights');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('a drum on the top step, shot once from the upper level, falls over and rolls down the flight, faster as it goes: it bowls over the row of men coming up and on, ROLLING +150 once, and stops on the lower level', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.toSteps(0, 3);
    const drum = L.barrels.find((b) => b.alive && L.slopeAt(b.x, b.z) && Math.abs(b.x) < 0.5);
    // three men in its road: two on the steps coming up, one at their foot
    const row = [0.2, -1, -2.4].map((z) => window.post('grunt', drum.x, z));
    const styles = window.styles();
    const bowled = row.map(() => false);
    const track = [];
    const each = () => {
      row.forEach((e, i) => {
        if (e.stunT > 0 || !e.alive) bowled[i] = true;
        else [e.x, e.vx, e.vz] = [drum.x, 0, 0]; // he waits in its road
      });
      track.push([drum.z, Math.hypot(drum.vx, drum.vz)]);
    };
    window.play(1, { held: ['Mouse0'], aim: [drum.x, drum.z] }); // one shot
    for (let i = 0; i < 60 && drum.hp === drum.maxHp; i++) window.play(1, { aim: [drum.x, drum.z] });
    const shot = drum.hp < drum.maxHp;
    const tipped = drum.rolling;
    track.length = 0;
    for (let i = 0; i < 120 * 8 && (i < 10 || Math.hypot(drum.vx, drum.vz) > 0); i++) window.play(1, { aim: [drum.x, -6], each });
    const onFlight = track.filter(([z]) => z < 1.5 && z > -1.5);
    return {
      shot,
      tipped,
      alive: drum.alive,
      faster: onFlight.length > 2 && onFlight[onFlight.length - 1][1] > onFlight[0][1],
      top: Math.max(...track.map(([, s]) => s)),
      bowled,
      end: { z: drum.z, speed: Math.hypot(drum.vx, drum.vz), ground: L.groundY(drum.x, drum.z) },
      styles: styles.filter((s) => s.startsWith('ROLLING')),
      notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('油桶')),
    };
  });
  assert.equal(r.shot && r.tipped, true, 'one shot knocks it over');
  assert.equal(r.alive, true, 'and does not burst it');
  assert.equal(r.faster, true, 'it rolls faster down the flight');
  assert.deepEqual(r.bowled, [true, true, true], `the row is bowled over (top ${r.top.toFixed(1)} m/s, stopped at z ${r.end.z.toFixed(2)})`);
  assert.deepEqual(r.styles, ['ROLLING:150'], 'ROLLING +150 once');
  assert.ok(r.end.z < -1.5 && r.end.ground === 0 && r.end.speed === 0, `it stops on the lower level (z ${r.end.z.toFixed(1)})`);
  assert.ok(r.notes.some((t) => t.includes('ROLLING')), `the notes say so: ${r.notes.join(' / ')}`);
  assert.deepEqual(problems(logs), []);
});

test('one level: a gunner on the lower level hits the player on the upper, and the player’s shot from the upper level reaches a man on the lower', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toSteps(-6, 3);
    const p = g.player;
    // a round fired up at him from the lower level (enemies.js shoot's way: an enemy bullet aimed at him)
    g.bullets.spawn({ x: -6, z: -5, dx: 0, dz: 1, speed: 20, owner: 'enemy', damage: 20 });
    for (let i = 0; i < 120 && p.hp === 100; i++) window.play(1, { hurt: true, aim: [-6, -5] });
    const hit = 100 - p.hp;
    // and his own at a man down there
    window.toSteps(-6, 3);
    const man = window.post('grunt', -6, -5.5);
    man.hp = 1;
    window.play(90, { held: ['Mouse0'], aim: [-6, -5.5] });
    return { hit, down: !man.alive };
  });
  assert.ok(r.hit > 0, `the round from below hit him (${r.hit} HP)`);
  assert.equal(r.down, true, 'his shot from above reached the man below');
  assert.deepEqual(problems(logs), []);
});

test('screenshot: men coming up the steps, a drum rolling down into them, the player at the top', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.toSteps(1.2, 3.2);
    const drum = L.barrels.find((b) => b.alive && L.slopeAt(b.x, b.z) && Math.abs(b.x) < 0.5);
    const row = [-0.4, -1.8].map((z) => window.post('rusher', drum.x, z));
    window.post('rifle', -3.5, -5.8);
    window.post('grunt', 7.5, -6.2);
    drum.hit(1, 0, 1); // knocked over: off it rolls
    for (let i = 0; i < 120 && drum.z > -0.2; i++) {
      for (const e of row) [e.x, e.z, e.vx, e.vz] = [drum.x, e.z, 0, 0];
      window.play(1, { aim: [drum.x, drum.z] });
    }
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { rolling: drum.rolling, z: drum.z };
  });
  await page.screenshot({ path: new URL('steps.png', OUT).pathname });
  assert.ok(r.rolling, `the drum rolling down (z ${r.z.toFixed(2)})`);
  assert.deepEqual(problems(logs), []);
});
