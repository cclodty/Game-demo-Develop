// Arcade mode. The title screen offers arcade (the default) or endless, and
// picking one does not start a run. A god-mode bot plays a whole arcade run:
// the map changes after waves 4 and 8, wave 12 is bigger than the waves
// before, and the run ends on RUN CLEAR with the time, kills, best combo and
// waves without damage. Endless keeps the old rhythm: a new map every three
// waves, the old wave sizes, no end.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=5'));
  await installGradeReader();
});
after(async () => {
  await h.close();
});

const titleState = () =>
  page.evaluate(() => ({
    mode: window.game.mode,
    state: window.game.state,
    selected: [...document.querySelectorAll('#mode-cards .mode-card.selected')].map((c) => c.dataset.mode),
    note: document.getElementById('maps-note').textContent,
    stored: localStorage.getItem('bullet-ballet.mode'),
  }));

/** Record stage changes, wave sizes and maps; keep the player standing (no hit can drop 100 HP to 0). */
async function watchRun() {
  await page.evaluate(() => {
    const g = window.game;
    const run = (window.run = { stages: [], sizes: [], maps: [g.level.map.id], start: g.notes.events[0].text });
    const begin0 = g.beginStageTransition.bind(g);
    g.beginStageTransition = () => {
      run.stages.push(g.waves.wave);
      return begin0();
    };
    const compose0 = g.waves.compose.bind(g.waves);
    g.waves.compose = (n) => {
      const list = compose0(n);
      run.sizes.push(list.length);
      return list;
    };
    const load0 = g.level.load.bind(g.level);
    g.level.load = (m) => {
      run.maps.push(m.id);
      return load0(m);
    };
    const hurt0 = g.player.hurt.bind(g.player);
    g.player.hurt = (...a) => {
      const hit = hurt0(...a);
      g.player.hp = 100;
      return hit;
    };
  });
}

/** Define window.gradeShown() in the page: what the end screen shows of the grade. */
async function installGradeReader() {
  await page.evaluate(() => {
    window.gradeShown = () => {
      const box = document.querySelector('#gameover .go-grade');
      return {
        gradeVisible: !document.getElementById('gameover').classList.contains('hidden') && window.getComputedStyle(box).display !== 'none',
        grade: document.getElementById('go-grade').textContent,
        parts: [...document.querySelectorAll('#go-parts > div')].map((d) => [d.dataset.part, d.querySelector('b').textContent]),
        hint: document.getElementById('go-hint').textContent,
        gradeLogged: (window.game.notes.events.findLast((e) => e.text.startsWith('評級')) || { text: '' }).text,
      };
    };
  });
}

/** The grade the formula gives for the run on screen. */
const expectedGrade = (cleared) =>
  page.evaluate(async (cleared) => {
    const { rate } = await import('/src/score.js');
    const g = window.game;
    return rate({ score: g.score.score, cleanWaves: g.waves.cleanWaves, waves: 12, seconds: g.stepCount / 120, cleared });
  }, cleared);

const partTexts = (want) => [
  ['style', `${Math.round(want.parts.style)} / 50`],
  ['clean', `${Math.round(want.parts.clean)} / 30`],
  ['time', `${Math.round(want.parts.time)} / 20`],
];

/** Play 10 s chunks until `done` (evaluated in the page) holds, or the cap. */
async function playUntil(done, maxChunks) {
  for (let c = 0; c < maxChunks; c++) {
    const ok = await page.evaluate(() => window.simStep(600));
    if (!ok || (await page.evaluate(done))) return;
  }
}

test('the title screen offers arcade (the default) and endless; picking one does not start a run', async () => {
  const first = await titleState();
  assert.equal(first.state, 'title');
  assert.equal(first.mode, 'arcade', 'arcade is the default');
  assert.deepEqual(first.selected, ['arcade']);
  assert.match(first.note, /每 4 波換一個場景，第 12 波完結/);
  await snap(page, 'arcade-title.png');

  await page.click('.mode-card[data-mode=endless]');
  const endless = await titleState();
  assert.deepEqual([endless.state, endless.mode, endless.selected, endless.stored], ['title', 'endless', ['endless'], 'endless']);
  assert.equal(endless.note, '每 3 波換一個場景');

  await page.click('.mode-card[data-mode=arcade]');
  const arcade = await titleState();
  assert.deepEqual([arcade.state, arcade.mode, arcade.stored], ['title', 'arcade', 'arcade']);
});

