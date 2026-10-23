// 大三巴's boss (大三巴：頭目 ①, DECISIONS 2026-10-22: every boss is a person): the
// gang's shield man, 大三巴鐵盾 BULWARK. He walks out through the façade's middle
// doorway onto the terrace and after the player, slowly, turning slowly, a big
// shield before him: a shot from within its arc glances off; one on his back
// counts. The ways in: through a doorway and round behind the façade, out by
// another, and his back is the player's; or a barrel rolled down the steps at
// him as he comes down after the player (ROLLING: a segment, his shield down).
// Up close he braces, his shield lit, and bashes; after it his shield is down a
// moment. He is never out of reach for long. Five segments.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, installBot, OUT, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=37'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    /** An arcade run from 福隆新街, moved on to its third stage (大三巴) and the start of wave `wave`; the player on the terrace. */
    window.toWave = (wave = 12, x = -6, z = -9) => {
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(4);
      g.waves.state = 'done';
      g.enemies.clear();
      g.stage = 2;
      g.level.load(g.stageMap);
      g.applyMapView();
      g.player.placeAtStart();
      g.player.x = x;
      g.player.z = z;
      g.waves.wave = wave - 1;
      g.waves.startWave();
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    /** One logic step; the player still, unhurt unless `hurt`, nobody else about. */
    window.step = (hurt = false) => {
      g.killcamT = 0;
      g.hitstopT = 0;
      if (!hurt) g.player.hp = 100;
      g.player.invuln = 0;
      g.player.vx = g.player.vz = 0;
      g.aimPoint.set(g.player.x, g.aimPoint.y, g.player.z - 5);
      g.aimFresh = true;
      g.updatePlay(1 / 120);
      g.enemies.clear();
      g.waves.pending.length = 0;
    };
    window.until = (cond, max = 3600, hurt = false) => {
      let n = 0;
      while (!cond() && n++ < max) window.step(hurt);
      return n;
    };
    /** `n` player shots at him from (x, z), each flown home before the next; the hits he took and those turned aside. */
    window.fire = (n, x, z) => {
      const b = g.boss;
      const hp = b.hp;
      const hits = b.hits;
      let blocked = 0;
      for (let i = 0; i < n; i++) {
        const dx = b.x - x;
        const dz = b.z - z;
        const d = Math.hypot(dx, dz);
        const s0 = b.blocked;
        g.bullets.spawn({ x: x + (dx / d) * 0.5, z: z + (dz / d) * 0.5, dx: dx / d, dz: dz / d, speed: 80, owner: 'player', damage: 1 });
        for (let k = 0; k < 12; k++) {
          b.bashT = 99; // no bash while the shots fly
          b.gunT = 99;
          window.step();
        }
        blocked += b.blocked - s0;
      }
      return { segments: hp - b.hp, hits: b.hits - hits + (hp - b.hp) * b.cfg.perSegment, blocked };
    };
  });
});
after(async () => {
  await h.close();
});

test('wave 12 in 大三巴 is the shield man: out through the façade’s middle doorway to the terrace within 3 s, where he and his post are on the terrace’s level; the route names him; inside the render budget', async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const b = g.boss;
    const { RETIRED } = await import('./src/boss.js');
    window.toWave(12);
    const from = { x: b.x, z: b.z, state: b.state };
    const enter = window.until(() => b.state !== 'enter');
    g.updateCamera(1, true);
    g.hud.update(1 / 60);
    g.render();
    const bar = document.getElementById('boss-bar');
    const L = g.level;
    const info = g.renderer.info.render;
    return {
      map: L.map.id,
      kind: b.def.kind,
      retired: RETIRED[b.def.kind] || null,
      bar: !bar.classList.contains('hidden') && bar.querySelector('.boss-name').textContent,
      route: g.routeText(4, 'arcade'),
      from,
      at: [b.x, b.z],
      enter: enter / 120,
      zones: [L.zoneAt(...b.def.from), L.zoneAt(...b.def.at)].map((zn) => zn && zn.id),
      behind: b.def.from[1] < -20.65,
      calls: info.calls,
      budget: g.level.map.budget,
    };
  });
  await page.screenshot({ path: new URL('boss-bulwark.png', OUT).pathname });
  assert.deepEqual([r.map, r.kind, r.retired, r.bar], ['ruins', 'bulwark', null, '大三巴鐵盾 BULWARK']);
  assert.ok(r.route.endsWith('、鐵盾）'), r.route);
  assert.equal(r.from.state, 'enter');
  assert.equal(r.behind, true, 'he comes from behind the façade');
  assert.ok(r.enter <= 3, `out on the terrace within 3 s (${r.enter})`);
  assert.deepEqual(r.zones, ['terrace', 'terrace'], 'where he comes from and his post: the terrace’s level');
  assert.ok(r.calls <= r.budget.calls, `${r.calls} draw calls, budget ${r.budget.calls}`);
  assert.deepEqual(problems(logs), []);
});

