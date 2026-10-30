// 彈幕 ② C②: the style cards (src/cards.js). At the end of a floor but the last, three cards come up (both kinds among
// them, drawn from the run's seed) and the exit opens on the pick, a press of 1, 2 or 3 in the step's input (so a
// replay picks the same); each of the first six cards does one thing: a round that would catch the player sliding
// turns back (滑鏟反彈), a shoved human shield goes off (人盾引爆), a flipped table turns enemy rounds back (枱面反彈), a
// round grazed in bullet time turns back (擦彈反彈), a kill brings half a second of free bullet time (擊殺慢鏡), bullet
// time runs slower and drains faster (深慢鏡). The end screen names the cards held.
// Run: npm test
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
    /** A quiet room of 彈幕試驗, the player at (x, z), nobody about. */
    window.toRoom = (x = 0, z = 5) => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
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
    /** An enemy round from (x, z) toward the player, `speed` m/s. */
    window.shoot = (x, z, speed = 20) => {
      const p = g.player;
      const l = Math.hypot(p.x - x, p.z - z) || 1;
      return g.bullets.spawn({ x, z, dx: (p.x - x) / l, dz: (p.z - z) / l, speed, owner: 'enemy', damage: 10, range: 60, look: 'enemy' });
    };
    /** The run at a floor's last wave, cleared: the cards come up. */
    window.toFloorEnd = () => {
      window.toRoom();
      g.waves.state = 'active';
      g.waves.wave = g.floors[0].length * g.waves.rules.perStage; // the first floor's last wave
      g.waves.queue = [];
      g.waves.pending = [];
      g.player.hp = 100;
      window.play(1);
    };
  });
});
after(async () => {
  await h.close();
});

test('a floor’s last wave cleared offers three cards, both kinds among them, the same three for the same seed; the exit stays shut until the pick, a press of 2 keeps the second; the next floor offers three others (four after 半條命・四選一)', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFloorEnd();
    const offer = g.cards.offer ? [...g.cards.offer] : null;
    const state = g.waves.state;
    const shut = g.level.exit.locked;
    const shown = !document.getElementById('cards').classList.contains('hidden');
    const text = document.getElementById('cards').textContent;
    window.play(10);
    const stillShut = g.level.exit.locked && g.waves.state === 'cards';
    window.play(1, [], ['Digit2']);
    const held = [...g.cards.held];
    const open = !g.level.exit.locked && g.waves.state === 'exit';
    const hidden = document.getElementById('cards').classList.contains('hidden');
    const weapon = g.player.slot;
    // the second floor's end
    g.waves.wave = (g.floors[0].length + g.floors[1].length) * g.waves.rules.perStage;
    g.waves.state = 'active';
    window.play(1);
    const offer2 = g.cards.offer ? [...g.cards.offer] : null;
    window.play(1, [], ['Digit1']);
    const held2 = [...g.cards.held];
    const notes = g.notes.events.map((x) => x.text).filter((t) => t.includes('風格卡'));
    // the same seed again: the same first three
    window.toFloorEnd();
    const again = g.cards.offer ? [...g.cards.offer] : null;
    return { offer, state, shut, shown, text, stillShut, held, open, hidden, weapon, offer2, held2, again, notes };
  });
  const { CARDS } = await import('../src/cards.js');
  assert.ok(r.offer && r.offer.length === 3, `three cards: ${r.offer}`);
  assert.equal(r.state, 'cards');
  assert.ok(r.shut && r.stillShut, 'the exit shut while the cards are up');
  assert.ok(r.shown && r.offer.every((id) => r.text.includes(CARDS[id].name)), `the card screen names them: ${r.text}`);
  assert.ok(new Set(r.offer.map((id) => CARDS[id].kind)).size === 2, `both kinds: ${r.offer.map((id) => CARDS[id].kind)}`);
  assert.deepEqual(r.held, [r.offer[1]], 'a press of 2 keeps the second');
  assert.equal(r.weapon, 'pistols', 'the press picked a card, not a weapon');
  assert.ok(r.open && r.hidden, 'the exit opens on the pick, the screen goes');
  // three others, four after 半條命・四選一 (F④b: cards.js offerSize)
  const n2 = r.held[0] === 'halfHp' ? 4 : 3;
  assert.ok(r.offer2 && r.offer2.length === n2 && !r.offer2.includes(r.held[0]), `the second floor offers ${n2} others: ${r.offer2}`);
  assert.deepEqual(r.held2, [r.held[0], r.offer2[0]]);
  assert.deepEqual(r.again, r.offer, 'the same seed, the same three');
  assert.ok(r.notes.some((t) => t.startsWith('風格卡三選一')) && r.notes.some((t) => t === `風格卡：${CARDS[r.held[0]].name}`), `the notes: ${r.notes}`);
});

