// Settings (設定, playtest feedback ②): a page over the title and the pause
// menu with the music and sound volumes and the key for every action, on the
// keyboard and on a pad. A key is rebound by pressing the next one; a key
// another action had swaps over. The logic reads controls, not keys, so a run
// on rebound keys records and replays like any other. E picks things up (and
// swaps a pad's weapon), G throws. Run: npm test
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, PAD_BUTTONS } from '../src/input.js';
import { Settings } from '../src/settings.js';
import { gameHarness, OUT, problems } from './helpers.mjs';

/** A stand-in for localStorage. */
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

test('the store: defaults from the actions, a rebound key swaps with its old owner, a pad button too, and a reload keeps it all', () => {
  const st = memoryStorage();
  const s = new Settings(st);
  assert.deepEqual([s.music, s.sfx], [1, 1]);
  for (const a of ACTIONS) assert.equal(s.keys[a.id], a.key, `${a.id} starts on its default key`);
  assert.equal(s.pad.kick, PAD_BUTTONS.find(([, c]) => c === 'KeyF')[0], 'the kick is on X');
  assert.equal(s.pad.view, undefined, 'a ui key has no pad button');
  s.bindKey('kick', 'KeyX');
  assert.equal(s.keys.kick, 'KeyX');
  s.bindKey('throw', 'KeyX'); // the throw takes X: the kick gets the throw's old G
  assert.deepEqual([s.keys.throw, s.keys.kick], ['KeyX', 'KeyG'], 'no key drives two actions');
  s.bindPad('spin', 2); // A → X: the kick, which had X, takes A
  assert.deepEqual([s.pad.spin, s.pad.kick], [2, 0]);
  s.music = 0.5;
  s.sfx = 0;
  s.save();
  const again = new Settings(st);
  assert.deepEqual([again.music, again.sfx, again.keys.throw, again.keys.kick, again.pad.spin, again.pad.kick], [0.5, 0, 'KeyX', 'KeyG', 2, 0], 'kept');
  assert.deepEqual(
    again.changedKeys().map(([n]) => n),
    ['踢 · 鑊擊 · 開傘', '擲出'],
  );
  again.reset();
  assert.deepEqual([again.music, again.keys.kick, again.pad.kick], [1, 'KeyF', 2], 'back to the defaults');
  assert.equal(new Settings(st).keys.kick, 'KeyF', 'and saved');
});

let h;
before(async () => {
  h = await gameHarness();
});
after(async () => {
  await h.close();
});

/** Fire a real key event at the page (the way a player's key reaches input.js), not a control into the step. */
const KEY = `(code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }))`;

