/**
 * input.js
 * Reads the player's controls during a heist. Sneaking means holding Space
 * (or the right arrow or D) or pressing and holding the on-screen button.
 * It also reports every other key press, click, and mouse movement, which
 * matter in keyboard-only mode.
 */

const SNEAK_KEYS = new Set(['Space', 'ArrowRight', 'KeyD']);

export class HeistInput {
  constructor(button, { onPress, onMove } = {}) {
    this.button = button;
    this.onPress = onPress;
    this.onMove = onMove;
    this.keyHeld = false;
    this.pointerHeld = false;

    const letGo = () => {
      this.pointerHeld = false;
    };
    this.listeners = [
      [window, 'keydown', (event) => this.handleKeyDown(event)],
      [window, 'keyup', (event) => this.handleKeyUp(event)],
      [window, 'blur', () => this.release()],
      [window, 'pointerdown', (event) => this.handlePointerDown(event)],
      [window, 'pointermove', (event) => this.onMove?.(Math.hypot(event.movementX, event.movementY))],
      [button, 'pointerdown', (event) => this.holdButton(event)],
      [button, 'pointerup', letGo],
      [button, 'pointercancel', letGo],
      [button, 'lostpointercapture', letGo],
      [button, 'contextmenu', (event) => event.preventDefault()],
    ];
  }

  get isSneaking() {
    return this.keyHeld || this.pointerHeld;
  }

  attach() {
    this.listeners.forEach(([target, type, handler]) => target.addEventListener(type, handler));
  }

  detach() {
    this.listeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
    this.release();
  }

  release() {
    this.keyHeld = false;
    this.pointerHeld = false;
  }

  handleKeyDown(event) {
    if (SNEAK_KEYS.has(event.code)) {
      // Keep Space from scrolling the page or pressing whichever button has focus.
      event.preventDefault();
      this.keyHeld = true;
      return;
    }
    if (!event.repeat) this.onPress?.('key');
  }

  handleKeyUp(event) {
    if (!SNEAK_KEYS.has(event.code)) return;
    event.preventDefault();
    this.keyHeld = false;
  }

  handlePointerDown(event) {
    // Buttons and links are menu actions, not noises in the gallery.
    if (event.target instanceof Element && event.target.closest('button, a')) return;
    this.onPress?.('click');
  }

  holdButton(event) {
    event.preventDefault();
    this.pointerHeld = true;
    this.button.setPointerCapture(event.pointerId);
  }
}
