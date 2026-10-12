import * as THREE from 'three';
import { BULLET, GUN_Y, PLAYER } from './config.js';
import { animateRig, buildCharacter, MUZZLE_Z, SHOULDER_X, setFlash } from './characters.js';
import { Laser } from './fx.js';
import { PLAYER_START } from './level.js';
import { angleTo, clamp, damp, rand, wrapAngle } from './utils.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = buildCharacter({
      body: 0xe9e9f2,
      pants: 0x262a3e,
      skin: 0xe2b48c,
      hair: 0x1b1b22,
      accent: 0x2ee8ff,
      gun: 0x3a3d48,
      weapon: 'dual',
      glow: 2.6,
      ring: 0.9,
    });
    game.scene.add(this.rig.root);
    this.aimLaser = new Laser(game.scene, new THREE.Color(0.25, 1.2, 1.5));
    this.splitLaser = new Laser(game.scene, new THREE.Color(1.8, 0.35, 1.3));
    this.reset();
  }

  reset() {
    this.x = PLAYER_START.x;
    this.z = PLAYER_START.z;
    this.vx = this.vz = 0;
    this.facing = Math.PI;
    this.hp = PLAYER.hp;
    this.alive = true;
    this.spinT = 0;
    this.spinCd = 0;
    this.spinDirX = 0;
    this.spinDirZ = -1;
    this.fireCd = 0;
    this.ammo = PLAYER.magSize;
    this.reloadT = 0;
    this.kickCd = 0;
    this.kickT = 0;
    this.splitTarget = null;
    this.sinceHurt = 99;
    this.hurtFlash = 0;
    this.invuln = 0;
    this.nextGun = 0;
    this.phase = 0;
    this.moveAmt = 0;
    this.recoilL = 0;
    this.recoilR = 0;
    this.deathT = 0;
    const r = this.rig;
    r.root.visible = true;
    r.inner.rotation.set(0, 0, 0);
    r.inner.position.set(0, 0, 0);
    r.ring.visible = true;
    setFlash(r, 0);
    this.syncRig(0);
  }

  get spinning() {
    return this.spinT > 0;
  }

  get reloadProgress() {
    return this.reloadT > 0 ? 1 - this.reloadT / PLAYER.reloadTime : 1;
  }

  /** World position of a gun muzzle. side -1 = right hand, +1 = left hand. */
  shoulder(side) {
    const f = this.facing;
    const lx = side * SHOULDER_X;
    return { x: this.x + lx * Math.cos(f), z: this.z - lx * Math.sin(f) };
  }

  muzzle(side, angle) {
    const s = this.shoulder(side);
    return { x: s.x + Math.sin(angle) * MUZZLE_Z, z: s.z + Math.cos(angle) * MUZZLE_Z };
  }

  update(dt, input) {
    if (!this.alive) {
      this.updateDeath(dt);
      return;
    }
    const g = this.game;
    this.spinCd -= dt;
    this.fireCd -= dt;
    this.kickCd -= dt;
    this.invuln -= dt;
    this.sinceHurt += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    this.recoilL = Math.max(0, this.recoilL - dt * 8);
    this.recoilR = Math.max(0, this.recoilR - dt * 8);
    if (this.sinceHurt > PLAYER.regenDelay && this.hp < PLAYER.hp) this.hp = Math.min(PLAYER.hp, this.hp + PLAYER.regenRate * dt);

    // --- movement (camera never rotates, so WASD maps to world axes)
    let ix = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let iz = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
    const il = Math.hypot(ix, iz);
    if (il > 0) {
      ix /= il;
      iz /= il;
    }

    if (input.hit('Space') && this.spinCd <= 0 && this.spinT <= 0) {
      this.spinT = PLAYER.spinDuration;
      if (il > 0) {
        this.spinDirX = ix;
        this.spinDirZ = iz;
      } else {
        this.spinDirX = Math.sin(this.facing);
        this.spinDirZ = Math.cos(this.facing);
      }
      g.audio.spin();
    }

    let tx;
    let tz;
    let accel = PLAYER.accel;
    if (this.spinT > 0) {
      this.spinT -= dt;
      const sp = PLAYER.speed * PLAYER.spinSpeedMul;
      tx = this.spinDirX * sp;
      tz = this.spinDirZ * sp;
      accel = 30;
      if (Math.random() < 0.8) {
        g.fx.glow.spawn({ x: this.x + rand(-0.3, 0.3), y: rand(0.4, 1.8), z: this.z + rand(-0.3, 0.3), life: 0.3, size: rand(0.06, 0.12), r: 0.5, g: 2.6, b: 3.4 });
      }
      if (this.spinT <= 0) this.spinCd = PLAYER.spinCooldown;
    } else {
      tx = ix * PLAYER.speed;
      tz = iz * PLAYER.speed;
    }
    this.vx = damp(this.vx, tx, accel, dt);
    this.vz = damp(this.vz, tz, accel, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.collide();

    // --- aim
    const aim = g.aimPoint;
    const aimDist = Math.hypot(aim.x - this.x, aim.z - this.z);
    if (aimDist > 0.35) this.facing = angleTo(this.x, this.z, aim.x, aim.z);

    // --- split aim: hold right mouse to lock the left gun onto an enemy
    if (input.mouse.rightPressed) {
      this.splitTarget = g.enemies.closestTo(aim.x, aim.z, 7) || g.enemies.closestTo(this.x, this.z, 30);
      if (!this.splitTarget) g.audio.denied();
    }
    if (!input.mouse.right) this.splitTarget = null;
    else if (this.splitTarget && !this.splitTarget.alive) {
      this.splitTarget = g.enemies.closestTo(this.splitTarget.x, this.splitTarget.z, 14);
    }

    // --- reload / fire
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammo = PLAYER.magSize;
        g.audio.reloadDone();
      }
    } else if (input.hit('KeyR') && this.ammo < PLAYER.magSize) {
      this.startReload();
    }
    if (input.mouse.left && this.fireCd <= 0) {
      if (this.reloadT > 0) {
        if (input.mouse.leftPressed) g.audio.empty();
      } else if (this.ammo <= 0) {
        this.startReload();
      } else {
        this.fire();
      }
    }

    // --- kick
    if (this.kickT > 0) this.kickT -= dt;
    if (input.hit('KeyF', 'KeyE') && this.kickCd <= 0) this.kick();

    const speed = Math.hypot(this.vx, this.vz);
    this.moveAmt = damp(this.moveAmt, clamp(speed / PLAYER.speed, 0, 1), 10, dt);
    this.phase += speed * dt * 2.1;
    this.syncRig(dt);
    this.updateLasers();
  }

  collide() {
    const g = this.game;
    const R = PLAYER.radius;
    for (const p of g.level.props) {
      if (!p.alive) continue;
      const dx = p.x - this.x;
      const dz = p.z - this.z;
      const rr = R + p.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = rr - d;
      p.x += (dx / d) * push;
      p.z += (dz / d) * push;
      p.vx += (dx / d) * 1.5;
      p.vz += (dz / d) * 1.5;
    }
    for (const e of g.enemies.list) {
      if (!e.alive) continue;
      const dx = e.x - this.x;
      const dz = e.z - this.z;
      const rr = R + e.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (rr - d) / 2;
      e.x += (dx / d) * push;
      e.z += (dz / d) * push;
      this.x -= (dx / d) * push;
      this.z -= (dz / d) * push;
    }
    g.level.collideCircle(this, R);
  }

  startReload() {
    if (this.reloadT > 0) return;
    this.reloadT = PLAYER.reloadTime;
    this.game.audio.reload();
  }

  fire() {
    const g = this.game;
    const aim = g.aimPoint;
    const target = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
    const shots = target
      ? [
          { side: -1, tx: aim.x, tz: aim.z, split: false },
          { side: 1, tx: target.x, tz: target.z, split: true },
        ]
      : [{ side: this.nextGun ? 1 : -1, tx: aim.x, tz: aim.z, split: false }];
    if (!target) this.nextGun ^= 1;

    for (const s of shots) {
      if (this.ammo <= 0) break;
      this.ammo--;
      const arm = s.side === 1 ? this.rig.armL : this.rig.armR;
      const armAngle = this.facing + arm.rotation.y;
      const sh = this.shoulder(s.side);
      const m = this.muzzle(s.side, armAngle);
      let dx = s.tx - sh.x;
      let dz = s.tz - sh.z;
      let l = Math.hypot(dx, dz);
      if (l < 1) {
        dx = Math.sin(armAngle);
        dz = Math.cos(armAngle);
        l = 1;
      }
      const a = Math.atan2(dx / l, dz / l) + rand(-1, 1) * PLAYER.spread;
      dx = Math.sin(a);
      dz = Math.cos(a);
      g.bullets.spawn({ x: sh.x, z: sh.z, dx, dz, speed: BULLET.playerSpeed, owner: 'player', damage: 1, split: s.split });
      g.fx.muzzle(m.x, GUN_Y, m.z, dx, dz);
      const ex = Math.cos(this.facing) * s.side;
      const ez = -Math.sin(this.facing) * s.side;
      g.fx.casing(m.x - dx * 0.4, GUN_Y, m.z - dz * 0.4, ex, ez);
      g.fx.flash(m.x, GUN_Y + 0.4, m.z, 0xffc070, 16, 0.08, 9);
      if (s.side === 1) this.recoilL = 1;
      else this.recoilR = 1;
    }
    g.audio.shot('player', g.panFor(this.x));
    g.shake(0.05);
    this.fireCd = PLAYER.fireInterval;
    if (this.ammo <= 0) this.startReload();
  }

  kick() {
    const g = this.game;
    this.kickCd = PLAYER.kickCooldown;
    this.kickT = 0.28;
    let hit = false;
    const inCone = (x, z, reach) => {
      const dx = x - this.x;
      const dz = z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return null;
      if (d > 0.3 && Math.abs(wrapAngle(Math.atan2(dx, dz) - this.facing)) > PLAYER.kickArc) return null;
      return d > 0.01 ? { x: dx / d, z: dz / d } : { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    };
    for (const e of g.enemies.list) {
      if (!e.alive || e.spawnLock > 0) continue;
      const dir = inCone(e.x, e.z, PLAYER.kickRange + e.radius);
      if (!dir) continue;
      e.kick(dir.x, dir.z, 14);
      hit = true;
    }
    for (const p of g.level.props) {
      if (!p.alive) continue;
      const dir = inCone(p.x, p.z, PLAYER.kickRange + p.r);
      if (!dir) continue;
      if (p.kind === 'pan') {
        p.hit(dir.x, dir.z, 9);
        p.vy = 8;
      } else {
        p.vx += dir.x * 14;
        p.vz += dir.z * 14;
      }
      hit = true;
    }
    g.audio.kick(hit);
    if (hit) {
      g.shake(0.25);
      g.hitstop(0.05);
      g.fx.sparks(this.x + Math.sin(this.facing), 0.8, this.z + Math.cos(this.facing), Math.sin(this.facing), Math.cos(this.facing), 8, [4, 4, 4], 6);
    }
  }

  hurt(dmg, dx = 0, dz = 0, explosion = false) {
    if (!this.alive || this.invuln > 0) return false;
    if (this.spinning && !explosion) return false;
    const g = this.game;
    this.hp -= dmg;
    this.sinceHurt = 0;
    this.hurtFlash = 1;
    this.invuln = 0.08;
    this.vx += dx * 4;
    this.vz += dz * 4;
    g.fx.blood(this.x, 1.2, this.z, dx, dz, 10);
    g.onPlayerHurt(dmg);
    if (this.hp <= 0) this.die(dx, dz);
    return true;
  }

  die(dx, dz) {
    this.hp = 0;
    this.alive = false;
    this.deathT = 0;
    const l = Math.hypot(dx, dz) || 1;
    this.deathDx = dx / l;
    this.deathDz = dz / l;
    this.vx = this.deathDx * 6;
    this.vz = this.deathDz * 6;
    this.rig.root.rotation.y = Math.atan2(-this.deathDx, -this.deathDz);
    this.aimLaser.hide();
    this.splitLaser.hide();
    this.rig.ring.visible = false;
    this.game.fx.blood(this.x, 1.2, this.z, dx, dz, 30, 1.4);
    this.game.onPlayerDeath();
  }

  updateDeath(dt) {
    this.deathT += dt;
    const f = Math.exp(-4 * dt);
    this.vx *= f;
    this.vz *= f;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.game.level.collideCircle(this, PLAYER.radius);
    const k = clamp(this.deathT / 0.45, 0, 1);
    const r = this.rig;
    r.inner.rotation.x = -Math.PI / 2 * (1 - (1 - k) * (1 - k));
    r.inner.position.y = 0.2 * k;
    r.root.position.set(this.x, 0, this.z);
    setFlash(r, 0);
  }

  syncRig(dt) {
    const r = this.rig;
    r.root.position.set(this.x, 0, this.z);
    r.root.rotation.y = this.facing;
    animateRig(r, this.phase, this.moveAmt);

    if (this.spinT > 0) {
      const k = 1 - this.spinT / PLAYER.spinDuration;
      r.inner.rotation.y = (1 - (1 - k) * (1 - k)) * Math.PI * 4;
      r.inner.position.y = Math.sin(k * Math.PI) * 0.3;
    } else {
      r.inner.rotation.y = 0;
      r.inner.position.y = 0;
    }
    if (this.kickT > 0) {
      const k = 1 - this.kickT / 0.28;
      r.legR.rotation.x = -1.7 * Math.sin(k * Math.PI);
    }

    const t = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
    if (t) {
      const sh = this.shoulder(1);
      r.armL.rotation.y = clamp(wrapAngle(angleTo(sh.x, sh.z, t.x, t.z) - this.facing), -1.5, 1.5);
    } else {
      r.armL.rotation.y = 0.05;
    }
    r.armR.rotation.y = -0.05;
    r.armL.position.z = -this.recoilL * 0.14;
    r.armR.position.z = -this.recoilR * 0.14;

    setFlash(r, this.hurtFlash * 2.5);
    const ringBoost = this.spinT > 0 ? 3 : 1;
    r.ring.material.color.setRGB(0.25 * ringBoost, 0.85 * ringBoost, 1.0 * ringBoost);
  }

  updateLasers() {
    const g = this.game;
    const aim = g.aimPoint;
    const armR = this.facing + this.rig.armR.rotation.y;
    const m = this.muzzle(-1, armR);
    let dx = aim.x - m.x;
    let dz = aim.z - m.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.5) {
      dx /= l;
      dz /= l;
      const len = g.level.rayLength(m.x, m.z, dx, dz, Math.min(l, 45));
      this.aimLaser.set(m.x, m.z, m.x + dx * len, m.z + dz * len, 0.035, this.reloadT > 0 ? 0.25 : 0.7);
    } else {
      this.aimLaser.hide();
    }

    const t = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
    if (t) {
      const armL = this.facing + this.rig.armL.rotation.y;
      const ml = this.muzzle(1, armL);
      let sx = t.x - ml.x;
      let sz = t.z - ml.z;
      const sl = Math.hypot(sx, sz) || 1;
      sx /= sl;
      sz /= sl;
      const len = g.level.rayLength(ml.x, ml.z, sx, sz, sl);
      this.splitLaser.set(ml.x, ml.z, ml.x + sx * len, ml.z + sz * len, 0.05, 1.2);
    } else {
      this.splitLaser.hide();
    }
  }
}
