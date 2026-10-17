import * as THREE from 'three';
import { GUN_Y, PLAYER } from './config.js';
import { animateRig, attachWeapon, buildCharacter, deathPose, finishRig, MUZZLE_Z, SHOULDER_X, setFlash } from './characters.js';
import { Laser } from './fx.js';
import { angleTo, clamp, damp, rand, wrapAngle } from './utils.js';
import { PLAYER_WEAPONS } from './weapons.js';

export class Player {
  constructor(game) {
    this.game = game;
    this.rig = buildCharacter({
      body: 0x2f9fbf,
      pants: 0x1c2333,
      skin: 0xe2b48c,
      hair: 0x1b1b22,
      accent: 0x2ee8ff,
      gun: 0x3a3d48,
      weapon: 'dualPistol',
      glow: 2.6,
      ring: 0.9,
      model: 'hero',
    });
    this.anchorZ = this.rig.anchor.position.z;
    this.centerZ = this.rig.center.position.z;
    game.scene.add(this.rig.root);
    this.aimLaser = new Laser(game.scene, new THREE.Color(0.25, 1.2, 1.5));
    this.splitLaser = new Laser(game.scene, new THREE.Color(1.8, 0.35, 1.3));
    this.reset();
  }

  reset() {
    const start = this.game.level.start;
    this.x = start.x;
    this.z = start.z;
    this.vx = this.vz = 0;
    this.facing = Math.PI;
    this.hp = PLAYER.hp;
    this.alive = true;
    this.spinT = 0;
    this.spinCd = 0;
    this.spinReload = false;
    this.slideT = 0;
    this.slideCd = 0;
    this.slideDirX = 0;
    this.slideDirZ = 1;
    this.spinDirX = 0;
    this.spinDirZ = -1;
    this.fireCd = 0;
    this.ammo = PLAYER_WEAPONS.pistols.mag;
    this.reloadT = 0;
    this.special = null;
    this.slot = 'pistols';
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
    attachWeapon(r, PLAYER_WEAPONS.pistols.model);
    setFlash(r, 0);
    this.syncRig(0);
  }

  /** Put the player back at the map's start (used between stages). */
  placeAtStart() {
    const start = this.game.level.start;
    this.x = start.x;
    this.z = start.z;
    this.vx = this.vz = 0;
    this.spinT = 0;
    this.splitTarget = null;
    this.syncRig(0);
  }

  get sliding() {
    return this.slideT > 0;
  }

  get spinning() {
    return this.spinT > 0;
  }

  get weapon() {
    return this.slot === 'special' && this.special ? PLAYER_WEAPONS[this.special.id] : PLAYER_WEAPONS.pistols;
  }

  get reloadProgress() {
    return this.reloadT > 0 ? 1 - this.reloadT / PLAYER_WEAPONS.pistols.reload : 1;
  }

  // ------------------------------------------------------------ weapons

  equip(slot) {
    if (slot === 'special' && !this.special) return;
    if (slot === this.slot && this.rig.model === this.weapon.model) return;
    this.slot = slot;
    this.reloadT = 0;
    this.spinReload = false;
    this.fireCd = Math.max(this.fireCd, 0.12);
    if (!this.weapon.dual) this.splitTarget = null;
    attachWeapon(this.rig, this.weapon.model);
    this.game.audio.weaponSwitch();
  }

  giveWeapon(kind, ammo, replace = false) {
    const w = PLAYER_WEAPONS[kind];
    this.game.notes.log(`拿起 ${w.name}${replace ? '（交換）' : ''}`);
    if (this.special && this.special.id === kind && !replace) {
      this.special.ammo = Math.min(this.special.ammo + ammo, w.ammo * 2);
    } else {
      this.special = { id: kind, ammo };
    }
    this.slot = 'pistols';
    this.equip('special');
    this.game.hud.toast(`${w.name} <small>${w.en}</small>`);
    this.game.audio.pickup();
  }

  /** Ammo for the shot about to be fired. Returns false if empty. */
  useAmmo() {
    if (this.slot === 'special') {
      if (this.special.ammo <= 0) return false;
      this.special.ammo--;
      return true;
    }
    if (this.ammo <= 0) return false;
    this.ammo--;
    return true;
  }

