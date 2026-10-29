// F④a: the second batch of style cards (src/cards.js) and their tags. Every card carries tags (滑鏟, 人盾, 慢鏡, 反彈,
// 槍, 踢: cards.js TAGS), shown on the card; the pool is twelve, each drawn. Each new card does one thing, and nothing
// without it: a kick turns the rounds in its arc back (踢彈), a slide into a man trips him, dazed for an execution
// (滑鏟絆倒), a round the man held up takes goes back (人盾反彈), a magazine's last round goes through men (最後一發), a
// slide puts free bullet time on while it lasts (滑鏟慢鏡), a graze in bullet time puts a round back in the magazine
// (擦彈上膛). Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=84'));
  await page.evaluate(async () => {
    const g = window.game;
    window.cfg = await import('./src/config.js');
    g.frame = () => {};
    /** A quiet room of 彈幕試驗 (the teahouse), the player at (x, z), nobody about. LANE is an x clear of its tables. */
    window.LANE = 3.6;
    window.toRoom = (x = 0, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.challenge.offer = null;
      g.enemies.clear();
      g.bullets.clear();
      g.pickups.clear();
      g.setFocus(false);
      g.focusMeter = 1;
      g.view = 0;
      g.updateCamera(1, true);
      const p = g.player;
      p.x = x;
      p.z = z;
      p.vx = p.vz = 0;
      p.hp = 100;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** A man of `type` standing at (x, z) who never fires on his own. */
    window.post = (type, x, z) => {
      const e = g.enemies.spawn(type, { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      e.state = e.rushes ? 'chase' : 'move';
      e.fireCd = 999;
      return e;
    };
    /** 120 Hz steps holding `held`, pressing `press` on the first, aiming at (ax, az) (north of the player by default). */
    window.play = (n, held = [], press = [], ax = null, az = null) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.invuln = 0;
        g.input.pressed.clear();
        g.input.keys.clear();
        for (const k of held) g.input.keys.add(k);
        g.input.mouse.left = held.includes('Mouse0');
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.aimPoint.set(ax ?? g.player.x, g.aimPoint.y, az ?? g.player.z - 6);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
      }
    };
    /** The notes logged since `from` (an index into the log), the lines alone. */
    window.notesFrom = (from) => g.notes.events.slice(from).map((x) => x.text);
  });
});
after(async () => {
  await h.close();
});

test('twelve cards, each tagged from TAGS, both kinds; every one is drawn over the seeds; a card on the screen shows its tags', async () => {
  const r = await page.evaluate(async () => {
    const { CARDS, CARD_IDS, TAGS, drawOffer } = await import('./src/cards.js');
    const g = window.game;
    const seen = new Set();
    for (let i = 0; i < 200; i++) for (const id of drawOffer(g.rng.fork('cards-test', i), [])) seen.add(id);
    window.toRoom();
    g.showCards(['kickReturn', 'slideTrip', 'grazeReload']);
    const faces = [...document.querySelectorAll('#cards .card')].map((b) => b.querySelector('.card-tags')?.textContent || '');
    g.hideCards();
    return {
      ids: CARD_IDS,
      tags: Object.fromEntries(CARD_IDS.map((id) => [id, CARDS[id].tags])),
      kinds: [...new Set(CARD_IDS.map((id) => CARDS[id].kind))].sort(),
      tagIds: Object.keys(TAGS),
      tagNames: Object.fromEntries(Object.entries(TAGS).map(([k, t]) => [k, t.name])),
      seen: [...seen].sort(),
      faces,
      want: ['kickReturn', 'slideTrip', 'grazeReload'].map((id) => CARDS[id].tags),
    };
  });
  assert.equal(r.ids.length, 12, `twelve cards: ${r.ids}`);
  for (const id of r.ids) assert.ok(r.tags[id].length >= 1 && r.tags[id].every((t) => r.tagIds.includes(t)), `${id}: tags ${r.tags[id]}`);
  assert.deepEqual(r.kinds, ['action', 'slowmo']);
  assert.deepEqual(r.seen, [...r.ids].sort(), 'every card drawn');
  r.faces.forEach((face, i) => r.want[i].forEach((t) => assert.ok(face.includes(r.tagNames[t]), `card ${i}: ${face} names ${t}`)));
});

