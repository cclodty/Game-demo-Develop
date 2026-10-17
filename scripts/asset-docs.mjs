#!/usr/bin/env node
// Writes the production and engine-neutral files from src/asset-manifest.js
// and src/maps.js:
//
//   assets/PROMPTS.md      copy-ready prompts, grouped and prioritised
//   assets/asset-list.json every asset with sizes, budgets, sockets and files
//   assets/asset-list.csv  the same as a spreadsheet (UTF-8, opens in Excel)
//   assets/maps/<id>.json  each map's layout in metres, for this or another engine
//
//   npm run assets:docs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALIASES, ANIMS, ART, ASSETS, GROUPS, MAP_ALIASES, MASTER } from '../src/asset-manifest.js';
import { CAMERA, VIEWS } from '../src/config.js';
import { MAPS } from '../src/maps.js';
import SENADO_DATA from '../src/senado/data.js';
import { FOUNTAIN } from '../src/senado/model.js';
import { toGame } from '../src/senado/transform.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.BB_DOCS_OUT || path.join(ROOT, 'assets')); // the tests point this at a temporary folder
const MAP_NAMES = { rooftop: '天台', club: '夜店', docks: '碼頭', senado: '議事亭' };

const num = (n) => n.toLocaleString('en-US');
const m = (v) => `${+v.toFixed(2)}`;
const masterOf = (a) => a.master || MASTER[a.kind];
const usesTotal = (a) => Object.values(a.uses || {}).reduce((x, y) => x + y, 0);
const glows = (a) => /neon|glow|led|emissive|light bar|lamp|lights|beacon|warning light/i.test(a.prompt);
const modular = (a) => !!a.module || /one [\d.]+ m section/i.test(a.prompt);

function files(id, a) {
  const f = { master: `source/${id}/${id}.glb`, textures: `source/${id}/textures/`, reference: `source/${id}/reference/` };
  if (a.kind === 'character' || a.kind === 'weapon' || a.anims) f.fbx = `source/${id}/${id}.fbx`;
  if (a.kind === 'character' || a.kind === 'prop') f.web = `models/${id}.glb`;
  return f;
}

function origin(a) {
  if (a.kind === 'character') return 'on the ground between the feet';
  if (a.kind === 'weapon') return 'at the main hand grip, with the barrel or blade pointing along +Z';
  if (a.kind === 'landmark') return 'at the centre of the footprint, at ground level';
  return 'at the bottom centre';
}

// ---------------------------------------------------------------- prompts

const art = `Art direction: ${ART.setting}; ${ART.look}; ${ART.lighting}.`;

function referencePrompt(id, a) {
  const [x, z, y] = a.size;
  switch (a.kind) {
    case 'character':
      return `Character turnaround sheet for a game: ${a.prompt}. Full body in an A-pose (arms about 45 degrees down), empty hands, front, side and back views side by side, plain light grey background, even neutral lighting, no text or labels. Height 1.78 m with realistic adult proportions (about 7.5 heads tall); the silhouette and colour blocks must stay readable when seen from above at a distance. ${art}`;
    case 'weapon':
      return `Game weapon concept sheet: ${a.prompt}. Orthographic side view and top view, plain light grey background, even neutral lighting, no text or labels. Overall length ${m(z)} m, height ${m(y)} m. ${art}`;
    case 'landmark':
      return `Architectural reference sheet of ${a.prompt}. A straight-on elevation of the main facade, a side elevation and an aerial three-quarter view, in daylight, no people or cars, no text. Footprint about ${m(x)} by ${m(z)} m, ${m(y)} m tall. ${art}`;
    case 'material':
      return `Seamless tileable texture swatch: ${a.prompt}. Seen straight from above, flat even lighting, no perspective and no shadows; it must tile seamlessly on all four edges. One tile covers ${m(x)} by ${m(z)} m.`;
    default:
      return `Game asset concept sheet: ${a.prompt}. Front, side and top orthographic views plus one three-quarter view, plain light grey background, even neutral lighting, no text or labels. True proportions: ${m(x)} m wide, ${m(z)} m deep, ${m(y)} m tall. ${art}`;
  }
}

