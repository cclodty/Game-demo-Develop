// F⑥b: the unlock table (src/unlocks.js). A fresh browser draws from eight style cards and five of the seven weapons,
// with two variants shut; a room challenge won opens the next thing its kind lists, a ladder level opened opens its
// own, kept in this browser and in play from the next run on (a run's table is fixed as it starts). The end screen
// lists what the run opened, the title's table what is shut and what opens it; the table goes into the input record,
// so a replay draws the same cards and weapons. (The test that reloads the page comes last: a reload takes the
// helpers away.) Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_IDS } from '../src/cards.js';
import { LADDER_TOP, VARIANTS } from '../src/rules.js';
import { ALL_OPEN, cardPool, howToOpen, openWeapons, UNLOCKS, unlocked, Unlocks } from '../src/unlocks.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

/** A stand-in for localStorage. */
function store() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('the table: eight cards open at the start, the other ten each hung on a challenge win or a ladder level; two weapons, two variants; one thing a level at most, a kind’s wins in order', () => {
  assert.equal(cardPool(0).length, 8, `eight cards: ${cardPool(0)}`);
  assert.deepEqual(cardPool(ALL_OPEN), CARD_IDS, 'all of them with everything open');
  assert.deepEqual(cardPool(null), CARD_IDS, 'and with no table (a record from before it)');
  assert.deepEqual(UNLOCKS.filter((u) => u.what === 'weapon').map((u) => u.id).sort(), ['launcher', 'minigun']);
  assert.deepEqual(UNLOCKS.filter((u) => u.what === 'variant').map((u) => u.id).sort(), ['dualist', 'glassCity']);
  for (const u of UNLOCKS) {
    if (u.what === 'card') assert.ok(CARD_IDS.includes(u.id), u.id);
    if (u.what === 'variant') assert.ok(VARIANTS[u.id] && !VARIANTS[u.id].unlock, `${u.id}: a variant no achievement opens`);
    assert.ok(!!u.challenge !== !!u.ladder, `${u.id}: a challenge or a level, one`);
  }
  const levels = UNLOCKS.filter((u) => u.ladder).map((u) => u.ladder);
  assert.equal(new Set(levels).size, levels.length, 'one thing a level');
  assert.ok(levels.every((l) => l >= 1 && l <= LADDER_TOP));
  for (const kind of new Set(UNLOCKS.filter((u) => u.challenge).map((u) => u.challenge))) {
    assert.deepEqual(UNLOCKS.filter((u) => u.challenge === kind).map((u) => u.win), [1, 2], `${kind}: its first win, its second`);
  }
  assert.ok(UNLOCKS.length <= 31, 'the record keeps the table in a u32');
  assert.deepEqual(openWeapons(['smg', 'launcher', 'minigun'], 0), ['smg'], 'shut weapons are not handed out');
  assert.deepEqual(openWeapons(['launcher'], 0), ['launcher'], 'a list with nothing open stays whole');
  assert.equal(howToOpen(UNLOCKS[0], { nohit: '無傷' }), '無傷挑戰第 1 次');
  assert.equal(howToOpen(UNLOCKS.find((u) => u.ladder === 1)), '階梯第 1 級');
});

test('a challenge won opens its kind’s next, a ladder level its own, kept; one climbed before the table counts; a replay opens nothing', () => {
  const st = store();
  let un = new Unlocks(st);
  assert.equal(un.mask(), 0, 'nothing open in a fresh browser');
  assert.deepEqual(un.challengeWon('nohit').map((u) => u.id), ['slideTrip']);
  assert.equal(un.challengeWon('clock')[0].id, 'launcher');
  un = new Unlocks(st);
  assert.ok(un.has('card', 'slideTrip') && un.has('weapon', 'launcher'), 'kept');
  assert.ok(!un.has('card', 'halfHp'));
  assert.ok(un.has('card', 'slideReflect') && un.has('variant', 'noSlowmo') && un.has('weapon', 'smg'), 'what the table does not name is open');
  assert.deepEqual(un.challengeWon('nohit').map((u) => u.id), ['halfHp'], 'the second win: the second');
  assert.deepEqual(un.challengeWon('nohit'), [], 'nothing left for a third');
  const mask = un.mask();
  assert.ok(unlocked(mask, 'card', 'halfHp') && !unlocked(mask, 'card', 'chainBounce'));
  assert.equal(cardPool(mask).length, 10);
  assert.deepEqual(un.ladderOpened(1).map((u) => u.id), ['chainBounce']);
  assert.deepEqual(un.ladderOpened(7), [], 'a level with nothing to open');
  // a ladder climbed to level 3 before the table: what its levels open is open
  const st2 = store();
  st2.setItem('bullet-ballet.ladder', '3');
  const un2 = new Unlocks(st2);
  assert.ok(un2.has('card', 'chainBounce') && un2.has('card', 'grazeReload') && un2.has('weapon', 'minigun') && !un2.has('card', 'slideGrab'));
  un2.watching = true;
  assert.deepEqual(un2.challengeWon('noshot'), [], 'a replay opens nothing');
  assert.equal(un2.wins.noshot, undefined);
});

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=31&unlocks'));
  await page.evaluate(async () => {
    const g = window.game;
    window.cfg = await import('./src/config.js');
    window.weapons = await import('./src/weapons.js');
    window.givePrize = (await import('./src/prizes.js')).givePrize;
    g.frame = () => {};
    /** A 彈幕 run in its first room, quiet. */
    window.toRun = (variants = []) => {
      g.setRules('normal', variants, 0);
      g.setMode('danmaku');
      g.startRun(0);
      g.waves.state = 'done';
      g.challenge.offer = null;
      g.enemies.clear();
      g.bullets.clear();
    };
    /** Challenge `id` taken on and won in the room the player is in. */
    window.win = (id) => {
      g.challenge.active = { id, stage: g.stage, t: 0, failed: false };
      g.challenge.roomClear();
    };
  });
});
after(async () => {
  await h.close();
});