test('the shield: shots from the front glance off; shots on his back count, BULWARK.perSegment to a segment; he turns slowly', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toWave(12);
    window.until(() => b.state !== 'enter');
    b.x = 0.3;
    b.z = -12;
    b.facing = 0; // south, towards the steps
    b.state = 'stand';
    const front = window.fire(6, 0.3, -6);
    b.facing = 0;
    const back = window.fire(b.cfg.perSegment, 0.3, -18);
    // how fast he turns: the player put behind him, half a turn takes him
    b.facing = 0;
    b.state = 'chase';
    g.player.x = 0.3;
    g.player.z = -18;
    const f0 = b.facing;
    const n = window.until(() => Math.abs(((b.facing - Math.PI - f0 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) < 0.1, 1200);
    return { front, back, turn: n / 120, notes: g.notes.events.slice(-12).map((e) => e.text) };
  });
  assert.equal(r.front.segments, 0, 'from the front: no segment');
  assert.equal(r.front.blocked, 6, 'every shot turned aside by the shield');
  assert.equal(r.back.segments, 1, 'on his back: a segment');
  assert.ok(r.turn > 1.5, `half a turn takes him ${r.turn.toFixed(2)} s`);
  assert.ok(r.notes.some((t) => t.includes('鐵盾')), r.notes.join(' / '));
});

test('through a doorway and round: in by the west doorway, he loses the player; out by the middle one beside him and on round, at his back; the shots there count', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const L = g.level;
    window.toWave(12, 0.3, -8);
    window.until(() => b.state !== 'enter');
    b.x = 0.3;
    b.z = -13;
    b.state = 'chase';
    for (let i = 0; i < 240; i++) {
      b.bashT = 99;
      b.gunT = 99;
      window.step();
    }
    const facingPlayer = Math.abs(wrap(Math.atan2(p.x - b.x, p.z - b.z) - b.facing)) < 0.5;
    // the way round, on foot at the player's speed: past the low wall before the west doorway and in, along behind the
    // façade, out by the middle doorway (beside him, on his way to where he saw the player last) and on round him
    const path = L.nav.findPath(-4.3, -12, -4, -14);
    const way = [[-4.3, -12], [-4.3, -19.8], [-5.9, -20.5], [-5.9, -24], [0.3, -24], [0.3, -19.6], [-4, -14]];
    const via = [];
    let lost = false;
    let at = [p.x, p.z];
    for (const [x, z] of way) {
      const n = Math.ceil((Math.hypot(x - at[0], z - at[1]) / 7.4) * 120);
      for (let k = 1; k <= n; k++) {
        p.x = at[0] + ((x - at[0]) * k) / n;
        p.z = at[1] + ((z - at[1]) * k) / n;
        b.bashT = 99;
        b.gunT = 99;
        window.step();
        lost = lost || b.unseen > b.cfg.lost.after;
      }
      at = [x, z];
      via.push(L.nav.isWalkable(x, z));
    }
    const off = Math.abs(wrap(Math.atan2(p.x - b.x, p.z - b.z) - b.facing)) * (180 / Math.PI);
    const shots = window.fire(b.cfg.perSegment, p.x, p.z);
    return { facingPlayer, path: !!path, via, lost, off, shots, notes: g.notes.events.slice(-10).map((e) => e.text) };
    function wrap(a) {
      return ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
    }
  });
  assert.equal(r.facingPlayer, true, 'with the player in front, his shield is on him');
  assert.equal(r.path, true, 'a way round behind the façade');
  assert.ok(r.via.every(Boolean), 'through the doorways on foot');
  assert.equal(r.lost, true, 'behind the façade he loses the player');
  assert.ok(r.notes.some((t) => t.includes('跟丟')), r.notes.join(' / '));
  assert.ok(r.off > 70, `out on the terrace the player is at his side or back (${r.off.toFixed(0)}° off his facing)`);
  assert.equal(r.shots.blocked, 0, 'nothing glances off');
  assert.equal(r.shots.segments, 1, 'and his back takes a segment');
});

test('a barrel rolled down the steps at him as he comes down after the player bowls him over: a segment, ROLLING, his shield down', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const L = g.level;
    window.toWave(12, -2, 44);
    window.until(() => b.state !== 'enter');
    // he is coming down the middle flight after the player on the forecourt; a barrel above him on the top flight falls
    // over (on the line of the one at the top of the steps, x -2, clear of the urns on the landings)
    b.x = -2;
    b.z = 15;
    b.state = 'chase';
    const barrel = L.barrels.find((x) => x.alive && x.variant === 'barrel');
    barrel.x = -2;
    barrel.z = 2;
    barrel.update(0);
    barrel.tip();
    const hp = b.hp;
    const styles = [];
    const style0 = g.score.style.bind(g.score);
    g.score.style = (label, pts, ...a) => {
      styles.push(label);
      return style0(label, pts, ...a);
    };
    let down = false;
    window.until(() => {
      b.bashT = 99;
      b.gunT = 99;
      down = down || b.state === 'stagger';
      return hp - b.hp > 0;
    }, 120 * 8);
    g.score.style = style0;
    return { lost: hp - b.hp, down: down || b.state === 'stagger', styles, notes: g.notes.events.slice(-8).map((e) => e.text) };
  });
  assert.equal(r.lost, 1, 'a segment');
  assert.ok(r.down, 'bowled over: he reels, his shield down');
  assert.ok(r.styles.includes('ROLLING'), `ROLLING (${r.styles})`);
  assert.ok(r.notes.some((t) => t.includes('油桶')), r.notes.join(' / '));
});

