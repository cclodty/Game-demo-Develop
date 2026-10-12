/**
 * 以 Web Audio 即時合成的暫用音效（不需要外部音檔，沒有授權問題）。
 * 子彈時間內整體加上低通濾波並降低音高，聽起來也「變慢」。
 * 瀏覽器規定須在玩家點擊後才能播放聲音，所以在「開始測試」按鈕時初始化。
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.7;
  private muted = false;
  private slow = 0;

  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.master = ctx.createGain();
    this.applyVolume();
    this.filter.connect(this.master).connect(ctx.destination);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(v: number, muted: boolean): void {
    this.volume = v;
    this.muted = muted;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume * 0.6;
  }

  /** 子彈時間強度 0..1。 */
  setSlowmo(s: number): void {
    this.slow = s;
    if (this.filter && this.ctx) {
      this.filter.frequency.setTargetAtTime(18000 - s * 16800, this.ctx.currentTime, 0.05);
    }
  }

  private get rate(): number {
    return 1 - this.slow * 0.45;
  }

  private noiseBurst(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', at = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.filter) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = this.rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq * this.rate;
    f.Q.value = q;
    const g = ctx.createGain();
    const d = dur / this.rate;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    src.connect(f).connect(g).connect(this.filter);
    src.start(t, Math.random() * 0.5);
    src.stop(t + d + 0.02);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, at = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.filter) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    const d = dur / this.rate;
    o.frequency.setValueAtTime(f0 * this.rate, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * this.rate), t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(this.filter);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  shot(): void {
    this.noiseBurst(0.12, 1800, 0.7, 0.55);
    this.noiseBurst(0.22, 500, 0.6, 0.45, 'lowpass');
    this.tone('triangle', 160, 45, 0.12, 0.5);
  }

  empty(): void {
    this.tone('square', 1400, 900, 0.03, 0.12);
  }

  reload(): void {
    this.noiseBurst(0.04, 3000, 4, 0.25);
    this.noiseBurst(0.05, 2200, 5, 0.3, 'bandpass', 0.55);
    this.tone('square', 700, 500, 0.03, 0.08, 0.6);
  }

  reloadDone(): void {
    this.noiseBurst(0.05, 2600, 6, 0.3);
  }

  hitFlesh(): void {
    this.noiseBurst(0.09, 380, 1.2, 0.5, 'lowpass');
    this.tone('sine', 140, 60, 0.08, 0.3);
  }

  hitWall(): void {
    this.noiseBurst(0.05, 4200, 3, 0.18);
  }

  kill(): void {
    this.noiseBurst(0.25, 260, 0.8, 0.45, 'lowpass');
    this.tone('sawtooth', 120, 50, 0.3, 0.12);
  }

  groan(): void {
    const ctx = this.ctx;
    if (!ctx || !this.filter) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const base = (70 + Math.random() * 30) * this.rate;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 0.75, t + 0.9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f).connect(g).connect(this.filter);
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.05);
    lfo.stop(t + 1.05);
  }

  hurt(): void {
    this.tone('sine', 220, 70, 0.22, 0.5);
    this.noiseBurst(0.15, 300, 1, 0.4, 'lowpass');
  }

  swipe(): void {
    this.noiseBurst(0.16, 900, 1.5, 0.2);
  }

  btOn(): void {
    this.tone('sine', 520, 90, 0.5, 0.35);
    this.noiseBurst(0.45, 700, 0.8, 0.25, 'lowpass');
  }

  btOff(): void {
    this.tone('sine', 110, 420, 0.25, 0.22);
  }

  denied(): void {
    this.tone('square', 220, 200, 0.08, 0.1);
    this.tone('square', 180, 160, 0.08, 0.1, 0.09);
  }

  pickup(): void {
    this.tone('triangle', 660, 990, 0.08, 0.2);
    this.tone('triangle', 990, 1320, 0.1, 0.18, 0.07);
  }
}
