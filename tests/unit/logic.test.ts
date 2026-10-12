import { describe, expect, it } from 'vitest';
import { firstBoxHit, lineClear, rayHitsBox3D, resolveCircle, segmentBox, segmentCircle, type Box } from '../../src/world/collision';
import { NavGrid } from '../../src/world/navGrid';
import { BulletTime } from '../../src/systems/bulletTime';
import { WaveDirector } from '../../src/systems/waves';
import { aimYawWithMuzzleOffset, dampAngle, forwardOf, localXOf, wrapAngle } from '../../src/util/math';
import { buildColliders, LEVEL_DATA } from '../../src/world/level';
import { TUNING } from '../../src/config';

const wall: Box = { minX: 0, maxX: 1, minZ: -5, maxZ: 5, height: 2.6 };
const lowCrate: Box = { minX: 3, maxX: 4, minZ: -0.5, maxZ: 0.5, height: 0.9 };

describe('碰撞', () => {
  it('把貼牆的圓推出牆外', () => {
    const r = resolveCircle(-0.1, 0, 0.35, [wall]);
    expect(r.hit).toBe(true);
    expect(r.x).toBeCloseTo(-0.35, 5);
  });

  it('圓心已在牆內時沿最短方向推出', () => {
    const r = resolveCircle(0.2, 0, 0.35, [wall]);
    expect(r.x).toBeCloseTo(-0.35, 5);
  });

  it('線段穿過方塊時回傳入射點與法線', () => {
    const h = segmentBox(-2, 0, 2, 0, wall);
    expect(h).not.toBeNull();
    expect(h!.t).toBeCloseTo(0.5, 5);
    expect(h!.nx).toBe(-1);
  });

  it('起點在方塊內時 t = 0（槍口伸進牆裡）', () => {
    const h = segmentBox(0.5, 0, 3, 0, wall);
    expect(h!.t).toBe(0);
  });

  it('矮箱不擋子彈高度，高牆會擋', () => {
    const muzzle = TUNING.weapon.muzzleHeight;
    expect(firstBoxHit(2, 0, 6, 0, [lowCrate], muzzle)).toBeNull();
    expect(firstBoxHit(-2, 0, 6, 0, [wall, lowCrate], muzzle)?.box).toBe(wall);
  });

  it('線段與圓：命中與擦身而過', () => {
    // 圓心 (5, 0.2)、半徑 0.4：入射點 x = 5 - √(0.4² - 0.2²)
    expect(segmentCircle(0, 0, 10, 0, 5, 0.2, 0.4)).toBeCloseTo((5 - Math.sqrt(0.4 ** 2 - 0.2 ** 2)) / 10, 6);
    expect(segmentCircle(0, 0, 10, 0, 5, 1, 0.4)).toBeNull();
  });

  it('視線檢查與 3D 遮擋射線', () => {
    expect(lineClear(-2, 0, 2, 0, [wall])).toBe(false);
    expect(lineClear(-2, 6, 2, 6, [wall])).toBe(true);
    // 牆的北側往鏡頭（南方、上方）看會被牆擋住
    expect(rayHitsBox3D(0.5, 1, -6, 0, 0.83, 0.56, wall, 50)).toBe(true);
    expect(rayHitsBox3D(0.5, 1, 6, 0, 0.83, 0.56, wall, 50)).toBe(false);
  });
});

describe('尋路', () => {
  it('繞過牆找到路徑，而且每段都不穿牆', () => {
    const boxes = [wall];
    const nav = new NavGrid(-8, -8, 8, 8, 0.5, boxes, 0.38);
    const path = nav.findPath(-3, 0, 4, 0);
    expect(path).not.toBeNull();
    let x = -3;
    let z = 0;
    for (const p of path!) {
      expect(lineClear(x, z, p.x, p.z, boxes, 0, 0.3)).toBe(true);
      x = p.x;
      z = p.z;
    }
    expect(x).toBeCloseTo(4);
  });

  it('測試場內每個生成點都能走到玩家起點', () => {
    const boxes = buildColliders();
    const nav = new NavGrid(-24, -18, 24, 18, 0.5, boxes, TUNING.zombie.radius);
    const s = LEVEL_DATA.playerStart;
    for (const sp of LEVEL_DATA.spawnPoints) {
      expect(nav.findPath(sp.x, sp.z, s.x, s.z), `生成點 ${sp.x},${sp.z}`).not.toBeNull();
    }
  });
});