test('the page: volumes move the mix and survive a reload; a rebound key drives its action, its old key drives nothing, and the hints say the new key', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open('?seed=21');
  try {
    await page.evaluate(() => {
      window.game.frame = () => {};
      localStorage.removeItem('bullet-ballet.settings');
      window.game.settings.reset();
      window.game.applySettings();
    });
    await page.click('#open-settings');
    const opened = await page.evaluate(() => ({
      shown: !document.getElementById('settings').classList.contains('hidden'),
      title: document.getElementById('title').classList.contains('hidden'),
      rows: document.querySelectorAll('#set-keys .set-key:not(.set-head)').length,
      kick: document.querySelector('#set-keys button[data-action="kick"][data-pad="0"]').textContent,
      kickPad: document.querySelector('#set-keys button[data-action="kick"][data-pad="1"]').textContent,
    }));
    assert.deepEqual(opened, { shown: true, title: true, rows: ACTIONS.length, kick: 'F', kickPad: 'X' });
    await page.screenshot({ path: new URL('settings.png', OUT).pathname });
    // the sliders
    const vol = await page.evaluate(() => {
      const g = window.game;
      const set = (id, v) => {
        const el = document.getElementById(`set-${id}`);
        el.value = String(v);
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
      };
      set('music', 50);
      set('sfx', 0);
      return { music: g.settings.music, sfx: g.settings.sfx, audio: [g.audio.musicVol, g.audio.sfxVol], shown: document.getElementById('set-music-v').textContent };
    });
    assert.deepEqual(vol, { music: 0.5, sfx: 0, audio: [0.5, 0], shown: '50%' });
    // rebinding: click the kick's key, press X
    await page.click('#set-keys button[data-action="kick"][data-pad="0"]');
    const listening = await page.evaluate(() => document.querySelector('#set-keys button[data-action="kick"][data-pad="0"]').textContent);
    assert.match(listening, /按一個鍵/);
    await page.keyboard.press('KeyX');
    const bound = await page.evaluate(() => {
      const g = window.game;
      return { key: g.settings.keys.kick, shown: document.querySelector('#set-keys button[data-action="kick"][data-pad="0"]').textContent, binding: g.binding, hint: document.getElementById('hint').textContent };
    });
    assert.deepEqual([bound.key, bound.shown, bound.binding], ['KeyX', 'X', null]);
    assert.match(bound.hint, /X 踢/);
    assert.doesNotMatch(bound.hint, /F 踢/);
    // a reload keeps it
    await page.reload();
    await page.waitForFunction(() => window.game && window.game.startRun);
    const kept = await page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      return { music: g.settings.music, sfx: g.settings.sfx, kick: g.settings.keys.kick, audio: g.audio.musicVol };
    });
    assert.deepEqual(kept, { music: 0.5, sfx: 0, kick: 'KeyX', audio: 0.5 });
    // in a run: X is the kick, F is nothing; the record carries the control, so a replay would be the same
    const played = await page.evaluate(
      async (KEY) => {
        const key = eval(KEY);
        const g = window.game;
        g.startRun(0);
        g.waves.state = 'done';
        g.enemies.clear();
        const p = g.player;
        const step = () => {
          g.aimPoint.set(p.x, g.aimPoint.y, p.z - 5);
          g.aimFresh = true;
          g.updatePlay(1 / 60);
        };
        step();
        key('KeyF', true);
        const f = { pressed: [...g.input.pressed], keys: [...g.input.keys] };
        step();
        const fKick = p.kickT > 0;
        key('KeyF', false);
        for (let i = 0; i < 30; i++) step();
        key('KeyX', true);
        const x = { pressed: [...g.input.pressed], keys: [...g.input.keys] };
        step();
        const xKick = p.kickT > 0;
        key('KeyX', false);
        const label = (await import('/src/input.js')).CONTROL_LABELS.kick[0];
        return { f, fKick, x, xKick, label, prompt: g.thrown.prompt };
      },
      KEY,
    );
    assert.deepEqual(played.f, { pressed: [], keys: [] }, 'F drives nothing now');
    assert.equal(played.fKick, false);
    assert.deepEqual(played.x, { pressed: ['KeyF'], keys: ['KeyF'] }, 'X is recorded as the kick control');
    assert.equal(played.xKick, true, 'and kicks');
    assert.match(played.label, /X/);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});

