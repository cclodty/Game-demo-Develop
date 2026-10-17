// The input record (src/replay.js): what goes in comes back out, step by
// step, with the header intact; long still stretches cost nothing; a control
// the record does not know about fails loudly instead of reading as "up".
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIM_Q, BUTTONS, StepInput, YAW_Q } from '../src/input.js';
import { InputRecord, RecordReader } from '../src/replay.js';
import { Rng } from '../src/rng.js';

/** A plausible run's inputs: keys held for a while, presses now and then, an aim that drifts and jumps, a camera swing. */
function script(n, seed) {
  const r = new Rng(seed);
  const out = [];
  const c = new StepInput();
  for (let i = 0; i < n; i++) {
    if (r.next() < 0.02) c.keys = r.int(0, (1 << BUTTONS.length) - 1);
    c.pressed = r.next() < 0.03 ? 1 << r.int(0, BUTTONS.length - 1) : 0;
    if (i % 2 === 0 && r.next() < 0.8) {
      const big = r.next() < 0.05;
      c.aimQX += big ? r.int(-4000, 4000) : r.int(-9, 9);
      c.aimQZ += big ? r.int(-4000, 4000) : r.int(-9, 9);
    }
    if (i > n / 2 && i < n / 2 + 60) c.yawQ = Math.round(-0.785 * YAW_Q * ((i - n / 2) / 60));
    if (i > n * 0.7 && i < n * 0.8) c.keys = c.pressed = 0; // a still stretch
    out.push({ keys: c.keys, pressed: c.pressed, aimQX: c.aimQX, aimQZ: c.aimQZ, yawQ: c.yawQ });
  }
  return out;
}

test('every step reads back exactly as it was recorded, with the header', () => {
  const steps = script(20000, 5);
  const rec = new InputRecord({ seed: 123, map: 3, hz: 120 });
  for (const s of steps) rec.push(Object.assign(new StepInput(), s));
  const bytes = rec.encode();
  assert.equal(bytes.length, rec.size);
  const rd = new RecordReader(bytes);
  assert.deepEqual([rd.seed, rd.map, rd.hz, rd.steps], [123, 3, 120, steps.length]);
  for (let i = 0; i < steps.length; i++) {
    const c = rd.next(10, -4);
    const s = steps[i];
    assert.deepEqual([c.keys, c.pressed, c.aimQX, c.aimQZ, c.yawQ], [s.keys, s.pressed, s.aimQX, s.aimQZ, s.yawQ], `step ${i}`);
    assert.equal(c.aim.x, 10 + s.aimQX / AIM_Q);
    assert.equal(c.yaw, s.yawQ / YAW_Q);
  }
  assert.equal(rd.next(0, 0), null, 'no steps past the end');
});

test('still stretches cost nothing, and the trailing ones need no bytes at all', () => {
  const rec = new InputRecord();
  const c = new StepInput();
  c.keys = 1;
  rec.push(c);
  const after1 = rec.size;
  c.pressed = 0;
  for (let i = 0; i < 100000; i++) rec.push(c);
  assert.equal(rec.size, after1, 'unchanged steps add nothing');
  const rd = new RecordReader(rec.encode());
  let n = 0;
  while (rd.next(0, 0)) n++;
  assert.equal(n, 100001);
});

test('controls: held and pressed read by name; an unknown one throws', () => {
  const c = new StepInput();
  c.keys = 1 << BUTTONS.indexOf('KeyD');
  c.pressed = 1 << BUTTONS.indexOf('Space');
  c.resolve(0, 0);
  assert.equal(c.down('KeyD', 'ArrowRight'), true);
  assert.equal(c.down('KeyA'), false);
  assert.equal(c.hit('Space'), true);
  assert.equal(c.hit('KeyF'), false);
  assert.throws(() => c.hit('KeyT'), /not a recorded control/);
  assert.ok(BUTTONS.length <= 31, 'the bits fit a 32-bit integer');
});

test('a record that is not one, or from another version, is refused', () => {
  assert.throws(() => new RecordReader(new Uint8Array(13)), /not an input record/);
  const bytes = new InputRecord().encode();
  bytes[2] = 99;
  assert.throws(() => new RecordReader(bytes), /version 99/);
});
