// Keyboard + mouse state with "pressed this frame" edges.

const BLOCKED = new Set(['Space', 'ShiftLeft', 'ShiftRight', 'Tab', 'Digit1', 'Digit2', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

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

  endFrame() {
    this.wheel = 0;
    this.pressed.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.rightReleased = false;
  }
}
