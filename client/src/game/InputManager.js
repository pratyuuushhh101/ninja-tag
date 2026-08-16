import { wsClient } from '../network/WebSocketClient.js';
import { networkState } from '../network/NetworkState.js';
import { prediction } from './Prediction.js';
import { CLIENT_MESSAGES, INPUT_INTERVAL_MS } from '../../../shared/protocol/constants.js';

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

    // Start 30Hz controlled input heartbeat loop (~33.33ms)
    this.heartbeatId = setInterval(this.sendInput, INPUT_INTERVAL_MS);
  }

  stop() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);

    if (this.heartbeatId) {
      clearInterval(this.heartbeatId);
      this.heartbeatId = null;
    }

    // Reset input state
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
    if (!wsClient.isConnected()) return;

    const sequence = networkState.getNextInputSequence();
    const inputCopy = { ...this.input };

    // 1. Predict local movement step immediately & store in pending queue
    prediction.addInput(sequence, inputCopy);

    // 2. Transmit to server over WebSocket
    wsClient.send({
      type: CLIENT_MESSAGES.INPUT,
      sequence,
      input: inputCopy
    });
  }
}
