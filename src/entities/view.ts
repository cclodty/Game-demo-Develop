import type * as THREE from 'three';

/**
 * 角色的「外觀」介面。遊戲邏輯（Player、Zombie）只描述狀態，
 * 由外觀決定怎麼呈現：方塊暫用人形用程序動作，外部模型則播放骨架動畫。
 */

export type ViewAction = 'none' | 'windup' | 'recover' | 'dead' | 'rising';

export interface ViewState {
  /** 世界座標的移動速度。 */
  vx: number;
  vz: number;
  /** 這個角色的正常移動速度，用來換算動作播放速度。 */
  refSpeed: number;
  action: ViewAction;
  /** 目前動作已經過的遊戲秒數。 */
  actionTime: number;
  /** 目前動作的預計長度（出手前搖、起身等）。 */
  actionDuration: number;
  /** 屍體下沉的距離（公尺）。 */
  sink: number;
  /** 換彈時槍口下壓的程度 0..1。 */
  reload: number;
}

/** 槍口相對角色的位置：左右（本地 X，負值為右手）、離地高度、前方距離。 */
export interface MuzzleOffset {
  side: number;
  height: number;
  forward: number;
}

export interface CharacterView {
  /** 位置與面向由遊戲邏輯設定在 root 上。 */
  readonly root: THREE.Group;
  update(dt: number, state: ViewState): void;
  hitFlash(amount?: number, color?: THREE.ColorRepresentation): void;
  kickRecoil(): void;
  setSilhouetteVisible(v: boolean): void;
  resetPose(): void;
  dispose(): void;
  /** 槍口位置，讓子彈、雷射與畫面上的槍一致。 */
  muzzleOffset(): MuzzleOffset;
}

export function idleState(refSpeed: number): ViewState {
  return { vx: 0, vz: 0, refSpeed, action: 'none', actionTime: 0, actionDuration: 1, sink: 0, reload: 0 };
}
