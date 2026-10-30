// F④b: the combo and cost cards (src/cards.js). A combo card is on only while the other cards held carry the tags it
// needs (its own do not count; a tag named twice wants two cards): a slide into a man holds him up (滑鏟抓人, slide +
// shield), a round a card turned back hops on to a second man (連環反彈, bounce + bounce), a man kicked down fills the
// magazine (踢出彈匣, kick + gun). A cost card gives one thing and takes another: no bullet time for double Style
// (冇慢鏡・雙倍), bullet time that costs nothing and no gun taken off the floor (淨係手槍・慢鏡無限), four cards to pick
// from and half the HP (半條命・四選一). The card screen says what each card plays with among those held. Run: npm test
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
    /** A quiet room of 彈幕試驗 (the teahouse), the player at (x, z) holding `held`, nobody about. LANE is an x clear of its tables. */
    window.LANE = 3.6;
    window.toRoom = (x = 0, z = 5, held = []) => {
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
      g.cards.held = [...held];
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
    /** A run north up the lane into a man at (LANE, 0), sliding from 2.4 m short of him: whether it slid. */
    window.slideInto = (e) => {
      let slid = false;
      for (let i = 0; i < 240; i++) {
        const near = Math.hypot(e.x - g.player.x, e.z - g.player.z) < 2.4;
        window.play(1, ['KeyW'], near && !slid ? ['KeyC'] : [], window.LANE, -10);
        if (g.player.sliding) slid = true;
        if (slid && !g.player.sliding) break;
      }
      return slid;
    };
    window.notesFrom = (from) => g.notes.events.slice(from).map((x) => x.text);
  });
});
after(async () => {
  await h.close();
});

test('eighteen cards: the combo cards name the tags they need, the cost cards say both sides; every card is drawn over the seeds', async () => {
  const r = await page.evaluate(async () => {
    const { CARDS, CARD_IDS, TAGS, drawOffer } = await import('./src/cards.js');
    const g = window.game;
    const seen = new Set();
    for (let i = 0; i < 300; i++) for (const id of drawOffer(g.rng.fork('cards-test', i), [])) seen.add(id);
    return {
      ids: CARD_IDS,
      combos: CARD_IDS.filter((id) => CARDS[id].needs).map((id) => [id, CARDS[id].needs]),
      costs: CARD_IDS.filter((id) => CARDS[id].cost).map((id) => [id, CARDS[id].text]),
      tagIds: Object.keys(TAGS),
      seen: [...seen].sort(),
    };
  });
  assert.equal(r.ids.length, 18, `eighteen cards: ${r.ids}`);
  assert.deepEqual(r.combos.map(([id]) => id), ['slideGrab', 'chainBounce', 'kickReload']);
  for (const [id, needs] of r.combos) assert.ok(needs.length === 2 && needs.every((t) => r.tagIds.includes(t)), `${id} needs ${needs}`);
  assert.deepEqual(r.costs.map(([id]) => id), ['noSlow', 'pistolsOnly', 'halfHp']);
  for (const [id, text] of r.costs) assert.ok(text.includes('代價'), `${id} says its cost: ${text}`);
  assert.deepEqual(r.seen, [...r.ids].sort(), 'every card drawn');
});

test('a combo card is on only with its needs met by the other cards held: its own tags and other combos do not count, a tag named twice wants two', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const on = (id, held) => {
      g.cards.held = held;
      return g.cards.has(id);
    };
    return {
      alone: on('slideGrab', ['slideGrab']),
      half: on('slideGrab', ['slideGrab', 'slideReflect']),
      met: on('slideGrab', ['slideGrab', 'slideReflect', 'shoveBoom']),
      oneCardBoth: on('slideGrab', ['slideGrab', 'slideReflect', 'tableBounce']), // slideReflect is slide and bounce, no shield
      viaCombo: on('kickReload', ['kickReload', 'slideGrab', 'kickReturn']), // slideGrab carries no gun (and combos do not count)
      oneBounce: on('chainBounce', ['chainBounce', 'tableBounce']),
      twoBounce: on('chainBounce', ['chainBounce', 'tableBounce', 'kickReturn']),
      plain: on('tableBounce', ['tableBounce']),
      notHeld: on('slideGrab', ['slideReflect', 'shoveBoom']),
    };
  });
  assert.deepEqual(r, { alone: false, half: false, met: true, oneCardBoth: false, viaCombo: false, oneBounce: false, twoBounce: true, plain: true, notHeld: false });
});

