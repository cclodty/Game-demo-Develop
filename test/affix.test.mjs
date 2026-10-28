// F①: enemy affixes (enemies.js AFFIXES, config.js AFFIX). From the second floor each room draws one or two from its
// own stream (waves.js affixesFor), each put on one of the room's men as he comes in (placeAffixes); they stack.
// 鐵頭 cannot be held up, 彈衣 goes off where he falls, 快槍 fires half as often again, 盲射 aims without a laser,
// 黐身 takes no post and closes on the player. A man wearing them is named for them over his head (hud.js).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=61'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run in the first floor's second room (the banquet room), the player at (x, z), nobody about. */
    window.quiet = (x = 0, z = 4) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'banquet';
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
    /** A man of `type` standing at (x, z) wearing `affixes`; `fires` false: he never fires. */
    window.man = (type, x, z, affixes = [], { fires = false, stay = true } = {}) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      if (!fires) e.fireCd = 999;
      for (const a of affixes) e.giveAffix(a);
      return e;
    };
    /** 120 Hz steps, `press` on the first, aiming at `aim`; the player kept whole and where he is unless `move`. */
    window.play = (n, { press = [], aim = null, fire = false, whole = true } = {}) => {
      const p = g.player;
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        if (whole) {
          p.hp = 100;
          p.invuln = 0;
        }
        g.input.pressed.clear();
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.input.keys.clear();
        g.input.mouse.left = fire;
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
      g.input.mouse.left = false;
    };
  });
});
after(async () => {
  await h.close();
});

test('the draw: none on the first floor; one or two a room from the second, never the same twice in a room; the same for the same seed', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const plans = () => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      return g.floor.map((id, s) => ({ id, floor: g.floorOf(s), plan: g.waves.affixesFor(s) }));
    };
    const a = plans();
    const b = plans();
    return { a, same: JSON.stringify(a) === JSON.stringify(b) };
  });
  const first = r.a.filter((x) => x.floor === 0);
  const later = r.a.filter((x) => x.floor > 0);
  assert.ok(first.length >= 3 && later.length >= 6, `three floors: ${r.a.map((x) => x.floor).join(' ')}`);
  assert.ok(first.every((x) => x.plan.length === 0), 'none on the first floor');
  for (const x of later) {
    assert.ok(x.plan.length >= 1 && x.plan.length <= 2, `${x.id}: one or two (${x.plan.length})`);
    assert.equal(new Set(x.plan.map((p) => p.id)).size, x.plan.length, `${x.id}: never the same twice`);
    assert.ok(x.plan.every((p) => p.wave === 0 || p.wave === 1), `${x.id}: in one of its two waves`);
  }
  const all = new Set(later.flatMap((x) => x.plan.map((p) => p.id)));
  assert.ok(all.size >= 4, `most of the five come up in a run: ${[...all]}`);
  assert.equal(r.same, true, 'the same seed, the same affixes');
  assert.deepEqual(problems(logs), []);
});

test('in play: a second-floor room’s men come in wearing what the room drew, each once, and the notes name them', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.setRules('normal', []);
    g.setMode('danmaku');
    g.startRun(0);
    const per = g.waves.rules.perStage;
    // the first room of the second floor's that is not a boss room
    const s = g.floor.findIndex((id, i) => g.floorOf(i) === 1 && !g.mapAt(i).boss);
    const plan = g.waves.affixesFor(s);
    g.stage = s;
    g.level.load(g.stageMap);
    g.applyMapView();
    g.player.placeAtStart();
    const worn = [];
    const said = [];
    const log0 = g.notes.log.bind(g.notes);
    g.notes.log = (t) => {
      if (t.startsWith('詞綴：')) said.push(t);
      return log0(t);
    };
    for (let w = 0; w < per; w++) {
      g.enemies.clear();
      g.bullets.clear();
      g.waves.wave = s * per + w;
      g.waves.startWave();
      for (let i = 0; i < 120 * 40 && (g.waves.queue.length || g.waves.pending.length); i++) {
        g.player.hp = 100;
        g.player.invuln = 0;
        g.updatePlay(1 / 120);
        for (const e of g.enemies.list) {
          if (e.affixes.size && !e.counted) {
            e.counted = true;
            worn.push({ type: e.type, affixes: [...e.affixes], name: e.affixName });
          }
        }
        // the rest out of the way as they come in, so the line keeps coming
        for (const e of g.enemies.list.slice()) if (e.alive && !e.affixes.size && e.state !== 'enter') e.die(0, 1, { cause: 'bullet' });
      }
    }
    g.notes.log = log0;
    return { room: g.floor[s], plan: plan.map((p) => p.id).sort(), worn, said };
  });
  assert.ok(r.plan.length >= 1, `the room drew some: ${r.room}`);
  assert.deepEqual(r.worn.flatMap((w) => w.affixes).sort(), r.plan, `each worn once: ${JSON.stringify(r.worn)}`);
  assert.equal(r.said.length, r.worn.length, `the notes: ${r.said.join(' / ')}`);
  assert.ok(r.worn.every((w) => r.said.some((t) => t.includes(w.name))), 'by name');
  assert.deepEqual(problems(logs), []);
});

