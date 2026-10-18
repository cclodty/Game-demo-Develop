// The leaderboard back end (後端 ①：Worker 與 D1). backend/worker.js runs
// here against a stand-in for its D1 binding built on Node's own SQLite, so
// the worker's SQL really runs (D1 is SQLite too) and nothing is installed.
// Each endpoint is tried with good requests and with the ones it must turn
// away: too large, a second daily try, bad fields, a bad nickname, and the
// CORS preflight. The repo must hold no account details.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { cleanName, handle, LIMITS } from '../backend/worker.js';
import { dailyFor } from '../src/daily.js';
import { InputRecord } from '../src/replay.js';
import { StepInput } from '../src/input.js';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
const schema = fs.readFileSync(new URL('../backend/schema.sql', import.meta.url), 'utf8');

/** D1's prepare / bind / first / all / run over node:sqlite (ArrayBuffer binds as a BLOB, as in D1). */
class FakeD1 {
  constructor() {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(schema);
  }

  prepare(sql) {
    const db = this.db;
    let args = [];
    const conv = (a) => a.map((v) => (v instanceof ArrayBuffer ? new Uint8Array(v) : v));
    const stmt = {
      bind(...a) {
        args = conv(a);
        return stmt;
      },
      async first(col) {
        const row = db.prepare(sql).get(...args);
        if (!row) return null;
        return col ? row[col] : { ...row };
      },
      async all() {
        return { success: true, results: db.prepare(sql).all(...args).map((r) => ({ ...r })) };
      },
      async run() {
        const info = db.prepare(sql).run(...args);
        return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
      },
    };
    return stmt;
  }
}

const NOW = Date.parse('2026-10-18T09:00:00Z');
const TODAY = '2026-10-18';
const ORIGIN = 'https://cclodty.github.io';

/** A small valid input record as base64. */
function replay(steps = 300) {
  const rec = new InputRecord({ seed: 5, map: dailyFor(TODAY).map, mode: 2 });
  for (let i = 0; i < steps; i++) {
    const c = new StepInput();
    c.keys = i % 40 < 20 ? 1 : 0;
    rec.push(c);
  }
  return Buffer.from(rec.encode()).toString('base64');
}

