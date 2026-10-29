// F③a, F③b: two doors (rooms.js exit2, drawBranches; main.js setExits, takeExit) and their prizes (prizes.js). Every fight room has a second exit in a
// tall wall; for each room of a floor but its first and its boss's the run draws a second room (its own stream, so the
// floors stay as drawn), and the room before it opens both doors when it is cleared, each with the room it leads to
// over it (hud.js updateExits). Walking into one goes to its room, and the floor holds that room from then on; a floor
// never has a room twice whichever way it is walked. The last fight room before the boss has one door. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=73'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** A 彈幕試驗 run (with `seed` the run's seed) at its start, the teahouse. */
    window.toStart = (seed = null) => {
      const keep = g.fixedSeed;
      if (seed !== null) g.fixedSeed = seed;
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.fixedSeed = keep;
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** 120 Hz steps, the player kept whole. */
    window.play = (n, { press = [] } = {}) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
        g.input.pressed.clear();
        if (i === 0) for (const k of press) g.input.pressed.add(k);
        g.updatePlay(1 / 120);
      }
      g.input.pressed.clear();
    };
    /** The room's waves down at once, its exits open. */
    window.clearRoom = () => {
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 120 * 10 && g.waves.state !== 'active'; i++) window.play(1);
        g.waves.queue.length = 0;
        g.waves.pending.length = 0;
        g.enemies.clear();
        g.bullets.clear();
        window.play(2);
      }
      return g.waves.state;
    };
    /** The player into exit `x` and on through the change of room; the room he is in after. */
    window.walkInto = (x) => {
      g.player.x = x.at.x;
      g.player.z = x.at.z;
      for (let i = 0; i < 120 * 3 && !(g.transition === null && g.stage > 0 && g.level.exits.every((e) => e.locked)); i++) window.play(1);
      return g.level.map.id;
    };
  });
});
after(async () => {
  await h.close();
});

test('every fight room has a second exit in a tall wall, apart from its first and from the men’s doors, walkable to from the start; a boss room has one; loaded on its own, a room shows only the first', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toStart(1);
    const out = [];
    for (const id of Object.keys(g.rooms)) {
      g.level.load(g.rooms[id]);
      const L = g.level;
      const t = L.map.room;
      const st = L.start;
      const [a, b] = L.exits;
      const o = { id, boss: !!t.boss, exits: L.exits.length };
      if (b) {
        const along = (x) => (t.exit2[0] === 'n' || t.exit2[0] === 's' ? x.x : x.z);
        o.low = t.low[1].includes(t.exit2[0]);
        o.apart = Math.hypot(a.x - b.x, a.z - b.z);
        o.spawnGap = Math.min(...L.spawns.filter((sp) => Math.hypot(sp.x - b.x, sp.z - b.z) < 3).map((sp) => Math.abs((t.exit2[0] === 'n' || t.exit2[0] === 's' ? sp.x : sp.z) - along(b))), 99);
        o.path = !!L.nav.findPath(st.x, st.z, b.at.x, b.at.z);
        o.spare = b.spare && !b.mesh.visible;
      }
      out.push(o);
    }
    return out;
  });
  for (const o of r) {
    if (o.boss) {
      assert.equal(o.exits, 1, `${o.id}: a boss room has one exit`);
      continue;
    }
    assert.equal(o.exits, 2, `${o.id}: two exits`);
    assert.equal(o.low, false, `${o.id}: the second in a tall wall`);
    assert.ok(o.apart >= 2.5, `${o.id}: the two ${o.apart.toFixed(1)} m apart`);
    assert.ok(o.spawnGap >= 2, `${o.id}: ${o.spawnGap.toFixed(1)} m from the nearest of the men’s doors`);
    assert.equal(o.path, true, `${o.id}: walkable to from the start`);
    assert.equal(o.spare, true, `${o.id}: loaded on its own, the second is hidden`);
  }
  assert.deepEqual(problems(logs), []);
});

