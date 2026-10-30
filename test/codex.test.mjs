// F⑤a: the trick table (src/codex.js), the room ratings and the multipliers. Every trick is a name the game really
// gives (a kill tag or a Style line), none a man's or a boss's; a room is rated by how many different tricks it saw
// (three S, two A, fewer B; a trick used again is the same one; a man's name, being in bullet time, a graze do not
// count), stamped as it is cleared and listed with their average on the end screen; a Style line says by how much its
// points were multiplied. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { averageRating, KINDS, rated, TRICK_IDS, TRICKS } from '../src/codex.js';
import { ROOM_RATING } from '../src/config.js';
import { rulesFor } from '../src/rules.js';
import { Score } from '../src/score.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

const G = ROOM_RATING.grades;

/** A Score with the game around it stubbed out: `feeds` hears each Style line, `held` the cards in hand. */
function score(held = []) {
  const feeds = [];
  const game = { mode: 'danmaku', ruleset: rulesFor(), cards: { has: (id) => held.includes(id) }, hud: { feedKill() {}, feed: (label, pts, cls, mult) => feeds.push({ label, pts, mult }) }, audio: { combo() {} }, notes: { log() {} } };
  const s = new Score(game);
  s.feeds = feeds;
  return s;
}
const THUG = { label: 'THUG', pts: 100 };

test('every trick is a name the game gives (a kill tag, a Style line, a card’s return), of a known sort; no man’s or boss’s name is one', async () => {
  const src = fs.readdirSync(new URL('../src/', import.meta.url)).filter((f) => f.endsWith('.js') && f !== 'codex.js').map((f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')).join('\n');
  for (const id of TRICK_IDS) {
    assert.ok(src.includes(`'${id}'`), `${id} is given somewhere in src/`);
    assert.ok(KINDS[TRICKS[id].kind], `${id}: a known sort (${TRICKS[id].kind})`);
    assert.ok(TRICKS[id].name, `${id}: a Chinese name`);
  }
  const { TYPES } = await import('../src/enemies.js');
  const men = Object.values(TYPES).map((t) => t.label).filter(Boolean);
  for (const m of men) assert.ok(!TRICKS[m], `${m} is a man, not a trick`);
  for (const boss of ['HELICOPTER', 'BLADE QUEEN', 'HEAVY GUNNER', 'TAXI CONVOY', 'CLUB DJ', 'ARMORED TRUCK']) assert.ok(!TRICKS[boss], `${boss} is a boss`);
  assert.equal(rated('SLOW-MO'), false, 'being in bullet time is not counted');
  assert.equal(rated('GRAZE'), false, 'nor a graze');
  assert.equal(rated('KICK'), true);
});

test('a room’s rating: three different tricks S, two A, one or none B; a trick again is the same one; a man’s name and the basic ones do not count; each room starts afresh', () => {
  const s = score();
  s.kill([THUG, { label: 'KICK', pts: 150 }]);
  s.kill([THUG, { label: 'KICK', pts: 150 }, { label: 'SLOW-MO', pts: 50 }]);
  s.style('FLIP', 100);
  s.style('DODGE', 40);
  s.style('GRAZE', 10);
  const three = s.rateRoom(G);
  assert.deepEqual([three.n, three.grade, three.tricks.sort()], [3, 'S', ['DODGE', 'FLIP', 'KICK']]);
  s.style('FLIP', 100);
  s.style('FLIP', 100);
  s.kill([THUG, { label: 'SLIDE KILL', pts: 100 }]);
  assert.deepEqual([s.rateRoom(G).n, s.rateRoom(G).grade], [2, 'B'], 'two, then the next room afresh: none');
  s.style('FLIP', 100);
  s.style('PONG', 50);
  assert.equal(s.rateRoom(G).grade, 'A');
  s.kill([THUG, { label: 'SLOW-MO', pts: 50 }]);
  s.style('FLIP', 100);
  assert.equal(s.rateRoom(G).grade, 'B', 'one');
  assert.equal(s.rateRoom(G).grade, 'B', 'none');
});

test('the run’s rooms as one grade: the mean of their places, rounded', () => {
  assert.equal(averageRating(['S', 'S', 'A'], G), 'S');
  assert.equal(averageRating(['S', 'B'], G), 'A');
  assert.equal(averageRating(['B', 'B', 'A'], G), 'B');
  assert.equal(averageRating([], G), null);
});

test('a Style line says by how much its points were multiplied: the combo, and 冇慢鏡・雙倍 on top', () => {
  const s = score();
  s.style('FLIP', 100);
  s.kill([THUG]);
  s.kill([THUG]);
  s.kill([THUG]);
  s.style('FLIP', 100);
  const noSlow = score(['noSlow']);
  noSlow.kill([THUG]);
  noSlow.kill([THUG]);
  noSlow.style('FLIP', 100);
  assert.deepEqual(s.feeds.map((f) => [f.pts, f.mult]), [[100, 1], [300, 3]]);
  assert.deepEqual(noSlow.feeds.map((f) => [f.pts, f.mult]), [[400, 4]], 'two kills’ combo, doubled');
});

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=84'));
  await page.evaluate(() => {
    window.game.frame = () => {};
  });
});
after(async () => {
  await h.close();
});

