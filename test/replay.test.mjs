// The input record (src/replay.js): what goes in comes back out, step by
// step, with the header intact (the maps' revision and the unlock table too; a version 5 or 4 record,
// from before it, still reads); long still stretches cost nothing; a control
// the record does not know about fails loudly instead of reading as "up".
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIM_Q, BUTTONS, StepInput, YAW_Q } from '../src/input.js';
import { MAPS, MAPS_REV, PLAY_REV } from '../src/maps.js';
import { ROOMS } from '../src/rooms.js';
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
  const rec = new InputRecord({ seed: 123, map: 3, mode: 1, warmup: true, rules: 0x16, hz: 120 });
  for (const s of steps) rec.push(Object.assign(new StepInput(), s));
  const bytes = rec.encode();
  assert.equal(bytes.length, rec.size);
  const rd = new RecordReader(bytes);
  assert.deepEqual([rd.seed, rd.map, rd.mode, rd.warmup, rd.rules, rd.hz, rd.steps], [123, 3, 1, true, 0x16, 120, steps.length]);
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

test('the header keeps the game’s revision (maps.js MAPS_REV: the maps’ and the play rules’) and the unlock table (F⑥b); a version 5 record, from before the table, and a version 4, from before the revision, still read, step for step, the table all open and the revision unknown', () => {
  const steps = script(3000, 9);
  const rec = new InputRecord({ seed: 7, map: 6, mode: 0, rules: 0, unlocks: 0x2a5, hz: 120, mapsRev: MAPS_REV });
  for (const s of steps) rec.push(Object.assign(new StepInput(), s));
  const bytes = rec.encode();
  const rd = new RecordReader(bytes);
  assert.equal(rd.version, 6);
  assert.equal(rd.mapsRev, MAPS_REV);
  assert.equal(rd.unlocks, 0x2a5);
  assert.equal(MAPS_REV, (MAPS.reduce((s, m) => s + m.rev, 0) + Object.values(ROOMS).reduce((s, m) => s + m.rev, 0) + PLAY_REV) % 256, 'the sum of every map’s (and room’s: rooms.js) rev and the play revision');
  assert.ok(MAPS.every((m) => Number.isInteger(m.rev) && m.rev >= 1), 'every map has a revision');
  // the same record as version 5 wrote it (no table: 4 bytes fewer), and as version 4 (no revision byte either)
  const v5 = new Uint8Array(bytes.length - 4);
  v5.set(bytes.subarray(0, 16));
  v5.set(bytes.subarray(20), 16);
  v5[2] = 5;
  const v4 = new Uint8Array(bytes.length - 5);
  v4.set(bytes.subarray(0, 15));
  v4.set(bytes.subarray(20), 15);
  v4[2] = 4;
  for (const [old, version, rev] of [[new RecordReader(v5), 5, MAPS_REV], [new RecordReader(v4), 4, null]]) {
    assert.deepEqual([old.version, old.mapsRev, old.unlocks, old.seed, old.map, old.steps], [version, rev, null, 7, 6, steps.length]);
    for (let i = 0; i < steps.length; i++) {
      const c = old.next(0, 0);
      assert.deepEqual([c.keys, c.pressed, c.aimQX, c.aimQZ, c.yawQ], [steps[i].keys, steps[i].pressed, steps[i].aimQX, steps[i].aimQZ, steps[i].yawQ], `version ${version}, step ${i}`);
    }
  }
});

test('a record that is not one, or from another version, is refused', () => {
  assert.throws(() => new RecordReader(new Uint8Array(14)), /not an input record/);
  const bytes = new InputRecord().encode();
  bytes[2] = 99;
  assert.throws(() => new RecordReader(bytes), /version 99/);
});
