// Music (音樂): songs are data in src/music.js, played by AudioSys's synth.
// Each song renders offline (OfflineAudioContext, the game's own mix) without
// errors or clipping; in the new songs no part is buried under the kick (the
// old tune's trouble: everything 15–25 dB under it); ?music=<id> picks a song.
// Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { gameHarness, problems } from './helpers.mjs';

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

test('every song renders: sound, no clipping, and its boss section too; in the new songs bass, snare or clap, keys and lead sit within 12 dB of the kick', { timeout: 240000 }, async () => {
  const { page, logs } = await h.open();
  try {
    const r = await page.evaluate(async () => {
      const { AudioSys } = await import('/src/audio.js');
      const { SONGS } = await import('/src/music.js');
      const render = async (song, seconds, level = 1) => {
        const a = new AudioSys();
        a.song = song;
        const ctx = new window.OfflineAudioContext(1, 44100 * seconds, 44100);
        a.build(ctx);
        a.scheduleSong(seconds, level);
        const d = (await ctx.startRendering()).getChannelData(0);
        let sum = 0;
        let peak = 0;
        let finite = true;
        for (const v of d) {
          if (!Number.isFinite(v)) finite = false;
          sum += v * v;
          peak = Math.max(peak, Math.abs(v));
        }
        return { db: 10 * Math.log10(sum / d.length + 1e-12), peak, finite };
      };
      const out = {};
      for (const [id, song] of Object.entries(SONGS)) {
        const all = await render(song, 6);
        const parts = {};
        if (id !== 'classic') {
          const only = (key, drum) => ({ ...song, drums: drum ? { [drum]: song.drums[drum] } : null, bass: null, keys: null, arp: null, pad: null, choir: null, shepard: null, lead: null, ...(key ? { [key]: { ...song[key], from: 0 } } : {}) });
          parts.kick = (await render(only(null, 'kick'), 6)).db;
          for (const drum of ['snare', 'clap']) if (song.drums[drum]) parts[drum] = (await render(only(null, drum), 6)).db;
          for (const key of ['bass', 'keys', 'lead']) if (song[key]) parts[key] = (await render(only(key), 6)).db;
        }
        out[id] = { all, parts, name: song.name, bpm: song.bpm, boss: song.boss ? await render(song, 6, 2) : null };
      }
      return out;
    });
    assert.deepEqual(Object.keys(r).sort(), ['abyss', 'breaks', 'city', 'classic', 'countdown', 'dream', 'neon', 'undertow', 'vendetta']);
    for (const [id, { all, parts, name, boss }] of Object.entries(r)) {
      if (boss) assert.ok(boss.finite && boss.peak < 1 && boss.db > all.db - 3, `${name}: its boss section plays, unclipped, as loud or louder (${boss.db.toFixed(1)} vs ${all.db.toFixed(1)} dBFS, peak ${boss.peak.toFixed(2)})`);
      assert.ok(all.finite, `${name}: no broken samples`);
      assert.ok(all.peak < 1, `${name}: no clipping (peak ${all.peak.toFixed(2)})`);
      assert.ok(all.db > -40, `${name}: plays (${all.db.toFixed(1)} dBFS)`);
      for (const [part, db] of Object.entries(parts)) {
        if (part === 'kick') continue;
        assert.ok(db > parts.kick - 12, `${id}: the ${part} sits ${(parts.kick - db).toFixed(1)} dB under the kick`);
      }
    }
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('the songs the game plays: config.js MUSIC.playlist, one a stage, or ?music=<id> for one visit (an unknown id falls back)', async () => {
  const pick = async (query) => {
    const { page, logs } = await h.open(query);
    try {
      const r = await page.evaluate(async () => {
        const { SONGS } = await import('/src/music.js');
        const { MUSIC } = await import('/src/config.js');
        const a = window.game.audio;
        const id = (song) => Object.keys(SONGS).find((k) => SONGS[k] === song);
        return { id: id(a.song), stages: [0, 1, 2, 3].map((i) => id(a.songFor(i))), playlist: MUSIC.playlist };
      });
      assert.deepEqual(problems(logs), []);
      return r;
    } finally {
      await page.close();
    }
  };
  const plain = await pick('');
  assert.deepEqual(plain.playlist, ['undertow', 'countdown', 'abyss']);
  assert.equal(plain.id, 'undertow');
  assert.deepEqual(plain.stages, ['undertow', 'countdown', 'abyss', 'undertow'], 'one a stage, round again');
  const neon = await pick('?music=neon');
  assert.deepEqual([neon.id, neon.stages], ['neon', ['neon', 'neon', 'neon', 'neon']], '?music= plays just that one');
  assert.equal((await pick('?music=city')).id, 'city');
  for (const id of ['dream', 'vendetta', 'countdown', 'abyss']) assert.equal((await pick(`?music=${id}`)).id, id);
  assert.equal((await pick('?music=nonsense')).id, 'undertow');
});

test('in a run: a stage’s song comes in at the stage change; a stage’s first waves play the base, later ones more, the last the boss section', async () => {
  const { page, logs } = await h.open('?seed=4');
  try {
    const r = await page.evaluate(async () => {
      const { SONGS, playStep } = await import('/src/music.js');
      const g = window.game;
      g.frame = () => {};
      const id = (song) => Object.keys(SONGS).find((k) => SONGS[k] === song);
      g.setRules('normal', []);
      g.setMode('arcade');
      g.startRun(0);
      const out = { start: id(g.audio.song), levels: {}, stages: [] };
      for (const wave of [1, 2, 3, 4]) {
        g.enemies.clear();
        g.waves.wave = wave - 1;
        g.waves.startWave();
        out.levels[wave] = g.audio.musicLevel;
      }
      // the stage changes: the next song waits for the bar line
      for (let i = 0; i < 2; i++) {
        g.beginStageTransition();
        g.updateTransition(0.7);
        out.stages.push({ stage: g.stage, upcoming: id(g.audio.upcoming), playing: id(g.audio.song), level: g.audio.musicLevel });
        g.updateTransition(1);
      }
      g.enemies.clear();
      g.waves.wave = 11;
      g.waves.startWave();
      out.levels[12] = g.audio.musicLevel;
      out.log = g.notes.events.map((e) => e.text).filter((t) => t.startsWith('音樂'));
      // how much each level plays: a bar of UNDERTOW once its horn is in (bar 4), counted note by note
      const count = (level) => {
        let n = 0;
        const a = { musicLevel: level, music: {}, musicWet: {}, tone: () => n++, noise: () => n++ };
        for (let s = 64; s < 80; s++) playStep(a, SONGS.undertow, s, 0, 1);
        return n;
      };
      out.notes = [0, 1, 2].map(count);
      return out;
    });
    assert.equal(r.start, 'undertow', 'a run opens on the first song');
    assert.deepEqual(r.levels, { 1: 0, 2: 0, 3: 1, 4: 1, 12: 2 }, 'waves 1–2 the base, 3–4 more, the last wave the boss section');
    assert.deepEqual(r.stages, [
      { stage: 1, upcoming: 'countdown', playing: 'undertow', level: 0 },
      { stage: 2, upcoming: 'abyss', playing: 'undertow', level: 0 },
    ]);
    assert.ok(r.notes[0] < r.notes[1] && r.notes[1] < r.notes[2], `more notes at each level (${r.notes})`);
    assert.deepEqual(r.log, ['音樂：暗湧 UNDERTOW', '音樂：倒數 COUNTDOWN', '音樂：深淵 ABYSS']);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
