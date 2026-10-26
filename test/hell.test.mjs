// 彈幕 ② A①: fast bullets in the rooms. The developer (2026-10-26, DECISIONS): the bullet hell he pictures is the
// arcade's fast fire (20–28 m/s, unchanged since the first day) filling the screen, read through bullet time, not the
// trial's slow rounds. So 彈幕試驗's waves are the arcade's men again, with the arcade's bullets and lasers, and the
// hell is how many fire at once (config.js HELL): nobody in a room waits for an aim token, a man fires again sooner
// (fireMul), more stand at once and they come in faster; every one glows as he aims (the heavy guns' tell), on top of
// his laser. The far side (對面陣地, the old card ⑧): each room's posts (rooms.js `posts`) are where its gunners go to
// stand and fire from; the player within HELL.postClose, or the post's cover gone, sends a man to another.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=47'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run, nobody about, the player at (x, z) in the teahouse. */
    window.toRoom = (x = 0, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.player.x = x;
      g.player.z = z;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** An arcade run on the rooftop, nobody about. */
    window.toArcade = () => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    window.step = () => {
      g.killcamT = 0;
      g.hitstopT = 0;
      g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
    };
    /** One of `type` coming in by the room's spawn `door` (the arcade's way in: he walks to the spot inside it, then fights). */
    window.enter = (type, door = 0) => {
      const e = g.enemies.spawn(type, g.level.spawns[door]);
      e.spawnLock = 0;
      return e;
    };
    /**
     * `seconds` of a run's first wave, the player standing still where he is, unhurt: the enemies' shots, the most
     * bullets in the air at once, how often an aim token was refused, and the men who came.
     */
    window.measure = (seconds) => {
      let shots = 0;
      let peak = 0;
      let refused = 0;
      const spawn0 = g.bullets.spawn.bind(g.bullets);
      g.bullets.spawn = (o) => {
        if (o.owner === 'enemy') shots++;
        return spawn0(o);
      };
      const req0 = g.enemies.requestToken.bind(g.enemies);
      g.enemies.requestToken = (e) => {
        const ok = req0(e);
        if (!ok) refused++;
        return ok;
      };
      g.waves.state = 'intermission';
      g.waves.timer = 0;
      const seen = new Set();
      for (let i = 0; i < seconds * 120; i++) {
        window.step();
        peak = Math.max(peak, g.bullets.list.filter((b) => b.owner === 'enemy').length);
        for (const e of g.enemies.list) seen.add(e.type);
      }
      g.bullets.spawn = spawn0;
      g.enemies.requestToken = req0;
      return { shots, peak, refused, perSec: shots / seconds, seen: [...seen], wave: g.waves.wave };
    };
  });
});
after(async () => {
  await h.close();
});

test('every room has at least four posts, all in the half away from its entry, walkable, apart, and each seeing most of the room', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    const out = [];
    for (const id of Object.keys(g.rooms)) {
      g.level.load(g.rooms[id]);
      const L = g.level;
      const t = L.map.room;
      const [side] = t.entry;
      const far = ([x, z]) => (side === 's' ? z < 0 : side === 'n' ? z > 0 : side === 'w' ? x > 0 : x < 0);
      // the room's open ground on a metre grid, and how much of it each post sees
      const cells = [];
      for (let x = -L.bounds.halfW + 1; x < L.bounds.halfW; x += 1) for (let z = -L.bounds.halfD + 1; z < L.bounds.halfD; z += 1) if (L.nav.isWalkable(x, z)) cells.push([x, z]);
      const posts = L.posts.map((p) => ({
        x: p.x,
        z: p.z,
        cover: p.cover,
        far: far([p.x, p.z]),
        walkable: L.nav.isWalkable(p.x, p.z),
        sees: cells.filter(([x, z]) => L.hasLOS(p.x, p.z, x, z)).length / cells.length,
        coverStands: !p.cover || L.solids.some((s) => s.alive && Math.hypot((s.minX + s.maxX) / 2 - p.cover[0], (s.minZ + s.maxZ) / 2 - p.cover[1]) < 1.5),
        nearest: Math.min(...L.posts.filter((o) => o !== p).map((o) => Math.hypot(o.x - p.x, o.z - p.z))),
      }));
      out.push({ id, entry: t.entry, posts });
    }
    return out;
  });
  for (const room of r) {
    assert.ok(room.posts.length >= 4, `${room.id}: ${room.posts.length} posts`);
    for (const p of room.posts) {
      const at = `${room.id} (${p.x}, ${p.z})`;
      assert.ok(p.far, `${at} is on the far side from the entry ${room.entry}`);
      assert.ok(p.walkable, `${at} is walkable`);
      assert.ok(p.sees >= 0.5, `${at} sees most of the room (${(p.sees * 100).toFixed(0)}%)`);
      assert.ok(p.coverStands, `${at} names a table that is there`);
      assert.ok(p.nearest >= 2, `${at} is apart from the next post (${p.nearest.toFixed(1)} m)`);
    }
  }
});

