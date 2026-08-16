/**
 * Ninja Tag Phase 4 — Acceptance Test Script
 *
 * Tests Phase 1-3 architecture + Phase 4 Client-Side Prediction & Server Reconciliation:
 * - Shared deterministic movement simulation (cardinal, diagonal normalization, boundary clamping)
 * - Immediate client-side prediction
 * - Immutable input command queueing & ACK pruning
 * - Replaying unacknowledged pending inputs on snapshot arrival
 * - Server authority preservation over IT roles and remote player positions
 *
 * Run with: node test/acceptance.js
 * Requires the server to be running on port 3001 for integration tests.
 */

import WebSocket from 'ws';
import { simulatePlayerMovement } from '../shared/game/movement.js';
import { Prediction } from '../client/src/game/Prediction.js';
import { PLAYER_SPEED, FIXED_DT, ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS } from '../shared/protocol/constants.js';

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

/** Helper: create a room, join it, wait for game to start */
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
  console.log('\n🥷 Ninja Tag Phase 4 — Acceptance Tests\n');
  console.log('── Unit Tests: Shared Movement & Prediction Engine ──\n');

  // Test 1: Shared movement cardinal & diagonal calculation
  await test('Test 1 — Shared movement (cardinal, diagonal normalization, boundary clamping)', () => {
    // Cardinal right movement
    const start = { x: 200, y: 300 };
    const right = simulatePlayerMovement(start, { left: false, right: true, up: false, down: false }, FIXED_DT);
    const expectedX = 200 + PLAYER_SPEED * FIXED_DT;
    assert(Math.abs(right.x - expectedX) < 0.0001, `Right movement x should be ${expectedX}, got ${right.x}`);
    assert(right.y === 300, 'Y should remain unchanged');

    // Diagonal movement (right + down)
    const diag = simulatePlayerMovement(start, { left: false, right: true, up: false, down: true }, FIXED_DT);
    const expectedDiagDist = PLAYER_SPEED * FIXED_DT / Math.sqrt(2);
    assert(Math.abs((diag.x - 200) - expectedDiagDist) < 0.0001, `Diagonal X should be ${expectedDiagDist}, got ${diag.x - 200}`);
    assert(Math.abs((diag.y - 300) - expectedDiagDist) < 0.0001, `Diagonal Y should be ${expectedDiagDist}, got ${diag.y - 300}`);

    // Boundary clamping (left wall)
    const nearLeft = { x: 25, y: 300 };
    const clampedLeft = simulatePlayerMovement(nearLeft, { left: true, right: false, up: false, down: false }, FIXED_DT * 10);
    assert(clampedLeft.x === PLAYER_RADIUS, `Left boundary should clamp at radius (${PLAYER_RADIUS}), got ${clampedLeft.x}`);
  });

  // Test 2: Prediction immediate movement & queueing
  await test('Test 2 — Prediction engine: immediate movement step & pending queueing', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    pred.addInput(1, { left: false, right: true, up: false, down: false });
    assert(pred.getPendingCount() === 1, 'Pending count should be 1');
    const expectedX = 200 + PLAYER_SPEED * FIXED_DT;
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Predicted X should advance immediately to ${expectedX}`);

    pred.addInput(2, { left: false, right: true, up: false, down: false });
    assert(pred.getPendingCount() === 2, 'Pending count should be 2');
    assert(Math.abs(pred.predictedPosition.x - (200 + 2 * PLAYER_SPEED * FIXED_DT)) < 0.0001, 'Predicted X should advance 2 steps');
  });

  // Test 3: Reconciliation ACK pruning & input replay
  await test('Test 3 — Reconciliation: ACK pruning & unacknowledged input replay', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    // Add inputs #1 to #5 (moving right)
    for (let i = 1; i <= 5; i++) {
      pred.addInput(i, { left: false, right: true, up: false, down: false });
    }
    assert(pred.getPendingCount() === 5, 'Should have 5 pending inputs');

    // Server snapshot arrives: server position at step 3 = 200 + 3 * (250/60), ACK = 3
    const authX = 200 + 3 * PLAYER_SPEED * FIXED_DT;
    pred.reconcile({ x: authX, y: 300 }, 3);

    // Pending inputs #1, #2, #3 should be pruned. Remaining: #4, #5 (2 items)
    assert(pred.getPendingCount() === 2, `Should have 2 remaining pending inputs after ACK=3, got ${pred.getPendingCount()}`);

    // Replayed position starting from authX + 2 steps = 200 + 5 steps
    const expectedReplayedX = 200 + 5 * PLAYER_SPEED * FIXED_DT;
    assert(Math.abs(pred.predictedPosition.x - expectedReplayedX) < 0.0001, `Reconciled predicted X should be ${expectedReplayedX}, got ${pred.predictedPosition.x}`);
  });

  // Test 4: Authoritative IT & remote player state preservation
  await test('Test 4 — Composed render state preserves server IT assignment & remote player positions', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    pred.addInput(1, { left: false, right: true, up: false, down: false });

    const snapshot = {
      tick: 150,
      itPlayerId: 'remote-player',
      players: [
        { id: 'local-player', x: 200, y: 300 },
        { id: 'remote-player', x: 800, y: 300 }
      ]
    };

    const renderState = pred.getRenderState(snapshot, 'local-player');
    assert(renderState.itPlayerId === 'remote-player', 'IT role must come from server snapshot');

    const localRender = renderState.players.find(p => p.id === 'local-player');
    const remoteRender = renderState.players.find(p => p.id === 'remote-player');

    assert(Math.abs(localRender.x - pred.predictedPosition.x) < 0.0001, 'Local player must use predicted position');
    assert(remoteRender.x === 800, 'Remote player must remain on authoritative server position');
  });

  console.log('\n── Integration Tests: End-to-End Prediction & Server Reconciliation ──\n');

  // Test 5: End-to-end integration room creation, join, game start
  await test('Test 5 — End-to-End game start & snapshot flow', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    assert(gameA.type === 'GAME_STARTED', 'Game should start');
    wsA.close();
    wsB.close();
    await new Promise(r => setTimeout(r, 200));
  });

  // Test 6: End-to-end input sequence transmission & SNAPSHOT ACKs
  await test('Test 6 — End-to-End input sequence & SNAPSHOT lastProcessedInput ACK', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;
    await drain(wsA, 100);
    await drain(wsB, 100);

    const seq = 15;
    wsA.send(JSON.stringify({
      type: 'INPUT',
      sequence: seq,
      input: { up: false, down: false, left: false, right: true }
    }));

    await new Promise(r => setTimeout(r, 150));
    const snapshot = await waitForMessageType(wsB, 'SNAPSHOT', 2000);
    const pA = snapshot.players.find(p => p.id === playerIdA);

    assert(pA.lastProcessedInput >= seq, `Server ACK (${pA.lastProcessedInput}) should be >= ${seq}`);

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
