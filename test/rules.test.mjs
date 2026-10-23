// Run rules (變體規則與難度): three difficulties (街頭, 正常, 芭蕾) and the
// variants (雙槍主義, 沒有慢鏡, 玻璃之城; 油桶節, 雙衝鋒槍起手 and 無槍 once
// an achievement opens them), picked on the title screen. Every
// rule is one number or one switch in src/rules.js, read in one place by its
// system; no other source file names a difficulty or a variant. The picks go
// into the input record, so a replay plays under the same rules.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { BASE, DIFFICULTIES, DIFFICULTY_IDS, packRules, rulesFor, unpackRules, VARIANT_IDS, VARIANTS } from '../src/rules.js';
import { InputRecord, RecordReader } from '../src/replay.js';
import { gameHarness, problems, snap } from './helpers.mjs';

test('every rule is one number or one switch of BASE, and only rules.js names the picks', () => {
  for (const pick of [...Object.values(DIFFICULTIES), ...Object.values(VARIANTS)]) {
    for (const [k, v] of Object.entries(pick.set)) {
      assert.ok(k in BASE, `${pick.en}: ${k} is a rule`);
      assert.equal(typeof v, typeof BASE[k], `${pick.en}: ${k} is a ${typeof BASE[k]}`);
    }
  }
  const src = new URL('../src/', import.meta.url);
  const files = readdirSync(src).filter((f) => f.endsWith('.js') && f !== 'rules.js');
  const text = files.map((f) => readFileSync(new URL(f, src), 'utf8')).join('\n') + readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of [...DIFFICULTY_IDS.filter((d) => d !== 'normal'), ...VARIANT_IDS]) {
    // as a string, a property or a key ('street' alone is an ordinary word in comments and prompts)
    assert.ok(!new RegExp(`(['"\`])${id}\\1|\\.${id}\\b|\\b${id}:`).test(text), `"${id}" appears outside rules.js`);
  }
  // the numbers on the card
  const pick = (d, v = []) => {
    const r = rulesFor(d, v);
    return [r.aimMul, r.styleMul];
  };
  assert.deepEqual(pick('ballet'), [0.6, 1.5]);
  assert.deepEqual(pick('street'), [1.4, 1]);
  assert.deepEqual(pick('normal'), [0.85, 1]);
  assert.deepEqual(pick('normal', ['noSlowmo']), [0.85, 2]);
  assert.deepEqual(pick('ballet', ['noSlowmo']), [0.6, 3], 'multipliers multiply');
  assert.deepEqual(rulesFor('normal', ['glassCity', 'dualist']).variants, ['dualist', 'glassCity'], 'a fixed order');
  assert.equal(rulesFor('ballet', ['glassCity']).label, '芭蕾 · 玻璃之城');
  assert.equal(rulesFor().label, '');
  // every combination fits the record's byte and reads back
  for (const d of DIFFICULTY_IDS) {
    for (let m = 0; m < 1 << VARIANT_IDS.length; m++) {
      const vs = VARIANT_IDS.filter((_, i) => m & (1 << i));
      const b = packRules(d, vs);
      assert.ok(b >= 0 && b < 256);
      const rec = new InputRecord({ seed: 5, rules: b });
      assert.deepEqual(unpackRules(new RecordReader(rec.encode()).rules), { difficulty: d, variants: vs });
    }
  }
});

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=31'));
  await page.evaluate(async () => {
    const g = window.game;
    g.frame = () => {};
    window.FIREPOWER = (await import('./src/config.js')).FIREPOWER; // the game's own (one module): what enemies drop
    /** Start a run on `map` under the given picks; nobody about unless `waves`. */
    window.run = (map, difficulty, variants = [], waves = false) => {
      g.setRules(difficulty, variants);
      g.startRun(map);
      if (!waves) {
        g.waves.state = 'done';
        g.enemies.clear();
      }
    };
    window.play = (n) => {
      for (let i = 0; i < n; i++) {
        g.player.hp = 100;
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
  });
});
after(async () => {
  await page.evaluate(() => window.game.setRules('normal', [])); // leave the stored picks as a fresh browser has them
  await h.close();
});