test('滑鏟反彈: a round that would pass over the player sliding turns back as his instead, at the man who fired; without the card it flies over him', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (card) => {
      window.toRoom(0, 4);
      if (card) g.cards.held = [card];
      const e = window.post('grunt', 0, -4);
      const hp0 = g.player.hp;
      // a run north, then a slide, the round coming south down the same line to meet him in it
      window.play(30, ['KeyW']);
      window.play(1, ['KeyW'], ['KeyC']);
      const slid = g.player.sliding;
      const b = window.shoot(0, g.player.z - 3, 20);
      let turned = false;
      for (let i = 0; i < 60; i++) {
        window.play(1, ['KeyW']);
        if (b.owner === 'player') turned = true;
      }
      return { slid, turned, hurt: hp0 - g.player.hp, enemyHp: e.hp, notes: g.notes.events.map((x) => x.text).filter((t) => t.includes('滑鏟彈回')) };
    };
    return { with: run('slideReflect'), without: run(null) };
  });
  assert.ok(r.with.slid, 'sliding');
  assert.ok(r.with.turned, 'the round turned back');
  assert.equal(r.with.hurt, 0, 'unhurt');
  assert.ok(r.with.notes.length >= 1, `the note: ${r.with.notes}`);
  assert.ok(!r.without.turned && r.without.hurt === 0, `without the card it flies over him: hurt ${r.without.hurt}`);
});

test('人盾引爆: a human shield shoved out goes off on the man he meets, with a blast that takes that man too; without the card he only flies', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { CARDS } = window.cfg;
    const run = (card) => {
      window.toRoom(-4, 5);
      if (card) g.cards.held = [card];
      const a = window.post('grunt', -2.8, 5);
      const b = window.post('grunt', 1.5, 5);
      window.play(1, [], ['KeyE'], 4, 5);
      const held = g.player.hostage === a;
      let boomed = false;
      const explode0 = g.explode.bind(g);
      g.explode = (x, z, r, o) => {
        if (o && o.source === '人盾引爆') boomed = true;
        return explode0(x, z, r, o);
      };
      window.play(1, [], ['KeyE'], 4, 5); // let go: shoved east
      const fuse = a.boomT;
      window.play(Math.round(CARDS.boomFuse * 120) + 12, [], [], 4, 5);
      const at = a.x;
      g.explode = explode0;
      return { held, fuse, boomed, aDead: !a.alive, bDead: !b.alive, at };
    };
    return { with: run('shoveBoom'), without: run(null) };
  });
  assert.ok(r.with.held, 'held');
  assert.ok(r.with.fuse > 0, `the fuse set on the shove: ${r.with.fuse}`);
  assert.ok(r.with.boomed && r.with.aDead, 'he went off');
  assert.ok(r.with.bDead, `the man he was shoved at went with him (he went off at x ${r.with.at})`);
  assert.ok(r.without.held && !r.without.boomed && !r.without.aDead, 'without the card he only flies');
});

