// The itch.io upload (itch.io 發佈包): `npm run itch` packs the single-file
// build as index.html in a zip; unpacked and served, it plays. docs/itch/ holds
// the 630×500 cover made from a screenshot, six screenshots, the Chinese and
// English text, the tags, and the fields the developer fills in on itch.io.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { startServer } from '../scripts/serve.mjs';
import { unzip, zip } from '../scripts/itch.mjs';
import { SHOTS } from '../scripts/itch-cover.mjs';
import { GPU_ARGS, problems } from './helpers.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-itch-test-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the zip writer and reader agree, byte for byte', () => {
  const files = { 'index.html': Buffer.from('<!doctype html><title>x</title>'.repeat(200)), 'a/b.txt': Buffer.from('子彈芭蕾') };
  const back = unzip(zip(files));
  assert.deepEqual(Object.keys(back), Object.keys(files));
  for (const k of Object.keys(files)) assert.ok(back[k].equals(files[k]), k);
  assert.ok(zip(files).equals(zip(files)), 'the same files make the same zip');
});

let server;
let browser;
before(async () => {
  const out = path.join(tmp, 'bullet-ballet-itch.zip');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/itch.mjs'), out], { stdio: 'pipe' });
  const files = unzip(fs.readFileSync(out));
  const dir = path.join(tmp, 'site');
  fs.mkdirSync(dir);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);
  server = await startServer(0, dir);
  browser = await chromium.launch({ args: GPU_ARGS });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

test('npm run itch: a zip with just index.html, under itch.io’s limits; unpacked and served, a run plays', { timeout: 300000 }, async () => {
  const files = fs.readdirSync(path.join(tmp, 'site'));
  assert.deepEqual(files, ['index.html']);
  const size = fs.statSync(path.join(tmp, 'bullet-ballet-itch.zip')).size;
  assert.ok(size < 16 * 1048576, `${(size / 1048576).toFixed(1)} MB`);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  try {
    await page.addInitScript(() => localStorage.setItem('bullet-ballet.tutorial', 'done'));
    await page.goto(`${server.url}/`);
    await page.waitForFunction(() => window.game && typeof window.game.startRun === 'function', null, { timeout: 120000 });
    const r = await page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      g.startRun(0);
      for (let i = 0; i < 240; i++) g.updatePlay(1 / 60);
      return { state: g.state, wave: g.waves.wave, models: Object.keys(window.BULLET_BALLET_MODELS || {}).length };
    });
    assert.equal(r.state, 'playing');
    assert.ok(r.wave >= 1, 'the first wave came');
    assert.ok(r.models > 0, 'the models came along inside the page');
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('docs/itch: a 630×500 cover, six screenshots, both texts, the tags and the fields to fill in', () => {
  const dir = path.join(ROOT, 'docs/itch');
  const png = fs.readFileSync(path.join(dir, 'cover.png'));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [630, 500], 'the cover is 630×500');
  assert.equal(SHOTS.length, 6);
  for (let i = 1; i <= 6; i++) {
    const jpg = fs.readFileSync(path.join(dir, 'shots', `${i}.jpg`));
    assert.deepEqual([jpg[0], jpg[1]], [0xff, 0xd8], `shot ${i} is a JPEG`);
    assert.ok(jpg.equals(fs.readFileSync(path.join(ROOT, 'docs/shots', SHOTS[i - 1][0]))), `shot ${i} is ${SHOTS[i - 1][0]}`);
  }
  const md = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  // the first cell of each row of the fields table
  const fields = md
    .split('\n')
    .filter((l) => l.startsWith('| '))
    .map((l) => l.split('|')[1]);
  for (const field of ['Title', 'Project URL', 'Kind of project', 'Uploads', 'Viewport dimensions', 'Description', 'Tags', 'AI generation disclosure', 'Visibility & access', 'Cover image', 'Screenshots']) {
    assert.ok(fields.some((f) => f.includes(field)), `the field "${field}"`);
  }
  assert.match(md, /## 4\. 中文說明/);
  assert.match(md, /## 5\. English/);
  const tags = (md.match(/最多 10 個：(.*)/) || [])[1].match(/`[^`]+`/g);
  assert.ok(tags.length > 0 && tags.length <= 10, `${tags.length} tags`);
  assert.match(md, /npm run itch/);
});
