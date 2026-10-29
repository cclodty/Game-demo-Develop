// 彈幕 ② E⑤: the quay (rooms.js QUAY), the docks remade as a fight room in the floors' draw. Its own things, both the
// docks' (level.js `water`, the hand trolley): the north side is the quay's knee-high curb with the harbour beyond it,
// the gunners' posts along it, so a man kicked north goes over the curb into the sea (SPLASH) and is gone; a hand
// trolley kicked at a row of them bowls them over (BOWLING), and one knocked towards the water goes in too. The room
// validates as the others do (test/maps.test.mjs, test/hell.test.mjs) and is drawn into floors (test/floor.test.mjs).
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=55'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A quiet run on the quay (the first floor's second room made the quay), the player at (x, z), nobody about. */
    window.toQuay = (x = -4, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.floors[0][1] = 'quay';
      g.floor = g.floors.flat();
      g.stage = 1;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.setFocus(false);
      g.player.placeAtStart();
      g.player.x = x;
      g.player.z = z;
      g.player.vx = g.player.vz = 0;
      g.player.hp = 100;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** A man of `type` standing at (x, z) who never fires. */
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
    /** 120 Hz steps holding `held`, `press` on the first, aiming at (ax, az); the player kept whole. */
    window.play = (n, { held = [], press = [], aim = null } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
        g.input.pressed.clear();
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        if (aim) g.aimPoint.set(aim[0], g.aimPoint.y, aim[1]);
        else g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
      g.input.keys.clear();
      g.input.pressed.clear();
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

test('the quay is in the floors’ draw; its north side a knee-high curb with the sea beyond it, the posts along it; hand trolleys and wooden crates; the exit in the east wall; the player walking north stops at the curb; four lights; the budget', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toQuay(-4, -4);
    const L = g.level;
    const room = L.map;
    const { halfD } = L.bounds;
    const p = g.player;
    const posts = L.posts.map((q) => [q.x, q.z]);
    window.play(240, { held: ['KeyW'] });
    const stopped = p.z;
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const info = g.renderer.info.render;
    return {
      pool: g.waves.rules.floor.pool,
      id: room.id,
      curb: room.edges.n,
      seaBeyond: L.waterAt(0, -halfD - 1) && !L.waterAt(0, -halfD + 0.5),
      posts,
      halfD,
      trolleys: L.props.filter((q) => q.kind === 'trolley').map((q) => q.name),
      crates: L.crates.length,
      exit: [L.exit.at.x, L.exit.at.z],
      stopped,
      lights: L.points.length,
      calls: info.calls,
      tris: info.triangles,
      budget: room.budget,
    };
  });
  await page.screenshot({ path: new URL('quay-quiet.png', OUT).pathname });
  assert.ok(r.pool.includes('quay'), `in the draw: ${r.pool}`);
  assert.equal(r.id, 'quay');
  assert.deepEqual(r.curb, [0.45, 'curb', null], 'a knee-high curb along the north');
  assert.ok(r.seaBeyond, 'the sea beyond it, none on the quay');
  assert.ok(r.posts.every(([, z]) => z < -r.halfD + 2.5), `the posts along the quay: ${JSON.stringify(r.posts)}`);
  assert.equal(r.trolleys.length, 2, `two trolleys: ${r.trolleys}`);
  assert.ok(r.crates >= 3, `${r.crates} crates`);
  assert.ok(r.exit[0] > 9, `the exit in the east wall: ${r.exit}`);
  assert.ok(r.stopped > -r.halfD, `the player stops at the curb (z ${r.stopped.toFixed(2)})`);
  assert.equal(r.lights, 4, 'four point lights');
  assert.ok(r.calls <= r.budget.calls && r.tris <= r.budget.tris, `${r.calls} draw calls, ${r.tris} triangles, budget ${r.budget.calls} / ${r.budget.tris}`);
  assert.deepEqual(problems(logs), []);
});

