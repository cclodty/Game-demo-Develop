// DOM overlay: bars, score/combo, style feed, banners, crosshair, split-aim
// lock marker and off-screen enemy arrows.

import * as THREE from 'three';
import { COMBO_WINDOW, FOCUS, PLAYER } from './config.js';
import { PLAYER_WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const fmt = (n) => Math.round(n).toLocaleString('en-US');

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      root: $('hud'),
      hp: $('hp-fill'),
      hpBar: $('hp-bar'),
      focus: $('focus-fill'),
      focusBar: $('focus-bar'),
      ammo: $('ammo-count'),
      ammoMax: $('ammo-max'),
      ammoBox: $('ammo'),
      weaponName: $('weapon-name'),
      slots: $('slots'),
      prompt: $('prompt'),
      toast: $('toast'),
      reload: $('reload-fill'),
      score: $('score'),
      best: $('best'),
      combo: $('combo'),
      comboMult: $('combo-mult'),
      comboFill: $('combo-fill'),
      wave: $('wave-label'),
      waveSub: $('wave-sub'),
      feed: $('feed'),
      banner: $('banner'),
      cross: $('crosshair'),
      crossRing: $('cross-ring'),
      hitmark: $('hitmark'),
      lock: $('lock-marker'),
      indicators: $('indicators'),
      focusLabel: $('focus-label'),
    };
    this.cache = new Map();
    this.displayScore = 0;
    this.arrows = [];
    this.bannerTimer = 0;
    this.toastTimer = 0;
  }

  set(key, value, apply) {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply(value);
  }

  show(on) {
    this.el.root.classList.toggle('hidden', !on);
  }

  reset() {
    this.displayScore = 0;
    this.el.feed.innerHTML = '';
    this.cache.clear();
  }

  update(realDt) {
    const g = this.game;
    const p = g.player;
    const e = this.el;

    this.set('hp', Math.ceil(p.hp), (v) => {
      e.hp.style.transform = `scaleX(${Math.max(0, v) / PLAYER.hp})`;
      e.hpBar.classList.toggle('low', v < 35);
    });
    this.set('focus', Math.round(g.focusMeter * 200) / 200, (v) => {
      e.focus.style.transform = `scaleX(${v})`;
      e.focusBar.classList.toggle('empty', v < FOCUS.minToEnter);
    });
    this.set('focusOn', g.focusActive, (v) => {
      e.focusBar.classList.toggle('active', v);
      e.focusLabel.classList.toggle('show', v);
    });

    const reloading = p.reloadT > 0;
    const w = p.weapon;
    const special = p.slot === 'special' && p.special;
    const lowAt = special ? Math.ceil(w.ammo * 0.15) : 6;
    this.set('ammo', special ? p.special.ammo : reloading ? -1 : p.ammo, (v) => {
      e.ammo.textContent = v < 0 ? 'RELOAD' : String(v);
      e.ammoBox.classList.toggle('reloading', v < 0);
      e.ammoBox.classList.toggle('low', v >= 0 && v <= lowAt);
    });
    this.set('ammoMax', special ? '' : `/ ${w.mag}`, (v) => (e.ammoMax.textContent = v));
    this.set('weapon', w.id, () => {
      e.weaponName.innerHTML = `${w.name} <small>${w.en}</small>`;
      e.weaponName.classList.toggle('special', w.id !== 'pistols');
    });
    this.set('slots', `${p.slot}|${p.special ? p.special.id : ''}`, () => {
      const sp = p.special ? PLAYER_WEAPONS[p.special.id] : null;
      e.slots.innerHTML =
        `<span class="slot ${p.slot === 'pistols' ? 'on' : ''}"><b>1</b>雙槍</span>` +
        (sp ? `<span class="slot ${p.slot === 'special' ? 'on' : ''}"><b>2</b>${sp.name}</span>` : '<span class="slot empty"><b>2</b>—</span>');
    });
    const q = g.pickups.prompt;
    this.set('prompt', q ? q.kind : '', (v) => {
      e.prompt.innerHTML = v ? `<b>E</b> 交換為 ${PLAYER_WEAPONS[v].name}` : '';
      e.prompt.classList.toggle('show', !!v);
    });
    this.set('reload', reloading ? Math.round(p.reloadProgress * 50) / 50 : 0, (v) => {
      e.reload.style.transform = `scaleX(${v})`;
      const len = 2 * Math.PI * 15;
      e.crossRing.style.strokeDasharray = `${len * v} ${len}`;
    });

    const target = g.score.score;
    this.displayScore += (target - this.displayScore) * Math.min(1, realDt * 10);
    if (Math.abs(target - this.displayScore) < 1) this.displayScore = target;
    this.set('score', Math.round(this.displayScore), (v) => (e.score.textContent = fmt(v)));
    this.set('best', g.score.best, (v) => (e.best.textContent = `BEST ${fmt(v)}`));

    const sc = g.score;
    this.set('combo', sc.combo, (v) => {
      e.comboMult.textContent = `x${Math.max(1, Math.min(v, 16))}`;
      e.combo.classList.toggle('on', v > 1);
      if (v > 1) e.comboMult.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
    });
    this.set('comboT', Math.round((sc.comboT / COMBO_WINDOW) * 60) / 60, (v) => (e.comboFill.style.transform = `scaleX(${Math.max(0, v)})`));

    this.set('wave', g.waves.wave, (v) => (e.wave.textContent = v > 0 ? `WAVE ${v}` : ''));
    const wv = g.waves;
    const where = g.level.map.name;
    const sub = wv.state === 'active' ? `剩餘敵人 ${wv.remaining} · ${where}` : wv.wave > 0 ? `下一波準備中… · ${where}` : `準備… · ${where}`;
    this.set('waveSub', sub, (v) => (e.waveSub.textContent = v));

    const m = g.input.mouse;
    e.cross.style.transform = `translate(${m.x}px, ${m.y}px)`;
    this.set('crossSplit', !!(p.splitTarget && p.splitTarget.alive), (v) => e.cross.classList.toggle('split', v));

    this.updateLock();
    this.updateArrows();
  }

  project(x, y, z) {
    _v.set(x, y, z).project(this.game.camera);
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, ndcX: _v.x, ndcY: _v.y, behind: _v.z > 1 };
  }

  updateLock() {
    const t = this.game.player.splitTarget;
    if (!t || !t.alive) {
      this.set('lock', false, () => this.el.lock.classList.remove('show'));
      return;
    }
    this.set('lock', true, () => this.el.lock.classList.add('show'));
    const s = this.project(t.x, 1.2, t.z);
    this.el.lock.style.transform = `translate(${s.x}px, ${s.y}px)`;
  }

  updateArrows() {
    const g = this.game;
    let used = 0;
    for (const en of g.enemies.list) {
      if (!en.alive || en.state === 'enter') continue;
      const s = this.project(en.x, 1, en.z);
      let x = s.ndcX;
      let y = s.ndcY;
      if (!s.behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.92) continue;
      if (s.behind) {
        x = -x;
        y = -y;
      }
      const k = Math.max(Math.abs(x) / 0.93, Math.abs(y) / 0.88);
      x /= k;
      y /= k;
      let a = this.arrows[used];
      if (!a) {
        a = document.createElement('div');
        a.className = 'arrow';
        this.el.indicators.appendChild(a);
        this.arrows.push(a);
      }
      used++;
      const sx = (x * 0.5 + 0.5) * innerWidth;
      const sy = (-y * 0.5 + 0.5) * innerHeight;
      a.style.display = 'block';
      a.style.transform = `translate(${sx}px, ${sy}px) rotate(${Math.atan2(-y, x)}rad)`;
      a.classList.toggle('hot', en.aiming);
    }
    for (let i = used; i < this.arrows.length; i++) this.arrows[i].style.display = 'none';
  }

  // ------------------------------------------------------------ messages

  pushFeed(node, ms = 2400) {
    const feed = this.el.feed;
    feed.prepend(node);
    while (feed.children.length > 7) feed.lastElementChild.remove();
    setTimeout(() => node.classList.add('out'), ms);
    setTimeout(() => node.remove(), ms + 450);
  }

  feedKill(tags, mult) {
    const block = document.createElement('div');
    block.className = 'feed-block kill';
    let total = 0;
    for (const t of tags) {
      total += t.pts;
      const row = document.createElement('div');
      row.className = `feed-row ${t.cls || ''}`;
      row.innerHTML = `<span>${t.label}</span><b>+${t.pts}</b>`;
      block.appendChild(row);
    }
    if (mult > 1) {
      const row = document.createElement('div');
      row.className = 'feed-row total';
      row.innerHTML = `<span>COMBO x${mult}</span><b>${fmt(total * mult)}</b>`;
      block.appendChild(row);
    }
    this.pushFeed(block, 2600);
  }

  feed(label, pts, cls = '') {
    const block = document.createElement('div');
    block.className = `feed-block ${cls}`;
    block.innerHTML = `<div class="feed-row"><span>${label}</span><b>+${fmt(pts)}</b></div>`;
    this.pushFeed(block, 1800);
  }

  banner(main, sub = '', cls = '') {
    const b = this.el.banner;
    b.innerHTML = `<div class="b-main">${main}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    b.className = '';
    void b.offsetWidth;
    b.className = `show ${cls}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => (b.className = ''), 2600);
  }

  toast(html) {
    const t = this.el.toast;
    t.innerHTML = html;
    t.className = '';
    void t.offsetWidth;
    t.className = 'show';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (t.className = ''), 1700);
  }

  hitMarker(kill) {
    this.el.hitmark.animate(
      [
        { opacity: 1, transform: `scale(${kill ? 1.5 : 1.1}) rotate(45deg)` },
        { opacity: 0, transform: 'scale(0.8) rotate(45deg)' },
      ],
      { duration: kill ? 320 : 160, easing: 'ease-out' },
    );
    if (kill) this.el.hitmark.classList.add('kill');
    else this.el.hitmark.classList.remove('kill');
  }
}
