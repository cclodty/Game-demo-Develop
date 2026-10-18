// The end-of-run grade (街機模式 ②): the run's Style score, the waves cleared
// without a hit and a cleared run's time each give part of 100 points, and
// the total picks S, A, B, C or D. Weights and pars live in RATING
// (src/config.js); the formula is written down in docs/DECISIONS.md.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RATING } from '../src/config.js';
import { rate } from '../src/score.js';

const min = (m) => m * 60;

test('three example runs get the grades the formula promises', () => {
  // clean, fast and stylish: every part full
  const s = rate({ score: 300000, cleanWaves: 12, waves: 12, seconds: min(7.5), cleared: true });
  assert.deepEqual(s.parts, { style: 50, clean: 30, time: 20 });
  assert.equal(s.grade, 'S');

  // a solid clear: three quarters of par (37.5), half the waves clean (15), ten minutes (15)
  const b = rate({ score: 187500, cleanWaves: 6, waves: 12, seconds: min(10), cleared: true });
  assert.deepEqual(b.parts, { style: 37.5, clean: 15, time: 15 });
  assert.equal(b.total, 67.5);
  assert.equal(b.grade, 'B');

  // fell on wave 5: 50,000 points (10), one clean wave (2.5), and no time points without a clear
  const d = rate({ score: 50000, cleanWaves: 1, waves: 12, seconds: min(4), cleared: false });
  assert.deepEqual(d.parts, { style: 10, clean: 2.5, time: 0 });
  assert.equal(d.grade, 'D');
});

test('each part stops at its weight, and the grades change at their thresholds', () => {
  const top = rate({ score: 1e9, cleanWaves: 99, waves: 12, seconds: 1, cleared: true });
  assert.equal(top.total, RATING.style + RATING.clean + RATING.time);
  const slow = rate({ score: 0, cleanWaves: 0, waves: 12, seconds: min(60), cleared: true });
  assert.equal(slow.total, 0);
  assert.equal(slow.grade, 'D');
  // a cleared run worth `total` points: time first, then clean waves, the rest from style
  const run = (total) => {
    const time = Math.min(RATING.time, total);
    const clean = Math.min(RATING.clean, total - time);
    const style = total - time - clean;
    return rate({
      score: (style / RATING.style) * RATING.stylePar,
      cleanWaves: (clean / RATING.clean) * 12,
      waves: 12,
      seconds: RATING.timeSlow - (time / RATING.time) * (RATING.timeSlow - RATING.timePar),
      cleared: true,
    });
  };
  for (const [grade, at] of RATING.grades) {
    assert.equal(run(at + 0.01).grade, grade, `just over ${at} points`);
    assert.notEqual(run(at - 0.01).grade, grade, `just under ${at} points`);
  }
  assert.equal(run(RATING.grades.at(-1)[1] - 0.01).grade, 'D');
});
