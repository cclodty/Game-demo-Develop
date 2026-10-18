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

test('every song renders: sound, no clipping; in the new songs bass, snare or clap, keys and lead sit within 12 dB of the kick', { timeout: 240000 }, async () => {
  const { page, logs } = await h.open();
  try {
    const r = await page.evaluate(async () => {
      const { AudioSys } = await import('/src/audio.js');
      const { SONGS } = await import('/src/music.js');
      const render = async (song, seconds) => {
        const a = new AudioSys();
        a.song = song;
        const ctx = new window.OfflineAudioContext(1, 44100 * seconds, 44100);
        a.build(ctx);
        a.scheduleSong(seconds);
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
          const only = (key, drum) => ({ ...song, drums: drum ? { [drum]: song.drums[drum] } : null, bass: null, keys: null, arp: null, pad: null, choir: null, lead: null, ...(key ? { [key]: { ...song[key], from: 0 } } : {}) });
          parts.kick = (await render(only(null, 'kick'), 6)).db;
          for (const drum of ['snare', 'clap']) if (song.drums[drum]) parts[drum] = (await render(only(null, drum), 6)).db;
          for (const key of ['bass', 'keys', 'lead']) if (song[key]) parts[key] = (await render(only(key), 6)).db;
        }
        out[id] = { all, parts, name: song.name, bpm: song.bpm };
      }
      return out;
    });
    assert.deepEqual(Object.keys(r).sort(), ['breaks', 'city', 'classic', 'dream', 'legend', 'neon', 'undertow', 'vendetta']);
    for (const [id, { all, parts, name }] of Object.entries(r)) {
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

test('the song the game plays: config.js MUSIC.song, or ?music=<id> for one visit (an unknown id falls back)', async () => {
  const pick = async (query) => {
    const { page, logs } = await h.open(query);
    try {
      const r = await page.evaluate(async () => {
        const { SONGS } = await import('/src/music.js');
        const { MUSIC } = await import('/src/config.js');
        return { id: Object.keys(SONGS).find((k) => SONGS[k] === window.game.audio.song), configured: MUSIC.song };
      });
      assert.deepEqual(problems(logs), []);
      return r;
    } finally {
      await page.close();
    }
  };
  const plain = await pick('');
  assert.equal(plain.id, plain.configured);
  assert.equal((await pick('?music=neon')).id, 'neon');
  assert.equal((await pick('?music=city')).id, 'city');
  assert.equal((await pick('?music=dream')).id, 'dream');
  assert.equal((await pick('?music=vendetta')).id, 'vendetta');
  assert.equal((await pick('?music=legend')).id, 'legend');
  assert.equal((await pick('?music=undertow')).id, 'undertow');
  assert.equal((await pick('?music=nonsense')).id, plain.configured);
});
