#!/usr/bin/env node
// Listen to the songs without playing (音樂): renders each song in music.js to a WAV file, through
// the game's own synth and mix (an OfflineAudioContext in a headless browser), so a song can be
// judged and compared before it goes in, each brought to the same loudness. Each song also renders
// as bullet time hears it (tape rate 0.55, the music filter closed, what the song's `slow` keeps).
// `npm run music:preview [seconds] [id ...]` → dist/music/<id>.wav and <id>-slow.wav

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Render song `id` for `seconds` in `page` (on the game's server): a 16-bit stereo WAV, as bytes.
 * `loud`: bring it to about -16 dBFS (peaks kept under 0.95), so songs can be compared by ear.
 * `slow`: as bullet time hears it (AudioSys.setSlow(1): the tape rate, the closed filter, the song's `slow`).
 */
export async function renderSong(page, id, seconds, loud = false, slow = false) {
  const b64 = await page.evaluate(
    async ([id, seconds, loud, slow]) => {
      const { AudioSys } = await import('/src/audio.js');
      const { SONGS } = await import('/src/music.js');
      const rate = 44100;
      const a = new AudioSys();
      a.song = SONGS[id];
      const ctx = new window.OfflineAudioContext(2, Math.ceil(rate * seconds), rate);
      a.build(ctx);
      if (slow) a.setSlow(1);
      a.scheduleSong(seconds, 1, slow ? a.musicRate : 1);
      const buf = await ctx.startRendering();
      const n = buf.length;
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      let sum = 0;
      let peak = 0;
      for (let i = 0; i < n; i++) {
        sum += L[i] * L[i] + R[i] * R[i];
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      }
      const gain = loud ? Math.min(0.158 / Math.sqrt(sum / (2 * n) || 1), 0.95 / (peak || 1)) : 1;
      const out = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
      str(0, 'RIFF');
      out.setUint32(4, 36 + n * 4, true);
      str(8, 'WAVEfmt ');
      out.setUint32(16, 16, true);
      out.setUint16(20, 1, true);
      out.setUint16(22, 2, true);
      out.setUint32(24, rate, true);
      out.setUint32(28, rate * 4, true);
      out.setUint16(32, 4, true);
      out.setUint16(34, 16, true);
      str(36, 'data');
      out.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        out.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true);
        out.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true);
      }
      const bytes = new Uint8Array(out.buffer);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    [id, seconds, loud, slow],
  );
  return Buffer.from(b64, 'base64');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const seconds = Number(args[0]) > 0 ? Number(args.shift()) : 20;
  const { SONGS } = await import('../src/music.js');
  const ids = args.length ? args : Object.keys(SONGS);
  const server = await startServer(0);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${server.url}/scripts/music-preview.html`);
  const dir = path.join(ROOT, 'dist/music');
  fs.mkdirSync(dir, { recursive: true });
  for (const id of ids) {
    const wav = await renderSong(page, id, seconds, true);
    fs.writeFileSync(path.join(dir, `${id}.wav`), wav);
    console.log(`dist/music/${id}.wav  ${SONGS[id].name}  ${SONGS[id].bpm} BPM  ${seconds} s`);
    const slow = await renderSong(page, id, seconds, true, true);
    fs.writeFileSync(path.join(dir, `${id}-slow.wav`), slow);
    console.log(`dist/music/${id}-slow.wav  ${SONGS[id].name}  bullet time  ${seconds} s`);
  }
  await browser.close();
  await server.close();
}