test('枱面反彈: a flipped table sends an enemy round back as the player’s; without the card the table takes it', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (card) => {
      window.toRoom();
      if (card) g.cards.held = [card];
      const t = g.level.fixtures.find((f) => f.kind === 'table');
      const p = g.player;
      // the player south of the table, the kick flips it north; the man north of it fires south
      p.x = t.x;
      p.z = t.z + t.w + 1.2;
      window.play(1, [], ['KeyF'], t.x, t.z);
      const flipped = t.flipped;
      const e = window.post('grunt', t.x, t.z - 4);
      const wall = t.wall;
      const b = g.bullets.spawn({ x: t.x, z: t.z - 2.5, dx: 0, dz: 1, speed: 20, owner: 'enemy', damage: 10, range: 60, look: 'enemy' });
      let turned = false;
      for (let i = 0; i < 90; i++) {
        window.play(1, [], [], t.x, t.z);
        if (b.owner === 'player') turned = true;
      }
      return { flipped, wall: !!wall, turned, alive: b.alive, enemyAlive: e.alive, hurt: 100 - p.hp };
    };
    return { with: run('tableBounce'), without: run(null) };
  });
  assert.ok(r.with.flipped && r.with.wall, 'the table is up');
  assert.ok(r.with.turned, 'the round turned back');
  assert.equal(r.with.hurt, 0);
  assert.ok(!r.without.turned && r.without.hurt === 0, 'without the card the table takes the round');
});

test('擦彈反彈: a round grazed in bullet time turns back as the player’s; out of bullet time, or without the card, it flies on', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { GRAZE } = window.cfg;
    const run = (card, focus) => {
      window.toRoom(0, 4);
      if (card) g.cards.held = [card];
      window.post('grunt', 0, -6);
      if (focus) {
        g.setFocus(true);
        g.focusAmt = 1;
      }
      const grazes0 = g.grazes;
      // a round down a line GRAZE.radius / 2 beside the player
      const b = g.bullets.spawn({ x: GRAZE.radius * 0.5, z: -4, dx: 0, dz: 1, speed: 20, owner: 'enemy', damage: 10, range: 60, look: 'enemy' });
      let turned = false;
      for (let i = 0; i < (focus ? 600 : 120); i++) {
        window.play(1);
        if (b.owner === 'player') turned = true;
      }
      return { grazed: g.grazes - grazes0, turned };
    };
    return { with: run('grazeReflect', true), awake: run('grazeReflect', false), without: run(null, true) };
  });
  assert.ok(r.with.grazed >= 1, `a graze: ${r.with.grazed}`);
  assert.ok(r.with.turned, 'the round turned back');
  assert.ok(r.awake.grazed >= 1 && !r.awake.turned, 'out of bullet time it flies on');
  assert.ok(r.without.grazed >= 1 && !r.without.turned, 'without the card too');
});

