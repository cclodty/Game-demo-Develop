import * as THREE from 'three';
import { AudioSys } from './audio.js';
import { Bullets } from './bullets.js';
import { buildCharacter, disposeRig } from './characters.js';
import { Clip } from './clip.js';
import { Achievements, ACHIEVEMENTS, COAT_UNLOCK, COATS } from './achievements.js';
import { CAMERA, FOCUS, GUN_Y, LOGIC_HZ, PAD, PLAYER, RANK, RATING, VIEWS } from './config.js';
import { Enemies, TYPES as ENEMY_TYPES } from './enemies.js';
import { FX } from './fx.js';
import { HUD } from './hud.js';
import { ACTIONS, Input, keyName, padButtonName, padLabel, StepInput } from './input.js';
import { Level } from './level.js';
import { MAPS } from './maps.js';
import { loadedCharacters, loadModels } from './models.js';
import { Notes } from './notes.js';
import { Pickups } from './pickups.js';
import { Player } from './player.js';
import { PostFX } from './postfx.js';
import { readQuality } from './quality.js';
import { countdown, dailyFor, DailyStore, msToNextDay, shareCode, utcDay } from './daily.js';
import { fromBase64, InputRecord, RecordReader, ReplayStore, toBase64 } from './replay.js';
import { Leaderboard } from './leaderboard.js';
import { randomSeed, readSeed, Rng, vfxRng } from './rng.js';
import { DIFFICULTIES, DIFFICULTY_IDS, packRules, rulesFor, unpackRules, VARIANT_IDS, VARIANTS } from './rules.js';
import { rate, Score } from './score.js';
import { Style } from './style.js';
import { Telemetry } from './telemetry.js';
import { Thrown } from './thrown.js';
import { Settings } from './settings.js';
import { Tutorial, wantWarmup } from './tutorial.js';
import { clamp, damp, lerp } from './utils.js';
import { MODE_IDS, MODES, Waves } from './waves.js';
import { Grenades } from './weapons.js';
import { BOSSES, Bosses } from './boss.js';
import { SONGS } from './music.js';

const MAP_KEY = 'bullet-ballet.map';
const MODE_KEY = 'bullet-ballet.mode';
const RULES_KEY = 'bullet-ballet.rules';
const VIEW_KEY = 'bullet-ballet.view';
const DEFAULT_VIEW = VIEWS.findIndex((v) => v.id === 'iso');
const STEP = 1 / LOGIC_HZ;

const $ = (id) => document.getElementById(id);
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const TOGGLES = new Set(['checkbox', 'radio', 'range', 'button']);
const isTyping = (t) => !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !TOGGLES.has(t.type)) || t.isContentEditable);

