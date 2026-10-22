// DOM overlay: bars, score/combo, style feed, banners, crosshair, split-aim
// lock marker and off-screen enemy arrows.

import * as THREE from 'three';
import { COMBO_WINDOW, FOCUS, PLAYER } from './config.js';
import { withLabels } from './input.js';
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
      rank: $('rank'),
      rankLetter: $('rank-letter'),
      rankFill: $('rank-fill'),
      tutorial: $('tutorial'),
      comboMult: $('combo-mult'),
      comboFill: $('combo-fill'),
      wave: $('wave-label'),
      bossBar: $('boss-bar'),
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
    this.rankShown = 0;
    this.arrows = [];
    this.snipeWarns = []; // the edge glows of snipers taking aim
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
    this.rankShown = 0;
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
    this.set('focusOff', !g.ruleset.slowmo, (v) => e.focusBar.classList.toggle('off', v));
    this.set('focusOn', g.focusActive, (v) => {
      e.focusBar.classList.toggle('active', v);
      e.focusLabel.classList.toggle('show', v);
    });

    const reloading = p.reloadT > 0;
    const w = p.weapon;
    const special = p.slot === 'special' && p.special;
    const bare = p.unarmed; // 無槍: no pistols, nothing to count
    const lowAt = special ? Math.ceil(w.ammo * 0.15) : 6;
    this.set('ammo', bare ? '—' : special ? p.special.ammo : reloading ? -1 : p.ammo, (v) => {
      e.ammo.textContent = v < 0 ? 'RELOAD' : String(v);
      e.ammoBox.classList.toggle('reloading', v < 0);
      e.ammoBox.classList.toggle('low', v >= 0 && v <= lowAt);
    });
    this.set('ammoMax', special || bare ? '' : `/ ${w.mag}`, (v) => (e.ammoMax.textContent = v));
    this.set('weapon', bare ? 'bare' : w.id, () => {
      e.weaponName.innerHTML = bare ? '空手 <small>BARE HANDS</small>' : `${w.name} <small>${w.en}</small>`;
      e.weaponName.classList.toggle('special', !bare && w.id !== 'pistols');
    });
    this.set('slots', `${p.slot}|${p.special ? p.special.id : ''}|${p.special && p.special.empty ? 'e' : ''}|${bare}`, () => {
      const sp = p.special ? PLAYER_WEAPONS[p.special.id] : null;
      const empty = p.special && p.special.empty;
      e.slots.innerHTML =
        `<span class="slot ${p.slot === 'pistols' ? 'on' : ''}"><b>1</b>${g.ruleset.startWeapon === 'none' ? '空手' : '雙槍'}</span>` +
        (sp ? `<span class="slot ${p.slot === 'special' ? 'on' : ''} ${empty ? 'empty' : ''}"><b>2</b>${sp.name}${empty ? '（空）' : ''}</span>` : '<span class="slot empty"><b>2</b>—</span>');
    });
    const q = g.pickups.prompt;
    const t = g.thrown.prompt;
    const pad = !!g.input.pad; // a connected pad: hints name its buttons
    this.set('prompt', q ? `${pad}:e:${q.kind}` : t ? `${pad}:t:${t}` : '', (v) => {
      e.prompt.innerHTML = withLabels(q ? `{swap} 交換為 ${PLAYER_WEAPONS[q.kind].name}` : t || '', pad);
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
    // the Style rank: a pop when it climbs, a red shudder when it falls
    const rank = sc.rank;
    this.set('rank', rank.index, (v) => {
      const was = this.rankShown;
      this.rankShown = v;
      e.rank.dataset.rank = rank.name;
      e.rankLetter.textContent = rank.name;
      if (v === was) return;
      const up = v > was;
      e.rankLetter.animate(
        up
          ? [{ transform: 'scale(1.9) rotate(-8deg)', filter: 'brightness(2.2)' }, { transform: 'scale(1)', filter: 'brightness(1)' }]
          : [{ transform: 'translateX(-7px)', color: '#ff3355' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
        { duration: up ? 320 : 260, easing: 'ease-out' },
      );
    });
    this.set('rankFill', Math.round(rank.progress * 50) / 50, (v) => (e.rankFill.style.width = `${v * 100}%`));
    this.set('rankCamp', rank.camping, (v) => e.rank.classList.toggle('camp', v)); // standing still: the gauge blinks red as it drains

    this.set('tutorial', withLabels(g.tutorial.hint, pad), (v) => {
      if (v) e.tutorial.innerHTML = v;
      e.tutorial.classList.toggle('show', !!v);
    });

    const last = g.waves.rules.waves; // arcade runs show how far there is to go
    const waveLabel = g.waves.wave > 0 ? `WAVE ${g.waves.wave}${Number.isFinite(last) ? ` / ${last}` : ''}` : '';
    this.set('wave', waveLabel, (v) => (e.wave.textContent = v));
    // a boss: its name and health bar, one segment a hit (a stage's boss has fewer than the run's last)
    this.set('bossName', g.boss.active ? `${g.boss.cfg.name}/${g.boss.segments}` : '', (v) => {
      if (!v) return;
      e.bossBar.querySelector('.boss-name').innerHTML = `${g.boss.cfg.name} <small>${g.boss.cfg.label}</small>`;
      e.bossBar.querySelector('.boss-segs').innerHTML = '<i></i>'.repeat(g.boss.segments);
    });
    this.set('boss', g.boss.active ? g.boss.hp : -1, (v) => {
      e.bossBar.classList.toggle('hidden', v < 0);
      [...e.bossBar.querySelectorAll('.boss-segs i')].forEach((s, i) => s.classList.toggle('lost', i >= v));
    });
    const wv = g.waves;
    const where = g.ruleset.label ? `${g.level.map.name} · ${g.ruleset.label}` : g.level.map.name;
    const sub =
      wv.state === 'warmup'
        ? `熱身 · ${where}`
        : wv.state === 'active'
          ? `剩餘敵人 ${wv.remaining}${wv.beats.length ? ` · 第 ${wv.beatNo}/${wv.beats.length} 拍${wv.stage ? ` · ${wv.stage.name} ${wv.stage.en}` : ''}` : ''} · ${where}`
          : wv.state === 'done'
            ? `全部 ${wv.wave} 波清空 · ${where}`
            : wv.wave > 0
              ? `下一波準備中… · ${where}`
              : `準備… · ${where}`;
    this.set('waveSub', sub, (v) => (e.waveSub.textContent = v));

    const m = g.input.mouse;
    e.cross.style.transform = `translate(${m.x}px, ${m.y}px)`;
    this.set('crossSplit', !!(p.splitTarget && p.splitTarget.alive), (v) => e.cross.classList.toggle('split', v));

    this.updateLock();
    this.updateArrows();
    this.updateSnipers();
  }

  /** Where (x, z), y over the ground there, is on the screen. */
  project(x, y, z) {
    _v.set(x, y + this.game.level.groundY(x, z), z).project(this.game.camera);
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

  /** A sniper taking aim at the player: a red glow on the screen's edge on his side, stronger as the shot comes. */
  updateSnipers() {
    const g = this.game;
    const p = this.project(g.player.x, 1, g.player.z);
    let used = 0;
    for (const en of g.enemies.list) {
      if (!en.alive || !en.cfg.reload || en.state !== 'aim') continue;
      const s = this.project(en.x, 1, en.z);
      let x = s.ndcX - p.ndcX;
      let y = s.ndcY - p.ndcY;
      if (s.behind) {
        x = -x;
        y = -y;
      }
      const k = Math.max(Math.abs(x), Math.abs(y)) || 1;
      x /= k;
      y /= k;
      let w = this.snipeWarns[used];
      if (!w) {
        w = document.createElement('div');
        w.className = 'snipe-warn';
        this.el.indicators.appendChild(w);
        this.snipeWarns.push(w);
      }
      used++;
      const t = Math.min(1, en.aimT / en.aimTime);
      w.style.display = 'block';
      w.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px, ${(-y * 0.5 + 0.5) * innerHeight}px)`;
      w.style.opacity = String(0.35 + 0.65 * t);
      w.classList.toggle('hot', t > 0.78);
    }
    for (let i = used; i < this.snipeWarns.length; i++) this.snipeWarns[i].style.display = 'none';
  }

  // ------------------------------------------------------------ messages

  pushFeed(node, ms = 2400) {
    const feed = this.el.feed;
    feed.prepend(node);
    while (feed.children.length > 7) feed.lastElementChild.remove();
    setTimeout(() => node.classList.add('out'), ms);
    setTimeout(() => node.remove(), ms + 450);
  }

  feedKill(tags, mult, rulesMul = 1) {
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
    if (mult > 1 || rulesMul !== 1) {
      const row = document.createElement('div');
      row.className = 'feed-row total';
      const label = [mult > 1 ? `COMBO x${mult}` : '', rulesMul !== 1 ? `RULES x${rulesMul}` : ''].filter(Boolean).join(' · ');
      row.innerHTML = `<span>${label}</span><b>${fmt(total * mult * rulesMul)}</b>`;
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
