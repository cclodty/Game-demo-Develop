import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildSenado, buildFigure, landmarkAnchors, prismGeometry } from './model.js';

const EYE = 1.65;          // m, eye height of the 1.75 m reference person
const WALK = 1.5, RUN = 6; // m/s
const $ = (id) => document.getElementById(id);

// Camera presets in data coordinates (x east, y north, z up). Eye-level ones keep z fixed when the world is scaled.
const PRESETS = [
  { id: 'mouth', label: '新馬路口', key: '1', pos: [-18, -20.5, EYE], tgt: [44, 72, 5], fov: 50, eye: true,
    note: '廣場入口近新馬路，望向玫瑰堂方向' },
  { id: 'fountain', label: '噴水池望玫瑰堂', key: '2', pos: [-7, -10, EYE], tgt: [54, 100, 5], fov: 48, eye: true,
    note: '噴水池西南面，視線沿漏斗收窄方向' },
  { id: 'back', label: '窄段回望', key: '3', pos: [43, 57, EYE], tgt: [-28, -44, 6], fov: 50, eye: true,
    note: '板樟堂前地入口回望新馬路，背後高樓入鏡' },
  { id: 'arcade', label: '騎樓內', key: '4', pos: [-3.5, 16.2, EYE], tgt: [18.2, 36.9, 2.4], fov: 62, eye: true,
    note: '商務旅遊中心騎樓內，望向窄段（騎樓深 3 米、高 5.3 米）' },
  { id: 'tps', label: '第三人稱', key: '5', tps: true, fig: [-14, -19], heading: 52, fov: 58,
    note: '遊戲肩後鏡頭：鏡頭在人物後 3.4 米、高 1.9 米' },
  { id: 'oblique', label: '斜上方', key: '6', pos: [-100, -112, 108], tgt: [12, 30, 0], fov: 45,
    note: '西南面斜俯視，看漏斗形廣場和周邊高度' },
  { id: 'top', label: '俯瞰', key: '7', pos: [10, 24, 330], tgt: [10, 25, 0], fov: 40,
    note: '正上方，上方為北' },
];
const FIGURES = [[-7, -12, 52], [5.5, -7.5, 200], [12, -15, 120], [28, 37, 230], [52, 80, 30], [-31, -38, 60]];

const state = { scale: 1, planOnly: false, preset: 'mouth', walk: false, data: null, picked: null, sunAz: 125, sunEl: 50 };
const v3 = (x, y, z = 0) => new THREE.Vector3(x * state.scale, z * (state.planOnly ? 1 : state.scale), -y * state.scale);

