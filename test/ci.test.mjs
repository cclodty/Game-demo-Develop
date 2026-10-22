// CI runs the tests in shards (.github/workflows/ci.yml matrix, package.json
// test:shard), so a push waits a third of the time. The shards must run the
// very files `npm test` runs, each once: the same globs, Node's own
// --test-shard (it deals the files out in turn), one job for each shard.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const scripts = JSON.parse(fs.readFileSync(new URL('package.json', root), 'utf8')).scripts;
const ci = fs.readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');

test('the CI shards run what npm test runs: the same files, Node’s --test-shard, one job a shard', () => {
  assert.equal(scripts['test:shard'], scripts.test.replace('--test-concurrency=1', '--test-concurrency=1 --test-shard=$SHARD'), 'test:shard is npm test with a shard picked');
  const shards = ci.match(/shard:\s*\[([\d,\s]+)\]/);
  assert.ok(shards, 'a matrix of shards');
  const list = shards[1].split(',').map((n) => Number(n.trim()));
  assert.deepEqual(list, list.map((_, i) => i + 1), 'shards 1, 2, 3 … with none left out');
  const env = ci.match(/SHARD:\s*\$\{\{\s*matrix\.shard\s*\}\}\/(\d+)/);
  assert.ok(env, 'each job tells test:shard its shard');
  assert.equal(Number(env[1]), list.length, 'out of as many shards as there are jobs');
  assert.match(ci, /run: npm run test:shard/);
  assert.match(ci, /fail-fast: false/, 'one red shard does not stop the others');
});
