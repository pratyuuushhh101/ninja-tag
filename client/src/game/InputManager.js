/**
 * InputManager — Captures keyboard events and exposes current input state.
 *
 * Keyboard events (keydown/keyup) update the internal input state.
 * The 60Hz prediction loop in Prediction.js reads current input state via getInput()
 * and generates 1-to-1 input commands at 60Hz.
 */
export class InputManager {
  constructor() {
    this.input = { up: false, down: false, left: false, right: false };
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
  }

  start() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  stop() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.input = { up: false, down: false, left: false, right: false };
  }

  getInput() {
    return { ...this.input };
  }

  handleKeyDown(e) {
    this.updateKey(e.key, true);
  }

  handleKeyUp(e) {
    this.updateKey(e.key, false);
  }

  updateKey(key, pressed) {
    let changed = false;
    switch (key) {
      case 'w': case 'W': case 'ArrowUp':
        if (this.input.up !== pressed) { this.input.up = pressed; changed = true; }
        break;
      case 'a': case 'A': case 'ArrowLeft':
        if (this.input.left !== pressed) { this.input.left = pressed; changed = true; }
        break;
      case 's': case 'S': case 'ArrowDown':
        if (this.input.down !== pressed) { this.input.down = pressed; changed = true; }
        break;
      case 'd': case 'D': case 'ArrowRight':
        if (this.input.right !== pressed) { this.input.right = pressed; changed = true; }
        break;
    }
    return changed;
  }
}
