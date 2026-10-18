// Keyboard, mouse and gamepad state. The page's events (and the pad, polled once
// a frame) collect here; once per fixed logic step, latch() turns them into a
// StepInput, the only input the game logic reads (and what replay.js records).

import { PAD } from './config.js';

const BLOCKED = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'Tab', 'Digit1', 'Digit2', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Every control the game logic reads, one bit each (at most 31). Recorded runs
 * store these bits, so only ever append to the list. Mouse0 / Mouse2 are the
 * left and right buttons; the wheel only ever counts as a press.
 */
export const BUTTONS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'KeyQ', 'Space', 'KeyC', 'KeyF', 'KeyG', 'KeyE', 'KeyR',
  'Digit1', 'Digit2', 'Mouse0', 'Mouse2', 'WheelUp', 'WheelDown', 'Escape',
];
const BIT = new Map(BUTTONS.map((c, i) => [c, 1 << i]));

/**
 * A gamepad in the standard layout (the Gamepad API's 'standard' mapping): each button stands for
 * one of the controls above, so a pad run is recorded like any other. The left stick holds WASD;
 * the right stick aims (main.js padAim); Start pauses (not a recorded control). LB and RB are read
 * apart (PAD_SHOULDERS).
 */
export const PAD_BUTTONS = [
  [0, 'Space'], // A: spin
  [1, 'KeyC'], // B: slide
  [2, 'KeyF'], // X: kick
  [3, 'KeyG'], // Y: throw
  [6, 'Mouse2'], // LT: the right mouse button (split aim with two guns, the scope with a rifle)
  [7, 'Mouse0'], // RT: fire
  [12, 'KeyE'], // d-pad up: swap for the weapon on the floor
];
const PAD_START = 9;
/**
 * The shoulder buttons: LB and RB down together toggle bullet time; alone, LB reloads and RB takes
 * the other weapon, when let go, so reaching for both at once never reloads first.
 */
const PAD_SHOULDERS = { lb: 4, rb: 5, both: 'KeyQ', lbAlone: 'KeyR', rbAlone: 'WheelDown' };

/** How hints name a control, on the keyboard and on a pad: `{name}` in a hint becomes one of these. */
export const CONTROL_LABELS = {
  focus: ['<b>Shift</b> 或 <b>Q</b>', '<b>LB</b>+<b>RB</b>'],
  throw: ['<b>G</b>', '<b>Y</b>'],
  fire: ['<b>左鍵</b>', '<b>RT</b>'],
  swap: ['<b>E</b>', '<b>十字鍵 ↑</b>'],
};

/** A pad's name as the browser gives it, shortened: no vendor numbers, no "(STANDARD GAMEPAD …)". */
export const padLabel = (id) =>
  String(id || '')
    .replace(/\s*\([^)]*(STANDARD GAMEPAD|Vendor:)[^)]*\)\s*/gi, ' ')
    .replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '')
    .trim() || '手掣';

/** A hint (HTML) with its `{control}` names filled in for the keyboard, or for a pad. */
export const withLabels = (html, pad) => html.replace(/\{(\w+)\}/g, (m, k) => (CONTROL_LABELS[k] ? CONTROL_LABELS[k][pad ? 1 : 0] : m));

// The aim is kept as an offset from the player in 2 cm units (finer than any
// weapon's spread, coarse enough to keep the record small), the camera yaw in 1/10000 rad.
export const AIM_Q = 50;
export const YAW_Q = 10000;

function bits(codes) {
  let m = 0;
  for (const c of codes) {
    const b = BIT.get(c);
    if (b === undefined) throw new Error(`${c} is not a recorded control: add it to BUTTONS in input.js`);
    m |= b;
  }
  return m;
}

/**
 * One logic step's input: the controls held and the ones pressed since the
 * previous step, where the cursor points on the floor, and the camera yaw
 * (WASD follow the screen, even while the camera swings after V).
 */
export class StepInput {
  constructor() {
    this.keys = 0; // held controls, BUTTONS bits
    this.pressed = 0; // controls pressed since the previous step
    this.aimQX = 0; // aim offset from the player, AIM_Q units
    this.aimQZ = -5 * AIM_Q;
    this.yawQ = 0; // camera yaw, YAW_Q units
    // what the logic reads, derived by resolve()
    this.aim = { x: 0, z: 0 };
    this.yaw = 0;
    this.wheel = 0;
    this.mouse = { left: false, right: false, leftPressed: false, rightPressed: false };
  }

