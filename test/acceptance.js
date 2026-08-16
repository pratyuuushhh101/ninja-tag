/**
 * Ninja Tag Phase 2 — Acceptance Test Script
 *
 * Tests Phase 1 lobby (8 tests) + Phase 2 gameplay (10 tests).
 * Run with: node test/acceptance.js
 * Requires the server to be running on port 3001.
 */

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:3001';
let testsPassed = 0;
let testsFailed = 0;

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function sendAndReceive(ws, message) {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()));
    });
    ws.send(JSON.stringify(message));
  });
}

function waitForMessage(ws, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

/** Collect N messages from a ws within a timeout window */
function collectMessages(ws, count, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timer = setTimeout(() => resolve(messages), timeoutMs);
    const handler = (data) => {
      messages.push(JSON.parse(data.toString()));
      if (messages.length >= count) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(messages);
      }
    };
    ws.on('message', handler);
  });
}

/** Wait for a specific message type from a ws */
function waitForMessageType(ws, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

/** Drain all pending messages for a short window */
function drain(ws, ms = 200) {
  return new Promise((resolve) => {
    const msgs = [];
    const handler = (data) => msgs.push(JSON.parse(data.toString()));
    ws.on('message', handler);
    setTimeout(() => {
      ws.removeListener('message', handler);
      resolve(msgs);
    }, ms);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    testsFailed++;
  }
}

/** Helper: create a room, join it, wait for game to start. Returns { wsA, wsB, roomCode, gameA, gameB } */
async function createAndStartGame() {
  const wsA = await connect();
  const createRes = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
  const roomCode = createRes.roomCode;

  // wsA will receive: ROOM_STATE (from join broadcast) + GAME_STARTED + GAME_STATE stream
  const gameStartedPromiseA = waitForMessageType(wsA, 'GAME_STARTED');

  const wsB = await connect();
  // wsB will receive: ROOM_JOINED + ROOM_STATE + GAME_STARTED + GAME_STATE stream
  const gameStartedPromiseB = waitForMessageType(wsB, 'GAME_STARTED');
  wsB.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode }));

  const gameA = await gameStartedPromiseA;
  const gameB = await gameStartedPromiseB;

  return { wsA, wsB, roomCode, gameA, gameB };
}