test('a fresh browser: the floor’s cards from the eight, no launcher or minigun from a pad, a challenge or a door, the two variants off the title', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const { CHALLENGE } = window.cfg;
    const { PLAYER_WEAPONS } = window.weapons;
    window.toRun(['glassCity', 'dualist', 'noSlowmo']);
    const out = { pool: g.cards.pool.slice(), variants: g.ruleset.variants.slice(), offered: new Set(), weapons: new Set() };
    for (let f = 0; f < 3; f++) {
      g.cards.held = [];
      g.cards.show(f);
      g.cards.offer.forEach((id) => out.offered.add(id));
      g.cards.offer = null;
    }
    g.cards.held = [];
    // the pads, many times over
    for (let i = 0; i < 40; i++) {
      g.pickups.refillPads(g.rng.fork('unlocks-test', i));
      for (const p of g.pickups.list) out.weapons.add(p.kind);
    }
    // 限時's weapon and a door's gun, across rooms (the wins kept from opening anything: this is about the run's table)
    g.unlocks.watching = true;
    for (let s = 0; s < 30; s++) {
      g.challenge.active = { id: 'clock', stage: s, t: 0, failed: false };
      g.challenge.roomClear();
      window.givePrize(g, 'gun', s);
      for (const p of g.pickups.list) out.weapons.add(p.kind);
      g.pickups.clear();
    }
    g.unlocks.watching = false;
    out.title = [...document.querySelectorAll('#variant-cards .mode-card')].filter((c) => !c.classList.contains('hidden')).map((c) => c.dataset.rule);
    out.offered = [...out.offered];
    out.weapons = [...out.weapons];
    out.allWeapons = Object.keys(PLAYER_WEAPONS);
    out.clockList = CHALLENGE.weapons;
    g.enemies.clear();
    return out;
  });
  assert.equal(r.pool.length, 8, `eight: ${r.pool}`);
  assert.ok(r.offered.every((id) => r.pool.includes(id)), `offered from the eight: ${r.offered}`);
  assert.ok(r.offered.length >= 6, `most of them offered: ${r.offered}`);
  assert.ok(r.weapons.length >= 3, `weapons handed out: ${r.weapons}`);
  assert.ok(!r.weapons.includes('launcher') && !r.weapons.includes('minigun'), `no shut weapon handed out: ${r.weapons}`);
  assert.deepEqual(r.variants, ['noSlowmo'], 'the shut variants are not picked');
  assert.ok(!r.title.includes('glassCity') && !r.title.includes('dualist') && r.title.includes('noSlowmo'), `the title: ${r.title}`);
  assert.deepEqual(problems(logs), []);
});

test('a challenge won opens a card for the next run, not this one; a cleared run opens ladder level 1 and its card; the end screen lists both; screenshot', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    localStorage.removeItem('bullet-ballet.ladder');
    window.toRun();
    const before = g.cards.pool.length;
    window.win('nohit');
    const during = g.cards.pool.length;
    g.onRunClear(28);
    for (let i = 0; i < 120 * 4 && g.state !== 'over'; i++) g.updatePlay(1 / 120);
    for (const id of ['replays', 'title']) document.getElementById(id).classList.add('hidden');
    const el = document.getElementById('go-unlocks');
    const out = { before, during, state: g.state, text: el.textContent, shown: getComputedStyle(el.parentElement).display !== 'none', notes: g.notes.events.map((e) => e.text).filter((t) => t.startsWith('解鎖')), stored: JSON.parse(localStorage.getItem('bullet-ballet.unlocks')) };
    return out;
  });
  assert.equal(r.before, 8);
  assert.equal(r.during, 8, 'this run’s pool stays as it started');
  assert.equal(r.state, 'over');
  assert.ok(r.shown, 'the end screen’s 解鎖 row');
  assert.ok(r.text.includes('階梯第 1 級') && r.text.includes('風格卡：滑鏟絆倒') && r.text.includes('風格卡：連環反彈'), `the end screen: ${r.text}`);
  assert.deepEqual(r.notes.filter((t) => t.startsWith('解鎖風格卡')), ['解鎖風格卡：滑鏟絆倒', '解鎖風格卡：連環反彈']);
  assert.deepEqual(r.stored.opened.sort(), ['card:chainBounce', 'card:slideTrip']);
  await page.screenshot({ path: new URL('unlocks-end.png', OUT).pathname });
  const n = await page.evaluate(() => {
    window.toRun();
    return { pool: window.game.cards.pool.slice() };
  });
  assert.equal(n.pool.length, 10, `the next run: ten (${n.pool})`);
  assert.ok(n.pool.includes('slideTrip') && n.pool.includes('chainBounce'));
  assert.deepEqual(problems(logs), []);
});

