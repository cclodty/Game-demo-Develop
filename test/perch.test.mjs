// Balconies (福隆新街 ②: 露台). The shop fronts of 福隆新街 have balconies 3 m
// up (maps.js `perches`; level.js makes each a spawn of kind 'balcony'). A beat
// sends at most BEATS.perch of its riflemen, snipers and thugs up there: one
// steps out from inside onto the balcony and keeps it, never moving. From up
// there he sees over low cover and his shots fly over it; his laser and his
// bullets come down from the balcony. Nothing on the street reaches him (a
// kick, a pan, a net, a trolley): he is shot dead, and falls to the street, or
// a blast or a thrown thing knocks him off: FALL +150, dead. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=43'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on 福隆新街, the player at (x, z). */
    window.begin = (x = 0, z = 0) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(g.maps.findIndex((m) => m.id === 'felicidade'));
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** Step 120 Hz frames, aiming at (ax, az): `keys` pressed on the first; the player kept alive. */
    window.play = (n, ax, az, keys = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        const p = g.player;
        p.vx = p.vz = 0;
        p.hp = 100;
        g.input.pressed.clear();
        if (i === 0) for (const k of keys) g.input.pressed.add(k);
        g.aimPoint.set(ax, g.aimPoint.y, az);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
    };
    /** A man of `type` sent up to balcony `i`, stepped out onto it. */
    window.perch = (type, i) => {
      const e = g.enemies.spawn(type, g.level.balconies[i]);
      window.play(150, g.player.x, g.player.z - 5);
      return e;
    };
    window.kills = () => g.notes.events.map((e) => e.text).filter((t) => t.startsWith('擊殺'));
  });
});
after(async () => {
  await h.close();
});

test('the balconies: up the shop fronts, about 3 m up, out over the street; a man sent to one steps out from inside the building and keeps it, however the player moves', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin(0, 0);
    const L = g.level;
    const balconies = L.balconies.map((b) => ({ kind: b.kind, y: b.perch, ex: b.ex, ez: b.ez, inside: !L.nav.isWalkable(b.x, b.z) }));
    const e = g.enemies.spawn('rifle', L.balconies[0]);
    const start = { x: e.x, z: e.z, y: e.y };
    window.play(150, 0, -5);
    const out = { x: e.x, z: e.z, y: e.y, state: e.state, perch: e.perch };
    // the player runs about the street below: he stays put
    const p = g.player;
    const seen = [];
    for (const [x, z] of [
      [-10, 1],
      [8, -1.5],
      [L.balconies[0].ex, 0],
    ]) {
      p.x = x;
      p.z = z;
      window.play(240, x, z - 5);
      seen.push([Math.round(e.x * 100) / 100, Math.round(e.z * 100) / 100, Math.round(e.y * 100) / 100]);
    }
    return { balconies, start, out, seen, at: [L.balconies[0].ex, L.balconies[0].ez], other: g.maps.filter((m) => m.id !== 'felicidade' && m.perches && m.perches.length).length };
  });
  assert.ok(r.balconies.length >= 4, `${r.balconies.length} balconies`);
  for (const b of r.balconies) {
    assert.equal(b.kind, 'balcony');
    assert.ok(b.y >= 2.8 && b.y <= 3.4, `about 3 m up (${b.y})`);
    assert.ok(Math.abs(b.ez) > 2 && Math.abs(b.ez) < 3, `out over the street from a shop front (${b.ez})`);
    assert.equal(b.inside, true, 'he comes out of the building');
  }
  assert.equal(r.other, 0, 'only 福隆新街 has them (這次不做: other maps)');
  assert.ok(Math.abs(r.start.y - r.balconies[0].y) < 0.01, 'up there from the start');
  assert.deepEqual([Math.round(r.out.x * 100) / 100, Math.round(r.out.z * 100) / 100], r.at.map((v) => Math.round(v * 100) / 100), 'out on the balcony');
  assert.notEqual(r.out.state, 'enter');
  assert.ok(r.out.perch > 0);
  for (const s of r.seen) assert.deepEqual(s, [...r.seen[0]], 'he never moves');
  assert.deepEqual(problems(logs), []);
});

