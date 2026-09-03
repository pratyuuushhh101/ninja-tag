import { MAX_PLAYERS_PER_ROOM, ROOM_STATES, DEFAULT_MATCH_DURATION } from '../../../shared/protocol/constants.js';

export class Room {
  constructor(id, durationSeconds = DEFAULT_MATCH_DURATION) {
    this.id = id;
    this.players = new Map();
    this.state = ROOM_STATES.WAITING_FOR_PLAYER;
    this.createdAt = Date.now();
    this.game = null;
    this.matchDurationSeconds = durationSeconds;
  }

  addPlayer(playerId, ws) {
    if (this.isFull()) {
      return false;
    }
    this.players.set(playerId, { playerId, ws });
    if (this.isFull()) {
      this.state = ROOM_STATES.FULL;
    }
    return true;
  }

  removePlayer(playerId) {
    const removed = this.players.delete(playerId);
    if (removed && this.state !== ROOM_STATES.PLAYING && this.state !== ROOM_STATES.ENDED) {
      if (!this.isFull()) {
        this.state = ROOM_STATES.WAITING_FOR_PLAYER;
      }
    }
    return removed;
  }

  isFull() {
    return this.players.size >= MAX_PLAYERS_PER_ROOM;
  }

  isEmpty() {
    return this.players.size === 0;
  }

  getPlayerCount() {
    return this.players.size;
  }

  broadcastToRoom(message) {
    const payload = JSON.stringify(message);
    for (const [, player] of this.players) {
      if (player.ws.readyState === 1 /* WebSocket.OPEN */) {
        try {
          player.ws.send(payload);
        } catch (err) {
          console.error(`[NinjaTag] Error broadcasting to player ${player.playerId}:`, err);
        }
      }
    }
  }
}
