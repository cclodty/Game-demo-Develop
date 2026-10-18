#!/usr/bin/env node
// The itch.io page's pictures (itch.io 發佈包), made from the screenshots the
// tests already take (docs/shots/): the 630×500 cover, with the title over a
// gameplay shot, and the six screenshots for the page, copied into
// docs/itch/shots/. Run it again after new screenshots: `npm run itch:cover`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/itch');

/** The page's six screenshots, in order, and what each shows. */
export const SHOTS = [
  ['phase-1/rank-s.jpg', '子彈時間裏的 Style 評級 S'],
  ['phase-2/boss-heli.jpg', '天台直升機頭目的探照燈'],
  ['phase-1/pigeon-strike.jpg', '議事亭前地的白鴿'],
  ['phase-1/bomber-chain.jpg', '炸彈客連鎖爆炸'],
  ['phase-2/drone.jpg', '夜店舞池上空的無人機'],
  ['phase-2/daily-card.jpg', '每日挑戰：全世界同一局'],
];
const COVER_FROM = 'phase-2/grenadier-lob.jpg';

const dataUri = (file) => `data:image/jpeg;base64,${fs.readFileSync(path.join(ROOT, 'docs/shots', file)).toString('base64')}`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
  SHOTS.forEach(([file], i) => fs.copyFileSync(path.join(ROOT, 'docs/shots', file), path.join(OUT, 'shots', `${i + 1}.jpg`)));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 630, height: 500 } });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; width: 630px; height: 500px; overflow: hidden; background: #0a0816; }
    .bg { position: absolute; inset: 0; background: url(${dataUri(COVER_FROM)}) center 40% / auto 135%; filter: saturate(1.25) contrast(1.08); } /* enlarged: the HUD at the edges falls outside */
    .shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(10, 8, 22, 0) 35%, rgba(10, 8, 22, 0.92) 82%); }
    .title { position: absolute; left: 34px; right: 34px; bottom: 34px; color: #fff; font-family: 'Noto Sans TC', 'Noto Sans CJK TC', 'PingFang TC', sans-serif; }
    .zh { font-size: 74px; font-weight: 900; letter-spacing: 10px; line-height: 1; text-shadow: 0 0 22px #ff3fa4, 0 0 4px #ff3fa4; }
    .en { margin-top: 10px; font-size: 26px; font-weight: 700; letter-spacing: 9px; color: #3fe6ff; text-shadow: 0 0 12px rgba(63, 230, 255, 0.8); }
    .tag { margin-top: 12px; font-size: 17px; letter-spacing: 3px; color: #ffd48a; }
  </style><div class="bg"></div><div class="shade"></div>
  <div class="title"><div class="zh">子彈芭蕾</div><div class="en">BULLET BALLET</div><div class="tag">澳門的夜 · 子彈時間 · 十分鐘一局</div></div>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'cover.png') });
  await browser.close();
  console.log(`wrote docs/itch/cover.png (630×500, from ${COVER_FROM}) and docs/itch/shots/1–${SHOTS.length}.jpg`);
}
