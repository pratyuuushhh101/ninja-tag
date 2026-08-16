import { wsClient } from '../network/WebSocketClient.js';
import { CLIENT_MESSAGES } from '../../../shared/protocol/constants.js';

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
    // Reset input
    this.input = { up: false, down: false, left: false, right: false };
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
    wsClient.send({
      type: CLIENT_MESSAGES.INPUT,
      input: { ...this.input }
    });
  }
}
