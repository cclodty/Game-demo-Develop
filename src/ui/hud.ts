import { DEFAULT_SETTINGS, type Settings, TUNING } from '../config';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`找不到介面元素 #${id}`);
  return el as T;
};

export interface HudFrame {
  hp: number;
  maxHp: number;
  mag: number;
  reserve: number;
  reloadProgress: number; // 0..1，未換彈為 -1
  energy: number;
  maxEnergy: number;
  minEnergy: number;
  btActive: boolean;
  wave: number;
  kills: number;
  waveNote: string;
  crosshairX: number;
  crosshairY: number;
  crosshairVisible: boolean;
  spreadPx: number;
  aimOnTarget: boolean;
}

type ToastTone = 'info' | 'warn' | 'energy';

export class Hud {
  private readonly hud = $('hud');
  private readonly hpBar = $('hp-bar');
  private readonly hpLag = $('hp-lag');
  private readonly hpText = $('hp-text');
  private readonly btBar = $('bt-bar');
  private readonly btMin = $('bt-min');
  private readonly btMeter = $('bt-meter');
  private readonly btState = $('bt-state');
  private readonly mag = $('mag');
  private readonly reserve = $('reserve');
  private readonly ammo = $('ammo');
  private readonly reloadBar = $('reload-bar');
  private readonly wave = $('wave');
  private readonly kills = $('kills');
  private readonly waveNote = $('wave-note');
  private readonly toastEl = $('toast');
  private readonly debugEl = $('debug');
  private readonly floaters = $('floaters');
  private readonly crosshair = $('crosshair');
  private readonly help = $('help');
  readonly start = $('start');
  readonly pause = $('pause');
  readonly dead = $('dead');
  private readonly deadStats = $('dead-stats');
  private readonly pixelBtn = $('btn-pixel');
  private readonly timeBtn = $('btn-time');
  private toastTimer = 0;
  private hitTimer = 0;
  private lagHp = 1;
  private lastText = new Map<HTMLElement, string>();
  private floaterList: { el: HTMLElement; x: number; y: number; z: number; t: number; life: number }[] = [];

  constructor() {
    $('weapon-name').textContent = TUNING.weapon.name;
    this.btMin.style.left = `${(TUNING.bulletTime.minToActivate / TUNING.bulletTime.max) * 100}%`;
  }

  private text(el: HTMLElement, v: string): void {
    if (this.lastText.get(el) === v) return;
    this.lastText.set(el, v);
    el.textContent = v;
  }

  showHud(v: boolean): void {
    this.hud.hidden = !v;
  }

  update(f: HudFrame, realDt: number): void {
    const hpRatio = Math.max(0, f.hp / f.maxHp);
    this.hpBar.style.transform = `scaleX(${hpRatio})`;
    this.lagHp = hpRatio > this.lagHp ? hpRatio : this.lagHp + (hpRatio - this.lagHp) * (1 - Math.exp(-3 * realDt));
    this.hpLag.style.transform = `scaleX(${this.lagHp})`;
    this.text(this.hpText, String(Math.ceil(f.hp)));

    const e = f.energy / f.maxEnergy;
    this.btBar.style.transform = `scaleX(${e})`;
    const state = f.btActive ? 'active' : f.energy >= f.minEnergy ? 'ready' : 'low';
    if (this.btMeter.dataset.state !== state) this.btMeter.dataset.state = state;
    this.text(this.btState, state === 'active' ? '啟動中' : state === 'ready' ? '可啟動' : '回復中');

    this.text(this.mag, String(f.mag));
    this.text(this.reserve, String(f.reserve));
    const low = f.mag <= Math.ceil(TUNING.weapon.magSize * 0.2);
    if (this.ammo.dataset.low !== String(low)) this.ammo.dataset.low = String(low);
    this.reloadBar.style.transform = `scaleX(${f.reloadProgress < 0 ? 0 : f.reloadProgress})`;

    this.text(this.wave, String(f.wave));
    this.text(this.kills, String(f.kills));
    this.text(this.waveNote, f.waveNote);

    this.crosshair.hidden = !f.crosshairVisible;
    this.crosshair.style.transform = `translate(${f.crosshairX}px, ${f.crosshairY}px)`;
    this.crosshair.style.setProperty('--spread', `${f.spreadPx.toFixed(1)}px`);
    const onT = String(f.aimOnTarget);
    if (this.crosshair.dataset.target !== onT) this.crosshair.dataset.target = onT;

    if (this.hitTimer > 0) {
      this.hitTimer -= realDt;
      const mark = this.crosshair.querySelector<HTMLElement>('.hitmark');
      if (mark) mark.style.opacity = String(Math.max(0, this.hitTimer / 0.18));
    }

    if (this.toastTimer > 0) {
      this.toastTimer -= realDt;
      if (this.toastTimer <= 0) this.toastEl.dataset.show = 'false';
    }
  }

  hitMarker(kill: boolean): void {
    this.hitTimer = 0.18;
    this.crosshair.dataset.hit = kill ? 'kill' : 'hit';
  }

  toast(msg: string, tone: ToastTone = 'info', seconds = 1.6): void {
    this.toastEl.textContent = msg;
    this.toastEl.dataset.tone = tone;
    this.toastEl.dataset.show = 'true';
    this.toastTimer = seconds;
  }

  flashBulletTimeDenied(): void {
    this.btMeter.dataset.flash = 'false';
    void this.btMeter.offsetWidth;
    this.btMeter.dataset.flash = 'true';
  }

  setHelpCollapsed(collapsed: boolean): void {
    this.help.dataset.collapsed = String(collapsed);
    $('help-toggle-label').textContent = collapsed ? '展開' : '收合';
  }