async function runTests() {
  console.log('\n🥷 Ninja Tag Phase 2 — Acceptance Tests\n');
  console.log('── Phase 1: Lobby ──\n');

  // Test 1: Create room
  await test('Test 1 — Create room', async () => {
    const ws = await connect();
    const res = await sendAndReceive(ws, { type: 'CREATE_ROOM' });
    assert(res.type === 'ROOM_CREATED', `Expected ROOM_CREATED, got ${res.type}`);
    assert(typeof res.roomCode === 'string' && res.roomCode.length === 5, `Invalid room code: ${res.roomCode}`);
    assert(typeof res.playerId === 'string' && res.playerId.length > 0, 'Missing playerId');
    assert(res.roomState === 'WAITING_FOR_PLAYER', `Expected WAITING_FOR_PLAYER, got ${res.roomState}`);
    assert(res.playerCount === 1, `Expected playerCount 1, got ${res.playerCount}`);
    ws.close();
  });

  // Test 2: Join room — both see full + game starts
  await test('Test 2 — Join room (both see FULL, game starts)', async () => {
    const { wsA, wsB, gameA, gameB } = await createAndStartGame();

    assert(gameA.type === 'GAME_STARTED', `Expected GAME_STARTED for A, got ${gameA.type}`);
    assert(gameB.type === 'GAME_STARTED', `Expected GAME_STARTED for B, got ${gameB.type}`);
    assert(gameA.arena.width === 1000, `Expected arena width 1000`);
    assert(gameA.arena.height === 600, `Expected arena height 600`);
    assert(typeof gameA.itPlayerId === 'string', 'Missing itPlayerId');

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 3: Invalid room code
  await test('Test 3 — Invalid room (ROOM_NOT_FOUND)', async () => {
    const ws = await connect();
    const res = await sendAndReceive(ws, { type: 'JOIN_ROOM', roomCode: 'ZZZZZ' });
    assert(res.type === 'ERROR', `Expected ERROR, got ${res.type}`);
    assert(res.code === 'ROOM_NOT_FOUND', `Expected ROOM_NOT_FOUND, got ${res.code}`);
    ws.close();
  });

  // Test 4: Full room
  await test('Test 4 — Full room (ROOM_FULL)', async () => {
    const { wsA, wsB, roomCode } = await createAndStartGame();

    const wsC = await connect();
    const fullRes = await sendAndReceive(wsC, { type: 'JOIN_ROOM', roomCode });
    assert(fullRes.type === 'ERROR', `Expected ERROR, got ${fullRes.type}`);
    assert(fullRes.code === 'ROOM_FULL', `Expected ROOM_FULL, got ${fullRes.code}`);

    wsA.close();
    wsB.close();
    wsC.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 5: Disconnect during game — remaining player gets GAME_ENDED
  await test('Test 5 — Disconnect (remaining player gets GAME_ENDED)', async () => {
    const { wsA, wsB } = await createAndStartGame();

    // Drain initial game states
    await drain(wsA, 100);

    const endedPromise = waitForMessageType(wsA, 'GAME_ENDED');
    wsB.close();

    const ended = await endedPromise;
    assert(ended.type === 'GAME_ENDED', `Expected GAME_ENDED, got ${ended.type}`);
    assert(ended.reason === 'PLAYER_DISCONNECTED', `Expected PLAYER_DISCONNECTED, got ${ended.reason}`);

    wsA.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 6: Empty room cleanup
  await test('Test 6 — Empty room cleanup', async () => {
    const wsA = await connect();
    const createRes = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
    const roomCode = createRes.roomCode;
    wsA.close();

    await new Promise(r => setTimeout(r, 500));

    const wsD = await connect();
    const res = await sendAndReceive(wsD, { type: 'JOIN_ROOM', roomCode });
    assert(res.type === 'ERROR', `Expected ERROR, got ${res.type}`);
    assert(res.code === 'ROOM_NOT_FOUND', `Expected ROOM_NOT_FOUND after cleanup, got ${res.code}`);
    wsD.close();
  });

  // Test 7: Room isolation
  await test('Test 7 — Independent rooms (isolation)', async () => {
    const wsA = await connect();
    const createA = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
    const roomCodeA = createA.roomCode;

    const wsB = await connect();
    const createB = await sendAndReceive(wsB, { type: 'CREATE_ROOM' });
    const roomCodeB = createB.roomCode;

    assert(roomCodeA !== roomCodeB, 'Room codes should be different');

    // Join room A with a new client — will trigger game start for A
    const wsC = await connect();
    const joinA = await sendAndReceive(wsC, { type: 'JOIN_ROOM', roomCode: roomCodeA });
    assert(joinA.roomCode === roomCodeA, 'Should join room A');

    // wsB should NOT have received any message (still in its own room waiting)
    try {
      await waitForMessage(wsB, 500);
      throw new Error('wsB should NOT have received a message');
    } catch (e) {
      if (e.message === 'wsB should NOT have received a message') {
        throw e;
      }
      // Timeout is expected — room isolation confirmed
    }

    wsA.close();
    wsB.close();
    wsC.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 8: Duplicate operation
  await test('Test 8 — Duplicate operation (ALREADY_IN_ROOM)', async () => {
    const ws = await connect();
    const createRes = await sendAndReceive(ws, { type: 'CREATE_ROOM' });
    assert(createRes.type === 'ROOM_CREATED', 'First create should succeed');

    const dupCreate = await sendAndReceive(ws, { type: 'CREATE_ROOM' });
    assert(dupCreate.type === 'ERROR', `Expected ERROR for duplicate create, got ${dupCreate.type}`);
    assert(dupCreate.code === 'ALREADY_IN_ROOM', `Expected ALREADY_IN_ROOM, got ${dupCreate.code}`);

    const ws2 = await connect();
    const createRes2 = await sendAndReceive(ws2, { type: 'CREATE_ROOM' });
    const otherRoom = createRes2.roomCode;

    const dupJoin = await sendAndReceive(ws, { type: 'JOIN_ROOM', roomCode: otherRoom });
    assert(dupJoin.type === 'ERROR', `Expected ERROR for join while in room, got ${dupJoin.type}`);
    assert(dupJoin.code === 'ALREADY_IN_ROOM', `Expected ALREADY_IN_ROOM for join, got ${dupJoin.code}`);

    ws.close();
    ws2.close();
    await new Promise(r => setTimeout(r, 200));
  });

  console.log('\n── Phase 2: Gameplay ──\n');

  // Test 9: Two-player movement
  await test('Test 9 — Two-player movement (input → server → broadcast)', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;

    // Drain initial GAME_STATE messages
    await drain(wsA, 150);
    await drain(wsB, 150);

    // Send input from player A: move right
    wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: true } }));

    // Wait a bit for server to process movement
    await new Promise(r => setTimeout(r, 200));

    // Get a game state from wsB — should show player A has moved right from x=200
    const stateB = await waitForMessageType(wsB, 'GAME_STATE', 2000);
    assert(stateB.players && stateB.players.length === 2, 'Should have 2 players');

    const playerAInState = stateB.players.find(p => p.id === playerIdA);
    assert(playerAInState, 'Player A should be in game state');
    assert(playerAInState.x > 200, `Player A should have moved right from 200, got x=${playerAInState.x.toFixed(1)}`);

    // Stop input
    wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 10: Server authority — clients send input, not position
  await test('Test 10 — Server authority (input intent only)', async () => {
    const { wsA, wsB } = await createAndStartGame();

    // Try sending direct coordinates — server should reject or ignore
    const res = await sendAndReceive(wsA, { type: 'INPUT', input: { x: 999, y: 999 } });
    // Should get INVALID_INPUT error (keys must be boolean)
    assert(res.type === 'ERROR', `Expected ERROR for bad input, got ${res.type}`);
    assert(res.code === 'INVALID_INPUT', `Expected INVALID_INPUT, got ${res.code}`);

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 11: Boundary collision
  await test('Test 11 — Boundary collision (player stays inside arena)', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;

    // Move player A left for a while (should hit left boundary at x=20 from spawn x=200)
    wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: true, right: false } }));

    // Wait enough for player to hit boundary (200px / 250px/s ≈ 0.8s)
    await new Promise(r => setTimeout(r, 1200));

    // Stop and check
    wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));
    await new Promise(r => setTimeout(r, 100));

    const state = await waitForMessageType(wsB, 'GAME_STATE', 2000);
    const playerA = state.players.find(p => p.id === playerIdA);
    assert(playerA, 'Player A should exist');
    assert(playerA.x >= 20, `Player should be >= radius(20), got x=${playerA.x.toFixed(1)}`);
    assert(playerA.x <= 25, `Player should be clamped near boundary, got x=${playerA.x.toFixed(1)}`);

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 12: Diagonal movement normalization
  await test('Test 12 — Diagonal movement (normalized speed)', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;

    // Drain initial states
    await drain(wsA, 150);
    await drain(wsB, 150);

    // Move pure right for 300ms
    wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: true } }));
    await new Promise(r => setTimeout(r, 300));
    wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));
    await new Promise(r => setTimeout(r, 100));

    const state1 = await waitForMessageType(wsB, 'GAME_STATE', 2000);
    const p1 = state1.players.find(p => p.id === playerIdA);
    const rightOnlyDistance = p1.x - 200; // distance from spawn

    // Now reset: close and create a new game for diagonal test
    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 300));

    // New game
    const game2 = await createAndStartGame();
    const playerIdA2 = game2.gameA.yourPlayerId;
    await drain(game2.wsA, 150);
    await drain(game2.wsB, 150);

    // Move diagonal (right + down) for 300ms
    game2.wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: true, left: false, right: true } }));
    await new Promise(r => setTimeout(r, 300));
    game2.wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));
    await new Promise(r => setTimeout(r, 100));

    const state2 = await waitForMessageType(game2.wsB, 'GAME_STATE', 2000);
    const p2 = state2.players.find(p => p.id === playerIdA2);
    const diagonalXDistance = p2.x - 200;

    // Diagonal X component should be less than pure right (≈ 0.707x)
    // Allow some tolerance due to timing
    assert(diagonalXDistance < rightOnlyDistance * 0.95,
      `Diagonal X (${diagonalXDistance.toFixed(1)}) should be less than pure right (${rightOnlyDistance.toFixed(1)})`);

    game2.wsA.close();
    game2.wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 13: IT assignment
  await test('Test 13 — IT assignment (exactly one IT, both agree)', async () => {
    const { wsA, wsB, gameA, gameB } = await createAndStartGame();

    // Both should agree on who is IT
    assert(gameA.itPlayerId === gameB.itPlayerId, 'Both clients should agree on IT');
    assert(typeof gameA.itPlayerId === 'string' && gameA.itPlayerId.length > 0, 'IT should be a valid player ID');

    // IT should be one of the two player IDs
    const isValidIt = gameA.itPlayerId === gameA.yourPlayerId || gameA.itPlayerId === gameB.yourPlayerId;
    assert(isValidIt, 'IT should be one of the players');

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 14: Tagging
  await test('Test 14 — Tagging (IT transfers on collision)', async () => {
    const { wsA, wsB, gameA, gameB } = await createAndStartGame();

    // Figure out who is IT and who is not
    const itId = gameA.itPlayerId;
    const isAIt = gameA.yourPlayerId === itId;
    const itWs = isAIt ? wsA : wsB;
    const otherWs = isAIt ? wsB : wsA;
    const otherId = isAIt ? gameB.yourPlayerId : gameA.yourPlayerId;

    // IT is at x=200 or x=800, other is at the other position
    // Move IT toward the other player (right if IT spawned left, left if right)
    const itPlayer = gameA.players.find(p => p.id === itId);
    const otherPlayer = gameA.players.find(p => p.id === otherId);
    const moveRight = itPlayer.x < otherPlayer.x;

    const input = { up: false, down: false, left: !moveRight, right: moveRight };
    itWs.send(JSON.stringify({ type: 'INPUT', input }));

    // Also move other player toward IT
    otherWs.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: moveRight, right: !moveRight } }));

    // Wait for collision (600px apart, both moving at 250px/s = ~1.2s to meet)
    // Check for IT change in game state
    let tagChanged = false;
    const startTime = Date.now();
    while (Date.now() - startTime < 3000) {
      const state = await waitForMessageType(wsA, 'GAME_STATE', 1000).catch(() => null);
      if (!state) break;
      if (state.itPlayerId !== itId) {
        tagChanged = true;
        assert(state.itPlayerId === otherId, `IT should transfer to other player`);
        break;
      }
    }

    assert(tagChanged, 'IT should have changed after collision');

    itWs.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));
    otherWs.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 15: Tag stability (no flickering)
  await test('Test 15 — Tag stability (no rapid IT flip while overlapping)', async () => {
    const { wsA, wsB, gameA, gameB } = await createAndStartGame();

    const itId = gameA.itPlayerId;
    const isAIt = gameA.yourPlayerId === itId;
    const itWs = isAIt ? wsA : wsB;
    const otherWs = isAIt ? wsB : wsA;
    const otherId = isAIt ? gameB.yourPlayerId : gameA.yourPlayerId;

    // Move both players toward each other
    const itPlayer = gameA.players.find(p => p.id === itId);
    const otherPlayer = gameA.players.find(p => p.id === otherId);
    const moveRight = itPlayer.x < otherPlayer.x;

    itWs.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: !moveRight, right: moveRight } }));
    otherWs.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: moveRight, right: !moveRight } }));

    // Wait for them to collide and overlap
    await new Promise(r => setTimeout(r, 2000));

    // Stop both at same position
    itWs.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));
    otherWs.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: false } }));

    // Collect game states for 500ms and check IT doesn't flip rapidly
    const messages = await collectMessages(wsA, 50, 500);
    const gameStates = messages.filter(m => m.type === 'GAME_STATE');

    let flipCount = 0;
    for (let i = 1; i < gameStates.length; i++) {
      if (gameStates[i].itPlayerId !== gameStates[i - 1].itPlayerId) {
        flipCount++;
      }
    }

    // Should be at most 1 flip (the initial tag), not rapid alternation
    assert(flipCount <= 1, `IT flipped ${flipCount} times while overlapping — tag flickering detected`);

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 16: Room isolation during gameplay
  await test('Test 16 — Room isolation during gameplay', async () => {
    const game1 = await createAndStartGame();
    const game2 = await createAndStartGame();

    assert(game1.roomCode !== game2.roomCode, 'Should be different rooms');

    // Drain initial states
    await drain(game1.wsA, 150);
    await drain(game2.wsA, 150);

    // Move player in room 1
    game1.wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: false, left: false, right: true } }));
    await new Promise(r => setTimeout(r, 200));

    // Get state from room 2 — should be at spawn positions
    const state2 = await waitForMessageType(game2.wsA, 'GAME_STATE', 2000);
    const playersRoom2 = state2.players;
    // Room 2 players should not have moved (both at spawn x=200 and x=800)
    for (const p of playersRoom2) {
      assert(p.x === 200 || p.x === 800, `Room 2 player at unexpected x=${p.x.toFixed(1)}`);
    }

    game1.wsA.close();
    game1.wsB.close();
    game2.wsA.close();
    game2.wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 17: Disconnect during gameplay
  await test('Test 17 — Disconnect during gameplay (clean GAME_ENDED)', async () => {
    const { wsA, wsB } = await createAndStartGame();
    await drain(wsA, 100);

    const endedPromise = waitForMessageType(wsA, 'GAME_ENDED');
    wsB.close();

    const ended = await endedPromise;
    assert(ended.type === 'GAME_ENDED', `Expected GAME_ENDED`);
    assert(ended.reason === 'PLAYER_DISCONNECTED', `Expected reason PLAYER_DISCONNECTED`);

    wsA.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 18: Multiple simultaneous rooms
  await test('Test 18 — Multiple rooms (independent game state)', async () => {
    const game1 = await createAndStartGame();
    const game2 = await createAndStartGame();

    assert(game1.roomCode !== game2.roomCode, 'Rooms should be different');

    // Both should have independent IT assignments
    assert(typeof game1.gameA.itPlayerId === 'string', 'Room 1 should have IT');
    assert(typeof game2.gameA.itPlayerId === 'string', 'Room 2 should have IT');

    // Move room 1 player, verify room 2 is unaffected
    game1.wsA.send(JSON.stringify({ type: 'INPUT', input: { up: false, down: true, left: false, right: false } }));
    await new Promise(r => setTimeout(r, 200));

    const state1 = await waitForMessageType(game1.wsA, 'GAME_STATE', 2000);
    const state2 = await waitForMessageType(game2.wsA, 'GAME_STATE', 2000);

    // Room 2 players should still be at spawn Y (300)
    for (const p of state2.players) {
      assert(p.y === 300, `Room 2 player y should be 300, got ${p.y.toFixed(1)}`);
    }

    game1.wsA.close();
    game1.wsB.close();
    game2.wsA.close();
    game2.wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Summary
  console.log(`\n────────────────────────────────`);
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`────────────────────────────────\n`);

  await new Promise(r => setTimeout(r, 500));
  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