test('a wave in the room is the arcade’s men with the arcade’s bullets (no sniper, no drone); twice the arcade’s fire and more, nobody refused an aim token', { timeout: 10 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(0, 5);
    const hell = window.measure(25);
    const hellSpeeds = [...new Set(g.bullets.list.filter((b) => b.owner === 'enemy').map((b) => Math.round(b.speed)))];
    const look = [...new Set(g.bullets.list.filter((b) => b.owner === 'enemy').map((b) => b.look))];
    const roster = Array.from({ length: 6 }, (_, i) => g.waves.compose(i + 1));
    window.toArcade();
    const arcade = window.measure(25);
    return { hell, hellSpeeds, look, roster, arcade };
  });
  const banned = ['sniper', 'drone']; // the arcade's men but these; since A③ the heavy three and the slow walls come among them (test/mix.test.mjs)
  const all = r.roster.flat();
  assert.ok(!all.some((t) => banned.includes(t)), `no sniper, no drone: ${[...new Set(all)]}`);
  assert.ok(all.includes('grunt') && all.includes('rifle') && all.includes('brute'), `thugs, riflemen and a brute among them: ${[...new Set(all)]}`);
  assert.deepEqual(r.roster.map((w) => w.length), [5, 6, 7, 8, 9, 10], 'the wave sizes (MODES.danmaku roster)');
  assert.ok(r.hell.wave === 1 && r.arcade.wave === 1, `both measured in wave 1 (${r.hell.wave}, ${r.arcade.wave})`);
  assert.equal(r.hell.refused, 0, 'nobody in the room waited for an aim token');
  assert.ok(r.arcade.refused > 0, `in the arcade the tokens still limit who aims (${r.arcade.refused} refusals)`);
  assert.ok(r.hell.perSec >= 2 * r.arcade.perSec, `shots a second: room ${r.hell.perSec.toFixed(2)} vs arcade ${r.arcade.perSec.toFixed(2)}`);
  // the most in the air at once is the rate times a round's flight, and in a 22 m room a fast round meets a wall within
  // a second (on the rooftop it flies 70 m): no measure of the room's density, so only not fewer than the arcade's
  assert.ok(r.hell.peak >= r.arcade.peak, `bullets in the air at once: room ${r.hell.peak} vs arcade ${r.arcade.peak}`);
  assert.ok(r.hellSpeeds.every((v) => v >= 15), `the arcade's speeds, 20 m/s and up (${r.hellSpeeds})`);
  assert.ok(!r.look.includes('danmaku'), `the arcade's look, not the solid pink rounds (${r.look})`);
  console.log(`# hell wave 1: ${r.hell.shots} shots in 25 s (${r.hell.perSec.toFixed(2)}/s), ${r.hell.peak} in the air at most, ${r.hell.seen}; arcade wave 1: ${r.arcade.shots} shots (${r.arcade.perSec.toFixed(2)}/s), ${r.arcade.peak} at most`);
});

