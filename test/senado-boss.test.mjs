// Senado's boss (議事亭：頭目 ①, DECISIONS 2026-10-22: every boss is a person): the
// gang's marksman. He walks in from a street's mouth to the first of the map's
// posts and draws his red line: it swings onto the player, and once it is on
// him with nothing between, it stops there for a second before the one round
// comes down it (40 HP). A step out of the line in that second and it misses.
// Anything solid between (a lamp post, the kiosk, a stall) breaks the line, and
// so does a flock of the square's pigeons bursting into the air across it;
// broken 1.5 s, or with the player within 10 m, he moves on to another post (one
// 12–26 m from the player, so he stays in the picture: the camera leans towards
// him), and on the move nothing covers him. Hits take segments; five segments.
// The taxi convoy he replaces stays a kind a map can ask for
// (test/convoy.test.mjs puts it back). Senado's boss is now the marksman with
// his partner (test/senado-duo.test.mjs); this test puts him back alone.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=29'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    // the marksman alone: the first of Senado's two
    const senado = g.maps.find((m) => m.id === 'senado');
    window.duo = senado.boss;
    senado.boss = senado.boss.pair[0];
    /** An arcade run from the club, moved on to its third stage (Senado) and the start of wave 12; the player up the square. */
    window.toFinal = () => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(1);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.player.x = 2;
      g.player.z = 24;
      g.waves.wave = 11;
      g.waves.startWave();
    };
    /** One logic step; the player still, unhurt unless `hurt`, nobody else about. */
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.enemies.clear();
      g.waves.pending.length = 0;
    };
    /** Steps until `cond()` holds (at most `max`); how many it took. */
    window.until = (cond, max = 3600, hurt = false) => {
      let n = 0;
      while (!cond() && n++ < max) window.step(hurt);
      return n;
    };
    /** Steps until he stands at a post with his line up. */
    window.atPost = () => window.until(() => g.boss.state === 'post' && g.boss.lineT <= 0);
    /** Him put at `post` (one of his), just arrived. */
    window.putAt = (post) => {
      const b = g.boss;
      b.x = post.x;
      b.z = post.z;
      b.target = post;
      b.arrive();
    };
    /** `n` player shots at him from (x, z), each flown home before the next, his line held down meanwhile. */
    window.fire = (n, x, z) => {
      const b = g.boss;
      for (let i = 0; i < n; i++) {
        const dx = b.x - x;
        const dz = b.z - z;
        const d = Math.hypot(dx, dz);
        g.bullets.spawn({ x: x + (dx / d) * 0.5, z: z + (dz / d) * 0.5, dx: dx / d, dz: dz / d, speed: 80, owner: 'player', damage: 1 });
        for (let k = 0; k < 10; k++) {
          b.lineT = 99;
          window.step();
        }
      }
      b.lineT = 0;
    };
    /** Where (x, z) at gun height falls on the screen, -1..1 each way, with the camera where it would be now. */
    window.onScreen = (x, z) => {
      g.updateCamera(1, true);
      g.camera.updateMatrixWorld();
      const v = g.camera.position.clone().set(x, 1.2, z).project(g.camera);
      return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    };
  });
});
after(async () => {
  await page.evaluate(() => {
    window.game.maps.find((m) => m.id === 'senado').boss = window.duo;
  });
  await h.close();
});

