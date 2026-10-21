// The leaderboard back end: one Cloudflare Worker (a plain fetch handler, no
// framework) over a D1 database (schema.sql). The game works without it; with
// its address in src/config.js BACKEND.url the game sends scores and reads the
// boards. Players are an anonymous id from their browser plus a nickname; a
// score carries its run's input record, kept for replays (checking scores by
// replaying them on the server is a third-phase job). Deploying is the
// developer's step: docs/BACKEND.md.
//
//   GET  /daily                 today's challenge: day, seed, map and rules (UTC)
//   POST /scores                { mode, day, map, score, grade, name, id, replay }
//   GET  /board?mode=daily&day=YYYY-MM-DD[&id=…]    top 100, and the player's place with neighbours
//   GET  /board?mode=arcade&map=N[&id=…]            each player's best on that start map
//   GET  /replay?id=N           a board entry's input record (.bbr bytes)
//   GET  /stats                 runs and players per day, the last 30 days

import { dailyFor, utcDay } from '../src/daily.js';
import { cleanName } from '../src/leaderboard.js';

export { cleanName };

export const LIMITS = {
  replayBytes: 100 * 1024, // an input record; a ten-minute run is well under this
  bodyBytes: 160 * 1024, // the JSON around it (base64 is a third larger)
  nameLength: 16,
  maxScore: 99999999,
  maps: 6,
  top: 100,
  around: 3, // places above and below the player's own
  statsDays: 30,
};

const MODES = ['daily', 'arcade'];
const GRADES = ['S', 'A', 'B', 'C', 'D'];
const DAY_MS = 86400000;

const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** The response headers every answer carries: JSON or bytes, and CORS for the game's pages. */
function headers(env, request, type = 'application/json; charset=utf-8') {
  const allowed = String((env && env.ALLOWED_ORIGIN) || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    ...(type ? { 'content-type': type } : {}),
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

const json = (env, request, body, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(env, request) });
const refuse = (env, request, status, error) => json(env, request, { ok: false, error }, status);

/** Check a posted score; returns the row to store, or an error string. */
export function readScore(body, now) {
  if (!body || typeof body !== 'object') return 'not a score';
  const { mode, day, map, score, grade, name, id, replay } = body;
  if (!MODES.includes(mode)) return 'unknown mode';
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'bad day';
  const today = utcDay(now);
  if (day !== today && day !== utcDay(now - DAY_MS)) return 'not today'; // a run that ended just past midnight still counts
  if (!Number.isInteger(map) || map < 0 || map >= LIMITS.maps) return 'bad map';
  if (mode === 'daily' && map !== dailyFor(day).map) return 'not the day’s map';
  if (!Number.isInteger(score) || score < 0 || score > LIMITS.maxScore) return 'bad score';
  if (!GRADES.includes(grade)) return 'bad grade';
  const clean = cleanName(name);
  if (!clean) return 'bad name';
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) return 'bad id';
  if (typeof replay !== 'string' || replay.length > Math.ceil((LIMITS.replayBytes * 4) / 3) + 4) return 'bad replay';
  let bytes;
  try {
    bytes = fromBase64(replay);
  } catch {
    return 'bad replay';
  }
  if (bytes.length < 15 || bytes.length > LIMITS.replayBytes || bytes[0] !== 0x42 || bytes[1] !== 0x42) return 'bad replay';
  return { mode, day, map, score, grade, name: clean, player: id, replay: bytes };
}

/** A board: each player's best row under `where`, best first, places counted from 1, `limit` rows from `offset`. */
async function board(db, where, args, limit, offset = 0) {
  const sql = `SELECT entry, name, score, grade, player FROM (
      SELECT id AS entry, name, score, grade, player, created_at,
             ROW_NUMBER() OVER (PARTITION BY player ORDER BY score DESC, created_at) AS mine
      FROM scores WHERE ${where}
    ) WHERE mine = 1 ORDER BY score DESC, created_at LIMIT ? OFFSET ?`;
  const { results } = await db
    .prepare(sql)
    .bind(...args, limit, offset)
    .all();
  return results.map((r, i) => ({ rank: offset + i + 1, entry: r.entry, name: r.name, score: r.score, grade: r.grade, me: false, player: r.player }));
}

