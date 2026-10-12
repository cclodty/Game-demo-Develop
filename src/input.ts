/**
 * 鍵盤與滑鼠輸入。按鍵以實體鍵位（KeyboardEvent.code）記錄，與輸入法、鍵盤配置無關。
 * 視窗失去焦點時清空按鍵，避免角色卡住一直移動。
 */
export class Input {
  readonly down = new Set<string>();
  private readonly pressedSet = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseInside = false;
  mouseDown = false;
  private mousePressed = false;
  wheel = 0;
  enabled = true;

  constructor(private readonly target: HTMLElement) {
    const blockKeys = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3']);
    window.addEventListener('keydown', (e) => {
      // 焦點在設定表單上時，按鍵交給表單（方向鍵調滑桿、空白鍵勾選）
      if (isFormControl(e.target)) return;
      if (blockKeys.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressedSet.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      // 空白鍵在放開時會「按下」目前有焦點的按鈕，這裡一併擋掉
      if (!isFormControl(e.target) && blockKeys.has(e.code)) e.preventDefault();
      this.down.delete(e.code);
    });
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    window.addEventListener('pointermove', (e) => {
      const r = this.target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.mouseInside = this.mouseX >= 0 && this.mouseY >= 0 && this.mouseX <= r.width && this.mouseY <= r.height;
    });
    this.target.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const r = this.target.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.mouseDown = true;
      this.mousePressed = true;
      this.target.setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    this.target.addEventListener('contextmenu', (e) => e.preventDefault());
    this.target.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
  }

  releaseAll(): void {
    this.down.clear();
    this.mouseDown = false;
  }

  isDown(code: string): boolean {
    return this.enabled && this.down.has(code);
  }

  pressed(code: string): boolean {
    return this.pressedSet.has(code);
  }

  firePressed(): boolean {
    return this.enabled && this.mousePressed;
  }

  fireHeld(): boolean {
    return this.enabled && this.mouseDown;
  }

  /** 每幀結束時清除「剛按下」的狀態。 */
  endFrame(): void {
    this.pressedSet.clear();
    this.mousePressed = false;
    this.wheel = 0;
  }
}

function isFormControl(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement;
}