test('沒有慢鏡: Shift does nothing, the focus bar greys out, and Style points count double', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const points = () => {
      const s0 = g.score.score;
      g.score.kill([{ label: 'THUG', pts: 100 }]);
      return g.score.score - s0;
    };
    window.run(1, 'normal');
    g.input.pressed.add('ShiftLeft');
    window.play(2);
    const normal = { on: g.focusActive, pts: points() };
    g.setFocus(false);
    window.run(1, 'normal', ['noSlowmo']);
    g.input.pressed.add('ShiftLeft');
    window.play(2);
    g.input.pressed.add('KeyQ');
    window.play(2);
    g.hud.update(1 / 60);
    const off = { on: g.focusActive, pts: points(), grey: document.getElementById('focus-bar').classList.contains('off') };
    const close = g.score.score;
    g.onCloseCall(false);
    return { normal, off, closeCall: g.score.score - close, log: g.notes.events.map((e) => e.text).find((t) => t.startsWith('規則')) };
  });
  assert.equal(r.normal.on, true, 'normally Shift enters bullet time');
  assert.equal(r.off.on, false, 'not with the variant');
  assert.equal(r.off.grey, true);
  assert.equal(r.off.pts, 2 * r.normal.pts, `${r.off.pts} against ${r.normal.pts}`);
  assert.equal(r.closeCall, 50, 'a close call too: 25 × 2');
  assert.equal(r.log, '規則：沒有慢鏡');
});

test('玻璃之城: on every map each box of cover is glass, a bullet breaks it, and a frame stays in budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = [];
    // boxes of cover up to 1.8 m inside the play area (the parapets and kerbs around it are its edge, not cover)
    const cover = (L) => {
      const { halfW: W, halfD: D } = L.bounds;
      return L.solids.filter((s) => !s.poly && s.kind !== 'glass' && !s.door && s.h <= 1.8 && s.minX > -W && s.maxX < W && s.minZ > -D && s.maxZ < D).length; // a door (fixtures.js) is a door, not cover
    };
    for (let map = 0; map < g.maps.length; map++) {
      window.run(map, 'normal');
      const L = g.level;
      const before = { glass: L.glass.length, low: cover(L) };
      window.run(map, 'normal', ['glassCity']);
      const after = { glass: L.glass.length, low: cover(L), crates: L.crates.length };
      // and a frame stays inside the map's render budget
      g.player.placeAtStart();
      g.updateCamera(1, true);
      g.render();
      const info = g.renderer.info.render;
      const frame = { tris: info.triangles, calls: info.calls, budget: L.map.budget };
      // one bullet into a pane that used to be cover
      const pane = L.glass.find((s) => s.h <= 1.8 && L.nav.isWalkable(s.minX - 1.2, (s.minZ + s.maxZ) / 2));
      const z = (pane.minZ + pane.maxZ) / 2;
      g.player.x = pane.minX - 4;
      g.player.z = z + 2;
      g.bullets.spawn({ x: pane.minX - 1, z, dx: 1, dz: 0, speed: 62, owner: 'player', damage: 1 });
      window.play(6);
      out.push({ map: L.map.id, before, after, frame, broke: !pane.alive });
    }
    window.run(0, 'normal');
    return { out, back: g.level.glass.length };
  });
  for (const m of r.out) {
    assert.ok(m.before.low > 0, `${m.map} has low cover`);
    assert.equal(m.after.low, 0, `${m.map}: no solid cover left`);
    assert.equal(m.after.glass, m.before.glass + m.before.low, `${m.map}: it all became glass`);
    assert.equal(m.after.crates, 0, `${m.map}: the crates too`);
    assert.equal(m.broke, true, `${m.map}: a bullet breaks it`);
    assert.ok(m.frame.tris <= m.frame.budget.tris && m.frame.calls <= m.frame.budget.calls, `${m.map}: ${m.frame.tris} triangles, ${m.frame.calls} draw calls, budget ${m.frame.budget.tris} / ${m.frame.budget.calls}`);
  }
  assert.equal(r.back, r.out[0].before.glass, 'without the variant the map is as it was');
});

