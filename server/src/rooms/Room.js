import { MAX_PLAYERS_PER_ROOM, ROOM_STATES } from '../../../shared/protocol/constants.js';

export class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.state = ROOM_STATES.WAITING_FOR_PLAYER;
    this.createdAt = Date.now();
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
    if (removed && !this.isFull()) {
      this.state = ROOM_STATES.WAITING_FOR_PLAYER;
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