// ---------------- renderer / scene ----------------
const host = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
host.prepend(renderer.domElement);
const labelRenderer = new CSS2DRenderer({ element: $('labels') });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfd8de);
scene.fog = new THREE.Fog(0xcfd8de, 420, 1500);
const camera = new THREE.PerspectiveCamera(60, 1.6, 0.1, 4000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.maxPolarAngle = Math.PI * 0.495;

// Lighting compared side by side with photos #87 and #130: morning sun from the south-east lights the
// west row as in #87; a warm ground bounce keeps shaded pastel walls from going khaki. AgX and ACES
// tone mapping were tried and washed the pastels out, so output is plain sRGB.
const hemi = new THREE.HemisphereLight(0xeef3f8, 0xc9b99c, 1.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2de, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.6;
const sc = sun.shadow.camera;
sc.left = -230; sc.right = 230; sc.top = 230; sc.bottom = -230; sc.near = 10; sc.far = 900;
scene.add(sun, sun.target);
function placeSun() {
  // afternoon sun from the south-west, 48° elevation
  const az = THREE.MathUtils.degToRad(state.sunAz), el = THREE.MathUtils.degToRad(state.sunEl), d = 420;
  sun.target.position.set(10 * state.scale, 0, -20 * state.scale);
  sun.position.set(sun.target.position.x + Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, sun.target.position.z - Math.cos(az) * Math.cos(el) * d);
}

// ---------------- load ----------------
const texLoader = new THREE.TextureLoader();
const loadTex = (url) => new Promise((res, rej) => texLoader.load(url, res, undefined, rej));

let world, pickTables = [], figureGroup, labelObjs = [], satMesh = null, highlight = null, gridTex = null;

async function init() {
  const [data, calcada, louvre, glazing, facade, credits] = await Promise.all([
    fetch('data/senado_massing.json').then((r) => { if (!r.ok) throw new Error(`data ${r.status}`); return r.json(); }),
    loadTex('viewer/assets/calcada_waves.png'),
    loadTex('viewer/assets/louvre.png'),
    loadTex('viewer/assets/glazing.png'),
    loadTex('viewer/assets/facade_generic.png'),
    fetch('reference/photos/credits.json').then((r) => (r.ok ? r.json() : { photos: {} })).catch(() => ({ photos: {} })),
  ]);
  state.photos = credits.photos;
  for (const t of [calcada, louvre, glazing, facade]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
  // window detail maps are stored bottom-up (glTF convention), see scripts/make_window_textures.py
  louvre.flipY = glazing.flipY = facade.flipY = false;
  gridTex = facade;
  state.data = data;
  const built = buildSenado(data, { mode: 'viewer', calcadaTexture: calcada, louvreTexture: louvre, glazingTexture: glazing, facadeTexture: facade });
  world = built.root;
  pickTables = built.pickTables;
  scene.add(world);

  figureGroup = new THREE.Group();
  figureGroup.name = 'ScaleFigures';
  FIGURES.forEach(([x, y, hd], i) => {
    const f = buildFigure();
    f.userData.base = [x, y, hd];
    if (i === 0) {
      const t = document.createElement('div');
      t.className = 'tag fig';
      t.textContent = '1.75 m';
      const o = new CSS2DObject(t);
      o.position.set(0, 2.1, 0);
      f.add(o);
    }
    figureGroup.add(f);
  });
  scene.add(figureGroup);

  for (const a of landmarkAnchors(data)) {
    const el = document.createElement('div');
    el.className = 'tag';
    el.innerHTML = `${a.label}<small>${a.sub}</small>`;
    const o = new CSS2DObject(el);
    o.userData.base = [a.x, a.y, a.h + 3];
    labelObjs.push(o);
    scene.add(o);
  }

  buildDims();
  buildLegend();
  buildMinimap();
  buildPresetButtons();
  applyScale();
  setPreset('mouth', true);
  $('loading').hidden = true;
  $('buildStamp').textContent = `資料版本：${data.meta.source}`;
  resize();
  renderer.setAnimationLoop(tick);
  window.senado = { THREE, scene, camera, controls, state, setPreset, world, showPick, renderer, hemi, sun, placeSun };
}

// ---------------- scale ----------------
function applyScale() {
  const s = state.scale;
  world.scale.set(s, state.planOnly ? 1 : s, s);
  figureGroup.children.forEach((f) => {
    const [x, y, hd] = f.userData.base;
    f.position.copy(v3(x, y, 0));
    f.rotation.y = THREE.MathUtils.degToRad(hd);
  });
  labelObjs.forEach((o) => { const [x, y, z] = o.userData.base; o.position.copy(v3(x, y, z)); });
  placeSun();
  if (highlight) highlight.scale.copy(world.scale);
  $('scaleVal').textContent = `${s.toFixed(2)}×`;
  $('dimScale').textContent = s === 1 ? '實際比例' : `${s.toFixed(2)}× ${state.planOnly ? '平面' : '整體'}`;
  updateDims();
}

// ---------------- presets ----------------
function presetCam(p) {
  if (p.tps) {
    const [fx, fy] = p.fig;
    const h = THREE.MathUtils.degToRad(p.heading);
    const fwd = [Math.cos(h), Math.sin(h)], right = [Math.sin(h), -Math.cos(h)];
    const bx = fx * state.scale, by = fy * state.scale;
    const pos = [bx - fwd[0] * 3.4 + right[0] * 0.7, by - fwd[1] * 3.4 + right[1] * 0.7, 1.9];
    const tgt = [bx + fwd[0] * 12 + right[0] * 0.7, by + fwd[1] * 12 + right[1] * 0.7, 1.5];
    return { pos: new THREE.Vector3(pos[0], pos[2], -pos[1]), tgt: new THREE.Vector3(tgt[0], tgt[2], -tgt[1]) };
  }
  const zs = (z, eye) => (eye ? z : z * (state.planOnly ? 1 : state.scale));
  return {
    pos: new THREE.Vector3(p.pos[0] * state.scale, zs(p.pos[2], p.eye), -p.pos[1] * state.scale),
    tgt: new THREE.Vector3(p.tgt[0] * state.scale, zs(p.tgt[2], p.eye), -p.tgt[1] * state.scale),
  };
}
let tween = null;
function setPreset(id, instant = false) {
  const p = PRESETS.find((q) => q.id === id);
  state.preset = id;
  if (state.walk) setWalk(false);
  document.querySelectorAll('#presets button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  const { pos, tgt } = presetCam(p);
  // tps: put the lead figure where the preset expects it
  const lead = figureGroup.children[0];
  if (p.tps) { lead.userData.base = [p.fig[0], p.fig[1], p.heading - 90]; }
  else { lead.userData.base = [FIGURES[0][0], FIGURES[0][1], FIGURES[0][2]]; }
  const [lx, ly, lh] = lead.userData.base;
  lead.position.copy(v3(lx, ly, 0));
  lead.rotation.y = THREE.MathUtils.degToRad(lh);
  // eye-level views may look slightly upward; aerial views must not orbit under the ground
  controls.maxPolarAngle = p.eye || p.tps ? Math.PI * 0.62 : Math.PI * 0.495;
  const from = { pos: camera.position.clone(), tgt: controls.target.clone(), fov: camera.fov };
  if (instant) {
    camera.position.copy(pos); controls.target.copy(tgt); camera.fov = p.fov; camera.updateProjectionMatrix();
    tween = null;
  } else {
    tween = { from, to: { pos, tgt, fov: p.fov }, t: 0 };
  }
  $('fov').value = p.fov;
  $('fovVal').textContent = `${p.fov}°`;
  $('camInfo').textContent = p.note;
}
function buildPresetButtons() {
  const box = $('presets');
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = p.id;
    b.innerHTML = `<span class="k">${p.key}</span>${p.label}`;
    b.setAttribute('aria-pressed', 'false');
    b.title = p.note;
    b.addEventListener('click', () => setPreset(p.id));
    box.append(b);
  }
}

// ---------------- walk mode ----------------
const keys = new Set();
let yaw = 0, pitch = 0;
function setWalk(on) {
  state.walk = on;
  $('walkBtn').setAttribute('aria-pressed', String(on));
  $('walkpad').hidden = !on;
  controls.enabled = !on;
  if (on) {
    tween = null;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    yaw = Math.atan2(dir.x, -dir.z);
    pitch = 0;
    camera.position.y = EYE;
    camera.fov = Math.max(camera.fov, 60);
    camera.updateProjectionMatrix();
    $('hintBox').textContent = 'WASD／方向鍵移動 · 拖曳轉向 · Shift 跑步 6 m/s';
    document.querySelectorAll('#presets button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    $('camInfo').textContent = '步行模式 · 眼高 1.65 米';
  } else {
    const dir = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    controls.target.copy(camera.position).addScaledVector(dir, 10);
    $('hintBox').textContent = '拖曳旋轉 · 右鍵平移 · 滾輪縮放 · 點選建築';
  }
}
$('walkBtn').addEventListener('click', () => setWalk(!state.walk));
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input')) return;
  const p = PRESETS.find((q) => q.key === e.key);
  if (p) { setPreset(p.id); return; }
  if (state.walk) { keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = e.clientX; drag.y = e.clientY;
  if (state.walk) {
    yaw += dx * 0.0042;
    pitch = THREE.MathUtils.clamp(pitch - dy * 0.0042, -1.2, 1.2);
  }
});
window.addEventListener('pointerup', (e) => {
  if (drag && drag.moved < 5 && e.target === renderer.domElement) pick(e);
  drag = null;
});
document.querySelectorAll('#walkpad button').forEach((b) => {
  const k = { f: 'KeyW', b: 'KeyS', l: 'KeyA', r: 'KeyD' }[b.dataset.k];
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); keys.add(k); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => keys.delete(k));
});

// ---------------- picking ----------------
const ray = new THREE.Raycaster();
function pick(e) {
  const r = renderer.domElement.getBoundingClientRect();
  const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(m, camera);
  const targets = [];
  world.traverse((o) => { if (o.isMesh && o.visible && (o.userData.kind === 'building' || o.userData.kind === 'merged')) targets.push(o); });
  const hit = ray.intersectObjects(targets, false)[0];
  if (!hit) { showPick(null); return; }
  if (hit.object.userData.kind === 'building') { showPick(hit.object.userData); return; }
  const table = pickTables.find((t) => t.mesh === hit.object);
  const b = table.list[table.triOwner[hit.faceIndex]];
  showPick({ kind: 'building', id: b.id, name: b.name, tier: b.tier, height: b.h, heightSource: b.hSrc, distToSquare: b.dSquare, minHeight: b.minH });
}
const TIER = { landmark: '地標', frontage: '廣場臨街', avenue: '新馬路臨街', core: '核心範圍', context: '外圍', part: '建築部件' };
const SRC = { 'osm:height': ['OSM 實測', 'osm'], 'osm:levels': ['OSM 樓層數推算', 'osm'], default: ['按同面積樓宇中位數估算', 'est'], 'default:small': ['小型構築物，估 3.5 m', 'est'], override: ['人手修正（見 landmarks.json）', 'est'], bridge: ['按相鄰樓宇', 'est'] };
function showPick(u) {
  if (highlight) { world.remove(highlight); highlight.geometry.dispose(); highlight = null; }
  if (!u) { $('pickBody').hidden = true; $('pickEmpty').hidden = false; $('pickTier').textContent = '—'; return; }
  const b = state.data.buildings.concat(state.data.parts).find((q) => q.id === u.id);
  const lm = u.key ? state.data.landmarks.find((l) => l.key === u.key) : null;
  $('pickEmpty').hidden = true; $('pickBody').hidden = false;
  $('pickTier').textContent = TIER[u.tier] || u.tier;
  $('pickName').textContent = lm ? lm.zh : (u.name || '未命名建築');
  $('pickSub').textContent = lm ? `${lm.pt} · ${lm.role}` : (u.name ? '' : 'OSM 無名稱');
  const [srcText, cls] = SRC[u.heightSource] || [u.heightSource, 'est'];
  const s = state.planOnly ? 1 : state.scale;
  $('pickH').innerHTML = `${u.height.toFixed(1)} m${s !== 1 ? ` <small>→ ${(u.height * s).toFixed(1)}</small>` : ''}`;
  $('pickSrc').innerHTML = `<span class="pill ${cls}">${srcText}</span>`;
  $('pickD').textContent = `${u.distToSquare.toFixed(1)} m`;
  const [t, n] = [u.id[0], u.id.slice(1).split('.')[0]];
  const kind = t === 'w' ? 'way' : 'relation';
  $('pickId').innerHTML = t === 'x'
    ? '<span class="mono">按照片補建（非 OSM）</span>'
    : `<a href="https://www.openstreetmap.org/${kind}/${n}" target="_blank" rel="noopener" class="mono">${kind}/${n}</a>`;
  showFacade(b);
  const wcol = b && b.facade && b.facade.wallColor;
  const lmCol = lm ? { hex: lm.facade, label: { photo: '照片取色', known: '已知顏色' }[lm.colorSrc] || '未核對，暫定色' } : null;
  const gen = b && b.wallGeneric != null ? state.data.genericWalls[b.wallGeneric] : null;
  const chip = (hex) => `<span class="chipcol" style="background:${hex}"></span>`;
  $('pickColor').innerHTML = wcol ? `${chip(wcol.hex)}${wcol.hex} <small>${wcol.photos.join(' ')}</small>`
    : lmCol ? `${chip(lmCol.hex)}${lmCol.hex} <small>${lmCol.label}</small>`
      : gen ? `${chip(gen.hex)}<small>${gen.label.replace('通用：', '')} · 通用色（無照片證據）</small>`
        : '<small>未核對（中性色）</small>';
  const roof = b && b.roof && state.data.roofPalette[b.roof.cls];
  const shape = b && b.roof && b.roof.shape;
  $('pickRoof').innerHTML = roof
    ? `${chip(roof.hex)}<small>${roof.label}${shape ? ` · 雙坡頂，屋脊高 ${(shape.eave + shape.rise).toFixed(1)} m` : ''}</small>`
    : '<small>—</small>';
  if (b) {
    const g = new THREE.EdgesGeometry(prismGeometry(b.outer, b.holes, b.h + 0.05, b.minH), 20);
    highlight = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1f4f93, depthTest: false, transparent: true, opacity: 0.95 }));
    highlight.renderOrder = 10;
    world.add(highlight);
  }
}