test('雙槍主義: the weapon pads stay empty and enemies drop nothing', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    // a brute drops his minigun only some of the time (config.js FIREPOWER): here always, so a drop that is not there is the variant's doing
    const { FIREPOWER } = window;
    const brute = FIREPOWER.drops.brute;
    FIREPOWER.drops.brute = [['minigun', 1]];
    const look = (variants) => {
      window.run(0, 'normal', variants, true);
      let n = 0;
      while (g.waves.wave < 1 && n++ < 600) window.play(1);
      const pads = g.level.pads.filter((p) => p.pickup).length;
      g.waves.state = 'done';
      g.enemies.clear();
      g.pickups.clear();
      const e = g.enemies.spawn('brute', { x: g.player.x, z: g.player.z - 5, ex: g.player.x, ez: g.player.z - 4.9, stay: true });
      e.die(0, -1, { cause: 'bullet' });
      return { pads, of: g.level.pads.length, drops: g.pickups.list.length };
    };
    const out = { normal: look([]), dualist: look(['dualist']) };
    FIREPOWER.drops.brute = brute;
    return out;
  });
  assert.ok(r.normal.of > 0 && r.normal.pads === r.normal.of, `normally the pads fill (${r.normal.pads}/${r.normal.of})`);
  assert.equal(r.normal.drops, 1, 'and a brute drops his gun');
  assert.equal(r.dualist.pads, 0, 'not with the variant');
  assert.equal(r.dualist.drops, 0);
});