/** Answer one request. `now` is the clock (tests set it). */
export async function handle(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const db = env.DB;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(env, request, null) });

  if (url.pathname === '/daily' && request.method === 'GET') {
    return json(env, request, dailyFor(utcDay(now)));
  }

  if (url.pathname === '/scores') {
    if (request.method !== 'POST') return refuse(env, request, 405, 'POST only');
    const length = Number(request.headers.get('content-length') || 0);
    if (length > LIMITS.bodyBytes) return refuse(env, request, 413, 'too large');
    const text = await request.text();
    if (text.length > LIMITS.bodyBytes) return refuse(env, request, 413, 'too large');
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return refuse(env, request, 400, 'not JSON');
    }
    const row = readScore(body, now);
    if (typeof row === 'string') return refuse(env, request, 400, row);
    // one row per player, mode and day: the daily's one try, an arcade day's best
    const had = await db.prepare('SELECT id, score FROM scores WHERE mode = ? AND day = ? AND player = ?').bind(row.mode, row.day, row.player).first();
    const blob = row.replay.buffer.slice(row.replay.byteOffset, row.replay.byteOffset + row.replay.byteLength);
    let kept = true;
    if (had && row.mode === 'daily') return refuse(env, request, 409, 'already played today');
    if (had && row.score <= had.score) kept = false;
    else if (had) {
      await db
        .prepare('UPDATE scores SET map = ?, name = ?, score = ?, grade = ?, replay = ?, created_at = ? WHERE id = ?')
        .bind(row.map, row.name, row.score, row.grade, blob, now, had.id)
        .run();
    } else {
      await db
        .prepare('INSERT INTO scores (mode, day, map, player, name, score, grade, replay, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(row.mode, row.day, row.map, row.player, row.name, row.score, row.grade, blob, now)
        .run();
    }
    const where = row.mode === 'daily' ? "mode = 'daily' AND day = ?" : "mode = 'arcade' AND map = ?";
    const key = row.mode === 'daily' ? row.day : row.map;
    const best = await db
      .prepare(`SELECT MAX(score) AS score FROM scores WHERE ${where} AND player = ?`)
      .bind(key, row.player)
      .first();
    const above = await db
      .prepare(`SELECT COUNT(*) AS n FROM (SELECT player, MAX(score) AS s FROM scores WHERE ${where} GROUP BY player) WHERE s > ?`)
      .bind(key, best.score)
      .first();
    const total = await db.prepare(`SELECT COUNT(DISTINCT player) AS n FROM scores WHERE ${where}`).bind(key).first();
    return json(env, request, { ok: true, kept, rank: above.n + 1, total: total.n });
  }

  if (url.pathname === '/board' && request.method === 'GET') {
    const mode = url.searchParams.get('mode');
    const me = url.searchParams.get('id') || '';
    let where;
    let key;
    if (mode === 'daily') {
      key = url.searchParams.get('day') || utcDay(now);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return refuse(env, request, 400, 'bad day');
      where = "mode = 'daily' AND day = ?";
    } else if (mode === 'arcade') {
      key = Number(url.searchParams.get('map'));
      if (!Number.isInteger(key) || key < 0 || key >= LIMITS.maps) return refuse(env, request, 400, 'bad map');
      where = "mode = 'arcade' AND map = ?";
    } else return refuse(env, request, 400, 'unknown mode');
    const top = await board(db, where, [key], LIMITS.top);
    let around = [];
    let place = null;
    if (me) {
      const best = await db
        .prepare(`SELECT MAX(score) AS score FROM scores WHERE ${where} AND player = ?`)
        .bind(key, me)
        .first();
      if (best && best.score !== null) {
        // ties go to whoever got there first, as on the board
        const ahead = await db
          .prepare(`SELECT COUNT(*) AS n FROM (SELECT player, MAX(score) AS s FROM scores WHERE ${where} GROUP BY player) WHERE s > ?`)
          .bind(key, best.score)
          .first();
        place = ahead.n + 1;
        const from = Math.max(0, place - 1 - LIMITS.around);
        around = await board(db, where, [key], place - from + LIMITS.around, from); // up to three above, the player, three below
      }
    }
    const total = await db.prepare(`SELECT COUNT(DISTINCT player) AS n FROM scores WHERE ${where}`).bind(key).first();
    const mark = (rows) => rows.map(({ player, ...r }) => ({ ...r, me: player === me }));
    return json(env, request, { ok: true, mode, key, total: total.n, top: mark(top), place, around: mark(around) });
  }

  if (url.pathname === '/replay' && request.method === 'GET') {
    const id = Number(url.searchParams.get('id'));
    if (!Number.isInteger(id) || id < 1) return refuse(env, request, 400, 'bad id');
    const row = await db.prepare('SELECT replay FROM scores WHERE id = ?').bind(id).first();
    if (!row || !row.replay) return refuse(env, request, 404, 'no such replay');
    const bytes = row.replay instanceof ArrayBuffer ? new Uint8Array(row.replay) : Uint8Array.from(row.replay);
    return new Response(bytes, { status: 200, headers: headers(env, request, 'application/octet-stream') });
  }

  if (url.pathname === '/stats' && request.method === 'GET') {
    const since = utcDay(now - (LIMITS.statsDays - 1) * DAY_MS);
    const { results } = await db
      .prepare(
        `SELECT day, SUM(mode = 'daily') AS daily, SUM(mode = 'arcade') AS arcade, COUNT(DISTINCT player) AS players
         FROM scores WHERE day >= ? GROUP BY day ORDER BY day`,
      )
      .bind(since)
      .all();
    return json(env, request, { ok: true, days: results.map((r) => ({ day: r.day, daily: r.daily, arcade: r.arcade, players: r.players })) });
  }

  return refuse(env, request, 404, 'no such endpoint');
}

export default {
  fetch(request, env) {
    return handle(request, env).catch(() => refuse(env, request, 500, 'server error'));
  },
};
