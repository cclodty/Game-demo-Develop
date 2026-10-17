// Style moves: the spin shot sprays a ring while the player spins and its
// kills are PIROUETTEs; shooting an enemy the player just kicked is a JUGGLE.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open());
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    const S = (window.S = { shots: [], tags: [] });
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.owner === 'player') S.shots.push({ dx: o.dx, dz: o.dz, spin: !!o.spinShot });
      return spawn0(o);
    };
    const kill0 = g.score.kill.bind(g.score);
    g.score.kill = (tags) => {
      S.tags.push(tags.map((t) => t.label));
      return kill0(tags);
    };
    // step n frames with the given held inputs; enemies are kept away so nothing interferes
    window.step = (n, { fire = false, space = false } = {}) => {
      const inp = g.input;
      for (let i = 0; i < n; i++) {
        g.time += 1 / 60;
        inp.pressed.clear();
        inp.keys.clear();
        inp.mouse.leftPressed = inp.mouse.rightPressed = inp.mouse.rightReleased = false;
        inp.mouse.left = fire;
        if (space && i === 0) inp.pressed.add('Space');
        g.player.hp = 100;
        g.enemies.clear();
        g.updateAim();
        g.updatePlay(1 / 60);
      }
    };
  });
});
after(async () => {
  await h.close();
});

const angle = (s) => Math.atan2(s.dx, s.dz);

test('holding fire while spinning sprays a ring; aimed fire still goes to the cursor', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const S = window.S;
    g.input.mouse.x = innerWidth * 0.75;
    g.input.mouse.y = innerHeight * 0.5;
    S.shots.length = 0;
    window.step(60, { fire: true }); // one second: about nine pistol shots
    const aimed = S.shots.slice();
    S.shots.length = 0;
    g.player.spinCd = 0;
    g.player.fireCd = 0;
    g.player.ammo = 30;
    window.step(14, { fire: true, space: true }); // mid-spin, for the screenshot
    return { aimed, aimX: g.aimPoint.x - g.player.x, aimZ: g.aimPoint.z - g.player.z };
  });
  await snap(page, 'moves-spin-shot.png');
  r.spun = await page.evaluate(() => {
    window.step(18, { fire: true }); // the rest of the spin and a little after
    return window.S.shots.slice();
  });
  assert.ok(r.aimed.length >= 6, `aimed shots: ${r.aimed.length}`);
  assert.ok(r.aimed.every((s) => !s.spin), 'aimed shots are not spin shots');
  const aimAngle = Math.atan2(r.aimX, r.aimZ);
  for (const s of r.aimed) {
    const d = Math.abs(((angle(s) - aimAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(d < 0.3, `aimed shot ${d.toFixed(2)} rad off the cursor`);
  }

  const spinShots = r.spun.filter((s) => s.spin);
  assert.ok(spinShots.length >= 6, `spin shots: ${spinShots.length} of ${r.spun.length}`);
  // the ring: the spin shots cover at least three quarters of the circle
  const bins = new Set(spinShots.map((s) => Math.floor(((angle(s) + Math.PI) / (Math.PI * 2)) * 8) % 8));
  assert.ok(bins.size >= 6, `spin shots cover ${bins.size}/8 directions: ${spinShots.map((s) => angle(s).toFixed(2)).join(' ')}`);
  assert.deepEqual(problems(logs), []);
});

test('a spin finishes the reload with the spin', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    p.special = null;
    p.equip('pistols');
    p.ammo = 0;
    p.reloadT = 0;
    p.startReload();
    const plain = p.reloadT;
    p.reloadT = 0;
    p.spinCd = 0;
    p.spinT = 0;
    window.step(1, { space: true });
    const atSpin = { reloadT: p.reloadT, spinT: p.spinT };
    window.step(34);
    return { plain, atSpin, ammo: p.ammo, events: g.notes.events.slice(-4).map((e) => e.text) };
  });
  assert.ok(r.plain > 1, `a normal reload takes ${r.plain} s`);
  assert.ok(r.atSpin.reloadT > 0 && r.atSpin.reloadT <= r.atSpin.spinT + 1e-6, `the reload (${r.atSpin.reloadT}) ends with the spin (${r.atSpin.spinT})`);
  assert.equal(r.ammo, 30);
  assert.ok(r.events.includes('旋轉中換彈'), r.events.join(' | '));
});

test('a spin-shot kill is a PIROUETTE and a kill on a kicked enemy is a JUGGLE', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const S = window.S;
    const p = g.player;
    const sp = g.level.spawns[0];
    const place = () => {
      const e = g.enemies.spawn('grunt', sp);
      e.state = 'move';
      e.spawnLock = 0;
      e.x = p.x + Math.sin(p.facing) * 1.2;
      e.z = p.z + Math.cos(p.facing) * 1.2;
      return e;
    };
    S.tags.length = 0;
    // 1. a spin-shot bullet kills
    let e = place();
    e.hit({ owner: 'player', damage: 999, dx: 0, dz: 1, knock: 1, spinShot: true });
    const pirouette = S.tags.pop();
    // 2. kicked, then shot before landing
    e = place();
    p.kickCd = 0;
    p.kick();
    const stunned = { stunT: e.stunT, cause: e.stunCause, alive: e.alive };
    e.hit({ owner: 'player', damage: 999, dx: 0, dz: 1, knock: 1 });
    const juggle = S.tags.pop();
    // 3. a plain kill has neither
    e = place();
    e.hit({ owner: 'player', damage: 999, dx: 0, dz: 1, knock: 1 });
    const plain = S.tags.pop();
    g.enemies.clear();
    return { pirouette, stunned, juggle, plain, events: g.notes.events.slice(-3).map((x) => x.text) };
  });
  assert.ok(r.pirouette.includes('PIROUETTE'), r.pirouette.join(' '));
  assert.ok(!r.pirouette.includes('SPIN KILL'), 'PIROUETTE replaces SPIN KILL');
  assert.ok(r.stunned.alive && r.stunned.stunT > 0 && r.stunned.cause === 'kick', JSON.stringify(r.stunned));
  assert.ok(r.juggle.includes('JUGGLE'), r.juggle.join(' '));
  assert.ok(!r.plain.includes('JUGGLE') && !r.plain.includes('PIROUETTE'), r.plain.join(' '));
  assert.ok(r.events.some((t) => t.includes('JUGGLE')), r.events.join(' | '));
  assert.deepEqual(problems(logs), []);
});
