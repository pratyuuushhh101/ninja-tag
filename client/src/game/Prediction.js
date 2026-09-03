import { simulatePlayerMovement } from '../../../shared/game/movement.js';
import { FIXED_DT, CLIENT_MESSAGES } from '../../../shared/protocol/constants.js';
import { wsClient } from '../network/WebSocketClient.js';
import { networkState } from '../network/NetworkState.js';

/**
 * Client Prediction & Server Reconciliation Engine (Phase 4.6)
 *
 * Runs local player prediction independently at a fixed 60Hz simulation cadence.
 * Transmits input-state version updates over WebSocket at ~30Hz.
 * Maintains two strictly separated history concepts:
 * 1. Network Input-State History (pendingInputs: [{ sequence, input }]): REAL network versions
 * 2. Local Prediction Step History (predictionHistory: [{ predictionId, input, sourceSequence }]): 60Hz simulation steps
 *
 * Network sequence numbers represent input-state versions transmitted over WebSockets.
 * Local prediction steps have internal monotonically increasing predictionId values and nullable sourceSequence.
 */
export class Prediction {
  constructor() {
    this.pendingInputs = [];
    this.predictionHistory = [];
    this.nextPredictionId = 0;
    this.currentNetworkSequence = null;
    this.lastAcknowledgedSequence = 0;
    this.authoritativePosition = null;
    this.predictedPosition = null;
    this.maxPendingInputs = 500;
    this.maxPredictionHistory = 150;
    this.predictionIntervalId = null;
    this.inputManagerRef = null;
    this.tickPrediction = this.tickPrediction.bind(this);
  }

  init(initialPosition) {
    this.pendingInputs = [];
    this.predictionHistory = [];
    this.nextPredictionId = 0;
    this.currentNetworkSequence = null;
    this.lastAcknowledgedSequence = 0;
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
    this.nextPredictionId = 0;
    this.currentNetworkSequence = null;
    this.lastAcknowledgedSequence = 0;
    this.authoritativePosition = null;
    this.predictedPosition = null;
  }

  /**
   * Transmits a REAL input-state version update over WebSocket (~30Hz or on key change).
   * Sequence numbers are generated ONLY in this method.
   */
  sendInputState(inputState) {
    if (!this.predictedPosition) return;

    // Generate REAL network sequence number
    const sequence = networkState.getNextInputSequence();
    this.currentNetworkSequence = sequence;

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
   * Advances local predicted position and records a single prediction step into predictionHistory.
   * DOES NOT generate or increment network sequence numbers.
   */
  tickPrediction() {
    if (!this.predictedPosition) return;

    const currentInput = this.inputManagerRef
      ? this.inputManagerRef.getInput()
      : { up: false, down: false, left: false, right: false };

    // Advance local prediction by 1 FIXED_DT step
    this.predictedPosition = simulatePlayerMovement(this.predictedPosition, currentInput, FIXED_DT);

    // Record local prediction step with unique client-internal predictionId
    this.nextPredictionId += 1;
    const step = {
      predictionId: this.nextPredictionId,
      input: {
        up: Boolean(currentInput.up),
        down: Boolean(currentInput.down),
        left: Boolean(currentInput.left),
        right: Boolean(currentInput.right)
      },
      sourceSequence: this.currentNetworkSequence
    };

    this.predictionHistory.push(step);

    // Safe defensive pruning of old history (keep max 150 steps)
    if (this.predictionHistory.length > this.maxPredictionHistory) {
      this.predictionHistory.shift();
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

      // If current active network sequence has been acknowledged, reset currentNetworkSequence to null
      if (this.currentNetworkSequence !== null && this.currentNetworkSequence <= lastProcessedInput) {
        this.currentNetworkSequence = null;
      }

      // Prune prediction history steps <= ACK (keep steps with sourceSequence === null OR sourceSequence > ACK)
      this.predictionHistory = this.predictionHistory.filter(
        step => step.sourceSequence === null || step.sourceSequence > lastProcessedInput
      );
    }

    // Sort remaining prediction steps strictly by predictionId ascending
    this.predictionHistory.sort((a, b) => a.predictionId - b.predictionId);

    // Reconstruct predicted position starting from server position
    let replayedPos = { ...authoritativePos };
    for (const step of this.predictionHistory) {
      replayedPos = simulatePlayerMovement(replayedPos, step.input, FIXED_DT);
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