test('滑鏟抓人: with slide and shield cards held, a slide into a man ends holding him up; its needs unmet, the slide goes on into him', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (held) => {
      window.toRoom(window.LANE, 6, held);
      const e = window.post('grunt', window.LANE, 0);
      const slid = window.slideInto(e);
      return { slid, held: g.player.hostage === e, sliding: g.player.sliding };
    };
    return { met: run(['slideGrab', 'slideReflect', 'shoveBoom']), unmet: run(['slideGrab', 'slideReflect']) };
  });
  assert.ok(r.met.slid && r.met.held, `held up from the slide: ${JSON.stringify(r.met)}`);
  assert.equal(r.met.sliding, false, 'the slide ended in the grab');
  assert.ok(r.unmet.slid && !r.unmet.held, 'its needs unmet, no grab');
});

test('連環反彈: with two bounce cards, a round kicked back hits the first man and hops on to the second; with one, it stops in the first', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const x = window.LANE;
    const run = (held) => {
      window.toRoom(x, 4, held);
      const a = window.post('grunt', x, -2);
      const b = window.post('grunt', x + 2.5, -3);
      const hpA = a.hp;
      const hpB = b.hp;
      const from = g.notes.events.length;
      g.bullets.spawn({ x, z: 2.6, dx: 0, dz: 1, speed: 20, owner: 'enemy', damage: 10, range: 60, look: 'enemy' });
      window.play(1, [], ['KeyF']);
      window.play(120);
      return { a: hpA - a.hp, b: hpB - b.hp, notes: window.notesFrom(from).filter((t) => t === '連環反彈') };
    };
    return { met: run(['chainBounce', 'kickReturn', 'tableBounce']), unmet: run(['chainBounce', 'kickReturn']) };
  });
  assert.ok(r.met.a > 0 && r.met.b > 0, `both hit: ${JSON.stringify(r.met)}`);
  assert.ok(r.met.notes.length === 1, 'one hop');
  assert.ok(r.unmet.a > 0 && r.unmet.b === 0, `one bounce card: the first only: ${JSON.stringify(r.unmet)}`);
});

test('踢出彈匣: with kick and gun cards, a man kicked down fills the magazine; its needs unmet, it stays as it was', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const x = window.LANE;
    const run = (held) => {
      window.toRoom(x, 4, held);
      window.post('grunt', x, 2.8);
      g.player.ammo = 3;
      window.play(1, [], ['KeyF']);
      window.play(2);
      return g.player.ammo;
    };
    return { met: run(['kickReload', 'kickReturn', 'lastRound']), unmet: run(['kickReload', 'kickReturn']), mag: g.player.weapon.mag };
  });
  assert.equal(r.met, r.mag, 'a full magazine');
  assert.equal(r.unmet, 3, 'unmet: as it was');
});

test('冇慢鏡・雙倍: bullet time will not come on (the key, a free half second), and Style counts double', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (held) => {
      window.toRoom(window.LANE, 5, held);
      window.play(1, [], ['ShiftLeft']);
      const keyed = g.focusActive;
      g.freeFocus(0.5);
      const free = g.focusActive;
      g.setFocus(false);
      const s0 = g.score.score;
      g.score.style('TEST', 100, false);
      return { keyed, free, style: g.score.score - s0 };
    };
    return { card: run(['noSlow']), plain: run([]) };
  });
  assert.ok(!r.card.keyed && !r.card.free, 'no bullet time with the card');
  assert.ok(r.plain.keyed, 'bullet time without it');
  assert.ok(Math.abs(r.card.style / r.plain.style - 2) < 1e-9, `Style ×2: ${r.card.style} against ${r.plain.style}`);
});

test('淨係手槍・慢鏡無限: a gun on the floor stays there, and bullet time drains nothing; without the card the gun is taken and the meter drains', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const run = (held) => {
      window.toRoom(window.LANE, 5, held);
      window.post('grunt', -5, -6);
      g.pickups.spawn('shotgun', window.LANE, 5);
      window.play(10);
      const taken = !!g.player.special;
      g.setFocus(true);
      const m0 = g.focusMeter;
      window.play(240);
      const m1 = g.focusMeter;
      g.setFocus(false);
      return { taken, drained: m0 - m1 };
    };
    return { card: run(['pistolsOnly']), plain: run([]) };
  });
  assert.ok(!r.card.taken, 'the gun stays on the floor');
  assert.ok(Math.abs(r.card.drained) < 1e-9, `no drain: ${r.card.drained}`);
  assert.ok(r.plain.taken && r.plain.drained > 0.1, `without the card: ${JSON.stringify(r.plain)}`);
});

