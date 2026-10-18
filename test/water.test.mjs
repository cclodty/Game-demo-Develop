// Water (環境互動件 ④): the docks' harbour beyond the south curb and the
// Senado fountain's pool. An enemy knocked over the edge at speed is gone
// (SPLASH); a walking enemy and the player are held back by the curb and
// the rim; a barrel thrown into the water sinks without a bang. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=12'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.begin = (map) => {
      g.setRules('normal', []);
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
    };
    window.play = (n, aim = null, keys = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.vx = g.player.vz = 0;
        g.player.hp = 100;
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
      }
      g.input.pressed.clear();
    };
    window.post = (type, x, z, state = 'move') => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = state;
      return e;
    };
    window.tags = () => {
      const tags = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        tags.push(t.map((x) => x.label));
        return kill0(t);
      };
      return tags;
    };
  });
});
after(async () => {
  await h.close();
});

test('the harbour: a thug kicked over the south curb is a SPLASH; one walking up to it stays dry; a barrel thrown in sinks without a bang', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(2); // the docks
    const D = L.bounds.halfD;
    const water = { in: L.waterAt(5, D + 1.5), out: L.waterAt(5, D - 1) };
    const p = g.player;
    // the thug by the curb, the player behind him, a kick south
    p.x = 5;
    p.z = D - 3.4;
    const e = window.post('grunt', 5, D - 1.3); // he keeps his post (his own update carries him over the edge)
    const tags = window.tags();
    window.play(1, [5, D + 2], ['KeyF']);
    window.play(30, [5, D + 2]);
    const kicked = { dead: e.dead, splashed: !!e.splashed, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('跌落水')) };
    window.play(90, [5, D + 2]);
    const body = { y: e.y, hidden: !e.rig.root.visible };
    // a thug who just walks at the water is held by the curb
    const w = window.post('rusher', 9, D - 4, 'chase');
    w.update = function (dt) {
      // straight at the water, as if the player stood in it
      this.vx = 0;
      this.vz = 6;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
      g.level.collideCircle(this, this.radius);
      this.sync();
    };
    window.play(60);
    const walker = { alive: w.alive, z: w.z, dry: !L.waterAt(w.x, w.z) };
    // the player cannot get in either
    p.x = -5;
    p.z = D - 1.2;
    for (let i = 0; i < 40; i++) {
      g.input.keys.add('KeyS');
      window.play(1, [-5, D + 3]);
    }
    g.input.keys.clear();
    const playerZ = p.z;
    // a barrel thrown over the curb into the water: it sinks, no bang
    const b = L.barrels.find((x) => x.alive && x.variant === 'barrel');
    b.x = 3;
    b.z = D - 4;
    b.y = 0;
    b.vx = b.vz = b.vy = 0;
    p.x = b.x;
    p.z = b.z - 0.9;
    g.thrown.pickUp(b);
    g.aimPoint.set(b.x, g.aimPoint.y, D + 2);
    g.aimFresh = true;
    g.cmd.aim.x = b.x;
    g.cmd.aim.z = D + 2;
    const booms = g.notes.events.length;
    g.thrown.throwCarried();
    window.play(120, [b.x, D + 2]);
    const thrown = { alive: b.alive, sank: g.notes.events.slice(booms).some((x) => x.text.includes('掉進水裡')), boom: g.notes.events.slice(booms).some((x) => x.text.includes('爆')) };
    return { water, kicked, body, walker, playerZ, D, tags, thrown };
  });
  assert.deepEqual(r.water, { in: true, out: false }, 'the water lies beyond the curb');
  assert.deepEqual([r.kicked.dead, r.kicked.splashed], [true, true], 'kicked over the curb: gone');
  assert.ok(r.tags[0].includes('SPLASH'), `the kill tag: ${r.tags[0]}`);
  assert.deepEqual(r.kicked.log, ['THUG 跌落水']);
  assert.ok(r.body.y < -1 && r.body.hidden, `the body sank (${r.body.y.toFixed(1)} m) and is hidden`);
  assert.deepEqual([r.walker.alive, r.walker.dry], [true, true], `walking at it he stays dry at z ${r.walker.z.toFixed(1)}`);
  assert.ok(r.playerZ < r.D - 0.5, `the player is held by the curb (z ${r.playerZ.toFixed(2)} of ${r.D})`);
  assert.deepEqual(r.thrown, { alive: false, sank: true, boom: false }, 'the barrel sank without a bang');
  await snap(page, 'water-docks.png');
  assert.deepEqual(problems(logs), []);
});

test('the fountain: a thug kicked over the rim lands in the pool (SPLASH)', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(3); // Largo do Senado
    const pool = L.water[0];
    const p = g.player;
    // the thug on the rim's west side, the player further west, a kick east into the pool
    const rim = pool.r;
    const ex = pool.x - rim - 0.5;
    const e = window.post('grunt', ex, pool.z);
    p.x = ex - 2;
    p.z = pool.z;
    const tags = window.tags();
    window.play(1, [pool.x, pool.z], ['KeyF']);
    window.play(30, [pool.x, pool.z]);
    return { pool: { r: pool.r, isCircle: pool.r !== undefined }, dead: e.dead, splashed: !!e.splashed, tags, inWater: L.waterAt(e.x + 0.6, e.z) };
  });
  assert.equal(r.pool.isCircle, true, 'the pool is a circle of water');
  assert.deepEqual([r.dead, r.splashed], [true, true], 'over the rim and in');
  assert.ok(r.tags[0].includes('SPLASH'), `the kill tag: ${r.tags[0]}`);
  assert.deepEqual(problems(logs), []);
});
