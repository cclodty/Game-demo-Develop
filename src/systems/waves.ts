import { TUNING } from '../config';

export type WaveEvent = { type: 'waveStart'; wave: number } | { type: 'spawn' } | { type: 'waveClear'; wave: number } | null;

/** 測試用的喪屍波次：每波數量遞增，同時在場有上限。 */
export class WaveDirector {
  wave = 0;
  private toSpawn = 0;
  private timer = 2.5;
  private phase: 'break' | 'spawning' | 'fighting' = 'break';
  kills = 0;

  reset(): void {
    this.wave = 0;
    this.toSpawn = 0;
    this.timer = 2.5;
    this.phase = 'break';
    this.kills = 0;
  }

  get breakRemaining(): number {
    return this.phase === 'break' ? Math.max(0, this.timer) : 0;
  }

  update(dt: number, alive: number, enabled: boolean): WaveEvent {
    const W = TUNING.waves;
    if (!enabled) return null;
    this.timer -= dt;
    switch (this.phase) {
      case 'break':
        if (this.timer <= 0) {
          this.wave++;
          this.toSpawn = W.first + (this.wave - 1) * W.growth;
          this.phase = 'spawning';
          this.timer = 0.2;
          return { type: 'waveStart', wave: this.wave };
        }
        return null;
      case 'spawning':
        if (this.toSpawn <= 0) {
          this.phase = 'fighting';
          return null;
        }
        if (this.timer <= 0 && alive < W.maxAlive) {
          this.toSpawn--;
          this.timer = W.spawnInterval;
          return { type: 'spawn' };
        }
        return null;
      case 'fighting':
        if (alive === 0) {
          this.phase = 'break';
          this.timer = W.breakTime;
          return { type: 'waveClear', wave: this.wave };
        }
        return null;
    }
  }
}
