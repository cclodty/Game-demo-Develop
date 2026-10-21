// Achievements and unlocks (成就與解鎖 ①, 成就與變體 ②): ten achievements as
// data, each reached in play through the game's own events (kills with their
// tags, kills without a gun, close calls, clean waves, waves without a shot,
// the Style rank, a cleared run), kept in localStorage across reloads, and
// four unlocks that appear on the title once earned: the SMG start, the 油桶節
// and 無槍 variants and the coat colours. A replay being watched earns nothing.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Achievements, ACHIEVEMENTS, COAT_UNLOCK, COATS, ENV_TAGS } from '../src/achievements.js';
import { VARIANTS } from '../src/rules.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('the data: ten achievements, each opening at most what the card says, and the coats', () => {
  assert.equal(ACHIEVEMENTS.length, 10);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 10, 'ids are unique');
  const opened = Object.values(VARIANTS)
    .filter((v) => v.unlock)
    .map((v) => [v.en, v.unlock]);
  assert.deepEqual(opened, [
    ['BARREL FEST', 'useEverything'],
    ['SMG START', 'bankShot'],
    ['NO GUNS', 'bareHands'],
  ]);
  for (const [, id] of opened) assert.ok(ACHIEVEMENTS.some((a) => a.id === id), `${id} is an achievement`);
  assert.ok(ACHIEVEMENTS.some((a) => a.id === COAT_UNLOCK));
  assert.equal(COATS[0].hue, null, 'the first coat is the usual one');
  assert.equal(ENV_TAGS.length >= 5, true);
});