// ---------------- layers ----------------
function bindToggle(id, fn) {
  const b = $(id);
  b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); fn(on); });
}
bindToggle('tLabels', (on) => labelObjs.forEach((o) => { o.visible = on; o.element.hidden = !on; }));
bindToggle('tFigs', (on) => { figureGroup.visible = on; figureGroup.traverse((o) => { if (o.isCSS2DObject) o.element.hidden = !on; }); });
bindToggle('tContext', (on) => { const g = world.getObjectByName('Buildings_context'); if (g) g.visible = on; });
// generic window grid on the buildings without a facade spec (Facade_generic)
bindToggle('tGrid', (on) => {
  const seen = new Set();
  world.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (seen.has(m) || !m.userData.windowGrid) continue;
      seen.add(m);
      m.map = on ? gridTex : null;
      m.needsUpdate = true;
    }
  });
});
bindToggle('tSat', async (on) => {
  if (on && !satMesh) {
    const tex = await loadTex('reference/sat_local.jpg').catch(() => null);
    if (!tex) { $('tSat').setAttribute('aria-pressed', 'false'); $('camInfo').textContent = '未有衛星參考圖，請先執行 fetch_imagery.py'; return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const [x0, y0, x1, y1] = state.data.meta.bounds;
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0).rotateX(-Math.PI / 2);
    satMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
    satMesh.position.set((x0 + x1) / 2, 0.06, -(y0 + y1) / 2);
    satMesh.name = 'SatelliteReference';
    world.add(satMesh);
  }
  if (satMesh) satMesh.visible = on;
  for (const n of ['Calcada_Squares', 'Streets', 'Grass']) { const o = world.getObjectByName(n); if (o) o.visible = !on; }
});
$('scale').addEventListener('input', (e) => { state.scale = parseFloat(e.target.value); applyScale(); if (!state.walk) setPreset(state.preset, true); });
$('planOnly').addEventListener('change', (e) => { state.planOnly = e.target.checked; applyScale(); if (!state.walk) setPreset(state.preset, true); });
$('fov').addEventListener('input', (e) => { camera.fov = parseFloat(e.target.value); camera.updateProjectionMatrix(); $('fovVal').textContent = `${e.target.value}°`; });

