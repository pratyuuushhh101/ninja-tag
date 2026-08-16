import { simulatePlayerMovement } from '../../../shared/game/movement.js';
import { FIXED_DT } from '../../../shared/protocol/constants.js';

/**
 * Client Prediction & Server Reconciliation Engine (Phase 4.2)
 *
 * Runs local player prediction independently at a fixed 60Hz simulation cadence,
 * tracks tick input history timelines, and reconciles local predicted position
 * with authoritative server snapshots over exact 60Hz tick intervals.
 */
export class Prediction {
  constructor() {
    this.pendingInputs = [];
    this.tickHistory = new Map(); // localTick -> inputState { up, down, left, right }
    this.localTick = 0;
    this.authoritativePosition = null;
    this.predictedPosition = null;
    this.maxPendingInputs = 500; // Defensive safety cap
    this.predictionIntervalId = null;
    this.inputManagerRef = null;
    this.tickPrediction = this.tickPrediction.bind(this);
  }

  init(initialPosition, startTick = 0) {
    this.pendingInputs = [];
    this.tickHistory.clear();
    this.localTick = typeof startTick === 'number' ? startTick : 0;
    this.authoritativePosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
    this.predictedPosition = initialPosition ? { ...initialPosition } : { x: 200, y: 300 };
  }

  start(inputManager) {
    this.inputManagerRef = inputManager;

    if (this.predictionIntervalId) {
      clearInterval(this.predictionIntervalId);
    }

    // Fixed 60Hz local prediction simulation loop (~16.67ms)
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
    this.tickHistory.clear();
    this.localTick = 0;
    this.authoritativePosition = null;
    this.predictedPosition = null;
  }

  /**
   * 60Hz prediction tick callback.
   * Reads current local input state, records tick input timeline, and advances predicted local position.
   */
  tickPrediction() {
    if (!this.predictedPosition) return;

    this.localTick += 1;

    const currentInput = this.inputManagerRef
      ? this.inputManagerRef.getInput()
      : { up: false, down: false, left: false, right: false };

    const inputCopy = {
      up: Boolean(currentInput.up),
      down: Boolean(currentInput.down),
      left: Boolean(currentInput.left),
      right: Boolean(currentInput.right)
    };

    // Record input state for this 60Hz prediction tick
    this.tickHistory.set(this.localTick, inputCopy);

    // Defensive prune: keep max 600 ticks (~10 seconds)
    if (this.tickHistory.size > 600) {
      const oldestTick = this.localTick - 600;
      for (const t of this.tickHistory.keys()) {
        if (t <= oldestTick) {
          this.tickHistory.delete(t);
        } else {
          break;
        }
      }
    }

    // Advance predicted position by exactly one FIXED_DT step
    this.predictedPosition = simulatePlayerMovement(this.predictedPosition, inputCopy, FIXED_DT);
  }

  /**
   * Stores an immutable input command into pending history queue for sequence tracking.
   *
   * @param {number} sequence - Monotonically increasing sequence number
   * @param {Object} inputState - Input command state { up, down, left, right }
   */
  addInput(sequence, inputState) {
    if (!this.predictedPosition) return;

    const cmd = {
      sequence,
      tick: this.localTick,
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
      this.pendingInputs.shift();
    }
  }

  /**
   * Reconciles local prediction with authoritative server position.
   * Replays exact 60Hz tick input timeline from server tick S to current localTick C.
   *
   * @param {Object} authoritativePos - Authoritative { x, y } from server snapshot
   * @param {number} serverTick - Authoritative server tick counter (S)
   * @param {number} lastProcessedInput - Server acknowledged input sequence
   */
  reconcile(authoritativePos, serverTick, lastProcessedInput) {
    if (!authoritativePos) return;

    this.authoritativePosition = { ...authoritativePos };

    // Prune acknowledged input sequence commands <= lastProcessedInput
    if (typeof lastProcessedInput === 'number') {
      this.pendingInputs = this.pendingInputs.filter(cmd => cmd.sequence > lastProcessedInput);
    }

    const S = typeof serverTick === 'number' ? serverTick : this.localTick;
    const C = this.localTick;

    if (S < C) {
      let replayedPos = { ...authoritativePos };

      // Replay exact 60Hz tick timeline for unacknowledged simulation ticks (S + 1 to C)
      for (let t = S + 1; t <= C; t++) {
        const inputAtTick = this.tickHistory.get(t) || (this.inputManagerRef ? this.inputManagerRef.getInput() : { up: false, down: false, left: false, right: false });
        replayedPos = simulatePlayerMovement(replayedPos, inputAtTick, FIXED_DT);
      }

      this.predictedPosition = replayedPos;
    } else {
      this.predictedPosition = { ...authoritativePos };
    }

    // Prune tick history for ticks <= serverTick
    for (const t of this.tickHistory.keys()) {
      if (t <= S) {
        this.tickHistory.delete(t);
      } else {
        break;
      }
    }
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