function modelPrompt(id, a) {
  const [x, z, y] = a.size;
  const [tris, tex] = masterOf(a);
  if (a.kind === 'material') {
    return `Make this a seamless tileable PBR material at ${tex} by ${tex} px covering ${m(x)} by ${m(z)} m: base colour (sRGB, no lighting or shadows baked in), normal map (OpenGL, green up), roughness, ambient occlusion and height maps. Save each map as a separate PNG named ${id}_basecolor.png, ${id}_normal.png, ${id}_roughness.png, ${id}_ao.png and ${id}_height.png.`;
  }
  const what = {
    character: 'a high-quality rigged 3D game character from the turnaround sheet',
    weapon: 'a high-quality 3D game weapon from the concept sheet',
    landmark: 'a high-quality 3D model of the building exterior from the reference',
  }[a.kind] || 'a high-quality game-ready 3D model from the concept sheet';
  const parts = [`Build ${what}: ${a.prompt}.`];
  parts.push(`Units are metres, Y is up and the front faces +Z; put the origin ${origin(a)}. Real size: ${m(x)} m wide (X) by ${m(z)} m deep (Z) by ${m(y)} m tall (Y).`);
  parts.push(`Clean topology of about ${num(tris)} triangles with no hidden, floating or intersecting junk, and transforms applied (scale 1, no rotation).`);
  parts.push(`PBR metal-roughness materials with ${tex} px textures: base colour (sRGB, no lighting baked in), normal map (OpenGL, green up) and an ORM map (red = ambient occlusion, green = roughness, blue = metallic)${glows(a) ? ', plus an emissive map for the glowing parts' : ''}.`);
  if (modular(a)) parts.push('This is one modular section: both ends must join seamlessly when it is repeated in a row.');
  if (a.kind === 'character') {
    parts.push(
      'Rig it with a standard humanoid skeleton using Mixamo-style bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase and the Right equivalents, plus fingers); every character in this game uses the same skeleton. Good skin weights at the shoulders, elbows, hips and knees.',
    );
    parts.push(`Animations, in place with no root motion, each as its own named clip: ${ANIMS.required.join(', ')} (required); ${ANIMS.recommended.join(', ')} (if possible). No weapon in the hands.`);
  }
  if (a.anims) parts.push(`Rig it with simple bones for the body, neck, head, both wings and both legs. Animations, in place, each as its own named clip: ${a.anims.join(', ')}.`);
  if (a.sockets) {
    const s = Object.entries(a.sockets)
      .map(([k, [sx, sy, sz]]) => `socket_${k} at (${m(sx)}, ${m(sy)}, ${m(sz)})`)
      .join(', ');
    parts.push(`Add empty helper nodes, positions in metres from the origin as (X, Y, Z): ${s}.`);
  }
  if (a.kind === 'landmark') parts.push(`Turn the model so the main facade faces +Z. Model the exterior only, true to photographs of the real building; use trim sheets and tiling materials so large walls stay sharp. Also provide a lighter LOD1 version of about ${num(Math.round(tris / 4))} triangles.`);
  const fbx = files(id, a).fbx ? ', and the same model as FBX' : '';
  parts.push(`Export one GLB with the textures embedded${a.kind === 'character' ? ', the skeleton and all animations' : ''}${fbx}; also save the textures as separate PNG files.`);
  return parts.join(' ');
}

// --------------------------------------------------------------- PROMPTS.md