describe('子彈時間（能量槽）', () => {
  const cfg = { max: 100, drainPerSec: 25, regenPerSec: 10, minToActivate: 20, timeScale: 0.3, blendSpeed: 10 };

  it('啟動後時間倍率變慢並持續消耗', () => {
    const bt = new BulletTime(cfg);
    expect(bt.update(0.1, true, true)).toBe('activated');
    expect(bt.scale).toBe(0.3);
    bt.update(1, true, true);
    expect(bt.energy).toBeCloseTo(100 - 2.5 - 25, 5);
  });

  it('耗盡後自動回到正常速度，按住不放不會再自動開啟', () => {
    const bt = new BulletTime(cfg);
    let ev = null;
    for (let i = 0; i < 50 && ev !== 'depleted'; i++) ev = bt.update(0.1, true, true);
    expect(ev).toBe('depleted');
    expect(bt.scale).toBe(1);
    for (let i = 0; i < 40; i++) bt.update(0.1, true, true);
    expect(bt.active).toBe(false);
  });

  it('回復到最低啟動量即可再次啟動，不必等回滿', () => {
    const bt = new BulletTime(cfg);
    bt.energy = 0;
    bt.update(0.1, false, true);
    expect(bt.update(0.1, true, true)).toBe('denied');
    bt.update(0.1, false, true);
    for (let i = 0; i < 20; i++) bt.update(0.1, false, true);
    expect(bt.energy).toBeGreaterThanOrEqual(20);
    expect(bt.energy).toBeLessThan(100);
    expect(bt.update(0.1, true, true)).toBe('activated');
  });

  it('暫停或倒下時不回復，並強制回到正常速度', () => {
    const bt = new BulletTime(cfg);
    bt.update(0.1, true, true);
    const e = bt.energy;
    expect(bt.update(1, true, false)).toBe('deactivated');
    expect(bt.scale).toBe(1);
    expect(bt.energy).toBeCloseTo(e, 5);
  });

  it('重設後能量全滿、倍率為 1', () => {
    const bt = new BulletTime(cfg);
    bt.update(0.5, true, true);
    bt.reset();
    expect(bt.energy).toBe(100);
    expect(bt.scale).toBe(1);
    expect(bt.visual).toBe(0);
  });
});

describe('角度與瞄準', () => {
  it('平滑轉身是連續角度，不吸附到 45° 的倍數', () => {
    let yaw = 0;
    const steps: number[] = [];
    for (let i = 0; i < 10; i++) {
      yaw = dampAngle(yaw, 2.0, 20, 1 / 60);
      steps.push(yaw);
    }
    // 每一幀都往目標前進一小段，且都是不同的中間角度
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps.every((a) => a > 0 && a < 2.0)).toBe(true);
    expect(new Set(steps.map((a) => a.toFixed(4))).size).toBe(10);
  });

  it('跨越 ±180° 時走最短方向', () => {
    const y = dampAngle(Math.PI - 0.1, -Math.PI + 0.1, 1000, 1);
    expect(Math.abs(wrapAngle(y - (-Math.PI + 0.1)))).toBeLessThan(1e-6);
  });

  it('修正槍口側偏後，槍口沿面向射出的線會通過瞄準點', () => {
    const gun = TUNING.player.gunSide;
    for (const [dx, dz] of [
      [5, 0],
      [0, -7],
      [-3, 4],
      [1.2, 1.1],
    ]) {
      const yaw = aimYawWithMuzzleOffset(dx, dz, gun);
      const f = forwardOf(yaw);
      const l = localXOf(yaw);
      const mx = l.x * gun;
      const mz = l.z * gun;
      // 瞄準點到「槍口射線」的垂直距離
      const ax = dx - mx;
      const az = dz - mz;
      const lateral = Math.abs(ax * l.x + az * l.z);
      expect(lateral).toBeLessThan(1e-6);
      expect(ax * f.x + az * f.z).toBeGreaterThan(0);
    }
  });
});

describe('波次', () => {
  it('每波數量遞增，同時在場數受上限控制', () => {
    const w = new WaveDirector();
    let spawned = 0;
    let alive = 0;
    let started = 0;
    for (let i = 0; i < 400; i++) {
      const ev = w.update(0.1, alive, true);
      if (ev?.type === 'waveStart') started = ev.wave;
      if (ev?.type === 'spawn') {
        spawned++;
        alive++;
      }
      expect(alive).toBeLessThanOrEqual(TUNING.waves.maxAlive);
      if (started === 1 && spawned === TUNING.waves.first) break;
    }
    expect(spawned).toBe(TUNING.waves.first);
  });

  it('關閉生成時不產生事件', () => {
    const w = new WaveDirector();
    for (let i = 0; i < 100; i++) expect(w.update(0.1, 0, false)).toBeNull();
  });
});