test('a replay plays with the table its run had, whatever has opened since, and opens nothing', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toRun();
    const mask = g.unlockMask;
    for (let i = 0; i < 30; i++) g.updatePlay(1 / 120);
    const bytes = g.record.encode();
    g.toTitle();
    window.win('noshot'); // shieldReturn opens after the run
    const now = g.unlocks.mask();
    const err = g.playReplay(bytes, { name: 'test' });
    const during = { mask: g.unlockMask, pool: g.cards.pool.length };
    window.win('noshot'); // won while watching: nothing
    const kept = JSON.parse(localStorage.getItem('bullet-ballet.unlocks')).opened.slice();
    g.toTitle();
    window.toRun();
    return { err, mask, now, during, kept, after: g.unlockMask };
  });
  assert.ok(!r.err, `played: ${r.err}`);
  assert.notEqual(r.now, r.mask, 'more open since');
  assert.deepEqual(r.during, { mask: r.mask, pool: 10 }, 'the replay with its own');
  assert.ok(!r.kept.includes('card:kickReload'), 'a win in a replay opens nothing');
  assert.equal(r.after, r.now, 'a new run with today’s');
  assert.deepEqual(problems(logs), []);
});

test('the title’s table: every card, weapon and variant, the shut ones with what opens them; kept after a reload; screenshot', async () => {
  await page.reload();
  await page.waitForFunction(() => window.game && window.game.startRun);
  const t = await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    for (const id of ['gameover', 'replays']) document.getElementById(id).classList.add('hidden');
    document.getElementById('title').classList.remove('hidden');
    document.getElementById('open-unlocks').click();
    const cells = [...document.querySelectorAll('#unlocks-list .cx-cell')];
    const of = (what) => cells.filter((c) => c.dataset[what]);
    const lit = (what) => of(what).filter((c) => c.classList.contains('lit')).map((c) => c.dataset[what]);
    return {
      shown: !document.getElementById('unlocks').classList.contains('hidden'),
      count: document.getElementById('unlocks-count').textContent,
      cards: of('card').length,
      weapons: of('weapon').length,
      variants: of('variant').length,
      litCards: lit('card'),
      litWeapons: lit('weapon'),
      halfHp: document.querySelector('#unlocks-list [data-card="halfHp"]').textContent,
      launcher: document.querySelector('#unlocks-list [data-weapon="launcher"]').textContent,
      glass: document.querySelector('#unlocks-list [data-variant="glassCity"]').textContent,
      barrels: document.querySelector('#unlocks-list [data-variant="barrelFest"]').textContent,
    };
  });
  assert.ok(t.shown);
  assert.deepEqual([t.cards, t.weapons, t.variants], [18, 6, 6]);
  assert.equal(t.litCards.length, 11, `eight, 滑鏟絆倒, 連環反彈, 人盾反彈: ${t.litCards}`);
  assert.ok(!t.litWeapons.includes('launcher') && !t.litWeapons.includes('minigun') && t.litWeapons.length === 4, `${t.litWeapons}`);
  assert.match(t.halfHp, /解鎖：無傷挑戰第 2 次/);
  assert.match(t.launcher, /解鎖：限時挑戰第 1 次/);
  assert.match(t.glass, /解鎖：階梯第 5 級/);
  assert.match(t.barrels, /解鎖：成就/, 'an achievement’s variant says so');
  assert.match(t.count, /已解鎖 \d+ \/ 30/);
  await page.screenshot({ path: new URL('unlocks-title.png', OUT).pathname });
  await page.evaluate(() => document.querySelector('#unlocks-list [data-variant="glassCity"]').scrollIntoView({ block: 'end' }));
  await page.screenshot({ path: new URL('unlocks-title-2.png', OUT).pathname });
  await page.evaluate(() => window.game.showUnlocks(false));
  assert.deepEqual(problems(logs), []);
});
