// The race on the Guia circuit (東望洋跑道 ②, src/race.js): now and then a
// pack of racing cars sweeps the track kerb to kerb, a moving wall. It keeps
// the map's timetable (maps.js guia `race`: the first pass, then every so
// often, in world time), and RACE.warn s before each pass the lights turn red
// and a line glows along the road. An enemy on the road is run down: dead, a
// GRAND PRIX (+200). The player on the road loses RACE.damage HP, and neither
// a slide, a spin nor a dive gets under a car: only being off the road. A
// barrel on the road is sent flying. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=8'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.guia = () => g.maps.findIndex((m) => m.id === 'guia');
    /** A quiet run on the circuit: no waves, the player at (x, z), out of bullet time. */
    window.begin = (x = -2, z = 1.5) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(window.guia());
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** 120 Hz steps; `held` keys, `press` on the first; the player kept whole unless `hurt`. */
    window.play = (n, { held = [], press = [], hurt = false } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        if (!hurt) g.player.hp = 100;
        g.aimPoint.set(g.player.x + 5, g.aimPoint.y, g.player.z);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
      g.input.keys.clear();
    };
    /** Run the world until the race is `state` ('warn': the warning just came on; 'pass': the first car on the map). */
    window.until = (state, max = 120 * 60) => {
      const race = g.level.race;
      for (let i = 0; i < max; i++) {
        if (state === 'warn' && race.warning) return race.t;
        if (state === 'pass' && race.cars.some((c) => c.group.visible)) return race.t;
        window.play(1);
      }
      return null;
    };
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
  });
});
after(async () => {
  await h.close();
});

test('the cars keep the map’s timetable in world time, the warning RACE.warn s before each pass; the same seed, the same moments', async () => {
  const r = await page.evaluate(async () => {
    const { RACE } = await import('/src/config.js');
    const g = window.game;
    window.begin();
    const race = g.level.race;
    const def = g.level.map.race;
    const times = [];
    for (let k = 0; k < 2; k++) {
      const warn = window.until('warn');
      const lights = g.level.points.map((p) => p.light.color.getHexString());
      const pass = window.until('pass');
      times.push({ warn, pass, line: race.line.visible, lights });
      while (race.warning) window.play(1);
    }
    window.begin();
    const again = [window.until('warn'), window.until('pass')];
    return { times, again, first: def.first, every: def.every, warn: RACE.warn, notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('賽車')) };
  });
  const step = 1 / 120 + 1e-6;
  assert.ok(Math.abs(r.times[0].pass - r.first) <= step, `the first pass at ${r.first} s (${r.times[0].pass})`);
  assert.ok(Math.abs(r.times[0].pass - r.times[0].warn - r.warn) <= step, `warned ${r.warn} s before`);
  assert.ok(Math.abs(r.times[1].pass - r.times[0].pass - r.every) <= step, `the next ${r.every} s after the first`);
  assert.equal(r.times[0].line, true, 'a line along the road');
  assert.ok(r.times[0].lights.every((c) => c.startsWith('ff')), `the lights red: ${r.times[0].lights}`);
  assert.deepEqual(r.again, [r.times[0].warn, r.times[0].pass], 'a restart: the same moments');
  assert.ok(r.notes.length >= 1, 'the notes say the cars are coming');
  assert.deepEqual(problems(logs), []);
});

test('a man on the road is run down, GRAND PRIX +200; one off it, behind the tyre wall, lives', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const kills = [];
    const kill0 = g.score.kill.bind(g.score);
    g.score.kill = (t) => {
      kills.push(t.map((x) => `${x.label}:${x.pts}`));
      return kill0(t);
    };
    window.begin();
    window.until('warn');
    const onRoad = [window.post('grunt', 4, -9.3), window.post('grunt', 8, -11.8), window.post('grunt', 12, -6.9)];
    const off = window.post('grunt', 6, -3.8);
    for (let i = 0; i < 120 * 6 && g.level.race.warning; i++) window.play(1);
    return { dead: onRoad.map((e) => !e.alive), off: off.alive, tags: kills.flat() };
  });
  assert.deepEqual(r.dead, [true, true, true], 'all three on the road, kerb to kerb');
  assert.equal(r.off, true, 'the one behind the tyre wall lives');
  assert.equal(r.tags.filter((t) => t === 'GRAND PRIX:200').length, 3, r.tags.join(','));
  assert.deepEqual(problems(logs), []);
});

test('the player on the road loses RACE.damage HP, sliding, spinning or diving alike; off the road, nothing', async () => {
  const r = await page.evaluate(async () => {
    const { RACE } = await import('/src/config.js');
    const g = window.game;
    const p = g.player;
    /** On the road at (x, z) as the first car comes, doing `move`; how much HP the pass cost. */
    const pass = (x, z, move) => {
      window.begin(x, z);
      window.until('warn');
      p.x = x;
      p.z = z;
      const race = g.level.race;
      let lost = 0;
      for (let i = 0; i < 120 * 6 && race.warning; i++) {
        const near = race.cars.some((c) => c.group.visible && Math.hypot(c.x - p.x, c.z - p.z) < 7);
        if (near && move === 'spin' && p.spinT <= 0) window.play(1, { press: ['Space'], hurt: true });
        else if (near && move === 'dive' && p.diveT <= 0 && p.rollT <= 0) {
          g.setFocus(true);
          g.focusMeter = 1;
          window.play(1, { held: ['KeyS'], press: ['Space', 'KeyS'], hurt: true });
        } else if (near && move === 'slide' && p.slideT <= 0) {
          p.vx = 5;
          window.play(1, { held: ['KeyD'], press: ['KeyC'], hurt: true });
        } else window.play(1, { hurt: true });
        if (p.hp < 100) {
          lost = 100 - p.hp;
          break;
        }
        p.x = x;
        p.z = z;
      }
      return Math.round(lost);
    };
    return { damage: RACE.damage, still: pass(4, -9.3, null), spin: pass(4, -9.3, 'spin'), slide: pass(4, -9.3, 'slide'), dive: pass(4, -9.3, 'dive'), off: pass(4, -3.8, null) };
  });
  for (const k of ['still', 'spin', 'slide', 'dive']) assert.equal(r[k], r.damage, `${k}: ${r[k]} HP`);
  assert.equal(r.off, 0, 'off the road: nothing');
  assert.deepEqual(problems(logs), []);
});

test('a barrel on the road is sent flying', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const b = g.level.barrels.find((q) => q.kind === 'barrel' && Math.abs(q.z + 9) < 0.5); // (2, -9) on the north straight
    const at = [b.x, b.z];
    window.until('pass');
    let flew = false;
    for (let i = 0; i < 120 * 6 && g.level.race.warning; i++) {
      window.play(1);
      flew = flew || b.thrown;
    }
    return { at, flew, moved: Math.hypot(b.x - at[0], b.z - at[1]) };
  });
  assert.equal(r.flew, true);
  assert.ok(r.moved > 3, `${r.moved.toFixed(1)} m from where it stood`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the pack coming round the hairpin, the warning line on the road', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.begin(-12, 2);
    g.view = 2;
    window.until('pass');
    const race = g.level.race;
    let i = 0;
    while (i++ < 120 * 4 && !race.cars.some((c) => c.group.visible && c.x < -12)) window.play(1);
    g.present(1 / 60);
    g.updateCamera(1, true);
    g.render();
  });
  await page.screenshot({ path: new URL('guia-race.png', OUT).pathname });
});
