import assert from 'node:assert';
import { RoomManager } from '../server/src/rooms/RoomManager.js';
import { handleMessage } from '../server/src/network/MessageHandler.js';
import {
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  FIXED_DT
} from '../shared/protocol/constants.js';

console.log('\n🥷 Ninja Tag — Play vs Bot Acceptance Tests\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    testsFailed++;
  }
}

function createMockSocket() {
  const sent = [];
  return {
    sent,
    readyState: 1, // WebSocket.OPEN
    send: (data) => {
      sent.push(typeof data === 'string' ? JSON.parse(data) : data);
    }
  };
}

// TEST 1 — CREATE_BOT_ROOM creates room and sends GAME_STARTED
test('TEST 1 — CREATE_BOT_ROOM creates room and sends GAME_STARTED immediately', () => {
  const roomManager = new RoomManager();
  const ws = createMockSocket();

  handleMessage(ws, JSON.stringify({
    type: CLIENT_MESSAGES.CREATE_BOT_ROOM,
    durationSeconds: 20
  }), roomManager);

  assert.strictEqual(ws.sent.length, 1);
  const gameStartedMsg = ws.sent[0];
  assert.strictEqual(gameStartedMsg.type, SERVER_MESSAGES.GAME_STARTED);
  assert.strictEqual(gameStartedMsg.matchDurationSeconds, 20);
  assert.strictEqual(gameStartedMsg.players.length, 2);

  const humanId = gameStartedMsg.yourPlayerId;
  const botPlayer = gameStartedMsg.players.find(p => p.id !== humanId);
  assert.ok(botPlayer);
  assert.ok(botPlayer.id.startsWith('bot-'));
});

// TEST 2 — Bot AI moves over 60Hz physics ticks
test('TEST 2 — Bot AI generates 60Hz physics movement and updates position', () => {
  const roomManager = new RoomManager();
  const ws = createMockSocket();

  handleMessage(ws, JSON.stringify({
    type: CLIENT_MESSAGES.CREATE_BOT_ROOM,
    durationSeconds: 40
  }), roomManager);

  const gameStartedMsg = ws.sent[0];
  const roomCode = gameStartedMsg.roomCode;
  const room = roomManager.rooms.get(roomCode);
  assert.ok(room);
  assert.ok(room.game);

  const humanId = gameStartedMsg.yourPlayerId;
  const botPlayerId = Array.from(room.game.players.keys()).find(id => id !== humanId);
  const botObj = room.game.players.get(botPlayerId);
  const initialPos = { x: botObj.x, y: botObj.y };

  // Run 10 physics ticks
  for (let i = 0; i < 10; i++) {
    room.game.update(FIXED_DT);
  }

  // Verify bot position changed from initial position
  const updatedPos = { x: botObj.x, y: botObj.y };
  assert.ok(updatedPos.x !== initialPos.x || updatedPos.y !== initialPos.y, 'Bot position should update as ticks execute');
});

// TEST 3 — Bot match expiration resolves winner and loser
test('TEST 3 — Bot match expiration resolves authoritative winner and loser', () => {
  const roomManager = new RoomManager();
  const ws = createMockSocket();

  handleMessage(ws, JSON.stringify({
    type: CLIENT_MESSAGES.CREATE_BOT_ROOM,
    durationSeconds: 20
  }), roomManager);

  const roomCode = ws.sent[0].roomCode;
  const room = roomManager.rooms.get(roomCode);

  // Force match end time to past
  room.game.matchEndTime = Date.now() - 100;
  const updateResult = room.game.update(FIXED_DT);

  assert.ok(updateResult);
  assert.strictEqual(updateResult.expired, true);
  assert.ok(updateResult.winnerId);
  assert.ok(updateResult.loserId);
  assert.notStrictEqual(updateResult.winnerId, updateResult.loserId);
});