  down(...codes) {
    return (this.keys & bits(codes)) !== 0;
  }

  hit(...codes) {
    return (this.pressed & bits(codes)) !== 0;
  }

  /** Derive the readable fields from the stored numbers, placing the aim relative to the player at (ox, oz). */
  resolve(ox, oz) {
    this.aim.x = ox + this.aimQX / AIM_Q;
    this.aim.z = oz + this.aimQZ / AIM_Q;
    this.yaw = this.yawQ / YAW_Q;
    this.wheel = this.pressed & BIT.get('WheelDown') ? 1 : this.pressed & BIT.get('WheelUp') ? -1 : 0;
    const m = this.mouse;
    m.left = (this.keys & BIT.get('Mouse0')) !== 0;
    m.right = (this.keys & BIT.get('Mouse2')) !== 0;
    m.leftPressed = (this.pressed & BIT.get('Mouse0')) !== 0;
    m.rightPressed = (this.pressed & BIT.get('Mouse2')) !== 0;
    return this;
  }
}

/** Keys typed into a text field (the playtest note box) are not game input. */
const TOGGLES = new Set(['checkbox', 'radio', 'range', 'button']);
const editable = (t) => !!t && (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !TOGGLES.has(t.type)) || t.isContentEditable);

export class Input {
  constructor() {
    // a gamepad, read once a display frame (poll): its held controls, the right stick, Start
    this.pad = null; // the pad in use, or null
    this.padIndex = -1; // its slot in navigator.getGamepads(): the last pad touched (-1: none yet)
    this.padTouch = new Map(); // slot → the buttons down and sticks pushed at the last poll, to see a new touch
    this.pads = []; // every pad the browser lists ({ index, id, mapping }), for the feedback export
    this.usingPad = false; // the pad aims: its right stick moved more recently than the mouse or the keyboard
    this.padKeys = new Set();
    this.padStick = { x: 0, y: 0 };
    this.padStart = false; // Start pressed since the last poll
    this.padStartWas = false;
    this.padShoulder = { lb: false, rb: false, both: false }; // the shoulder buttons at the last poll, and whether both went down together
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = {
      x: innerWidth / 2,
      y: innerHeight / 2,
      left: false,
      right: false,
      leftPressed: false,
      rightPressed: false,
      rightReleased: false,
    };

    addEventListener('keydown', (e) => {
      if (editable(e.target)) return;
      if (BLOCKED.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.usingPad = false;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.usingPad = false;
    });
    addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.usingPad = false;
      if (e.button === 0) {
        this.mouse.left = true;
        this.mouse.leftPressed = true;
      } else if (e.button === 2) {
        this.mouse.right = true;
        this.mouse.rightPressed = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      else if (e.button === 2) {
        this.mouse.right = false;
        this.mouse.rightReleased = true;
      }
    });
    this.wheel = 0;
    addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('blur', () => this.releaseAll());
  }

