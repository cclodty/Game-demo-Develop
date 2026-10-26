// 彈幕 ② B②: the human shield by kind (config.js PLAYER.humanShield, DECISIONS 2026-10-26). A bomber held never
// lights his vest; shoved out he is a bomb with a 0.4 s fuse, and what his blast takes is CHAIN. A riot-shield man
// held raises his shield: from the front nothing harms him; a round across his body from the side does; shoved, he
// rams men twice as far. A captain held, his guards and the room's thugs hold their fire, and waver once he is let
// go. A heavy gun held fires his gun along the player's facing, rounds that are the player's own: a kill is HOSTAGE
// FIRE. (A brute held walks at 0.4: test/humanshield.test.mjs.)
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=9'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on the rooftop, the player at (x, z) in the top-down view, no weapons about. */
    window.begin = (x = -8, z = 4) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.pickups.clear();
      g.bullets.clear();
      g.setFocus(false);
      g.view = 0;
      g.updateCamera(1, true);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** A man of `type` standing at (x, z); `wait` s before he may fire (999: never on his own). */
    window.post = (type, x, z, wait = 999) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = wait;
      return e;
    };
    /** 120 Hz steps holding `held` (Mouse0 is the left button), pressing `press` on the first, aiming east. */
    window.play = (n, held = [], press = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = held.includes('Mouse0');
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.aimPoint.set(g.player.x + 6, g.aimPoint.y, g.player.z);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
      g.input.keys.clear();
      g.input.mouse.left = false;
    };
    /** An enemy round at (x, z) from `deg` degrees round from the east, `d` m off. */
    window.shootAt = (x, z, deg, d = 8) => {
      const a = (deg * Math.PI) / 180;
      const ox = Math.cos(a);
      const oz = Math.sin(a);
      return g.bullets.spawn({ x: x + ox * d, z: z + oz * d, dx: -ox, dz: -oz, speed: 60, owner: 'enemy', damage: 10 });
    };
    /** The kill tags from here on. */
    window.tagKills = () => {
      const kills = [];
      const kill0 = g.score.kill.bind(g.score);
      g.score.kill = (t) => {
        kills.push(t.map((x) => x.label));
        return kill0(t);
      };
      return kills;
    };
  });
});
after(async () => {
  await h.close();
});

test('a bomber held never lights his vest, even beside his own men; shoved out he goes off 0.4 s later where he lands, and the man there is a CHAIN', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.begin();
    const kills = window.tagKills();
    const b = window.post('bomber', p.x + 1, p.z);
    window.post('grunt', p.x + 1.8, p.z + 0.9); // within his reach: free, he would light up by him
    window.play(1, [], ['KeyE']);
    window.play(120);
    const held = { held: p.hostage === b, lit: b.fuseT >= 0, alive: b.alive };
    const far = window.post('grunt', p.x + 6, p.z); // where the shove lands him
    window.play(1, [], ['KeyE']);
    const shoved = { lit: b.fuseT >= 0, fuse: b.fuseT, note: g.notes.events.at(-1).text };
    let went = -1;
    for (let i = 0; i < 120; i++) {
      window.play(1);
      if (!b.alive && went < 0) went = i;
    }
    return { held, shoved, went, farAlive: far.alive, tags: kills.flat() };
  });
  assert.deepEqual(r.held, { held: true, lit: false, alive: true }, 'held a second by his man, not lit');
  assert.equal(r.shoved.lit, true, 'shoved: lit');
  assert.ok(Math.abs(r.shoved.fuse - 0.4) < 0.02, `a 0.4 s fuse (${r.shoved.fuse})`);
  assert.match(r.shoved.note, /推出炸彈客/);
  assert.ok(r.went >= 40 && r.went <= 60, `went off about 0.4 s on (step ${r.went})`);
  assert.equal(r.farAlive, false, 'the man where he landed is gone');
  assert.ok(r.tags.includes('CHAIN'), `his blast's kill is a CHAIN: ${r.tags.join(',')}`);
  assert.deepEqual(problems(logs), []);
});

