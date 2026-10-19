// Doors and shutters (環境互動件 ②): a closed door blocks sight and bodies but
// not paths; the player's kick swings it onto whoever stands behind it (SLAM),
// an enemy walking into it pushes it open, and it swings shut again 4 s
// later when nobody stands in it. A shutter drops when its lock post is shot
// or kicked, crushes whoever is under it (SHUTTER), shuts the opening until
// the wave is cleared, and rolls back up. Numbers in config.js ENV. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems, snap } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=6'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on `map`; window.play(n, aim) steps n 60 Hz frames, the player still, aiming at `aim` ([x, z]) if given. */
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
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
      }
      g.input.pressed.clear();
    };
    window.shoot = (x, z, tx, tz) => {
      const d = Math.hypot(tx - x, tz - z) || 1;
      return g.bullets.spawn({ x, z, dx: (tx - x) / d, dz: (tz - z) / d, speed: 62, owner: 'player', damage: 1 });
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

test('the rooftop gate: shut it blocks sight and bodies but not paths; kicked, it swings onto the blade behind it (SLAM) and shuts again 4 s later', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(0);
    const door = L.fixtures.find((f) => f.kind === 'door'); // (0, -8) in the barrier, 1.4 m wide
    const p = g.player;
    const shut = { los: L.hasLOS(0, -6, 0, -10), ray: !!L.raycast(0, -6, 0, -10), walkable: L.nav.isWalkable(door.x, door.z), path: !!L.nav.findPath(0, -6, 0, -10), open: door.open };
    // the player walks into it: he stops
    p.x = 0;
    p.z = -7.2;
    p.vz = -6;
    for (let i = 0; i < 10; i++) {
      g.input.keys.add('KeyW');
      window.play(1, [0, -12]);
    }
    g.input.keys.clear();
    const stopped = p.z > door.z + 0.3;
    // a blade behind the door, then the kick
    p.x = 0;
    p.z = -6.6;
    const e = window.post('rusher', 0, -8.9);
    e.update = () => {};
    const tags = window.tags();
    window.play(1, [0, -12], ['KeyF']);
    window.play(5, [0, -12]);
    const kicked = { open: door.open, los: L.hasLOS(0, -6, 0, -10), dead: e.dead, swing: door.swing, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('門')) };
    // step out of the doorway: it shuts after ENV.doorOpen
    p.z = -4;
    window.play(60 * 3);
    const at3 = door.open;
    window.play(60 * 1.5);
    const at45 = { open: door.open, los: L.hasLOS(0, -6, 0, -10) };
    return { shut, stopped, kicked, tags, at3, at45 };
  });
  assert.deepEqual(r.shut, { los: false, ray: true, walkable: true, path: true, open: false }, 'shut: no sight through it, a body stops, a path goes through');
  assert.equal(r.stopped, true, 'the player stops at the shut door');
  assert.equal(r.kicked.open, true, 'F opens it');
  assert.equal(r.kicked.los, true, 'open: sight through');
  assert.equal(r.kicked.swing, -1, 'it swung away from the kicker (north)');
  assert.equal(r.kicked.dead, true, 'the blade behind it is dead');
  assert.ok(r.tags[0].includes('SLAM'), `the kill tag: ${r.tags[0]}`);
  assert.ok(r.kicked.log.some((t) => t.includes('踢開門')), r.kicked.log.join(' / '));
  assert.equal(r.at3, true, 'still open after 3 s');
  assert.deepEqual(r.at45, { open: false, los: false }, 'shut again after 4 s');
  await snap(page, 'fixture-door.png');
  assert.deepEqual(problems(logs), []);
});

test('an enemy walking into a shut door pushes it open and comes through, no slam', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(0);
    const door = L.fixtures.find((f) => f.kind === 'door');
    const p = g.player;
    p.x = 0;
    p.z = -4.5;
    const e = window.post('rusher', 0, -11.5, 'chase');
    let n = 0;
    let opened = -1;
    while (n++ < 60 * 4) {
      p.hp = 100;
      p.invuln = 1;
      window.play(1, [0, -12]);
      if (opened < 0 && door.open) opened = n / 60;
      if (e.z > door.z + 0.6) break;
    }
    return { opened, through: e.z > door.z + 0.6, hp: p.hp, t: n / 60 };
  });
  assert.ok(r.opened > 0 && r.opened < 3, `he pushed it open (${r.opened.toFixed(2)} s)`);
  assert.equal(r.through, true, `and came through (${r.t.toFixed(2)} s)`);
  assert.deepEqual(problems(logs), []);
});

test('the docks shutter: a bullet on the lock drops it on the thug under it (SHUTTER), the opening is shut to sight and paths, and the wave clear rolls it up; a kick on the post drops it too', { timeout: 120000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(2);
    const sh = L.fixtures.find((f) => f.kind === 'shutter'); // post (10.5, 7.2), 5 m east
    const p = g.player;
    const across = () => ({ ray: !!L.raycast(sh.midX, sh.midZ - 2, sh.midX, sh.midZ + 2), walkable: L.nav.isWalkable(sh.midX, sh.midZ) });
    const up = across();
    const e = window.post('grunt', sh.midX, sh.midZ);
    e.update = () => {};
    const tags = window.tags();
    p.x = sh.x;
    p.z = sh.z - 4;
    window.shoot(p.x, p.z, sh.x, sh.z);
    window.play(6);
    const falling = sh.fallT >= 0;
    window.play(40);
    const down = { down: sh.down, dead: e.dead, ...across(), log: g.notes.events.map((x) => x.text).filter((t) => t.includes('鐵閘')) };
    // the wave clears: the shutter rolls up
    g.waves.wave = 1;
    g.onWaveClear(1);
    const after = { down: sh.down, ...across() };
    // a kick on the post drops it as well, and the player under it is hurt
    p.x = sh.x;
    p.z = sh.z - 1.2;
    window.play(1, [sh.x, sh.z], ['KeyF']);
    const kicked = sh.fallT >= 0;
    p.x = sh.midX;
    p.z = sh.midZ;
    p.hp = 100;
    p.invuln = 0;
    window.play(45, [sh.x, sh.z]);
    return { up, falling, down, tags, after, kicked, hp: p.hp };
  });
  assert.deepEqual(r.up, { ray: false, walkable: true }, 'rolled up: open to sight and paths');
  assert.equal(r.falling, true, 'the lock gave');
  assert.deepEqual({ down: r.down.down, dead: r.down.dead, ray: r.down.ray, walkable: r.down.walkable }, { down: true, dead: true, ray: true, walkable: false }, 'down: he is under it, and the opening is shut');
  assert.ok(r.tags[0].includes('SHUTTER'), `the kill tag: ${r.tags[0]}`);
  assert.ok(r.down.log.some((t) => t.includes('鐵閘落下')), r.down.log.join(' / '));
  assert.deepEqual(r.after, { down: false, ray: false, walkable: true }, 'the wave clear rolls it up');
  assert.equal(r.kicked, true, 'a kick on the post drops it');
  assert.equal(r.hp, 40, 'the player under it takes 60');
  await snap(page, 'fixture-shutter.png');
  assert.deepEqual(problems(logs), []);
});
