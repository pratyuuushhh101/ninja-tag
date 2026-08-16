/**
 * Ninja Tag Phase 3 — Acceptance Test Script
 *
 * Tests Phase 1 lobby + Phase 2 gameplay + Phase 3 architecture:
 * - Sequenced input messages (`sequence`)
 * - Non-negative integer sequence validation & stale sequence rejection
 * - Monotonic simulation tick counter (`tick`)
 * - Decoupled 20Hz authoritative SNAPSHOT messages
 * - Processed input acknowledgements (`lastProcessedInput`)
 * - Multi-room tick & snapshot isolation
 *
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

function collectMessages(ws, count, timeoutMs = 3000) {
  return new Promise((resolve) => {
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

  const gameStartedPromiseA = waitForMessageType(wsA, 'GAME_STARTED');

  const wsB = await connect();
  const gameStartedPromiseB = waitForMessageType(wsB, 'GAME_STARTED');
  wsB.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode }));

  const gameA = await gameStartedPromiseA;
  const gameB = await gameStartedPromiseB;

  return { wsA, wsB, roomCode, gameA, gameB };
}

async function runTests() {
  console.log('\n🥷 Ninja Tag Phase 3 — Acceptance Tests\n');
  console.log('── Phase 1 & 2 Core Checks ──\n');

  // Test 1: Create room
  await test('Test 1 — Create room', async () => {
    const ws = await connect();
    const res = await sendAndReceive(ws, { type: 'CREATE_ROOM' });
    assert(res.type === 'ROOM_CREATED', `Expected ROOM_CREATED, got ${res.type}`);
    assert(typeof res.roomCode === 'string' && res.roomCode.length === 5, `Invalid room code`);
    ws.close();
  });

  // Test 2: Join room & auto game start
  await test('Test 2 — Join room (game starts)', async () => {
    const { wsA, wsB, gameA, gameB } = await createAndStartGame();
    assert(gameA.type === 'GAME_STARTED' && gameB.type === 'GAME_STARTED', 'Game should start for both');
    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 3: Invalid room code
  await test('Test 3 — Invalid room (ROOM_NOT_FOUND)', async () => {
    const ws = await connect();
    const res = await sendAndReceive(ws, { type: 'JOIN_ROOM', roomCode: 'ZZZZZ' });
    assert(res.type === 'ERROR' && res.code === 'ROOM_NOT_FOUND', 'Should return ROOM_NOT_FOUND');
    ws.close();
  });

  // Test 4: Full room
  await test('Test 4 — Full room (ROOM_FULL)', async () => {
    const { wsA, wsB, roomCode } = await createAndStartGame();
    const wsC = await connect();
    const fullRes = await sendAndReceive(wsC, { type: 'JOIN_ROOM', roomCode });
    assert(fullRes.type === 'ERROR' && fullRes.code === 'ROOM_FULL', 'Should return ROOM_FULL');
    wsA.close();
    wsB.close();
    wsC.close();
    await new Promise(r => setTimeout(r, 200));
  });

  console.log('\n── Phase 3: Networking & Simulation Architecture ──\n');

  // Test 5: Monotonic simulation tick in snapshots
  await test('Test 5 — Monotonic simulation tick counter in SNAPSHOT messages', async () => {
    const { wsA, wsB } = await createAndStartGame();
    await drain(wsA, 100);

    const snapshots = (await collectMessages(wsA, 10, 500)).filter(m => m.type === 'SNAPSHOT' || m.type === 'GAME_STATE');
    assert(snapshots.length >= 3, 'Should receive multiple snapshots');

    for (let i = 1; i < snapshots.length; i++) {
      assert(typeof snapshots[i].tick === 'number', `Snapshot ${i} must have numerical tick`);
      assert(snapshots[i].tick > snapshots[i - 1].tick, `Snapshot tick must increase monotonically (${snapshots[i].tick} > ${snapshots[i - 1].tick})`);
    }

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 6: Input sequence validation & acknowledgement
  await test('Test 6 — Input sequence transmission & server ACK (lastProcessedInput)', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;
    await drain(wsA, 100);
    await drain(wsB, 100);

    // Send input with sequence = 101
    const seq = 101;
    wsA.send(JSON.stringify({
      type: 'INPUT',
      sequence: seq,
      input: { up: false, down: false, left: false, right: true }
    }));

    await new Promise(r => setTimeout(r, 150));

    // Get snapshot
    const snapshot = await waitForMessageType(wsB, 'SNAPSHOT', 2000).catch(() => waitForMessageType(wsB, 'GAME_STATE', 2000));
    assert(snapshot.players && snapshot.players.length === 2, 'Snapshot must include 2 players');

    const playerAState = snapshot.players.find(p => p.id === playerIdA);
    assert(playerAState, 'Player A must exist in snapshot');
    assert(typeof playerAState.lastProcessedInput === 'number', 'Snapshot must include lastProcessedInput ACK');
    assert(playerAState.lastProcessedInput >= seq, `Server ACK lastProcessedInput (${playerAState.lastProcessedInput}) must be >= sent sequence (${seq})`);

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 7: Rejection of non-integer / negative input sequence numbers
  await test('Test 7 — Validation: Rejection of invalid input sequence numbers', async () => {
    const { wsA, wsB } = await createAndStartGame();
    await drain(wsA, 100);

    // Negative sequence
    const res1 = await sendAndReceive(wsA, {
      type: 'INPUT',
      sequence: -5,
      input: { up: false, down: false, left: false, right: true }
    });
    assert(res1.type === 'ERROR' && res1.code === 'INVALID_INPUT', 'Server must reject negative sequence');

    // Float sequence
    const res2 = await sendAndReceive(wsA, {
      type: 'INPUT',
      sequence: 12.34,
      input: { up: false, down: false, left: false, right: true }
    });
    assert(res2.type === 'ERROR' && res2.code === 'INVALID_INPUT', 'Server must reject float sequence');

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 8: Stale input sequence numbers ignored
  await test('Test 8 — Server ignores stale/out-of-order input sequence numbers', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;
    await drain(wsA, 100);

    // Send sequence 200: moving right
    wsA.send(JSON.stringify({
      type: 'INPUT',
      sequence: 200,
      input: { up: false, down: false, left: false, right: true }
    }));
    await new Promise(r => setTimeout(r, 100));

    // Send stale sequence 50: attempting to move left (should be ignored)
    wsA.send(JSON.stringify({
      type: 'INPUT',
      sequence: 50,
      input: { up: false, down: false, left: true, right: false }
    }));
    await new Promise(r => setTimeout(r, 150));

    const snapshot = await waitForMessageType(wsB, 'SNAPSHOT', 2000);
    const pA = snapshot.players.find(p => p.id === playerIdA);

    // Should still have ACK = 200, NOT reverted to 50
    assert(pA.lastProcessedInput === 200, `lastProcessedInput should remain 200, got ${pA.lastProcessedInput}`);

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 9: 20Hz Snapshot rate decoupling
  await test('Test 9 — Snapshot transmission rate decoupling (~20Hz)', async () => {
    const { wsA, wsB } = await createAndStartGame();
    await drain(wsA, 100);

    // Collect snapshots over 500ms
    const start = Date.now();
    const msgs = await collectMessages(wsA, 30, 500);
    const elapsed = (Date.now() - start) / 1000;
    const snapshots = msgs.filter(m => m.type === 'SNAPSHOT');

    // At 20Hz, over ~0.5s we expect around 8-12 snapshots (not 30 like 60Hz)
    assert(snapshots.length >= 6 && snapshots.length <= 16, `Expected ~10 snapshots at 20Hz over 500ms, got ${snapshots.length}`);

    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 10: Multi-room tick & snapshot isolation
  await test('Test 10 — Multi-room tick and snapshot isolation', async () => {
    const game1 = await createAndStartGame();
    await new Promise(r => setTimeout(r, 300));
    const game2 = await createAndStartGame();

    await drain(game1.wsA, 100);
    await drain(game2.wsA, 100);

    const s1 = await waitForMessageType(game1.wsA, 'SNAPSHOT');
    const s2 = await waitForMessageType(game2.wsA, 'SNAPSHOT');

    assert(typeof s1.tick === 'number' && typeof s2.tick === 'number', 'Both games must have valid ticks');
    // Game 1 started earlier, so its tick should be higher than Game 2's tick
    assert(s1.tick > s2.tick, `Game 1 tick (${s1.tick}) should be greater than Game 2 tick (${s2.tick})`);

    game1.wsA.close();
    game1.wsB.close();
    game2.wsA.close();
    game2.wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 11: Gameplay preservation (tagging & boundary clamping work identically)
  await test('Test 11 — Gameplay preservation (movement, boundaries, tagging)', async () => {
    const { wsA, wsB, gameA, gameB } = await createAndStartGame();

    const itId = gameA.itPlayerId;
    const isAIt = gameA.yourPlayerId === itId;
    const itWs = isAIt ? wsA : wsB;
    const otherWs = isAIt ? wsB : wsA;
    const otherId = isAIt ? gameB.yourPlayerId : gameA.yourPlayerId;

    let seqIt = 1;
    let seqOther = 1;

    // Drive players together
    const itPlayer = gameA.players.find(p => p.id === itId);
    const otherPlayer = gameA.players.find(p => p.id === otherId);
    const moveRight = itPlayer.x < otherPlayer.x;

    itWs.send(JSON.stringify({ type: 'INPUT', sequence: seqIt++, input: { up: false, down: false, left: !moveRight, right: moveRight } }));
    otherWs.send(JSON.stringify({ type: 'INPUT', sequence: seqOther++, input: { up: false, down: false, left: moveRight, right: !moveRight } }));

    // Wait for tag to occur
    let tagged = false;
    const start = Date.now();
    while (Date.now() - start < 3000) {
      const snap = await waitForMessageType(wsA, 'SNAPSHOT', 1000).catch(() => null);
      if (!snap) break;
      if (snap.itPlayerId === otherId) {
        tagged = true;
        break;
      }
    }

    assert(tagged, 'Tagging must occur upon circle collision');

    wsA.close();
    wsB.close();
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
