// The seeded RNG (src/rng.js): same seed, same numbers; bounds hold; ?seed=
// text maps to a stable seed. The first numbers for seed 123 are pinned: a
// different generator would quietly change every seeded run (and, later,
// every saved replay and daily challenge).
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomSeed, Rng, seedFrom, vfxRng } from '../src/rng.js';

const draw = (r, n) => Array.from({ length: n }, () => r.next());

test('the same seed gives the same numbers, and reset starts them again', () => {
  const a = new Rng(123);
  const b = new Rng(123);
  assert.deepEqual(draw(a, 50), draw(b, 50));
  assert.notDeepEqual(draw(new Rng(124), 50), draw(new Rng(123), 50));
  a.reset(123);
  assert.deepEqual(draw(a, 3), [0.7872516233474016, 0.1785435655619949, 0.49531551403924823]);
  assert.equal(a.seed, 123);
});

test('range, int and pick stay inside their bounds and reach both ends of an int range', () => {
  const r = new Rng(7);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const f = r.next();
    assert.ok(f >= 0 && f < 1);
    const x = r.range(-2, 3);
    assert.ok(x >= -2 && x < 3);
    const n = r.int(1, 4);
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 4);
    seen.add(n);
    assert.ok(['a', 'b', 'c'].includes(r.pick(['a', 'b', 'c'])));
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4]);
});

test('?seed= takes a number as it is and hashes any other text', () => {
  assert.equal(seedFrom('123'), 123);
  assert.equal(seedFrom(' 42 '), 42);
  assert.equal(seedFrom('daily-2026-10-17'), seedFrom('daily-2026-10-17'));
  assert.notEqual(seedFrom('daily-2026-10-17'), seedFrom('daily-2026-10-18'));
  for (const s of ['abc', '99999999999', 'daily-2026-10-17']) {
    const v = seedFrom(s);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 2 ** 32, `${s} → ${v}`);
  }
});

test('unseeded runs get different seeds, and the effects RNG is its own generator', () => {
  const seeds = new Set(Array.from({ length: 20 }, randomSeed));
  assert.equal(seeds.size, 20);
  assert.ok(vfxRng instanceof Rng);
});