  setLookLabels(style: Settings['renderStyle'], time: Settings['timeOfDay']): void {
    this.pixelBtn.textContent = style === 'pixel' ? '風格：像素' : '風格：微縮';
    this.timeBtn.textContent = time === 'day' ? '白天' : '夜晚';
  }

  setBulletTimeHelp(mode: Settings['bulletTimeMode']): void {
    $('help-bt').textContent = mode === 'hold' ? '子彈時間（按住）' : '子彈時間（切換）';
  }

  setDebug(visible: boolean, text = ''): void {
    this.debugEl.hidden = !visible;
    if (visible) this.text(this.debugEl, text);
  }

  showDead(stats: string): void {
    this.deadStats.textContent = stats;
    this.dead.hidden = false;
  }

  hideDead(): void {
    this.dead.hidden = true;
  }

  /** 在世界座標上浮出的數字（傷害、拾取）。position 函式負責投影到螢幕。 */
  floater(text: string, x: number, y: number, z: number, cls = ''): void {
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.textContent = text;
    this.floaters.appendChild(el);
    this.floaterList.push({ el, x, y, z, t: 0, life: 0.8 });
    if (this.floaterList.length > 40) {
      const old = this.floaterList.shift();
      old?.el.remove();
    }
  }

  updateFloaters(realDt: number, project: (x: number, y: number, z: number) => { x: number; y: number }): void {
    for (let i = this.floaterList.length - 1; i >= 0; i--) {
      const f = this.floaterList[i];
      f.t += realDt;
      if (f.t >= f.life) {
        f.el.remove();
        this.floaterList.splice(i, 1);
        continue;
      }
      const p = project(f.x, f.y + f.t * 1.2, f.z);
      f.el.style.left = `${p.x}px`;
      f.el.style.top = `${p.y}px`;
      f.el.style.opacity = String(1 - Math.max(0, (f.t - f.life * 0.5) / (f.life * 0.5)));
    }
  }

  clearFloaters(): void {
    for (const f of this.floaterList) f.el.remove();
    this.floaterList = [];
  }
}

/** 暫停選單裡的設定表單：雙向同步，變更時回呼。 */
export function bindSettingsForm(get: () => Settings, onChange: (s: Settings) => void): () => void {
  const style = $<HTMLSelectElement>('set-style');
  const time = $<HTMLSelectElement>('set-time');
  const tiltShift = $<HTMLInputElement>('set-tilt-shift');
  const ao = $<HTMLInputElement>('set-ao');
  const outTiltShift = $('out-tilt-shift');
  const pixelSize = $<HTMLSelectElement>('set-pixel-size');
  const outline = $<HTMLInputElement>('set-outline');
  const tilt = $<HTMLInputElement>('set-tilt');
  const yaw = $<HTMLSelectElement>('set-yaw');
  const view = $<HTMLInputElement>('set-view');
  const look = $<HTMLInputElement>('set-look');
  const btMode = $<HTMLSelectElement>('set-bt-mode');
  const spawn = $<HTMLInputElement>('set-spawn');
  const debug = $<HTMLInputElement>('set-debug');
  const vol = $<HTMLInputElement>('set-vol');
  const mute = $<HTMLInputElement>('set-mute');
  const outTilt = $('out-tilt');
  const outView = $('out-view');
  const outLook = $('out-look');
  const outVol = $('out-vol');

  const refresh = () => {
    const s = get();
    style.value = s.renderStyle;
    time.value = s.timeOfDay;
    tiltShift.value = String(s.tiltShift);
    tiltShift.disabled = s.renderStyle !== 'diorama';
    outTiltShift.textContent = `${Math.round(s.tiltShift * 100)}%`;
    ao.checked = s.ao;
    pixelSize.value = String(s.pixelSize);
    pixelSize.disabled = s.renderStyle !== 'pixel';
    outline.checked = s.outlines;
    outline.disabled = s.renderStyle !== 'pixel';
    tilt.value = String(s.tiltDeg);
    yaw.value = String(s.yawDeg);
    view.value = String(s.viewHeight);
    look.value = String(s.lookAhead);
    btMode.value = s.bulletTimeMode;
    spawn.checked = s.spawning;
    debug.checked = s.showDebug;
    vol.value = String(s.volume);
    mute.checked = s.muted;
    outTilt.textContent = `${s.tiltDeg}°`;
    outView.textContent = `${s.viewHeight} m`;
    outLook.textContent = s.lookAhead.toFixed(2);
    outVol.textContent = `${Math.round(s.volume * 100)}%`;
  };

  const commit = () => {
    const s: Settings = {
      ...get(),
      renderStyle: style.value === 'pixel' ? 'pixel' : 'diorama',
      timeOfDay: time.value === 'night' ? 'night' : 'day',
      tiltShift: Number(tiltShift.value),
      ao: ao.checked,
      pixelSize: Number(pixelSize.value),
      outlines: outline.checked,
      tiltDeg: Number(tilt.value),
      yawDeg: Number(yaw.value),
      viewHeight: Number(view.value),
      lookAhead: Number(look.value),
      bulletTimeMode: btMode.value === 'toggle' ? 'toggle' : 'hold',
      spawning: spawn.checked,
      showDebug: debug.checked,
      volume: Number(vol.value),
      muted: mute.checked,
    };
    onChange(s);
    refresh();
  };

  for (const el of [style, time, tiltShift, ao, pixelSize, outline, tilt, yaw, view, look, btMode, spawn, debug, vol, mute]) {
    el.addEventListener('input', commit);
    el.addEventListener('change', commit);
  }
  $('btn-defaults').addEventListener('click', () => {
    onChange({ ...DEFAULT_SETTINGS, showHelp: get().showHelp });
    refresh();
  });
  $<HTMLFormElement>('settings').addEventListener('submit', (e) => e.preventDefault());
  refresh();
  return refresh;
}
