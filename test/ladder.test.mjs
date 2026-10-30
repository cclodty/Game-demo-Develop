// F⑥a: the ladder (src/rules.js LADDER). A cleared 彈幕 run opens the first level, a run cleared at level n opens
// n + 1, kept in this browser; the title shows the levels opened and nothing before a first clear; the pick plays
// under its one change (level 10 all of them): men 10% tougher, focus refilling slower, a boss a phase more, no red
// lines, two affixes in every room, two cards to pick from, no lives to be won, rounds 10% faster, no gap guarantee.
// The level goes into the input record (its mode byte), so a replay plays it again. (The test that reloads the page
// comes last: a reload takes the helpers away.) Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { InputRecord, RecordReader } from '../src/replay.js';
import { BASE, LADDER, LADDER_TOP, ladderReached, openLadder, rulesFor, rulesLabel } from '../src/rules.js';
import { StepInput } from '../src/input.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

/** A stand-in for localStorage. */
function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('ten levels, each one change of the rules (its own only), the tenth all nine; the label names the level', () => {
  assert.equal(LADDER.length, 10);
  assert.equal(LADDER_TOP, 10);
  const changed = (lv) => Object.keys(BASE).filter((k) => rulesFor('normal', [], lv)[k] !== rulesFor('normal', [], 0)[k]);
  const each = LADDER.slice(0, 9).map((_, i) => changed(i + 1));
  each.forEach((keys, i) => assert.equal(keys.length, 1, `level ${i + 1} changes one rule: ${keys}`));
  assert.equal(new Set(each.flat()).size, 9, 'nine different rules');
  assert.deepEqual(changed(10).sort(), each.flat().sort(), 'the tenth: all of them');
  const r = rulesFor('normal', [], 4);
  assert.deepEqual([r.ladder, r.lasers, r.label], [4, false, '階梯 4']);
  assert.equal(rulesLabel('ballet', ['glassCity'], 2), '芭蕾 · 玻璃之城 · 階梯 2');
  assert.equal(rulesFor('normal', [], 99).ladder, 10, 'no level past the top');
});

test('a clear opens the next level, kept; one already open opens nothing; none past the top', () => {
  const st = store();
  assert.equal(ladderReached(st), 0, 'none before a first clear');
  assert.equal(openLadder(0, st), 1, 'a first clear: level 1');
  assert.equal(ladderReached(st), 1);
  assert.equal(openLadder(0, st), 0, 'cleared again without the ladder: nothing new');
  assert.equal(openLadder(1, st), 2);
  assert.equal(openLadder(9, st), 10);
  assert.equal(openLadder(10, st), 0, 'nothing past the top');
  assert.equal(ladderReached(st), 10);
});

test('the input record keeps the level in its mode byte; a record from before reads as none', () => {
  const rec = new InputRecord({ seed: 5, map: 0, mode: 4, warmup: true, rules: 3, ladder: 7, mapsRev: 9 });
  for (let i = 0; i < 4; i++) rec.push(new StepInput());
  const rd = new RecordReader(rec.encode());
  assert.deepEqual([rd.mode, rd.ladder, rd.warmup, rd.rules], [4, 7, true, 3]);
  const old = new InputRecord({ seed: 5, map: 0, mode: 4, warmup: false, rules: 3, mapsRev: 9 });
  old.push(new StepInput());
  const rd0 = new RecordReader(old.encode());
  assert.deepEqual([rd0.mode, rd0.ladder], [4, 0]);
});

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=31'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕 run at ladder level `lv`, in its first room, quiet. */
    window.toRun = (lv = 0) => {
      g.setRules('normal', [], lv);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.challenge.offer = null;
      g.enemies.clear();
      g.bullets.clear();
    };
  });
});
after(async () => {
  await h.close();
});

