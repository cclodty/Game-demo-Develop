// Playtest notes for the developer. Claude cannot feel the game, so feel
// feedback has to come back with the numbers attached: a ring of recent
// gameplay events, a live stats and tuning panel (Backquote), and "this
// moment" notes (N) that export as Markdown from the pause menu. Nothing here
// changes gameplay on its own; only the tuning rows do, and the HUD says so.

import { CAMERA, FOCUS, LOGIC_HZ, PLAYER, STYLE, VIEWS } from './config.js';
import { QUALITIES, readQuality, saveQuality } from './quality.js';
import { SWITCHES } from './style.js';

const NOTES_KEY = 'bullet-ballet.notes';
const TUNE_KEY = 'bullet-ballet.tune';
const PANEL_KEY = 'bullet-ballet.panel';
const FPS_KEY = 'bullet-ballet.fps';
const MAX_EVENTS = 40;
const EVENTS_PER_NOTE = 10;

const ROOTS = { FOCUS, PLAYER, CAMERA, STYLE };

/** Feel numbers the panel exposes for live tuning. Paths point into config.js. */
export const TUNABLES = [
  { path: 'FOCUS.worldScale', label: '慢鏡：世界速度', step: 0.01, min: 0.05, max: 1 },
  { path: 'FOCUS.playerScale', label: '慢鏡：玩家速度', step: 0.01, min: 0.05, max: 1 },
  { path: 'FOCUS.drain', label: '焦點消耗 / 秒', step: 0.005, min: 0, max: 1 },
  { path: 'FOCUS.regen', label: '焦點回復 / 秒', step: 0.001, min: 0, max: 0.2 },
  { path: 'FOCUS.killRefill', label: '擊殺回復焦點', step: 0.01, min: 0, max: 1 },
  { path: 'PLAYER.speed', label: '移動速度 m/s', step: 0.1, min: 2, max: 14 },
  { path: 'PLAYER.spinDuration', label: '旋轉閃避時長 s', step: 0.02, min: 0.1, max: 1.5 },
  { path: 'PLAYER.spinCooldown', label: '旋轉閃避冷卻 s', step: 0.02, min: 0, max: 2 },
  { path: 'PLAYER.spinFireMul', label: '旋轉射擊射速倍率', step: 0.05, min: 0.2, max: 1.5 },
  { path: 'PLAYER.slideDuration', label: '滑鏟時長 s', step: 0.05, min: 0.2, max: 1.5 },
  { path: 'PLAYER.slideSpeedMul', label: '滑鏟速度倍率', step: 0.1, min: 1, max: 3 },
  { path: 'PLAYER.throwRange', label: '擲出距離 m', step: 0.5, min: 2, max: 16 },
  { path: 'STYLE.stepHz', label: '頓格：每秒格數', step: 1, min: 4, max: 30 },
  { path: 'STYLE.ghostLife', label: '殘影消散 s', step: 0.05, min: 0.1, max: 1 },
  { path: 'STYLE.ghostAlpha', label: '殘影亮度', step: 0.02, min: 0.05, max: 0.8 },
  { path: 'PLAYER.regenDelay', label: '回血延遲 s', step: 0.1, min: 0, max: 10 },
  { path: 'PLAYER.regenRate', label: '回血速度 / 秒', step: 1, min: 0, max: 100 },
  { path: 'CAMERA.focusZoom', label: '慢鏡鏡頭拉近', step: 0.01, min: 0.5, max: 1.2 },
];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const mmss = (t) => `${pad(Math.floor(t / 60))}:${pad(Math.floor(t % 60))}`;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const load = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};
const resolve = (path) => {
  const [root, key] = path.split('.');
  return { obj: ROOTS[root], key };
};
const eventItems = (events) => events.map((e) => `<li><span>${mmss(e.t)}</span>${esc(e.text)}</li>`).join('');
const gpuName = (renderer) => {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || 'unknown');
  } catch {
    return 'unknown';
  }
};