function promptsMd() {
  const out = [];
  out.push('# 3D 模型提示詞清單', '');
  out.push('> 這個檔案由 `src/asset-manifest.js` 自動生成（`npm run assets:docs`）。要改內容請改那個檔案再重新生成，不要直接改這裡。');
  out.push('> 尺寸、比例和交付格式的完整說明見 [SPEC.md](SPEC.md)。', '');
  out.push('## 用法', '');
  out.push('1. 每件物件有兩段英文提示詞（生成工具對英文最準確，整段複製即可）：');
  out.push('   - **① 參考圖**：先生成設定圖，滿意了再做模型。');
  out.push('   - **② 3D 模型**：用設定圖生成模型。人物這一段還包括綁骨和動作。');
  out.push('2. 完成後把檔案放進「交付」那一格的位置，告訴 Claude 處理。');
  out.push('3. 先做優先 1，再做 2、3。同一類東西（例如全部敵人）最好在同一個對話裡連續做，風格才會統一。');
  out.push('4. 想調整外觀，可以在提示詞後面加自己的要求，但**尺寸、方向、原點、貼圖格式**這幾句不要刪，遊戲和日後轉引擎都靠它們。', '');

  out.push('## 總覽', '');
  out.push('| 類別 | 件數 | 優先 1 | 優先 2 | 優先 3 |', '|---|---|---|---|---|');
  for (const [g, zh] of GROUPS) {
    const list = Object.values(ASSETS).filter((a) => a.group === g);
    const c = (p) => list.filter((a) => a.priority === p).length;
    out.push(`| [${zh}](#${g}) | ${list.length} | ${c(1)} | ${c(2)} | ${c(3)} |`);
  }
  out.push(`| **合計** | **${Object.keys(ASSETS).length}** | | | |`, '');

  for (const [g, zh] of GROUPS) {
    out.push(`<a id="${g}"></a>`, '', `## ${zh}`, '');
    const list = Object.entries(ASSETS)
      .filter(([, a]) => a.group === g)
      .sort((p, q) => p[1].priority - q[1].priority);
    for (const [id, a] of list) {
      const [x, z, y] = a.size;
      const [mt, mtex] = masterOf(a);
      out.push(`### \`${id}\` ${a.zh} · 優先 ${a.priority}`, '');
      out.push('| | |', '|---|---|');
      if (a.kind === 'material') out.push(`| 一塊貼圖覆蓋 | ${m(x)} × ${m(z)} 米 |`);
      else if (a.kind === 'character') out.push(`| 尺寸 | 身高 ${m(y)} 米，約 ${m(x)} 米寬（${id === 'brute' ? '遊戲裡放大到約 2.2 米' : '遊戲裡同樣大小'}） |`);
      else if (a.kind === 'weapon') out.push(`| 尺寸 | 長 ${m(z)} × 寬 ${m(x)} × 高 ${m(y)} 米（原點在主握把） |`);
      else out.push(`| 尺寸 | 寬 ${m(x)} × 深 ${m(z)} × 高 ${m(y)} 米${a.fit === 'tile' ? `（一節；遊戲按長度重複）` : ''} |`);
      if (a.uses) out.push(`| 用量 | ${Object.entries(a.uses).map(([k, n]) => `${MAP_NAMES[k]} ${n}`).join('、')}（共 ${usesTotal(a)}） |`);
      if (a.kind === 'material') out.push(`| 母版 | ${mtex} × ${mtex} 貼圖（顏色、法線、粗糙度、AO、高度） |`);
      else out.push(`| 母版（高質量） | 約 ${num(mt)} 三角面，${mtex} 貼圖 |`);
      if (a.kind === 'character' || a.kind === 'prop') out.push(`| 網頁遊戲版 | 腳本自動減到 ${num(a.tris)} 面、${a.texture} 貼圖 |`);
      else if (a.kind !== 'material') out.push(`| 網頁遊戲版 | 約 ${num(a.tris)} 面、${a.texture} 貼圖（遊戲接上後自動處理） |`);
      const f = files(id, a);
      const deliver = a.kind === 'material' ? `\`assets/source/${id}/\` 內各張 PNG` : [`\`assets/${f.master}\``, f.fbx && `\`${id}.fbx\``, '`textures/`', '`reference/`'].filter(Boolean).join(' + ');
      out.push(`| 交付 | ${deliver} |`, '');
      if (a.notes) out.push(`> ${a.notes}`, '');
      out.push('**① 參考圖**', '', '```text', referencePrompt(id, a), '```', '');
      out.push(`**② ${a.kind === 'character' ? '3D 模型＋綁骨＋動作' : a.kind === 'material' ? '材質貼圖' : '3D 模型'}**`, '', '```text', modelPrompt(id, a), '```', '');
    }
  }
  return out.join('\n');
}

// ------------------------------------------------------- asset-list.json/.csv

function assetList() {
  return {
    format: 1,
    note: 'Generated from src/asset-manifest.js by scripts/asset-docs.mjs. Units metres; Y up; models face +Z (glTF conventions). Paths are relative to assets/.',
    units: 'metres',
    up: '+Y',
    forward: '+Z',
    animations: ANIMS,
    assets: Object.entries(ASSETS).map(([id, a]) => {
      const [x, z, y] = a.size;
      const [mt, mtex] = masterOf(a);
      const e = { id, kind: a.kind, group: a.group, name_zh: a.zh, priority: a.priority, size: { x, y, z }, origin: origin(a) };
      if (a.fit) e.fit = a.fit;
      if (a.module) e.module = a.module;
      if (a.offset) e.offset = { x: a.offset[0], y: a.offset[2], z: a.offset[1] };
      if (a.uses) e.uses = a.uses;
      e.budgets = { master: { tris: mt, texture: mtex }, web: { tris: a.tris ?? 0, texture: a.texture } };
      if (a.sockets) e.sockets = Object.fromEntries(Object.entries(a.sockets).map(([k, [sx, sy, sz]]) => [`socket_${k}`, { x: sx, y: sy, z: sz }]));
      if (a.kind === 'character') e.animations = [...ANIMS.required, ...ANIMS.recommended];
      if (a.anims) e.animations = a.anims;
      e.files = files(id, a);
      e.prompt = a.prompt;
      return e;
    }),
  };
}