const env = (extra = {}) => ({ DB: new FakeD1(), ALLOWED_ORIGIN: ORIGIN, ...extra });
const call = async (e, method, path, body, init = {}) => {
  const res = await handle(
    new Request(`https://bb.example.workers.dev${path}`, {
      method,
      headers: { origin: ORIGIN, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    e,
    init.now ?? NOW,
  );
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, body: type.startsWith('application/json') ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
};
const score = (over = {}) => ({ mode: 'daily', day: TODAY, map: dailyFor(TODAY).map, score: 12345, grade: 'B', name: '阿芭', id: 'player-aaaaaaaaaaaa1', replay: replay(), ...over });

test('GET /daily: today’s seed, map and rules, in UTC', async () => {
  const e = env();
  const r = await call(e, 'GET', '/daily');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, dailyFor(TODAY));
  const late = await call(e, 'GET', '/daily', undefined, { now: Date.parse('2026-10-18T23:59:59+08:00') });
  assert.equal(late.body.day, '2026-10-18', 'Macau’s night is still the UTC day');
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
});

test('POST /scores: a daily score is stored once, ranked, and its replay can be fetched back', async () => {
  const e = env();
  const a = await call(e, 'POST', '/scores', score());
  assert.deepEqual([a.status, a.body.ok, a.body.rank, a.body.total], [200, true, 1, 1]);
  const b = await call(e, 'POST', '/scores', score({ id: 'player-bbbbbbbbbbbb2', name: 'Pedro', score: 20000 }));
  assert.deepEqual([b.body.rank, b.body.total], [1, 2]);
  const again = await call(e, 'POST', '/scores', score({ score: 99999 }));
  assert.equal(again.status, 409, 'the daily has one try');
  assert.match(again.body.error, /already/);
  const board = await call(e, 'GET', `/board?mode=daily&day=${TODAY}&id=player-aaaaaaaaaaaa1`);
  assert.deepEqual(
    board.body.top.map((r) => [r.rank, r.name, r.score, r.grade, r.me]),
    [
      [1, 'Pedro', 20000, 'B', false],
      [2, '阿芭', 12345, 'B', true],
    ],
  );
  assert.equal(board.body.place, 2);
  assert.equal(board.body.total, 2);
  assert.ok(!('player' in board.body.top[0]), 'ids are not handed out');
  const rep = await call(e, 'GET', `/replay?id=${board.body.top[1].entry}`);
  assert.equal(rep.status, 200);
  assert.deepEqual(Buffer.from(rep.body).toString('base64'), replay(), 'the same record back');
  assert.equal(rep.headers.get('content-type'), 'application/octet-stream');
  assert.equal((await call(e, 'GET', '/replay?id=999')).status, 404);
});

test('POST /scores: an arcade day keeps each player’s best; the map board ranks players by their best', async () => {
  const e = env();
  const post = (id, s, map = 1) => call(e, 'POST', '/scores', score({ mode: 'arcade', map, id, score: s }));
  assert.equal((await post('player-cccccccccccc3', 5000)).body.kept, true);
  assert.equal((await post('player-cccccccccccc3', 4000)).body.kept, false, 'a lower score that day is not kept');
  assert.equal((await post('player-cccccccccccc3', 9000)).body.kept, true, 'a higher one replaces it');
  await post('player-dddddddddddd4', 7000);
  await post('player-eeeeeeeeeeee5', 8000, 2); // another map
  for (let i = 0; i < 9; i++) await post(`player-filler-${String(i).padStart(6, '0')}`, 100 * i);
  const r = await call(e, 'GET', '/board?mode=arcade&map=1&id=player-dddddddddddd4');
  assert.equal(r.body.total, 11);
  assert.deepEqual(
    r.body.top.slice(0, 2).map((x) => [x.rank, x.score]),
    [
      [1, 9000],
      [2, 7000],
    ],
  );
  assert.equal(r.body.place, 2);
  assert.deepEqual(
    r.body.around.map((x) => [x.rank, x.me]),
    [
      [1, false],
      [2, true],
      [3, false],
      [4, false],
      [5, false],
    ],
    'the player’s place with three on each side (fewer above at the top)',
  );
});

test('refused: too large, not JSON, bad fields, other days, bad nicknames; unknown routes and methods', async () => {
  const e = env();
  const bad = async (over, status = 400, error) => {
    const r = await call(e, 'POST', '/scores', score(over));
    assert.equal(r.status, status, JSON.stringify(over).slice(0, 80));
    if (error) assert.match(r.body.error, error);
  };
  await bad({ mode: 'versus' }, 400, /mode/);
  await bad({ day: '2026-10-16' }, 400, /today/);
  await bad({ day: '18/10/2026' }, 400, /day/);
  await bad({ map: (dailyFor(TODAY).map + 1) % 4 }, 400, /map/);
  await bad({ score: -1 }, 400, /score/);
  await bad({ score: 1.5 }, 400, /score/);
  await bad({ score: LIMITS.maxScore + 1 }, 400, /score/);
  await bad({ grade: 'Z' }, 400, /grade/);
  await bad({ id: 'short' }, 400, /id/);
  await bad({ id: 'has spaces in it, sixteen+' }, 400, /id/);
  await bad({ replay: 'not base64!!' }, 400, /replay/);
  await bad({ replay: Buffer.from('XXXXXXXXXXXXXXXXXXXX').toString('base64') }, 400, /replay/);
  await bad({ name: '' }, 400, /name/);
  await bad({ name: 'a'.repeat(17) }, 400, /name/);
  await bad({ name: '<script>' }, 400, /name/);
  await bad({ name: 'visit www.spam' }, 400, /name/);
  // a record over 100 KB, and a body over the limit
  const huge = Buffer.alloc(LIMITS.replayBytes + 10, 0x42).toString('base64');
  await bad({ replay: huge }, 400, /replay/);
  await bad({ name: 'x'.repeat(LIMITS.bodyBytes) }, 413, /too large/);
  const notJson = await call(e, 'POST', '/scores', '{"mode":');
  assert.equal(notJson.status, 400);
  // yesterday still counts just past midnight
  const late = await call(e, 'POST', '/scores', score({ day: '2026-10-17', map: dailyFor('2026-10-17').map }), { now: Date.parse('2026-10-18T00:03:00Z') });
  assert.equal(late.status, 200);
  assert.equal((await call(e, 'GET', '/scores')).status, 405);
  assert.equal((await call(e, 'GET', '/nowhere')).status, 404);
  assert.equal((await call(e, 'GET', '/board?mode=versus')).status, 400);
  assert.equal((await call(e, 'GET', '/board?mode=arcade&map=9')).status, 400);
  // nothing refused was stored
  const board = await call(e, 'GET', `/board?mode=daily&day=${TODAY}`);
  assert.equal(board.body.total, 0);
});

test('nicknames: letters of any script, digits, spaces and _ . -, up to 16; tidied', () => {
  assert.equal(cleanName('  子彈   芭蕾  '), '子彈 芭蕾');
  assert.equal(cleanName('Pedro_2.0-mo'), 'Pedro_2.0-mo');
  assert.equal(cleanName('ＰＥＤＲＯ'), 'PEDRO', 'full-width folds to plain');
  for (const bad of ['', ' ', '-dash first', 'a\u0000b', 'emoji🙂', 'x'.repeat(17), 'http://x', 'site.com', null, 42]) assert.equal(cleanName(bad), null, String(bad));
});

test('CORS: the preflight answers, and only the listed origins are named', async () => {
  const e = env({ ALLOWED_ORIGIN: `${ORIGIN}, https://example.itch.io` });
  const pre = await call(e, 'OPTIONS', '/scores', undefined, { headers: { origin: 'https://example.itch.io', 'access-control-request-method': 'POST' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'https://example.itch.io');
  assert.match(pre.headers.get('access-control-allow-methods'), /POST/);
  assert.match(pre.headers.get('access-control-allow-headers'), /content-type/);
  const stranger = await call(e, 'GET', '/daily', undefined, { headers: { origin: 'https://evil.example' } });
  assert.equal(stranger.headers.get('access-control-allow-origin'), ORIGIN, 'a stranger is not echoed back');
  const open = await call(env({ ALLOWED_ORIGIN: '*' }), 'GET', '/daily');
  assert.equal(open.headers.get('access-control-allow-origin'), '*');
});

test('GET /stats: runs and players per day', async () => {
  const e = env();
  await call(e, 'POST', '/scores', score());
  await call(e, 'POST', '/scores', score({ id: 'player-bbbbbbbbbbbb2' }));
  await call(e, 'POST', '/scores', score({ mode: 'arcade', map: 0, id: 'player-bbbbbbbbbbbb2' }));
  await call(e, 'POST', '/scores', score({ day: '2026-10-17', map: dailyFor('2026-10-17').map, id: 'player-cccccccccccc3' }), { now: Date.parse('2026-10-18T00:05:00Z') });
  const r = await call(e, 'GET', '/stats');
  assert.deepEqual(r.body.days, [
    { day: '2026-10-17', daily: 1, arcade: 0, players: 1 },
    { day: '2026-10-18', daily: 2, arcade: 1, players: 2 },
  ]);
});

test('no account details in the repo: the wrangler file is a template, and no npm package was added for the back end', () => {
  const toml = fs.readFileSync(new URL('../backend/wrangler.toml', import.meta.url), 'utf8');
  assert.match(toml, /database_id = "REPLACE-WITH-YOUR-D1-DATABASE-ID"/);
  assert.doesNotMatch(toml, /account_id\s*=/);
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(!('wrangler' in { ...pkg.dependencies, ...pkg.devDependencies }), 'wrangler runs through npx, by the developer');
  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['three'], 'no new dependency (three was there before; the game vendors it)');
  const doc = fs.readFileSync(new URL('../docs/BACKEND.md', import.meta.url), 'utf8');
  for (const step of ['wrangler login', 'wrangler d1 create', 'schema.sql', 'wrangler deploy', 'BACKEND']) assert.ok(doc.includes(step), `the guide covers ${step}`);
});