  releaseAll() {
    this.keys.clear();
    if (this.mouse.right) this.mouse.rightReleased = true;
    this.mouse.left = false;
    this.mouse.right = false;
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  hit(...codes) {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  /**
   * Read the gamepad in use (once a display frame). Its buttons and left stick join the keyboard's
   * controls, held and pressed since the last poll; the right stick and Start are kept for main.js.
   * The pad in use is the last one touched (a button pressed, a stick pushed past half way), so a
   * second pad, or a keyboard, mouse or driver the browser also lists as a gamepad, never stands in
   * its way; until one is touched, the first in the standard layout. Returns the pad, or null.
   */
  poll() {
    let list = [];
    try {
      list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter((p) => p && p.connected) : [];
    } catch {
      list = []; // not allowed here (a frame without the permission)
    }
    this.pads = list.map((p) => ({ index: p.index, id: p.id, mapping: p.mapping }));
    const seen = new Map();
    for (const p of list) {
      const down = new Set();
      p.buttons.forEach((b, i) => {
        if (b && (b.pressed || b.value > 0.5)) down.add(`b${i}`);
      });
      // a non-standard device's axes may rest anywhere (triggers at -1): only its buttons count
      if (p.mapping === 'standard') {
        p.axes.forEach((a, i) => {
          if (Math.abs(a) > 0.5) down.add(`a${i}${a > 0 ? '+' : '-'}`);
        });
      }
      // a touch is something newly down since the pad was last seen (a button held all along is not)
      const was = this.padTouch.get(p.index);
      if (was && [...down].some((k) => !was.has(k))) this.padIndex = p.index;
      seen.set(p.index, down);
    }
    this.padTouch = seen;
    // unplugged: forget it, so whatever takes its slot later has to be touched first
    if (!list.some((p) => p.index === this.padIndex)) this.padIndex = -1;
    const pad = list.find((p) => p.index === this.padIndex) || list.find((p) => p.mapping === 'standard') || null;
    this.pad = pad;
    const held = new Set();
    let start = false;
    if (pad) {
      const on = (i) => !!pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5);
      for (const [i, code] of PAD_BUTTONS) if (on(i)) held.add(code);
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
      if (lx < -PAD.moveAt) held.add('KeyA');
      else if (lx > PAD.moveAt) held.add('KeyD');
      if (ly < -PAD.moveAt) held.add('KeyW');
      else if (ly > PAD.moveAt) held.add('KeyS');
      this.padStick.x = rx;
      this.padStick.y = ry;
      start = on(PAD_START);
      if (Math.hypot(rx, ry) > PAD.deadzone) this.usingPad = true;
      this.shoulders(on(PAD_SHOULDERS.lb), on(PAD_SHOULDERS.rb));
    } else {
      this.shoulders(false, false);
    }
    for (const c of held) if (!this.padKeys.has(c)) this.pressed.add(c);
    this.padKeys = held;
    this.padStart = start && !this.padStartWas;
    this.padStartWas = start;
    return pad;
  }

  /** LB and RB (PAD_SHOULDERS): together a press of bullet time; alone, their own press when let go. */
  shoulders(lb, rb) {
    const S = this.padShoulder;
    const P = PAD_SHOULDERS;
    if (lb && rb && !S.both) {
      S.both = true;
      this.pressed.add(P.both);
    }
    if (S.lb && !lb && !S.both) this.pressed.add(P.lbAlone);
    if (S.rb && !rb && !S.both) this.pressed.add(P.rbAlone);
    if (!lb && !rb) S.both = false;
    S.lb = lb;
    S.rb = rb;
  }

  /**
   * Fill `cmd` for the next logic step and consume the presses. `aim` is the
   * cursor on the floor, or null to keep the step before's aim; (ox, oz) is the
   * player, `yaw` the camera's current yaw.
   */
  latch(cmd, aim, ox, oz, yaw) {
    let keys = 0;
    let pressed = 0;
    for (const c of this.keys) keys |= BIT.get(c) || 0;
    for (const c of this.padKeys) keys |= BIT.get(c) || 0;
    for (const c of this.pressed) pressed |= BIT.get(c) || 0;
    const m = this.mouse;
    if (m.left) keys |= BIT.get('Mouse0');
    if (m.right) keys |= BIT.get('Mouse2');
    if (m.leftPressed) pressed |= BIT.get('Mouse0');
    if (m.rightPressed) pressed |= BIT.get('Mouse2');
    if (this.wheel) pressed |= BIT.get(this.wheel > 0 ? 'WheelDown' : 'WheelUp');
    cmd.keys = keys;
    cmd.pressed = pressed;
    if (aim) {
      // one unit of hysteresis, so a still cursor does not flicker between two values
      const qx = (aim.x - ox) * AIM_Q;
      const qz = (aim.z - oz) * AIM_Q;
      if (Math.abs(qx - cmd.aimQX) >= 1) cmd.aimQX = Math.round(qx);
      if (Math.abs(qz - cmd.aimQZ) >= 1) cmd.aimQZ = Math.round(qz);
    }
    cmd.yawQ = Math.round(yaw * YAW_Q);
    this.dropEdges();
    return cmd.resolve(ox, oz);
  }

  /** Forget presses that no logic step took (title screen, pause, game over). */
  dropEdges() {
    this.wheel = 0;
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.rightReleased = false;
  }
}
