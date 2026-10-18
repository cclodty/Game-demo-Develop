// The live Style rank (D to SSS) in the top-right corner. Kills and style
// moves push it up, the same move straight after itself gains half as much
// each time and a different one gains in full again, a hit drops a rank and
// five idle seconds start a slide. The score itself is untouched: every kill
// tag is worth what it was. The first tests drive Score directly in node; the
// last one checks the HUD in the game. Run: npm test
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { RANK } from '../src/config.js';
import { rulesFor } from '../src/rules.js';
import { Score } from '../src/score.js';
import { gameHarness, problems, snap } from './helpers.mjs';

/** A Score with the game around it stubbed out. */
function score() {
  const logs = [];
  const game = { mode: 'arcade', ruleset: rulesFor(), hud: { feedKill() {}, feed() {} }, audio: { combo() {} }, notes: { log: (t) => logs.push(t) } };
  const s = new Score(game);
  s.logs = logs;
  return s;
}

const thug = { label: 'THUG', pts: 100 };
const kill = (s, ...moves) => s.kill([thug, ...moves]);
const SLOWMO = { label: 'SLOW-MO', pts: 50 };
const KICK = { label: 'KICK', pts: 150 };
const JUGGLE = { label: 'JUGGLE', pts: 120 };

test('three different style kills take the rank from D to B', () => {
  const s = score();
  assert.equal(s.rank.name, 'D');
  kill(s, SLOWMO);
  kill(s, KICK);
  kill(s, JUGGLE);
  assert.equal(s.rank.name, 'B');
});

test('the same move three times in a row: the third gains a quarter of the first; a different move gains in full again', () => {
  const s = score();
  const gains = [];
  for (let i = 0; i < 3; i++) {
    kill(s, KICK);
    gains.push(s.rank.lastGain);
  }
  assert.equal(gains[0], RANK.move);
  assert.equal(gains[1], gains[0] / 2);
  assert.equal(gains[2], gains[0] / 4);
  kill(s, JUGGLE);
  assert.equal(s.rank.lastGain, RANK.move, 'a different move gains in full');
  kill(s, KICK);
  assert.equal(s.rank.lastGain, RANK.move, 'and so does the first move once something else came between');
  // style bonuses count as moves too, by their points
  s.style('DODGE', 40);
  assert.equal(s.rank.lastGain, 40 * RANK.perPoint);
});

test('a hit drops one rank; five idle seconds start the slide', () => {
  const s = score();
  kill(s, SLOWMO);
  kill(s, KICK);
  kill(s, JUGGLE);
  const before = s.rank.value;
  s.rank.hit();
  assert.equal(s.rank.name, 'C');
  assert.equal(s.rank.value, before - 1);
  // idle: nothing for 5 s, then a steady drain (logic steps of 1/120 s)
  const v = s.rank.value;
  for (let i = 0; i < 5 * 120 - 1; i++) s.update(1 / 120, 1 / 120);
  assert.equal(s.rank.value, v, 'no drain inside the first five seconds');
  for (let i = 0; i < 120; i++) s.update(1 / 120, 1 / 120);
  assert.ok(s.rank.value < v - RANK.drain * 0.9, `drained to ${s.rank.value}`);
  // a gain stops the slide and restarts the five seconds
  kill(s, KICK);
  const w = s.rank.value;
  for (let i = 0; i < 4 * 120; i++) s.update(1 / 120, 1 / 120);
  assert.equal(s.rank.value, w);
});

test('the rank never changes the score: each kill adds its tags times the combo, as before', () => {
  const s = score();
  kill(s, KICK); // combo 1
  assert.equal(s.score, 250);
  kill(s, KICK); // combo 2: the repeat gains less rank, not fewer points
  assert.equal(s.score, 250 + 250 * 2);
  kill(s, KICK, JUGGLE); // combo 3
  assert.equal(s.score, 750 + 370 * 3);
  // reaching S is worth a line in the feedback log; lower ranks are not
  for (let i = 0; i < 6; i++) kill(s, [SLOWMO, KICK, JUGGLE][i % 3]);
  assert.ok(s.rank.index >= 4, `rank ${s.rank.name}`);
  assert.deepEqual(
    s.logs.filter((l) => l.startsWith('Style')),
    RANK.names.slice(4, s.rank.index + 1).map((n) => `Style 評級升到 ${n}`),
  );
});

let h;
after(async () => {
  if (h) await h.close();
});

test('the HUD shows the rank in the top-right corner and animates each change', { timeout: 120000 }, async () => {
  h = await gameHarness();
  const { page, logs } = await h.open();
  try {
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(300);
    const look = (moves) =>
      page.evaluate((moves) => {
        const g = window.game;
        g.frame = () => {};
        g.enemies.clear();
        for (const m of moves) {
          if (m === 'hit') g.score.rank.hit();
          else g.score.kill([{ label: 'THUG', pts: 100 }, { label: m, pts: 100 }]);
        }
        g.hud.update(1 / 60);
        g.render();
        const el = document.getElementById('rank');
        const letter = document.getElementById('rank-letter');
        const r = el.getBoundingClientRect();
        return { letter: letter.textContent, data: el.dataset.rank, anims: letter.getAnimations().length, fill: document.getElementById('rank-fill').style.width, right: innerWidth - r.right, top: r.top };
      }, moves);
    const d = await look([]);
    assert.equal(d.letter, 'D');
    assert.ok(d.top < 40 && d.right < 260, `top-right: ${d.top}, ${d.right} from the right`);
    const b = await look(['SLOW-MO', 'KICK', 'JUGGLE']);
    assert.deepEqual([b.letter, b.data], ['B', 'B']);
    assert.ok(b.anims > 0, 'climbing animates');
    await page.waitForTimeout(400); // let the pop settle for the picture
    await snap(page, 'rank-b.png');
    const s = await look(['RICOCHET', 'PIROUETTE', 'SCATTER']);
    assert.equal(s.letter, 'S');
    await page.waitForTimeout(400);
    await snap(page, 'rank-s.png');
    const a = await look(['hit']);
    assert.equal(a.letter, 'A');
    assert.ok(a.anims > 0, 'falling animates');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