test('a god-mode bot plays an arcade run to the RUN CLEAR screen', { timeout: 15 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 3, mode: 'arcade', restart: false });
  await watchRun();
  await playUntil(() => window.game.state === 'over', 120);
  const r = await page.evaluate(() => {
    const g = window.game;
    const text = (id) => document.getElementById(id).textContent;
    const shown = [...document.querySelectorAll('#gameover .go-stats > div')].filter((d) => window.getComputedStyle(d).display !== 'none');
    return {
      ...window.gradeShown(),
      ...window.run,
      errors: window.stats.errors,
      state: g.state,
      wave: g.waves.wave,
      seconds: g.stepCount / 120,
      kills: g.score.kills,
      maxCombo: g.score.maxCombo,
      clean: g.waves.cleanWaves,
      screen: !document.getElementById('gameover').classList.contains('hidden'),
      onScreen: document.getElementById('gameover').classList.contains('cleared'),
      title: text('go-title'),
      stats: shown.map((d) => [d.querySelector('span').textContent, d.querySelector('b').textContent]),
      cleared: g.notes.events.some((e) => e.text.includes('通關（RUN CLEAR）')),
    };
  });
  await snap(page, 'arcade-clear.png');
  console.log(`arcade: ${r.wave} waves in ${(r.seconds / 60).toFixed(1)} min, maps ${r.maps.join(' → ')}, wave sizes ${r.sizes.join(' ')}, ${r.kills} kills, ${r.clean} clean`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.state, 'over', `the run did not end (wave ${r.wave})`);
  assert.equal(r.wave, 12);
  assert.deepEqual(r.stages, [4, 8], 'the map changes after waves 4 and 8');
  assert.deepEqual(r.maps, ['rooftop', 'club', 'docks']);
  assert.ok(r.sizes[11] > r.sizes[10], `the final wave is the big one: ${r.sizes.join(' ')}`);
  assert.deepEqual([r.screen, r.onScreen, r.title], [true, true, 'RUN CLEAR']);
  const m = Math.floor(r.seconds / 60);
  const time = `${m}:${String(Math.floor(r.seconds % 60)).padStart(2, '0')}`;
  assert.deepEqual(r.stats, [
    ['用時', time],
    ['擊殺', String(r.kills)],
    ['最高連擊', `x${Math.max(1, r.maxCombo)}`],
    ['無傷波數', `${r.clean} / 12`],
  ]);
  assert.ok(r.start.startsWith('開局：霓虹天台（街機'), r.start);
  assert.ok(r.cleared, 'the feedback log records the clear');
  // the grade: what the formula gives for this run's numbers, its three parts, and a hint
  const want = await expectedGrade(true);
  console.log(`arcade grade: ${r.grade} (${want.total.toFixed(1)} points: style ${want.parts.style.toFixed(1)}, clean ${want.parts.clean.toFixed(1)}, time ${want.parts.time.toFixed(1)})`);
  assert.equal(r.gradeVisible, true);
  assert.equal(r.grade, want.grade);
  assert.deepEqual(r.parts, partTexts(want));
  assert.ok(r.hint.startsWith('下次：'), r.hint);
  assert.ok(r.gradeLogged.startsWith(`評級 ${want.grade}（`), r.gradeLogged);
  assert.deepEqual(problems(logs), []);
});

test('an arcade run that falls is graded too, with no time points and a hint to get further', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    g.startRun(0);
    const p = g.player;
    delete p.hurt; // watchRun's god mode
    p.invuln = 0;
    p.spinT = 0;
    p.hurt(500, 0, 1);
    for (let i = 0; i < 600 && g.state !== 'over'; i++) g.updatePlay(1 / 60);
  });
  const r = await page.evaluate(() => ({ state: window.game.state, ...window.gradeShown() }));
  assert.equal(r.state, 'over');
  const want = await expectedGrade(false);
  assert.equal(want.parts.time, 0);
  assert.equal(r.gradeVisible, true);
  assert.equal(r.grade, want.grade);
  assert.deepEqual(r.parts, partTexts(want));
  assert.equal(r.hint, '下次：撐到第 12 波，通關才有用時分');
  await snap(page, 'arcade-fell.png');
  assert.deepEqual(problems(logs), []);
});

test('endless keeps the old rhythm: a new map every three waves, the old wave sizes, no end', { timeout: 15 * 60 * 1000 }, async () => {
  await installBot(page, { map: 1, view: 2, seed: 4, mode: 'endless', restart: false });
  await watchRun();
  await playUntil(() => window.game.waves.wave >= 7, 80);
  const r = await page.evaluate(() => {
    const g = window.game;
    g.hud.update(1 / 60);
    return { ...window.run, errors: window.stats.errors, state: g.state, wave: g.waves.wave, label: document.getElementById('wave-label').textContent };
  });
  console.log(`endless: wave ${r.wave}, maps ${r.maps.join(' → ')}, wave sizes ${r.sizes.join(' ')}`);
  assert.deepEqual(r.errors, []);
  assert.equal(r.state, 'playing');
  assert.ok(r.wave >= 7, `only reached wave ${r.wave}`);
  assert.deepEqual(r.stages, [3, 6]);
  assert.deepEqual(r.maps, ['club', 'docks', 'senado']);
  r.sizes.forEach((n, i) => assert.equal(n, 3 + Math.floor((i + 1) * 1.7), `wave ${i + 1} size`));
  assert.equal(r.label, `WAVE ${r.wave}`, 'no "/ 12" in endless');
  // endless has no end to grade: its game over shows no grade
  await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    delete p.hurt; // watchRun's god mode
    p.invuln = 0;
    p.spinT = 0;
    p.hurt(500, 0, 1);
    for (let i = 0; i < 600 && g.state !== 'over'; i++) g.updatePlay(1 / 60);
  });
  const over = await page.evaluate(() => ({ state: window.game.state, ...window.gradeShown() }));
  assert.equal(over.state, 'over');
  assert.equal(over.gradeVisible, false, 'no grade in endless');
  assert.deepEqual(problems(logs), []);
});