test('wave 12 in Senado is the marksman: a man on foot (no retired kind), in from a street’s mouth to his first post within 3 s; the route names him; inside the render budget', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const b = g.boss;
    window.toFinal();
    const { RETIRED } = await import('./src/boss.js');
    const from = { x: b.x, z: b.z };
    const enter = window.until(() => b.state !== 'enter');
    window.atPost();
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    const bar = document.getElementById('boss-bar');
    return {
      map: g.level.map.id,
      kind: b.active && b.def.kind,
      retired: RETIRED[b.def.kind] || null,
      bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent,
      route: g.routeText(1, 'arcade'),
      from,
      post: [b.x, b.z],
      first: b.def.posts[0],
      enter: enter / 120,
      seen: window.onScreen(b.x, b.z) && window.onScreen(g.player.x, g.player.z),
      calls: info.calls,
      tris: info.triangles,
      budget: g.level.map.budget,
    };
  });
  await page.screenshot({ path: new URL('boss-marksman.png', OUT).pathname });
  assert.deepEqual([r.map, r.kind, r.retired, r.bar], ['senado', 'marksman', null, '議事亭長槍手 MARKSMAN']);
  assert.ok(r.route.endsWith('、長槍手）'), r.route);
  assert.ok(r.enter <= 3, `in to his first post in ${r.enter} s (no more than 3 s out of reach)`);
  assert.ok(Math.hypot(r.post[0] - r.first[0], r.post[1] - r.first[1]) < 0.5, `at his first post (${r.post}, ${r.first})`);
  assert.ok(r.seen, 'he and the player both in the picture');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('his line: it swings onto the player and stops on him; the round comes 1 s later, 40 HP if he stays, nothing if he steps out of the line', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const run = (sidestep) => {
      window.toFinal();
      window.atPost();
      const swings = [];
      window.until(() => {
        swings.push(Math.abs(((Math.atan2(p.x - b.x, p.z - b.z) - b.lineA + 3 * Math.PI) % (2 * Math.PI)) - Math.PI));
        return b.state === 'lock';
      });
      g.updateCamera(1, true);
      b.sync();
      const seen = b.laser.mesh.visible;
      const lockT = g.worldTime;
      let shotT = null;
      const hp0 = p.hp;
      window.until(
        () => {
          if (sidestep && b.state === 'lock' && b.timer < 0.5) {
            p.x += Math.cos(b.lineA) * 2.5; // across the line
            p.z -= Math.sin(b.lineA) * 2.5;
            sidestep = false;
          }
          if (shotT === null && g.bullets.list.some((x) => x.alive && x.owner === 'enemy')) shotT = g.worldTime;
          return b.state === 'cycle';
        },
        400,
        true,
      );
      window.until(() => !g.bullets.list.some((x) => x.alive && x.owner === 'enemy'), 600, true);
      return { swept: swings[0] > swings[swings.length - 1] + 0.05, seen, wait: shotT - lockT, lost: hp0 - p.hp };
    };
    return { stay: run(false), step: run(true) };
  });
  assert.ok(r.stay.swept, 'the line swings round onto him');
  assert.ok(r.stay.seen, 'the line is drawn while it stands still on him');
  assert.ok(Math.abs(r.stay.wait - 1) < 0.03, `the round comes ${r.stay.wait} s after the line stops (1 s)`);
  assert.equal(r.stay.lost, 40, 'standing in the line: 40 HP');
  assert.equal(r.step.lost, 0, 'out of the line in that second: it misses');
});

test('a lamp post between breaks the line (no lock, no round); broken 1.5 s he moves on, and on the move hits take a segment; a flock bursting into the air across a locked line breaks it', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const L = g.level;
    window.toFinal();
    window.atPost();
    // a lamp post (a thin pillar) with a post 12–26 m off beyond it: the player 2.2 m behind it, as seen from the post
    const lamps = L.solids.filter((s) => s.alive && !s.poly && s.h >= 3 && s.maxX - s.minX < 0.5 && s.maxZ - s.minZ < 0.5);
    let found = null;
    for (const s of lamps) {
      const cx = (s.minX + s.maxX) / 2;
      const cz = (s.minZ + s.maxZ) / 2;
      for (const q of b.posts) {
        const d = Math.hypot(cx - q.x, cz - q.z);
        const x = cx + ((cx - q.x) / d) * 2.2;
        const z = cz + ((cz - q.z) / d) * 2.2;
        const dp = Math.hypot(x - q.x, z - q.z);
        if (!found && dp > 13 && dp < 25 && L.nav.isWalkable(x, z) && !L.hasLOS(q.x, q.z, x, z)) found = { q, x, z };
      }
    }
    if (!found) return { found: false };
    p.x = found.x;
    p.z = found.z;
    window.putAt(found.q);
    let locks = 0;
    let rounds = 0;
    window.until(() => b.lineT <= 0);
    const moveAfter =
      window.until(() => {
        if (b.state === 'lock') locks++;
        if (g.bullets.list.some((x) => x.alive && x.owner === 'enemy')) rounds++;
        return b.state === 'move';
      }, 1200) / 120;
    // on the move: hits from 4 m off his side take a segment
    const hp0 = b.hp;
    window.fire(b.cfg.perSegment, b.x + 4 * Math.sin(b.facing + 1.2), b.z + 4 * Math.cos(b.facing + 1.2));
    const moved = b.hp;
    const moving = b.state === 'move';
    // a flock across a locked line: at a post, the player in the open 16–22 m off, wait for the lock, then the pigeons burst up on the line
    window.until(() => b.state === 'post' && b.lineT <= 0, 2400);
    let clear = false;
    for (let a = 0; !clear && a < 2 * Math.PI; a += 0.05) {
      for (const d of [18, 16, 20, 22]) {
        p.x = b.x + Math.sin(a) * d;
        p.z = b.z + Math.cos(a) * d;
        if (L.nav.isWalkable(p.x, p.z) && L.hasLOS(b.x, b.z, p.x, p.z)) {
          clear = true;
          break;
        }
      }
    }
    window.until(() => b.state === 'lock', 1200);
    const locked = b.state === 'lock';
    const f = L.flocks[0];
    f.x = (b.x + p.x) / 2; // a flock resting halfway along the line
    f.z = (b.z + p.z) / 2;
    f.away = 0;
    L.startle(f, p.x, p.z);
    window.step();
    const broken = b.state !== 'lock';
    const notes = g.notes.events.slice(-12).map((e) => e.text);
    return { found: true, locks, rounds, moveAfter, hp0, moved, moving, clear, locked, broken, notes };
  });
  assert.ok(r.found, 'a lamp post stands between a post and a spot 12–26 m off');
  assert.equal(r.locks, 0, 'no lock with it between');
  assert.equal(r.rounds, 0, 'and no round');
  assert.ok(r.moveAfter > 1.4 && r.moveAfter < 1.7, `he moves on ${r.moveAfter} s after his line came up broken (1.5 s)`);
  assert.ok(r.moving, 'still on the move while the shots fly');
  assert.equal(r.moved, r.hp0 - 1, 'hits on the move take a segment');
  assert.ok(r.clear && r.locked, 'in the open his line locks on');
  assert.ok(r.broken, 'a flock bursting across it breaks the lock');
  assert.ok(r.notes.some((t) => t.includes('白鴿驚起，擋住長槍手的紅線')), `the notes say so (${r.notes.join(' / ')})`);
});

