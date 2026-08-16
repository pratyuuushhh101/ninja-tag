import { simulatePlayerMovement } from '../../../shared/game/movement.js';
import { FIXED_DT, CLIENT_MESSAGES } from '../../../shared/protocol/constants.js';
import { wsClient } from '../network/WebSocketClient.js';
import { networkState } from '../network/NetworkState.js';

/**
 * Client Prediction & Server Reconciliation Engine (Phase 4.3)
 *
 * Runs a single 60Hz loop operating at FIXED_DT (1/60s).
 * Every tick:
 *  1. Reads current keyboard input state
 *  2. Increments sequence number
 *  3. Creates immutable input command { sequence, input }
 *  4. Adds command to pendingInputs queue
 *  5. Executes 1 FIXED_DT local prediction step
 *  6. Transmits command to server over WebSocket
 *
 * On snapshot arrival:
 *  1. Prunes pendingInputs where sequence <= lastProcessedInput ACK
 *  2. Resets predictedPosition to server (authX, authY)
 *  3. Replays remaining unacknowledged commands in sequence order
 */
export class Prediction {
  constructor() {
    this.pendingInputs = [];
    this.authoritativePosition = null;
    this.predictedPosition = null;
    this.maxPendingInputs = 500; // Defensive safety cap
    this.predictionIntervalId = null;
    this.inputManagerRef = null;
    this.tickPrediction = this.tickPrediction.bind(this);
  }

  init(initialPosition) {
    this.pendingInputs = [];
    this.authoritativePosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
    this.predictedPosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
  }

  start(inputManager) {
    this.inputManagerRef = inputManager;

    if (this.predictionIntervalId) {
      clearInterval(this.predictionIntervalId);
    }

    // Unified 60Hz local simulation & input transmission loop (~16.67ms)
    this.predictionIntervalId = setInterval(this.tickPrediction, 1000 / 60);
  }

  stop() {
    if (this.predictionIntervalId) {
      clearInterval(this.predictionIntervalId);
      this.predictionIntervalId = null;
    }
    this.inputManagerRef = null;
  }

  reset() {
    this.stop();
    this.pendingInputs = [];
    this.authoritativePosition = null;
    this.predictedPosition = null;
  }

  /**
   * Helper method to append a sequence-numbered input command to pendingInputs.
   */
  addInput(sequence, inputState) {
    const cmd = {
      sequence,
      input: {
        up: Boolean(inputState.up),
        down: Boolean(inputState.down),
        left: Boolean(inputState.left),
        right: Boolean(inputState.right)
      }
    };
    this.pendingInputs.push(cmd);
    if (this.pendingInputs.length > this.maxPendingInputs) {
      this.pendingInputs.shift();
    }
  }

  /**
   * 60Hz simulation & input transmission tick.
   * Generates exactly 1 sequence-numbered input command per FIXED_DT step.
   */
  tickPrediction() {
    if (!this.predictedPosition) return;

    const currentInput = this.inputManagerRef
      ? this.inputManagerRef.getInput()
      : { up: false, down: false, left: false, right: false };

    const sequence = networkState.getNextInputSequence();

    const cmd = {
      sequence,
      input: {
        up: Boolean(currentInput.up),
        down: Boolean(currentInput.down),
        left: Boolean(currentInput.left),
        right: Boolean(currentInput.right)
      }
    };

    // 1. Queue command in pending history for reconciliation
    this.pendingInputs.push(cmd);
    if (this.pendingInputs.length > this.maxPendingInputs) {
      this.pendingInputs.shift();
    }

    // 2. Advance predicted position by exactly one FIXED_DT step
    this.predictedPosition = simulatePlayerMovement(this.predictedPosition, cmd.input, FIXED_DT);

    // 3. Transmit command over WebSocket
    if (wsClient.isConnected()) {
      wsClient.send({
        type: CLIENT_MESSAGES.INPUT,
        sequence,
        input: cmd.input
      });
    }
  }

  /**
   * Reconciles local prediction with authoritative server position.
   * Resets position to server (authX, authY) and replays unacknowledged pending input commands.
   *
   * @param {Object} authoritativePos - Authoritative { x, y } from server snapshot
   * @param {number} lastProcessedInput - Server acknowledged input sequence
   */
  reconcile(authoritativePos, lastProcessedInput) {
    if (!authoritativePos) return;

    this.authoritativePosition = { ...authoritativePos };

    // Prune acknowledged inputs sequence <= lastProcessedInput
    if (typeof lastProcessedInput === 'number') {
      this.pendingInputs = this.pendingInputs.filter(cmd => cmd.sequence > lastProcessedInput);
    }

    // Sort remaining commands strictly by sequence number ascending
    this.pendingInputs.sort((a, b) => a.sequence - b.sequence);

    // Reconstruct predicted position starting from server position
    let replayedPos = { ...authoritativePos };
    for (const cmd of this.pendingInputs) {
      replayedPos = simulatePlayerMovement(replayedPos, cmd.input, FIXED_DT);
    }

    this.predictedPosition = replayedPos;
  }

  /**
   * Constructs the composed render state:
   * - Local player: predicted position (x, y)
   * - Remote player(s): authoritative server position (x, y)
   * - IT Role: authoritative server assignment
   *
   * @param {Object} latestSnapshot - Current authoritative snapshot
   * @param {string} localPlayerId - ID of local player
   * @returns {Object} Render state object for GameCanvas
   */
  getRenderState(latestSnapshot, localPlayerId) {
    if (!latestSnapshot || !latestSnapshot.players) {
      return null;
    }

    const players = latestSnapshot.players.map(player => {
      if (player.id === localPlayerId && this.predictedPosition) {
        return {
          id: player.id,
          x: this.predictedPosition.x,
          y: this.predictedPosition.y
        };
      }
      return {
        id: player.id,
        x: player.x,
        y: player.y
      };
    });

    return {
      tick: latestSnapshot.tick,
      players,
      itPlayerId: latestSnapshot.itPlayerId
    };
  }

  getPendingCount() {
    return this.pendingInputs.length;
  }
}

export const prediction = new Prediction();