class Game {
  constructor() {
    this.quality = readQuality(); // 'high' or 'low' (no bloom, no shadows, pixel ratio 1)
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.quality === 'low' ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    $('game').appendChild(this.renderer.domElement);
    this.renderer.info.autoReset = false; // reset once per frame in render(), so the stats panel sees the whole frame

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.5, 400);
    // 45° side view by default; V cycles the others and the choice is remembered
    this.view = DEFAULT_VIEW;
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved !== null) this.view = clamp(Math.floor(Number(saved)) || 0, 0, VIEWS.length - 1);
    } catch {
      /* storage unavailable */
    }
    this.camPitch = 1;
    this.camYaw = 0;

    // Game logic draws from rng, reseeded every run (with ?seed=123 the same input
    // plays the same run); effects draw from vfxRng and never touch the game (see rng.js).
    this.fixedSeed = readSeed();
    this.rng = new Rng(this.fixedSeed ?? randomSeed());
    this.vfxRng = vfxRng;

    // The logic advances in fixed steps of 1/LOGIC_HZ s. Each step reads one
    // StepInput (cmd), latched from the keyboard and mouse, or handed in by
    // feed when set (tests; later, replays), and appends it to the run's record.
    this.input = new Input();
    this.cmd = new StepInput();
    this.feed = null;
    this.record = new InputRecord();
    this.replays = new ReplayStore(); // the last ten runs' records, for the replay list
    this.replay = null; // while a record plays back: { rd, speed, meta, mode }
    this.now = () => Date.now(); // the wall clock, read only to pick the daily challenge's day (tests set their own)
    this.daily = new DailyStore(); // this browser's daily results
    this.dailyRun = null; // during a daily run and its end screen: { day, mode }
    this.boards = new Leaderboard(); // the back end's boards when BACKEND.url is set, this browser's otherwise
    this.acc = 0;
    this.stepCount = 0;
    this.frameSteps = 0;
    this.aimFresh = true; // updateAim() resampled the cursor since a step last took it
    this.aimStep = -2;
    this.aimEvery = 1;
    this.audio = new AudioSys();
    this.fx = new FX(this);
    this.style = new Style(this); // the look; before the level, whose materials it converts as they load
    this.maps = MAPS;
    this.enemyTypes = ENEMY_TYPES; // for the tests and the stats panel
    this.startMap = 0;
    try {
      this.startMap = Math.min(MAPS.length - 1, Math.max(0, Number(localStorage.getItem(MAP_KEY)) || 0));
    } catch {
      this.startMap = 0;
    }
    this.mode = 'arcade'; // see MODES in waves.js; the title screen switches it
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (MODE_IDS.includes(saved)) this.mode = saved;
    } catch {
      /* storage unavailable */
    }
    // achievements and what they open (achievements.js); a locked rule pick is not on offer
    this.achievements = new Achievements(localStorage, (a) => this.onAchievement(a));
    // the run rules picked on the title screen (rules.js); a run fixes them as ruleset
    this.difficulty = 'normal';
    this.variants = [];
    try {
      const saved = JSON.parse(localStorage.getItem(RULES_KEY) || '{}');
      if (DIFFICULTY_IDS.includes(saved.difficulty)) this.difficulty = saved.difficulty;
      if (Array.isArray(saved.variants)) this.variants = VARIANT_IDS.filter((id) => saved.variants.includes(id) && this.isOpen(id));
    } catch {
      /* storage unavailable or unreadable */
    }
    this.ruleset = rulesFor(this.difficulty, this.variants);
    this.fixedRules = null; // { difficulty, variants } from a replayed record
    this.stage = 0;
    this.transition = null;
    this.level = new Level(this);
    if (this.startMap) this.level.load(MAPS[this.startMap]);
    this.bullets = new Bullets(this);
    this.grenades = new Grenades(this);
    this.bosses = new Bosses(this); // each stage's last wave: the boss of its map, if it has one (boss.js)
    this.boss = this.bosses.view; // whichever boss this run has, as one object
    this.pickups = new Pickups(this);
    this.thrown = new Thrown(this);
    this.tutorial = new Tutorial(this);
    this.enemies = new Enemies(this);
    this.player = new Player(this);
    this.score = new Score(this);
    this.waves = new Waves(this);
    this.hud = new HUD(this);
    // the settings (settings.js): volumes and bindings, applied to the input, the audio and the hints
    this.settings = new Settings(localStorage);
    this.binding = null; // { id, pad } while the settings page waits for a key or a pad button
    this.applySettings();
    this.clip = new Clip(this); // the best kill, recorded for the end screen
    this.telemetry = new Telemetry(); // each run's record in this browser, for the feedback export
    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.post.setSize(innerWidth, innerHeight);
    this.post.bloom.enabled = this.quality !== 'low';
    this.applyMapView();

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GUN_Y);
    this.padDir = new THREE.Vector2(0, -1); // the right stick's last direction on the floor
    this.padScreen = new THREE.Vector3();
    this.padOn = false; // a pad is connected (the hints name its buttons)
    const start = this.level.start;
    this.aimPoint = new THREE.Vector3(start.x, GUN_Y, start.z - 5);
    this.camTarget = new THREE.Vector3(start.x, 0, start.z);
    this.zoom = 1;
    this.trauma = 0;

    this.state = 'title';
    this.focusActive = false;
    this.focusAmt = 0;
    this.focusMeter = 1;
    this.timeScale = 1;
    this.playerVelScale = 1;
    this.hitstopT = 0;
    this.killcamT = 0;
    this.killcamPos = new THREE.Vector3();
    this.ripple = -1;
    this.rippleCenter = new THREE.Vector2(0.5, 0.5);
    this.hurtFx = 0;
    this.flashFx = 0;
    this.heartT = 0;
    this.deathT = 0;
    this.overAt = 0;
    this.worldTime = 0;
    this.lastKillAt = -9;
    this.lastKillPos = null; // where the last kill fell (ROAM)
    this.lastCloseCall = -LOGIC_HZ; // a logic step number
    this.time = 0; // real time for what is only shown (camera shake, title sway, pulses)
    this.last = performance.now();
    this.notes = new Notes(this);

    addEventListener('resize', () => this.resize());
    this.warmCharacters();
    this.bindUI();
    this.updateCamera(1, true);
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Compile every worn character model's shaders now, so the first enemy of a kind doesn't stutter. */
  warmCharacters() {
    const rigs = loadedCharacters().map((model) => buildCharacter({ model }));
    if (!rigs.length) return;
    for (const r of rigs) {
      r.root.position.set(0, -50, 0);
      this.scene.add(r.root);
    }
    this.renderer.compile(this.scene, this.camera);
    for (const r of rigs) {
      this.scene.remove(r.root);
      disposeRig(r);
    }
  }

  // ------------------------------------------------------------ flow

  bindUI() {
    const start = (map = this.startMap) => {
      this.audio.init();
      this.startRun(map);
    };
    for (const id of MODE_IDS) {
      const m = MODES[id];
      if (m.daily) continue; // it has its own card
      const b = document.createElement('button');
      b.className = 'mode-card';
      b.type = 'button';
      b.dataset.mode = id;
      b.style.setProperty('--mode', m.color);
      b.innerHTML = `<span class="mode-zh">${m.name}</span><span class="mode-en">${m.en}</span><span class="mode-desc">${m.desc}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // choosing a mode is not starting a run
        this.setMode(id);
      });
      $('mode-cards').appendChild(b);
    }
    this.markMode();
    const ruleCard = (id, r, row, onClick) => {
      const b = document.createElement('button');
      b.className = 'mode-card';
      b.type = 'button';
      b.dataset.rule = id;
      b.style.setProperty('--mode', r.color);
      b.innerHTML = `<span class="mode-zh">${r.name}</span><span class="mode-en">${r.en}</span><span class="mode-desc">${r.desc}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation(); // picking a rule is not starting a run
        onClick(id);
      });
      $(row).appendChild(b);
    };
    for (const id of DIFFICULTY_IDS) ruleCard(id, DIFFICULTIES[id], 'difficulty-cards', (d) => this.setRules(d, this.variants));
    for (const id of VARIANT_IDS) {
      ruleCard(id, VARIANTS[id], 'variant-cards', (v) =>
        this.setRules(this.difficulty, this.variants.includes(v) ? this.variants.filter((x) => x !== v) : [...this.variants, v]),
      );
    }
    // the coat colours (open with an achievement) and the achievements page
    for (const c of COATS) {
      const b = document.createElement('button');
      b.className = 'mode-card';
      b.type = 'button';
      b.dataset.coat = c.id;
      b.style.setProperty('--mode', `#${c.rgb.toString(16).padStart(6, '0')}`);
      b.innerHTML = `<span class="mode-zh">${c.name}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.achievements.setCoat(c.id);
        this.player.setCoat(c);
        this.markRules();
      });
      $('coat-cards').appendChild(b);
    }
    $('open-achievements').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showAchievements(true);
    });
    $('achievements').addEventListener('click', (e) => e.stopPropagation());
    $('achievements-close').addEventListener('click', () => this.showAchievements(false));
    // difficulty, variants and coat fold away under one line that says what is picked
    $('open-rules').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showRules($('rules-fold').classList.contains('hidden'));
    });
    $('rules-fold').addEventListener('click', (e) => e.stopPropagation()); // the gaps between cards are not a start
    // the controls and tips have a page of their own
    $('open-help').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showHelp(true);
    });
    $('help').addEventListener('click', (e) => e.stopPropagation());
    $('help-close').addEventListener('click', () => this.showHelp(false));
    // the settings page, over the title or the pause menu
    $('open-settings').addEventListener('click', (e) => {
      e.stopPropagation();
      this.showSettings(true);
    });
    $('settings').addEventListener('click', (e) => e.stopPropagation());
    $('settings-close').addEventListener('click', () => this.showSettings(false));
    $('set-reset').addEventListener('click', () => {
      this.settings.reset();
      this.binding = null;
      this.applySettings();
      this.renderSettings();
    });
    for (const id of ['music', 'sfx']) {
      $(`set-${id}`).addEventListener('input', (e) => {
        this.settings[id] = Number(e.target.value) / 100;
        this.settings.save();
        this.applySettings();
        $(`set-${id}-v`).textContent = `${Math.round(this.settings[id] * 100)}%`;
      });
    }
    $('set-song').addEventListener('change', (e) => {
      this.settings.song = e.target.value;
      this.settings.save();
      this.applySettings();
      this.renderSettings();
    });
    $('set-keys').addEventListener('click', (e) => {
      const b = e.target.closest('button.bind');
      if (!b) return;
      this.binding = { id: b.dataset.action, pad: b.dataset.pad === '1' };
      this.renderSettings();
    });
    // a middle or right mouse button can be bound too; a left click anywhere stops listening
    $('settings').addEventListener('mousedown', (e) => {
      if (!this.binding || this.binding.pad) return;
      if (e.button === 0) return;
      e.preventDefault();
      this.settings.bindKey(this.binding.id, `Mouse${e.button}`);
      this.binding = null;
      this.applySettings();
      this.renderSettings();
    });
    this.markRules();
    if (this.achievements.coatOpen) this.player.setCoat(COATS.find((c) => c.id === this.achievements.coat));
    // the first visit: the local records switch (on unless turned off)
    const tele = $('telemetry-on');
    tele.checked = this.telemetry.on;
    $('telemetry-switch').classList.toggle('hidden', this.telemetry.asked);
    $('telemetry-switch').addEventListener('click', (e) => e.stopPropagation()); // not a start
    tele.addEventListener('change', () => this.telemetry.setOn(tele.checked));
    $('telemetry-ok').addEventListener('click', () => {
      this.telemetry.confirm();
      $('telemetry-switch').classList.add('hidden');
    });
    const cards = $('map-cards');
    MAPS.forEach((m, i) => {
      const b = document.createElement('button');
      b.className = 'map-card';
      b.type = 'button';
      b.style.setProperty('--map', m.color);
      b.innerHTML = `<span class="map-key">${i + 1}</span><span class="map-zh">${m.name}</span><span class="map-en">${m.en}</span><span class="map-desc">${m.desc}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        start(i);
      });
      // pointing at a card shows its route
      for (const ev of ['mouseenter', 'focus']) b.addEventListener(ev, () => this.markRoute(i));
      for (const ev of ['mouseleave', 'blur']) b.addEventListener(ev, () => this.markRoute());
      cards.appendChild(b);
    });
    this.markMapCard();
    $('title').addEventListener('click', () => start());
    // the daily challenge card
    $('daily-card').addEventListener('click', (e) => e.stopPropagation()); // not a start of the picked mode
    $('daily-start').addEventListener('click', () => {
      this.audio.init();
      this.startDaily();
    });
    $('daily-replay').addEventListener('click', () => this.playDailyReplay());
    $('go-daily-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      const code = $('go-daily-code').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(() => {});
      $('go-daily-copy').textContent = '已複製';
    });
    this.renderDaily();
    this.refreshGlobal();
    setInterval(() => {
      if (this.state === 'title') this.renderDaily(); // the countdown
    }, 1000);
    $('gameover').addEventListener('click', () => {
      if (this.clipOn) this.endClip(); // a click skips the clip
      else if (this.replay || this.dailyRun) this.toTitle(); // a replay's or a daily's end goes back to the title
      else if (performance.now() - this.overAt > 700) start();
    });
    // the leaderboards
    $('open-boards').addEventListener('click', (e) => {
      e.stopPropagation(); // not a start
      this.showBoards(true);
    });
    $('boards').addEventListener('click', (e) => e.stopPropagation());
    $('boards-close').addEventListener('click', () => this.showBoards(false));
    for (const tab of document.querySelectorAll('#board-tabs button')) {
      tab.addEventListener('click', () => this.renderBoard(tab.dataset.board));
    }
    $('board-name-save').addEventListener('click', () => {
      const name = this.boards.setName($('board-name').value);
      $('board-msg').textContent = name ? `暱稱改為「${name}」` : '暱稱要 1 到 16 個字：文字、數字、空格或 _ . -';
      if (name) $('board-name').value = name;
    });
    $('go-name-save').addEventListener('click', (e) => {
      e.stopPropagation();
      const name = this.boards.setName($('go-name').value);
      if (!name) {
        $('go-board-text').textContent = '暱稱要 1 到 16 個字：文字、數字、空格或 _ . -';
        return;
      }
      $('go-name-row').classList.add('hidden');
      if (this.pendingUpload) this.sendRun(this.pendingUpload);
    });
    $('go-name').addEventListener('click', (e) => e.stopPropagation());
    // the replay list
    $('open-replays').addEventListener('click', (e) => {
      e.stopPropagation(); // not a start
      this.showReplays(true);
    });
    $('replays').addEventListener('click', (e) => e.stopPropagation());
    $('replays-close').addEventListener('click', () => this.showReplays(false));
    $('replay-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const err = this.playReplay(bytes, { name: file.name });
      if (err) this.renderReplays(`無法播放 ${file.name}：${err}`);
    });
    $('go-clip-save').addEventListener('click', (e) => e.stopPropagation()); // saving is not restarting
    $('pause').addEventListener('click', () => this.setPaused(false));
    const menu = {
      settings: () => this.showSettings(true),
      resume: () => this.setPaused(false),
      restart: () => (this.dailyRun ? this.toTitle() : start()), // a daily has one try
      title: () => this.toTitle(),
      note: () => this.notes.openNote(),
      export: () => this.notes.download(),
    };
    for (const b of document.querySelectorAll('.menu button[data-act]')) { // the pause menu's (the pages' back buttons have their own)
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        menu[b.dataset.act]();
      });
    }
    addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return; // the note box handles its own keys
      if (this.binding) {
        // the settings page waits for a key: this one is it (Esc cancels; a pad binding ignores the keyboard)
        e.preventDefault();
        if (e.code !== 'Escape' && !this.binding.pad) this.settings.bindKey(this.binding.id, e.code);
        if (e.code === 'Escape' || !this.binding.pad) {
          this.binding = null;
          this.applySettings();
          this.renderSettings();
        }
        return;
      }
      if (e.code === 'Escape' && !$('settings').classList.contains('hidden')) {
        this.showSettings(false);
        return;
      }
      const act = this.input.actionOf(e.code); // the rebindable ui keys: the camera, the music, a note
      if (this.replay && (this.state === 'playing' || this.state === 'dying')) {
        // a replay: 1 / 2 / 3 for half, normal and double speed, Esc to leave; the game's own keys do nothing
        const speed = { Digit1: 0.5, Digit2: 1, Digit3: 2 }[e.code];
        if (speed) this.setReplaySpeed(speed);
        else if (e.code === 'Escape') this.toTitle();
        return;
      }
      if (e.code === 'Escape' && !$('replays').classList.contains('hidden')) {
        this.showReplays(false);
        return;
      }
      if (e.code === 'Escape' && !$('boards').classList.contains('hidden')) {
        this.showBoards(false);
        return;
      }
      if (e.code === 'Escape' && !$('achievements').classList.contains('hidden')) {
        this.showAchievements(false);
        return;
      }
      if (e.code === 'Escape' && !$('help').classList.contains('hidden')) {
        this.showHelp(false);
        return;
      }
      if (e.code === 'Escape' && this.state === 'playing' && this.tutorial.active) return; // Esc skips the warm-up (a recorded control) instead of pausing
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.notes.noteOpen) this.notes.cancelNote();
        else if (this.state === 'playing') this.setPaused(true);
        else if (this.state === 'paused') this.setPaused(false);
      } else if (e.code === 'Backquote') {
        this.notes.togglePanel();
      } else if (act === 'note' && (this.state === 'playing' || this.state === 'paused')) {
        e.preventDefault(); // or the key lands in the note box it just focused
        this.notes.openNote();
      } else if (e.code === 'KeyR' && this.state === 'paused') {
        if (this.dailyRun) this.toTitle();
        else start();
      } else if (e.code === 'KeyT') {
        if (this.state === 'paused' || (this.state === 'over' && performance.now() - this.overAt > 700)) this.toTitle();
      } else if (act === 'view' && this.state !== 'paused') {
        this.cycleView();
      } else if (act === 'music') {
        const on = this.audio.toggleMusic();
        if (this.state === 'playing') this.hud.feed(on ? 'MUSIC ON' : 'MUSIC OFF', 0, 'dim');
      } else if (e.code === 'Enter') {
        if (this.state === 'title') {
          if (!$('title').classList.contains('hidden')) start(); // not from a page over it (help, boards…)
        } else if (this.clipOn) this.endClip();
        else if (this.state === 'over' && (this.replay || this.dailyRun)) this.toTitle();
        else if (this.state === 'over' && performance.now() - this.overAt > 700) start();
      } else if (this.state === 'title' && !$('title').classList.contains('hidden') && /^Digit[1-9]$/.test(e.code)) {
        const i = Number(e.code.slice(5)) - 1;
        if (i < MAPS.length) start(i);
      }
    });
    addEventListener('blur', () => this.setPaused(true));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.setPaused(true);
    });
  }

  markMapCard() {
    [...$('map-cards').children].forEach((c, i) => c.classList.toggle('selected', i === this.startMap));
    this.markRoute();
  }

  setMode(id) {
    this.mode = id;
    try {
      localStorage.setItem(MODE_KEY, id);
    } catch {
      /* storage unavailable */
    }
    this.markMode();
  }

  markMode() {
    for (const c of $('mode-cards').children) c.classList.toggle('selected', c.dataset.mode === this.mode);
    this.markRoute();
  }

  /** The maps note: how the mode goes, and in arcade the route from the map card picked (or pointed at). */
  markRoute(start = this.startMap) {
    const r = MODES[this.mode];
    $('maps-note').textContent = Number.isFinite(r.waves) ? `每 ${r.perStage} 波換一個場景，第 ${r.waves} 波完結：${this.routeText(start, this.mode)}` : `每 ${r.perStage} 波換一個場景`;
  }

  /** Whether a variant is on offer: open from the start, or its achievement is done. */
  isOpen(id) {
    const v = VARIANTS[id];
    return !!v && (!v.unlock || this.achievements.has(v.unlock));
  }

  /** Pick the difficulty and variants for the next run (the title screen), and remember them. */
  setRules(difficulty, variants) {
    this.difficulty = DIFFICULTY_IDS.includes(difficulty) ? difficulty : 'normal';
    this.variants = VARIANT_IDS.filter((id) => variants.includes(id) && this.isOpen(id));
    try {
      localStorage.setItem(RULES_KEY, JSON.stringify({ difficulty: this.difficulty, variants: this.variants }));
    } catch {
      /* storage unavailable */
    }
    this.markRules();
  }

  markRules() {
    for (const c of $('difficulty-cards').children) c.classList.toggle('selected', c.dataset.rule === this.difficulty);
    for (const c of $('variant-cards').children) {
      c.classList.toggle('selected', this.variants.includes(c.dataset.rule));
      c.classList.toggle('hidden', !this.isOpen(c.dataset.rule));
    }
    const ach = this.achievements;
    $('coat-row').classList.toggle('hidden', !ach.coatOpen);
    for (const c of $('coat-cards').children) c.classList.toggle('selected', c.dataset.coat === ach.coat);
    const coat = ach.coatOpen && COATS.find((c) => c.id === ach.coat);
    const picked = [DIFFICULTIES[this.difficulty].name, this.variants.length ? this.variants.map((v) => VARIANTS[v].name).join('、') : '沒有變體'];
    if (coat) picked.push(`${coat.name}色外套`);
    $('rules-summary').textContent = picked.join(' · ');
  }

  /** Open or fold the title's difficulty, variant and coat picks. */
  showRules(on) {
    $('rules-fold').classList.toggle('hidden', !on);
    $('open-rules').setAttribute('aria-expanded', String(on));
  }

  /** The settings take effect: the input's bindings, the audio's volumes, the hints' key names and the HUD's key strip. */
  applySettings() {
    const s = this.settings;
    this.input.setBindings(s);
    this.audio.setVolumes(s.music, s.sfx);
    this.audio.setChoice(s.song);
    this.audio.setStage(this.stage || 0, !this.audio.ctx); // a new choice comes in on the bar line (at once before the music has started)
    const strip = ACTIONS.filter((a) => a.strip).map((a) => `<span><b>${keyName(s.keys[a.id])}${a.id === 'focus' && s.keys.focus === 'ShiftLeft' ? ' / Q' : ''}</b> ${a.strip}</span>`);
    strip.splice(6, 0, '<span><b>1 / 2</b> 切換</span>');
    strip.splice(strip.length - 1, 0, '<span><b>Esc</b> 暫停</span>');
    $('hint').innerHTML = strip.join('');
    this.hud.update(0);
  }

  /** The settings page, over the title or the pause menu. */
  showSettings(on) {
    $('settings').classList.toggle('hidden', !on);
    if (this.state === 'paused') $('pause').classList.toggle('hidden', on);
    else $('title').classList.toggle('hidden', on);
    if (!on) this.binding = null;
    if (on) this.renderSettings();
  }

  /** What the settings page shows: the sliders, and a key and a pad button for every action. */
  renderSettings() {
    const s = this.settings;
    for (const id of ['music', 'sfx']) {
      $(`set-${id}`).value = String(Math.round(s[id] * 100));
      $(`set-${id}-v`).textContent = `${Math.round(s[id] * 100)}%`;
    }
    // the song: the playlist (one a stage) or any one song for every stage; a ?music= on the address wins for this visit
    const sel = $('set-song');
    const auto = `每個場景輪流（${this.audio.defaultPlaylist.map((id) => SONGS[id].name.split(' ')[0]).join(' → ')}）`;
    const options = [['auto', auto], ...Object.entries(SONGS).map(([id, song]) => [id, song.name])];
    sel.innerHTML = options.map(([id, name]) => `<option value="${id}"${(this.audio.asked || s.song) === id ? ' selected' : ''}>${name}</option>`).join('');
    sel.disabled = !!this.audio.asked;
    $('set-song-note').textContent = this.audio.asked ? `這次由網址的 ?music=${this.audio.asked} 指定` : '';
    const rows = ACTIONS.map((a) => {
      const listening = (pad) => this.binding && this.binding.id === a.id && this.binding.pad === pad;
      const key = listening(false) ? '<span class="listening">按一個鍵…</span>' : keyName(s.keys[a.id]);
      // the pad column: a button to rebind, or the fixed shoulder combination (LB+RB, LB alone) or nothing for a ui key
      const fixed = a.ui ? '—' : a.padFixed || null;
      const pad = listening(true) ? '<span class="listening">按手掣按鈕…</span>' : Number.isInteger(s.pad[a.id]) ? padButtonName(s.pad[a.id]) : '—';
      return `<div class="set-key"><span class="set-name">${a.name} <small>${a.en}</small></span><button type="button" class="bind${listening(false) ? ' on' : ''}" data-action="${a.id}" data-pad="0">${key}</button>${fixed ? `<span class="set-none">${fixed}</span>` : `<button type="button" class="bind${listening(true) ? ' on' : ''}" data-action="${a.id}" data-pad="1">${pad}</button>`}</div>`;
    });
    $('set-keys').innerHTML = `<div class="set-key set-head"><span></span><span>鍵盤</span><span>手掣</span></div>${rows.join('')}`;
    $('set-msg').textContent = this.binding ? (this.binding.pad ? '按下手掣上的一個按鈕；Esc 取消' : '按下新的鍵（中鍵、右鍵也可以）；Esc 取消') : '';
  }

  /** The controls and tips page, over the title. */
  showHelp(on) {
    $('help').classList.toggle('hidden', !on);
    $('title').classList.toggle('hidden', on);
    if (on) $('help-close').focus();
  }

  /** An achievement is done: say so, with what it opens, and put the opened picks on the title. */
  onAchievement(a) {
    const opens = Object.values(VARIANTS)
      .filter((v) => v.unlock === a.id)
      .map((v) => v.name);
    if (a.id === COAT_UNLOCK) opens.push('外套顏色');
    this.hud.toast(`成就：${a.name} <small>${a.en}</small>${opens.length ? `<br>解鎖：${opens.join('、')}` : ''}`);
    this.notes.log(`成就：${a.name}${opens.length ? `（解鎖 ${opens.join('、')}）` : ''}`);
    this.audio.pickup();
    this.markRules();
  }

  showAchievements(on) {
    $('achievements').classList.toggle('hidden', !on);
    $('title').classList.toggle('hidden', on);
    if (!on) return;
    const ach = this.achievements;
    const list = $('ach-list');
    list.textContent = '';
    for (const a of ACHIEVEMENTS) {
      const row = document.createElement('div');
      row.className = `ach-row${ach.has(a.id) ? ' done' : ''}`;
      const p = ach.progress(a);
      const opens = Object.values(VARIANTS)
        .filter((v) => v.unlock === a.id)
        .map((v) => v.name);
      if (a.id === COAT_UNLOCK) opens.push('外套顏色');
      const cell = (cls, text) => {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = text;
        row.appendChild(s);
      };
      cell('ach-mark', ach.has(a.id) ? '✓' : p.need > 1 ? `${p.have}/${p.need}` : '');
      cell('ach-name', `${a.name} ${a.en}`);
      cell('ach-desc', a.desc);
      cell('ach-opens', opens.length ? `解鎖：${opens.join('、')}` : '');
      list.appendChild(row);
    }
    $('ach-count').textContent = `已完成 ${ACHIEVEMENTS.filter((a) => ach.has(a.id)).length} / ${ACHIEVEMENTS.length}`;
  }

  startRun(mapIndex = this.startMap) {
    // a run left from the pause menu (restart) ends as a quit
    if (this.state === 'paused' || this.state === 'playing') this.endAsQuit();
    this.startMap = mapIndex;
    this.markMapCard();
    try {
      localStorage.setItem(MAP_KEY, String(mapIndex));
    } catch {
      /* storage unavailable */
    }
    this.rng.reset(this.fixedSeed ?? randomSeed());
    // a first run opens with the warm-up; a replay plays it if its record did (fixedWarmup)
    const warmup = this.fixedWarmup ?? wantWarmup();
    // the rules hold for the whole run (a replay brings its own: fixedRules)
    const pick = this.fixedRules ?? { difficulty: this.difficulty, variants: this.variants };
    this.ruleset = rulesFor(pick.difficulty, pick.variants);
    const rules = packRules(this.ruleset.difficulty, this.ruleset.variants);
    this.record = new InputRecord({ seed: this.rng.seed, map: mapIndex, mode: MODE_IDS.indexOf(this.mode), warmup, rules, hz: LOGIC_HZ });
    this.resetWorld(MAPS[mapIndex]);
    this.score.useBest(this.mode, this.ruleset);
    this.score.reset();
    this.waves.reset();
    this.hud.reset();
    this.notes.reset(MAPS[mapIndex]);
    if (this.ruleset.label) this.notes.log(`規則：${this.ruleset.label}`);
    // the music: the first stage's song from its start, on its base (audio.js)
    this.audio.setStage(0, true);
    this.audio.setLevel(0);
    this.notes.log(`音樂：${this.audio.song.name}`);
    this.telemetry.confirm(); // the switch was on the title screen: playing is leaving it as it is
    $('telemetry-switch').classList.add('hidden');
    if (!this.replay) this.telemetry.start({ map: MAPS[mapIndex].name, mode: MODES[this.mode].name, rules: this.ruleset.label, view: VIEWS[this.view].name, warmup, input: this.padOn ? 'pad' : 'keyboard', daily: !!this.dailyRun });
    $('replay-badge').classList.toggle('hidden', !this.replay);
    document.body.classList.toggle('replaying', !!this.replay);
    this.deathCause = '';
    if (warmup) {
      this.waves.startWarmup();
      this.tutorial.start();
    }
    this.endClip();
    this.clip.start();
    this.achievements.startRun();
    this.achievements.watching = !!this.replay; // a replay earns nothing
    this.rankSeen = 0;
    this.state = 'playing';
    $('title').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('pause').classList.add('hidden');
    document.body.classList.add('playing');
    this.hud.show(true);
    this.audio.resume();
    this.updateCamera(1, true);
    this.last = performance.now();
  }

  /** Abandon the run (from pause or game over) and go back to the map select. */
  /**
   * The day's challenge (daily.js): the date picks the seed, map and rules; one try a day in this
   * browser, taken as soon as the run starts. Returns whether it started.
   */
  startDaily() {
    const day = utcDay(this.now());
    if (!this.daily.canPlay(day)) {
      this.renderDaily('今天已經打過了：可以看重播，明天再來。');
      return false;
    }
    const d = dailyFor(day);
    if (this.replay) this.endReplay();
    const keep = { seed: this.fixedSeed, warmup: this.fixedWarmup, rules: this.fixedRules };
    this.fixedSeed = d.seed;
    this.fixedWarmup = false; // the same run for everyone: no warm-up
    this.fixedRules = { difficulty: d.difficulty, variants: d.variants };
    this.dailyRun = { day, mode: this.mode };
    this.mode = 'daily';
    this.daily.begin(day);
    this.startRun(d.map);
    Object.assign(this, { fixedSeed: keep.seed, fixedWarmup: keep.warmup, fixedRules: keep.rules });
    this.notes.log(`每日挑戰 ${day}`);
    return true;
  }

  /** Leave the daily: the title's mode comes back. */
  endDaily() {
    if (!this.dailyRun) return;
    this.mode = this.dailyRun.mode;
    this.dailyRun = null;
  }

  /** Watch the day's run again (the only way to see it after the one try). */
  playDailyReplay() {
    const r = this.daily.replay;
    if (!r) return;
    const err = this.playReplay(fromBase64(r.data), { name: `每日挑戰 ${r.day}` });
    if (err) this.renderDaily(`無法播放：${err}`);
  }

  /** With a back end (config.js BACKEND.url): the world's daily challenges today and yesterday on the daily card, from /stats (asked at most once a minute; nothing shows when it fails). */
  refreshGlobal() {
    const el = $('daily-global');
    if (!this.boards.online) {
      el.classList.add('hidden');
      return;
    }
    const at = performance.now();
    if (this.globalAt && at - this.globalAt < 60000) return;
    this.globalAt = at;
    this.boards.stats().then((days) => {
      if (!days) return;
      const today = utcDay(this.now());
      const yesterday = utcDay(this.now() - 86400000);
      const count = (d) => (days.find((x) => x.day === d) || { daily: 0 }).daily;
      el.textContent = `全球：今天 ${count(today)} 局 · 昨天 ${count(yesterday)} 局`;
      el.classList.remove('hidden');
    });
  }

  /** The title's daily card: today's map and rules, start or today's result, and the time to the next one. */
  renderDaily(msg = '') {
    const now = this.now();
    const day = utcDay(now);
    const d = dailyFor(day);
    const rules = rulesFor(d.difficulty, d.variants).label || '正常';
    $('daily-what').textContent = `${day}（UTC） · ${this.routeText(d.map, 'daily')} · ${rules}`;
    const done = this.daily.days[day];
    $('daily-start').classList.toggle('hidden', !!done);
    $('daily-done').classList.toggle('hidden', !done);
    $('daily-replay').classList.toggle('hidden', !(done && this.daily.replay && this.daily.replay.day === day));
    if (done) $('daily-done').textContent = done.left ? '今天的一局已開始過（中途離開）' : `今天：${Math.round(done.score).toLocaleString('en-US')} 分 ${done.grade}`;
    $('daily-next').textContent = `下一局 ${countdown(msToNextDay(now))}`;
    $('daily-msg').textContent = msg;
  }

  /** The end screen's daily block: today's score, the last fourteen days, and the share code. */
  showDailyEnd(grade) {
    const r = this.dailyRun;
    const result = { score: Math.round(this.score.score), grade, wave: this.waves.wave, cleared: this.waves.state === 'done' };
    this.daily.finish(r.day, result, toBase64(this.record.encode()));
    $('go-daily-day').textContent = r.day;
    const days = this.daily.last14(r.day);
    const top = Math.max(1, ...days.map((x) => (x.result ? x.result.score : 0)));
    const bars = $('go-daily-days');
    bars.textContent = '';
    for (const x of days) {
      const bar = document.createElement('div');
      bar.className = `go-daily-bar${x.day === r.day ? ' today' : ''}${x.result ? '' : ' none'}`;
      bar.title = `${x.day}：${x.result ? `${x.result.score.toLocaleString('en-US')} 分 ${x.result.grade}` : '沒有打'}`;
      const fill = document.createElement('i');
      fill.style.height = `${x.result ? Math.max(6, (100 * x.result.score) / top) : 0}%`;
      const label = document.createElement('span');
      label.textContent = x.day.slice(8);
      bar.append(fill, label);
      bars.appendChild(bar);
    }
    $('go-daily-code').textContent = shareCode({ day: r.day, score: result.score, grade });
    $('go-daily-copy').textContent = '複製';
    this.notes.log(`每日挑戰 ${r.day}：${result.score} 分 ${grade}`);
  }

  /**
   * A finished run onto the boards: a daily, or an arcade run on the normal rules (a variant or
   * another difficulty is another game). Always this browser's board; the back end's as well when
   * BACKEND.url is set, asking for a nickname the first time. Never holds the end screen up.
   */
  uploadRun(grade) {
    const box = $('go-board');
    const daily = this.dailyRun;
    const arcade = this.mode === 'arcade' && !this.ruleset.label;
    box.classList.toggle('hidden', !(daily || arcade));
    $('go-name-row').classList.add('hidden');
    this.pendingUpload = null;
    if (!daily && !arcade) return;
    const run = {
      mode: daily ? 'daily' : 'arcade',
      day: daily ? daily.day : utcDay(this.now()),
      map: this.record.map,
      score: Math.round(this.score.score),
      grade,
      replay: toBase64(this.record.encode()),
      overAt: this.overAt,
    };
    if (this.boards.online && !this.boards.me.name) {
      // the first time on the boards: a nickname first (the local board has the run already)
      this.boards.addLocal(run);
      run.localDone = true;
      this.pendingUpload = run;
      $('go-board-text').textContent = '第一次上排行榜：取個暱稱';
      $('go-name-row').classList.remove('hidden');
      return;
    }
    this.sendRun(run);
  }

  sendRun(run) {
    this.pendingUpload = null;
    $('go-board-text').textContent = this.boards.online ? '上傳中…' : '';
    this.boards.submit(run, { local: !run.localDone }).then((o) => {
      if (this.overAt !== run.overAt) return; // a new run started meanwhile
      const local = `本機榜第 ${o.local.rank} 名`;
      let text;
      if (o.online) text = o.online.kept ? `排行榜：第 ${o.online.rank} 名（共 ${o.online.total} 人）` : `排行榜：今天較好的一局仍是第 ${o.online.rank} 名`;
      else if (!this.boards.online) text = `${local}（離線）`;
      else if (o.error === 'already played today') text = `今天已上傳過 · ${local}`;
      else text = `連不上排行榜，已存進${local}`;
      $('go-board-text').textContent = text;
      this.notes.log(text);
    });
  }

  showBoards(on) {
    $('boards').classList.toggle('hidden', !on);
    $('title').classList.toggle('hidden', on);
    if (on) {
      $('board-name').value = this.boards.me.name;
      $('board-msg').textContent = '';
      this.renderBoard(this.boardTab || 'daily');
    }
  }

  /** One board on the board page: 'daily' (today's) or a start map's arcade board ('0'…'3'). */
  async renderBoard(tab) {
    this.boardTab = tab;
    for (const t of document.querySelectorAll('#board-tabs button')) t.classList.toggle('selected', t.dataset.board === tab);
    const mode = tab === 'daily' ? 'daily' : 'arcade';
    const key = tab === 'daily' ? utcDay(this.now()) : Number(tab);
    const list = $('board-list');
    list.textContent = '';
    $('board-status').textContent = this.boards.online ? '讀取中…' : '';
    const b = await this.boards.board(mode, key);
    if (this.boardTab !== tab) return; // another tab was picked meanwhile
    const row = (r) => {
      const el = document.createElement('div');
      el.className = `board-row${r.me ? ' me' : ''}`;
      const cell = (cls, text) => {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = text;
        el.appendChild(s);
      };
      cell('board-rank', `${r.rank}`);
      cell('board-name', r.name);
      cell('board-score', `${Number(r.score).toLocaleString('en-US')} ${r.grade}`);
      if (r.entry) {
        const play = document.createElement('button');
        play.type = 'button';
        play.textContent = '看重播';
        play.addEventListener('click', async () => {
          try {
            const bytes = await this.boards.replay(r.entry);
            const err = this.playReplay(bytes, { name: `${r.name} 的重播` });
            if (err) $('board-msg').textContent = `無法播放：${err}`;
          } catch {
            $('board-msg').textContent = '下載重播失敗';
          }
        });
        el.appendChild(play);
      } else el.appendChild(document.createElement('span'));
      return el;
    };
    for (const r of b.top) list.appendChild(row(r));
    if (b.place && b.place > b.top.length && b.around.length) {
      const gap = document.createElement('div');
      gap.className = 'board-gap';
      gap.textContent = '我附近';
      list.appendChild(gap);
      for (const r of b.around) list.appendChild(row(r));
    }
    if (!b.top.length) {
      const empty = document.createElement('div');
      empty.className = 'replay-empty';
      empty.textContent = mode === 'daily' ? '今天還沒有人上榜' : '這張地圖還沒有成績（街機、正常規則、沒有變體才上榜）';
      list.appendChild(empty);
    }
    $('board-status').textContent = b.local
      ? b.why === 'offline'
        ? '離線：只有這部電腦的成績（後端網址未設定）'
        : '連不上排行榜：先顯示這部電腦的成績'
      : `全球 · ${b.total} 人${b.place ? ` · 我第 ${b.place} 名` : ''}`;
  }

  /** A run left before its end (restart or the title from the pause menu): recorded as a quit, and kept as a replay. */
  endAsQuit() {
    this.telemetry.end({ result: 'quit', wave: this.waves.wave, score: this.score.score }, this.stepCount / LOGIC_HZ);
    this.saveReplay('quit');
  }

  /** Keep the run's input record in this browser (the last ten), unless the run was itself a replay or under a second long. */
  saveReplay(result, grade = '') {
    if (this.replay || this.record.steps < LOGIC_HZ) return null;
    return this.replays.add(
      {
        at: new Date().toISOString(), // when it was played, for the list (not the game)
        map: MAPS[this.record.map].name,
        mapId: MAPS[this.record.map].id,
        mode: MODES[this.mode].name,
        rules: this.ruleset.label,
        result,
        wave: this.waves.wave,
        score: Math.round(this.score.score),
        grade,
        seconds: Math.round(this.record.steps / LOGIC_HZ),
      },
      this.record.encode(),
    );
  }

  /**
   * Play an input record back: its seed, map, mode, rules and warm-up, and every step's input
   * from the record instead of the keyboard. Returns null, or why the record cannot be played.
   */
  playReplay(bytes, meta = {}) {
    let rd;
    try {
      RecordReader.check(bytes);
      rd = new RecordReader(bytes);
    } catch (err) {
      const why = String(err.message);
      if (why.includes('version')) return `這個重播檔是另一個版本的遊戲錄的（${why.replace(/^.*version (\d+).*$/, '第 $1 版')}），讀不到`;
      if (why.includes('not an input record')) return '這不是子彈芭蕾的重播檔';
      return '檔案不完整或已損壞';
    }
    if (rd.map >= MAPS.length || !MODE_IDS[rd.mode]) return '檔案裡的地圖或模式這個版本沒有';
    if (this.replay) this.endReplay();
    const keep = { seed: this.fixedSeed, warmup: this.fixedWarmup, rules: this.fixedRules };
    this.fixedSeed = rd.seed;
    this.fixedWarmup = rd.warmup;
    this.fixedRules = unpackRules(rd.rules);
    this.replay = { rd, speed: 1, meta, mode: this.mode };
    this.mode = MODE_IDS[rd.mode]; // for the run (waves read it); the title's pick comes back after
    this.showReplays(false);
    this.startRun(rd.map);
    Object.assign(this, { fixedSeed: keep.seed, fixedWarmup: keep.warmup, fixedRules: keep.rules });
    this.feed = (game) => rd.next(game.player.x, game.player.z);
    this.setReplaySpeed(1);
    this.notes.log(`重播 ${meta.name || ''}`.trim());
    return null;
  }

  /** A frame's real time as the run sees it: a replay plays at its own speed. */
  playDt(realDt) {
    return this.replay ? realDt * this.replay.speed : realDt;
  }

  setReplaySpeed(speed) {
    if (!this.replay) return;
    this.replay.speed = speed;
    $('replay-speed').textContent = `${speed}×`;
  }

  /** Leave playback: the keyboard drives the game again and the title's mode comes back. */
  endReplay() {
    this.achievements.watching = false;
    if (!this.replay) return;
    this.mode = this.replay.mode;
    this.replay = null;
    this.feed = null;
    $('replay-badge').classList.add('hidden');
    document.body.classList.remove('replaying');
  }

  /** The record ran out before the run ended (that run was left from the pause menu). */
  replayRanOut() {
    this.toTitle();
    this.renderReplays('重播完：那一局是中途離開的。');
    this.showReplays(true);
  }

  showReplays(on) {
    $('replays').classList.toggle('hidden', !on);
    $('title').classList.toggle('hidden', on);
    if (on) this.renderReplays();
  }

  /** The replay list: newest first, each to play or download. */
  renderReplays(msg = '') {
    const list = $('replay-list');
    list.textContent = '';
    const result = { death: '倒下', clear: '通關', quit: '中途離開' };
    const cell = (cls, text) => {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = text;
      return s;
    };
    for (const r of this.replays.list) {
      const row = document.createElement('div');
      row.className = 'replay-row';
      const d = new Date(r.at);
      row.append(
        cell('replay-when', `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`),
        cell('replay-what', [r.map, r.mode, r.rules].filter(Boolean).join(' · ')),
        cell('replay-how', `${result[r.result] || ''} · 第 ${r.wave} 波 · ${clock(r.seconds)}`),
        cell('replay-score', `${Number(r.score).toLocaleString('en-US')}${r.grade ? ` ${r.grade}` : ''}`),
      );
      const play = document.createElement('button');
      play.type = 'button';
      play.textContent = '播放';
      play.addEventListener('click', () => {
        const err = this.playReplay(this.replays.bytes(r), r);
        if (err) this.renderReplays(`無法播放：${err}`);
      });
      const save = document.createElement('a');
      save.className = 'button';
      save.textContent = '下載 .bbr';
      save.download = r.name;
      save.href = '#';
      save.addEventListener('click', () => {
        save.href = URL.createObjectURL(new Blob([this.replays.bytes(r)], { type: 'application/octet-stream' }));
        setTimeout(() => URL.revokeObjectURL(save.href), 2000);
      });
      row.append(play, save);
      list.appendChild(row);
    }
    if (!this.replays.list.length) list.appendChild(cell('replay-empty', '還沒有重播。打完一局就會自動存在這裡（最近 10 局）。'));
    $('replay-msg').textContent = msg;
  }

  toTitle() {
    if (this.state === 'paused' && !this.replay) this.endAsQuit();
    this.endReplay();
    this.endDaily();
    this.renderDaily();
    this.refreshGlobal();
    this.resetWorld(this.level.map);
    this.state = 'title';
    this.notes.hideNote();
    $('pause').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('title').classList.remove('hidden');
    $('title').scrollTop = 0;
    document.body.classList.remove('playing');
    this.hud.show(false);
    this.audio.resume();
    this.updateCamera(1, true);
    this.last = performance.now();
  }

  /** Clear everything a run leaves behind and stand the player at the map's start. */
  resetWorld(map) {
    this.stage = 0;
    this.tutorial.stop();
    this.transition = null;
    $('fade').classList.remove('on');
    this.enemies.clear();
    this.bullets.clear();
    this.grenades.clear();
    this.bosses.reset();
    this.pickups.clear();
    this.thrown.clear();
    this.style.clearGhosts();
    this.fx.clear();
    if (this.level.map !== map || this.level.glassUpTo !== this.ruleset.glassUpTo || this.level.pansAsBarrels !== this.ruleset.pansAsBarrels) {
      this.level.load(map);
      this.applyMapView();
      this.renderer.compile(this.scene, this.camera);
    } else {
      this.level.resetProps();
    }
    this.player.reset();
    // the camera looks ahead toward the aim: start every run aiming the same way, not where the last one ended
    this.aimPoint.set(this.player.x, GUN_Y, this.player.z - 5);
    this.focusActive = false;
    this.focusAmt = 0;
    this.focusMeter = 1;
    this.timeScale = 1;
    this.hitstopT = 0;
    this.killcamT = 0;
    this.ripple = -1;
    this.hurtFx = 0;
    this.flashFx = 0;
    this.deathT = 0;
    this.clearT = 0;
    this.worldTime = 0;
    this.lastKillAt = -9;
    this.lastKillPos = null; // where the last kill fell (ROAM)
    this.cmd = new StepInput();
    this.acc = 0;
    this.stepCount = 0;
    this.aimFresh = true;
    this.aimStep = -2;
    this.lastCloseCall = -LOGIC_HZ;
    this.input.dropEdges();
    // camera shake moves what the cursor points at: same seed, same mouse, same run
    this.time = 0;
    this.trauma = 0;
    this.audio.setSlow(0);
  }

  cycleView() {
    this.view = (this.view + 1) % VIEWS.length;
    try {
      localStorage.setItem(VIEW_KEY, String(this.view));
    } catch {
      /* storage unavailable */
    }
    const v = VIEWS[this.view];
    if (this.state === 'playing') this.telemetry.event(this.stepCount / LOGIC_HZ, { type: 'view', view: v.name });
    if (this.state === 'playing') this.hud.toast(`鏡頭：${v.name} <small>${v.en} · V</small>`);
    $('view-name').textContent = v.name;
  }

  /** Camera lens, exposure and bloom can differ per map (the daylight Senado map needs its own). */
  applyMapView() {
    const view = this.level.map.camera;
    this.camera.fov = view?.fov ?? CAMERA.fov;
    this.camera.updateProjectionMatrix();
    this.renderer.toneMappingExposure = this.level.exposure;
    this.post.bloom.threshold = this.level.bloom.threshold;
    $('map-credit').textContent = this.level.map.credit || '';
    $('view-name').textContent = VIEWS[this.view].name;
  }

  /** Where a run of `mode` from map `start` goes: its maps in order, then their bosses (each stage's last wave). '' in endless (no last stage). */
  routeText(start, mode) {
    const r = MODES[mode];
    if (!Number.isFinite(r.waves)) return '';
    const stages = Math.ceil(r.waves / r.perStage);
    const maps = Array.from({ length: stages }, (_, i) => MAPS[(start + i) % MAPS.length]);
    const bosses = maps
      .map((m, i) => (r.midBoss || i === stages - 1) && m.boss && BOSSES[m.boss.kind])
      .filter(Boolean)
      .map((b) => b.cfg.route || b.cfg.short);
    return `${maps.map((m) => m.name).join(' → ')}${bosses.length ? `（頭目：${bosses.join('、')}）` : ''}`;
  }

  get stageMap() {
    return MAPS[(this.startMap + this.stage) % MAPS.length];
  }

  beginStageTransition() {
    this.transition = { t: 0, loaded: false };
    $('fade').classList.add('on');
  }

  updateTransition(realDt) {
    const tr = this.transition;
    tr.t += realDt;
    if (!tr.loaded && tr.t >= 0.65) {
      tr.loaded = true;
      this.stage++;
      this.bosses.reset(); // the stage's boss, down, goes with its map
      this.enemies.clear();
      this.bullets.clear();
      this.grenades.clear();
      this.pickups.clear();
      this.thrown.clear();
      this.fx.clear();
      this.level.load(this.stageMap);
      this.notes.log(`轉場 → ${this.stageMap.name}`);
      this.audio.setStage(this.stage); // the next song comes in on the bar line
      this.audio.setLevel(0);
      this.notes.log(`音樂：${this.audio.upcoming.name}`);
      this.applyMapView();
      this.player.placeAtStart();
      this.updateCamera(1, true);
      this.renderer.compile(this.scene, this.camera);
      $('fade').classList.remove('on');
    }
    if (tr.t >= 1.3) {
      this.transition = null;
      const m = this.stageMap;
      this.hud.banner(`STAGE ${this.stage + 1}`, `${m.name} · ${m.en}`, 'stage');
      this.waves.state = 'intermission';
      this.waves.timer = 2.6;
    }
  }

  setPaused(on) {
    if (on && this.state === 'playing') {
      this.state = 'paused';
      const m = this.stageMap;
      $('pause-info').textContent = `${m.name} · 第 ${Math.max(1, this.waves.wave)} 波 · ${Math.round(this.score.score).toLocaleString('en-US')} 分`;
      $('pause').classList.remove('hidden');
      document.body.classList.remove('playing');
      this.input.releaseAll();
      this.audio.suspend();
    } else if (!on && this.state === 'paused') {
      this.state = 'playing';
      $('pause').classList.add('hidden');
      document.body.classList.add('playing');
      this.audio.resume();
      this.last = performance.now();
    }
  }

  /** The end of a run: the player fell, or (cleared) the last arcade wave is down. */
  gameOver(cleared = false) {
    this.state = 'over';
    this.overAt = performance.now();
    const isBest = !this.replay && this.score.saveBest(); // a replay sets no records
    const s = this.score;
    $('go-title').textContent = cleared ? 'RUN CLEAR' : 'GAME OVER';
    $('gameover').classList.toggle('cleared', cleared);
    $('go-score').textContent = Math.round(s.score).toLocaleString('en-US');
    $('go-best').textContent = isBest ? 'NEW BEST!' : `BEST ${Math.round(s.best).toLocaleString('en-US')}`;
    $('go-best').classList.toggle('new', isBest);
    $('go-wave').textContent = String(this.waves.wave);
    $('go-time').textContent = clock(this.stepCount / LOGIC_HZ);
    $('go-kills').textContent = String(s.kills);
    $('go-combo').textContent = `x${Math.max(1, s.maxCombo)}`;
    $('go-clean').textContent = `${this.waves.cleanWaves} / ${this.waves.wave}`;
    const graded = !!this.waves.rules.graded;
    $('gameover').classList.toggle('graded', graded);
    if (graded) this.showGrade(cleared);
    $('gameover').classList.toggle('replay', !!this.replay);
    $('gameover').classList.toggle('daily', !!this.dailyRun && !this.replay);
    if (this.dailyRun && !this.replay) this.showDailyEnd(graded ? $('go-grade').textContent : 'D');
    if (this.replay) $('go-board').classList.add('hidden');
    else this.uploadRun(graded ? $('go-grade').textContent : 'D');
    this.saveReplay(cleared ? 'clear' : 'death', graded ? $('go-grade').textContent : '');
    if (!this.replay) this.telemetry.end(
      { result: cleared ? 'clear' : 'death', wave: this.waves.wave, cause: cleared ? undefined : this.deathCause || '不明', score: s.score, grade: graded ? $('go-grade').textContent : undefined },
      this.stepCount / LOGIC_HZ,
    );
    $('gameover').classList.remove('hidden');
    document.body.classList.remove('playing');
    this.hud.show(false);
    if (!this.replay) this.showClip();
  }

  /** The end screen opens on the run's best kill when there is a recording of it, then shows the score. */
  showClip() {
    const save = $('go-clip-save');
    save.classList.add('hidden');
    const at = this.overAt;
    if (this.clip.active && this.clip.plan.best > 0) this.setClipOn(true); // the score waits while the recording is fetched
    this.clip.finish().then((c) => {
      if (this.state !== 'over' || this.overAt !== at) return; // a new run started meanwhile
      if (!c) return this.endClip();
      if (this.clipUrl) URL.revokeObjectURL(this.clipUrl);
      this.clipUrl = URL.createObjectURL(c.blob);
      this.notes.log(`最佳片段：${Math.round(c.points).toLocaleString('en-US')} 分的擊殺，${c.length.toFixed(1)} 秒`);
      save.href = this.clipUrl;
      save.download = `bullet-ballet-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.webm`;
      save.classList.remove('hidden');
      const video = $('go-clip-video');
      const end = c.offset + c.length;
      video.onloadedmetadata = () => {
        if (c.offset > 0) video.currentTime = c.offset;
        video.play().catch(() => this.endClip());
      };
      video.ontimeupdate = () => {
        if (video.currentTime >= end) this.endClip();
      };
      video.onended = video.onerror = () => this.endClip();
      video.src = this.clipUrl;
      clearTimeout(this.clipTimer);
      this.clipTimer = setTimeout(() => this.endClip(), (c.length + 3) * 1000); // in case the video never says it ended
      this.setClipOn(true);
      return undefined;
    });
  }

  setClipOn(on) {
    this.clipOn = on;
    $('gameover').classList.toggle('clip-on', on);
  }

  /** The clip is over (or skipped): stop it and show the score. */
  endClip() {
    if (!this.clipOn) return;
    clearTimeout(this.clipTimer);
    const video = $('go-clip-video');
    video.pause();
    this.setClipOn(false);
  }

  /** The arcade grade on the end screen: the letter, its three parts, and a hint at the weakest one. */
  showGrade(cleared) {
    const w = this.waves;
    const r = rate({ score: this.score.score, cleanWaves: w.cleanWaves, waves: w.rules.waves, seconds: this.stepCount / LOGIC_HZ, cleared });
    const grade = $('go-grade');
    grade.textContent = r.grade;
    grade.dataset.grade = r.grade;
    for (const key of ['style', 'clean', 'time']) {
      const row = document.querySelector(`#go-parts [data-part=${key}]`);
      row.querySelector('em').style.width = `${(100 * r.parts[key]) / RATING[key]}%`;
      row.querySelector('b').textContent = `${Math.round(r.parts[key])} / ${RATING[key]}`;
    }
    // a run that fell needs to get further first; a cleared one hears about its weakest part
    const weakest = ['style', 'clean', 'time'].reduce((a, b) => (r.parts[b] / RATING[b] < r.parts[a] / RATING[a] ? b : a));
    const hints = {
      style: '下次：多用花式、保住連擊，Style 分佔最多',
      clean: '下次：少捱打，多幾波無傷',
      time: `下次：打快一點，${Math.round(RATING.timePar / 60)} 分鐘內用時滿分`,
    };
    $('go-hint').textContent = cleared ? hints[weakest] : `下次：撐到第 ${w.rules.waves} 波，通關才有用時分`;
    const p = r.parts;
    this.notes.log(`評級 ${r.grade}（Style ${Math.round(p.style)}/${RATING.style} · 無傷 ${Math.round(p.clean)}/${RATING.clean} · 用時 ${Math.round(p.time)}/${RATING.time}）`);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.post.setSize(innerWidth, innerHeight);
  }

  // ------------------------------------------------------- game events

  shake(v) {
    this.trauma = Math.min(1, this.trauma + v);
  }

  hitstop(t) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  panFor(x) {
    return clamp((x - this.camTarget.x) / 18, -0.8, 0.8);
  }

  addFocus(v) {
    this.focusMeter = Math.min(1, this.focusMeter + v);
  }

  toggleFocus() {
    if (!this.ruleset.slowmo) return; // a variant turned bullet time off
    if (this.focusActive) this.setFocus(false);
    else if (this.focusMeter >= FOCUS.minToEnter) this.setFocus(true);
    else this.audio.denied();
  }

  setFocus(on) {
    if (this.focusActive === on) return;
    this.focusActive = on;
    this.notes.log(`慢鏡${on ? '開' : '關'}（焦點 ${Math.round(this.focusMeter * 100)}%）`);
    if (on) {
      this.audio.focusIn();
      this.startRipple(this.player.x, this.player.z);
      this.heartT = 0.35;
    } else {
      this.audio.focusOut();
    }
  }

  startRipple(x, z) {
    const s = this.hud.project(x, 1, z);
    this.rippleCenter.set(s.x / innerWidth, 1 - s.y / innerHeight);
    this.ripple = 0;
  }

  onEnemyKilled(e, info) {
    const p = this.player;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    const tags = [{ label: e.cfg.label, pts: e.cfg.score }];
    let refill = FOCUS.killRefill;
    if (info.cause === 'execution') {
      tags.push({ label: 'EXECUTION', pts: 200, cls: 'gold' });
      refill = FOCUS.executeRefill;
    }
    if (this.focusActive) tags.push({ label: 'SLOW-MO', pts: 50, cls: 'cyan' });
    if (info.bullet && info.bullet.spinShot) tags.push({ label: 'PIROUETTE', pts: 150, cls: 'pink' });
    else if (p.alive && p.spinning) tags.push({ label: 'SPIN KILL', pts: 100, cls: 'cyan' });
    if (p.alive && p.sliding) tags.push({ label: 'SLIDE KILL', pts: 100, cls: 'cyan' });
    if (info.juggle) tags.push({ label: 'JUGGLE', pts: 120, cls: 'gold' });
    if (info.split) tags.push({ label: 'SPLIT AIM', pts: 100, cls: 'pink' });
    if (info.bullet && info.bullet.scatter) {
      tags.push({ label: 'SCATTER', pts: 150, cls: 'gold' });
      refill += 0.08;
    } else if (info.ricochet) {
      tags.push({ label: 'RICOCHET', pts: 200, cls: 'gold' });
      refill += 0.08;
    }
    if (info.cause === 'explosion') tags.push(info.chain ? { label: 'CHAIN', pts: 120, cls: 'gold' } : { label: 'BOOM', pts: 120, cls: 'gold' });
    if (info.rocket) tags.push({ label: 'ROCKET CAN', pts: 150, cls: 'gold' });
    if (info.cause === 'kick') tags.push({ label: 'KICK', pts: 150, cls: 'gold' });
    if (info.cause === 'strike') tags.push({ label: 'STRIKE!', pts: 200, cls: 'gold' });
    if (info.cause === 'crushed') tags.push({ label: 'CRUSHED', pts: 200, cls: 'gold' });
    if (info.cause === 'slam') tags.push({ label: 'SLAM', pts: 120, cls: 'gold' });
    if (info.cause === 'shutter') tags.push({ label: 'SHUTTER', pts: 200, cls: 'gold' });
    if (info.cause === 'splash') tags.push({ label: 'SPLASH', pts: 150, cls: 'gold' });
    if (info.cause === 'smash') tags.push({ label: 'PAN SMASH', pts: 120, cls: 'gold' });
    if (info.bullet && info.bullet.homeRun) tags.push({ label: 'HOME RUN', pts: 200, cls: 'gold' });
    if (this.level.darkAt(e.x, e.z)) tags.push({ label: 'BLACKOUT', pts: 100, cls: 'gold' });
    if (this.level.smokeAt(e.x, e.z)) tags.push({ label: 'SMOKE', pts: 80, cls: 'gold' });
    if (info.cause === 'friendly') tags.push({ label: 'FRIENDLY FIRE', pts: 200, cls: 'gold' });
    if (e.blindT > 0) tags.push({ label: 'PIGEON STRIKE', pts: 80, cls: 'gold' });
    if (info.cause === 'bullet') {
      if (d < 2.6) tags.push({ label: 'POINT BLANK', pts: 60 });
      else if (d > 16) tags.push({ label: 'LONG SHOT', pts: 80 });
    }
    if (this.worldTime - this.lastKillAt < 0.5) tags.push({ label: 'MULTI KILL', pts: 100, cls: 'pink' });
    if (this.lastKillPos && Math.hypot(e.x - this.lastKillPos.x, e.z - this.lastKillPos.z) >= RANK.roam) tags.push({ label: 'ROAM', pts: RANK.roamPts, cls: 'cyan' });
    this.lastKillAt = this.worldTime;
    this.lastKillPos = { x: e.x, z: e.z };
    const last = this.waves.finishedSpawning && this.enemies.aliveCount === 0;
    if (info.bullet && info.bullet.kills >= 2) tags.push({ label: 'COLLATERAL', pts: 150 * (info.bullet.kills - 1), cls: 'gold' });
    if (last) tags.push({ label: 'LAST ONE', pts: 100 });

    const before = this.score.score;
    this.score.kill(tags);
    this.achievements.kill(
      tags.map((t) => t.label),
      info.bullet ? info.bullet.kills || 0 : 0,
    );
    this.clip.kill(this.score.score - before);
    this.notes.log(`擊殺 ${e.cfg.label}：${tags.map((t) => t.label).join(' + ')} ×${this.score.mult}`);
    this.addFocus(refill);
    this.hud.hitMarker(true);
    this.audio.kill(this.panFor(e.x));
    this.shake(0.22);
    this.hitstop(0.045);
    if (last && p.alive) {
      this.killcamT = 1.3;
      this.killcamPos.set(e.x, 0, e.z);
      this.startRipple(e.x, e.z);
    }
  }

  onCloseCall(spin) {
    if (this.stepCount - this.lastCloseCall < LOGIC_HZ / 4) return;
    this.lastCloseCall = this.stepCount;
    this.notes.log(spin ? '旋轉中子彈穿身（DODGE）' : '子彈擦身（CLOSE CALL）');
    this.achievements.style(spin ? 'DODGE' : 'CLOSE CALL');
    if (spin) {
      this.score.style('DODGE', 40);
      this.addFocus(0.06);
    } else {
      this.score.style('CLOSE CALL', 25);
      this.addFocus(FOCUS.closeCallRefill);
    }
  }

  onPlayerHurt(dmg, source = '子彈') {
    this.deathCause = source; // the last thing that hit: the cause, if this was the end
    this.notes.log(`被${source}打中 −${dmg}（HP ${Math.max(0, Math.ceil(this.player.hp))}）`);
    this.score.breakCombo();
    this.score.rank.hit();
    this.waves.hurt = true;
    this.waves.beatHurt = true;
    this.hurtFx = Math.min(1, this.hurtFx + 0.45 + dmg / 60);
    this.shake(0.35);
    this.audio.hurt();
  }

  onPlayerDeath() {
    this.state = 'dying';
    this.notes.log('倒下');
    this.deathT = 0;
    this.focusActive = false;
    this.audio.death();
    this.startRipple(this.player.x, this.player.z);
    this.hud.banner('YOU DIED', '你倒下了', 'dead');
  }

  onWaveClear(n, stageEnd = false) {
    if (!this.player.alive) return;
    const bonus = 250 * n;
    this.notes.log(`第 ${n} 波清空${stageEnd ? '，準備轉場' : ''}`);
    this.achievements.wave(!this.waves.hurt);
    this.telemetry.event(this.stepCount / LOGIC_HZ, { type: 'wave', n, hurt: this.waves.hurt });
    this.score.bonus('WAVE CLEAR', bonus);
    this.level.waveEnd(); // shutters roll back up
    this.addFocus(0.35);
    this.player.hp = PLAYER.hp;
    const next = stageEnd ? ` · 下一站：${MAPS[(this.startMap + this.stage + 1) % MAPS.length].name}` : '';
    this.hud.banner(stageEnd ? 'STAGE CLEAR' : 'WAVE CLEAR', `+${bonus.toLocaleString('en-US')} · 生命值回滿${next}`, 'clear');
    this.audio.waveClear();
  }

  /** The last wave of an arcade run is down: a moment to enjoy it, then the RUN CLEAR screen. */
  onRunClear(n) {
    if (!this.player.alive) return;
    const bonus = 250 * n;
    this.notes.log(`第 ${n} 波清空：通關（RUN CLEAR）`);
    this.achievements.wave(!this.waves.hurt);
    this.achievements.clear();
    this.telemetry.event(this.stepCount / LOGIC_HZ, { type: 'wave', n, hurt: this.waves.hurt });
    this.score.bonus('RUN CLEAR', bonus);
    this.player.invuln = 99; // nothing still flying can take the run away now
    this.clearT = 2.6;
    this.hud.banner('RUN CLEAR', `全部 ${n} 波清空 · +${bonus.toLocaleString('en-US')}`, 'clear');
    this.audio.waveClear();
  }

  explode(x, z, r, opts = {}) {
    const p = this.player;
    this.boss.blast(x, z, opts); // a blast can hurt a boss (boss.js: right under the helicopter, a barrel or a grenade)
    this.fx.explosion(x, z, r);
    this.audio.explosion(this.panFor(x));
    this.level.noise(x, z, 20);
    const dp = Math.hypot(p.x - x, p.z - z);
    this.shake(clamp(1.1 - dp / 25, 0.3, 0.9));
    this.flashFx = Math.max(this.flashFx, clamp(0.16 - dp / 120, 0, 0.16));
    this.hitstop(0.06);

    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > r + e.radius || !this.level.hasLOS(x, z, e.x, e.z)) continue;
      const k = 1 / (d || 1);
      e.blast((e.x - x) * k, (e.z - z) * k, d < r * 0.65 ? 20 : 5, !!opts.chain, !!opts.rocket);
    }
    for (const e of this.enemies.corpses) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (d > r + 1) continue;
      const k = (14 * (1 - d / (r + 1))) / (d || 1);
      e.vx += (e.x - x) * k;
      e.vz += (e.z - z) * k;
    }
    if (p.alive && dp < r && this.level.hasLOS(x, z, p.x, p.z)) {
      const dmg = Math.round(lerp(55, 15, dp / r));
      const k = 1 / (dp || 1);
      const mul = (p.spinning ? 0.5 : 1) * (opts.selfMul ?? 1);
      p.hurt(Math.round(dmg * mul), (p.x - x) * k, (p.z - z) * k, true, opts.source);
    }
    for (const b of this.level.barrels) {
      if (!b.alive) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d > 0.01 && d < r) b.ignite(0.1 + d * 0.025);
    }
    for (const pan of this.level.pans) {
      const d = Math.hypot(pan.x - x, pan.z - z);
      if (d > r + 1) continue;
      const k = 1 / (d || 1);
      pan.hit((pan.x - x) * k, (pan.z - z) * k, 9 * (1 - d / (r + 1)));
      pan.vy = 7;
    }
    for (const s of this.level.glass) {
      if (!s.alive) continue;
      const cx = clamp(x, s.minX, s.maxX);
      const cz = clamp(z, s.minZ, s.maxZ);
      const d = Math.hypot(cx - x, cz - z);
      if (d < r + 0.5) this.level.breakGlass(s, (cx - x) / (d || 1), (cz - z) / (d || 1));
    }
  }

  // ------------------------------------------------------------- loop

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const rawDt = Math.max(0, (now - this.last) / 1000);
    const realDt = Math.min(0.05, rawDt);
    this.last = now;
    this.time += realDt;
    this.pollPad();
    if (this.state !== 'paused') {
      this.updateAim();
      if (this.state === 'playing' || this.state === 'dying') this.updatePlay(this.playDt(realDt));
      else this.updateIdle(realDt);
    }
    // in a run the logic steps take the presses (a fast frame may hold one over to the next step)
    if (this.state !== 'playing' && this.state !== 'dying') this.input.dropEdges();
    this.notes.update(realDt, rawDt);
    this.render();
    if ((this.state === 'playing' || this.state === 'dying') && !this.replay) this.clip.frame(realDt); // after the frame is drawn
  }

  /** Once a display frame: read the gamepad; Start pauses and resumes; the hints follow whether one is connected. */
  pollPad() {
    const pad = this.input.poll();
    if (this.binding && this.binding.pad && this.input.padPress >= 0) {
      // the settings page waits for a pad button: this one is it
      this.settings.bindPad(this.binding.id, this.input.padPress);
      this.binding = null;
      this.applySettings();
      this.renderSettings();
    }
    if (this.input.padStart) {
      if (this.state === 'playing') this.setPaused(true);
      else if (this.state === 'paused') this.setPaused(false);
    }
    // the title names the pad in use, so a wrong one (a second pad, a device that only looks like one) shows
    const used = pad ? `${pad.index}:${pad.id}` : '';
    if (used !== this.padUsed) {
      if (pad && this.padOn) this.notes.log(`改用手掣：${padLabel(pad.id)}`);
      this.padUsed = used;
      $('pad-name').textContent = pad ? `使用中：${padLabel(pad.id)}` : '';
    }
    if (!!pad === this.padOn) return;
    this.padOn = !!pad;
    document.body.classList.toggle('pad', this.padOn);
    this.notes.log(this.padOn ? '接上手掣' : '手掣已拔掉');
    if (this.state === 'playing' || this.state === 'dying') this.telemetry.event(this.stepCount / LOGIC_HZ, { type: 'input', device: this.padOn ? 'pad' : 'keyboard' });
  }

  updateAim() {
    if (this.input.pad && this.input.usingPad) this.padAim();
    else {
      const m = this.input.mouse;
      this.ndc.set((m.x / innerWidth) * 2 - 1, -(m.y / innerHeight) * 2 + 1);
      this.raycaster.setFromCamera(this.ndc, this.camera);
      this.raycaster.ray.intersectPlane(this.aimPlane, this.aimPoint);
    }
    this.aimFresh = true;
  }

  /**
   * Aim with the right stick: a point PAD.aimDistance ahead along it (up the stick is up the
   * screen, as for WASD), or the nearest visible enemy within PAD.assistDeg of that line. Let go
   * and the direction stays. The cursor follows, for the crosshair. This is input, recorded as
   * the step's aim, so a replay needs none of it.
   */
  padAim() {
    const p = this.player;
    const s = this.input.padStick;
    if (Math.hypot(s.x, s.y) > PAD.deadzone) {
      const c = Math.cos(this.camYaw);
      const n = Math.sin(this.camYaw);
      this.padDir.set(s.x * c + s.y * n, -s.x * n + s.y * c).normalize();
    }
    const dir = this.padDir;
    let tx = p.x + dir.x * PAD.aimDistance;
    let tz = p.z + dir.y * PAD.aimDistance;
    const cosMax = Math.cos((PAD.assistDeg * Math.PI) / 180);
    let best = PAD.assistRange;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5 || d >= best || (dx * dir.x + dz * dir.y) / d < cosMax || !this.level.hasLOS(p.x, p.z, e.x, e.z)) continue;
      best = d;
      tx = e.x;
      tz = e.z;
    }
    this.aimPoint.set(tx, GUN_Y, tz);
    const v = this.padScreen.copy(this.aimPoint).project(this.camera);
    this.input.mouse.x = ((v.x + 1) / 2) * innerWidth;
    this.input.mouse.y = ((1 - v.y) / 2) * innerHeight;
  }

  /** One displayed frame of a run: as many fixed logic steps as realDt covers, then what is only shown. */
  updatePlay(realDt) {
    this.acc += realDt;
    this.frameSteps = 0;
    // A frame of 1/60 s or more takes the cursor on its first step. Faster screens
    // (0-1 steps a frame) take it every other step: a 60 Hz aim on any screen,
    // which keeps the input record small.
    this.aimEvery = this.acc > 2 * STEP - 1e-9 ? 1 : 2;
    // a hair of slack, so float rounding never turns a 60 Hz frame into one step and the next into three
    while (this.acc > STEP - 1e-9 && (this.state === 'playing' || this.state === 'dying')) {
      this.acc -= STEP;
      this.step();
      this.frameSteps++;
    }
    this.present(realDt);
  }

  /** One fixed logic step: take this step's input (latched or fed), record it, move the game 1/LOGIC_HZ s. */
  step() {
    const p = this.player;
    // the cursor is resampled once a frame (updateAim); see updatePlay for how often a step takes it
    let aim = null;
    if (this.aimFresh && this.stepCount - this.aimStep >= this.aimEvery) {
      aim = this.aimPoint;
      this.aimFresh = false;
      this.aimStep = this.stepCount;
    }
    const cmd = this.feed ? this.feed(this) : this.input.latch(this.cmd, aim, p.x, p.z, this.camYaw);
    if (!cmd) {
      this.replayRanOut();
      return;
    }
    this.cmd = cmd;
    this.record.push(this.cmd);
    this.stepCount++;
    this.logic(STEP);
  }

  /** The game itself for h seconds of real time: bullet time, everyone's moves, waves and score. */
  logic(h) {
    const cmd = this.cmd;
    if (this.state === 'playing' && cmd.hit('ShiftLeft', 'ShiftRight', 'KeyQ')) this.toggleFocus();
    if (this.focusActive) {
      this.focusMeter -= FOCUS.drain * h;
      if (this.focusMeter <= 0) {
        this.focusMeter = 0;
        this.setFocus(false);
      }
      this.heartT -= h;
      if (this.heartT <= 0) {
        this.heartT = 0.85;
        this.audio.heartbeat();
      }
    } else {
      this.focusMeter = Math.min(1, this.focusMeter + FOCUS.regen * h);
    }

    this.focusAmt = damp(this.focusAmt, this.focusActive ? 1 : 0, 9, h);
    let ts = lerp(1, FOCUS.worldScale, this.focusAmt);
    let ps = lerp(1, FOCUS.playerScale, this.focusAmt);
    if (this.killcamT > 0) {
      this.killcamT -= h;
      const k = this.killcamT > 0.35 ? 0.07 : lerp(1, 0.07, this.killcamT / 0.35);
      ts = Math.min(ts, k);
      ps = Math.min(ps, k);
    }
    if (this.state === 'dying') {
      this.deathT += h;
      ts = ps = 0.14;
      if (this.deathT > 2.3) this.gameOver();
    }
    this.audio.setSlow(clamp((1 - ts) / (1 - FOCUS.worldScale), 0, 1));
    if (this.hitstopT > 0) {
      this.hitstopT -= h;
      ts *= 0.1;
      ps *= 0.1;
    }
    this.timeScale = ts;
    this.playerVelScale = ts > 0 ? ps / ts : 1;
    const dt = h * ts;
    const pdt = h * ps;
    this.worldTime += dt;

    if (this.transition) this.updateTransition(h);
    this.player.update(pdt, cmd);
    this.enemies.update(dt);
    this.boss.update(dt);
    this.level.updateProps(dt);
    this.bullets.update(dt);
    this.grenades.update(dt);
    this.thrown.update(dt);
    this.pickups.update(dt, h, cmd);
    this.tutorial.update(h);
    this.waves.update(dt, h);
    // standing still while enemies are about drains the Style rank (RANK.camp)
    const busy = this.waves.state === 'active' && this.enemies.aliveCount > 0 && this.player.alive;
    this.score.update(dt, h, !busy || Math.hypot(this.player.vx, this.player.vz) >= RANK.campSpeed);
    // the Style rank changed (achievements only listen; nothing here feeds back into play)
    if (this.score.rank.index !== this.rankSeen) {
      this.rankSeen = this.score.rank.index;
      this.achievements.rank(this.score.rank.name, this.level.map.id);
    }
    if (this.clearT > 0) {
      this.clearT -= h;
      if (this.clearT <= 0) this.gameOver(true);
    }
  }

  /** What a frame shows but the logic never reads: effects, ambient life, screen flashes, camera, HUD. */
  present(realDt) {
    const dt = realDt * this.timeScale;
    this.fx.update(dt);
    this.style.update(dt);
    this.level.updateAmbient(realDt, dt, this.camTarget.x, this.camTarget.z);

    this.hurtFx = Math.max(0, this.hurtFx - realDt * 1.8);
    this.flashFx = Math.max(0, this.flashFx - realDt * 3);
    if (this.ripple >= 0) {
      this.ripple += realDt * 1.3;
      if (this.ripple >= 1) this.ripple = -1;
    }
    this.updateCamera(realDt);
    if (this.state !== 'over') this.hud.update(realDt);
  }

  updateIdle(realDt) {
    const dt = this.state === 'over' ? realDt * 0.3 : realDt;
    this.enemies.update(dt);
    this.level.updateProps(dt);
    this.bullets.update(dt);
    this.grenades.update(dt);
    this.fx.update(dt);
    this.style.update(dt);
    this.level.updateAmbient(realDt, dt, this.camTarget.x, this.camTarget.z);
    this.focusAmt = damp(this.focusAmt, 0, 4, realDt);
    this.hurtFx = Math.max(0, this.hurtFx - realDt * 1.8);
    if (this.ripple >= 0) {
      this.ripple += realDt * 1.3;
      if (this.ripple >= 1) this.ripple = -1;
    }
    this.updateCamera(realDt);
  }

  updateCamera(realDt, snap = false) {
    const p = this.player;
    let tx = p.x;
    let tz = p.z;
    let zoom = 1;
    if (this.state === 'playing') {
      // holding right mouse with a sniper rifle pushes the view out along the aim
      const scoped = p.alive && p.weapon.scope && this.cmd.mouse.right; // the step's input: the right button or a pad's LT
      const ahead = scoped ? 0.55 : CAMERA.lookAhead;
      const aheadMax = scoped ? 13 : CAMERA.lookAheadMax;
      let lx = (this.aimPoint.x - p.x) * ahead;
      let lz = (this.aimPoint.z - p.z) * ahead;
      const ll = Math.hypot(lx, lz);
      if (ll > aheadMax) {
        lx *= aheadMax / ll;
        lz *= aheadMax / ll;
      }
      if (scoped) zoom *= 1.12;
      tx += lx;
      tz += lz;
      zoom *= lerp(1, CAMERA.focusZoom, this.focusAmt);
      if (this.boss.active && this.boss.cfg.pull) {
        // a boss in the air: pull back and lean towards it, so it is in the picture
        tx = lerp(tx, this.boss.x, CAMERA.bossPull);
        tz = lerp(tz, this.boss.z, CAMERA.bossPull);
        zoom *= CAMERA.bossZoom;
      }
      if (this.killcamT > 0) {
        tx = lerp(tx, this.killcamPos.x, 0.6);
        tz = lerp(tz, this.killcamPos.z, 0.6);
        zoom *= 0.74;
      }
    } else if (this.state === 'dying' || this.state === 'over') {
      zoom = 0.68;
    } else if (this.state === 'title') {
      tz -= 1.5;
      zoom = 0.82 + Math.sin(this.time * 0.25) * 0.03;
    }
    this.zoom = snap ? zoom : damp(this.zoom, zoom, 4, realDt);
    if (snap) this.camTarget.set(tx, 0, tz);
    else {
      this.camTarget.x = damp(this.camTarget.x, tx, 5, realDt);
      this.camTarget.z = damp(this.camTarget.z, tz, 5, realDt);
    }

    this.trauma = Math.max(0, this.trauma - realDt * 1.7);
    const s = this.trauma * this.trauma * 0.8;
    const t = this.time * 38;
    const sx = s * (Math.sin(t * 1.13) + 0.5 * Math.sin(t * 2.71));
    const sz = s * (Math.cos(t * 0.97) + 0.5 * Math.sin(t * 2.33));
    const c = this.camTarget;
    const lens = this.level.map.camera || {};
    const view = VIEWS[this.view];
    const deg = Math.PI / 180;
    const pitch = (view.pitch ?? lens.pitch ?? CAMERA.pitch) * deg;
    const yaw = (view.yaw ?? 0) * deg;
    // ease between views so pressing V swings the camera rather than cutting
    this.camPitch = snap ? pitch : damp(this.camPitch, pitch, 6, realDt);
    this.camYaw = snap ? yaw : damp(this.camYaw, yaw, 6, realDt);
    const dist = (lens.dist ?? CAMERA.dist) * this.zoom;
    const hor = Math.cos(this.camPitch) * dist;
    this.camera.position.set(c.x + Math.sin(this.camYaw) * hor + sx, Math.sin(this.camPitch) * dist, c.z + Math.cos(this.camYaw) * hor + sz);
    this.camera.lookAt(c.x + sx * 0.4, 0, c.z + sz * 0.4);

    // Cut a hole through whatever stands between the camera and the player:
    // always on the Senado map (17-25 m buildings), on every map once the camera tilts.
    const cut = this.level.cut;
    const tilted = view.pitch !== undefined;
    const radius = this.level.map.cutaway ? (tilted ? 5.5 : 4.2) : tilted ? 2.2 : 0;
    cut.uCutR.value = radius;
    // a map's fade: what stands outside the play area on the camera's side shows the street behind it
    const fade = this.level.map.fade;
    cut.uFadeOn.value = fade ? 1 : 0;
    if (fade) {
      cut.uFadeY.value = fade.above;
      cut.uFadeBox.value.set(this.level.bounds.halfW, this.level.bounds.halfD);
      cut.uFadeDir.value.set(Math.sin(this.camYaw), Math.cos(this.camYaw));
    }
    if (radius > 0) {
      this.camera.updateMatrixWorld();
      cut.uCutA.value.copy(this.camera.position);
      cut.uCutB.value.set(p.x, this.level.groundY(p.x, p.z) + 1.2, p.z);
    }
    // and the buildings between the camera and the player, whole (maps.js `fade.follow`)
    if (fade && fade.follow) this.level.updateFade(this.camera.position, p.x, this.level.groundY(p.x, p.z) + 1.2, p.z, fade.follow);
  }

  render() {
    this.renderer.info.reset();
    const u = this.post.u;
    let focus = this.focusAmt;
    if (this.killcamT > 0) focus = Math.max(focus, 0.85);
    if (this.state === 'dying' || this.state === 'over') focus = Math.max(focus, 0.9);
    u.uFocus.value = focus;
    let hurt = this.hurtFx;
    if ((this.state === 'playing' || this.state === 'paused') && this.player.hp < 35) {
      hurt = Math.max(hurt, 0.25 + 0.15 * Math.sin(this.time * 6));
    }
    u.uHurt.value = hurt;
    u.uFlash.value = this.flashFx;
    u.uRipple.value = this.ripple;
    u.uCenter.value.copy(this.rippleCenter);
    this.post.bloom.strength = this.level.bloom.strength + focus * 0.25;
    this.post.edges.enabled = this.style.edgesOn;
    this.post.render();
  }
}

// optional models first (none is fine), then the game — which starts even if loading fails
loadModels()
  .catch((err) => console.warn('[models] skipped', err))
  .then(() => {
    window.game = new Game();
  });
