/**
 * M1 操作測試場的可調參數。
 *
 * 這裡所有數值都是「暫定值」，用來試玩後調整手感；集中放在這個檔案，
 * 避免同一個數值散落在多份程式裡。改完存檔，重新整理頁面即可生效。
 */
export const TUNING = {
  player: {
    radius: 0.35, // 碰撞半徑（公尺）
    moveSpeed: 4.6, // 正常移動速度（公尺／秒）
    backpedalFactor: 0.8, // 面向與移動方向相反時的速度倍率
    strafeFactor: 0.92, // 橫移時的速度倍率
    acceleration: 30, // 加速度：越大越即時
    turnSharpness: 20, // 轉身平滑度：越大越快貼近瞄準方向（不設角度吸附）
    maxHp: 100,
    hurtInvulnerable: 0.3, // 受擊後短暫無敵（遊戲秒）
    gunSide: -0.13, // 槍在身體左右的偏移（負值＝右手）
    muzzleForward: 0.95, // 槍口離身體中心的前方距離
  },
  weapon: {
    name: '通用槍械（暫稱）',
    magSize: 30,
    reserveStart: 90,
    reserveMax: 180,
    fireRate: 9, // 每秒發射數（按住連射）
    damage: 34,
    bulletSpeed: 46, // 子彈速度（公尺／遊戲秒）；子彈時間內可看見子彈飛行
    range: 36,
    spreadDeg: 0.8, // 站立時散布
    moveSpreadDeg: 2.4, // 移動時額外散布
    bloomPerShot: 0.55, // 連射時每發增加的散布（度）
    bloomRecovery: 6, // 散布回復速度（度／秒）
    maxBloomDeg: 4,
    reloadTime: 1.5, // 換彈時間（遊戲秒）
    muzzleHeight: 1.2, // 子彈飛行高度；低於此高度的矮障礙不擋子彈
    knockback: 1.6,
  },
  bulletTime: {
    max: 100,
    drainPerSec: 28, // 開啟時每現實秒消耗
    regenPerSec: 12, // 關閉時每現實秒回復（暫停時不回復）
    minToActivate: 22, // 回復到這個量就能再次啟動，不需等回滿
    timeScale: 0.3, // 子彈時間的遊戲速度倍率
    blendSpeed: 10, // 進出子彈時間的畫面過渡速度
  },
  zombie: {
    radius: 0.38,
    hp: 100,
    speed: 2.05,
    speedVariance: 0.35,
    attackRange: 1.05, // 進入此距離開始出手
    attackReach: 1.5, // 出手瞬間仍在此距離內才算命中
    attackWindup: 0.42,
    attackCooldown: 0.95,
    damage: 13,
    repathInterval: 0.55,
    corpseTime: 7,
  },
  waves: {
    first: 4,
    growth: 2,
    maxAlive: 8,
    spawnInterval: 1.3,
    breakTime: 4,
    minSpawnDistance: 11,
  },
  pickups: {
    ammoAmount: 60,
    ammoRespawn: 18,
    medAmount: 40,
    medRespawn: 30,
    radius: 0.95,
  },
  camera: {
    followSharpness: 9,
    lookAheadMax: 3.2,
    near: 1,
    far: 90,
    distance: 40,
  },
} as const;

/** 試玩中可以在暫停選單調整、並記在瀏覽器裡的設定。 */
export interface Settings {
  pixelMode: boolean;
  pixelSize: number;
  outlines: boolean;
  tiltDeg: number;
  yawDeg: number;
  viewHeight: number;
  lookAhead: number;
  bulletTimeMode: 'hold' | 'toggle';
  spawning: boolean;
  volume: number;
  muted: boolean;
  showDebug: boolean;
  showHelp: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  pixelMode: true,
  pixelSize: 3,
  outlines: true,
  tiltDeg: 56,
  yawDeg: 0,
  viewHeight: 13,
  lookAhead: 0.18,
  bulletTimeMode: 'hold',
  spawning: true,
  volume: 0.7,
  muted: false,
  showDebug: false,
  showHelp: true,
};

export const VIEW_HEIGHT_RANGE = { min: 9, max: 26 } as const;
export const TILT_RANGE = { min: 35, max: 80 } as const;