test('a thug coming into the room goes to a free post on the far side and holds it, firing from there with his laser and a glow; the player within 4 m sends him to another post; two men never share one', { timeout: 5 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(0, 5);
    const a = window.enter('grunt', 0);
    const b = window.enter('grunt', 1);
    const until = (cond, most) => {
      for (let i = 0; i < most; i++) {
        window.step();
        if (cond()) return i;
      }
      return -1;
    };
    const held = until(() => a.state === 'hold' && b.state === 'hold', 120 * 12);
    const postOf = (e) => (e.post ? g.level.posts.indexOf(e.post) : -1);
    const first = { a: postOf(a), b: postOf(b), ax: a.x, az: a.z, bx: b.x, bz: b.z };
    const atPost = (e) => e.post && Math.hypot(e.post.x - e.x, e.post.z - e.z) < 0.5;
    const atFirst = atPost(a) && atPost(b);
    // from the post: an aim with the laser and a glow, then shots
    let shots = 0;
    const spawn0 = g.bullets.spawn.bind(g.bullets);
    g.bullets.spawn = (o) => {
      if (o.source === a) shots++;
      return spawn0(o);
    };
    let glow = 0;
    let laser = false;
    let moved = 0;
    const ax0 = a.x;
    const az0 = a.z;
    until(() => {
      if (a.state === 'aim') {
        glow = Math.max(glow, a.glow);
        laser = laser || a.laser.mesh.visible;
      }
      moved = Math.max(moved, Math.hypot(a.x - ax0, a.z - az0));
      return shots > 0;
    }, 120 * 6);
    g.bullets.spawn = spawn0;
    // the player walks up to a's post: he gives it up for another, b keeps his
    const pa = a.post;
    g.player.x = pa.x;
    g.player.z = pa.z + 3.5; // 3.5 m off: within HELL.postClose, clear of the table he stands behind
    const left = until(() => a.post !== pa && a.state === 'hold', 120 * 12);
    const second = { a: postOf(a), b: postOf(b) };
    return { held, first, atFirst, shots, glow, laser, moved, left, second, far: g.level.posts.map((p) => p.z < 0) };
  });
  assert.ok(r.held >= 0, 'both came to hold a post');
  assert.ok(r.atFirst, 'standing on them');
  assert.notEqual(r.first.a, r.first.b, `two men, two posts (${r.first.a}, ${r.first.b})`);
  assert.ok(r.far[r.first.a] && r.far[r.first.b], 'both on the far (north) side of the teahouse');
  assert.ok(r.shots > 0, 'he fired from his post');
  assert.ok(r.glow > 0.5, `glowing as he aimed (${r.glow.toFixed(2)})`);
  assert.ok(r.laser, 'with his laser on');
  assert.ok(r.moved < 0.6, `standing at his post to fire, not strafing (${r.moved.toFixed(2)} m)`);
  assert.ok(r.left >= 0, 'the player within 4 m: he left for another post');
  assert.notEqual(r.second.a, r.first.a, 'another one');
  assert.notEqual(r.second.a, r.second.b, `not b's (${r.second.a}, ${r.second.b})`);
});

test('a post behind a table is given up once the table is flipped and shot to bits; a post naming no table is kept', { timeout: 5 * 60 * 1000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(0, 5);
    const a = window.enter('grunt', 0);
    const until = (cond, most) => {
      for (let i = 0; i < most; i++) {
        window.step();
        if (cond()) return i;
      }
      return -1;
    };
    // a's post: the first of the room's with a table (the aisle posts have none)
    const withCover = g.level.posts.filter((p) => p.cover);
    until(() => a.state === 'hold', 120 * 12);
    if (!a.post || !a.post.cover) {
      a.post = withCover[0];
      a.state = 'move';
      until(() => a.state === 'hold', 120 * 12);
    }
    const post = a.post;
    const table = g.level.fixtures.find((f) => f.kind === 'table' && Math.hypot(f.x - post.cover[0], f.z - post.cover[1]) < 0.5);
    table.flip(table.x, table.z - 3); // kicked from the north: its top falls southward, between the table and the player
    const flipped = table.flipped && a.post === post;
    for (let i = 0; i < 60; i++) window.step();
    const stillHeld = a.post === post;
    // shot to bits: as many of the player's rounds as it takes (fixtures.js shot)
    for (let i = 0; i < 40 && !table.broken; i++) table.shot({ x: table.x, z: table.z + 1, dx: 0, dz: -1, owner: 'player', damage: 1 });
    const broken = table.broken;
    const gone = until(() => a.post !== post, 120 * 4);
    return { hadCover: !!post.cover, flipped, stillHeld, broken, gone, now: a.post ? g.level.posts.indexOf(a.post) : -1 };
  });
  assert.ok(r.hadCover, 'a post behind a table');
  assert.ok(r.flipped && r.stillHeld, 'flipped, the table is still cover: he keeps the post');
  assert.ok(r.broken, 'shot to bits');
  assert.ok(r.gone >= 0, 'the cover gone: he gave the post up');
});

