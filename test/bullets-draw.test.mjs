// 彈幕試驗 ①: every bullet drawn instanced. A bullet hell wants hundreds of
// bullets at once; drawn as two meshes each (its trail, its head), 300 of them
// were 600 draw calls. Now each look of bullet (the player's, a ricochet, an
// enemy's, a pellet, a sniper's) is two instanced meshes, whatever the number
// of bullets: the calls do not grow with them, and each bullet is drawn where
// and as it was (its head at its place and size, its trail its length along
// its way). Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=7'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A run on the rooftop, nobody about; the frame drawn from the default view. */
    window.fresh = () => {
      g.view = 2;
      g.setMode('arcade');
      g.setRules('normal', []);
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      g.bullets.clear();
      g.updatePlay(1 / 120);
      g.enemies.clear();
    };
    window.draw = () => {
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      g.render();
      return g.renderer.info.render.calls;
    };
    /** `n` enemy bullets standing still in rings round the player, out of his way. */
    window.ring = (n) => {
      const p = g.player;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 * 7;
        const r = 2.5 + (i % 40) * 0.12;
        const b = g.bullets.spawn({ x: p.x + Math.sin(a) * r, z: p.z + Math.cos(a) * r, dx: Math.cos(a), dz: -Math.sin(a), speed: 0, owner: 'enemy', damage: 0 });
        b.trailLen = 0.8;
        g.bullets.updateVisual(b);
      }
    };
  });
});
after(async () => {
  await h.close();
});

test('800 enemy bullets at once: the bullets’ draw calls do not grow with their number, and the frame stays within 600', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.fresh();
    window.ring(1);
    const one = window.draw();
    g.bullets.clear();
    window.fresh();
    window.ring(800);
    const many = window.draw();
    const n = g.bullets.list.length;
    return { one, many, n };
  });
  await page.screenshot({ path: new URL('bullets-800.png', OUT).pathname });
  assert.equal(r.n, 800);
  assert.equal(r.many, r.one, `one bullet ${r.one} calls, 800 bullets ${r.many}`);
  assert.ok(r.many <= 600, `${r.many} draw calls`);
  assert.deepEqual(problems(logs), []);
});

test('each bullet is drawn where and as it is: its head at its place and its look’s size, its trail its length along its way, its look’s colours; none drawn once it is gone', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const B = g.bullets;
    window.fresh();
    const p = g.player;
    const looks = ['player', 'ricochet', 'enemy', 'pellet', 'sniper'];
    const made = looks.map((look, i) => {
      const a = 0.4 + i * 1.1;
      const b = B.spawn({ x: p.x - 4 + i * 2, z: p.z - 3, dx: Math.sin(a), dz: Math.cos(a), speed: 0, owner: look === 'enemy' || look === 'sniper' ? 'enemy' : 'player', look, damage: 0 });
      b.trailLen = 0.5 + i * 0.3;
      B.updateVisual(b);
      return b;
    });
    window.draw();
    const m = new g.camera.matrix.constructor();
    const pos = new g.camera.position.constructor();
    const q = new g.camera.quaternion.constructor();
    const s = new g.camera.position.constructor();
    const drawn = (mesh) => {
      const out = [];
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        m.decompose(pos, q, s);
        const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
        out.push({ x: pos.x, y: pos.y, z: pos.z, sx: s.x, sz: s.z, yaw });
      }
      return out;
    };
    const rows = made.map((b) => {
      const L = B.looks[b.look];
      const meshes = B.meshesOf(b.look);
      const heads = drawn(meshes.head);
      const trails = drawn(meshes.trail);
      const near = (o) => Math.hypot(o.x - b.group.position.x, o.y - b.group.position.y, o.z - b.group.position.z) < 1e-4;
      const head = heads.find(near);
      const trail = trails.find(near);
      return {
        look: b.look,
        head: head && Math.abs(head.sx - L.headSize) < 1e-5,
        trail: trail && Math.abs(trail.sz - b.trailLen) < 1e-5 && Math.abs(trail.sx - 1) < 1e-5 && Math.abs(Math.atan2(Math.sin(trail.yaw - Math.atan2(b.dx, b.dz)), Math.cos(trail.yaw - Math.atan2(b.dx, b.dz)))) < 1e-4,
        mats: meshes.head.material === L.head && meshes.trail.material === L.trail && meshes.trail.geometry === L.geo,
      };
    });
    // gone: none of them drawn any more
    B.clear();
    window.draw();
    const left = looks.reduce((n, look) => n + B.meshesOf(look).head.count + B.meshesOf(look).trail.count, 0);
    return { rows, left };
  });
  for (const row of r.rows) {
    assert.equal(row.head, true, `${row.look}: its head where it is, its size`);
    assert.equal(row.trail, true, `${row.look}: its trail its length along its way`);
    assert.equal(row.mats, true, `${row.look}: its look’s colours`);
  }
  assert.equal(r.left, 0, 'cleared: nothing drawn');
});

test('screenshot: one bullet of each look, and an enemy’s ring round the player', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const B = g.bullets;
    window.fresh();
    const p = g.player;
    ['player', 'ricochet', 'enemy', 'pellet', 'sniper'].forEach((look, i) => {
      const b = B.spawn({ x: p.x - 4 + i * 2, z: p.z - 3, dx: 1, dz: 0, speed: 0, owner: look === 'enemy' || look === 'sniper' ? 'enemy' : 'player', look, damage: 0 });
      b.trailLen = 1.2;
      B.updateVisual(b);
    });
    window.ring(60);
    window.draw();
  });
  await page.screenshot({ path: new URL('bullets-looks.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});