function csv(list) {
  const cols = ['id', 'kind', 'group', 'name_zh', 'priority', 'size_x', 'size_z', 'size_y', 'uses_total', 'master_tris', 'master_texture', 'web_tris', 'web_texture', 'master_file', 'prompt'];
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = list.assets.map((e) =>
    [e.id, e.kind, e.group, e.name_zh, e.priority, e.size.x, e.size.z, e.size.y, Object.values(e.uses || {}).reduce((a, b) => a + b, 0), e.budgets.master.tris, e.budgets.master.texture, e.budgets.web.tris, e.budgets.web.texture, e.files.master, e.prompt].map(q).join(','),
  );
  return `﻿${cols.join(',')}\n${rows.join('\n')}\n`;
}

// ---------------------------------------------------------------- map JSON

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

function assetFor(mapId, kind) {
  const alias = MAP_ALIASES[mapId]?.[kind] ?? kind;
  const [id, tint] = ALIASES[alias] ?? [alias];
  return { asset: ASSETS[id] ? id : null, tint: tint === undefined ? undefined : hex(tint) };
}

function mapJson(map) {
  const [halfW, halfD] = map.size;
  const t = map.theme;
  const j = {
    format: 1,
    id: map.id,
    name: map.name,
    en: map.en,
    note: 'Generated from src/maps.js by scripts/asset-docs.mjs. Metres; x east, y up, z south (towards the default camera); origin at the centre of the playable area. Boxes are axis-aligned: x, z = centre, w along x, d along z, h tall from the ground. "asset" is the id in assets/asset-list.json.',
    playable: { width: halfW * 2, depth: halfD * 2 },
    start: { x: map.start[0], z: map.start[1] },
    camera: { distance: map.camera?.dist ?? CAMERA.dist, fov: map.camera?.fov ?? CAMERA.fov, topDownPitch: map.camera?.pitch ?? CAMERA.pitch, views: VIEWS, defaultView: 'iso' },
    lighting: {
      background: hex(t.bg),
      fog: { color: hex(t.fog[0]), density: t.fog[1] },
      hemisphere: { sky: hex(t.hemi[0]), ground: hex(t.hemi[1]), intensity: t.hemi[2] },
      sun: { color: hex(t.moon[0]), intensity: t.moon[1], direction: t.sunDir || [-14, 32, 16] },
      points: t.points.filter((p) => p[4] > 0).map(([c, x, y, z, intensity, distance]) => ({ color: hex(c), x, y, z, intensity, distance })),
      rain: !!t.rain,
    },
    floor: map.floor,
    edges: map.edges ? Object.fromEntries(Object.entries(map.edges).map(([side, [h, kind, trim]]) => [side, { height: h, kind, trim }])) : null,
    solids: map.solids.map(([x, z, w, d, h, kind, face]) => ({ kind, ...assetFor(map.id, kind), x, z, w, d, h, ...(face !== undefined ? { face } : {}) })),
    glass: (map.glass || []).map(([x, z, w, d, h]) => ({ x, z, w, d, h })),
    barrels: (map.barrels || []).map(([x, z, v = 'barrel']) => ({ asset: v, x, z })),
    pans: (map.pans || []).map(([x, z, v = 'pan']) => ({ asset: v, x, z })),
    weaponPads: (map.pads || []).map(([x, z]) => ({ x, z })),
    pigeonFlocks: (map.flocks || []).map(([x, z]) => ({ x, z })),
    spawns: map.spawns,
  };
  if (map.id === 'senado') {
    const f = SENADO_DATA.fountain;
    const [fx, fz] = toGame(f.x, f.y);
    j.fountain = { asset: 'fountain', x: +fx.toFixed(2), z: +fz.toFixed(2), ...FOUNTAIN };
    j.trees = SENADO_DATA.trees.map(([x, y]) => toGame(x, y).map((v) => +v.toFixed(2)));
    j.buildings = SENADO_DATA.buildings.concat(SENADO_DATA.parts).map((b) => ({
      id: b.id,
      name: b.name || null,
      height: b.h,
      minHeight: b.minH || 0,
      footprint: b.outer.map(([x, y]) => toGame(x, y).map((v) => +v.toFixed(2))),
    }));
    j.credit = map.credit;
  }
  return j;
}

// -------------------------------------------------------------------- write

fs.writeFileSync(path.join(OUT, 'PROMPTS.md'), promptsMd());
const list = assetList();
fs.writeFileSync(path.join(OUT, 'asset-list.json'), `${JSON.stringify(list, null, 2)}\n`);
fs.writeFileSync(path.join(OUT, 'asset-list.csv'), csv(list));
fs.mkdirSync(path.join(OUT, 'maps'), { recursive: true });
for (const map of MAPS) fs.writeFileSync(path.join(OUT, 'maps', `${map.id}.json`), `${JSON.stringify(mapJson(map), null, 2)}\n`);
console.log(`wrote assets/PROMPTS.md, asset-list.json/.csv (${list.assets.length} assets) and ${MAPS.length} map layouts in assets/maps/`);
