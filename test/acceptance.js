/**
 * Ninja Tag Phase 1 — Acceptance Test Script
 *
 * Tests all 8 acceptance criteria using the ws library directly.
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

async function runTests() {
  console.log('\n🥷 Ninja Tag Phase 1 — Acceptance Tests\n');

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

  // Test 2: Join room — both see 2/2
  await test('Test 2 — Join room (both see 2/2)', async () => {
    const wsA = await connect();
    const createRes = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
    const roomCode = createRes.roomCode;

    // Set up listener for Browser A to receive ROOM_STATE update
    const roomStatePromiseA = waitForMessage(wsA);

    const wsB = await connect();
    const joinRes = await sendAndReceive(wsB, { type: 'JOIN_ROOM', roomCode });
    assert(joinRes.type === 'ROOM_JOINED', `Expected ROOM_JOINED, got ${joinRes.type}`);
    assert(joinRes.roomCode === roomCode, `Room code mismatch`);
    assert(joinRes.playerCount === 2, `Expected playerCount 2, got ${joinRes.playerCount}`);
    assert(joinRes.roomState === 'FULL', `Expected FULL, got ${joinRes.roomState}`);

    // Browser A should get ROOM_STATE update
    const stateA = await roomStatePromiseA;
    assert(stateA.type === 'ROOM_STATE', `Expected ROOM_STATE for A, got ${stateA.type}`);
    assert(stateA.playerCount === 2, `Expected playerCount 2 for A, got ${stateA.playerCount}`);
    assert(stateA.roomState === 'FULL', `Expected FULL for A, got ${stateA.roomState}`);

    wsA.close();
    wsB.close();
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
    const wsA = await connect();
    const createRes = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
    const roomCode = createRes.roomCode;

    const wsB = await connect();
    // Consume join + state messages
    await sendAndReceive(wsB, { type: 'JOIN_ROOM', roomCode });
    // Also consume the ROOM_STATE that wsA receives
    await waitForMessage(wsA);

    const wsC = await connect();
    const fullRes = await sendAndReceive(wsC, { type: 'JOIN_ROOM', roomCode });
    assert(fullRes.type === 'ERROR', `Expected ERROR, got ${fullRes.type}`);
    assert(fullRes.code === 'ROOM_FULL', `Expected ROOM_FULL, got ${fullRes.code}`);

    wsA.close();
    wsB.close();
    wsC.close();
  });

  // Test 5: Disconnect — remaining player gets updated state
  await test('Test 5 — Disconnect (remaining player sees 1/2)', async () => {
    const wsA = await connect();
    const createRes = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
    const roomCode = createRes.roomCode;

    const wsB = await connect();
    await sendAndReceive(wsB, { type: 'JOIN_ROOM', roomCode });
    // Consume ROOM_STATE for wsA
    await waitForMessage(wsA);

    // Set up listener for wsA to receive disconnect notification
    const disconnectPromise = waitForMessage(wsA);

    // Close wsB
    wsB.close();

    const stateAfter = await disconnectPromise;
    assert(stateAfter.type === 'ROOM_STATE', `Expected ROOM_STATE, got ${stateAfter.type}`);
    assert(stateAfter.playerCount === 1, `Expected playerCount 1 after disconnect, got ${stateAfter.playerCount}`);
    assert(stateAfter.roomState === 'WAITING_FOR_PLAYER', `Expected WAITING_FOR_PLAYER, got ${stateAfter.roomState}`);

    wsA.close();
  });

  // Test 6: Empty room cleanup
  await test('Test 6 — Empty room cleanup', async () => {
    const wsA = await connect();
    const createRes = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
    const roomCode = createRes.roomCode;
    wsA.close();

    // Wait a moment for server to process cleanup
    await new Promise(r => setTimeout(r, 500));

    const wsD = await connect();
    const res = await sendAndReceive(wsD, { type: 'JOIN_ROOM', roomCode });
    assert(res.type === 'ERROR', `Expected ERROR, got ${res.type}`);
    assert(res.code === 'ROOM_NOT_FOUND', `Expected ROOM_NOT_FOUND after cleanup, got ${res.code}`);
    wsD.close();
  });

  // Test 7: Independent rooms (room isolation)
  await test('Test 7 — Independent rooms (isolation)', async () => {
    const wsA = await connect();
    const createA = await sendAndReceive(wsA, { type: 'CREATE_ROOM' });
    const roomCodeA = createA.roomCode;

    const wsB = await connect();
    const createB = await sendAndReceive(wsB, { type: 'CREATE_ROOM' });
    const roomCodeB = createB.roomCode;

    assert(roomCodeA !== roomCodeB, 'Room codes should be different');

    // Join room A with a new client
    const wsC = await connect();
    const joinA = await sendAndReceive(wsC, { type: 'JOIN_ROOM', roomCode: roomCodeA });
    assert(joinA.roomCode === roomCodeA, 'Should join room A');

    // wsA should get ROOM_STATE for room A only
    const stateA = await waitForMessage(wsA);
    assert(stateA.roomCode === roomCodeA, `wsA should receive state for room ${roomCodeA}, got ${stateA.roomCode}`);

    // wsB should NOT have received any message (still waiting)
    // We verify by checking wsB gets no message within a short timeout
    try {
      await waitForMessage(wsB, 500);
      throw new Error('wsB should NOT have received a message');
    } catch (e) {
      // Timeout is expected — room isolation confirmed
      if (e.message === 'wsB should NOT have received a message') {
        throw e;
      }
    }

    wsA.close();
    wsB.close();
    wsC.close();
  });

  // Test 8: Duplicate operation protection
  await test('Test 8 — Duplicate operation (ALREADY_IN_ROOM)', async () => {
    const ws = await connect();
    const createRes = await sendAndReceive(ws, { type: 'CREATE_ROOM' });
    assert(createRes.type === 'ROOM_CREATED', 'First create should succeed');

    // Try to create again
    const dupCreate = await sendAndReceive(ws, { type: 'CREATE_ROOM' });
    assert(dupCreate.type === 'ERROR', `Expected ERROR for duplicate create, got ${dupCreate.type}`);
    assert(dupCreate.code === 'ALREADY_IN_ROOM', `Expected ALREADY_IN_ROOM, got ${dupCreate.code}`);

    // Try to join another room while already in one
    const ws2 = await connect();
    const createRes2 = await sendAndReceive(ws2, { type: 'CREATE_ROOM' });
    const otherRoom = createRes2.roomCode;

    const dupJoin = await sendAndReceive(ws, { type: 'JOIN_ROOM', roomCode: otherRoom });
    assert(dupJoin.type === 'ERROR', `Expected ERROR for join while in room, got ${dupJoin.type}`);
    assert(dupJoin.code === 'ALREADY_IN_ROOM', `Expected ALREADY_IN_ROOM for join, got ${dupJoin.code}`);

    ws.close();
    ws2.close();
  });

  // Summary
  console.log(`\n────────────────────────────────`);
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`────────────────────────────────\n`);

  // Wait for cleanup
  await new Promise(r => setTimeout(r, 500));
  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
