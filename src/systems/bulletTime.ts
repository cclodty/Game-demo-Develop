import { TUNING } from '../config';

export interface BulletTimeConfig {
  max: number;
  drainPerSec: number;
  regenPerSec: number;
  minToActivate: number;
  timeScale: number;
  blendSpeed: number;
}

export type BulletTimeEvent = 'activated' | 'deactivated' | 'depleted' | 'denied' | null;

/**
 * 有限度的子彈時間（能量槽方案，暫定）。
 * - 開啟時以「現實時間」持續消耗；耗盡自動結束。
 * - 關閉且遊戲進行中才回復；回復到最低啟動量就能再開，不必等回滿。
 * - scale 是實際套用到遊戲的速度倍率；畫面效果用 visual（平滑過渡）。
 */
export class BulletTime {
  energy: number;
  active = false;
  /** 實際的遊戲速度倍率。 */
  scale = 1;
  /** 0..1 的畫面效果強度（平滑過渡）。 */
  visual = 0;
  activations = 0;
  /** 耗盡或能量不足後，需先放開按鍵才會再次啟動（避免按住不放時反覆開關）。 */
  private needRelease = false;

  constructor(private readonly cfg: BulletTimeConfig = TUNING.bulletTime) {
    this.energy = cfg.max;
  }

  canActivate(): boolean {
    return this.energy >= this.cfg.minToActivate;
  }

  /**
   * want：玩家此刻是否想要子彈時間（按住模式＝按鍵是否按下；切換模式由呼叫端維護）。
   * running：遊戲是否在進行（暫停、倒下時為 false）。
   */
  update(realDt: number, want: boolean, running: boolean): BulletTimeEvent {
    let event: BulletTimeEvent = null;
    if (!want) this.needRelease = false;
    if (!running) {
      if (this.active) {
        this.active = false;
        event = 'deactivated';
      }
    } else if (want && !this.active && !this.needRelease) {
      if (this.canActivate()) {
        this.active = true;
        this.activations++;
        event = 'activated';
      } else {
        event = 'denied';
        this.needRelease = true;
      }
    } else if (!want && this.active) {
      this.active = false;
      event = 'deactivated';
    }

    if (this.active) {
      this.energy -= this.cfg.drainPerSec * realDt;
      if (this.energy <= 0) {
        this.energy = 0;
        this.active = false;
        this.needRelease = true;
        event = 'depleted';
      }
    } else if (running) {
      this.energy = Math.min(this.cfg.max, this.energy + this.cfg.regenPerSec * realDt);
    }

    this.scale = this.active ? this.cfg.timeScale : 1;
    const target = this.active ? 1 : 0;
    this.visual += (target - this.visual) * (1 - Math.exp(-this.cfg.blendSpeed * realDt));
    if (Math.abs(this.visual - target) < 0.002) this.visual = target;
    return event;
  }

  /** 立即回到正常速度（重設、失敗時使用）。 */
  reset(): void {
    this.energy = this.cfg.max;
    this.active = false;
    this.needRelease = false;
    this.scale = 1;
    this.visual = 0;
  }

  forceOff(): void {
    this.active = false;
    this.scale = 1;
  }
}
