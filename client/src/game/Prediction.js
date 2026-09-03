import { simulatePlayerMovement } from '../../../shared/game/movement.js';
import { FIXED_DT, CLIENT_MESSAGES } from '../../../shared/protocol/constants.js';
import { wsClient } from '../network/WebSocketClient.js';
import { networkState } from '../network/NetworkState.js';

/**
 * Client Prediction & Server Reconciliation Engine (Phase 4.7)
 *
 * Runs local player prediction independently at a fixed 60Hz simulation cadence.
 * On every 60Hz tick, captures input state, assigns a real monotonically increasing
 * network sequence number (1-to-1 input command), predicts local movement, stores the command in pendingInputs,
 * and transmits the command over WebSocket.
 *
 * Server snapshots include lastProcessedInput ACK. On reconciliation, acknowledged commands
 * (<= ACK) are pruned and remaining unacknowledged commands are replayed starting from server position.
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
    this.authoritativePosition = null;
    this.predictedPosition = null;
  }

  /**
   * 60Hz local prediction tick.
   * Reads current input, generates real sequence number, predicts local movement,
   * stores command in pendingInputs, and transmits over WebSocket.
   */
  tickPrediction() {
    if (!this.predictedPosition) return;

    const currentInput = this.inputManagerRef
      ? this.inputManagerRef.getInput()
      : { up: false, down: false, left: false, right: false };

    // Generate real monotonically increasing sequence number for this 60Hz command
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

    // Advance local prediction by 1 FIXED_DT step
    this.predictedPosition = simulatePlayerMovement(this.predictedPosition, cmd.input, FIXED_DT);

    // Store in pending queue for reconciliation
    this.pendingInputs.push(cmd);
    if (this.pendingInputs.length > this.maxPendingInputs) {
      this.pendingInputs.shift();
    }

    // Transmit 60Hz input command over WebSocket
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
   * Resets position to server (authX, authY), prunes pendingInputs <= ACK,
   * and replays unacknowledged commands (> ACK) in sequence order.
   *
   * @param {Object} authoritativePos - Authoritative { x, y } from server snapshot
   * @param {number} lastProcessedInput - Server acknowledged input sequence
   */
  reconcile(authoritativePos, lastProcessedInput) {
    if (!authoritativePos) return;

    this.authoritativePosition = { ...authoritativePos };

    if (typeof lastProcessedInput === 'number') {
      // Prune pending network commands <= ACK
      this.pendingInputs = this.pendingInputs.filter(cmd => cmd.sequence > lastProcessedInput);
    }

    // Sort remaining pending commands strictly by sequence ascending
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