// photo overlay: a reference photo laid over the viewport for camera matching
function showOverlay(src, name) {
  const img = $('photoOverlay');
  if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
  img.onload = () => { host.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; host.style.maxHeight = 'none'; };
  img.src = src;
  img.hidden = false;
  $('photoCtl').hidden = false;
  $('photoName').textContent = name;
}
$('photoBtn').addEventListener('click', () => $('photoFile').click());
$('photoFile').addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  showOverlay(url, f.name);
  $('photoOverlay').dataset.url = url;
});

// facade spec + the Commons photos it was read from
function showFacade(b) {
  const F = b && b.facade;
  $('pickFacade').hidden = !F;
  if (!F) return;
  const A = F.arcade && F.arcadeEdges.length ? F.arcade : null;
  const rows = [
    ['騎樓', A ? (F.passage ? `過街樓，高 ${A.height} m` : A.depth < 1.5 ? `淺拱店面，深 ${A.depth} m` : `高 ${A.height} m · 深 ${A.depth} m · 拱距約 ${A.bay} m`) : '無'],
    ['樓層高度', F.floors.map((f) => f.toFixed(1)).join(' / ') + ' m'],
    ['簷口／女兒牆', `${F.cornice ? F.cornice.h + ' m' : '—'} / ${F.parapet ? F.parapet.h + ' m' : '—'}`],
  ];
  const W = F.windows && F.windows.shape ? F.windows : null;
  if (W) {
    const wc = state.data.windowColors || {};
    const fill = (w) => shortLabel((wc[w.fill] || {}).label || w.fill);
    let text = `${WINDOW_SHAPES[W.shape] || W.shape} 約 ${W.w} × ${W.h[0]} m · ${fill(W)}`;
    const kinds = Object.values(F.edgeKinds || {});
    const st = W.onStreet && kinds.includes('street') ? { ...W, ...W.onStreet } : null;
    if (st && st.fill !== W.fill) text += `；街面 ${fill(st)}`;
    rows.push(['窗戶', text]);
  }
  $('pickFacadeKv').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('pickNote').textContent = F.note || '';
  $('pickNote').hidden = !F.note;
  const box = $('pickPhotos');
  box.innerHTML = '';
  for (const id of F.evidence) {
    const ph = state.photos && state.photos[id];
    if (!ph) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = `${id} · ${ph.author} · ${ph.license}\n${ph.file}`;
    btn.innerHTML = `<img src="${ph.src}" alt="照片 ${id}" loading="lazy"><span>${id} · ${ph.license}</span>`;
    btn.addEventListener('click', () => viewFromPhoto(id, ph, b));
    box.append(btn);
  }
}
function viewFromPhoto(id, ph, b) {
  showOverlay(ph.src, `${id} · ${ph.author} · ${ph.license}`);
  if (!ph.camera) { $('camInfo').textContent = `照片 ${id} 沒有拍攝位置，請手動對位`; return; }
  if (state.walk) setWalk(false);
  let cx = 0, cy = 0;
  for (const p of b.outer) { cx += p[0]; cy += p[1]; }
  cx /= b.outer.length; cy /= b.outer.length;
  const s = state.scale;
  const pos = new THREE.Vector3(ph.camera[0] * s, 1.6, -ph.camera[1] * s);
  const tgt = new THREE.Vector3(cx * s, b.h * 0.45 * (state.planOnly ? 1 : s), -cy * s);
  controls.maxPolarAngle = Math.PI * 0.62;
  tween = { from: { pos: camera.position.clone(), tgt: controls.target.clone(), fov: camera.fov }, to: { pos, tgt, fov: 50 }, t: 0 };
  document.querySelectorAll('#presets button').forEach((q) => q.setAttribute('aria-pressed', 'false'));
  $('camInfo').textContent = `照片 ${id} 的拍攝位置（GPS），FOV 50° 為估計，可再微調`;
  $('fov').value = 50; $('fovVal').textContent = '50°';
}
$('photoOpacity').addEventListener('input', (e) => { $('photoOverlay').style.opacity = e.target.value; });
$('photoClear').addEventListener('click', () => {
  const img = $('photoOverlay');
  if (img.dataset.url) { URL.revokeObjectURL(img.dataset.url); delete img.dataset.url; }
  img.hidden = true; img.removeAttribute('src');
  host.style.aspectRatio = ''; host.style.maxHeight = '';
  $('photoCtl').hidden = true; $('photoFile').value = '';
});