test('踢彈: a kick turns the round coming at the player back, his own; without the card the round hits him', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (card) => {
      const x = window.LANE;
      window.toRoom(x, 4);
      if (card) g.cards.held = [card];
      window.post('grunt', x, -4);
      const b = g.bullets.spawn({ x, z: 2.6, dx: 0, dz: 1, speed: 20, owner: 'enemy', damage: 10, range: 60, look: 'enemy' });
      const from = g.notes.events.length;
      window.play(1, [], ['KeyF']); // the kick, facing north (the aim)
      let turned = b.owner === 'player';
      for (let i = 0; i < 60; i++) {
        window.play(1);
        if (b.owner === 'player') turned = true;
      }
      return { turned, hurt: 100 - g.player.hp, notes: window.notesFrom(from).filter((t) => t === '踢彈') };
    };
    return { with: run('kickReturn'), without: run(null) };
  });
  assert.ok(r.with.turned, 'the round turned back');
  assert.equal(r.with.hurt, 0, 'unhurt');
  assert.ok(r.with.notes.length >= 1, 'the note');
  assert.ok(!r.without.turned && r.without.hurt > 0, `without the card it hits him: hurt ${r.without.hurt}`);
});

test('滑鏟絆倒: a slide into a man trips him, dazed, and F finishes him; without the card he stays on his feet', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (card) => {
      const x = window.LANE;
      window.toRoom(x, 6);
      if (card) g.cards.held = [card];
      const e = window.post('grunt', x, 0);
      const hp0 = e.hp;
      const from = g.notes.events.length;
      let slid = false;
      let tripped = false;
      for (let i = 0; i < 240 && !tripped; i++) {
        const near = Math.hypot(e.x - g.player.x, e.z - g.player.z) < 2.4;
        window.play(1, ['KeyW'], near && !slid ? ['KeyC'] : [], x, -10);
        if (g.player.sliding) slid = true;
        if (e.stunT > 0) tripped = true;
        if (slid && !g.player.sliding && i > 120) break;
      }
      const cause = e.stunCause;
      const hp = e.hp;
      window.play(1, [], ['KeyF'], x, -10);
      window.play(60, [], [], x, -10);
      return { slid, tripped, cause, hurt: hp0 - hp, dead: !e.alive, notes: window.notesFrom(from).filter((t) => t.startsWith('滑鏟絆倒')) };
    };
    return { with: run('slideTrip'), without: run(null) };
  });
  assert.ok(r.with.slid && r.with.tripped, 'slid into him and tripped him');
  assert.equal(r.with.cause, 'kick', 'dazed as from a kick');
  assert.equal(r.with.hurt, 0, 'a trip, no harm');
  assert.ok(r.with.dead, 'F finished him');
  assert.ok(r.with.notes.length >= 1, 'the note');
  assert.ok(r.without.slid && !r.without.tripped && !r.without.dead, 'without the card he stays on his feet');
});

test('人盾反彈: a round the man held up takes goes back, the player’s own (the man still takes it); without the card it stops in him', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (card) => {
      window.toRoom(-4, 5);
      if (card) g.cards.held = [card];
      const a = window.post('grunt', -2.8, 5);
      window.post('grunt', 4, 5);
      window.play(1, [], ['KeyE'], 4, 5);
      const held = g.player.hostage === a;
      const hp0 = a.hp;
      const b = g.bullets.spawn({ x: 1, z: 5, dx: -1, dz: 0, speed: 20, owner: 'enemy', damage: 10, range: 60, look: 'enemy' });
      let turned = false;
      for (let i = 0; i < 40; i++) {
        window.play(1, [], [], 4, 5);
        if (b.owner === 'player') turned = true;
      }
      return { held, turned, took: hp0 - a.hp, hurt: 100 - g.player.hp };
    };
    return { with: run('shieldReturn'), without: run(null) };
  });
  assert.ok(r.with.held, 'held up');
  assert.ok(r.with.turned, 'the round went back');
  assert.ok(r.with.took > 0, `the man held took it: ${r.with.took}`);
  assert.equal(r.with.hurt, 0);
  assert.ok(r.without.held && !r.without.turned && r.without.took > 0, 'without the card it stops in him');
});

