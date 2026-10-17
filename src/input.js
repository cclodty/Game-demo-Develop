// Keyboard + mouse state. The page's events collect here; once per fixed logic
// step, latch() turns them into a StepInput, the only input the game logic
// reads (and what replay.js records).

const BLOCKED = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'Tab', 'Digit1', 'Digit2', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Every control the game logic reads, one bit each (at most 31). Recorded runs
 * store these bits, so only ever append to the list. Mouse0 / Mouse2 are the
 * left and right buttons; the wheel only ever counts as a press.
 */
export const BUTTONS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'KeyQ', 'Space', 'KeyC', 'KeyF', 'KeyG', 'KeyE', 'KeyR',
  'Digit1', 'Digit2', 'Mouse0', 'Mouse2', 'WheelUp', 'WheelDown',
];
const BIT = new Map(BUTTONS.map((c, i) => [c, 1 << i]));

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
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
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
   * Fill `cmd` for the next logic step and consume the presses. `aim` is the
   * cursor on the floor, or null to keep the step before's aim; (ox, oz) is the
   * player, `yaw` the camera's current yaw.
   */
  latch(cmd, aim, ox, oz, yaw) {
    let keys = 0;
    let pressed = 0;
    for (const c of this.keys) keys |= BIT.get(c) || 0;
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
