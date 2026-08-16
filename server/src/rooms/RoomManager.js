import { Room } from './Room.js';
import { generateRoomCode } from '../utils/generateRoomCode.js';
import { generatePlayerId } from '../utils/generatePlayerId.js';
import { Game } from '../game/Game.js';
import { GameLoop } from '../game/GameLoop.js';
import { ERROR_CODES, ROOM_STATES, SERVER_MESSAGES, GAME_END_REASONS } from '../../../shared/protocol/constants.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketContexts = new Map();
    this.gameLoop = new GameLoop();
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

  startGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== ROOM_STATES.FULL) return;

    const game = new Game();
    const playerIds = Array.from(room.players.keys());
    game.initialize(playerIds);
    room.game = game;
    room.state = ROOM_STATES.PLAYING;

    // Send GAME_STARTED to each player individually (with their own playerId)
    for (const [playerId, player] of room.players) {
      if (player.ws.readyState === 1) {
        try {
          player.ws.send(JSON.stringify({
            type: SERVER_MESSAGES.GAME_STARTED,
            roomCode,
            yourPlayerId: playerId,
            arena: game.arena,
            itPlayerId: game.itPlayerId,
            players: game.getState().players
          }));
        } catch (err) {
          console.error(`[NinjaTag] Error sending GAME_STARTED to ${playerId}:`, err);
        }
      }
    }

    this.gameLoop.start(roomCode, room);
    console.log(`[NinjaTag] Game started in room ${roomCode}. IT: ${game.itPlayerId}`);
  }

  removePlayer(ws) {
    const context = this.socketContexts.get(ws);
    if (!context) return;

    const { roomCode, playerId } = context;
    const room = this.rooms.get(roomCode);
    
    if (room) {
      const wasPlaying = room.state === ROOM_STATES.PLAYING;

      if (wasPlaying) {
        // Stop the game loop
        this.gameLoop.stop(roomCode);
        room.state = ROOM_STATES.ENDED;

        // Notify remaining players that game ended
        room.game.removePlayer(playerId);
        room.removePlayer(playerId);

        room.broadcastToRoom({
          type: SERVER_MESSAGES.GAME_ENDED,
          reason: GAME_END_REASONS.PLAYER_DISCONNECTED
        });

        // Clean up game
        room.game = null;

        // Delete the room if empty, otherwise leave it for the remaining player
        if (room.isEmpty()) {
          this.rooms.delete(roomCode);
          console.log(`[NinjaTag] Room ${roomCode} deleted (empty).`);
        }
      } else {
        room.removePlayer(playerId);
        
        if (room.isEmpty()) {
          this.rooms.delete(roomCode);
          console.log(`[NinjaTag] Room ${roomCode} deleted (empty).`);
        } else {
          // Notify remaining players (lobby state)
          room.broadcastToRoom({
            type: SERVER_MESSAGES.ROOM_STATE,
            roomCode,
            roomState: room.state,
            playerCount: room.getPlayerCount()
          });
        }
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