test('in the game: a room cleared stamps its rating on the screen and writes it down; the end screen lists each room’s and their average; the feed shows ×; screenshots', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    g.setRules('normal', []);
    g.setMode('danmaku');
    g.startRun(0);
    g.challenge.offer = null;
    g.enemies.clear();
    const clearRoom = () => {
      g.waves.state = 'active';
      g.waves.wave = Math.ceil(Math.max(1, g.waves.wave) / g.waves.rules.perStage) * g.waves.rules.perStage;
      g.waves.queue = [];
      g.waves.pending = [];
      g.enemies.clear();
      g.player.hp = 100;
      g.updatePlay(1 / 120);
    };
    // the first room: three different tricks
    g.score.kill([{ label: 'THUG', pts: 100 }, { label: 'KICK', pts: 150 }]);
    g.score.kill([{ label: 'THUG', pts: 100 }, { label: 'EXECUTION', pts: 200 }]);
    g.score.style('FLIP', 100); // after two kills: ×2
    const feedText = document.getElementById('feed').textContent;
    clearRoom();
    const stamp = { cls: document.getElementById('room-grade').className, text: document.getElementById('room-grade').textContent };
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    return { stamp, feedText, ratings: g.roomRatings.map((x) => x.grade), notes: g.notes.events.map((e) => e.text).filter((t) => t.startsWith('房評級')) };
  });
  assert.match(r.stamp.cls, /show g-S/, `stamped S: ${r.stamp.cls}`);
  assert.match(r.stamp.text, /3 種花招/);
  assert.deepEqual(r.ratings, ['S']);
  assert.ok(r.notes.length === 1 && r.notes[0].includes('翻枱') && r.notes[0].includes('處決'), `the note: ${r.notes}`);
  assert.match(r.feedText, /FLIP ×2/, `the combo on the Style line: ${r.feedText}`);
  await page.screenshot({ path: new URL('room-grade.png', OUT).pathname });
  const end = await page.evaluate(() => {
    const g = window.game;
    // a second room with one trick, then the run ends
    g.roomRatings.push({ stage: 1, room: 'test', n: 1, grade: 'B' });
    g.player.hurt(999, 0, 1, true, '測試');
    for (let i = 0; i < 120 * 3; i++) g.updatePlay(1 / 120);
    for (const id of ['replays', 'title']) document.getElementById(id).classList.add('hidden');
    const el = document.getElementById('go-rooms');
    return { state: g.state, text: el.textContent, shown: getComputedStyle(el.parentElement).display !== 'none' };
  });
  assert.equal(end.state, 'over');
  assert.ok(end.shown && /SB/.test(end.text) && /平均 A/.test(end.text), `the end screen: ${end.text}`);
  await page.screenshot({ path: new URL('room-grades-end.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