export class Notes {
  constructor(game) {
    this.game = game;
    this.events = [];
    this.runT = 0;
    this.list = load(NOTES_KEY, []);
    if (!Array.isArray(this.list)) this.list = [];
    // config.js values before any stored tuning is applied
    this.defaults = Object.fromEntries(TUNABLES.map((t) => [t.path, this.value(t.path)]));
    this.perf = { fps: 0, ms: 0, worst: 0 };
    this.acc = { t: 0, n: 0, worst: 0 };
    this.run = { frames: 0, time: 0, below50: 0, below30: 0, worst: 0 }; // the whole run, playing frames only
    this.win = { t: 0, n: 0 }; // one-second window for the frame-drop event
    this.lastDrop = -10;
    this.gpu = gpuName(game.renderer);
    this.quality = readQuality();
    this.refreshT = 0;
    this.dirty = true;
    this.noteFrom = null;
    this.draft = null;
    this.el = {
      panel: $('debug'),
      tuned: $('tuned'),
      box: $('note-box'),
      context: $('note-context'),
      events: $('note-events'),
      text: $('note-text'),
      clear: $('notes-clear'),
      msg: $('notes-msg'),
      fps: $('fps'),
    };
    this.buildPanel();
    this.setFpsBadge(load(FPS_KEY, false) === true || new URLSearchParams(location.search).get('fps') === '1');
    const tune = load(TUNE_KEY, {});
    for (const [path, v] of Object.entries(tune)) if (path in this.defaults && Number.isFinite(v)) this.apply(path, v);
    this.renderTuning();
    this.setPanel(load(PANEL_KEY, false) === true);
    this.bindNoteBox();
    this.renderCounts();
  }

  // ------------------------------------------------------------ events

  /** Remember a gameplay event (what hit you, what you killed, focus on/off ...). */
  log(text) {
    this.events.push({ t: this.runT, wave: this.game.waves.wave, text });
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
    this.dirty = true;
  }

  /** A new run: forget the old events and start the run clock. */
  reset(map) {
    this.events.length = 0;
    this.runT = 0;
    this.run = { frames: 0, time: 0, below50: 0, below30: 0, worst: 0 };
    this.win.t = this.win.n = 0;
    this.lastDrop = -10;
    this.hideNote();
    this.log(`開局：${map.name}（鏡頭 ${VIEWS[this.game.view].name}）`);
  }

  /** Called every frame with the capped game step and the raw wall-clock step. */
  update(realDt, rawDt) {
    const a = this.acc;
    a.t += rawDt;
    a.n++;
    a.worst = Math.max(a.worst, rawDt);
    if (a.t >= 0.5) {
      this.perf = { fps: Math.round(a.n / a.t), ms: Math.round((a.t / a.n) * 1000), worst: Math.round(a.worst * 1000) };
      a.t = a.n = a.worst = 0;
    }
    const s = this.game.state;
    if (s === 'playing' || s === 'dying') {
      this.runT += realDt;
      const r = this.run;
      r.frames++;
      r.time += rawDt;
      if (rawDt > 1 / 50) r.below50 += rawDt;
      if (rawDt > 1 / 30) r.below30 += rawDt;
      r.worst = Math.max(r.worst, rawDt);
      const w = this.win;
      w.t += rawDt;
      w.n++;
      if (w.t >= 1) {
        const fps = w.n / w.t;
        if (fps < 45 && this.runT - this.lastDrop > 5) {
          this.lastDrop = this.runT;
          this.log(`掉幀：一秒平均 ${Math.round(fps)} fps（最差一格 ${Math.round(a.worst * 1000) || this.perf.worst} ms）`);
        }
        w.t = w.n = 0;
      }
    }
    if (this.el.fps && !this.el.fps.classList.contains('hidden') && this.fpsT !== this.perf) {
      this.fpsT = this.perf;
      this.el.fps.textContent = `${this.perf.fps} fps · ${this.perf.ms} ms`;
      this.el.fps.classList.toggle('low', this.perf.fps > 0 && this.perf.fps < 50);
    }
    if (!this.visible) return;
    this.refreshT -= rawDt;
    if (this.refreshT > 0) return;
    this.refreshT = 0.2;
    this.renderStats();
  }

  // ------------------------------------------------------------ panel

  get visible() {
    return !this.el.panel.classList.contains('hidden');
  }

  setPanel(on) {
    this.el.panel.classList.toggle('hidden', !on);
    save(PANEL_KEY, on);
    if (on) {
      this.dirty = true;
      this.renderStats();
    }
  }

  togglePanel() {
    this.setPanel(!this.visible);
  }

