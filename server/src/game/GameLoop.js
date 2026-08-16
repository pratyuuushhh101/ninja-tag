import { performance } from 'node:perf_hooks';
import { FIXED_DT, MAX_FRAME_TIME, SNAPSHOT_INTERVAL_MS, SERVER_TICK_RATE, SNAPSHOT_SEND_RATE } from '../../../shared/protocol/constants.js';
import { createSnapshot } from './SnapshotGenerator.js';

export class GameLoop {
  constructor() {
    this.loops = new Map(); // roomCode -> loopState
  }

  start(roomCode, room) {
    if (this.loops.has(roomCode)) return;

    let previousTime = performance.now();
    let accumulator = 0;
    let lastSnapshotTime = performance.now();

    // Run tick loop at high frequency (~4ms timeout or setImmediate loop) to process accumulator smoothly
    const intervalId = setInterval(() => {
      if (!room.game) return;

      const currentTime = performance.now();
      let frameTime = (currentTime - previousTime) / 1000; // convert ms to seconds
      previousTime = currentTime;

      // Stall protection: clamp max frame time to avoid spiral of death
      if (frameTime > MAX_FRAME_TIME) {
        frameTime = MAX_FRAME_TIME;
      }

      accumulator += frameTime;

      // Execute fixed 60Hz simulation ticks
      while (accumulator >= FIXED_DT) {
        room.game.update(FIXED_DT);
        accumulator -= FIXED_DT;
      }

      // Broadcast authoritative snapshots at decoupled snapshot rate (20Hz)
      if (currentTime - lastSnapshotTime >= SNAPSHOT_INTERVAL_MS) {
        lastSnapshotTime = currentTime;
        const snapshot = createSnapshot(room.game);
        room.broadcastToRoom(snapshot);
      }
    }, 4); // ~250Hz loop check to ensure sub-millisecond precision for fixed ticks and snapshot intervals

    this.loops.set(roomCode, { intervalId });
    console.log(`[NinjaTag] Fixed 60Hz game loop started for room ${roomCode} (Snapshots: ${SNAPSHOT_SEND_RATE}Hz)`);
  }

  stop(roomCode) {
    const loopState = this.loops.get(roomCode);
    if (loopState) {
      clearInterval(loopState.intervalId);
      this.loops.delete(roomCode);
      console.log(`[NinjaTag] Game loop stopped for room ${roomCode}`);
    }
  }
}