test('最後一發: the magazine’s last round goes through the first man into the second; another round, or without the card, stops in the first', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (card, ammo) => {
      const x = window.LANE;
      window.toRoom(x, 5);
      if (card) g.cards.held = [card];
      const a = window.post('grunt', x, 1);
      const b = window.post('grunt', x, -2);
      const hpA = a.hp;
      const hpB = b.hp;
      g.player.ammo = ammo;
      g.player.fireCd = 0;
      window.play(1, ['Mouse0'], [], x, -10);
      window.play(60, [], [], x, -10);
      return { first: a.hp < hpA, second: b.hp < hpB };
    };
    return { last: run('lastRound', 1), notLast: run('lastRound', 10), without: run(null, 1) };
  });
  assert.ok(r.last.first && r.last.second, `the last round through both: ${JSON.stringify(r.last)}`);
  assert.ok(r.notLast.first && !r.notLast.second, `another round stops in the first: ${JSON.stringify(r.notLast)}`);
  assert.ok(r.without.first && !r.without.second, `without the card too: ${JSON.stringify(r.without)}`);
});

test('滑鏟慢鏡: a slide puts bullet time on at no cost while it lasts, off after; without the card no bullet time', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (card) => {
      window.toRoom(window.LANE, 6);
      if (card) g.cards.held = [card];
      window.post('grunt', -5, -6);
      g.focusMeter = 0.5;
      window.play(30, ['KeyW'], [], window.LANE, -10);
      window.play(1, ['KeyW'], ['KeyC'], window.LANE, -10);
      let on = false;
      let low = 1;
      while (g.player.sliding) {
        window.play(1, ['KeyW'], [], window.LANE, -10);
        if (g.player.sliding) {
          on = on || g.focusActive;
          low = Math.min(low, g.focusMeter);
        }
      }
      window.play(24, ['KeyW'], [], window.LANE, -10);
      return { on, low, after: g.focusActive };
    };
    return { with: run('slideSlow'), without: run(null) };
  });
  assert.ok(r.with.on, 'bullet time on in the slide');
  assert.ok(r.with.low >= 0.5 - 1e-9, `at no cost: the meter at ${r.with.low}`);
  assert.equal(r.with.after, false, 'off after the slide');
  assert.ok(!r.without.on, 'without the card no bullet time');
});

test('擦彈上膛: a graze in bullet time puts a round back in the magazine (never past a full one); out of bullet time, or without the card, none', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { GRAZE } = window.cfg;
    const run = (card, focus, ammo = 10) => {
      window.toRoom(0, 4);
      if (card) g.cards.held = [card];
      window.post('grunt', 0, -6);
      g.player.ammo = ammo;
      if (focus) {
        g.setFocus(true);
        g.focusAmt = 1;
      }
      const grazes0 = g.grazes;
      g.bullets.spawn({ x: GRAZE.radius * 0.5, z: -4, dx: 0, dz: 1, speed: 20, owner: 'enemy', damage: 10, range: 60, look: 'enemy' });
      for (let i = 0; i < (focus ? 600 : 120); i++) window.play(1);
      return { grazed: g.grazes - grazes0, ammo: g.player.ammo };
    };
    const mag = window.game.player.weapon.mag;
    return { with: run('grazeReload', true), full: run('grazeReload', true, mag), awake: run('grazeReload', false), without: run(null, true), mag };
  });
  assert.ok(r.with.grazed >= 1 && r.with.ammo === 11, `a graze, a round back: ${JSON.stringify(r.with)}`);
  assert.equal(r.full.ammo, r.mag, 'never past a full magazine');
  assert.ok(r.awake.grazed >= 1 && r.awake.ammo === 10, `out of bullet time none: ${JSON.stringify(r.awake)}`);
  assert.ok(r.without.grazed >= 1 && r.without.ammo === 10, `without the card none: ${JSON.stringify(r.without)}`);
});

test('screenshot: the card screen with the new cards and their tags', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.toRoom();
    for (const id of ['gameover', 'replays', 'title']) document.getElementById(id).classList.add('hidden');
    g.showCards(['kickReturn', 'slideSlow', 'shieldReturn']);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('cards-tags.png', OUT).pathname });
  await page.evaluate(() => window.game.hideCards());
  assert.deepEqual(problems(logs), []);
});