  buildPanel() {
    const p = this.el.panel;
    p.innerHTML =
      '<div class="dbg-head">數據面板 <span>` 關閉 · N 記下這一刻</span></div>' +
      '<pre id="dbg-stats"></pre>' +
      '<div class="dbg-opts"><label><input type="checkbox" id="dbg-fps" /> 常駐 FPS 角標</label><label>畫質 <select id="dbg-quality"><option value="high">高</option><option value="low">低：無泛光、無陰影</option></select></label></div>' +
      '<div class="dbg-title">風格</div><div class="dbg-opts" id="dbg-style"></div>' +
      '<div class="dbg-title">手感數字（即時生效，會記住） <button type="button" id="dbg-reset">重設為預設</button></div>' +
      '<div id="dbg-tune"></div>' +
      '<div class="dbg-title">最近事件</div>' +
      '<ol id="dbg-events"></ol>';
    const tune = $('dbg-tune');
    for (const t of TUNABLES) {
      const row = document.createElement('label');
      row.className = 'dbg-row';
      row.innerHTML = `<span>${t.label}<small>${t.path}</small></span><input type="number" step="${t.step}" min="${t.min}" max="${t.max}" data-path="${t.path}" /><em></em>`;
      tune.appendChild(row);
    }
    tune.addEventListener('change', (e) => {
      const inp = e.target;
      if (!inp.dataset.path) return;
      const v = Number(inp.value);
      if (Number.isFinite(v)) this.tune(inp.dataset.path, v);
      else this.renderTuning();
    });
    $('dbg-reset').addEventListener('click', () => this.resetTuning());
    $('dbg-fps').addEventListener('change', (e) => {
      this.setFpsBadge(e.target.checked);
      e.target.blur(); // so the game's keys work again straight away
    });
    const sel = $('dbg-quality');
    sel.value = this.quality;
    sel.addEventListener('change', () => this.setQuality(sel.value));
    const styleBox = $('dbg-style');
    for (const [key, text] of Object.entries(SWITCHES)) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = !!this.game.style.on[key];
      box.addEventListener('change', () => {
        this.game.style.set(key, box.checked);
        box.blur();
        if (key === 'toon') location.reload();
      });
      label.append(box, ` ${text}`);
      styleBox.appendChild(label);
    }
    for (const ev of ['click', 'mousedown', 'mouseup', 'wheel']) p.addEventListener(ev, (e) => e.stopPropagation());
  }

  /** A small always-on fps readout in the corner (also ?fps=1). */
  setFpsBadge(on) {
    this.el.fps.classList.toggle('hidden', !on);
    $('dbg-fps').checked = on;
    save(FPS_KEY, on);
    this.fpsT = this.perf;
    this.el.fps.textContent = `${this.perf.fps} fps · ${this.perf.ms} ms`;
  }

  /** 'high' or 'low'; takes effect on reload, which this triggers. */
  setQuality(q) {
    if (!QUALITIES.includes(q) || q === this.quality) return;
    saveQuality(q);
    this.quality = q;
    location.reload();
  }

  /** The run's frame-time record in one line, for the export. */
  perfLine() {
    const r = this.run;
    const avg = r.time > 0 ? Math.round(r.frames / r.time) : 0;
    const pct = r.time > 0 ? Math.round((r.below50 / r.time) * 100) : 0;
    return `平均 ${avg} fps · 低於 50 fps ${r.below50.toFixed(1)} 秒（${pct}%）· 低於 30 fps ${r.below30.toFixed(1)} 秒 · 最差一格 ${Math.round(r.worst * 1000)} ms · GPU ${this.gpu} · 畫質 ${this.quality === 'low' ? '低' : '高'}`;
  }

  renderStats() {
    const g = this.game;
    const p = g.player;
    const r = g.renderer.info.render;
    const w = g.waves;
    const ammo = p.slot === 'special' && p.special ? p.special.ammo : p.ammo;
    const spin = p.spinT > 0 ? '旋轉中' : p.spinCd > 0 ? '旋轉冷卻' : '旋轉可用';
    const lines = [
      `${this.perf.fps} fps · ${this.perf.ms} ms（最差 ${this.perf.worst}）· 三角形 ${fmt(r.triangles)} · 繪製 ${r.calls}`,
      `世界 ×${g.timeScale.toFixed(2)} · 玩家 ×${g.playerVelScale.toFixed(2)} · 慢鏡 ${g.focusActive ? '開' : '關'} ${Math.round(g.focusMeter * 100)}% · 停格 ${g.hitstopT.toFixed(2)} · 殺戮鏡頭 ${g.killcamT.toFixed(2)}`,
      `邏輯 ${LOGIC_HZ} Hz · 第 ${fmt(g.stepCount)} 步（這格 ${g.frameSteps} 步）· 輸入記錄 ${g.record.size < 1024 ? `${g.record.size} B` : `${(g.record.size / 1024).toFixed(1)} KB`}`,
      `${g.state} · ${g.level.map.name} · 第 ${w.wave} 波（${w.state}，剩 ${w.remaining}）· 敵人 ${g.enemies.aliveCount} · 子彈 ${g.bullets.list.length}`,
      `HP ${Math.max(0, Math.ceil(p.hp))} · (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) · ${p.weapon.name} ${ammo} · ${spin} · 無敵 ${p.invuln > 0 ? p.invuln.toFixed(2) : '—'}`,
      `${fmt(g.score.score)} 分 · 連擊 x${g.score.mult} · 開局後 ${mmss(this.runT)} · 鏡頭 ${VIEWS[g.view].name}`,
      `這局：${this.perfLine()}`,
    ];
    $('dbg-stats').textContent = lines.join('\n');
    if (this.dirty) {
      this.dirty = false;
      $('dbg-events').innerHTML = eventItems(this.events.slice(-8));
    }
  }

  // ------------------------------------------------------------ tuning

  value(path) {
    const { obj, key } = resolve(path);
    return obj ? obj[key] : undefined;
  }

  apply(path, v) {
    const { obj, key } = resolve(path);
    if (obj && key in obj) obj[key] = v;
  }

  /** Change a feel number live; the change is remembered across reloads until reset. */
  tune(path, v) {
    if (!(path in this.defaults)) return;
    this.apply(path, v);
    save(TUNE_KEY, Object.fromEntries(this.tuningDiff().map((d) => [d.path, d.to])));
    this.renderTuning();
  }

  resetTuning() {
    for (const path in this.defaults) this.apply(path, this.defaults[path]);
    save(TUNE_KEY, {});
    this.renderTuning();
  }

  /** Every tunable that differs from config.js, as { path, from, to }. */
  tuningDiff() {
    return TUNABLES.filter((t) => this.value(t.path) !== this.defaults[t.path]).map((t) => ({ path: t.path, from: this.defaults[t.path], to: this.value(t.path) }));
  }

  renderTuning() {
    for (const inp of this.el.panel.querySelectorAll('input[data-path]')) {
      const path = inp.dataset.path;
      const v = this.value(path);
      const changed = v !== this.defaults[path];
      if (document.activeElement !== inp) inp.value = String(v);
      inp.parentElement.classList.toggle('changed', changed);
      inp.parentElement.querySelector('em').textContent = changed ? `預設 ${this.defaults[path]}` : '';
    }
    const n = this.tuningDiff().length;
    this.el.tuned.classList.toggle('hidden', n === 0);
    this.el.tuned.textContent = n ? `手感數字已調整 ×${n} · \` 查看` : '';
  }

  // ------------------------------------------------------------ notes

  get noteOpen() {
    return !this.el.box.classList.contains('hidden');
  }

  context() {
    const g = this.game;
    const p = g.player;
    const m = g.level.map;
    return {
      at: new Date().toISOString(),
      map: m.name,
      mapId: m.id,
      stage: g.stage + 1,
      wave: g.waves.wave,
      runT: this.runT,
      hp: Math.max(0, Math.ceil(p.hp)),
      score: Math.round(g.score.score),
      focusOn: g.focusActive,
      focus: Math.round(g.focusMeter * 100),
      weapon: p.weapon.name,
      view: VIEWS[g.view].name,
      fps: this.perf.fps,
      perf: this.perfLine(),
      events: this.events.slice(-EVENTS_PER_NOTE).map((e) => ({ t: e.t, text: e.text })),
    };
  }

  contextLine(c) {
    return `${c.map} · 第 ${c.wave} 波 · 開局後 ${mmss(c.runT)} · HP ${c.hp} · ${fmt(c.score)} 分 · 慢鏡 ${c.focusOn ? '開' : '關'} ${c.focus}% · ${c.weapon} · 鏡頭 ${c.view} · ${c.fps} fps`;
  }

  /** N: pause if playing and open the note box with this moment's context. */
  openNote() {
    const g = this.game;
    if (g.state !== 'playing' && g.state !== 'paused') return;
    this.noteFrom = g.state;
    if (g.state === 'playing') g.setPaused(true);
    this.draft = this.context();
    this.el.context.textContent = this.contextLine(this.draft);
    this.el.events.innerHTML = eventItems(this.draft.events) || '<li>（還沒有事件）</li>';
    this.el.text.value = '';
    this.el.box.classList.remove('hidden');
    this.el.msg.textContent = '';
    this.el.text.focus();
  }

  /** Enter: keep the note and go back to where N was pressed from. */
  saveNote() {
    const text = this.el.text.value.trim();
    if (!text) {
      this.el.text.focus();
      return false;
    }
    this.list.push({ ...this.draft, text, tuning: this.tuningDiff() });
    save(NOTES_KEY, this.list);
    this.closeNote();
    this.renderCounts();
    this.game.hud.toast(`已記錄回饋 #${this.list.length} <small>暫停選單可匯出</small>`);
    return true;
  }

  cancelNote() {
    this.closeNote();
  }

  closeNote() {
    const from = this.noteFrom;
    this.hideNote();
    if (from === 'playing' && this.game.state === 'paused') this.game.setPaused(false);
  }

  /** Hide the box without touching the pause state (used when the run ends). */
  hideNote() {
    this.el.box.classList.add('hidden');
    this.el.text.blur();
    this.noteFrom = null;
  }

  bindNoteBox() {
    const box = this.el.box;
    for (const ev of ['click', 'mousedown', 'mouseup']) box.addEventListener(ev, (e) => e.stopPropagation());
    this.el.text.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing must not reach the game's key handlers
      if (e.code === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.saveNote();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        this.cancelNote();
      }
    });
    box.querySelector('[data-act=save]').addEventListener('click', () => this.saveNote());
    box.querySelector('[data-act=cancel]').addEventListener('click', () => this.cancelNote());
    const clear = this.el.clear;
    clear.addEventListener('click', (e) => {
      e.stopPropagation();
      if (clear.dataset.armed) {
        this.clear();
        return;
      }
      clear.dataset.armed = '1';
      clear.textContent = '再按一次確認清除';
      setTimeout(() => this.renderCounts(), 3000);
    });
  }

  renderCounts() {
    const n = this.list.length;
    for (const el of document.querySelectorAll('.notes-count')) el.textContent = n ? `${n} 條` : '';
    const clear = this.el.clear;
    delete clear.dataset.armed;
    clear.textContent = '清除已記錄的回饋';
    clear.classList.toggle('hidden', n === 0);
  }

  clear() {
    this.list = [];
    save(NOTES_KEY, []);
    this.renderCounts();
    this.el.msg.textContent = '已清除。';
  }

  // ------------------------------------------------------------ export

  /** The notes as Markdown, ready to paste into a conversation. */
  exportText() {
    const g = this.game;
    const d = new Date();
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const diffLine = (diff) => diff.map((x) => `${x.path} ${x.from} → ${x.to}`).join('；');
    const diff = this.tuningDiff();
    const out = [
      '# Bullet Ballet 試玩回饋',
      '',
      `- 匯出：${stamp}`,
      `- 瀏覽器：${navigator.userAgent}`,
      `- 視窗：${innerWidth}×${innerHeight} @${devicePixelRatio}x · 鏡頭 ${VIEWS[g.view].name}`,
      `- 效能（這局到此刻）：${this.perfLine()}`,
      `- 風格：${Object.entries(SWITCHES).map(([k, l]) => `${l.replace(/（.*$/, '')} ${g.style.on[k] ? '開' : '關'}`).join('、')}`,
      `- 調整過的手感數字：${diff.length ? diffLine(diff) : '無（全部預設）'}`,
      '',
    ];
    this.list.forEach((n, i) => {
      out.push(`## ${i + 1} · ${n.map} · 第 ${n.wave} 波 · ${mmss(n.runT)}`, '', `> ${n.text.replace(/\n/g, '\n> ')}`, '', `- 當時：${this.contextLine(n)}`);
      if (n.tuning && n.tuning.length) out.push(`- 當時的調整：${diffLine(n.tuning)}`);
      if (n.perf) out.push(`- 效能到那時：${n.perf}`);
      out.push(`- 記錄於 ${n.at}`, `- 之前 ${n.events.length} 件事：`);
      for (const e of n.events) out.push(`  - ${mmss(e.t)} ${e.text}`);
      out.push('');
    });
    if (!this.list.length) out.push('（沒有記錄。遊戲中按 N 記下這一刻。）', '');
    return out.join('\n');
  }

  /** Download the Markdown (and copy it to the clipboard when allowed). */
  download() {
    const text = this.exportText();
    const d = new Date();
    const name = `bullet-ballet-feedback-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.md`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).catch(() => {});
    this.el.msg.textContent = `已下載 ${name}（${this.list.length} 條，也複製到剪貼簿）— 貼給 Claude 就可以。`;
    return name;
  }
}