test('無槍: hidden until 赤手空拳; then empty hands: the left button and R do nothing, the HUD says 空手 BARE HANDS, no gun in either hand (nor after a pan is put down); the pads stay empty, nobody drops a gun; F still kicks and executes', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const card = () => document.querySelector('#variant-cards [data-rule="noGuns"]');
    const out = {};
    // locked: not on the title, and not taken if asked for
    g.toTitle();
    out.lockedCard = !!card() && !card().classList.contains('hidden');
    g.setRules('normal', ['noGuns']);
    out.lockedPick = [...g.variants];
    // 赤手空拳 done (a wave without a shot): it shows
    g.achievements.wave(false, 0);
    g.toTitle();
    out.openCard = !!card() && !card().classList.contains('hidden');
    // the run: the pads at wave 1, then a brute who would always drop his minigun (config.js FIREPOWER: here always)
    const fp = window.FIREPOWER;
    const keep = fp.drops.brute;
    fp.drops.brute = [['minigun', 1]];
    window.run(0, 'normal', ['noGuns'], true);
    let n = 0;
    while (g.waves.wave < 1 && n++ < 600) window.play(1);
    out.pads = g.level.pads.filter((p) => p.pickup).length;
    g.waves.state = 'done';
    g.enemies.clear();
    g.pickups.clear();
    const p = g.player;
    const brute = g.enemies.spawn('brute', { x: p.x, z: p.z - 5, ex: p.x, ez: p.z - 4.9, stay: true });
    brute.die(0, -1, { cause: 'kick' });
    out.drops = g.pickups.list.length;
    fp.drops.brute = keep;
    out.label = g.ruleset.label;
    // the left button held, R pressed: nothing
    const shots = g.waves.shots;
    g.input.mouse.left = true;
    g.input.pressed.add('KeyR');
    window.play(30);
    g.input.mouse.left = false;
    out.fired = g.bullets.list.filter((b) => b.alive && b.owner === 'player').length + (g.waves.shots - shots);
    out.reload = p.reloadT;
    g.hud.update(1 / 60);
    const text = (id) => document.getElementById(id).textContent;
    out.hud = { weapon: text('weapon-name'), ammo: text('ammo-count'), max: text('ammo-max'), slot: text('slots') };
    const guns = () => p.rig.weaponParts.filter((m) => m.visible).length;
    out.guns = guns();
    // a pan taken up and thrown away: still no gun
    const pan = g.level.pans[0];
    g.thrown.pickUp(pan);
    window.play(2);
    g.thrown.throwCarried();
    window.play(30);
    out.gunsAfterPan = guns();
    // F: a kick, then the execution of the dazed one (aimed at him: the cursor is not used here)
    const e = g.enemies.spawn('grunt', { x: p.x, z: p.z - 1, ex: p.x, ez: p.z - 0.9, stay: true });
    e.spawnLock = 0;
    const step = (frames, keys = []) => {
      for (let i = 0; i < frames; i++) {
        p.hp = 100;
        g.killcamT = 0;
        g.hitstopT = 0;
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        g.aimPoint.set(e.x, g.aimPoint.y, e.z);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
      }
    };
    step(2);
    step(1, ['KeyF']);
    out.kicked = e.stunCause === 'kick' && e.stunT > 0;
    step(10);
    p.x = e.x;
    p.z = e.z + 0.9;
    step(1, ['KeyF']);
    step(60);
    out.executed = !e.alive;
    return out;
  });
  // the shots: a run with empty hands (the HUD says so), then the title with the variant open
  await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    g.enemies.spawn('grunt', { x: p.x + 1.5, z: p.z - 4, ex: p.x + 1.5, ez: p.z - 3.9, stay: true });
    g.updatePlay(1 / 60);
    g.hud.update(1 / 60);
    g.updateCamera(1, true);
    g.render();
  });
  await snap(page, 'rules-no-guns.png');
  await page.evaluate(() => {
    const g = window.game;
    g.setRules('normal', ['noGuns']);
    g.toTitle();
    g.showRules(true);
    document.querySelector('#variant-cards [data-rule="noGuns"]').scrollIntoView({ block: 'center' });
    g.render();
  });
  await snap(page, 'rules-no-guns-title.png');
  await page.evaluate(() => {
    const g = window.game;
    g.showRules(false);
    // leave the picks and the record as they were
    g.setRules('normal', []);
    delete g.achievements.done.bareHands;
    delete g.achievements.done.untouched;
    g.achievements.save();
  });
  assert.deepEqual([r.lockedCard, r.lockedPick], [false, []], 'locked: not offered, not taken');
  assert.equal(r.openCard, true, 'opened by 赤手空拳');
  assert.equal(r.label, '無槍');
  assert.equal(r.pads, 0, 'the pads stay empty');
  assert.equal(r.drops, 0, 'nobody drops a gun');
  assert.equal(r.fired, 0, 'the left button fires nothing');
  assert.equal(r.reload, 0, 'R reloads nothing');
  assert.deepEqual(r.hud, { weapon: '空手 BARE HANDS', ammo: '—', max: '', slot: '1空手2—' });
  assert.equal(r.guns, 0, 'no gun in either hand');
  assert.equal(r.gunsAfterPan, 0, 'none back after the pan');
  assert.equal(r.kicked, true, 'F kicks');
  assert.equal(r.executed, true, 'and F executes him dazed');
  assert.deepEqual(problems(logs), []);
});