test('E picks up what lies here, swaps a weapon on a pad instead when one is there, and G throws; the pad binds a button; the page opens from the pause menu', { timeout: 120000 }, async () => {
  const { page, logs } = await h.open('?seed=22');
  try {
    const r = await page.evaluate(() => {
      const g = window.game;
      g.frame = () => {};
      localStorage.removeItem('bullet-ballet.settings');
      g.settings.reset();
      g.applySettings();
      g.startRun(0);
      g.waves.state = 'done';
      g.enemies.clear();
      const p = g.player;
      p.x = 0;
      p.z = 4;
      const step = (press = []) => {
        g.killcamT = 0;
        g.hitstopT = 0;
        p.vx = p.vz = 0;
        g.input.pressed.clear();
        for (const k of press) g.input.pressed.add(k);
        g.aimPoint.set(0, g.aimPoint.y, -6);
        g.aimFresh = true;
        g.updatePlay(1 / 120);
        g.input.pressed.clear();
      };
      const pan = g.level.pans[0];
      pan.x = 0.6;
      pan.z = 4;
      pan.y = 0.05;
      pan.vx = pan.vz = pan.vy = 0;
      step();
      const promptPan = g.thrown.prompt;
      // G at a pan does nothing (nothing to throw); E takes it; G throws it
      step(['KeyG']);
      const gFirst = { carry: !!g.thrown.carry };
      step(['KeyE']);
      const taken = { carry: g.thrown.carry === pan, inHand: g.thrown.inHand };
      step(['KeyG']);
      const thrown = { carry: g.thrown.carry, flying: pan.thrown };
      for (let i = 0; i < 120; i++) step();
      // a weapon pad with another gun beside the pan: E swaps the gun and leaves the pan
      pan.x = 0.6;
      pan.z = 4;
      pan.y = 0.05;
      pan.vx = pan.vz = pan.vy = 0;
      pan.thrown = false;
      g.pickups.spawn('smg', 0, 4); // nothing in slot 2: taken on touch
      step();
      const slot2 = p.special && p.special.id;
      g.pickups.spawn('shotgun', 0.4, 4.2);
      step();
      const promptPad = !!g.pickups.prompt;
      step(['KeyE']);
      const swapped = { special: p.special && p.special.id, carry: !!g.thrown.carry };
      return { promptPan, gFirst, taken, thrown, slot2, promptPad, swapped };
    });
    assert.match(r.promptPan, /^\{pick\} 拿起/);
    assert.equal(r.gFirst.carry, false, 'G with nothing in hand picks nothing up');
    assert.deepEqual(r.taken, { carry: true, inHand: true }, 'E takes the pan');
    assert.deepEqual([r.thrown.carry, r.thrown.flying], [null, true], 'G throws it');
    assert.equal(r.slot2, 'smg', 'the first gun is taken on touch');
    assert.equal(r.promptPad, true, 'a different gun on the pad offers a swap');
    assert.deepEqual(r.swapped, { special: 'shotgun', carry: false }, 'E swaps the gun and does not pick up the pan');

    // the pad: a fake standard pad; Y bound to the kick swaps with X, and a press on the page binds
    const pad = await page.evaluate(() => {
      const g = window.game;
      const pad = { id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
      const press = (i, on = true) => (pad.buttons[i] = { pressed: on, value: on ? 1 : 0 });
      g.pollPad();
      g.settings.bindPad('kick', 3);
      g.applySettings();
      press(3);
      g.input.poll();
      const yKick = g.input.padKeys.has('KeyF');
      press(3, false);
      g.input.poll();
      press(2);
      g.input.poll();
      const xThrow = g.input.padKeys.has('KeyG'); // X took the throw's old button
      press(2, false);
      g.input.poll();
      // the page listens for a pad button for the spin: press B
      g.binding = { id: 'spin', pad: true };
      press(1);
      g.pollPad();
      const bound = { spin: g.settings.pad.spin, slide: g.settings.pad.slide, binding: g.binding };
      press(1, false);
      g.pollPad();
      return { yKick, xThrow, bound };
    });
    assert.equal(pad.yKick, true, 'Y kicks');
    assert.equal(pad.xThrow, true, 'X throws now');
    assert.deepEqual(pad.bound, { spin: 1, slide: 0, binding: null }, 'B is the spin, A the slide, and the page stopped listening');

    // the pause menu's settings button, and Esc back to the pause menu
    await page.evaluate(() => window.game.setPaused(true));
    await page.click('#pause button[data-act="settings"]');
    const over = await page.evaluate(() => ({ settings: !document.getElementById('settings').classList.contains('hidden'), pause: document.getElementById('pause').classList.contains('hidden'), state: window.game.state }));
    assert.deepEqual(over, { settings: true, pause: true, state: 'paused' });
    await page.keyboard.press('Escape');
    const back = await page.evaluate(() => ({ settings: document.getElementById('settings').classList.contains('hidden'), pause: !document.getElementById('pause').classList.contains('hidden'), state: window.game.state }));
    assert.deepEqual(back, { settings: true, pause: true, state: 'paused' });
    const exported = await page.evaluate(() => window.game.notes.exportText());
    assert.match(exported, /設定：音樂 100%、音效 100%、改過的鍵：無/);
    assert.deepEqual(problems(logs), []);
  } finally {
    await page.close();
  }
});