test('up close he braces, his shield lit, then bashes: a player who stays is knocked back and hurt; after it his shield is down a moment and a shot from the front counts', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    const p = g.player;
    const run = (dodge) => {
      window.toWave(12, 0.3, -8);
      window.until(() => b.state !== 'enter');
      b.x = 0.3;
      b.z = -14;
      b.facing = 0;
      b.state = 'chase';
      b.bashT = 0;
      b.gunT = 99;
      let tell = 0;
      const hp = p.hp;
      window.until(() => {
        b.gunT = 99;
        if (b.state === 'brace') tell++;
        if (dodge && b.state === 'brace' && b.timer < 0.2) {
          p.x += 3; // out of his way, to the side
          dodge = false;
        }
        return b.state === 'spent';
      }, 600, true);
      const lost = hp - p.hp;
      const open = b.state === 'spent';
      const shot = open ? window.fire(1, p.x, p.z) : null;
      return { tell: tell / 120, lost, open, shot };
    };
    return { stay: run(false), dodge: run(true) };
  });
  assert.ok(Math.abs(r.stay.tell - 0.7) < 0.02, `the brace: ${r.stay.tell} s`);
  assert.ok(r.stay.lost >= 25, `a player who stays: ${r.stay.lost} HP`);
  assert.equal(r.dodge.lost, 0, 'one who steps aside: nothing');
  assert.equal(r.stay.open, true, 'after it, his shield down');
  assert.equal(r.stay.shot.blocked, 0, 'a shot from the front goes in');
});

test('screenshot: his shield lit before the bash on the terrace', async () => {
  await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    g.view = 2;
    window.toWave(12, 0.3, -8);
    window.until(() => b.state !== 'enter');
    b.x = 0.3;
    b.z = -13.5;
    b.facing = 0;
    b.state = 'chase';
    b.bashT = 0;
    window.until(() => b.state === 'brace' && b.timer < 0.25, 600);
    g.updateCamera(1, true);
    b.sync();
    g.hud.update(1 / 60);
    g.render();
  });
  await page.screenshot({ path: new URL('boss-bulwark-brace.png', OUT).pathname });
  assert.deepEqual(problems(logs), []);
});

test('no waiting: never more than 3 s at a time out of reach, the first chance within 3 s', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toWave(12);
    const me = g.bosses.current; // the boss himself: game.boss is a view of him (a stub set through it would stay on him)
    me.hurt = () => {};
    let longest = 0;
    let run = 0;
    let first = null;
    for (let i = 0; i < 45 * 120; i++) {
      window.step();
      if (b.vulnerable()) {
        if (first === null) first = i / 120;
        run = 0;
      } else longest = Math.max(longest, (run += 1 / 120));
    }
    delete me.hurt;
    return { longest, first };
  });
  assert.ok(r.first !== null && r.first <= 3, `the first chance at ${r.first} s`);
  assert.ok(r.longest <= 3, `never out of reach for more than 3 s (${r.longest.toFixed(2)})`);
});

test('five segments on his back: he goes down, BOSS +2,000', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    const b = g.boss;
    window.toWave(12);
    window.until(() => b.state !== 'enter');
    const score0 = g.score.score;
    for (let s = 0; s < 5 && b.active; s++) {
      b.state = 'stand';
      b.facing = 0;
      b.x = 0.3;
      b.z = -12;
      window.fire(b.cfg.perSegment, 0.3, -18);
    }
    for (let i = 0; i < 120; i++) window.step();
    return { downed: b.downed, gained: g.score.score - score0, notes: g.notes.events.slice(-6).map((e) => e.text) };
  });
  assert.equal(r.downed, true);
  assert.ok(r.gained >= 2000, `BOSS bonus (${r.gained})`);
  assert.ok(r.notes.some((t) => t.includes('鐵盾倒下')), r.notes.join(' / '));
});

test('the bot beats him on 大三巴, in god mode, within four minutes of the fight', { timeout: 10 * 60 * 1000 }, async () => {
  await installBot(page, { map: 4, view: 2, seed: 9, mode: 'arcade', restart: false });
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toWave(12, -4, 50);
    g.player.hurt = () => false;
    let frames = 0;
    while (!g.boss.downed && frames < 60 * 240) {
      window.simStep(60);
      frames += 60;
    }
    delete g.player.hurt;
    return { downed: g.boss.downed, s: frames / 60, hp: g.boss.hp };
  });
  assert.equal(r.downed, true, `down (${r.s} s, ${r.hp} left)`);
  assert.deepEqual(problems(logs), []);
});