test('each achievement has its trigger; per-run counts start over; the record survives a new start; watching earns nothing', () => {
  const st = memoryStorage();
  const got = [];
  const a = new Achievements(st, (x) => got.push(x.id));
  // a ricochet that kills one is not a bank shot; its second kill is
  a.kill(['GRUNT', 'RICOCHET'], 1);
  a.kill(['GRUNT', 'COLLATERAL'], 2);
  assert.deepEqual(got, [], 'the second kill was not a ricochet');
  a.kill(['GRUNT', 'RICOCHET', 'COLLATERAL'], 2);
  assert.deepEqual(got, ['bankShot']);
  // a hurt wave is not clean
  a.wave(false);
  a.wave(true);
  assert.equal(got.at(-1), 'untouched');
  // a wave without a shot: not when it is not known (an older caller), nor after one shot; after none
  a.wave(false, 1);
  assert.equal(a.has('bareHands'), false);
  a.wave(false, 0);
  assert.equal(got.at(-1), 'bareHands', 'hurt or not');
  // nine close calls in one run and one in the next: not ten in a run
  for (let i = 0; i < 9; i++) a.style('CLOSE CALL');
  a.startRun();
  a.style('CLOSE CALL');
  assert.equal(a.has('closeShave'), false);
  for (let i = 0; i < 9; i++) a.style('CLOSE CALL');
  assert.equal(got.at(-1), 'closeShave');
  // S on another map is not S at Senado; SS at Senado is
  a.rank('SSS', 'docks');
  a.rank('A', 'senado');
  assert.equal(a.has('senadoS'), false);
  a.rank('SS', 'senado');
  assert.equal(got.at(-1), 'senadoS');
  // five kinds of environment kill, over runs
  a.kill(['GRUNT', 'BOOM']);
  a.kill(['GRUNT', 'BOOM']);
  a.kill(['THUG', 'STRIKE!']);
  a.startRun();
  a.kill(['THUG', 'PIGEON STRIKE']);
  assert.deepEqual(a.progress(ACHIEVEMENTS.find((x) => x.id === 'useEverything')), { have: 4, need: 5 }, 'RICOCHET earlier was one');
  a.kill(['THUG', 'FRIENDLY FIRE']);
  assert.equal(got.at(-1), 'useEverything');
  a.kill(['THUG', 'SCATTER']);
  assert.equal(got.at(-1), 'scatter');
  for (let i = 0; i < 4; i++) a.kill(['THUG', 'PIROUETTE']);
  assert.equal(a.has('carousel'), false);
  a.kill(['THUG', 'PIROUETTE', 'MULTI KILL']);
  assert.equal(got.at(-1), 'carousel');
  // thirty kills without a gun in one run: 29 and a gun kill are not; the count starts over with a run
  for (let i = 0; i < 29; i++) a.kill(['THUG', 'KICK'], 0, true);
  a.kill(['THUG'], 0, false);
  assert.deepEqual(a.progress(ACHIEVEMENTS.find((x) => x.id === 'wokHei')), { have: 29, need: 30 });
  a.startRun();
  a.kill(['THUG', 'KICK'], 0, true);
  assert.deepEqual(a.progress(ACHIEVEMENTS.find((x) => x.id === 'wokHei')), { have: 1, need: 30 });
  for (let i = 0; i < 29; i++) a.kill(['THUG', 'EXECUTION'], 0, true);
  assert.equal(got.at(-1), 'wokHei');
  a.clear();
  assert.deepEqual(got, ['bankShot', 'untouched', 'bareHands', 'closeShave', 'senadoS', 'useEverything', 'scatter', 'carousel', 'wokHei', 'runClear']);
  // done once only
  a.clear();
  a.kill(['THUG', 'SCATTER']);
  a.wave(true, 0);
  assert.equal(got.length, 10);
  // a new start on the same storage remembers them, and the coat
  a.setCoat('gold');
  a.setCoat('nonsense');
  const b = new Achievements(st);
  assert.deepEqual(
    ACHIEVEMENTS.filter((x) => b.has(x.id)).map((x) => x.id),
    ACHIEVEMENTS.map((x) => x.id),
  );
  assert.equal(b.coat, 'gold');
  assert.equal(b.coatOpen, true);
  // watching a replay: nothing counts
  const w = new Achievements(memoryStorage(), (x) => got.push(x.id));
  w.watching = true;
  w.kill(['THUG', 'SCATTER']);
  w.wave(true, 0);
  w.clear();
  w.rank('SSS', 'senado');
  for (let i = 0; i < 10; i++) w.style('CLOSE CALL');
  for (let i = 0; i < 30; i++) w.kill(['THUG', 'KICK'], 0, true);
  assert.equal(got.length, 10);
  assert.deepEqual(w.progress(ACHIEVEMENTS.find((x) => x.id === 'closeShave')), { have: 0, need: 10 });
  // a garbled record starts empty instead of breaking the game
  const bad = memoryStorage();
  bad.setItem('bullet-ballet.achievements', '{not json');
  assert.equal(new Achievements(bad).has('scatter'), false);
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** Helpers in the page: an empty run on a map, frames, and enemies to be killed. */
const install = (page) =>
  page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.run = (map, variants = []) => {
      g.setRules('normal', variants);
      g.startRun(map);
      g.waves.state = 'done';
      g.enemies.clear();
      g.player.x = 0;
      g.player.z = 3;
      g.killcamT = 0;
      g.hitstopT = 0;
      g.setFocus(false);
    };
    window.play = (n) => {
      for (let i = 0; i < n; i++) {
        g.player.hp = 100;
        g.updatePlay(1 / 60);
      }
    };
    window.grunt = (x, z) => {
      const e = g.enemies.spawn('grunt', { x, z, ex: x, ez: z + 0.1, stay: true });
      e.spawnLock = 0;
      return e;
    };
    /** A player bullet from (x, z) going -z; `set` marks it (ricochet, scatter) as the game would. */
    window.shoot = (x, z, o = {}, set = {}) => {
      const b = g.bullets.spawn({ x, z, dx: 0, dz: -1, speed: 60, owner: 'player', damage: 99, ...o });
      Object.assign(b, set);
      return b;
    };
    window.done = () => g.achievements && Object.keys(g.achievements.done);
  });

