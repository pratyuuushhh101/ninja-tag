import { Room } from './Room.js';
import { generateRoomCode } from '../utils/generateRoomCode.js';
import { generatePlayerId } from '../utils/generatePlayerId.js';
import { ERROR_CODES, ROOM_STATES, SERVER_MESSAGES } from '../../../shared/protocol/constants.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketContexts = new Map();
  }

  createRoom(ws) {
    const roomCode = generateRoomCode(this.rooms);
    const room = new Room(roomCode);
    this.rooms.set(roomCode, room);

    const playerId = generatePlayerId();
    room.addPlayer(playerId, ws);
    this.socketContexts.set(ws, { roomCode, playerId });

    return { roomCode, playerId };
  }

  joinRoom(ws, roomCode) {
    const room = this.rooms.get(roomCode);
    
    if (!room) {
      const err = new Error('Room not found');
      err.code = ERROR_CODES.ROOM_NOT_FOUND;
      throw err;
    }

    if (room.isFull()) {
      const err = new Error('Room is full');
      err.code = ERROR_CODES.ROOM_FULL;
      throw err;
    }

    const playerId = generatePlayerId();
    room.addPlayer(playerId, ws);
    this.socketContexts.set(ws, { roomCode, playerId });

    return { roomCode, playerId };
  }

  removePlayer(ws) {
    const context = this.socketContexts.get(ws);
    if (!context) return;

    const { roomCode, playerId } = context;
    const room = this.rooms.get(roomCode);
    
    if (room) {
      room.removePlayer(playerId);
      
      if (room.isEmpty()) {
        this.rooms.delete(roomCode);
        console.log(`[NinjaTag] Room ${roomCode} deleted (empty).`);
      } else {
        // Notify remaining players
        room.broadcastToRoom({
          type: SERVER_MESSAGES.ROOM_STATE,
          roomCode,
          roomState: room.state,
          playerCount: room.getPlayerCount()
        });
      }
    }
    
    this.socketContexts.delete(ws);
  }

  getContext(ws) {
    return this.socketContexts.get(ws);
  }

  hasContext(ws) {
    return this.socketContexts.has(ws);
  }
}