test('鐵頭: E in front of him holds nobody up; a plain man in the same place is held', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const tryHold = (affixes) => {
      window.quiet(0, 4);
      const e = window.man('grunt', 0, 2.9, affixes);
      window.play(2, { aim: [0, 0] }); // turned to him
      window.play(2, { press: ['KeyE'], aim: [0, 0] });
      const held = p.hostage === e;
      if (p.hostage) p.letGo(false);
      return { held, name: e.affixName };
    };
    return { iron: tryHold(['iron']), plain: tryHold([]) };
  });
  assert.equal(r.iron.held, false, 'the ironhead cannot be held');
  assert.equal(r.iron.name, '鐵頭打手');
  assert.equal(r.plain.held, true, 'a plain thug can');
  assert.deepEqual(problems(logs), []);
});

test('彈衣: shot dead, he goes off where he fell: the man beside him and the player 1.5 m off are caught, a man 3.5 m off is not', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.quiet(0, 0);
    const vest = window.man('grunt', 0, -1.5, ['vest']);
    const near = window.man('grunt', 1, -1.8);
    const far = window.man('grunt', -3.5, -1.5);
    vest.hp = 0.5;
    near.hp = 4;
    window.play(2, { aim: [0, -4] });
    const said = [];
    const log0 = g.notes.log.bind(g.notes);
    g.notes.log = (t) => {
      said.push(t);
      return log0(t);
    };
    let n = 0;
    while (vest.alive && n++ < 240) window.play(1, { aim: [0, -4], fire: true });
    p.hp = 100;
    window.play(60, { aim: [0, -4], whole: false });
    g.notes.log = log0;
    return { vestDead: !vest.alive, near: !near.alive || near.stunT > 0 || near.hp < 4, far: far.alive && far.hp === far.hpMax, hurt: 100 - p.hp, said: said.filter((t) => t.includes('彈衣')) };
  });
  assert.equal(r.vestDead, true, 'shot dead');
  assert.equal(r.near, true, 'the man beside him caught');
  assert.equal(r.far, true, 'the man 3.5 m off untouched');
  assert.ok(r.hurt > 0, `the player caught too (${r.hurt})`);
  assert.ok(r.said.some((t) => t.includes('爆炸')), `the notes: ${r.said.join(' / ')}`);
  assert.deepEqual(problems(logs), []);
});

