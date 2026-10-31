// 彈幕試驗: grazing (a bullet passing close, GRAZE, gives focus and Style, each one counted), the hitbox in bullet
// time, the enemy rounds drawn instanced (however many, a draw call or two), and the bot clearing the three floors with
// no round slower than 15 m/s on the way (the shotgun's pellets vary about 17; the walls were 5.5–8). 彈幕試驗 ③'s three pattern men (the ring, the spiral, the fan), their slow
// solid pink walls and their tests went with 試玩回饋 ⑦: every round in the game is a fast one.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=29'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run, nobody about; the player at (-3, 0): in the lanes between the tables (rooms.js), clear to the north and the west. */
    window.toRoom = () => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.player.x = -3;
      g.player.z = 0;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
  });
});
after(async () => {
  await h.close();
});


test('the enemy rounds are drawn instanced: 600 of them cost no more draw calls than one', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const draw = () => {
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      g.render();
      return g.renderer.info.render.calls;
    };
    const p = g.player;
    const add = (n) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 * 9;
        const rr = 1.5 + (i % 60) * 0.12;
        g.bullets.spawn({ x: p.x + Math.sin(a) * rr, z: p.z - 3 + Math.cos(a) * rr, dx: 1, dz: 0, speed: 0, owner: 'enemy', damage: 0, look: 'enemy' });
      }
    };
    add(1);
    const one = draw();
    g.bullets.clear();
    add(600);
    const many = draw();
    return { one, many };
  });
  await page.screenshot({ path: new URL('danmaku-600.png', OUT).pathname });
  assert.equal(r.many, r.one, `one ${r.one}, 600 ${r.many}`);
});

test('grazing in 彈幕試驗: every bullet that passes within GRAZE.radius without hitting gives focus and GRAZE; one farther off, or one that hits, does not; in the arcade the old CLOSE CALL', async () => {
  const r = await page.evaluate(async () => {
    const { GRAZE } = await import('./src/config.js');
    const g = window.game;
    const run = (offsets, mode = 'danmaku') => {
      window.toRoom();
      if (mode !== 'danmaku') {
        g.setMode(mode);
        g.startRun(0);
        g.waves.state = 'done';
        g.enemies.clear();
      }
      const p = g.player;
      g.focusMeter = 0.2;
      const f0 = g.focusMeter;
      const n0 = g.grazes;
      const styles = [];
      const style0 = g.score.style.bind(g.score);
      g.score.style = (l, pts, ...a) => {
        styles.push(l);
        return style0(l, pts, ...a);
      };
      // side by side, the same step: bullets from the west past the player, `off` m north of his middle
      for (const off of offsets) g.bullets.spawn({ x: p.x - 4, z: p.z - off, dx: 1, dz: 0, speed: 20, owner: 'enemy', damage: 1, look: 'enemy' });
      for (let i = 0; i < 90; i++) window.step();
      g.score.style = style0;
      return { focus: g.focusMeter - f0, grazes: g.grazes - n0, styles };
    };
    return { radius: GRAZE.radius, two: run([0.35, -0.4]), far: run([0.9]), hit: run([0.05]), arcade: run([0.6], 'arcade') };
  });
  assert.ok(r.radius <= 0.6, `GRAZE.radius ${r.radius} m`);
  assert.equal(r.two.grazes, 2, 'two bullets past, side by side: both count');
  assert.ok(r.two.focus > 0, 'focus');
  assert.ok(r.two.styles.includes('GRAZE'), `Style (${r.two.styles})`);
  assert.equal(r.far.grazes, 0, 'farther off: none');
  assert.equal(r.hit.grazes, 0, 'a hit is no graze');
  assert.equal(r.arcade.grazes, 0, 'not in the arcade');
  assert.ok(r.arcade.styles.includes('CLOSE CALL'), `the arcade keeps its CLOSE CALL (${r.arcade.styles})`);
});

