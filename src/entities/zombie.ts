import * as THREE from 'three';
import { TUNING } from '../config';
import { Humanoid } from './humanoid';
import { idleState, type CharacterView, type ViewAction } from './view';
import { type Box, lineClear, resolveCircle } from '../world/collision';
import type { NavGrid } from '../world/navGrid';
import { dampAngle, Rng, yawOf } from '../util/math';

const Z = TUNING.zombie;

export type ZombieState = 'rising' | 'chase' | 'windup' | 'recover' | 'idle' | 'dead';

export interface ZombieContext {
  targetX: number;
  targetZ: number;
  targetAlive: boolean;
  boxes: readonly Box[];
  nav: NavGrid;
  onStrike: (z: Zombie) => void;
}

const SHIRTS = [0x6a5646, 0x4f5f6c, 0x6e5a48, 0x52604a, 0x74504c];
const SKINS = [0x95a87c, 0x9fa37e, 0x8aa07c];

let nextId = 1;

/** 方塊暫用喪屍（沒有外部模型時使用），衣服與膚色隨機。 */
export function blockZombieView(rng: Rng): CharacterView {
  return new Humanoid({
    skin: rng.pick(SKINS),
    shirt: rng.pick(SHIRTS),
    pants: 0x2f2f2c,
    hair: 0x2b2a22,
    shoes: 0x1e1c1a,
    eyes: 0xffc94a,
    zombie: true,
    silhouette: 0xff5a4a,
  });
}

export class Zombie {
  readonly id = nextId++;
  readonly model: CharacterView;
  private readonly viewState = idleState(TUNING.zombie.speed);
  private actionTime = 0;
  private lastViewAction: ViewAction = 'none';
  x: number;
  z: number;
  vx = 0;
  vz = 0;
  yaw: number;
  hp: number = Z.hp;
  state: ZombieState = 'rising';
  timer = 0;
  cooldown = 0;
  stagger = 0;
  knockX = 0;
  knockZ = 0;
  readonly speed: number;
  private path: { x: number; z: number }[] = [];
  private repath = 0;
  private groanTimer: number;
  corpseTimer = 0;
  removed = false;

  constructor(scene: THREE.Scene, x: number, z: number, rng: Rng, instant = false, view?: CharacterView) {
    this.model = view ?? blockZombieView(rng);
    this.x = x;
    this.z = z;
    this.yaw = rng.range(-Math.PI, Math.PI);
    this.speed = Z.speed * (1 + rng.range(-Z.speedVariance, Z.speedVariance) * 0.5);
    this.repath = rng.range(0, Z.repathInterval);
    this.groanTimer = rng.range(2, 6);
    if (instant) {
      this.state = 'chase';
    } else {
      this.timer = 1.0;
    }
    scene.add(this.model.root);
    this.sync();
    this.viewState.refSpeed = this.speed;
    this.updateView(0);
  }