test('in play: every achievement comes from the game’s own events, shows a toast, and is still there after a reload', { timeout: 300000 }, async () => {
  const { page, logs } = await h.open('?seed=11');
  try {
    await install(page);
    // 一彈兩命: one bounced bullet through two grunts (pierce 1: it carries on after the first)
    const bank = await page.evaluate(() => {
      const g = window.game;
      window.toasts = [];
      const toast = g.hud.toast.bind(g.hud);
      g.hud.toast = (html) => {
        window.toasts.push(html);
        toast(html);
      };
      window.logs = []; // the notes' event log starts over with each run
      const log = g.notes.log.bind(g.notes);
      g.notes.log = (text) => {
        window.logs.push(text);
        log(text);
      };
      window.run(1);
      const two = [window.grunt(0, -1), window.grunt(0, -4)]; // (a corpse leaves enemies.list: keep them here)
      window.shoot(0, 2.4, { pierce: 1 }, { ricochet: true });
      const after = [];
      for (let i = 0; i < 20; i++) {
        window.play(1);
        after.push([two.filter((e) => e.dead).length, window.done().length]);
      }
      g.killcamT = 0;
      g.hitstopT = 0;
      g.hud.update(1 / 60);
      g.render();
      return { kills: two.filter((e) => e.dead).length, done: window.done(), after };
    });
    // the unlock toast as it shows, over the two grunts: its 1.7 s animation held at 0.5 s for the shot
    const shown = await page.evaluate(() => {
      const t = document.getElementById('toast');
      const hud = window.game.hud;
      Object.getPrototypeOf(hud).toast.call(hud, window.toasts[0]); // not through the counting wrapper
      clearTimeout(hud.toastTimer); // (a slow screenshot could outlast it)
      const a = t.getAnimations()[0];
      a.pause();
      a.currentTime = 500;
      return t.textContent;
    });
    assert.equal(shown, '成就：一彈兩命 BANK SHOT解鎖：雙衝鋒槍起手');
    await page.screenshot({ path: new URL('ach-toast.png', OUT).pathname });
    await page.evaluate(() => (document.getElementById('toast').className = ''));
    const r = await page.evaluate(() => {
      const g = window.game;
      const out = {};
      const toasts = window.toasts;
      // 天女散花: a scatter shard kills
      window.run(1);
      window.grunt(0, -2);
      window.shoot(0, 2.4, {}, { scatter: true });
      window.play(20);
      out.scatter = window.done();
      // 旋轉木馬: five kills with spin-shot bullets in one run
      window.run(1);
      const spins = [];
      for (let i = 0; i < 5; i++) {
        window.grunt(0, -2);
        window.shoot(0, 2.4, { spinShot: true });
        window.play(20);
        spins.push(g.achievements.has('carousel'));
      }
      out.spins = spins;
      // 擦身而過: ten enemy bullets passing 0.8 m beside the player (south of the player: the tray at 0, 4 is north)
      window.run(1);
      const calls = [];
      for (let i = 0; i < 10; i++) {
        g.bullets.spawn({ x: -8, z: 2.2, dx: 1, dz: 0, speed: 40, owner: 'enemy', damage: 10 });
        window.play(30);
        calls.push(g.achievements.counts['CLOSE CALL'] || 0);
      }
      out.calls = { calls, done: g.achievements.has('closeShave'), hp: g.player.hp };
      // 物盡其用: five kinds of environment kill (RICOCHET and SCATTER above are two)
      window.run(1);
      const kinds = [];
      const env = [
        (e) => g.explode(e.x, e.z, 2.5), // a barrel's blast: BOOM
        (e) => e.die(0, -1, { cause: 'strike' }), // a corpse bowled into him: STRIKE!
        (e) => {
          e.blindT = 1; // pigeons in his face
          e.die(0, -1, { cause: 'bullet' });
        },
      ];
      for (const kill of env) {
        const e = window.grunt(0, -6);
        window.play(1);
        kill(e);
        window.play(10);
        kinds.push(g.achievements.progress({ distinct: ['BOOM', 'RICOCHET', 'SCATTER', 'PIGEON STRIKE', 'CHAIN', 'STRIKE!', 'FRIENDLY FIRE'], need: 5 }).have);
      }
      out.env = { kinds, done: g.achievements.has('useEverything') };
      // 毫髮無傷: a wave in which the player was hit does not count; the next, clean one does
      g.setRules('normal', []);
      g.startRun(1);
      const waves = [];
      let n = 0;
      let hurtOnce = false;
      while (g.waves.wave < 3 && n++ < 60 * 120) {
        for (const e of g.enemies.list) if (e.alive && e.spawnLock <= 0) e.die(0, -1, { cause: 'bullet' });
        if (g.waves.wave === 1 && !hurtOnce && g.waves.state === 'active') {
          hurtOnce = true;
          g.player.invuln = 0;
          g.player.hurt(5, 0, 1, false, '測試');
        }
        g.player.hp = 100;
        g.killcamT = 0;
        g.updatePlay(1 / 60);
        if (g.waves.wave !== waves.length) waves.push(g.achievements.has('untouched'));
      }
      out.waves = { waves, wave: g.waves.wave, done: g.achievements.has('untouched'), bare: g.achievements.has('bareHands') }; // nobody fired: 赤手空拳 too
      // 鑊氣: thirty kills in a run without a gun (kicks here)
      window.run(1);
      const kicks = [];
      for (let i = 0; i < 30; i++) {
        window.grunt(0, -2).die(0, -1, { cause: 'kick' });
        window.play(1);
        kicks.push(g.achievements.has('wokHei'));
      }
      out.wok = { first: kicks.indexOf(true) + 1, done: g.achievements.has('wokHei') };
      // 議事亭之舞: the Style rank to S at Senado (A or SSS elsewhere does not count)
      const rankUp = (map) => {
        window.run(map);
        let k = 0;
        while (g.score.rank.index < 5 && k++ < 400) g.score.kill([{ label: 'GRUNT', pts: 100 }, { label: ['SLOW-MO', 'SPIN KILL', 'SLIDE KILL', 'JUGGLE', 'LONG SHOT'][k % 5], pts: 100 }]);
        window.play(1);
        return g.score.rank.name;
      };
      const senado = g.maps.findIndex((m) => m.id === 'senado');
      out.rankElsewhere = { rank: rankUp(0), done: g.achievements.has('senadoS') };
      out.rankSenado = { rank: rankUp(senado), done: g.achievements.has('senadoS') };
      // 十二波: the arcade run's last wave down
      window.run(1);
      g.onRunClear(12);
      out.clear = g.achievements.has('runClear');
      out.toasts = toasts.filter((t) => t.startsWith('成就'));
      out.log = window.logs.filter((t) => t.startsWith('成就'));
      out.stored = JSON.parse(localStorage.getItem('bullet-ballet.achievements')).done;
      return out;
    });
    assert.equal(bank.kills, 2, 'both grunts down');
    assert.deepEqual(bank.done, ['bankShot']);
    assert.ok(
      bank.after.some(([dead, done]) => dead === 1 && done === 0),
      'after its first kill alone it was not one yet',
    );
    assert.ok(r.scatter.includes('scatter'));
    assert.deepEqual(r.spins, [false, false, false, false, true], 'the fifth PIROUETTE');
    assert.deepEqual(r.calls.calls, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'each bullet a close call');
    assert.equal(r.calls.done, true);
    assert.deepEqual(r.env.kinds, [3, 4, 5], 'RICOCHET and SCATTER count already; BOOM, STRIKE!, PIGEON STRIKE add');
    assert.equal(r.env.done, true);
    assert.deepEqual(r.waves.waves.slice(0, 3), [false, false, true], 'not after the hurt wave 1; after wave 2');
    assert.equal(r.waves.done, true);
    assert.equal(r.waves.bare, true, 'a wave cleared without a shot');
    assert.deepEqual(r.wok, { first: 30, done: true }, 'the thirtieth kick');
    assert.deepEqual(r.rankElsewhere, { rank: 'SS', done: false });
    assert.deepEqual(r.rankSenado, { rank: 'SS', done: true });
    assert.equal(r.clear, true);
    assert.equal(r.toasts.length, 10, r.toasts.join('\n'));
    assert.match(r.toasts.find((t) => t.includes('一彈兩命')), /解鎖：雙衝鋒槍起手/);
    assert.match(r.toasts.find((t) => t.includes('物盡其用')), /解鎖：油桶節/);
    assert.match(r.toasts.find((t) => t.includes('擦身而過')), /解鎖：外套顏色/);
    assert.match(r.toasts.find((t) => t.includes('赤手空拳')), /解鎖：無槍/);
    assert.doesNotMatch(r.toasts.find((t) => t.includes('十二波')), /解鎖/);
    assert.equal(r.log.length, 10);
    assert.deepEqual(Object.keys(r.stored).sort(), ACHIEVEMENTS.map((a) => a.id).sort());

    // a reload: all still done; the page lists them; the unlocks are on the title
    await page.reload();
    await page.waitForFunction(() => window.game && typeof window.game.startRun === 'function', null, { timeout: 120000 });
    await install(page);
    const t = await page.evaluate(() => {
      const g = window.game;
      g.toTitle();
      const card = (id) => document.querySelector(`#variant-cards [data-rule="${id}"]`);
      return {
        done: window.done(),
        cards: [...document.querySelectorAll('#variant-cards .mode-card')].filter((c) => !c.classList.contains('hidden')).length,
        coatRow: !document.getElementById('coat-row').classList.contains('hidden'),
        barrel: !!card('barrelFest') && !card('barrelFest').classList.contains('hidden'),
      };
    });
    assert.equal(t.done.length, 10);
    assert.equal(t.cards, 6, 'the three opened variants are on the title');
    assert.equal(t.coatRow, true);
    assert.equal(t.barrel, true);
    await page.click('#open-achievements');
    const list = await page.evaluate(() => ({
      rows: document.querySelectorAll('#ach-list .ach-row.done').length,
      count: document.getElementById('ach-count').textContent,
    }));
    assert.deepEqual(list, { rows: 10, count: '已完成 10 / 10' });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('unlocked: the SMG start, 油桶節 and the coat take effect; locked, they are not on offer', { timeout: 300000 }, async () => {
  const { page, logs } = await h.open('?seed=12');
  try {
    await install(page);
    // locked: a fresh browser
    const locked = await page.evaluate(() => {
      const g = window.game;
      g.toTitle();
      const shown = (id) => !document.querySelector(`#variant-cards [data-rule="${id}"]`).classList.contains('hidden');
      g.setRules('normal', ['smgStart', 'barrelFest', 'dualist']);
      const variants = [...g.variants];
      window.run(1, ['smgStart', 'barrelFest']);
      return {
        smg: shown('smgStart'),
        barrel: shown('barrelFest'),
        coat: !document.getElementById('coat-row').classList.contains('hidden'),
        variants,
        slot: g.player.slot,
        pans: g.level.pans.length,
      };
    });
    assert.deepEqual(locked, { smg: false, barrel: false, coat: false, variants: ['dualist'], slot: 'pistols', pans: locked.pans });
    assert.ok(locked.pans > 0);
    // a few achievements page shot with three done
    await page.evaluate(() => {
      const a = window.game.achievements;
      a.kill(['THUG', 'SCATTER']);
      a.wave(true);
      for (let i = 0; i < 3; i++) a.style('CLOSE CALL');
      for (const t of ['BOOM', 'STRIKE!']) a.kill(['THUG', t]);
      window.game.toTitle();
    });
    await page.click('#open-achievements');
    await page.screenshot({ path: new URL('ach-page.png', OUT).pathname });
    await page.keyboard.press('Escape');
    // unlocked
    const open = await page.evaluate(async () => {
      const g = window.game;
      const a = g.achievements;
      a.kill(['THUG', 'RICOCHET', 'COLLATERAL'], 2); // 一彈兩命
      a.kill(['THUG', 'PIGEON STRIKE']); // 物盡其用: with SCATTER, BOOM, STRIKE! and RICOCHET, five
      a.startRun();
      for (let i = 0; i < 10; i++) a.style('CLOSE CALL'); // 擦身而過
      g.toTitle();
      const shown = (id) => !document.querySelector(`#variant-cards [data-rule="${id}"]`).classList.contains('hidden');
      const out = { smg: shown('smgStart'), barrel: shown('barrelFest'), coatRow: !document.getElementById('coat-row').classList.contains('hidden') };
      // SMG start
      window.run(1, ['smgStart']);
      out.start = { slot: g.player.slot, special: g.player.special && g.player.special.id, model: g.player.rig.model, label: g.ruleset.label };
      // a pistol start again without it
      window.run(1, []);
      out.plain = g.player.slot;
      // 油桶節: every pan a barrel, on every map, inside the render budget
      out.maps = [];
      for (let map = 0; map < g.maps.length; map++) {
        window.run(map, []);
        const before = { pans: g.level.pans.length, barrels: g.level.barrels.length };
        window.run(map, ['barrelFest']);
        window.play(2); // the barrels in their places
        g.player.placeAtStart();
        g.updateCamera(1, true);
        g.render();
        const info = g.renderer.info.render;
        out.maps.push({ map: g.level.map.id, before, after: { pans: g.level.pans.length, barrels: g.level.barrels.length }, tris: info.triangles, calls: info.calls, budget: g.level.map.budget });
      }
      // a barrel from a pan goes off like any other
      window.run(1, ['barrelFest']);
      const b = g.level.barrels.at(-1);
      g.player.x = b.x + 9;
      g.player.z = b.z;
      const e = window.grunt(b.x, b.z + 1.5);
      window.play(1);
      b.hit(9, -1, 0);
      window.play(60);
      out.blast = { gruntDead: !e.alive, log: g.notes.events.map((x) => x.text).filter((t) => t.includes('BOOM')).length };
      // the coat: a click on a colour, kept across runs, the hero's jacket (the model's texture) and the block body
      g.toTitle();
      document.querySelector('#coat-cards [data-coat="pink"]').click();
      const rig = g.player.rig;
      const tex = rig.skin && (rig.skin.mats.find((m) => m.map) || {}).map;
      out.coat = { stored: JSON.parse(localStorage.getItem('bullet-ballet.achievements')).coat, body: rig.mats.body.color.getHex(), canvas: !!tex && tex.image instanceof HTMLCanvasElement };
      window.run(1, []);
      out.coatAfterRun = g.achievements.coat;
      g.toTitle();
      document.querySelector('#coat-cards [data-coat="teal"]').click();
      out.teal = { body: rig.mats.body.color.getHex(), canvas: !!tex && tex.image instanceof HTMLCanvasElement };
      document.querySelector('#coat-cards [data-coat="gold"]').click();
      return out;
    });
    assert.deepEqual([open.smg, open.barrel, open.coatRow], [true, true, true]);
    assert.deepEqual(open.start, { slot: 'special', special: 'smg', model: 'dualSmg', label: '雙衝鋒槍起手' });
    assert.equal(open.plain, 'pistols');
    for (const m of open.maps) {
      assert.ok(m.before.pans > 0, `${m.map} has pans`);
      assert.deepEqual(m.after, { pans: 0, barrels: m.before.barrels + m.before.pans }, `${m.map}: every pan a barrel`);
      assert.ok(m.tris <= m.budget.tris && m.calls <= m.budget.calls, `${m.map}: ${m.tris} triangles, ${m.calls} draw calls, budget ${m.budget.tris} / ${m.budget.calls}`);
    }
    assert.equal(open.blast.gruntDead, true, 'the blast killed him');
    assert.ok(open.blast.log >= 1, 'a BOOM kill');
    assert.equal(open.coat.stored, 'pink');
    assert.equal(open.coat.body, 0xd94a9a);
    assert.equal(open.coat.canvas, true, 'the jacket in the model’s texture is recoloured');
    assert.equal(open.coatAfterRun, 'pink');
    assert.deepEqual(open.teal, { body: 0x2f9fbf, canvas: false }, 'back to the original texture');
    // 油桶節 on the club: a barrel where each tray was (the same spot as the toast shot)
    await page.evaluate(() => {
      const g = window.game;
      window.run(1, ['barrelFest']);
      window.play(2); // props take their places as a frame is shown
      g.updateCamera(1, true);
      g.hud.update(1 / 60);
      g.render();
    });
    await page.screenshot({ path: new URL('ach-barrelfest.png', OUT).pathname });
    // the title with everything open: the two variants and the coats (gold picked)
    await page.evaluate(() => {
      const g = window.game;
      g.setRules('normal', ['smgStart', 'barrelFest']);
      g.toTitle();
      g.showRules(true); // the picks fold away under the rules line
      document.getElementById('coat-row').scrollIntoView({ block: 'center' });
      g.render();
    });
    await page.screenshot({ path: new URL('ach-title.png', OUT).pathname });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('赤手空拳 and 鑊氣 in play: one shot spoils a wave, the next without one earns it (the record keeps each wave’s shots); a kick, a pan, an execution, a barrel or a parried bullet is a kill without a gun, a shot or a launcher grenade is not', { timeout: 300000 }, async () => {
  const { page, logs } = await h.open('?seed=14');
  try {
    await install(page);
    const r = await page.evaluate(() => {
      const g = window.game;
      const out = {};
      // a real run: in wave 1 the player fires once, then everyone is kicked down; in wave 2 nobody fires
      g.setRules('normal', []);
      g.startRun(1);
      const bare = [];
      let fired = false;
      let n = 0;
      while (g.waves.wave < 3 && n++ < 60 * 120) {
        const p = g.player;
        p.hp = 100;
        g.killcamT = 0;
        if (g.waves.wave === 1 && g.waves.state === 'active' && !fired && p.ammo > 0 && p.fireCd <= 0) {
          fired = true;
          g.input.mouse.left = true;
          g.updatePlay(1 / 60);
          g.input.mouse.left = false;
          out.shotsAfter = g.waves.shots;
          continue;
        }
        if (fired || g.waves.wave > 1) for (const e of g.enemies.list) if (e.alive && e.spawnLock <= 0) e.die(0, -1, { cause: 'kick' });
        g.updatePlay(1 / 60);
        if (g.waves.wave !== bare.length) bare.push(g.achievements.has('bareHands'));
      }
      out.bare = bare;
      out.recorded = g.telemetry.run.events.filter((e) => e.type === 'wave').map((e) => [e.n, e.shots]);
      out.text = g.telemetry.text();
      // what counts towards 鑊氣: each kind of kill once, the count before and after
      window.run(1);
      const gunless = () => g.achievements.counts.gunless || 0;
      const kinds = {
        shot: (e) => window.shoot(e.x, e.z + 2.4),
        launcher: (e) => g.grenades.spawn(e.x, e.z + 6, e.x, e.z, 14),
        kick: (e) => e.kick(0, -1, 12, 'kick', 99),
        pan: (e) => e.kick(0, -1, 12, 'smash', 99),
        execution: (e) => e.die(0, -1, { cause: 'execution' }),
        barrel: (e) => g.explode(e.x, e.z, 2.5, { kind: 'barrel' }),
        parried: (e) => window.shoot(e.x, e.z + 2.4, {}, { homeRun: true }),
      };
      out.counted = {};
      for (const [k, kill] of Object.entries(kinds)) {
        g.player.x = 0;
        g.player.z = 3;
        const e = window.grunt(0, -4);
        window.play(1);
        const before = gunless();
        kill(e);
        let m = 0;
        while (e.alive && m++ < 240) window.play(1);
        out.counted[k] = { dead: !e.alive, add: gunless() - before };
      }
      return out;
    });
    assert.equal(r.shotsAfter, 1, 'the one shot counted');
    assert.deepEqual(r.bare.slice(0, 3), [false, false, true], 'not after wave 1 (one shot); after wave 2 (none)');
    assert.deepEqual(r.recorded.slice(0, 2), [
      [1, 1],
      [2, 0],
    ]);
    assert.match(r.text, /1@\d+:\d\d✓?·1槍 2@\d+:\d\d✓?·0槍/, 'the export shows each wave’s shots');
    for (const [k, c] of Object.entries(r.counted)) assert.equal(c.dead, true, `${k}: he died`);
    assert.deepEqual(
      Object.fromEntries(Object.entries(r.counted).map(([k, c]) => [k, c.add])),
      { shot: 0, launcher: 0, kick: 1, pan: 1, execution: 1, barrel: 1, parried: 1 },
    );
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('watching a replay earns nothing', async () => {
  const { page, logs } = await h.open('?seed=13');
  try {
    await install(page);
    const r = await page.evaluate(() => {
      const g = window.game;
      window.run(1);
      window.play(150);
      const bytes = g.record.encode();
      g.toTitle();
      const err = g.playReplay(bytes, { name: 'test' });
      const watching = g.achievements.watching;
      // a scatter kill during the replay
      g.enemies.clear();
      window.grunt(g.player.x, g.player.z - 5);
      window.shoot(g.player.x, g.player.z - 0.6, {}, { scatter: true });
      window.play(20);
      const during = g.achievements.has('scatter');
      g.endReplay();
      g.toTitle();
      // and the same afterwards in a real run counts
      window.run(1);
      window.grunt(0, -2);
      window.shoot(0, 2.4, {}, { scatter: true });
      window.play(20);
      return { err, watching, during, after: g.achievements.has('scatter'), watchingAfter: g.achievements.watching };
    });
    assert.deepEqual(r, { err: null, watching: true, during: false, after: true, watchingAfter: false });
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