test('a run draws a second room for every place on a floor but its first and its boss’s: the same seed the same, the floors as before; no room twice on a floor counting both; the notes write the tree', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const runs = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      window.toStart(seed);
      runs.push({ seed, floors: g.floors.map((f) => f.slice()), branches: g.branches.map((f) => f.slice()), tree: g.notes.events.map((e) => e.text).filter((t) => /^第 \d 層：/.test(t)) });
    }
    window.toStart(5);
    return { runs, again: { floors: g.floors, branches: g.branches }, boss: g.waves.rules.floor.boss };
  });
  for (const run of r.runs) {
    run.floors.forEach((ids, f) => {
      const alts = run.branches[f];
      assert.equal(alts.length, ids.length, `seed ${run.seed}, floor ${f + 1}: a place each`);
      assert.equal(alts[0], null, `seed ${run.seed}, floor ${f + 1}: none for its first room`);
      assert.equal(alts[alts.length - 1], null, `seed ${run.seed}, floor ${f + 1}: none for the boss’s`);
      assert.ok(alts.slice(1, -1).every((a) => a && !r.boss.includes(a)), `seed ${run.seed}, floor ${f + 1}: a fight room for each between (${alts})`);
      const all = [...ids, ...alts.filter(Boolean)];
      assert.equal(new Set(all).size, all.length, `seed ${run.seed}, floor ${f + 1}: no room twice (${ids} / ${alts})`);
    });
    assert.equal(run.tree.length, run.floors.length, 'a line a floor in the notes');
    assert.ok(run.tree.every((t) => t.includes('／')), `the choices in it: ${run.tree[0]}`);
  }
  assert.deepEqual(r.again.floors, r.runs[4].floors, 'the same seed, the same floors');
  assert.deepEqual(r.again.branches, r.runs[4].branches, 'and the same second rooms');
  assert.deepEqual(problems(logs), []);
});

test('the teahouse cleared opens both doors, each named over it (dim before, lit after); the second goes to its room and the floor holds it; the first to the room drawn; the last fight room before the boss has one door', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const tags = () => [...document.querySelectorAll('#indicators .exit-tag')].filter((t) => t.style.display === 'block').map((t) => ({ text: t.textContent, open: t.classList.contains('open') }));
    // the second door
    window.toStart(6);
    const drawn = g.floors[0][1];
    const alt = g.branches[0][1];
    const L = g.level;
    window.play(1);
    g.hud.update(1 / 60);
    const before = { tags: tags(), to: L.exits.map((x) => x.to), shown: L.exits.map((x) => x.mesh.visible) };
    const state = window.clearRoom();
    g.hud.update(1 / 60);
    const open = { state, locked: L.exits.map((x) => x.locked), tags: tags(), banner: g.hud.el.banner.textContent };
    const went = window.walkInto(L.exits[1]);
    const held = { floor1: g.floors[0][1], flat: g.floor[1], notes: g.notes.events.map((e) => e.text).filter((t) => t.startsWith('揀咗門')) };
    // the first door
    window.toStart(6);
    window.clearRoom();
    const first = window.walkInto(g.level.exits[0]);
    // the floor's last fight room
    window.toStart(6);
    g.stage = g.floors[0].length - 2;
    g.level.load(g.stageMap);
    g.setExits();
    const last = { exits: g.level.exits.filter((x) => !x.spare).length, to: g.level.exit.to, boss: g.floors[0][g.floors[0].length - 1] };
    return { drawn, alt, before, open, went, held, first, last, names: { drawn: g.rooms[drawn].name, alt: g.rooms[alt].name } };
  });
  assert.deepEqual(r.before.to, [r.drawn, r.alt], 'the first door to the room drawn, the second to the other');
  assert.deepEqual(r.before.shown, [true, true], 'both drawn');
  assert.equal(r.before.tags.length, 2, `a name over each: ${JSON.stringify(r.before.tags)}`);
  assert.ok(r.before.tags.every((t) => !t.open), 'dim while the room is fought');
  assert.ok(r.before.tags.some((t) => t.text.includes(r.names.drawn)) && r.before.tags.some((t) => t.text.includes(r.names.alt)), JSON.stringify(r.before.tags));
  assert.equal(r.open.state, 'exit');
  assert.deepEqual(r.open.locked, [false, false], 'both open');
  assert.ok(r.open.tags.every((t) => t.open && t.text.startsWith('→ ')), `lit: ${JSON.stringify(r.open.tags)}`);
  assert.ok(r.open.banner.includes(r.names.drawn) && r.open.banner.includes(r.names.alt), `the banner names both: ${r.open.banner}`);
  assert.equal(r.went, r.alt, 'the second door: its room');
  assert.deepEqual([r.held.floor1, r.held.flat], [r.alt, r.alt], 'the floor holds it');
  assert.ok(r.held.notes.some((t) => t.includes(r.names.alt)), r.held.notes.join(' / '));
  assert.equal(r.first, r.drawn, 'the first door: the room drawn');
  assert.deepEqual([r.last.exits, r.last.to], [1, r.last.boss], 'before the boss: one door, to the boss room');
  assert.deepEqual(problems(logs), []);
});

