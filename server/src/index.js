import { WebSocketServer } from 'ws';
import http from 'http';
import { RoomManager } from './rooms/RoomManager.js';
import { handleMessage } from './network/MessageHandler.js';

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Ninja Tag Server is running\n');
});

const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

wss.on('connection', (ws, req) => {
  console.log(`[NinjaTag] Client connected from ${req.socket.remoteAddress}`);

  ws.on('message', (rawData) => {
    handleMessage(ws, rawData, roomManager);
  });

  ws.on('close', () => {
    const context = roomManager.getContext(ws);
    if (context) {
      console.log(`[NinjaTag] Player ${context.playerId} disconnected from room ${context.roomCode}`);
    } else {
      console.log('[NinjaTag] Client disconnected (no active room)');
    }
    roomManager.removePlayer(ws);
  });

  ws.on('error', (err) => {
    console.error('[NinjaTag] WebSocket error:', err);
  });
});

server.listen(PORT, () => {
  console.log(`[NinjaTag] Ninja Tag server started on port ${PORT}`);
});
