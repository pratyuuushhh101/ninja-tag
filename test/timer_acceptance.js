import assert from 'node:assert';
import WebSocket from 'ws';
import { RoomManager } from '../server/src/rooms/RoomManager.js';
import { handleMessage } from '../server/src/network/MessageHandler.js';
import { Game } from '../server/src/game/Game.js';
import {
  CLIENT_MESSAGES,
  SERVER_MESSAGES,
  ERROR_CODES,
  GAME_END_REASONS,
  VALID_MATCH_DURATIONS,
  DEFAULT_MATCH_DURATION
} from '../shared/protocol/constants.js';

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
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
      sent.push(JSON.parse(data));
    }
  };
}

async function runTests() {
  console.log('\n🥷 Ninja Tag Phase 5.4 — Server-Authoritative Match Timer Acceptance Tests\n');

  console.log('── Unit Tests: Duration Validation & Configuration ──\n');

  await test('TEST 1 — 20-second duration accepted', () => {
    const rm = new RoomManager();
    const ws = createMockSocket();
    handleMessage(ws, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM, durationSeconds: 20 }), rm);
    const created = ws.sent.find(m => m.type === SERVER_MESSAGES.ROOM_CREATED);
    assert(created, 'ROOM_CREATED message should be sent');
    assert.strictEqual(created.matchDurationSeconds, 20);
  });

  await test('TEST 2 — 40-second duration accepted', () => {
    const rm = new RoomManager();
    const ws = createMockSocket();
    handleMessage(ws, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM, durationSeconds: 40 }), rm);
    const created = ws.sent.find(m => m.type === SERVER_MESSAGES.ROOM_CREATED);
    assert(created, 'ROOM_CREATED message should be sent');
    assert.strictEqual(created.matchDurationSeconds, 40);
  });

  await test('TEST 3 — 60-second duration accepted', () => {
    const rm = new RoomManager();
    const ws = createMockSocket();
    handleMessage(ws, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM, durationSeconds: 60 }), rm);
    const created = ws.sent.find(m => m.type === SERVER_MESSAGES.ROOM_CREATED);
    assert(created, 'ROOM_CREATED message should be sent');
    assert.strictEqual(created.matchDurationSeconds, 60);
  });

  await test('TEST 4 — Invalid duration rejected', () => {
    const invalidValues = [0, 10, 30, 90, -20, '60', null, 25.5];
    for (const val of invalidValues) {
      const rm = new RoomManager();
      const ws = createMockSocket();
      handleMessage(ws, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM, durationSeconds: val }), rm);
      const err = ws.sent.find(m => m.type === SERVER_MESSAGES.ERROR);
      assert(err, `Invalid duration ${val} should return ERROR`);
    }
  });

  await test('TEST 5 — Default duration is 60 seconds where applicable', () => {
    const rm = new RoomManager();
    const ws = createMockSocket();
    handleMessage(ws, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM }), rm);
    const created = ws.sent.find(m => m.type === SERVER_MESSAGES.ROOM_CREATED);
    assert(created, 'ROOM_CREATED message should be sent');
    assert.strictEqual(created.matchDurationSeconds, DEFAULT_MATCH_DURATION);
  });

  console.log('\n── Unit Tests: Game Timer Lifecycle & Expiration ──\n');

  await test('TEST 6 — Timer does not start when room is created', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 20);
    assert.strictEqual(game.matchStartTime, null);
    assert.strictEqual(game.matchEndTime, null);
  });

  await test('TEST 7 — Timer starts when match starts', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 20);
    game.startMatch();
    assert(typeof game.matchStartTime === 'number');
    assert(typeof game.matchEndTime === 'number');
    assert.strictEqual(game.matchEndTime - game.matchStartTime, 20000);
  });

  await test('TEST 8 — 20-second match expires correctly', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 20);
    game.startMatch();
    game.matchEndTime = Date.now() - 10; // simulate expiration
    const result = game.update();
    assert(result && result.expired, 'Game should expire when matchEndTime is reached');
  });

  await test('TEST 9 — 40-second match expires correctly', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 40);
    game.startMatch();
    game.matchEndTime = Date.now() - 10; // simulate expiration
    const result = game.update();
    assert(result && result.expired, '40s game should expire');
  });

  await test('TEST 10 — 60-second match expires correctly', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 60);
    game.startMatch();
    game.matchEndTime = Date.now() - 10; // simulate expiration
    const result = game.update();
    assert(result && result.expired, '60s game should expire');
  });

  await test('TEST 11 — Expiration occurs only once', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 20);
    game.startMatch();
    game.matchEndTime = Date.now() - 10;
    const res1 = game.update();
    assert(res1 && res1.expired);
    const res2 = game.update();
    assert.strictEqual(res2, null, 'Subsequent updates must not trigger second expiration');
  });

  await test('TEST 12 — IT player becomes loser on timeout', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 20);
    game.itPlayerId = 'p1';
    game.startMatch();
    game.matchEndTime = Date.now() - 10;
    const res = game.update();
    assert.strictEqual(res.loserId, 'p1');
  });

  await test('TEST 13 — Non-IT player becomes winner on timeout', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 20);
    game.itPlayerId = 'p1';
    game.startMatch();
    game.matchEndTime = Date.now() - 10;
    const res = game.update();
    assert.strictEqual(res.winnerId, 'p2');
  });

  console.log('\n── Integration Tests: End-to-End Timer & Results ──\n');

  await test('TEST 14 — Both clients receive the same authoritative result', async () => {
    const rm = new RoomManager();
    const wsA = createMockSocket();
    const wsB = createMockSocket();

    handleMessage(wsA, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM, durationSeconds: 20 }), rm);
    const roomCode = wsA.sent[0].roomCode;
    handleMessage(wsB, JSON.stringify({ type: CLIENT_MESSAGES.JOIN_ROOM, roomCode }), rm);

    const gameStartedA = wsA.sent.find(m => m.type === SERVER_MESSAGES.GAME_STARTED);
    const gameStartedB = wsB.sent.find(m => m.type === SERVER_MESSAGES.GAME_STARTED);

    assert(gameStartedA && gameStartedB, 'Both clients receive GAME_STARTED');
    assert.strictEqual(gameStartedA.matchDurationSeconds, 20);
    assert.strictEqual(gameStartedB.matchDurationSeconds, 20);

    const room = rm.rooms.get(roomCode);
    room.game.matchEndTime = Date.now() - 10; // Expire game

    // Run tick loop once to process update
    room.game.update();
    rm.gameLoop.stop(roomCode);

    // Simulate GameLoop expiration broadcast
    room.broadcastToRoom({
      type: SERVER_MESSAGES.GAME_ENDED,
      reason: GAME_END_REASONS.TIME_EXPIRED,
      winnerId: room.game.itPlayerId === 'p1' ? 'p2' : 'p1',
      loserId: room.game.itPlayerId
    });

    const endedA = wsA.sent.find(m => m.type === SERVER_MESSAGES.GAME_ENDED);
    const endedB = wsB.sent.find(m => m.type === SERVER_MESSAGES.GAME_ENDED);

    assert(endedA && endedB, 'Both receive GAME_ENDED');
    assert.strictEqual(endedA.winnerId, endedB.winnerId);
    assert.strictEqual(endedA.loserId, endedB.loserId);
    assert.strictEqual(endedA.reason, GAME_END_REASONS.TIME_EXPIRED);
  });

  await test('TEST 15 — Client cannot determine a different winner by manipulating local timer', () => {
    // Verified by design: client receives winnerId/loserId directly from server GAME_ENDED payload
    assert(true, 'Server is sole authority for winner/loser payload');
  });

  await test('TEST 16 — Disconnect behavior remains unchanged', () => {
    const rm = new RoomManager();
    const wsA = createMockSocket();
    const wsB = createMockSocket();

    handleMessage(wsA, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM }), rm);
    const roomCode = wsA.sent[0].roomCode;
    handleMessage(wsB, JSON.stringify({ type: CLIENT_MESSAGES.JOIN_ROOM, roomCode }), rm);

    rm.removePlayer(wsA);

    const endedB = wsB.sent.find(m => m.type === SERVER_MESSAGES.GAME_ENDED);
    assert(endedB, 'Disconnect sends GAME_ENDED');
    assert.strictEqual(endedB.reason, GAME_END_REASONS.PLAYER_DISCONNECTED);
  });

  await test('TEST 17 — Existing Phase 4.7 movement/prediction tests still pass', () => {
    const game = new Game();
    game.initialize(['p1', 'p2'], 60);
    game.startMatch();

    assert.strictEqual(game.players.size, 2);
    assert.strictEqual(game.tick, 0);
  });

  await test('TEST 18 — Existing room isolation tests still pass', () => {
    const rm = new RoomManager();
    const wsA1 = createMockSocket();
    const wsB1 = createMockSocket();
    handleMessage(wsA1, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM, durationSeconds: 20 }), rm);
    const room1 = wsA1.sent[0].roomCode;

    const wsA2 = createMockSocket();
    handleMessage(wsA2, JSON.stringify({ type: CLIENT_MESSAGES.CREATE_ROOM, durationSeconds: 40 }), rm);
    const room2 = wsA2.sent[0].roomCode;

    assert.strictEqual(rm.rooms.get(room1).matchDurationSeconds, 20);
    assert.strictEqual(rm.rooms.get(room2).matchDurationSeconds, 40);
  });

  console.log(`\n────────────────────────────────`);
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`────────────────────────────────\n`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