test('the shotgunner comes on as ever (his gun does not reach a post), the brute and the rifleman take posts; in the arcade nobody glows and the tokens stand', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(0, 5);
    const types = ['shotgun', 'brute', 'rifle', 'grenadier', 'captain', 'rusher', 'bomber', 'shield'];
    const men = types.map((t, i) => window.enter(t, i % g.level.spawns.length));
    const posts = Object.fromEntries(types.map((t) => [t, men[types.indexOf(t)].postsFor]));
    window.toArcade();
    const e = g.enemies.spawn('grunt', { x: g.player.x, z: g.player.z - 8, ex: g.player.x, ez: g.player.z - 7.9, stay: true });
    e.spawnLock = 0;
    e.state = 'move';
    e.fireCd = 0;
    let glow = 0;
    let aimed = false;
    for (let i = 0; i < 120 * 3; i++) {
      window.step();
      if (e.state === 'aim') {
        aimed = true;
        glow = Math.max(glow, e.glow);
      }
    }
    return { posts, aimed, glow, restMul: e.restMul, inRoom: e.inRoom };
  });
  assert.deepEqual(r.posts, { shotgun: false, brute: true, rifle: true, grenadier: true, captain: true, rusher: false, bomber: false, shield: false });
  assert.ok(r.aimed && r.glow === 0, `in the arcade an aim is the laser alone (glow ${r.glow})`);
  assert.ok(!r.inRoom && r.restMul === 1, 'and the gap before the next shot is the type’s own');
});

test('the stats panel tunes HELL live: the fire gap, the crowd and the post distance', async () => {
  const r = await page.evaluate(async () => {
    const { HELL } = await import('./src/config.js');
    const { TUNABLES } = await import('./src/notes.js');
    const g = window.game;
    const paths = TUNABLES.map((t) => t.path).filter((p) => p.startsWith('HELL.'));
    const before = HELL.fireMul;
    g.notes.tune('HELL.fireMul', 0.3);
    const after = HELL.fireMul;
    g.notes.resetTuning();
    return { paths, before, after, reset: HELL.fireMul };
  });
  assert.deepEqual(r.paths, ['HELL.fireMul', 'HELL.maxAlive', 'HELL.postClose']);
  assert.ok(r.before > 0 && r.before < 1, `config.js's own (${r.before})`);
  assert.equal(r.after, 0.3);
  assert.equal(r.reset, r.before);
});

test('screenshot: the first wave in the teahouse, fast bullets and lasers from the far side, the player in bullet time', async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.toRoom(0, 5);
    for (const [t, d] of [['grunt', 0], ['rifle', 1], ['grunt', 2], ['rifle', 3], ['grunt', 0], ['rifle', 1], ['grunt', 2], ['brute', 3]]) window.enter(t, d);
    const hurt0 = g.player.hurt;
    g.player.hurt = () => false;
    // the moment with the most of their rounds in the air in the first twenty seconds, once they have settled at their posts
    const inAir = () => g.bullets.list.filter((b) => b.owner === 'enemy').length;
    let best = 0;
    for (let i = 0; i < 120 * 20; i++) {
      window.step();
      if (i > 120 * 6 && inAir() >= 14) break;
      best = Math.max(best, inAir());
    }
    g.player.hurt = hurt0;
    g.hurtFx = 0;
    g.setFocus(true);
    g.focusAmt = 1;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('hell-fast-bullets.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('the bot clears the three floors of the arcade’s men in god mode; the notes name the posts held and the floors', { timeout: 25 * 60 * 1000 }, async () => {
  await installBot(page, { map: 0, view: 2, seed: 5, mode: 'danmaku', restart: false, god: true });
  const r = await page.evaluate(() => {
    const g = window.game;
    const said = [];
    const log0 = g.notes.log.bind(g.notes);
    g.notes.log = (text) => {
      said.push(text);
      return log0(text);
    };
    let frames = 0;
    while (g.state === 'playing' && g.waves.state !== 'done' && frames < 60 * 60 * 16) {
      window.simStep(60);
      frames += 60;
    }
    g.notes.log = log0;
    return { wave: g.waves.wave, done: g.waves.state === 'done', s: frames / 60, notes: said, errors: window.stats.errors, shots: window.stats.enemyShots, floors: g.floors.length };
  });
  assert.deepEqual(r.errors, [], 'nothing thrown on the way');
  assert.equal(r.done, true, `cleared (wave ${r.wave}, ${r.s} s)`);
  assert.ok(r.notes.some((t) => t.includes('守住開火位')), 'a post held');
  assert.ok(r.notes.some((t) => t.includes('第 3 層開始')), `the third floor begun (${r.floors} floors)`);
  console.log(`# the bot's three floors: ${r.s} s, ${r.shots} enemy shots`);
  assert.deepEqual(problems(logs), []);
});
