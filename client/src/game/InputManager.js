import { prediction } from './Prediction.js';
import { INPUT_INTERVAL_MS } from '../../../shared/protocol/constants.js';

/**
 * InputManager — Captures keyboard events and transmits input-state updates at ~30Hz.
 *
 * Keyboard events (keydown/keyup) update current input state and transmit updates.
 * A ~30Hz heartbeat interval ensures continuous input-state updates.
 */
export class InputManager {
  constructor() {
    this.input = { up: false, down: false, left: false, right: false };
    this.heartbeatId = null;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.sendInput = this.sendInput.bind(this);
  }

  start() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Controlled ~30Hz input transmission heartbeat (~33.33ms)
    this.heartbeatId = setInterval(this.sendInput, INPUT_INTERVAL_MS);
  }

  stop() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    if (this.heartbeatId) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }

    this.input = { up: false, down: false, left: false, right: false };
  }

  getInput() {
    return { ...this.input };
  }

  handleKeyDown(e) {
    if (this.updateKey(e.key, true)) {
      this.sendInput();
    }
  }

  handleKeyUp(e) {
    if (this.updateKey(e.key, false)) {
      this.sendInput();
    }
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

  sendInput() {
    prediction.sendInputState({ ...this.input });
  }
}