test('半條命・四選一: the most HP there is halves on the pick, and every refill stops there (a wave cleared, the regeneration, a life won, a door’s heal); a floor’s end and a door offer four cards', async () => {
  const r = await page.evaluate(async () => {
    const { givePrize } = await import('./src/prizes.js');
    const g = window.game;
    const { CARDS, PLAYER } = window.cfg;
    const p = g.player;
    // picked at full HP: down to the new cap at once
    window.toRoom(window.LANE, 5, []);
    g.cards.offer = ['halfHp', 'killSlow', 'tableBounce'];
    g.cards.pick(0);
    const picked = { hp: p.hp, max: p.maxHp };
    // a wave cleared refills to the cap, no further
    p.hp = 10;
    g.onWaveClear();
    const cleared = p.hp;
    // a hit of 5 is 5; the regeneration stops at the cap
    p.hurt(5, 0, 1, false, '測試');
    const hit = p.hp;
    p.sinceHurt = 99;
    window.play(120 * 30);
    const regen = p.hp;
    // a life won stands him up at the cap
    p.hp = 1;
    g.challenge.lives = 1;
    p.hurt(5, 0, 1, false, '測試');
    const saved = { alive: p.alive, hp: p.hp };
    // a door's heal: DOORS.heal of the cap, up to it
    p.hp = 10;
    givePrize(g, 'heal', g.stage);
    const healed = p.hp;
    // the four cards: a floor’s end, a door (4 keeps the fourth)
    window.toRoom(window.LANE, 5, ['halfHp']);
    g.waves.state = 'active';
    g.waves.wave = g.floors[0].length * g.waves.rules.perStage;
    g.waves.queue = [];
    g.waves.pending = [];
    window.play(1);
    const floorEnd = g.cards.offer ? g.cards.offer.length : 0;
    const title = document.getElementById('cards').dataset.title;
    g.cards.offer = null;
    g.hideCards();
    g.cards.showDoor(2);
    const door = g.cards.offer ? g.cards.offer.length : 0;
    window.play(1, [], ['Digit4']);
    const fourth = g.cards.held.length;
    window.toRoom(window.LANE, 5, []);
    const plain = p.maxHp;
    return { picked, cleared, hit, regen, saved, healed, heal: window.cfg.DOORS.heal, floorEnd, title, door, fourth, plain, full: PLAYER.hp, half: PLAYER.hp * CARDS.halfHp };
  });
  assert.equal(r.half, r.full / 2, 'half the HP');
  assert.deepEqual(r.picked, { hp: r.half, max: r.half }, 'picked at full HP: down to the new cap');
  assert.equal(r.cleared, r.half, 'a wave cleared refills to the cap');
  assert.equal(r.hit, r.half - 5, 'a hit of 5 is 5');
  assert.equal(r.regen, r.half, 'the regeneration stops at the cap');
  assert.deepEqual(r.saved, { alive: true, hp: r.half }, 'a life won stands him up at the cap');
  assert.equal(r.healed, Math.min(r.half, 10 + r.half * r.heal), 'a door’s heal: DOORS.heal of the cap, up to it');
  assert.equal(r.floorEnd, 4, 'four at a floor’s end');
  assert.match(r.title, /四選一/);
  assert.equal(r.door, 4, 'four at a door');
  assert.equal(r.fourth, 2, '4 keeps the fourth');
  assert.equal(r.plain, r.full, 'without the card the whole meter');
});

test('the card screen says what each card plays with among those held: a combo card’s needs ticked or crossed, a card’s partners, the combo it would put on; screenshot', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRoom(window.LANE, 5, ['slideGrab', 'slideReflect']);
    for (const id of ['gameover', 'replays', 'title']) document.getElementById(id).classList.add('hidden');
    g.showCards(['chainBounce', 'shoveBoom', 'slideTrip']);
    const syn = [...document.querySelectorAll('#cards .card')].map((b) => b.querySelector('.card-syn')?.textContent || '');
    const kinds = [...document.querySelectorAll('#cards .card .card-kind')].map((k) => k.textContent);
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { syn, kinds };
  });
  assert.match(r.syn[0], /要：反彈 ✓ ＋ 反彈 ✗/, `chainBounce's needs: ${r.syn[0]}`);
  assert.match(r.kinds[0], /組合/, 'the combo badge');
  assert.match(r.syn[1], /湊齊：滑鏟抓人/, `shoveBoom puts slideGrab on: ${r.syn[1]}`);
  assert.match(r.syn[2], /配合：滑鏟反彈/, `slideTrip plays with slideReflect: ${r.syn[2]}`);
  await page.screenshot({ path: new URL('cards-combo.png', OUT).pathname });
  await page.evaluate(() => window.game.hideCards());
  assert.deepEqual(problems(logs), []);
});
