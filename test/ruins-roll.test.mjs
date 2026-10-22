// 大三巴 Ruins of St. Paul's ②: the façade is only a façade. Its three
// doorways are open: a man walks through them and a shot flies through, and
// behind it lies the old nave, so the player can go round behind the wall and
// come out of another door. A barrel standing on the steps, shot or kicked,
// falls over and rolls down them (maps.js `slope`, level.js Barrel): faster as
// it goes, over the landings, until it stops on the level ground below; it
// bowls over whoever is in its way, the first of a roll ROLLING +150.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=48'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.ruins = () => g.maps.findIndex((m) => m.id === 'ruins');
    /** A quiet run here: no waves, the player at (x, z). */
    window.begin = (x = 0, z = -17) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(window.ruins());
      g.waves.state = 'done';
      g.enemies.clear();
      g.setFocus(false);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
    };
    /** 120 Hz steps holding `held` (`pressed` on the first), aiming at (ax, az) or 5 m north; `each` after every step. */
    window.play = (n, held = [], aim = null, each = null, pressed = []) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.input.pressed.clear();
        if (i === 0) for (const k of pressed) g.input.pressed.add(k);
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = held.includes('Mouse0');
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
        g.present(1 / 120);
        if (each && each(i) === false) break;
      }
      g.input.keys.clear();
      g.input.mouse.left = false;
    };
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
    /** The style bonuses scored from now on, as `LABEL:points`. */
    window.styles = () => {
      const seen = [];
      const style0 = g.score.style.bind(g.score);
      g.score.style = (label, pts, ...a) => {
        seen.push(`${label}:${pts}`);
        return style0(label, pts, ...a);
      };
      return seen;
    };
  });
});
after(async () => {
  await h.close();
});

test('the façade: a wall with three open doorways, a shot flies through them and a man walks through; behind it the old nave, the way round from one door to another', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.begin(0, -19.5);
    const L = g.level;
    const facade = L.solids.filter((s) => s.matKey === 'facade' && s.h > 20);
    // shots north along the terrace (from its height), through each doorway and into the wall between them
    const doors = [-6, 0, 6].map((x) => L.raycast(x, -19.5, x, -24, false, 4.8, false));
    const walls = [-10, -3.2, 3.2, 10].map((x) => L.raycast(x, -19.5, x, -24, false, 4.8, false));
    // round behind: from the west end of the terrace to behind the façade's east end, and out again
    const behind = L.nav.findPath(-12, -18, 7.5, -24.5);
    const back = L.nav.findPath(7.5, -24.5, 12, -18);
    // a walk through the middle doorway
    const p = g.player;
    window.play(240, ['KeyW']);
    const walked = { z: p.z, y: p.rig.root.position.y };
    // shooting through a doorway at a man behind the façade, and at one behind the wall
    window.begin(0, -17);
    const inDoor = window.post('grunt', 0, -24.2);
    inDoor.hp = 1;
    window.play(90, ['Mouse0'], [0, -24.2]);
    window.begin(-3.2, -17);
    const behindWall = window.post('grunt', -3.2, -23.5);
    behindWall.hp = 1;
    window.play(90, ['Mouse0'], [-3.2, -23.5]);
    return {
      pieces: facade.length,
      doors: doors.map((hit) => (hit ? hit.solid.matKey : null)),
      walls: walls.map((hit) => (hit ? hit.solid.matKey : null)),
      behind: behind ? Math.min(...behind.map((q) => q.z)) : null,
      back: !!back,
      walked,
      shotThrough: !inDoor.alive,
      shielded: behindWall.alive,
    };
  });
  assert.equal(r.pieces, 4, 'the façade stands in four pieces between its three doorways');
  assert.deepEqual(r.doors, [null, null, null], 'a shot flies through each doorway');
  assert.deepEqual(r.walls, ['facade', 'facade', 'facade', 'facade'], 'and stops at the wall between them');
  assert.ok(r.behind !== null && r.behind < -23.5, 'the way round goes behind the façade');
  assert.equal(r.back, true, 'and out again by another door');
  assert.ok(r.walked.z < -23, `the player walks through the middle doorway (to z ${r.walked.z.toFixed(1)})`);
  assert.ok(Math.abs(r.walked.y - 4.8) < 0.05, `behind it, on the terrace's height (${r.walked.y.toFixed(2)})`);
  assert.equal(r.shotThrough, true, 'a man in the doorway’s line is shot through it');
  assert.equal(r.shielded, true, 'one behind the wall is not');
  assert.deepEqual(problems(logs), []);
});

