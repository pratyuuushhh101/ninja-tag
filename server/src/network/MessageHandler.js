import { CLIENT_MESSAGES, SERVER_MESSAGES, ERROR_CODES, ROOM_CODE_CHARSET, ROOM_CODE_LENGTH, ROOM_STATES, VALID_INPUT_KEYS } from '../../../shared/protocol/constants.js';

function sendMessage(ws, message) {
  if (ws.readyState === 1 /* WebSocket.OPEN */) {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.error('[NinjaTag] Error sending message:', err);
    }
  }
}

function sendError(ws, code, message) {
  sendMessage(ws, {
    type: SERVER_MESSAGES.ERROR,
    code,
    message
  });
}

function handleCreateRoom(ws, roomManager) {
  if (roomManager.hasContext(ws)) {
    return sendError(ws, ERROR_CODES.ALREADY_IN_ROOM, 'You are already in a room.');
  }

  try {
    const { roomCode, playerId } = roomManager.createRoom(ws);
    console.log(`[NinjaTag] Room ${roomCode} created by player ${playerId}.`);
    sendMessage(ws, {
      type: SERVER_MESSAGES.ROOM_CREATED,
      roomCode,
      playerId,
      roomState: ROOM_STATES.WAITING_FOR_PLAYER,
      playerCount: 1
    });
  } catch (err) {
    console.error('[NinjaTag] Failed to create room:', err);
    sendError(ws, ERROR_CODES.INVALID_STATE, 'Failed to create room.');
  }
}

function handleJoinRoom(ws, message, roomManager) {
  if (roomManager.hasContext(ws)) {
    return sendError(ws, ERROR_CODES.ALREADY_IN_ROOM, 'You are already in a room.');
  }

  if (!message.roomCode || typeof message.roomCode !== 'string') {
    return sendError(ws, ERROR_CODES.INVALID_ROOM_CODE, 'Missing or invalid room code.');
  }

  const roomCode = message.roomCode.toUpperCase();

  if (roomCode.length !== ROOM_CODE_LENGTH || !roomCode.split('').every(c => ROOM_CODE_CHARSET.includes(c))) {
    return sendError(ws, ERROR_CODES.INVALID_ROOM_CODE, 'Invalid room code format.');
  }

  try {
    const { playerId } = roomManager.joinRoom(ws, roomCode);
    console.log(`[NinjaTag] Player ${playerId} joined room ${roomCode}.`);

    const room = roomManager.rooms.get(roomCode);

    // Send ROOM_JOINED to the joining player
    sendMessage(ws, {
      type: SERVER_MESSAGES.ROOM_JOINED,
      roomCode,
      playerId,
      roomState: room.state,
      playerCount: room.getPlayerCount()
    });

    // Broadcast ROOM_STATE to all players in the room
    room.broadcastToRoom({
      type: SERVER_MESSAGES.ROOM_STATE,
      roomCode,
      roomState: room.state,
      playerCount: room.getPlayerCount()
    });

    // If room is now full, start the game
    if (room.state === ROOM_STATES.FULL) {
      roomManager.startGame(roomCode);
    }

  } catch (err) {
    if (err.code) {
      sendError(ws, err.code, err.message);
    } else {
      console.error(`[NinjaTag] Error joining room ${roomCode}:`, err);
      sendError(ws, ERROR_CODES.INVALID_STATE, 'An error occurred while joining the room.');
    }
  }
}

function handleInput(ws, message, roomManager) {
  const context = roomManager.getContext(ws);
  if (!context) {
    return sendError(ws, ERROR_CODES.INVALID_STATE, 'Not in a room.');
  }

  const { roomCode, playerId } = context;
  const room = roomManager.rooms.get(roomCode);

  if (!room || room.state !== ROOM_STATES.PLAYING || !room.game) {
    return sendError(ws, ERROR_CODES.INVALID_STATE, 'Game is not active.');
  }

  // Validate input
  const input = message.input;
  if (!input || typeof input !== 'object') {
    return sendError(ws, ERROR_CODES.INVALID_INPUT, 'Missing input field.');
  }

  // Validate each key is a boolean and only valid keys exist
  const validatedInput = {};
  for (const key of VALID_INPUT_KEYS) {
    if (typeof input[key] !== 'boolean') {
      return sendError(ws, ERROR_CODES.INVALID_INPUT, `Invalid input: ${key} must be a boolean.`);
    }
    validatedInput[key] = input[key];
  }

  room.game.setPlayerInput(playerId, validatedInput);
}

export function handleMessage(ws, rawData, roomManager) {
  let message;
  try {
    message = JSON.parse(rawData);
  } catch (err) {
    return sendError(ws, ERROR_CODES.INVALID_MESSAGE, 'Invalid JSON.');
  }

  if (!message || typeof message !== 'object' || !message.type) {
    return sendError(ws, ERROR_CODES.INVALID_MESSAGE, 'Message must have a type field.');
  }

  switch (message.type) {
    case CLIENT_MESSAGES.CREATE_ROOM:
      handleCreateRoom(ws, roomManager);
      break;
    case CLIENT_MESSAGES.JOIN_ROOM:
      handleJoinRoom(ws, message, roomManager);
      break;
    case CLIENT_MESSAGES.INPUT:
      handleInput(ws, message, roomManager);
      break;
    default:
      sendError(ws, ERROR_CODES.INVALID_MESSAGE, `Unknown message type: ${message.type}`);
  }
}