// ---------------- dimensions ----------------
let dimsBase = null;
function buildDims() {
  dimsBase = state.data.meta.measures;
}

// legend swatches from the photo-sampled colours in the data
const WINDOW_SHAPES = { round: '圓拱窗', segment: '弧頂窗', rect: '長方窗' };
const shortLabel = (s) => (s || '').replace(/（.*）$/, '');
function buildLegend() {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const row = (bg, text, extra = '') => `<div><span class="sw" style="background:${bg}${extra}"></span>${esc(text)}</div>`;
  const walls = Object.values(state.data.wallColors || {});
  $('legendWalls').innerHTML = walls.map((c) => row(c.hex, c.label, c.trim ? `;box-shadow:inset 0 -4px 0 ${c.trim}` : '')).join('');
  // generic colours: swatch with the window grid drawn on top
  $('legendGeneric').innerHTML = (state.data.genericWalls || []).map((c) => row(`linear-gradient(#3b3f42,#3b3f42) 50% 55% / 40% 45% no-repeat,${c.hex}`, c.label.replace('通用：', ''))).join('');
  $('legendRoofs').innerHTML = Object.values(state.data.roofPalette || {}).map((c) => row(c.hex, c.label)).join('');
  const wins = Object.entries(state.data.windowColors || {}).map(([k, c]) => (k.startsWith('shutter')
    ? row(`repeating-linear-gradient(180deg,${c.hex} 0 2px,color-mix(in srgb,${c.hex} 70%,#000) 2px 3px)`, c.label)
    : row(c.frame ? `linear-gradient(90deg,${c.frame} 0 2px,${c.hex} 2px 6px,${c.frame} 6px 7px,${c.hex} 7px 11px,${c.frame} 11px)` : c.hex, c.label)));
  wins.push(row('#f3f0e8', '白色帆布篷（商務旅遊中心一排向廣場的窗）'));
  $('legendWindows').innerHTML = wins.join('');
}
function updateDims() {
  if (!dimsBase) return;
  const s = state.scale;
  const f = (v) => `${(v * s).toFixed(1)} m`;
  const rows = [
    ['新馬路口闊度', f(dimsBase.mouthWidth)],
    ['最窄處（地磚範圍）', f(dimsBase.narrowPaving)],
    ['最窄處（牆面之間）', f(dimsBase.narrowFacades)],
    ['廣場長度（口至窄段盡頭）', f(dimsBase.length)],
    ['口至玫瑰堂門前', f(dimsBase.toChurch)],
    ['OSM 廣場面積', `${Math.round(dimsBase.area * s * s).toLocaleString()} m²`],
    ['步行穿越 1.5 m/s', `${Math.round((dimsBase.toChurch * s) / WALK)} 秒`],
    ['跑步穿越 6 m/s', `${((dimsBase.toChurch * s) / RUN).toFixed(1)} 秒`],
  ];
  $('dims').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

// ---------------- minimap ----------------
$('mmImg').addEventListener('error', () => {
  $('minimap').hidden = true;
  document.querySelector('.mm-note').textContent = '未有衛星參考圖。執行 python3 senado/scripts/fetch_imagery.py 取得（只作對位參考，不入 git）。';
});
const MM = { x0: -110, y1: 150, mpp: 0.25 };
const mmPx = (x, y) => [(x - MM.x0) / MM.mpp, (MM.y1 - y) / MM.mpp];
function buildMinimap() {
  const svg = $('mmSvg');
  const ns = 'http://www.w3.org/2000/svg';
  for (const p of PRESETS) {
    if (!p.eye && !p.tps) continue;
    const [x, y] = p.tps ? p.fig : p.pos;
    const [tx, ty] = p.tps ? [p.fig[0] + Math.cos(THREE.MathUtils.degToRad(p.heading)) * 30, p.fig[1] + Math.sin(THREE.MathUtils.degToRad(p.heading)) * 30] : p.tgt;
    const [px, py] = mmPx(x, y);
    const ang = Math.atan2(-(ty - y), tx - x);
    const g = document.createElementNS(ns, 'g');
    g.style.cursor = 'pointer';
    g.innerHTML = `<line x1="${px}" y1="${py}" x2="${px + Math.cos(ang) * 70}" y2="${py + Math.sin(ang) * 70}" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"/>
      <circle cx="${px}" cy="${py}" r="17" fill="#1f4f93" stroke="#fff" stroke-width="4"/>
      <text x="${px}" y="${py + 7}" text-anchor="middle" font-size="20" font-family="IBM Plex Mono, monospace" font-weight="600" fill="#fff">${p.key}</text>
      <title>${p.label}</title>`;
    g.addEventListener('click', () => setPreset(p.id));
    svg.append(g);
  }
  const cam = document.createElementNS(ns, 'g');
  cam.id = 'mmCam';
  cam.innerHTML = '<path d="M0,0 L-60,-32 A68,68 0 0,1 -60,32 Z" fill="#ff6a2a" opacity=".35" transform="scale(-1,1)"/><circle r="11" fill="#ff6a2a" stroke="#fff" stroke-width="4"/>';
  svg.append(cam);
}
function updateMinimap() {
  const cam = $('mmCam');
  if (!cam) return;
  const s = state.scale;
  const x = camera.position.x / s, y = -camera.position.z / s;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const [px, py] = mmPx(x, y);
  const ang = THREE.MathUtils.radToDeg(Math.atan2(dir.z, dir.x));
  const inside = px > -40 && px < 920 && py > -40 && py < 1040;
  cam.setAttribute('visibility', inside ? 'visible' : 'hidden');
  cam.setAttribute('transform', `translate(${px},${py}) rotate(${ang})`);
}

// ---------------- scale bar ----------------
function updateScaleBar() {
  // metres per pixel at the orbit target distance
  const dist = state.walk ? 12 : camera.position.distanceTo(controls.target);
  const h = renderer.domElement.clientHeight || 1;
  const mpp = (2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / h / state.scale;
  const nice = [1, 2, 5, 10, 20, 50, 100, 200];
  const m = nice.find((n) => n / mpp > 50) || 200;
  $('sbRule').style.width = `${Math.round(m / mpp)}px`;
  $('sbLabel').textContent = `${m} m${state.walk ? '（12 米外）' : ''}`;
}

// ---------------- loop ----------------
const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 0.9);
    const k = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, k);
    controls.target.lerpVectors(tween.from.tgt, tween.to.tgt, k);
    camera.fov = THREE.MathUtils.lerp(tween.from.fov, tween.to.fov, k);
    camera.updateProjectionMatrix();
    if (tween.t >= 1) tween = null;
  }
  if (state.walk) {
    const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN : WALK) * dt;
    const f = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    if (keys.has('KeyW') || keys.has('ArrowUp')) camera.position.addScaledVector(f, sp);
    if (keys.has('KeyS') || keys.has('ArrowDown')) camera.position.addScaledVector(f, -sp);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) camera.position.addScaledVector(r, -sp);
    if (keys.has('KeyD') || keys.has('ArrowRight')) camera.position.addScaledVector(r, sp);
    camera.position.y = EYE;
    const look = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(camera.position.clone().add(look));
  } else {
    controls.update();
  }
  updateMinimap();
  updateScaleBar();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  declutter();
}

// Hide labels that collide with a nearer one.
function declutter() {
  const placed = [];
  const items = labelObjs
    .filter((o) => o.visible && o.element.style.display !== 'none')
    .map((o) => ({ o, d: o.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position) }))
    .sort((a, b) => a.d - b.d);
  for (const { o } of items) {
    const r = o.element.getBoundingClientRect();
    const hit = placed.some((q) => r.left < q.right + 4 && r.right > q.left - 4 && r.top < q.bottom + 2 && r.bottom > q.top - 2);
    o.element.style.visibility = hit ? 'hidden' : 'visible';
    if (!hit) placed.push(r);
  }
}

function resize() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(host);

init().catch((err) => {
  console.error(err);
  $('loading').textContent = `載入失敗：${err.message}。請確認以本機伺服器開啟（npm run senado:serve）。`;
});
