import * as THREE from 'three';
import { TUNING } from '../config';
import { Humanoid } from './humanoid';
import { type Box, resolveCircle } from '../world/collision';
import { dampAngle, damp, forwardOf, localXOf } from '../util/math';

const P = TUNING.player;
const W = TUNING.weapon;

export class Player {
  readonly model = new Humanoid({
    skin: 0xc29274,
    shirt: 0x3c5875,
    pants: 0x35363b,
    hair: 0x2a211c,
    shoes: 0x1c1c1e,
    backpack: 0x6b5236,
    withGun: true,
    silhouette: 0x6fd6ff,
  });
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  yaw = 0;
  hp: number = P.maxHp;
  alive = true;
  invulnerable = 0;
  mag: number = W.magSize;
  reserve: number = W.reserveStart;
  reloadTimer = 0;
  fireCooldown = 0;
  bloomDeg = 0;
  deadTime = 0;
  shotsFired = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.model.root);
  }

  reset(x: number, z: number, yaw: number): void {
    this.x = x;
    this.z = z;
    this.vx = 0;
    this.vz = 0;
    this.yaw = yaw;
    this.hp = P.maxHp;
    this.alive = true;
    this.invulnerable = 0;
    this.mag = W.magSize;
    this.reserve = W.reserveStart;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.bloomDeg = 0;
    this.deadTime = 0;
    this.shotsFired = 0;
    this.model.body.rotation.set(0, 0, 0);
    this.model.body.position.set(0, 0, 0);
    this.syncModel();
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  /** 槍口的世界座標（由面向計算，與模型上的槍口位置一致）。 */
  muzzle(): { x: number; y: number; z: number } {
    const f = forwardOf(this.yaw);
    const l = localXOf(this.yaw);
    return {
      x: this.x + l.x * P.gunSide + f.x * P.muzzleForward,
      y: W.muzzleHeight,
      z: this.z + l.z * P.gunSide + f.z * P.muzzleForward,
    };
  }

  /** 肩膀（槍托）位置：用來確認槍口是否被牆擋住。 */
  shoulder(): { x: number; z: number } {
    const l = localXOf(this.yaw);
    return { x: this.x + l.x * P.gunSide, z: this.z + l.z * P.gunSide };
  }

  /**
   * 轉身使用「現實時間」：子彈時間內瞄準仍然即時，不會變遲鈍。
   * 移動使用「遊戲時間」：與敵人一同放慢，維持速度關係。
   */
  update(gameDt: number, realDt: number, moveX: number, moveZ: number, aimYaw: number, boxes: readonly Box[]): void {
    if (!this.alive) {
      this.deadTime += gameDt;
      const t = Math.min(1, this.deadTime / 0.45);
      this.model.body.rotation.x = -(Math.PI / 2) * t * t;
      this.model.body.position.y = 0.12 * t;
      this.vx = damp(this.vx, 0, 10, gameDt);
      this.vz = damp(this.vz, 0, 10, gameDt);
      this.syncModel();
      this.model.animate(gameDt, 0, 0, P.moveSpeed);
      return;
    }

    this.yaw = dampAngle(this.yaw, aimYaw, P.turnSharpness, realDt);

    // 依移動方向與面向的關係調整速度：後退較慢、橫移略慢
    const len = Math.hypot(moveX, moveZ);
    let tx = 0;
    let tz = 0;
    if (len > 0.01) {
      const mx = moveX / len;
      const mz = moveZ / len;
      const f = forwardOf(this.yaw);
      const dot = mx * f.x + mz * f.z;
      const factor = dot >= 0 ? 1 - (1 - P.strafeFactor) * (1 - dot) : P.strafeFactor + (P.backpedalFactor - P.strafeFactor) * -dot;
      const speed = P.moveSpeed * factor;
      tx = mx * speed;
      tz = mz * speed;
    }
    const a = 1 - Math.exp(-P.acceleration * 0.25 * gameDt);
    this.vx += (tx - this.vx) * a;
    this.vz += (tz - this.vz) * a;
    this.x += this.vx * gameDt;
    this.z += this.vz * gameDt;
    const r = resolveCircle(this.x, this.z, P.radius, boxes);
    this.x = r.x;
    this.z = r.z;

    this.invulnerable = Math.max(0, this.invulnerable - gameDt);
    this.fireCooldown = Math.max(0, this.fireCooldown - gameDt);
    this.bloomDeg = Math.max(0, this.bloomDeg - W.bloomRecovery * gameDt);
    if (this.reloadTimer > 0) {
      this.reloadTimer -= gameDt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        const need = W.magSize - this.mag;
        const take = Math.min(need, this.reserve);
        this.mag += take;
        this.reserve -= take;
      }
    }
    // 換彈時槍口下壓
    this.model.lean = this.reloadTimer > 0 ? 0.35 * Math.sin(Math.min(1, 1 - this.reloadTimer / W.reloadTime) * Math.PI) : 0;

    this.syncModel();
    this.model.animate(gameDt, this.vx, this.vz, P.moveSpeed);
  }

  startReload(): boolean {
    if (!this.alive || this.reloadTimer > 0 || this.mag >= W.magSize || this.reserve <= 0) return false;
    this.reloadTimer = W.reloadTime;
    return true;
  }

  /** 目前的散布角度（度）：移動越快越大，連射會累積。 */
  spreadDeg(): number {
    const moving = Math.min(1, Math.hypot(this.vx, this.vz) / P.moveSpeed);
    return W.spreadDeg + W.moveSpreadDeg * moving + this.bloomDeg;
  }

  takeDamage(amount: number): boolean {
    if (!this.alive || this.invulnerable > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnerable = P.hurtInvulnerable;
    this.model.hitFlash(1, 0xff5040);
    if (this.hp <= 0) {
      this.alive = false;
      this.reloadTimer = 0;
    }
    return true;
  }

  syncModel(): void {
    this.model.root.position.set(this.x, 0, this.z);
    this.model.root.rotation.y = this.yaw;
  }
}