test('each level’s change in play, none without it: tougher men, slower focus, a boss phase more, no red line, two affixes on the first floor, two cards, no lives, faster rounds, no gap guarantee; level 10 all', async () => {
  const r = await page.evaluate(async () => {
    const { HELL } = await import('./src/config.js');
    const g = window.game;
    localStorage.setItem('bullet-ballet.ladder', '10');
    const at = (lv) => {
      const out = {};
      window.toRun(lv);
      out.ladder = g.ruleset.ladder;
      const man = g.enemies.spawn('grunt', { x: 3, z: 0, ex: 3, ez: 0.1, stay: true });
      out.hp = man.hp;
      // focus refilling for a second
      g.focusMeter = 0.2;
      for (let i = 0; i < 120; i++) g.updatePlay(1 / 120);
      out.regen = g.focusMeter - 0.2;
      // his red line while he aims
      man.spawnLock = 0;
      man.state = 'aim';
      man.updateLaser();
      out.laser = man.laser.mesh.visible;
      // the gap: refused this beat already, he waits (none without the guarantee)
      man.gapBeat = Math.floor(g.worldTime / HELL.beat);
      out.gapWaits = !man.gapAllows();
      g.enemies.clear();
      // the first floor's second room's affixes
      out.affixes = g.waves.affixesFor(1).length;
      out.offer = g.cards.offerSize;
      out.life = g.challenge.addLife();
      out.speed = g.bullets.spawn({ x: 0, z: 0, dx: 1, dz: 0, speed: 10, owner: 'enemy', damage: 1 }).speed;
      g.bullets.clear();
      // the floor's boss: its bar's segments
      g.waves.state = 'done';
      g.floors[0][g.floors[0].length - 1] = 'arena';
      g.floor = g.floors.flat();
      g.stage = g.floors[0].length - 1;
      g.level.load(g.stageMap);
      g.waves.wave = (g.stage + 1) * g.waves.rules.perStage - 1;
      g.waves.startWave();
      out.segments = g.boss.segments;
      g.enemies.clear();
      return out;
    };
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(at);
  });
  const [base] = r;
  const lv = (n) => r[n];
  assert.deepEqual(r.map((x) => x.ladder), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // what each level changes, against no ladder
  assert.ok(Math.abs(lv(1).hp / base.hp - 1.1) < 1e-9, `1: men's health ×1.1 (${base.hp} → ${lv(1).hp})`);
  assert.ok(lv(2).regen > 0 && Math.abs(lv(2).regen / base.regen - 0.6) < 0.02, `2: focus refills ×0.6 (${base.regen} → ${lv(2).regen})`);
  assert.equal(lv(3).segments, base.segments + 1, '3: a boss phase more');
  assert.deepEqual([base.laser, lv(4).laser], [true, false], '4: no red line');
  assert.deepEqual([base.affixes, lv(5).affixes], [0, 2], '5: two affixes in a first-floor room');
  assert.deepEqual([base.offer, lv(6).offer], [3, 2], '6: two cards');
  assert.deepEqual([base.life, lv(7).life], [true, false], '7: no life won');
  assert.ok(Math.abs(lv(8).speed / base.speed - 1.1) < 1e-9, `8: rounds ×1.1 (${base.speed} → ${lv(8).speed})`);
  assert.deepEqual([base.gapWaits, lv(9).gapWaits], [true, false], '9: no gap guarantee');
  // a level changes only its own: level 1 leaves the rest as it was
  assert.deepEqual([lv(1).laser, lv(1).affixes, lv(1).offer, lv(1).life, lv(1).speed, lv(1).gapWaits, lv(1).segments], [true, 0, 3, true, base.speed, true, base.segments]);
  // the tenth: all of them
  const all = lv(10);
  assert.ok(Math.abs(all.hp / base.hp - 1.1) < 1e-9 && all.regen < base.regen && all.segments === base.segments + 1 && !all.laser && all.affixes === 2 && all.offer === 2 && !all.life && Math.abs(all.speed / base.speed - 1.1) < 1e-9 && !all.gapWaits, `10: everything (${JSON.stringify(all)})`);
  assert.deepEqual(problems(logs), []);
});

test('a replay plays the level the run was played at', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    localStorage.setItem('bullet-ballet.ladder', '10');
    window.toRun(6);
    for (let i = 0; i < 30; i++) g.updatePlay(1 / 120);
    const bytes = g.record.encode();
    g.setRules('normal', [], 0);
    const err = g.playReplay(bytes, { name: 'test' });
    const during = g.ruleset.ladder;
    g.toTitle();
    return { err, during, after: g.ladder };
  });
  assert.ok(!r.err, `played: ${r.err}`);
  assert.equal(r.during, 6, 'the replay at level 6');
  assert.equal(r.after, 0, 'the title’s own pick untouched');
});

test('in the game: no ladder before a clear; a cleared run opens level 1 (the end screen says so) and the title shows it after a reload; screenshots', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    localStorage.removeItem('bullet-ballet.ladder');
    g.setRules('normal', [], 3);
    const clamped = g.ladder;
    const row = !document.getElementById('ladder-row').classList.contains('hidden');
    window.toRun(0);
    g.onRunClear(28);
    for (let i = 0; i < 120 * 4 && g.state !== 'over'; i++) g.updatePlay(1 / 120);
    for (const id of ['replays', 'title']) document.getElementById(id).classList.add('hidden');
    const el = document.getElementById('go-ladder');
    return { clamped, row, opened: g.ladderOpened, state: g.state, text: el.textContent, shown: getComputedStyle(el.parentElement).display !== 'none', stored: localStorage.getItem('bullet-ballet.ladder'), notes: g.notes.events.map((e) => e.text).filter((t) => t.startsWith('解鎖階梯')) };
  });
  assert.equal(r.clamped, 0, 'no level to pick before a clear');
  assert.equal(r.row, false, 'the title shows no ladder yet');
  assert.deepEqual([r.opened, r.state, r.stored], [1, 'over', '1']);
  assert.ok(r.shown && r.text.includes('階梯第 1 級'), `the end screen: ${r.text}`);
  assert.equal(r.notes.length, 1);
  await page.screenshot({ path: new URL('ladder-end.png', OUT).pathname });
  await page.reload();
  await page.waitForFunction(() => window.game && window.game.startRun);
  const t = await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    for (const id of ['gameover', 'replays']) document.getElementById(id).classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    g.showRules(true);
    g.setRules('normal', [], 1);
    const cards = [...document.querySelectorAll('#ladder-cards .mode-card')].filter((c) => !c.classList.contains('hidden')).map((c) => c.dataset.rule);
    return { ladder: g.ladder, row: !document.getElementById('ladder-row').classList.contains('hidden'), cards, summary: document.getElementById('rules-summary').textContent };
  });
  assert.deepEqual([t.ladder, t.row], [1, true], 'level 1 picked after the reload');
  assert.deepEqual(t.cards, ['0', '1'], 'none and level 1 shown, not the rest');
  assert.match(t.summary, /階梯第 1 級/);
  await page.evaluate(() => document.getElementById('ladder-row').scrollIntoView());
  await page.screenshot({ path: new URL('ladder-title.png', OUT).pathname });
  await page.evaluate(() => window.game.showRules(false));
  assert.deepEqual(problems(logs), []);
});