  /** Local (character space) point -> world. */
  local(lx, lz) {
    const f = this.facing;
    return { x: this.x + lx * Math.cos(f) + lz * Math.sin(f), z: this.z - lx * Math.sin(f) + lz * Math.cos(f) };
  }

  /** World position of a shoulder. side -1 = right hand, +1 = left hand. */
  shoulder(side) {
    return this.local(side * SHOULDER_X, 0);
  }

  muzzle(side, angle) {
    const s = this.shoulder(side);
    const len = this.rig.muzzles[0] ? this.rig.muzzles[0][1] : MUZZLE_Z;
    return { x: s.x + Math.sin(angle) * len, z: s.z + Math.cos(angle) * len };
  }

  /** How far the body has turned in the current spin dodge (two full turns, easing out); 0 when not spinning. */
  spinYaw() {
    if (this.spinT <= 0) return 0;
    const k = 1 - this.spinT / PLAYER.spinDuration;
    return (1 - (1 - k) * (1 - k)) * Math.PI * 4;
  }

  // -------------------------------------------------------------- update

  update(dt, input) {
    if (!this.alive) {
      this.updateDeath(dt);
      return;
    }
    const g = this.game;
    this.spinCd -= dt;
    this.slideCd -= dt;
    this.fireCd -= dt;
    this.kickCd -= dt;
    this.invuln -= dt;
    this.sinceHurt += dt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 4);
    this.recoilL = Math.max(0, this.recoilL - dt * 8);
    this.recoilR = Math.max(0, this.recoilR - dt * 8);
    if (this.sinceHurt > PLAYER.regenDelay && this.hp < PLAYER.hp) this.hp = Math.min(PLAYER.hp, this.hp + PLAYER.regenRate * dt);

    // --- weapon switching
    if (input.hit('Digit1')) this.equip('pistols');
    else if (input.hit('Digit2')) this.equip('special');
    else if (input.wheel && this.special) this.equip(this.slot === 'pistols' ? 'special' : 'pistols');
    const w = this.weapon;

    // --- movement (camera never rotates, so WASD maps to world axes)
    let ix = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let iz = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
    const il = Math.hypot(ix, iz);
    if (il > 0) {
      ix /= il;
      iz /= il;
      // W always means "up the screen", whichever way the camera faces
      const yaw = g.camYaw;
      if (yaw) {
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const rx = ix * c + iz * s;
        iz = -ix * s + iz * c;
        ix = rx;
      }
    }

    // slide: only out of a run, locked to the direction of travel; a spin can cut it short
    const curSp = Math.hypot(this.vx, this.vz);
    if (input.hit('KeyC') && this.slideCd <= 0 && this.slideT <= 0 && this.spinT <= 0 && curSp >= PLAYER.slideMinSpeed) {
      this.slideT = PLAYER.slideDuration;
      this.slideDirX = this.vx / curSp;
      this.slideDirZ = this.vz / curSp;
      g.audio.slide();
      g.notes.log('滑鏟');
    }

