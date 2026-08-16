import { simulatePlayerMovement } from '../../../shared/game/movement.js';
import { FIXED_DT, CLIENT_MESSAGES } from '../../../shared/protocol/constants.js';
import { wsClient } from '../network/WebSocketClient.js';
import { networkState } from '../network/NetworkState.js';

/**
 * Client Prediction & Server Reconciliation Engine (Phase 4.5)
 *
 * Runs local player prediction independently at a fixed 60Hz simulation cadence.
 * Transmits input-state version updates over WebSocket at ~30Hz.
 * Maintains an explicit predictionHistory timeline ({ sequence, input, steps }) separate
 * from ACK pending state to preserve local prediction steps executed after an ACK.
 */
export class Prediction {
  constructor() {
    this.pendingInputs = [];
    this.predictionHistory = [];
    this.lastAcknowledgedSequence = 0;
    this.currentHistoryEntry = null;
    this.authoritativePosition = null;
    this.predictedPosition = null;
    this.maxPendingInputs = 500; // Defensive safety cap
    this.predictionIntervalId = null;
    this.inputManagerRef = null;
    this.tickPrediction = this.tickPrediction.bind(this);
  }

  init(initialPosition) {
    this.pendingInputs = [];
    this.predictionHistory = [];
    this.lastAcknowledgedSequence = 0;
    this.currentHistoryEntry = null;
    this.authoritativePosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
    this.predictedPosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
  }

  start(inputManager) {
    this.inputManagerRef = inputManager;

    if (this.predictionIntervalId) {
      clearInterval(this.predictionIntervalId);
    }

    // Independent 60Hz local simulation loop (~16.67ms)
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
    this.predictionHistory = [];
    this.lastAcknowledgedSequence = 0;
    this.currentHistoryEntry = null;
    this.authoritativePosition = null;
    this.predictedPosition = null;
  }

  /**
   * Transmits a new input-state version update over WebSocket (~30Hz or on key change).
   */
  sendInputState(inputState) {
    if (!this.predictedPosition) return;

    const sequence = networkState.getNextInputSequence();

    const cmd = {
      sequence,
      input: {
        up: Boolean(inputState.up),
        down: Boolean(inputState.down),
        left: Boolean(inputState.left),
        right: Boolean(inputState.right)
      }
    };

    // Store in pending queue
    this.pendingInputs.push(cmd);
    if (this.pendingInputs.length > this.maxPendingInputs) {
      this.pendingInputs.shift();
    }

    // Create a new entry in predictionHistory for this sequence version
    this.currentHistoryEntry = {
      sequence,
      input: { ...cmd.input },
      steps: 0
    };
    this.predictionHistory.push(this.currentHistoryEntry);

    // Prune old history entries (keep max 100 entries)
    if (this.predictionHistory.length > 100) {
      this.predictionHistory.shift();
    }

    // Transmit over WebSocket
    if (wsClient.isConnected()) {
      wsClient.send({
        type: CLIENT_MESSAGES.INPUT,
        sequence,
        input: cmd.input
      });
    }
  }

  /**
   * 60Hz local prediction simulation tick.
   * Advances local predicted position and records step into predictionHistory.
   */
  tickPrediction() {
    if (!this.predictedPosition) return;

    const currentInput = this.inputManagerRef
      ? this.inputManagerRef.getInput()
      : { up: false, down: false, left: false, right: false };

    // Advance local prediction by 1 FIXED_DT step
    this.predictedPosition = simulatePlayerMovement(this.predictedPosition, currentInput, FIXED_DT);

    // Ensure we have an active unacknowledged predictionHistory entry
    if (!this.currentHistoryEntry || this.currentHistoryEntry.sequence <= this.lastAcknowledgedSequence) {
      const activeSequence = Math.max(networkState.nextInputSequence, this.lastAcknowledgedSequence + 1);
      this.currentHistoryEntry = {
        sequence: activeSequence,
        input: {
          up: Boolean(currentInput.up),
          down: Boolean(currentInput.down),
          left: Boolean(currentInput.left),
          right: Boolean(currentInput.right)
        },
        steps: 1
      };
      this.predictionHistory.push(this.currentHistoryEntry);
    } else {
      this.currentHistoryEntry.steps += 1;
    }
  }

  /**
   * Reconciles local prediction with authoritative server position.
   * Resets position to server (authX, authY), prunes predictionHistory <= ACK,
   * and replays unacknowledged post-ACK prediction steps.
   *
   * @param {Object} authoritativePos - Authoritative { x, y } from server snapshot
   * @param {number} lastProcessedInput - Server acknowledged input sequence
   */
  reconcile(authoritativePos, lastProcessedInput) {
    if (!authoritativePos) return;

    this.authoritativePosition = { ...authoritativePos };

    if (typeof lastProcessedInput === 'number') {
      this.lastAcknowledgedSequence = Math.max(this.lastAcknowledgedSequence, lastProcessedInput);

      // Prune pending network messages <= ACK
      this.pendingInputs = this.pendingInputs.filter(cmd => cmd.sequence > lastProcessedInput);

      // Prune prediction history entries <= ACK
      this.predictionHistory = this.predictionHistory.filter(entry => entry.sequence > lastProcessedInput);

      if (this.currentHistoryEntry && this.currentHistoryEntry.sequence <= lastProcessedInput) {
        this.currentHistoryEntry = null;
      }
    }

    // Sort remaining history strictly by sequence ascending
    this.predictionHistory.sort((a, b) => a.sequence - b.sequence);

    // Reconstruct predicted position starting from server position
    let replayedPos = { ...authoritativePos };
    for (const entry of this.predictionHistory) {
      for (let i = 0; i < entry.steps; i++) {
        replayedPos = simulatePlayerMovement(replayedPos, entry.input, FIXED_DT);
      }
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