  /** 把目前的狀態交給外觀呈現（方塊人形或骨架動畫）。 */
  private updateView(dt: number): void {
    const v = this.viewState;
    const action: ViewAction =
      this.state === 'dead' ? 'dead' : this.state === 'rising' ? 'rising' : this.state === 'windup' ? 'windup' : this.state === 'recover' ? 'recover' : 'none';
    if (action !== this.lastViewAction) {
      this.actionTime = 0;
      this.lastViewAction = action;
    } else {
      this.actionTime += dt;
    }
    v.vx = this.vx;
    v.vz = this.vz;
    v.action = action;
    v.actionTime = this.actionTime;
    v.actionDuration = action === 'rising' ? 1.0 : action === 'windup' ? Z.attackWindup : 0.4;
    v.sink = this.corpseTimer > Z.corpseTime ? (this.corpseTimer - Z.corpseTime) * 0.35 : 0;
    this.model.update(dt, v);
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** 被擊中：扣血、閃色、擊退、短暫踉蹌。回傳是否因此倒下。 */
  hit(damage: number, dirX: number, dirZ: number): boolean {
    if (!this.alive) return false;
    this.hp -= damage;
    this.model.hitFlash(1, 0xffffff);
    this.knockX += dirX * TUNING.weapon.knockback;
    this.knockZ += dirZ * TUNING.weapon.knockback;
    this.stagger = 0.16;
    if (this.state === 'windup') {
      // 出手前被打中會中斷攻擊
      this.state = 'recover';
      this.timer = 0.35;
    }
    if (this.hp <= 0) {
      this.state = 'dead';
      this.timer = 0;
      this.corpseTimer = 0;
      this.model.setSilhouetteVisible(false);
      return true;
    }
    return false;
  }

  /** 回傳 true 表示該播放低吼聲。 */
  update(dt: number, ctx: ZombieContext): boolean {
    let groan = false;
    if (this.state === 'dead') {
      this.updateDead(dt);
      return false;
    }

    if (this.state === 'rising') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'chase';
      this.sync();
      this.updateView(dt);
      return false;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    const dx = ctx.targetX - this.x;
    const dz = ctx.targetZ - this.z;
    const dist = Math.hypot(dx, dz);

    let wantX = 0;
    let wantZ = 0;

    if (!ctx.targetAlive) {
      if (this.state !== 'idle') this.state = 'idle';
    } else if (this.state === 'idle') {
      this.state = 'chase';
    }

    switch (this.state) {
      case 'chase': {
        if (dist < Z.attackRange && this.cooldown <= 0) {
          this.state = 'windup';
          this.timer = Z.attackWindup;
          this.model.hitFlash(0.45, 0xff6a3a);
          break;
        }
        const target = this.steer(dt, ctx, dist);
        wantX = target.x;
        wantZ = target.z;
        break;
      }
      case 'windup': {
        this.timer -= dt;
        if (this.timer <= 0) {
          if (dist <= Z.attackReach) ctx.onStrike(this);
          this.state = 'recover';
          this.timer = 0.4;
          this.cooldown = Z.attackCooldown;
        }
        break;
      }
      case 'recover':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'chase';
        break;
      case 'idle': {
        // 目標倒下後原地徘徊，不再出手
        this.timer -= dt;
        if (this.timer <= 0) this.timer = 2;
        wantX = Math.sin(this.id * 3.1 + this.timer) * 0.3;
        wantZ = Math.cos(this.id * 1.7 + this.timer) * 0.3;
        break;
      }
    }

    const speedMul = this.stagger > 0 ? 0.25 : 1;
    const wlen = Math.hypot(wantX, wantZ);
    let tvx = 0;
    let tvz = 0;
    if (wlen > 0.001) {
      const s = (this.state === 'idle' ? 0.4 : this.speed) * speedMul;
      tvx = (wantX / wlen) * s;
      tvz = (wantZ / wlen) * s;
    }
    const a = 1 - Math.exp(-6 * dt);
    this.vx += (tvx - this.vx) * a;
    this.vz += (tvz - this.vz) * a;

    // 擊退衰減
    this.x += (this.vx + this.knockX) * dt;
    this.z += (this.vz + this.knockZ) * dt;
    const kd = Math.exp(-10 * dt);
    this.knockX *= kd;
    this.knockZ *= kd;

    const r = resolveCircle(this.x, this.z, Z.radius, ctx.boxes);
    this.x = r.x;
    this.z = r.z;

    // 面向：追擊時朝向目標，出手時鎖定
    if (this.state === 'chase' || this.state === 'recover') {
      const faceYaw = dist < 4 || wlen < 0.001 ? yawOf(dx, dz) : yawOf(wantX, wantZ);
      this.yaw = dampAngle(this.yaw, faceYaw, 7, dt);
    } else if (this.state === 'windup') {
      this.yaw = dampAngle(this.yaw, yawOf(dx, dz), 12, dt);
    }

    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      this.groanTimer = 4 + (this.id % 5) * 1.3;
      groan = dist < 16;
    }

    this.sync();
    this.updateView(dt);
    return groan;
  }

  private steer(dt: number, ctx: ZombieContext, dist: number): { x: number; z: number } {
    // 看得到目標就直接追；否則依格子尋路，定期更新路徑
    const direct = dist < 2.5 || lineClear(this.x, this.z, ctx.targetX, ctx.targetZ, ctx.boxes, 0, Z.radius * 0.95);
    if (direct) {
      this.path.length = 0;
      return { x: ctx.targetX - this.x, z: ctx.targetZ - this.z };
    }
    this.repath -= dt;
    if (this.repath <= 0 || this.path.length === 0) {
      this.repath = Z.repathInterval;
      this.path = ctx.nav.findPath(this.x, this.z, ctx.targetX, ctx.targetZ) ?? [];
    }
    while (this.path.length > 0) {
      const p = this.path[0];
      if (Math.hypot(p.x - this.x, p.z - this.z) < 0.45) this.path.shift();
      else break;
    }
    const next = this.path[0];
    if (!next) return { x: ctx.targetX - this.x, z: ctx.targetZ - this.z };
    return { x: next.x - this.x, z: next.z - this.z };
  }

  private updateDead(dt: number): void {
    this.timer += dt;
    this.corpseTimer += dt;
    this.x += this.knockX * dt;
    this.z += this.knockZ * dt;
    const kd = Math.exp(-8 * dt);
    this.knockX *= kd;
    this.knockZ *= kd;
    if (this.corpseTimer > Z.corpseTime + 2.5) this.removed = true;
    this.vx = 0;
    this.vz = 0;
    this.sync();
    this.updateView(dt);
  }

  sync(): void {
    this.model.root.position.set(this.x, 0, this.z);
    this.model.root.rotation.y = this.yaw;
  }

  dispose(): void {
    this.model.dispose();
  }
}