test('up there he sees over low cover and fires over it; his laser and his bullets come down from the balcony', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    // a mahjong table in the street, the player beyond it from the balcony nearest it
    const table = L.solids.find((s) => s.matKey === 'mahjong');
    const tx = (table.minX + table.maxX) / 2;
    const tz = (table.minZ + table.maxZ) / 2;
    const i = L.balconies.map((b, k) => [Math.hypot(b.ex - tx, b.ez - tz), k]).sort((a, b) => a[0] - b[0])[0][1];
    const b = L.balconies[i];
    const ux = (tx - b.ex) / Math.hypot(tx - b.ex, tz - b.ez);
    const uz = (tz - b.ez) / Math.hypot(tx - b.ex, tz - b.ez);
    window.begin(tx + ux * 1.6, tz + uz * 1.6);
    const p = g.player;
    const e = window.perch('rifle', i);
    const ground = L.hasLOS(e.x, e.z, p.x, p.z); // what a man on the street there would see
    window.play(30, p.x, p.z - 5);
    // wait for his aim, then his shot
    let n = 0;
    let laser = null;
    while (!laser && n++ < 1200) {
      window.play(1, p.x, p.z - 5);
      if (e.state === 'aim' && e.laser.mesh.visible) laser = { y: e.laser.mesh.position.y, tilt: e.laser.mesh.rotation.x };
    }
    let bullet = null;
    const before = new Set(g.bullets.list);
    n = 0;
    while (!bullet && n++ < 1200) {
      window.play(1, p.x, p.z - 5);
      const b2 = g.bullets.list.find((x) => x.alive && x.owner === 'enemy' && !before.has(x));
      if (b2) bullet = { y: b2.group.position.y, over: b2.over };
    }
    return { ground, sees: e.los, laser, bullet, perch: e.perch, table: table.h };
  });
  assert.equal(r.ground, false, 'from the street, the table would hide the player');
  assert.equal(r.sees, true, 'from the balcony it does not');
  assert.ok(r.laser && r.laser.y > r.perch, `his laser starts up there (${r.laser && r.laser.y})`);
  assert.ok(r.laser.tilt > 0.05, `and slopes down to the player (${r.laser.tilt})`);
  assert.ok(r.bullet && r.bullet.y > r.perch, `his bullet leaves from up there (${r.bullet && r.bullet.y})`);
  assert.ok(r.bullet.over > r.table, 'and flies over the table');
  assert.deepEqual(problems(logs), []);
});

test('from the street nothing reaches him: a kick, a body bowled at him; shot, he dies and drops to the street', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin(0, 0);
    const L = g.level;
    const b = L.balconies[0];
    const p = g.player;
    const e = window.perch('rifle', 0);
    // right under him: a kick
    p.x = b.ex;
    p.z = b.ez + Math.sign(-b.ez) * 0.6;
    window.play(1, b.ex, b.ez, ['KeyF']);
    window.play(60, b.ex, b.ez);
    const kicked = { stun: e.stunT, hp: e.hp, alive: e.alive };
    // a thug kicked into the spot under him
    const t = g.enemies.spawn('grunt', { x: b.ex + 2.5, z: b.ez + Math.sign(-b.ez) * 0.4, ex: b.ex + 2.5, ez: b.ez + Math.sign(-b.ez) * 0.4, stay: true });
    t.spawnLock = 0;
    t.kick(-1, 0, 14);
    window.play(90, b.ex, b.ez);
    const bowled = { stun: e.stunT, alive: e.alive, x: e.x, z: e.z };
    // shot: a bullet from the player's side, at him
    g.bullets.spawn({ x: b.ex, z: b.ez + Math.sign(-b.ez) * 4, dx: 0, dz: Math.sign(b.ez), speed: 60, owner: 'player', damage: 99 });
    let n = 0;
    while (e.alive && n++ < 240) window.play(1, b.ex, b.ez);
    const dead = { alive: e.alive, log: window.kills().at(-1) || '' };
    window.play(120, b.ex, b.ez);
    return { kicked, bowled, at: [b.ex, b.ez], dead, landed: Math.round(e.y * 100) / 100, aloft: e.aloft };
  });
  assert.deepEqual(r.kicked, { stun: 0, hp: r.kicked.hp, alive: true }, 'a kick from below does nothing');
  assert.ok(r.kicked.hp > 0);
  assert.deepEqual([r.bowled.stun, r.bowled.alive, r.bowled.x, r.bowled.z], [0, true, ...r.at], 'a body bowled under him does nothing');
  assert.equal(r.dead.alive, false, 'a bullet kills him');
  assert.doesNotMatch(r.dead.log, /FALL/, 'shot is shot, not a fall');
  assert.equal(r.landed, 0, 'and he drops to the street');
  assert.deepEqual(problems(logs), []);
});

