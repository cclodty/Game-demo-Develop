// 彈幕 ② E⑦: the club (rooms.js DISCO), the old club remade as a fight room in the floors' draw. Its own thing: the
// lights keep the beat (rooms.js `blackout`, level.js beatAt, on world time from the room's start) and go out on the
// last beat of every two bars, the whole room dark (level.js darkAt), so nobody aims on that beat: a gunner's aim
// breaks off and he fires nothing, and a kill then is a BLACKOUT; the beat before, the dance floor flashes white. The
// room validates as the others do (test/maps.test.mjs, test/hell.test.mjs) and is drawn into floors (test/floor.test.mjs).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=57'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run in the club (the first floor's second room made the club), the player at (x, z), nobody about. */
    window.toClub = (x = -6, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'disco';
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
    /** A man of `type` standing at (x, z); `fires` false: he never fires. */
    window.post = (type, x, z, fires = false) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      if (!fires) e.fireCd = 999;
      return e;
    };
    /** 120 Hz steps aiming at `aim` (the trigger held with `fire`); the player kept whole and where he is. */
    window.play = (n, { aim = null, fire = false } = {}) => {
      const p = g.player;
      const [x, z] = [p.x, p.z];
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        p.hp = 100;
        p.invuln = 0;
        g.input.pressed.clear();
        g.input.keys.clear();
        g.input.mouse.left = fire;
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
        p.x = x;
        p.z = z;
      }
      g.input.mouse.left = false;
    };
    /** The tags of each kill from now on. */
    window.tags = () => {
      const seen = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        seen.push(t.map((x) => x.label));
        return kill0(t);
      };
      return seen;
    };
  });
});
after(async () => {
  await h.close();
});

test('the club is in the floors’ draw; its lights keep a 124 bpm beat on world time, out on the last of every eight beats (dark everywhere), the same from every start; four lights; the budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toClub();
    const L = g.level;
    const room = L.map;
    const beat = 60 / room.blackout.bpm;
    // through four bars of the beat, step by step: which beats were dark, and was it dark everywhere then
    const dark = new Set();
    let everywhere = true;
    let lit = true;
    const lamp = { dark: 1, lit: 0 }; // the first lamp's share of its own light, at its least in the dark and its most when lit
    for (let i = 0; i < Math.round((16 * beat) / (1 / 120)); i++) {
      window.play(1);
      const [b] = L.beatAt();
      const k = L.points[0].light.intensity / L.points[0].intensity;
      if (L.blackoutNow()) {
        dark.add(b);
        everywhere &&= L.darkAt(-9, 5) && L.darkAt(8, -5);
        lamp.dark = Math.min(lamp.dark, k);
      } else {
        lit &&= !L.darkAt(-9, 5);
        lamp.lit = Math.max(lamp.lit, k);
      }
    }
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    // a new start begins the beat again; bullet time stretches it
    window.toClub();
    const t0 = L.beatT;
    g.setFocus(true);
    window.play(120);
    const slow = L.beatT - t0;
    g.setFocus(false);
    return {
      pool: g.waves.rules.floor.pool,
      id: room.id,
      dark: [...dark],
      everywhere,
      lit,
      lamp,
      t0,
      slow,
      lights: L.points.length,
      calls: info.calls,
      tris: info.triangles,
      budget: room.budget,
    };
  });
  assert.ok(r.pool.includes('disco'), `in the draw: ${r.pool}`);
  assert.equal(r.id, 'disco');
  assert.deepEqual(r.dark, [7, 15], 'out on the eighth beat of each two bars');
  assert.equal(r.everywhere, true, 'dark all over the room then');
  assert.equal(r.lit, true, 'and nowhere dark on the other beats');
  assert.ok(r.lamp.dark < 0.1 && r.lamp.lit === 1, `the lamps go out to show it: ${JSON.stringify(r.lamp)}`);
  assert.equal(r.t0, 0, 'a new start begins the beat again');
  assert.ok(r.slow < 0.8, `bullet time stretches the beat (${r.slow.toFixed(2)} world s in 1 s)`);
  assert.equal(r.lights, 4, 'four point lights');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('a gunner at a post aims and fires on the lit beats, and on the dark beat his aim breaks off and he fires nothing', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toClub(0, 3);
    const L = g.level;
    const post = L.posts[2];
    const e = window.post('grunt', post.x, post.z, true);
    const enemyShots = () => g.bullets.list.filter((b) => b.owner !== 'player').length;
    let litAims = 0;
    let darkAims = 0;
    let darkShots = 0;
    let darkSteps = 0;
    let shots = enemyShots();
    for (let i = 0; i < 120 * 12; i++) {
      const dark = L.blackoutNow(); // as the step's enemies see it (they move before the beat's clock does)
      window.play(1, { aim: [post.x, post.z] });
      const now = enemyShots();
      const aiming = e.state === 'aim' || e.state === 'fire';
      if (dark) {
        darkSteps++;
        if (aiming) darkAims++;
        if (now > shots) darkShots += now - shots;
      } else if (aiming) litAims++;
      shots = now;
    }
    return { litAims, darkAims, darkShots, darkSteps };
  });
  assert.ok(r.darkSteps > 100, `the dark beats came (${r.darkSteps} steps)`);
  assert.ok(r.litAims > 0, `he aims while it is lit (${r.litAims} steps)`);
  assert.equal(r.darkAims, 0, 'no aim in the dark');
  assert.equal(r.darkShots, 0, 'no shot in the dark');
  assert.deepEqual(problems(logs), []);
});

test('a gunner shot dead on the dark beat: BLACKOUT', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toClub(0, 2);
    const L = g.level;
    const post = L.posts[2];
    // to the beat before the dark one, then fire through the dark beat
    let n = 0;
    while (!L.blackoutNow() && n++ < 120 * 8) window.play(1, { aim: [post.x, post.z] });
    const e = window.post('grunt', post.x, post.z);
    e.hp = 1;
    const tags = window.tags();
    n = 0;
    while (e.alive && L.blackoutNow() && n++ < 120) window.play(1, { aim: [post.x, post.z], fire: true });
    return { dead: !e.alive, tags };
  });
  assert.equal(r.dead, true, 'shot dead before the lights came on');
  assert.ok(r.tags.length === 1 && r.tags[0].includes('BLACKOUT'), `the kill tags: ${JSON.stringify(r.tags)}`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the beat before the lights go out (the floor white) and the dark beat', async () => {
  const shot = async (which) => {
    await page.evaluate((which) => {
      const g = window.game;
      window.toClub(-3, 3.5);
      const L = g.level;
      window.post('grunt', -4.5, -4.6, true);
      window.post('rifle', 0, -4.6, true);
      window.post('grunt', 4.5, -4.6, true);
      window.post('grunt', 8.5, -5.2, true);
      const want = which === 'dark' ? 7 : 6;
      let n = 0;
      while (L.beatAt()[0] % 8 !== want && n++ < 120 * 8) window.play(1, { aim: [0, -4.6] });
      window.play(12, { aim: [0, -4.6] });
      g.hurtFx = 0; // the player kept whole: no red at the edges
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      g.render();
    }, which);
    await page.screenshot({ path: new URL(`disco-${which}.png`, OUT).pathname });
  };
  await shot('warn');
  await shot('dark');
  assert.deepEqual(problems(logs), []);
});