// TEST 4 — Tag transfers occur multiple times back and forth (infinite tag exchange)
test('TEST 4 — Infinite tag exchange allows multiple back-and-forth tag transfers', () => {
  const roomManager = new RoomManager();
  const ws = createMockSocket();

  handleMessage(ws, JSON.stringify({
    type: CLIENT_MESSAGES.CREATE_BOT_ROOM,
    durationSeconds: 60
  }), roomManager);

  const roomCode = ws.sent[0].roomCode;
  const game = roomManager.rooms.get(roomCode).game;
  const playerIds = Array.from(game.players.keys());
  const [p1Id, p2Id] = playerIds;
  const p1 = game.players.get(p1Id);
  const p2 = game.players.get(p2Id);

  // Tag 1: Place players together and trigger tag
  p1.x = 300; p1.y = 300;
  p2.x = 310; p2.y = 300; // Touching (distance = 10 <= 40)
  game.itPlayerId = p1Id;
  game.tagCooldownTicks = 0;
  game.checkTagCollision();
  assert.strictEqual(game.itPlayerId, p2Id, 'First tag transfers IT to P2');
  assert.strictEqual(game.tagCooldownTicks, 90, 'Cooldown set to 90 ticks');

  // Separate players during cooldown to prevent auto-re-tagging inside update()
  p1.x = 100; p1.y = 300;
  p2.x = 500; p2.y = 300;
  for (let i = 0; i < 91; i++) {
    // Keep players apart — bot AI will try to move them, override each tick
    p1.x = 100; p1.y = 300;
    p2.x = 500; p2.y = 300;
    game.update(FIXED_DT);
  }
  assert.strictEqual(game.tagCooldownTicks, 0, 'Cooldown expired after 90 ticks');

  // Tag 2: Reposition together and re-tag back to p1
  p1.x = 300; p1.y = 300;
  p2.x = 310; p2.y = 300;
  game.checkTagCollision();
  assert.strictEqual(game.itPlayerId, p1Id, 'Second tag transfers IT back to P1');

  // Separate again during cooldown
  p1.x = 100; p1.y = 300;
  p2.x = 500; p2.y = 300;
  for (let i = 0; i < 91; i++) {
    p1.x = 100; p1.y = 300;
    p2.x = 500; p2.y = 300;
    game.update(FIXED_DT);
  }

  // Tag 3: Reposition together and re-tag to p2 again
  p1.x = 300; p1.y = 300;
  p2.x = 310; p2.y = 300;
  game.checkTagCollision();
  assert.strictEqual(game.itPlayerId, p2Id, 'Third tag transfers IT to P2 again');
});

// TEST 5 — Bot AI wall deflection steers bot away from screen boundaries
test('TEST 5 — Bot AI near screen boundary deflects vector into open space', () => {
  const roomManager = new RoomManager();
  const ws = createMockSocket();

  handleMessage(ws, JSON.stringify({
    type: CLIENT_MESSAGES.CREATE_BOT_ROOM,
    durationSeconds: 60
  }), roomManager);

  const roomCode = ws.sent[0].roomCode;
  const game = roomManager.rooms.get(roomCode).game;
  const humanId = ws.sent[0].yourPlayerId;
  const botId = Array.from(game.players.keys()).find(id => id !== humanId);
  const botObj = game.players.get(botId);
  const humanObj = game.players.get(humanId);

  // Position bot near left wall (x = 30 < 80 margin) fleeing from human
  botObj.x = 30;
  botObj.y = 300;
  humanObj.x = 200;
  humanObj.y = 300;
  game.itPlayerId = humanId; // Bot is fleeing

  // Update game tick
  game.update(FIXED_DT);

  // Verify bot input was overridden to steer RIGHT away from left wall
  assert.strictEqual(botObj.input.right, true, 'Bot near left wall must steer RIGHT into open space');
  assert.strictEqual(botObj.input.left, false);
});

// Summary
console.log('\n────────────────────────────────');
console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('────────────────────────────────\n');

process.exit(testsFailed > 0 ? 1 : 0);