test('a blast knocks him off the balcony: dead, FALL +150; so does a thrown pan', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin(0, 0);
    const L = g.level;
    const out = {};
    // a blast just below him
    const e = window.perch('rifle', 0);
    const b = L.balconies[0];
    const score0 = g.score.score;
    g.explode(b.ex, b.ez + Math.sign(-b.ez) * 1.2, 2.5, { kind: 'barrel' });
    window.play(60, 0, -5);
    out.blast = { alive: e.alive, log: window.kills().at(-1) || '', gained: g.score.score - score0 };
    // a pan thrown up at another one
    const e2 = window.perch('sniper', 1);
    const b2 = L.balconies[1];
    const p = g.player;
    p.x = b2.ex + 3;
    p.z = b2.ez + Math.sign(-b2.ez) * 2;
    const pan = L.pans[0];
    pan.x = p.x;
    pan.z = p.z;
    g.thrown.pickUp(pan);
    window.play(2, b2.ex, b2.ez);
    window.play(1, b2.ex, b2.ez, ['KeyG']);
    let n = 0;
    while (e2.alive && n++ < 240) window.play(1, b2.ex, b2.ez);
    out.pan = { alive: e2.alive, log: window.kills().at(-1) || '' };
    window.play(120, 0, -5);
    out.landed = [Math.round(e.y * 100) / 100, Math.round(e2.y * 100) / 100];
    return out;
  });
  assert.equal(r.blast.alive, false, 'the blast below knocks him off');
  assert.match(r.blast.log, /FALL/);
  assert.ok(r.blast.gained >= 150, `FALL +150 (${r.blast.gained})`);
  assert.equal(r.pan.alive, false, 'a pan thrown up at him knocks him off');
  assert.match(r.pan.log, /FALL/);
  assert.deepEqual(r.landed, [0, 0], 'both on the street');
  assert.deepEqual(problems(logs), []);
});

test('a beat sends at most two up: over three waves on 福隆新街 some beats have men on the balconies, none more than two; a map without balconies none', { timeout: 300000 }, async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const count = (mapId) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(g.maps.findIndex((m) => m.id === mapId));
      const perBeat = {};
      const spawn0 = g.enemies.spawn.bind(g.enemies);
      g.enemies.spawn = (type, sp, ...a) => {
        const key = `${g.waves.wave}/${g.waves.beatI}`;
        perBeat[key] = perBeat[key] || { up: 0, all: 0, types: [] };
        perBeat[key].all++;
        if (sp.kind === 'balcony') {
          perBeat[key].up++;
          perBeat[key].types.push(type);
        }
        return spawn0(type, sp, ...a);
      };
      let n = 0;
      while (g.waves.wave < 4 && n++ < 60 * 300) {
        for (const e of g.enemies.list) if (e.alive && e.spawnLock <= 0 && e.state !== 'enter') e.die(0, -1, { cause: 'bullet' });
        g.player.hp = 100;
        g.killcamT = 0;
        g.updatePlay(1 / 60);
      }
      g.enemies.spawn = spawn0;
      return Object.values(perBeat);
    };
    return { felicidade: count('felicidade'), docks: count('docks') };
  });
  const up = r.felicidade.map((b) => b.up);
  assert.ok(Math.max(...up) <= 2, `at most two a beat (${up})`);
  assert.ok(up.some((n) => n > 0), `some beats send men up (${up})`);
  for (const b of r.felicidade) for (const t of b.types) assert.ok(['rifle', 'sniper', 'grunt'].includes(t), `a ${t} on a balcony`);
  assert.equal(r.docks.reduce((s, b) => s + b.up, 0), 0, 'the docks have no balconies');
  assert.deepEqual(problems(logs), []);
});

test('screenshot: a rifleman on a balcony, his laser on the player in the street', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    g.view = 2;
    window.begin(0, 0);
    const L = g.level;
    const i = L.balconies.findIndex((b) => b.ez < 0);
    const b = L.balconies[i];
    const p = g.player;
    p.x = b.ex + 3;
    p.z = 1.2;
    const e = window.perch('rifle', i);
    let n = 0;
    while (!(e.state === 'aim' && e.aimT > e.aimTime * 0.6) && n++ < 1200) window.play(1, p.x + 4, p.z - 2);
    // what the tests before left on the screen (a boss banner, an achievement's toast) out of the shot
    for (const id of ['banner', 'toast']) document.getElementById(id).className = '';
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('balcony.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
