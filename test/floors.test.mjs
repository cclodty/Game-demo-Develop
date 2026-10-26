// 彈幕 ② C①: a run is three floors of rooms (rooms.js drawFloors, main.js floors). Each floor is a stage of the run:
// the men come in thicker and quicker a floor at a time (config.js ENEMY_HP, RAMP), a floor has its own song, the
// floor's number opens it on the HUD. A floor's last room ends on a bigger wave (MODES.danmaku `floorEnd`) in place
// of the floor boss until D. The grade counts rooms cleared without a hit, of the run's rooms. The music's layers
// count the waves within the floor.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
let page;
let logs;
before(async () => {
  h = await gameHarness();
  ({ page, logs } = await h.open('?seed=73'));
  await page.evaluate(() => {
    const g = window.game;
    g.frame = () => {};
    window.toFloor = () => {
      g.setRules('normal', []);
      g.setMode('danmaku');
      g.startRun(0);
      g.enemies.clear();
      g.bullets.clear();
      g.input.keys.clear();
      g.input.pressed.clear();
      g.input.mouse.left = g.input.mouse.right = false;
    };
    window.step = (n = 1) => {
      for (let i = 0; i < n; i++) {
        g.killcamT = 0;
        g.hitstopT = 0;
        g.player.hp = 100;
        g.player.invuln = 0;
        g.updatePlay(1 / 120);
      }
    };
    /** Every man of the wave down, none to come, then a step for the wave to end. */
    window.clearWave = () => {
      g.waves.queue = [];
      g.waves.pending = [];
      g.enemies.clear();
      window.step();
    };
    /** Through a cleared room's exit (and the fade) into the next room, its first wave about to begin. */
    window.nextRoom = () => {
      const p = g.player;
      p.x = g.level.exit.at.x;
      p.z = g.level.exit.at.z;
      window.step(10);
      for (let i = 0; i < 300 && g.transition; i++) g.updateTransition(1 / 60);
      g.updatePlay(1 / 120);
    };
    /** The intermission over: the next wave begins. */
    window.nextWave = () => {
      g.waves.timer = 0;
      window.step();
    };
  });
});
after(async () => {
  await h.close();
});

test('the floors are the run’s stages: a thug of the second floor has 1.25× the health and aims 0.9× as long as one of the first; the third 1.5× and 0.81×; the first floor’s last wave of its last room is bigger, with a brute; the run’s last wave bigger still', async () => {
  const r = await page.evaluate(() => {
    const g = window.game;
    window.toFloor();
    const F = g.floors;
    const per = g.waves.rules.perStage;
    const total = g.waves.totalWaves;
    // the floor of each wave, by the wave director
    const floorOf = [];
    for (let n = 1; n <= total; n++) {
      g.waves.wave = n;
      floorOf.push(g.waves.stageIndex);
    }
    // a thug's health and pace on each floor
    const stats = [];
    for (const f of [0, 1, 2]) {
      g.waves.wave = F.slice(0, f).flat().length * per + 1;
      const e = g.enemies.spawn('grunt', { x: 0, z: 0, ex: 0, ez: 0.1, stay: true });
      stats.push({ hp: e.hp, pace: e.pace });
      g.enemies.clear();
    }
    g.waves.wave = 0;
    // the floor-end wave of the first floor, a wave before it, and the run's last
    const endOfFirst = F[0].length * per;
    const sizes = { before: g.waves.compose(endOfFirst - 1).length, floorEnd: g.waves.compose(endOfFirst).length, brutes: g.waves.compose(endOfFirst).filter((t) => t === 'brute').length, brutesBefore: g.waves.compose(endOfFirst - 1).filter((t) => t === 'brute').length, last: g.waves.compose(total).length, isEnd: g.waves.isFloorEnd(endOfFirst), notEnd: g.waves.isFloorEnd(endOfFirst - 1), lastIsEnd: g.waves.isFloorEnd(total) };
    return { floors: F.map((x) => x.length), floorOf, stats, sizes, total };
  });
  const [a, b, c] = r.floors;
  assert.deepEqual(r.floorOf, [...Array(a * 2).fill(0), ...Array(b * 2).fill(1), ...Array(c * 2).fill(2)], 'each wave on its floor');
  assert.equal(r.stats[1].hp / r.stats[0].hp, 1.25, `second floor: ${r.stats.map((s) => s.hp)}`);
  assert.equal(r.stats[2].hp / r.stats[0].hp, 1.5);
  assert.ok(Math.abs(r.stats[1].pace - 0.9) < 1e-9 && Math.abs(r.stats[2].pace - 0.81) < 1e-9, `the pace: ${r.stats.map((s) => s.pace)}`);
  assert.ok(r.sizes.isEnd && !r.sizes.notEnd && !r.sizes.lastIsEnd, 'the floor-end wave is the last of the floor’s last room, not the run’s last');
  assert.ok(r.sizes.floorEnd > r.sizes.before, `the floor’s last wave is bigger (${r.sizes.before} → ${r.sizes.floorEnd})`);
  assert.ok(r.sizes.brutes > r.sizes.brutesBefore, `with a brute more (${r.sizes.brutesBefore} → ${r.sizes.brutes})`);
  assert.ok(r.sizes.last >= r.sizes.floorEnd, `the run’s last wave: ${r.sizes.last}`);
});

