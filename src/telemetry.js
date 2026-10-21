// Local play records (本機事件記錄). Every run leaves a short record in this
// browser: how it started (map, mode, rules, camera view), each wave cleared
// (and the shots fired in it), how it ended (the wave and the cause of death,
// a clear, or a quit), how long it took, and whether the player went again.
// Nothing leaves the machine; the feedback export (notes.js) carries the
// records along. The first visit shows a switch on the title screen, on
// unless turned off; the stats panel keeps it. It only watches: the game never reads it back.
// Alongside, the days played (UTC, as the daily challenge counts them): the
// first one and the runs and daily challenges of each, for the export's
// "coming back" lines (回訪統計).

import { utcDay } from './daily.js';

const DAY_MS = 86400000;
const DAYS_KEY = 'bullet-ballet.telemetry.days'; // { first: 'YYYY-MM-DD', days: { 'YYYY-MM-DD': { runs, daily } } }
const PREF_KEY = 'bullet-ballet.telemetry'; // 'on' | 'off'; unset until the first visit's switch has been seen
const LOG_KEY = 'bullet-ballet.telemetry.runs';
const MAX_RUNS = 60; // the oldest go first
const MAX_EVENTS = 200; // per run: keeps a record far under 20 KB

const pad = (n) => String(n).padStart(2, '0');
const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;

export class Telemetry {
  /** `storage`: localStorage, or a stand-in (tests); `now`: wall-clock ms (records only, never the game). */
  constructor(storage = globalThis.localStorage, now = () => Date.now()) {
    this.storage = storage;
    this.now = now;
    this.pref = this.read(PREF_KEY);
    const runs = this.readJSON(LOG_KEY);
    this.runs = Array.isArray(runs) ? runs : [];
    this.run = null; // the run being recorded
    const days = this.readJSON(DAYS_KEY);
    this.days = days && typeof days.days === 'object' && days.days ? days : { first: null, days: {} };
  }