test('快槍: after each volley he rests the plain man’s gap ÷ 1.5', async () => {
  const r = await page.evaluate(() => {
    window.quiet(0, 4);
    const plain = window.man('rifle', -3, -4, [], { fires: true });
    const quick = window.man('rifle', 3, -4, ['quick'], { fires: true });
    // the rest each draws as a volley ends: the type's cooldown × restMul (enemies.js), seen on the step after
    const rests = new Map([
      [plain, []],
      [quick, []],
    ]);
    const was = new Map();
    for (let i = 0; i < 120 * 14; i++) {
      window.play(1, { aim: [0, -4] });
      for (const e of [plain, quick]) {
        if (was.get(e) === 'fire' && e.state !== 'fire') rests.get(e).push(e.fireCd);
        was.set(e, e.state);
      }
    }
    const c = quick.cfg.cooldown;
    return { ratio: quick.restMul / plain.restMul, quick: rests.get(quick), plain: rests.get(plain), top: c[1] * plain.restMul, low: c[0] * plain.restMul };
  });
  assert.ok(Math.abs(r.ratio - 1 / 1.5) < 1e-9, `÷ 1.5 (${r.ratio})`);
  assert.ok(r.quick.length >= 2 && r.plain.length >= 1, `volleys fired: ${r.quick.length} and ${r.plain.length}`);
  assert.ok(Math.max(...r.quick) <= r.top / 1.5 + 1e-6, `his rests ${r.quick.map((x) => x.toFixed(2))} under ${(r.top / 1.5).toFixed(2)}`);
  assert.ok(Math.min(...r.plain) >= r.low - 0.02, `the plain man’s ${r.plain.map((x) => x.toFixed(2))} from ${r.low.toFixed(2)}`);
  assert.deepEqual(problems(logs), []);
});

test('盲射: he aims and fires with no laser line, only his glow; a plain gunner aiming beside him shows his line', async () => {
  const r = await page.evaluate(() => {
    window.quiet(0, 4);
    const blind = window.man('grunt', -2, -4, ['blind'], { fires: true });
    const plain = window.man('grunt', 2, -4, [], { fires: true });
    let blindAimed = false;
    let blindLine = false;
    let plainLine = false;
    let glow = 0;
    for (let i = 0; i < 120 * 8; i++) {
      window.play(1, { aim: [0, -4] });
      if (blind.state === 'aim') {
        blindAimed = true;
        blindLine ||= blind.laser.mesh.visible;
        glow = Math.max(glow, blind.glow || 0);
      }
      if (plain.state === 'aim') plainLine ||= plain.laser.mesh.visible;
    }
    return { blindAimed, blindLine, plainLine, glow };
  });
  assert.equal(r.blindAimed, true, 'he aimed');
  assert.equal(r.blindLine, false, 'with no line');
  assert.ok(r.glow > 0.3, `only his glow (${r.glow.toFixed(2)})`);
  assert.equal(r.plainLine, true, 'the plain gunner’s line shows');
  assert.deepEqual(problems(logs), []);
});

test('黐身: in by a door he takes no post and closes to a few metres of the player; a plain man from the same door holds a post', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    const run = (affixes) => {
      window.quiet(0, 4);
      const sp = g.level.spawns[0];
      const e = g.enemies.spawn('grunt', sp);
      for (const a of affixes) e.giveAffix(a);
      e.fireCd = 999;
      let held = false;
      let closest = Infinity;
      for (let i = 0; i < 120 * 10; i++) {
        window.play(1, { aim: [e.x, e.z] });
        e.fireCd = 999;
        held ||= e.state === 'hold';
        if (i > 120 * 6) closest = Math.min(closest, Math.hypot(e.x - p.x, e.z - p.z));
      }
      return { held, post: !!e.post, closest };
    };
    return { sticky: run(['sticky']), plain: run([]) };
  });
  assert.equal(r.sticky.held, false, 'no post for him');
  assert.ok(r.sticky.closest < 5, `close on the player (${r.sticky.closest.toFixed(1)} m)`);
  assert.equal(r.plain.held, true, 'the plain man holds a post');
  assert.deepEqual(problems(logs), []);
});

test('the name over his head: 鐵頭快槍步槍手 (two stacked) and 彈衣打手; screenshot', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.quiet(-1, 3);
    window.man('rifle', -4, -3.5, ['iron', 'quick'], { fires: true });
    window.man('grunt', 3, -2.5, ['vest'], { fires: true });
    window.man('shotgun', 0.5, -4.5, [], { fires: true });
    window.play(60, { aim: [-4, -3.5] });
    g.hurtFx = 0;
    g.hud.el.banner.className = ''; // no wave banner left over from the tests before
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return [...document.querySelectorAll('#indicators .affix-tag')].filter((t) => t.style.display === 'block').map((t) => t.textContent);
  });
  await page.screenshot({ path: new URL('affix.png', OUT).pathname });
  assert.deepEqual(r.sort(), ['彈衣打手', '鐵頭快槍步槍手'].sort(), `the tags: ${r}`);
  assert.deepEqual(problems(logs), []);
});