test('the player within 10 m sends him on to another post; no waiting: in 45 s never more than 3 s at a time with no way to hurt him, the first chance within 15 s; he is in the picture whenever his line stops on the player', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    window.toFinal();
    window.atPost();
    p.x = b.x + Math.sin(b.lineA) * 8;
    p.z = b.z + Math.cos(b.lineA) * 8;
    window.step();
    const near = b.state;
    window.toFinal();
    let longest = 0;
    let run = 0;
    let first = null;
    let locks = 0;
    let unseen = 0;
    const posts = new Set();
    for (let i = 0; i < 45 * 120; i++) {
      const was = b.state;
      window.step();
      if (b.state === 'lock' && was !== 'lock') {
        locks++;
        posts.add(`${b.target.x},${b.target.z}`);
        if (!window.onScreen(b.x, b.z) || !window.onScreen(p.x, p.z)) unseen++;
      }
      if (b.vulnerable()) {
        if (first === null) first = i / 120;
        run = 0;
      } else longest = Math.max(longest, (run += 1 / 120));
    }
    return { near, longest, first, locks, unseen, posts: posts.size };
  });
  assert.equal(r.near, 'move', 'the player 8 m off: he moves on');
  assert.ok(r.first !== null && r.first <= 15, `the first chance at ${r.first} s`);
  assert.ok(r.longest <= 3, `never out of reach for more than 3 s (${r.longest.toFixed(2)})`);
  assert.ok(r.locks >= 5 && r.posts >= 2, `${r.locks} locks from ${r.posts} posts in 45 s`);
  assert.equal(r.unseen, 0, `every lock with him and the player in the picture (${r.unseen} of ${r.locks} not)`);
});

test('five segments: he goes down, BOSS +2,000, the wave ends', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal();
    window.atPost();
    const score0 = g.score.score;
    for (let s = 0; s < 5 && b.active; s++) window.fire(b.cfg.perSegment, b.x + 5, b.z + 0.5);
    for (let i = 0; i < 240; i++) window.step();
    return { active: b.active, downed: b.downed, gained: g.score.score - score0, state: g.waves.state, notes: g.notes.events.slice(-8).map((e) => e.text) };
  });
  assert.ok(!r.active && r.downed, 'down');
  assert.ok(r.gained >= 2000, `BOSS bonus (${r.gained})`);
  assert.notEqual(r.state, 'active', `the wave is over (${r.state})`);
  assert.ok(r.notes.some((t) => t.includes('長槍手倒下')), r.notes.join(' / '));
});

test('screenshot: his line stopped on the player, a moment before the round', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toFinal();
    window.atPost();
    window.until(() => b.state === 'lock' && b.timer < 0.3);
    g.updateCamera(1, true);
    b.sync();
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('boss-marksman-lock.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
