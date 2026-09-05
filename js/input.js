/** Keyboard + mouse state with pointer lock. */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this.forceLocked = false; // debug/testing: treat input as captured without pointer lock
    this.enabled = false;
    this.pressedThisFrame = new Set();
    this.onLockChange = null;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressedThisFrame.add(k);
      this.keys.add(k);
      if (['Space', 'Tab', 'KeyE', 'KeyR', 'KeyQ'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.forceLocked) {
        this.requestLock();
        return;
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.pressedThisFrame.add('Mouse0');
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.locked) return;
      this.pressedThisFrame.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp');
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.mouseDown = false;
        this.keys.clear();
      }
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    try {
      this.canvas.requestPointerLock();
    } catch (_) {
      /* ignore */
    }
  }

  releaseLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.pressedThisFrame.has(code);
  }

  /** Consume per-frame mouse deltas + one-shot presses. Call at end of frame. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pressedThisFrame.clear();
  }
}