test('a riot-shield man held: his shield up again, rounds from the front do him no harm; one across his body from the side does; shoved, he rams the man in the way twice as far as a thug would', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.begin();
    const s = window.post('shield', p.x + 1, p.z);
    s.shieldDownT = 1.5; // kicked down a moment ago
    window.play(1, [], ['KeyE']);
    const up = s.shieldDownT <= 0;
    const hp0 = s.hp;
    window.shootAt(p.x, p.z, 0); // from the east, straight at the player: the front
    window.shootAt(p.x, p.z, 40);
    window.play(30);
    const front = { lost: hp0 - s.hp, player: p.hp };
    window.shootAt(s.x, s.z, 100, 4); // from the side, at the man himself
    window.play(20);
    const side = { lost: hp0 - s.hp };
    // the shove: how far the man in the way flies, a riot shield against a thug
    const flung = (type) => {
      window.begin();
      window.post(type, p.x + 1, p.z);
      window.play(1, [], ['KeyE']);
      const o = window.post('grunt', p.x + 3, p.z);
      const x0 = o.x;
      window.play(1, [], ['KeyE']);
      let far = 0;
      for (let i = 0; i < 150; i++) {
        window.play(1);
        far = Math.max(far, o.x - x0);
      }
      return far;
    };
    return { up, front, side, ram: flung('shield'), thug: flung('grunt') };
  });
  assert.equal(r.up, true, 'his shield comes up when held');
  assert.equal(r.front.lost, 0, `nothing from the front (lost ${r.front.lost})`);
  assert.equal(r.front.player, 100, 'nor the player');
  assert.ok(r.side.lost > 0, `a round across his body from the side lands (lost ${r.side.lost})`);
  assert.ok(r.ram > r.thug * 1.5, `shoved with his shield he rams a man ${r.ram.toFixed(2)} m, a thug ${r.thug.toFixed(2)} m`);
  assert.deepEqual(problems(logs), []);
});

test('a captain held: his guards and the thugs hold their fire; let go, they fire again and waver a moment; a rifleman is not muzzled', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.begin();
    const c = window.post('captain', p.x + 1, p.z);
    const guard = window.post('grunt', p.x + 6, p.z + 2, 0);
    guard.escortOf = c;
    const thug = window.post('grunt', p.x + 6, p.z - 2, 0);
    const rifle = window.post('rifle', p.x + 7, p.z + 4, 0);
    const shots = { guard: 0, thug: 0, rifle: 0 };
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.source === guard) shots.guard++;
      if (o.source === thug) shots.thug++;
      if (o.source === rifle) shots.rifle++;
      return spawn0(o);
    };
    window.play(1, [], ['KeyE']);
    window.play(120 * 2.5);
    const held = { ...shots, muzzled: [guard.muzzled, thug.muzzled, rifle.muzzled], note: g.notes.events.map((x) => x.text).find((t) => t.includes('停火')) };
    window.play(1, [], ['KeyE']); // let go
    const wavered = [guard.retreatTo, thug.retreatTo].map((t) => !!t);
    window.play(120 * 4);
    g.bullets.spawn = spawn0;
    return { held, wavered, after: { ...shots }, note: g.notes.events.map((x) => x.text).find((t) => t.includes('亂一陣')) };
  });
  assert.deepEqual([r.held.guard, r.held.thug], [0, 0], `the guard and the thug held their fire (${r.held.guard}, ${r.held.thug})`);
  assert.deepEqual(r.held.muzzled, [true, true, false]);
  assert.ok(r.held.rifle > 0, `the rifleman fired on (${r.held.rifle})`);
  assert.match(r.held.note || '', /停火/);
  assert.deepEqual(r.wavered, [true, true], 'let go: both waver (fall back a step)');
  assert.ok(r.after.guard > 0 && r.after.thug > 0, `and fire again (${r.after.guard}, ${r.after.thug})`);
  assert.match(r.note || '', /亂一陣/);
  assert.deepEqual(problems(logs), []);
});

test('a heavy gun held fires his gun along the player’s facing, rounds that are the player’s own; the thug they kill is a HOSTAGE FIRE (+150)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const p = g.player;
    window.begin();
    const kills = window.tagKills();
    const m = window.post('hoser', p.x + 1.2, p.z);
    const mark = window.post('grunt', p.x + 6, p.z);
    const rounds = [];
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.hostageFire) rounds.push({ owner: o.owner, dx: o.dx, dz: o.dz, look: o.look });
      return spawn0(o);
    };
    window.play(1, [], ['KeyE']);
    window.play(120 * 1.5);
    g.bullets.spawn = spawn0;
    return { held: p.hostage === m, rounds: rounds.length, owners: [...new Set(rounds.map((x) => x.owner))], east: rounds.every((x) => x.dx > 0.95), markAlive: mark.alive, tags: kills.flat(), note: g.notes.events.map((x) => x.text).find((t) => t.includes('人盾開火')) };
  });
  assert.equal(r.held, true);
  assert.ok(r.rounds >= 10, `rounds from his gun (${r.rounds})`);
  assert.deepEqual(r.owners, ['player'], 'the player’s own');
  assert.equal(r.east, true, 'along the facing');
  assert.equal(r.markAlive, false, 'the thug ahead is shot down');
  assert.ok(r.tags.includes('HOSTAGE FIRE'), r.tags.join(','));
  assert.match(r.note || '', /人盾開火：機槍手/);
  assert.deepEqual(problems(logs), []);
});