test('正常 aims in 0.85× the time, 芭蕾 in 0.6× and scores ×1.5; 街頭 aims in 1.4× and scores ×1', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const out = {};
    for (const d of ['street', 'normal', 'ballet']) {
      window.run(1, d);
      g.player.x = 0;
      g.player.z = 3;
      const e = g.enemies.spawn('grunt', { x: 0, z: -5, ex: 0, ez: -4.9, stay: true });
      window.play(20);
      e.fireCd = 9;
      e.state = 'move';
      e.startAim();
      let steps = 0;
      while (e.state === 'aim' && steps < 400) {
        g.updatePlay(1 / 120);
        steps++;
      }
      const s0 = g.score.score;
      g.score.kill([{ label: 'THUG', pts: 100 }]);
      out[d] = { aim: steps / 120, base: e.cfg.aimTime, pts: g.score.score - s0, state: e.state };
    }
    return out;
  });
  const near = (a, b) => Math.abs(a - b) < 0.02;
  assert.ok(near(r.normal.aim, r.normal.base * 0.85), `normal aims ${r.normal.aim}`);
  assert.ok(near(r.ballet.aim, r.normal.base * 0.6), `ballet aims ${r.ballet.aim}`);
  assert.ok(near(r.street.aim, r.normal.base * 1.4), `street aims ${r.street.aim}`);
  assert.equal(r.ballet.state, 'fire');
  assert.deepEqual([r.street.pts, r.normal.pts, r.ballet.pts], [100, 100, 150]);
});

test('the title screen offers the picks, remembers them, and a run records them', async () => {
  const { page: p2, logs: l2 } = await h.open('?seed=32');
  try {
    await p2.evaluate(() => {
      window.game.frame = () => {};
    });
    await p2.click('#open-rules'); // the picks fold away under the title's rules line
    await p2.click('#difficulty-cards [data-rule="ballet"]');
    await p2.click('#variant-cards [data-rule="glassCity"]');
    await p2.click('#variant-cards [data-rule="noSlowmo"]');
    await p2.click('#variant-cards [data-rule="noSlowmo"]'); // and off again
    const shown = await p2.evaluate(() => {
      const g = window.game;
      g.render();
      const sel = (id) => [...document.querySelectorAll(`#${id} .selected`)].map((b) => b.dataset.rule);
      return { state: g.state, difficulty: sel('difficulty-cards'), variants: sel('variant-cards'), summary: document.getElementById('rules-summary').textContent };
    });
    assert.equal(shown.state, 'title', 'picking a rule does not start a run');
    assert.equal(shown.summary, '芭蕾 · 玻璃之城', 'the rules line says what is picked');
    assert.deepEqual(shown.difficulty, ['ballet']);
    assert.deepEqual(shown.variants, ['glassCity']);
    await snap(p2, 'rules-title.png');
    await p2.reload();
    await p2.waitForFunction(() => window.game && window.game.startRun);
    const run = await p2.evaluate(async () => {
      const g = window.game;
      g.frame = () => {};
      const { RecordReader } = await import('/src/replay.js');
      const { unpackRules } = await import('/src/rules.js');
      const sel = (id) => [...document.querySelectorAll(`#${id} .selected`)].map((b) => b.dataset.rule);
      const kept = { difficulty: sel('difficulty-cards'), variants: sel('variant-cards') };
      g.startRun(1);
      for (let i = 0; i < 30; i++) g.updatePlay(1 / 60);
      g.hud.update(1 / 60);
      g.render();
      const rd = new RecordReader(g.record.encode());
      return { kept, recorded: unpackRules(rd.rules), sub: document.getElementById('wave-sub').textContent, aimMul: g.ruleset.aimMul };
    });
    assert.deepEqual(run.kept, { difficulty: ['ballet'], variants: ['glassCity'] }, 'remembered after a reload');
    assert.deepEqual(run.recorded, { difficulty: 'ballet', variants: ['glassCity'] }, 'in the input record');
    assert.match(run.sub, /芭蕾 · 玻璃之城/, 'the HUD says which rules');
    assert.equal(run.aimMul, 0.6); // 芭蕾
    await snap(p2, 'rules-glass-city.png');
    await p2.evaluate(() => window.game.setRules('normal', []));
    assert.deepEqual(problems(l2), []);
  } finally {
    await p2.close();
  }
  assert.deepEqual(problems(logs), []);
});
