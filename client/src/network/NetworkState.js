/**
 * Client Network State Manager
 *
 * Tracks sequence numbers, authoritative server snapshots, latest server tick,
 * and processed input acknowledgements. Separates network snapshot handling
 * from visual canvas rendering.
 */
export class NetworkState {
  constructor() {
    this.nextInputSequence = 0;
    this.lastAcknowledgedInput = 0;
    this.latestServerTick = 0;
    this.latestSnapshot = null;
  }

  reset() {
    this.nextInputSequence = 0;
    this.lastAcknowledgedInput = 0;
    this.latestServerTick = 0;
    this.latestSnapshot = null;
  }

  getNextInputSequence() {
    this.nextInputSequence += 1;
    return this.nextInputSequence;
  }

  handleSnapshot(snapshot, localPlayerId) {
    if (!snapshot || typeof snapshot.tick !== 'number') return false;

    // Reject stale or duplicate snapshots
    if (snapshot.tick <= this.latestServerTick) {
      return false;
    }

    this.latestServerTick = snapshot.tick;
    this.latestSnapshot = snapshot;

    // Track local player's processed input sequence acknowledgement
    if (snapshot.players && localPlayerId) {
      const localPlayer = snapshot.players.find(p => p.id === localPlayerId);
      if (localPlayer && typeof localPlayer.lastProcessedInput === 'number') {
        this.lastAcknowledgedInput = localPlayer.lastProcessedInput;
      }
    }

    return true;
  }

  getLatestSnapshot() {
    return this.latestSnapshot;
  }
}

export const networkState = new NetworkState();
