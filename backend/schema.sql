-- The leaderboard's D1 database (backend/worker.js). Apply once, and again after a change:
--   npx wrangler d1 execute bullet-ballet --remote --file=backend/schema.sql
-- One row per player, mode and day: the daily's one try, or an arcade day's best.

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,          -- 'daily' or 'arcade'
  day TEXT NOT NULL,           -- 'YYYY-MM-DD', UTC, when the run was played
  map INTEGER NOT NULL,        -- the start map (arcade boards are per map)
  player TEXT NOT NULL,        -- the anonymous id a browser made up
  name TEXT NOT NULL,          -- the nickname, filtered by the worker
  score INTEGER NOT NULL,
  grade TEXT NOT NULL,         -- S A B C D
  replay BLOB,                 -- the run's input record (at most 100 KB)
  created_at INTEGER NOT NULL  -- ms since 1970
);

CREATE UNIQUE INDEX IF NOT EXISTS scores_one_a_day ON scores (mode, day, player);
CREATE INDEX IF NOT EXISTS scores_daily ON scores (mode, day, score DESC);
CREATE INDEX IF NOT EXISTS scores_map ON scores (mode, map, score DESC);