test('a barrel on the steps, shot once, falls over and rolls down them: faster as it goes, to a stop on the forecourt; it bowls over the man in its way, ROLLING +150 once', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(-9.5, 2.5); // on the first landing, above the barrel on the first flight
    const barrel = L.barrels.find((b) => b.alive && L.slopeAt(b.x, b.z) && b.z > 4 && b.z < 9);
    const home = [barrel.x, barrel.z];
    const man = window.post('grunt', barrel.x, 13);
    const styles = window.styles();
    let bowled = false;
    const track = [];
    const each = () => {
      if (man.stunT > 0) bowled = true;
      else [man.x, man.z] = [barrel.x, 13]; // he waits in its road
      track.push([Math.round(barrel.z * 100) / 100, Math.hypot(barrel.vx, barrel.vz)]);
    };
    window.play(1, ['Mouse0'], [barrel.x, barrel.z]); // one shot
    for (let i = 0; i < 60 && barrel.hp === barrel.maxHp; i++) window.play(1, [], [barrel.x, barrel.z]);
    const shot = barrel.hp < barrel.maxHp;
    track.length = 0;
    // and on until it stops
    for (let i = 0; i < 120 * 8 && (i < 10 || Math.hypot(barrel.vx, barrel.vz) > 0); i++) window.play(1, [], [barrel.x, 20], each);
    const onFlight = track.filter(([z]) => z > 4.2 && z < 8.8);
    return {
      home,
      shot,
      alive: barrel.alive,
      hp: barrel.hp,
      rolling: barrel.rolling,
      end: { z: barrel.z, speed: Math.hypot(barrel.vx, barrel.vz), ground: L.groundY(barrel.x, barrel.z) },
      faster: onFlight.length > 2 ? onFlight[onFlight.length - 1][1] > onFlight[0][1] : false,
      top: Math.max(...track.map(([, s]) => s)),
      bowled,
      styles,
      notes: g.notes.events.map((e) => e.text).filter((t) => t.includes('油桶')),
    };
  });
  assert.equal(r.shot, true, 'the barrel took a shot');
  assert.equal(r.alive, true, `one shot does not burst it (${r.hp} left)`);
  assert.equal(r.faster, true, 'it rolls faster down the flight');
  assert.ok(r.top > 5, `up to ${r.top.toFixed(1)} m/s`);
  assert.ok(r.end.z > 10 && r.end.ground === 0 && r.end.speed === 0, `it stops on the forecourt (z ${r.end.z.toFixed(1)}, ${r.end.speed.toFixed(2)} m/s)`);
  assert.equal(r.bowled, true, `the man in its way is bowled over (it stopped at z ${r.end.z.toFixed(2)}, top ${r.top.toFixed(1)} m/s)`);
  assert.deepEqual(r.styles.filter((s) => s.startsWith('ROLLING')), ['ROLLING:150'], `ROLLING +150 once (${r.styles.join(', ')})`);
  assert.ok(r.notes.some((t) => t.includes('ROLLING')), `the notes say so: ${r.notes.join(' / ')}`);
  assert.deepEqual(problems(logs), []);
});

test('kicked off the top of the steps, a barrel rolls down all three flights; one left alone stands where it is; a restart stands them all up at home', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    window.begin(4.5, -14.2);
    const top = L.barrels.find((b) => b.alive && b.z < -12 && b.z > -14);
    const still = L.barrels.filter((b) => b !== top && b.alive && L.slopeAt(b.x, b.z));
    const stillAt = still.map((b) => [b.x, b.z]);
    // face south and kick (F): the barrel at the terrace's edge goes over it
    window.play(20, [], [top.x, top.z + 3]);
    window.play(1, [], [top.x, top.z + 3], null, ['KeyF']);
    for (let i = 0; i < 120 * 10 && (i < 60 || Math.hypot(top.vx, top.vz) > 0); i++) window.play(1, [], [top.x, top.z + 3]);
    const kicked = { z: top.z, rolling: top.rolling, ground: L.groundY(top.x, top.z), lying: Math.abs(top.lie.rotation.z) > 1 };
    const moved = still.map((b, i) => Math.hypot(b.x - stillAt[i][0], b.z - stillAt[i][1]));
    // a restart: every barrel home and standing
    window.begin();
    const home = L.barrels.every((b) => b.alive && !b.rolling && b.x === b.home[0] && b.z === b.home[1] && b.lie.rotation.z === 0);
    return { kicked, moved, home };
  });
  assert.equal(r.kicked.lying, true, 'kicked, it lies on its side');
  assert.ok(r.kicked.z > 9 && r.kicked.ground === 0, `it rolled down all three flights to the forecourt (z ${r.kicked.z.toFixed(1)})`);
  assert.ok(r.moved.every((d) => d < 0.01), `the barrels nobody touched stand where they were (${r.moved.map((d) => d.toFixed(2))})`);
  assert.equal(r.home, true, 'a restart stands them all up at home');
  assert.deepEqual(problems(logs), []);
});

test('screenshots: a barrel rolling down the steps at the men below; behind the façade', { timeout: 120000 }, async () => {
  await page.evaluate(() => {
    const g = window.game;
    const L = g.level;
    g.view = 2;
    window.begin(-9.5, 2.5);
    const barrel = L.barrels.find((b) => b.alive && L.slopeAt(b.x, b.z) && b.z > 4 && b.z < 9);
    for (const [x, z] of [
      [-9, 13.5],
      [-7.5, 15],
      [-4, 12.5],
    ])
      window.post('grunt', x, z);
    barrel.hit(1, 0, 1);
    window.play(40, [], [-9, 13.5]);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('ruins-roll.png', OUT).pathname });
  await page.evaluate(() => {
    const g = window.game;
    window.begin(3.5, -25);
    for (const [x, z] of [
      [-2, -18],
      [6, -17],
    ])
      window.post('grunt', x, z);
    window.play(60, [], [0, -19]);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('ruins-behind.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