    if (input.hit('Space') && this.spinCd <= 0 && this.spinT <= 0) {
      this.spinT = PLAYER.spinDuration;
      this.slideT = 0;
      g.notes.log('旋轉閃避');
      // a spin finishes a reload: what is left of it (or a fresh one for an empty magazine) ends with the spin
      if (this.slot === 'pistols' && (this.reloadT > 0 || this.ammo <= 0)) {
        if (this.reloadT <= 0) g.audio.reload();
        this.reloadT = Math.min(this.reloadT > 0 ? this.reloadT : PLAYER_WEAPONS.pistols.reload, PLAYER.spinDuration);
        this.spinReload = true;
      }
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
    const speed = PLAYER.speed * (w.moveMul || 1);
    if (this.spinT > 0) {
      this.spinT -= dt;
      const sp = speed * PLAYER.spinSpeedMul;
      tx = this.spinDirX * sp;
      tz = this.spinDirZ * sp;
      accel = 30;
      if (Math.random() < 0.8) {
        g.fx.glow.spawn({ x: this.x + rand(-0.3, 0.3), y: rand(0.4, 1.8), z: this.z + rand(-0.3, 0.3), life: 0.3, size: rand(0.06, 0.12), r: 0.5, g: 2.6, b: 3.4 });
      }
      if (this.spinT <= 0) this.spinCd = PLAYER.spinCooldown;
    } else if (this.slideT > 0) {
      this.slideT -= dt;
      const k = Math.max(0, this.slideT / PLAYER.slideDuration); // 1 at launch, 0 at the end
      const sp = speed * PLAYER.slideSpeedMul * (0.35 + 0.65 * k);
      tx = this.slideDirX * sp;
      tz = this.slideDirZ * sp;
      accel = 40;
      if (Math.random() < 0.6) {
        g.fx.smoke.spawn({ x: this.x - this.slideDirX * 0.4 + rand(-0.2, 0.2), y: 0.1, z: this.z - this.slideDirZ * 0.4 + rand(-0.2, 0.2), vy: 0.5, life: rand(0.3, 0.5), size: 0.22, r: 0.4, g: 0.4, b: 0.45, drag: 2, grow: 1.6 });
      }
      if (this.slideT <= 0) this.slideCd = PLAYER.slideCooldown;
    } else {
      tx = ix * speed;
      tz = iz * speed;
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

    // --- split aim (dual weapons only): hold right mouse to lock the left gun
    if (input.mouse.rightPressed && w.dual) {
      this.splitTarget = g.enemies.closestTo(aim.x, aim.z, 7) || g.enemies.closestTo(this.x, this.z, 30);
      if (!this.splitTarget) g.audio.denied();
    }
    if (!input.mouse.right || !w.dual) this.splitTarget = null;
    else if (this.splitTarget && !this.splitTarget.alive) {
      this.splitTarget = g.enemies.closestTo(this.splitTarget.x, this.splitTarget.z, 14);
    }

    // --- reload (pistols only) / fire
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.ammo = PLAYER_WEAPONS.pistols.mag;
        g.audio.reloadDone();
        if (this.spinReload) {
          this.spinReload = false;
          g.score.style('SPIN RELOAD', 20, false);
          g.notes.log('旋轉中換彈');
        }
      }
    } else if (input.hit('KeyR') && this.slot === 'pistols' && this.ammo < PLAYER_WEAPONS.pistols.mag) {
      this.startReload();
    }
    if (input.mouse.left && this.fireCd <= 0) {
      if (this.slot === 'pistols' && this.reloadT > 0) {
        if (input.mouse.leftPressed) g.audio.empty();
      } else if (this.slot === 'pistols' && this.ammo <= 0) {
        this.startReload();
      } else {
        this.fire();
      }
    }

    // --- kick
    if (this.kickT > 0) this.kickT -= dt;
    if (input.hit('KeyF') && this.kickCd <= 0) this.kick();

