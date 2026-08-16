import { SERVER_TICK_RATE, SERVER_MESSAGES } from '../../../shared/protocol/constants.js';

export class GameLoop {
  constructor() {
    this.intervals = new Map(); // roomCode -> intervalId
  }

  start(roomCode, room) {
    if (this.intervals.has(roomCode)) return;

    let lastTime = Date.now();
    const tickMs = 1000 / SERVER_TICK_RATE;

    const intervalId = setInterval(() => {
      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000; // seconds
      lastTime = now;

      if (!room.game) return;

      room.game.update(deltaTime);

      // Broadcast game state to all players in the room
      const state = room.game.getState();
      room.broadcastToRoom({
        type: SERVER_MESSAGES.GAME_STATE,
        players: state.players,
        itPlayerId: state.itPlayerId
      });
    }, tickMs);

    this.intervals.set(roomCode, intervalId);
    console.log(`[NinjaTag] Game loop started for room ${roomCode} at ${SERVER_TICK_RATE}Hz`);
  }

  stop(roomCode) {
    const intervalId = this.intervals.get(roomCode);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(roomCode);
      console.log(`[NinjaTag] Game loop stopped for room ${roomCode}`);
    }
  }
}