test('擊殺慢鏡: a kill puts bullet time on for half a second at no cost, then off; a hand on the key keeps it (and pays); 深慢鏡: the world slower, the meter faster', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { CARDS, FOCUS } = window.cfg;
    const kill = () => {
      const e = window.post('grunt', 0, -3);
      e.hp = 1;
      e.die(0, 1, { cause: 'bullet' });
    };
    // killSlow
    window.toRoom(0, 4);
    g.cards.held = ['killSlow'];
    g.focusMeter = 0.5;
    kill();
    const on = g.focusActive;
    const meter0 = g.focusMeter;
    window.play(Math.round(CARDS.killSlow * 120) - 6);
    const stillOn = g.focusActive;
    const meter1 = g.focusMeter;
    window.play(12);
    const off = !g.focusActive;
    // the key during the free half second: it stays on after, and drains
    kill();
    const meter2 = g.focusMeter;
    window.play(6, [], ['ShiftLeft']);
    window.play(Math.round(CARDS.killSlow * 120) + 12);
    const kept = g.focusActive;
    const drained = g.focusMeter < meter2;
    // deepSlow
    window.toRoom(0, 4);
    g.cards.held = ['deepSlow'];
    g.focusMeter = 1;
    g.setFocus(true);
    window.play(120);
    const deep = { ts: g.timeScale, meter: g.focusMeter };
    window.toRoom(0, 4);
    g.focusMeter = 1;
    g.setFocus(true);
    window.play(120);
    const plain = { ts: g.timeScale, meter: g.focusMeter };
    return { on, meter0, stillOn, meter1, off, kept, drained, deep, plain, cfg: { scale: CARDS.deepScale, world: FOCUS.worldScale, drainMul: CARDS.deepDrain } };
  });
  assert.ok(r.on && r.stillOn, 'bullet time on with the kill, and on just short of the half second');
  assert.ok(Math.abs(r.meter1 - r.meter0) < 1e-9, `at no cost: ${r.meter0} → ${r.meter1}`);
  assert.ok(r.off, 'off after the half second');
  assert.ok(r.kept && r.drained, 'the key keeps it on, and the meter drains then');
  assert.ok(Math.abs(r.deep.ts - r.cfg.scale) < 0.02 && Math.abs(r.plain.ts - r.cfg.world) < 0.02, `the world at ${r.deep.ts} with the card, ${r.plain.ts} without`);
  const deepDrain = 1 - r.deep.meter;
  const plainDrain = 1 - r.plain.meter;
  assert.ok(Math.abs(deepDrain / plainDrain - r.cfg.drainMul) < 0.05, `the meter drains ×${(deepDrain / plainDrain).toFixed(2)} with the card`);
});

test('a replay picks the same card: the run recorded with a pick of 3 replays holding that card', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { RecordReader } = await import('./src/replay.js');
    const keep = g.fixedSeed;
    g.fixedSeed = 84;
    window.toFloorEnd();
    const steps0 = g.stepCount;
    window.play(5);
    window.play(1, [], ['Digit3']);
    window.play(5);
    const held = [...g.cards.held];
    const bytes = g.record.encode();
    const rd = new RecordReader(bytes);
    // the record fed back: the same run from the start, the pick where it was (cards.js reads the step's input)
    g.cards.held = [];
    g.startRun(0);
    g.waves.state = 'active';
    g.waves.wave = g.floors[0].length * g.waves.rules.perStage;
    g.waves.queue = [];
    g.waves.pending = [];
    g.enemies.clear();
    g.feed = (game) => rd.next(game.player.x, game.player.z);
    for (let i = 0; i < steps0 + 12; i++) g.updatePlay(1 / 120);
    const replayed = [...g.cards.held];
    g.feed = null;
    g.fixedSeed = keep;
    return { held, replayed, offer: g.cards.offer };
  });
  assert.equal(r.held.length, 1);
  assert.deepEqual(r.replayed, r.held, 'the replay holds the same card');
});

test('the end screen names the cards held; screenshot: the card screen', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFloorEnd();
    window.play(1, [], ['Digit1']);
    const first = g.cards.held[0];
    g.player.hurt(999, 0, 1, true, '測試');
    for (let i = 0; i < 120 * 3; i++) g.updatePlay(1 / 120);
    const over = g.state;
    const text = document.getElementById('go-cards').textContent;
    const shown = getComputedStyle(document.getElementById('go-cards').parentElement).display !== 'none';
    // the card screen again, for the picture (the end screen and the replay list it opened put away)
    window.toFloorEnd();
    for (const id of ['gameover', 'replays', 'title']) document.getElementById(id).classList.add('hidden');
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { first, over, text, shown };
  });
  const { CARDS } = await import('../src/cards.js');
  assert.equal(r.over, 'over');
  assert.ok(r.shown && r.text.includes(CARDS[r.first].name), `the end screen: ${r.text}`);
  await page.screenshot({ path: new URL('hell-cards.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