test('the HUD opens each floor with its number and names the room’s place on it; the floor’s song changes; a room cleared unhurt is a clean room and the grade counts rooms', { timeout: 5 * 60 * 1000 }, async () => {
  const r = await page.evaluate(async () => {
    const g = window.game;
    const { rate } = await import('./src/score.js');
    window.toFloor();
    const banners = [];
    const banner0 = g.hud.banner.bind(g.hud);
    g.hud.banner = (t, s, k) => {
      banners.push([t, s, k]);
      return banner0(t, s, k);
    };
    const songs = [g.audio.song.name];
    const F = g.floors;
    const per = g.waves.rules.perStage;
    // through the first floor: its rooms cleared, the first hurt once
    let roomsDone = 0;
    for (let room = 0; room < F[0].length + 1; room++) {
      for (let w = 0; w < per; w++) {
        window.nextWave();
        if (room === 0 && w === 0) g.waves.hurt = true;
        window.clearWave();
      }
      roomsDone++;
      if (room < F[0].length) {
        window.nextRoom();
        if (g.audio.song.name !== songs[songs.length - 1]) songs.push(g.audio.song.name);
      }
    }
    const clean = g.waves.cleanRooms;
    const grade = rate({ score: 0, cleanWaves: g.waves.cleanRooms, waves: g.floor.length, seconds: 100, cleared: false });
    return { banners: banners.filter((b) => b[2] === 'stage').map((b) => b[0]), subs: banners.filter((b) => b[2] === 'stage').map((b) => b[1]), songs, clean, roomsDone, firstFloor: F[0].length, grade: grade.parts.clean, rooms: g.floor.length, notes: g.notes.events.map((x) => x.text).filter((t) => t.includes('層開始')) };
  });
  const n = r.firstFloor;
  const expect = [...Array.from({ length: n - 1 }, (_, i) => `ROOM ${i + 2} / ${n}`), 'FLOOR 2'];
  assert.deepEqual(r.banners, expect, `the rooms of the first floor, then the second floor opens: ${r.banners}`);
  assert.match(r.subs[r.subs.length - 1], /第 2 層/);
  assert.ok(r.songs.length >= 2, `a song a floor: ${r.songs.join(' / ')}`);
  assert.equal(r.clean, n - 1, `${n} rooms cleared, the first with a hit: ${r.clean} clean`);
  assert.deepEqual(r.notes, ['第 2 層開始']);
  assert.ok(Math.abs(r.grade - 30 * ((n - 1) / r.rooms)) < 1e-9, `the grade's clean part counts rooms of ${r.rooms}: ${r.grade}`);
  assert.deepEqual(problems(logs), []);
});