test('a man at a post on the quay, kicked north, goes over the curb into the sea: SPLASH, gone', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toQuay();
    const post = g.level.posts[2];
    const p = g.player;
    p.x = post.x;
    p.z = post.z + 1.1;
    const e = window.post('grunt', post.x, post.z);
    const kills0 = g.score.kills;
    window.play(2, { aim: [post.x, post.z - 5] }); // turned to him
    window.play(1, { press: ['KeyF'], aim: [post.x, post.z - 5] });
    for (let i = 0; i < 240 && e.alive; i++) window.play(1, { aim: [post.x, post.z - 5] });
    return { alive: e.alive, splashed: !!e.splashed, kills: g.score.kills - kills0, notes: g.notes.events.map((x) => x.text).filter((t) => t.includes('落水') || t.includes('SPLASH')) };
  });
  assert.ok(!r.alive && r.splashed, `into the sea: ${JSON.stringify(r)}`);
  assert.equal(r.kills, 1, 'a kill');
  assert.ok(r.notes.length >= 1, `the notes say so: ${r.notes.join(' / ')}`);
  assert.deepEqual(problems(logs), []);
});

test('a hand trolley kicked north at two men in its road bowls them both over: BOWLING; the one by the quay goes into the sea', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toQuay();
    const L = g.level;
    const trolley = L.props.find((q) => q.kind === 'trolley');
    // rolled nearer the quay first (as test/tools4.test.mjs moves the docks' one into the open): two men in its road,
    // 2 m apart and a little off one line (the first one knocked flies on ahead of it), the second by the curb
    [trolley.x, trolley.z, trolley.vx, trolley.vz] = [trolley.x, -L.bounds.halfD + 5.5, 0, 0];
    const p = g.player;
    p.x = trolley.x;
    p.z = trolley.z + 1;
    const men = [window.post('grunt', trolley.x, -L.bounds.halfD + 3.4), window.post('grunt', trolley.x + 0.2, -L.bounds.halfD + 1.4)];
    const styles = window.styles();
    window.play(2, { aim: [trolley.x, trolley.z - 5] });
    window.play(1, { press: ['KeyF'], aim: [trolley.x, trolley.z - 5] });
    const knocked = men.map(() => false);
    for (let i = 0; i < 360; i++) {
      window.play(1, { aim: [trolley.x, trolley.z - 5] });
      men.forEach((e, k) => {
        if (e.stunT > 0 || !e.alive) knocked[k] = true;
      });
    }
    return { knocked, splashed: men.map((e) => !!e.splashed), styles: styles.filter((s) => s.startsWith('BOWLING')) };
  });
  assert.deepEqual(r.knocked, [true, true], 'both bowled over');
  assert.deepEqual(r.styles, ['BOWLING:200'], 'BOWLING +200');
  assert.equal(r.splashed[1], true, `the man by the quay went into the sea: ${JSON.stringify(r.splashed)}`);
  assert.deepEqual(problems(logs), []);
});

test('screenshot: a trolley rolling into the men on the quay, one going over the curb into the sea', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toQuay();
    const L = g.level;
    const trolley = L.props.find((q) => q.kind === 'trolley');
    [trolley.x, trolley.z, trolley.vx, trolley.vz] = [trolley.x, -L.bounds.halfD + 5.5, 0, 0];
    const p = g.player;
    p.x = trolley.x;
    p.z = trolley.z + 1;
    const men = [window.post('grunt', trolley.x, -L.bounds.halfD + 3.4), window.post('grunt', trolley.x + 0.2, -L.bounds.halfD + 1.4)];
    window.post('rifle', L.posts[3].x, L.posts[3].z);
    window.post('grunt', L.posts[0].x, L.posts[0].z);
    window.play(2, { aim: [trolley.x, trolley.z - 5] });
    window.play(1, { press: ['KeyF'], aim: [trolley.x, trolley.z - 5] });
    for (let i = 0; i < 240 && !(men[1].stunT > 0 && men[1].z < -L.bounds.halfD + 0.8); i++) window.play(1, { aim: [trolley.x, trolley.z - 5] });
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { flying: men[1].stunT > 0 || !men[1].alive };
  });
  await page.screenshot({ path: new URL('quay.png', OUT).pathname });
  assert.ok(r.flying, 'the man by the quay knocked flying');
  assert.deepEqual(problems(logs), []);
});