  read(key) {
    try {
      return this.storage ? this.storage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  readJSON(key) {
    try {
      return JSON.parse(this.read(key) || 'null');
    } catch {
      return null;
    }
  }

  write(key, value) {
    try {
      if (this.storage) this.storage.setItem(key, value);
    } catch {
      /* storage full or unavailable: the record is lost, the game goes on */
    }
  }

  /** Recording, unless the player turned it off. */
  get on() {
    return this.pref !== 'off';
  }

  /** Whether the first visit's switch has been seen (then it no longer shows on the title screen). */
  get asked() {
    return this.pref === 'on' || this.pref === 'off';
  }

  setOn(on) {
    this.pref = on ? 'on' : 'off';
    this.write(PREF_KEY, this.pref);
    if (!on) this.run = null;
  }

  /** The switch was seen and left as it was. */
  confirm() {
    if (!this.asked) this.setOn(true);
  }

  /** A run starts: { map, mode, rules, view, warmup }. A run still open (restarted from the pause menu) ends as a quit. */
  start(info, t = 0) {
    if (!this.on) return;
    if (this.run) this.end({ result: 'quit' }, t);
    const last = this.runs.at(-1);
    if (last && last.end && last.again === false) {
      last.again = true; // the player went again
      last.gap = Math.round((this.now() - last.endAt) / 1000);
    }
    this.run = { at: new Date(this.now()).toISOString(), ...info, events: [], again: false };
    // the day's count: runs, and how many of them were the daily challenge
    const day = utcDay(this.now());
    if (!this.days.first) this.days.first = day;
    const d = (this.days.days[day] ??= { runs: 0, daily: 0 });
    d.runs++;
    if (info.daily) d.daily++;
    this.write(DAYS_KEY, JSON.stringify(this.days));
    this.runs.push(this.run);
    while (this.runs.length > MAX_RUNS) this.runs.shift();
    this.save();
  }

  /** Something worth keeping at run time t (seconds): { type, ... }. */
  event(t, e) {
    if (!this.run) return;
    if (this.run.events.length >= MAX_EVENTS) return;
    this.run.events.push({ t: Math.round(t * 10) / 10, ...e });
    this.save();
  }

  /** The run is over at run time t: { result: 'death' | 'clear' | 'quit', wave, cause, score, grade }. */
  end(info, t = 0) {
    const r = this.run;
    if (!r) return;
    this.run = null;
    Object.assign(r, info, { end: info.result, seconds: Math.round(t), endAt: this.now() });
    delete r.result;
    this.save();
  }

  save() {
    if (this.on) this.write(LOG_KEY, JSON.stringify(this.runs));
  }

  /** Bytes one run takes in storage. */
  static size(run) {
    return new TextEncoder().encode(JSON.stringify(run)).length;
  }

  clear() {
    this.runs = [];
    this.run = null;
    this.write(LOG_KEY, '[]');
    this.days = { first: null, days: {} };
    this.write(DAYS_KEY, JSON.stringify(this.days));
  }

  /**
   * Coming back, from this browser's days (UTC): the first day, how many days were played, whether
   * the player came back the next day and on the seventh (null until that day has come), how many of
   * the first week's days after the first one were played, and the daily challenges played.
   */
  retention() {
    const first = this.days.first;
    if (!first) return null;
    const today = utcDay(this.now());
    const n = (day) => Math.round((Date.parse(day) - Date.parse(first)) / DAY_MS);
    const since = n(today);
    const played = Object.keys(this.days.days)
      .filter((d) => this.days.days[d].runs > 0)
      .sort();
    const on = (k) => played.some((d) => n(d) === k);
    const sum = (days, key) => days.reduce((a, d) => a + this.days.days[d][key], 0);
    return {
      first,
      today,
      since,
      days: played.length,
      d1: since >= 1 ? on(1) : null,
      d7: since >= 7 ? on(7) : null,
      week: played.filter((d) => n(d) >= 1 && n(d) <= 7).length,
      runs: sum(played, 'runs'),
      daily: sum(played, 'daily'),
      daily7: sum(
        played.filter((d) => since - n(d) < 7),
        'daily',
      ),
    };
  }

  /** The export's "coming back" lines. */
  retentionText() {
    const r = this.retention();
    const out = ['## 回訪（這部電腦，按 UTC 日）', ''];
    if (!r) return [...out, '（還沒有記錄。）', ''].join('\n');
    const yes = (v) => (v === null ? '未到' : v ? '有' : '沒有');
    out.push(
      `- 第一次玩：${r.first}（${r.since} 天前）`,
      `- 玩過的日數：${r.days} 天，共 ${r.runs} 局`,
      `- 第 1 天回來：${yes(r.d1)}`,
      `- 第 7 天回來：${yes(r.d7)}`,
      `- 第一週（第 1–7 天）回來了 ${r.week} 天`,
      `- 每日挑戰：共 ${r.daily} 局，最近 7 天 ${r.daily7} 局`,
      '',
    );
    return out.join('\n');
  }

  /** The records as Markdown for the feedback export: the coming back lines, then one table row per run, newest last. */
  text() {
    const out = [this.retentionText(), '## 事件記錄（這部電腦，最近的局）', ''];
    if (!this.on) out.push('（事件記錄已關閉。）', '');
    if (!this.runs.length) {
      out.push('（還沒有記錄。）', '');
      return out.join('\n');
    }
    out.push('| 開局 | 地圖 | 模式 | 規則 | 鏡頭 | 結果 | 波次 | 死因 | 時長 | 分數 | 再開一局 | 每波完成 |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    const result = { death: '倒下', clear: '通關', quit: '中途離開' };
    for (const r of this.runs) {
      const d = new Date(r.at);
      const at = `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const waves = r.events.filter((e) => e.type === 'wave').map((e) => `${e.n}@${mmss(e.t)}${e.hurt ? '' : '✓'}${e.shots != null ? `·${e.shots}槍` : ''}`);
      const views = [r.view, ...r.events.filter((e) => e.type === 'view').map((e) => e.view)];
      const again = r.end ? (r.again ? `是${r.gap != null ? `（${r.gap} 秒後）` : ''}` : '否') : '（進行中）';
      out.push(
        `| ${at} | ${r.map} | ${r.mode} | ${r.rules || '正常'}${r.warmup ? '，含熱身' : ''} | ${[...new Set(views)].join('→')} | ${result[r.end] || '（進行中）'} | ${r.wave ?? ''} | ${r.cause || ''} | ${r.end ? mmss(r.seconds) : ''} | ${r.score != null ? Math.round(r.score).toLocaleString('en-US') : ''}${r.grade ? `（${r.grade}）` : ''} | ${again} | ${waves.join(' ') || '—'} |`,
      );
    }
    out.push('', '每波完成：波次@用時，✓ = 那一波沒有受傷，·N槍 = 那一波開了幾槍。', '');
    return out.join('\n');
  }
}