test('the hitbox: in 彈幕試驗 in bullet time a dot at the player shows where a bullet hits him; not out of bullet time, not in the arcade', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const shown = (mode, focus) => {
      window.toRoom();
      if (mode !== 'danmaku') {
        g.setMode(mode);
        g.startRun(0);
      }
      g.focusAmt = focus;
      g.updateCamera(1, true);
      g.render();
      const hb = g.hitbox;
      return { visible: hb.visible, at: [hb.position.x - g.player.x, hb.position.z - g.player.z], size: hb.scale.x };
    };
    return { slow: shown('danmaku', 1), fast: shown('danmaku', 0), arcade: shown('arcade', 1) };
  });
  assert.equal(r.slow.visible, true);
  assert.ok(Math.hypot(...r.slow.at) < 1e-6, 'on him');
  assert.equal(r.fast.visible, false);
  assert.equal(r.arcade.visible, false);
});

test('the bot clears 彈幕試驗’s three floors in god mode, every room in order, no enemy round slower than 15 m/s (試玩回饋 ⑦); the notes say in Chinese who came, who held a post and how the grazes go', { timeout: 40 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 11, mode: 'danmaku', restart: false, god: true });
  const r = await page.evaluate(() => {
    const g = window.game;
    const said = []; // all of it (the notes keep the last 40 events)
    const log0 = g.notes.log.bind(g.notes);
    g.notes.log = (text) => {
      said.push(text);
      return log0(text);
    };
    // every enemy round as it is fired, its speed and who fired it: none slow (試玩回饋 ⑦)
    const slow = [];
    let enemyRounds = 0;
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.owner === 'enemy') {
        enemyRounds++;
        if (o.speed < 15 && slow.length < 5) slow.push({ speed: o.speed, by: o.source && o.source.cfg ? o.source.cfg.label : '?' });
      }
      return spawn0(o);
    };
    let frames = 0;
    const rooms = [g.level.map.id]; // the rooms it fought in, in order (彈幕試驗 ⑤: the bot walks out of each cleared room's exit); by stage: a room can follow itself on the next floor (C①)
    let stage = g.stage;
    while (g.state === 'playing' && g.waves.state !== 'done' && frames < 60 * 60 * 22) {
      window.simStep(60);
      frames += 60;
      if (g.stage !== stage) {
        stage = g.stage;
        rooms.push(g.level.map.id);
      }
    }
    g.notes.log = log0;
    g.bullets.spawn = spawn0;
    return { wave: g.waves.wave, total: g.waves.totalWaves, done: g.waves.state === 'done', s: frames / 60, grazes: g.grazes, notes: said, errors: window.stats.errors, rooms, floor: g.floor, slow, enemyRounds };
  });
  assert.deepEqual(r.errors, [], 'nothing thrown on the way (the bot catches what the game throws)');
  assert.equal(r.done, true, `cleared (wave ${r.wave}, ${r.s} s, in ${r.rooms.join(' → ')})`);
  assert.equal(r.wave, r.total, `after every wave (${r.total}: the floors’ rooms × 2)`);
  assert.deepEqual(r.rooms, r.floor, 'through every room of the three floors, in order');
  assert.ok(r.enemyRounds > 500, `the enemy fired (${r.enemyRounds} rounds)`);
  assert.deepEqual(r.slow, [], 'no enemy round slower than 15 m/s, the bosses’ walls too');
  assert.ok(r.notes.some((t) => t.startsWith('第 1 波開始：') && t.includes('THUG')), `the arcade's men (彈幕 ② A①): ${r.notes.find((t) => t.startsWith('第 1 波開始'))}`);
  assert.ok(r.notes.some((t) => t.includes('守住開火位')), 'someone held a post (the far side)');
  assert.ok(r.notes.some((t) => t.includes('擦彈')), r.notes.slice(-12).join(' / '));
  assert.deepEqual(problems(logs), []);
});
