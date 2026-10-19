// The pan parries (工具 ②): in the first 0.25 s of a swing an enemy bullet in
// the arc turns round as the player's own, aimed at the nearest enemy (a kill
// by it is a HOME RUN); a sniper's shot batted back is a GONG; an enemy
// grenade in the air is sent back too. A plain kick bats nothing. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=14'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet rooftop, the player at (0, 4) facing north with a pan in hand (or not: `hand` false). */
    window.begin = (hand = true) => {
      g.setRules('normal', []);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = 0;
      p.z = 4;
      p.vx = p.vz = 0;
      if (hand) {
        const pan = g.level.pans[0];
        pan.x = 0.6;
        pan.z = 4;
        pan.y = 0.05;
        pan.vx = pan.vz = pan.vy = 0;
        window.play(1);
        window.play(1, ['KeyE']);
      }
    };
    window.play = (n, keys = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.vx = p.vz = 0;
        p.hp = 100;
        p.invuln = 0;
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        g.aimPoint.set(0, g.aimPoint.y, -6);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
    };
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = 'move';
      e.update = () => {};
      return e;
    };
    /** An enemy bullet from `e`, 2 m north of the player, flying south at him. */
    window.incoming = (e, speed = 20) => g.bullets.spawn({ x: 0, z: 2, dx: 0, dz: 1, speed, owner: 'enemy', damage: 20, range: 70, source: e });
    window.watch = () => {
      const S = { tags: [], style: [] };
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        S.tags.push(t.map((x) => x.label));
        return kill0(t);
      };
      const style0 = g.score.style.bind(g.score);
      g.score.style = (label, pts, refresh) => {
        S.style.push(label);
        return style0(label, pts, refresh);
      };
      return S;
    };
  });
});
after(async () => {
  await h.close();
});

test('a thug’s bullet batted back in the swing turns round as the player’s own and kills him: HOME RUN', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const S = window.watch();
    const e = window.post('grunt', 0, -4);
    const b = window.incoming(e);
    // the bullet closes from 2 m at 20 m/s: swing when it is about 1.3 m off
    window.play(4);
    const dBefore = Math.hypot(b.x - g.player.x, b.z - g.player.z);
    window.play(1, ['KeyF']);
    window.play(2);
    const batted = { owner: b.owner, homeRun: !!b.homeRun, dz: b.dz, speed: b.speed, alive: b.alive, hp: g.player.hp, dBefore };
    let n = 0;
    while (e.alive && n++ < 120) window.play(1);
    return { batted, dead: e.dead, tags: S.tags, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('鑊')) };
  });
  assert.ok(r.batted.dBefore < 1.9 && r.batted.dBefore > 0.6, `the bullet was ${r.batted.dBefore.toFixed(2)} m off at the swing`);
  assert.deepEqual([r.batted.owner, r.batted.homeRun, r.batted.alive], ['player', true, true], 'the bullet is the player’s now');
  assert.ok(r.batted.dz < -0.9, `and flies back north (dz ${r.batted.dz.toFixed(2)})`);
  assert.ok(r.batted.speed >= 70, `fast (${r.batted.speed} m/s)`);
  assert.equal(r.batted.hp, 100, 'the player was not hit');
  assert.equal(r.dead, true, 'it killed the thug who fired it');
  assert.ok(r.tags[0].includes('HOME RUN'), `the kill tag: ${r.tags[0]}`);
  assert.ok(r.log.includes('鑊打回子彈'), r.log.join(' / '));
  assert.deepEqual(problems(logs), []);
});

test('a sniper’s shot batted back is a GONG; a grenade in the air is sent back; a plain kick bats nothing', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin();
    const S = window.watch();
    const sn = window.post('sniper', 0, -8);
    const b = window.incoming(sn, 72);
    window.play(1, ['KeyF']); // 72 m/s: 2 m in a third of a second, so swing at once
    window.play(2);
    const gong = { owner: b.owner, style: S.style.slice() };
    // a grenadier's grenade on its way: the swing meets it in the air
    window.begin();
    const gr = window.post('grenadier', 0, -6);
    gr.facing = Math.PI; // facing south
    gr.throwGrenade();
    const nade = g.grenades.list[0];
    let n = 0;
    while (Math.hypot(nade.x - g.player.x, nade.z - g.player.z) > 1.8 && n++ < 400) window.play(1);
    const near = Math.hypot(nade.x - g.player.x, nade.z - g.player.z);
    window.play(1, ['KeyF']);
    const sent = { owner: nade.owner, away: nade.tz < nade.sz, near };
    // no pan in hand: a kick lets the bullet through
    window.begin(false);
    const e = window.post('grunt', 0, -4);
    const b2 = window.incoming(e);
    window.play(4);
    window.play(1, ['KeyF']);
    window.play(2);
    return { gong, sent, plain: { owner: b2.owner, homeRun: !!b2.homeRun } };
  });
  assert.equal(r.gong.owner, 'player', 'the sniper’s shot came back');
  assert.ok(r.gong.style.includes('GONG'), `GONG was scored (${r.gong.style})`);
  assert.ok(r.sent.near < 1.9, `the grenade was ${r.sent.near.toFixed(2)} m off`);
  assert.deepEqual([r.sent.owner, r.sent.away], ['kicked', true], 'the grenade in the air went back north');
  assert.deepEqual(r.plain, { owner: 'enemy', homeRun: false }, 'a kick without the pan bats nothing');
  assert.deepEqual(problems(logs), []);
});