    const sp = Math.hypot(this.vx, this.vz);
    this.moveAmt = damp(this.moveAmt, clamp(sp / PLAYER.speed, 0, 1), 10, dt);
    this.phase += sp * dt * 2.1;
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
    this.reloadT = PLAYER_WEAPONS.pistols.reload;
    this.game.audio.reload();
  }

  fire() {
    const g = this.game;
    const w = this.weapon;
    const aim = g.aimPoint;
    const shots = [];
    if (w.dual) {
      const target = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
      if (target) {
        shots.push({ side: -1, tx: aim.x, tz: aim.z, split: false }, { side: 1, tx: target.x, tz: target.z, split: true });
      } else {
        shots.push({ side: this.nextGun ? 1 : -1, tx: aim.x, tz: aim.z, split: false });
        this.nextGun ^= 1;
      }
    } else {
      shots.push({ side: 0, tx: aim.x, tz: aim.z, split: false });
    }
    // spin shot: while spinning the guns point where the body has turned to,
    // so holding fire sprays a ring instead of aiming at the cursor
    const yaw = this.spinYaw();
    if (yaw) {
      for (const s of shots) {
        const a = this.facing + yaw + (s.side || 0) * PLAYER.spinFan;
        s.spin = a;
        s.tx = this.x + Math.sin(a) * 30;
        s.tz = this.z + Math.cos(a) * 30;
        s.split = false;
      }
    }

    let fired = false;
    for (const s of shots) {
      if (!this.useAmmo()) break;
      fired = true;
      let origin;
      let m;
      let armAngle = this.facing;
      if (s.spin !== undefined) {
        armAngle = s.spin;
        origin = { x: this.x + Math.sin(armAngle) * 0.3, z: this.z + Math.cos(armAngle) * 0.3 };
        m = { x: this.x + Math.sin(armAngle) * 0.8, z: this.z + Math.cos(armAngle) * 0.8 };
      } else if (s.side) {
        const arm = s.side === 1 ? this.rig.armL : this.rig.armR;
        armAngle = this.facing + arm.rotation.y;
        origin = this.shoulder(s.side);
        m = this.muzzle(s.side, armAngle);
      } else {
        const [lx, lz] = this.rig.muzzles[0];
        origin = this.local(lx, this.rig.gripZ);
        m = this.local(lx, lz);
      }
      let dx = s.tx - origin.x;
      let dz = s.tz - origin.z;
      let l = Math.hypot(dx, dz);
      if (l < 1) {
        dx = Math.sin(armAngle);
        dz = Math.cos(armAngle);
        l = 1;
      }
      const base = Math.atan2(dx / l, dz / l);
      if (w.grenade) {
        g.grenades.spawn(m.x, m.z, s.tx, s.tz, w.speed);
        dx = Math.sin(base);
        dz = Math.cos(base);
      } else {
        const pellets = w.pellets || 1;
        for (let i = 0; i < pellets; i++) {
          const a = pellets > 1 ? base + (i / (pellets - 1) - 0.5) * w.spread * 2 + rand(-0.03, 0.03) : base + rand(-1, 1) * w.spread;
          dx = Math.sin(a);
          dz = Math.cos(a);
          g.bullets.spawn({
            x: origin.x,
            z: origin.z,
            dx,
            dz,
            speed: w.speed * (pellets > 1 ? rand(0.88, 1.08) : 1),
            owner: 'player',
            damage: w.damage,
            split: s.split,
            look: w.look,
            trail: w.trail,
            pierce: w.pierce,
            knock: w.knock,
            range: w.range,
            weapon: w.id,
            spinShot: s.spin !== undefined,
          });
        }
        dx = Math.sin(base);
        dz = Math.cos(base);
      }
      g.fx.muzzle(m.x, GUN_Y, m.z, dx, dz);
      if (w.pellets || w.scope) g.fx.muzzle(m.x, GUN_Y, m.z, dx, dz, [6, 4, 1.6]);
      const side = s.side || -1;
      const c = w.casing;
      if (!w.grenade) {
        g.fx.casing(m.x - dx * 0.5, GUN_Y, m.z - dz * 0.5, Math.cos(this.facing) * side, -Math.sin(this.facing) * side, c);
      }
      g.fx.flash(m.x, GUN_Y + 0.4, m.z, 0xffc070, w.flash || 16, w.scope ? 0.14 : 0.08, w.scope ? 14 : 9);
      if (s.side === 1) this.recoilL = 1;
      else this.recoilR = 1;
      if (w.recoil) {
        this.vx -= dx * w.recoil;
        this.vz -= dz * w.recoil;
      }
    }
    if (!fired) return;
    g.level.noise(this.x, this.z, 11);
    g.audio.shot(w.sound, g.panFor(this.x));
    g.shake(w.shake);
    this.fireCd = w.interval * (yaw ? PLAYER.spinFireMul : 1);
    if (this.slot === 'pistols') {
      if (this.ammo <= 0) this.startReload();
    } else if (this.special.ammo <= 0) {
      this.special = null;
      this.equip('pistols');
      g.hud.toast('彈藥用盡 <small>OUT OF AMMO</small>');
    }
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

  hurt(dmg, dx = 0, dz = 0, explosion = false, source = '') {
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
    g.onPlayerHurt(dmg, source || (explosion ? '爆炸' : '子彈'));
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
    if (!deathPose(r, this.deathT)) {
      r.inner.rotation.x = (-Math.PI / 2) * (1 - (1 - k) * (1 - k));
      r.inner.position.y = 0.12 * k;
    }
    r.root.position.set(this.x, this.game.level.groundY(this.x, this.z), this.z);
    setFlash(r, 0);
  }

  syncRig() {
    const r = this.rig;
    r.root.position.set(this.x, this.game.level.groundY(this.x, this.z), this.z);
    r.root.rotation.y = this.facing;
    animateRig(r, this.phase, this.moveAmt, Math.atan2(this.vx, this.vz));

    if (this.spinT > 0) {
      const k = 1 - this.spinT / PLAYER.spinDuration;
      r.inner.rotation.y = this.spinYaw();
      r.inner.position.y = Math.sin(k * Math.PI) * 0.3;
    } else {
      r.inner.rotation.y = 0;
      r.inner.position.y = 0;
    }
    if (this.slideT > 0) {
      // lie back along the slide: body low and tilted, legs out in front
      const k = 1 - this.slideT / PLAYER.slideDuration;
      const e = Math.min(1, k * 4) * Math.min(1, (1 - k) * 4);
      r.inner.position.y = -0.38 * e;
      r.inner.rotation.x = -0.75 * e;
      r.legL.rotation.x = r.legR.rotation.x = -1.3 * e;
    } else {
      r.inner.rotation.x = 0;
    }
    if (this.kickT > 0) {
      const k = 1 - this.kickT / 0.28;
      r.legR.rotation.x = -1.7 * Math.sin(k * Math.PI);
    }

    const pose = r.pose;
    const t = this.splitTarget && this.splitTarget.alive ? this.splitTarget : null;
    if (t) {
      const sh = this.shoulder(1);
      r.armL.rotation.y = clamp(wrapAngle(angleTo(sh.x, sh.z, t.x, t.z) - this.facing), -1.5, 1.5);
    } else {
      r.armL.rotation.y = pose.ly;
    }
    r.armR.rotation.y = pose.ry;
    if (r.hold === 'dual') {
      r.armL.position.z = -this.recoilL * 0.14;
      r.armR.position.z = -this.recoilR * 0.14;
    } else {
      r.armL.position.z = r.armR.position.z = -this.recoilR * 0.08;
      r.anchor.position.z = this.anchorZ - this.recoilR * 0.16;
      r.center.position.z = this.centerZ - this.recoilR * 0.1;
    }

    setFlash(r, this.hurtFlash * 2.5);
    const ringBoost = this.spinT > 0 ? 3 : 1;
    r.ring.material.color.setRGB(0.25 * ringBoost, 0.85 * ringBoost, 1.0 * ringBoost);
    finishRig(r, this.game.worldTime);
  }

  updateLasers() {
    const g = this.game;
    const w = this.weapon;
    const aim = g.aimPoint;
    let m;
    if (this.rig.hold === 'dual') {
      m = this.muzzle(-1, this.facing + this.rig.armR.rotation.y);
    } else {
      const [lx, lz] = this.rig.muzzles[0];
      m = this.local(lx, lz);
    }
    let dx = aim.x - m.x;
    let dz = aim.z - m.z;
    const l = Math.hypot(dx, dz);
    if (l > 0.5) {
      dx /= l;
      dz /= l;
      if (w.scope) {
        // the sniper's sight runs all the way to the first wall
        const len = g.level.rayLength(m.x, m.z, dx, dz, 60);
        this.aimLaser.base.setRGB(1.6, 0.2, 0.25);
        this.aimLaser.set(m.x, m.z, m.x + dx * len, m.z + dz * len, 0.05, 1.1);
      } else {
        const len = g.level.rayLength(m.x, m.z, dx, dz, Math.min(l, 45));
        this.aimLaser.base.setRGB(0.25, 1.2, 1.5);
        this.aimLaser.set(m.x, m.z, m.x + dx * len, m.z + dz * len, 0.035, this.reloadT > 0 ? 0.25 : 0.7);
      }
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
