// Leaderboards, the client (排行榜 ②). With BACKEND.url set, a daily or a
// normal-rules arcade run is sent when it ends (a nickname is asked the first
// time), the board page reads the back end, and anyone's replay can be played;
// when the back end fails, or with no address at all, the local board stands
// in and says so, and with no address not a single request is made.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKEND } from '../src/config.js';
import { cleanName, Leaderboard } from '../src/leaderboard.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

/** A fake fetch: answers by path, and keeps every call. */
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const path = new URL(url).pathname;
    const answer = routes[path];
    if (!answer) return new Response('{}', { status: 404 });
    return answer(url, init);
  };
  fn.calls = calls;
  return fn;
}
const okJson = (body, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const run = { mode: 'daily', day: '2026-10-18', map: 3, score: 12345, grade: 'B', replay: 'QkI=' };

test('online: a run goes up with the player’s name and id; the board comes back with the player’s place', async () => {
  BACKEND.url = 'https://board.example/';
  try {
    const fetch = fakeFetch({
      '/scores': okJson({ ok: true, kept: true, rank: 3, total: 10 }),
      '/board': okJson({ ok: true, total: 10, place: 3, top: [{ rank: 1, name: 'Pedro', score: 20000, grade: 'A', me: false, entry: 7 }], around: [] }),
    });
    const lb = new Leaderboard({ fetch, storage: memoryStorage() });
    assert.equal(lb.online, true);
    const first = await lb.submit(run);
    assert.equal(first.error, 'no name', 'the first time it asks for a name');
    assert.equal(fetch.calls.length, 0, 'and sends nothing without one');
    assert.equal(lb.setName('  阿芭  '), '阿芭');
    const o = await lb.submit(run);
    assert.deepEqual(o.online, { rank: 3, total: 10, kept: true });
    const sent = fetch.calls.at(-1);
    assert.equal(sent.url, 'https://board.example/scores', 'no doubled slash');
    assert.equal(sent.method, 'POST');
    assert.deepEqual({ ...sent.body, id: '…' }, { mode: 'daily', day: '2026-10-18', map: 3, score: 12345, grade: 'B', name: '阿芭', id: '…', replay: 'QkI=' });
    assert.match(sent.body.id, /^[A-Za-z0-9_-]{16,64}$/, 'an anonymous id the back end accepts');
    const b = await lb.board('daily', '2026-10-18');
    assert.equal(b.local, false);
    assert.equal(b.place, 3);
    assert.match(fetch.calls.at(-1).url, /\/board\?mode=daily&day=2026-10-18&id=/);
    assert.equal(o.local.total, 2, 'the local board has both runs');
  } finally {
    BACKEND.url = '';
  }
});

test('the back end failing: the run is kept locally, the board falls back to the local one and says why', async () => {
  BACKEND.url = 'https://board.example';
  try {
    const down = fakeFetch({});
    down.calls.length = 0;
    const lb = new Leaderboard({ fetch: () => Promise.reject(new TypeError('Failed to fetch')), storage: memoryStorage() });
    lb.setName('Pedro');
    const o = await lb.submit(run);
    assert.equal(o.online, null);
    assert.equal(o.error, 'unreachable');
    assert.equal(o.local.rank, 1);
    const b = await lb.board('daily', '2026-10-18');
    assert.deepEqual([b.local, b.why, b.top.length, b.top[0].score], [true, 'unreachable', 1, 12345]);
    const err = new Leaderboard({ fetch: fakeFetch({ '/scores': okJson({ ok: false, error: 'bad name' }, 400) }), storage: memoryStorage() });
    err.setName('Pedro');
    assert.equal((await err.submit(run)).error, 'bad name', 'the back end’s reason is kept');
  } finally {
    BACKEND.url = '';
  }
});

test('offline (no address): not one request, and the local board ranks this browser’s runs', async () => {
  BACKEND.url = '';
  const fetch = () => {
    throw new Error('no request may be made offline');
  };
  const st = memoryStorage();
  const lb = new Leaderboard({ fetch, storage: st });
  assert.equal(lb.online, false);
  await lb.submit({ ...run, score: 500 });
  await lb.submit({ ...run, score: 900 });
  const o = await lb.submit({ ...run, score: 700 });
  assert.deepEqual([o.local.rank, o.local.total, o.online, o.error], [2, 3, null, null]);
  const b = await new Leaderboard({ fetch, storage: st }).board('daily', '2026-10-18');
  assert.deepEqual(
    b.top.map((r) => r.score),
    [900, 700, 500],
  );
  assert.equal(b.why, 'offline');
  assert.deepEqual((await lb.board('arcade', 2)).top, [], 'another board is empty');
});

test('nicknames: the same rule as the back end', () => {
  assert.equal(cleanName('  子彈   芭蕾 '), '子彈 芭蕾');
  for (const bad of ['', '<b>', 'x'.repeat(17), 'go to www.x', '-x']) assert.equal(cleanName(bad), null, bad);
  const lb = new Leaderboard({ fetch: () => null, storage: memoryStorage() });
  assert.equal(lb.setName('<script>'), null);
  assert.equal(lb.me.name, '', 'a refused name is not kept');
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** Point the page at a fake back end (or none) and count its requests. */
const fakeBackend = (page, url) =>
  page.evaluate(async (url) => {
    const { BACKEND } = await import('/src/config.js');
    BACKEND.url = url;
    window.requests = [];
    const g = window.game;
    const me = () => g.boards.me;
    window.fetch = async (u, init = {}) => {
      window.requests.push(`${init.method || 'GET'} ${u}`);
      const path = new URL(u).pathname;
      const json = (b) => new Response(JSON.stringify(b), { headers: { 'content-type': 'application/json' } });
      if (path === '/scores') return json({ ok: true, kept: true, rank: 3, total: 41 });
      if (path === '/board') {
        const names = ['Pedro', 'Leong', 'Ka-Man', '子彈王', 'Rosa', 'Tam', 'Ho', 'Ines'];
        const top = names.map((n, i) => ({ rank: i + 1, name: n, score: 42000 - i * 3100, grade: i < 2 ? 'A' : 'B', me: false, entry: i + 1 }));
        top[2] = { ...top[2], name: me().name || '我', me: true };
        return json({ ok: true, total: 41, place: 3, top, around: [] });
      }
      if (path === '/replay') return new Response(g.replays.bytes(g.replays.list[0]), { headers: { 'content-type': 'application/octet-stream' } });
      return new Response('{}', { status: 404 });
    };
  }, url);

test('in the game: the first upload asks a name and shows the place; the board page lists the day and plays a replay', { timeout: 300000 }, async () => {
  const { page, logs } = await h.open('?seed=4');
  try {
    await fakeBackend(page, 'https://board.example');
    await page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      g.now = () => Date.parse('2026-10-18T09:00:00Z');
      g.startDaily();
      let n = 0;
      while (g.state !== 'over' && n++ < 60 * 300) {
        g.input.mouse.left = n % 30 < 20;
        const near = g.enemies.nearestVisible(g.player.x, g.player.z, 30);
        if (near) g.aimPoint.set(near.x, g.aimPoint.y, near.z);
        g.aimFresh = true;
        g.updatePlay(1 / 60);
        if (n === 60 * 25) g.player.hp = 1;
      }
      g.input.mouse.left = false;
    });
    const asked = await page.evaluate(() => ({
      shown: !document.getElementById('go-name-row').classList.contains('hidden'),
      text: document.getElementById('go-board-text').textContent,
      sent: window.requests.filter((r) => r.startsWith('POST')).length,
    }));
    assert.deepEqual(asked, { shown: true, text: '第一次上排行榜：取個暱稱', sent: 0 });
    await page.fill('#go-name', '阿芭 Ballet');
    await page.click('#go-name-save');
    await page.waitForFunction(() => /第 3 名/.test(document.getElementById('go-board-text').textContent));
    const after = await page.evaluate(() => ({ text: document.getElementById('go-board-text').textContent, state: window.game.state, sent: window.requests.filter((r) => r.startsWith('POST')) }));
    assert.equal(after.text, '排行榜：第 3 名（共 41 人）');
    assert.equal(after.state, 'over', 'naming did not restart anything');
    assert.deepEqual(after.sent, ['POST https://board.example/scores']);
    await page.screenshot({ path: new URL('board-end.png', OUT).pathname });
    // the board page
    await page.click('#gameover');
    await page.click('#open-boards');
    await page.waitForFunction(() => document.querySelectorAll('#board-list .board-row').length === 8);
    const board = await page.evaluate(() => ({
      status: document.getElementById('board-status').textContent,
      me: document.querySelector('#board-list .board-row.me .board-name').textContent,
      name: document.getElementById('board-name').value,
    }));
    assert.equal(board.status, '全球 · 41 人 · 我第 3 名');
    assert.deepEqual([board.me, board.name], ['阿芭 Ballet', '阿芭 Ballet']);
    await page.screenshot({ path: new URL('board-page.png', OUT).pathname });
    await page.click('#board-list .board-row:first-child button');
    await page.waitForFunction(() => window.game.replay !== null);
    assert.ok((await page.evaluate(() => window.requests)).some((r) => r === 'GET https://board.example/replay?id=1'));
    await page.keyboard.press('Escape');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('in the game with no address: no requests at all, and the board page shows this browser’s runs', async () => {
  const { page, logs } = await h.open('?seed=6');
  try {
    await fakeBackend(page, '');
    const r = await page.evaluate(async () => {
      const g = window.game;
      g.frame = () => {};
      g.startRun(0); // arcade, normal rules: a local board run
      for (let i = 0; i < 120; i++) g.updatePlay(1 / 60);
      g.player.hp = 1;
      g.player.invuln = 0;
      g.player.hurt(5, 0, 1, false, 'THUG 的子彈');
      let n = 0;
      while (g.state !== 'over' && n++ < 600) g.updatePlay(1 / 60);
      await new Promise((res) => setTimeout(res, 50));
      const end = document.getElementById('go-board-text').textContent;
      g.toTitle();
      g.showBoards(true);
      await g.renderBoard('0');
      return { end, status: document.getElementById('board-status').textContent, rows: document.querySelectorAll('#board-list .board-row').length, requests: window.requests };
    });
    assert.match(r.end, /本機榜第 1 名（離線）/);
    assert.match(r.status, /離線/);
    assert.equal(r.rows, 1);
    assert.deepEqual(r.requests, [], 'not one request');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