test('screenshot: the plaza cleared, its two doors open side by side, each named', async () => {
  await page.evaluate(() => {
    const g = window.game;
    window.toStart(6);
    g.waves.state = 'done';
    g.enemies.clear();
    g.floors[0][1] = 'plaza';
    g.floor = g.floors.flat();
    g.stage = 1;
    g.level.load(g.stageMap);
    g.setExits();
    g.applyMapView();
    const L = g.level;
    g.waves.state = 'exit';
    for (const x of L.exits) x.unlock();
    g.challenge.offer = null; // the teahouse's sign, from the run's start
    g.player.x = (L.exits[0].x + L.exits[1].x) / 2;
    g.player.z = L.exits[0].z + 3.5;
    g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
    g.aimFresh = true;
    window.play(120); // the leaves swing open; the player stands
    g.view = 0;
    g.hud.el.banner.className = '';
    g.updateCamera(1, true);
    g.camera.updateMatrixWorld();
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('doors.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

// F③b: the doors' prizes (src/prizes.js). Where there is a choice, each door carries a prize from the room's stream,
// the two different; the one walked through comes with the next room as it begins.

test('the prizes: two different on a room’s two doors, from its stream (the same seed the same), named on the signs; none on a lone door', async () => {
  const r = await page.evaluate(async () => {
    const { PRIZE_IDS, PRIZES } = await import('./src/prizes.js');
    const g = window.game;
    const runs = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      window.toStart(seed);
      runs.push({ seed, prizes: g.level.exits.map((x) => x.prize) });
    }
    window.toStart(4);
    const again = g.level.exits.map((x) => x.prize);
    window.play(1);
    g.hud.update(1 / 60);
    // each sign's second line, under the room's name (hud.js updateExits), and the name of its door's prize
    const tags = [...document.querySelectorAll('#indicators .exit-tag')].filter((t) => t.style.display === 'block').map((t) => t.querySelector('b')?.textContent);
    const named = g.level.exits.filter((x) => x.prize).map((x) => `${PRIZES[x.prize].name} ${PRIZES[x.prize].en}`);
    // the floor's last fight room: one door, no prize
    g.stage = g.floors[0].length - 2;
    g.level.load(g.stageMap);
    g.setExits();
    const lone = g.level.exits.map((x) => x.prize);
    return { runs, again, tags, named, lone, ids: PRIZE_IDS };
  });
  for (const run of r.runs) {
    assert.equal(run.prizes.length, 2, `seed ${run.seed}`);
    assert.ok(run.prizes.every((p) => r.ids.includes(p)), `seed ${run.seed}: ${run.prizes}`);
    assert.notEqual(run.prizes[0], run.prizes[1], `seed ${run.seed}: two different`);
  }
  assert.deepEqual(r.again, r.runs[3].prizes, 'the same seed, the same prizes');
  assert.deepEqual([...new Set(r.runs.flatMap((x) => x.prizes))].sort(), [...r.ids].sort(), 'every prize over the seeds');
  assert.deepEqual(r.tags.sort(), r.named.sort(), 'each sign names its door’s prize, on a line under the room’s');
  assert.ok(r.lone.every((p) => p === null), `a lone door has none: ${r.lone}`);
  assert.deepEqual(problems(logs), []);
});

test('each prize comes with the next room: a full gun before its entry; three cards before its first wave, which waits for the pick; an elite room with an affix more and its clears scoring twice; a heal of DOORS.heal, at full HP a life, at CHALLENGE.maxLives none', async () => {
  const r = await page.evaluate(async () => {
    const { CHALLENGE, DOORS, PLAYER } = await import('./src/config.js');
    const { PLAYER_WEAPONS } = await import('./src/weapons.js');
    const g = window.game;
    /** The teahouse cleared, its second door's prize made `prize`, `before(p)` done to the player, and through it; steps that leave him as he is. */
    const through = (prize, before = () => {}) => {
      window.toStart(6);
      window.clearRoom();
      const x = g.level.exits[1];
      x.prize = prize;
      const p = g.player;
      before(p);
      p.x = x.at.x;
      p.z = x.at.z;
      for (let i = 0; i < 120 * 3 && (g.stage === 0 || g.transition); i++) {
        g.killcamT = 0;
        g.updatePlay(1 / 120);
      }
      return g.level;
    };
    const out = {};
    // a gun
    const L1 = through('gun');
    const guns = g.pickups.list.filter((q) => !q.pad).map((q) => ({ kind: q.kind, full: q.ammo === PLAYER_WEAPONS[q.kind].ammo, from: Math.hypot(q.x - L1.start.x, q.z - L1.start.z) }));
    out.gun = { guns, weapons: DOORS.weapons, gunIn: DOORS.gunIn };
    // a card
    through('card');
    const offer = g.cards.offer && g.cards.offer.slice();
    const wave0 = g.waves.wave;
    window.play(120 * 8);
    const waited = { wave: g.waves.wave, state: g.waves.state };
    window.play(1, { press: ['Digit2'] });
    let started = -1;
    for (let i = 0; i < 120 * 6 && started < 0; i++) {
      window.play(1);
      if (g.waves.wave > wave0) started = i / 120;
    }
    out.card = { offer, wave0, waited, held: g.cards.held.slice(), started, title: document.getElementById('cards').dataset.title };
    // an elite room (on the first floor, which has no affixes of itself)
    through('elite');
    const bonuses = [];
    const bonus0 = g.score.bonus.bind(g.score);
    g.score.bonus = (label, pts) => {
      bonuses.push(`${label}:${pts}`);
      return bonus0(label, pts);
    };
    for (let i = 0; i < 120 * 10 && g.waves.state !== 'active'; i++) window.play(1);
    const affixes = g.waves.roomAffixes.length;
    g.waves.queue.length = 0;
    g.waves.pending.length = 0;
    g.enemies.clear();
    window.play(2);
    g.score.bonus = bonus0;
    out.elite = { stage: g.stage, eliteStage: g.eliteStage, affixes, bonuses };
    // a heal: hurt, at full HP, at full HP with two lives
    through('heal', (p) => {
      p.hp = 40; // just hit: no regeneration yet (PLAYER.regenDelay)
      p.sinceHurt = 0;
    });
    out.healHurt = { hp: g.player.hp, lives: g.challenge.lives };
    through('heal');
    out.healFull = { hp: g.player.hp, lives: g.challenge.lives };
    through('heal', () => (g.challenge.lives = CHALLENGE.maxLives));
    out.healMax = { lives: g.challenge.lives };
    return { out, heal: DOORS.heal, max: CHALLENGE.maxLives, hp: PLAYER.hp };
  });
  const { gun, card, elite, healHurt, healFull, healMax } = r.out;
  assert.equal(gun.guns.length, 1, `a gun on the floor: ${JSON.stringify(gun.guns)}`);
  assert.ok(gun.weapons.includes(gun.guns[0].kind) && gun.guns[0].full, `a full special weapon: ${JSON.stringify(gun.guns)}`);
  assert.ok(Math.abs(gun.guns[0].from - gun.gunIn) < 0.01, `${gun.guns[0].from.toFixed(2)} m in from the start`);
  assert.equal(card.offer.length, 3, `three cards: ${card.offer}`);
  assert.match(card.title, /門的獎勵/);
  assert.deepEqual(card.waited, { wave: card.wave0, state: 'intermission' }, 'eight seconds on, no wave: it waits for the pick');
  assert.deepEqual(card.held, [card.offer[1]], '2 keeps the second');
  assert.ok(card.started >= 0, `then the wave comes (${card.started} s)`);
  assert.equal(elite.eliteStage, elite.stage, 'the room is elite');
  assert.equal(elite.affixes, 1, 'an affix on the first floor, which has none of itself');
  const clear = elite.bonuses.find((b) => b.startsWith('WAVE CLEAR'));
  assert.ok(clear && elite.bonuses.includes(`ELITE ×2:${clear.split(':')[1]}`), `the clear scores twice: ${elite.bonuses}`);
  assert.deepEqual(healHurt, { hp: 40 + r.hp * r.heal, lives: 0 }, 'hurt: HP up by DOORS.heal of a full meter');
  assert.deepEqual(healFull, { hp: r.hp, lives: 1 }, 'at full HP: a life instead');
  assert.deepEqual(healMax, { lives: r.max }, `at ${r.max} lives: none more`);
  assert.deepEqual(problems(logs), []);
});
