import { simulatePlayerMovement } from '../../../shared/game/movement.js';
import { FIXED_DT } from '../../../shared/protocol/constants.js';

/**
 * Client Prediction & Server Reconciliation Engine
 *
 * Predicts local player movement immediately on key press (zero latency),
 * stores unacknowledged inputs in a pending history queue, and reconciles
 * local predicted position with authoritative server snapshots.
 */
export class Prediction {
  constructor() {
    this.pendingInputs = [];
    this.authoritativePosition = null;
    this.predictedPosition = null;
    this.maxPendingInputs = 500; // Defensive safety cap
  }

  init(initialPosition) {
    this.pendingInputs = [];
    this.authoritativePosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
    this.predictedPosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
  }

  reset() {
    this.pendingInputs = [];
    this.authoritativePosition = null;
    this.predictedPosition = null;
  }

  /**
   * Adds a newly generated input command to pending history and predicts
   * local movement step immediately.
   *
   * @param {number} sequence - Monotonically increasing sequence number
   * @param {Object} inputState - Input command state { up, down, left, right }
   */
  addInput(sequence, inputState) {
    if (!this.predictedPosition) return;

    // Create immutable snapshot of input command
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

    // Defensive safety cap to prevent unconstrained array growth
    if (this.pendingInputs.length > this.maxPendingInputs) {
      console.warn(`[NinjaTag] Pending input queue exceeded ${this.maxPendingInputs}, trimming oldest.`);
      this.pendingInputs.shift();
    }

    // Predict local movement step immediately
    this.predictedPosition = simulatePlayerMovement(this.predictedPosition, cmd.input, FIXED_DT);
  }

  /**
   * Reconciles local prediction with authoritative server position.
   * Prunes acknowledged inputs (sequence <= lastProcessedInput), resets
   * simulation to server (x, y), and replays unacknowledged inputs.
   *
   * @param {Object} authoritativePos - Authoritative { x, y } from server snapshot
   * @param {number} lastProcessedInput - Server acknowledged input sequence
   */
  reconcile(authoritativePos, lastProcessedInput) {
    if (!authoritativePos) return;

    // Update authoritative server position
    this.authoritativePosition = { ...authoritativePos };

    // Prune inputs <= lastProcessedInput ACK
    if (typeof lastProcessedInput === 'number') {
      this.pendingInputs = this.pendingInputs.filter(cmd => cmd.sequence > lastProcessedInput);
    }

    // Ensure pending commands remain strictly ordered by sequence number
    this.pendingInputs.sort((a, b) => a.sequence - b.sequence);

    // Reconstruct predicted position: start at server (x, y) and replay unacked inputs
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
