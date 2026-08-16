/**
 * Ninja Tag Phase 4.2 — Acceptance Test Script
 *
 * Tests Phase 4.2 Correctness Patch (Reconciliation Semantics):
 * - TEST 1: 30Hz network input vs 60Hz simulation timing (reconciliation simulates tick interval, not input count)
 * - TEST 2: Sustained movement (holding RIGHT for 1 sec = 60 ticks = 250px displacement)
 * - TEST 3: Input changes timeline (RIGHT -> DOWN+RIGHT -> LEFT)
 * - TEST 4: ACK sequence pruning
 * - TEST 5: ACK newest input (predicted position matches authoritative position when S = C)
 * - TEST 6: No pending inputs / stationary player
 * - TEST 7: Repeated snapshots (no runaway movement or accumulating drift)
 * - TEST 8: Diagonal movement (preserves vector normalization in reconciliation)
 * - TEST 9: End-to-End integration snapshot & tick reconciliation
 *
 * Run with: node test/acceptance.js
 * Requires the server to be running on port 3001 for integration tests.
 */

import WebSocket from 'ws';
import { simulatePlayerMovement } from '../shared/game/movement.js';
import { Prediction } from '../client/src/game/Prediction.js';
import { NetworkState } from '../client/src/network/NetworkState.js';
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
  console.log('\n🥷 Ninja Tag Phase 4.2 — Acceptance Tests (Reconciliation Semantics)\n');
  console.log('── Unit Tests: Reconciliation Semantics & 60Hz Tick Replay ──\n');

  // TEST 1: 30Hz network input vs 60Hz simulation timing
  await test('TEST 1 — Reconciliation simulates tick interval (C - S), not input array count', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);

    const rightInput = { up: false, down: false, left: false, right: true };
    const mockInputManager = { getInput: () => rightInput };
    pred.inputManagerRef = mockInputManager;

    // Simulate 60 prediction ticks (localTick = 60)
    for (let i = 0; i < 60; i++) {
      pred.tickPrediction();
    }
    // Store only 30 network input commands (simulating 30Hz network stream)
    for (let seq = 1; seq <= 30; seq++) {
      pred.addInput(seq, rightInput);
    }

    // Reconcile with snapshot at serverTick = 30 (server position = 200 + 30 * (250/60) = 325)
    const serverTick = 30;
    const authX = 200 + serverTick * (PLAYER_SPEED * FIXED_DT); // 325
    pred.reconcile({ x: authX, y: 300 }, serverTick, 15);

    // Should replay ticks 31..60 (30 ticks), resulting in 200 + 60 * (250/60) = 450
    const expectedX = 200 + 60 * (PLAYER_SPEED * FIXED_DT); // 450
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Reconciliation should reach ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 2: Sustained movement
  await test('TEST 2 — Sustained movement (1 sec = 60 ticks = 250px displacement)', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);

    const rightInput = { up: false, down: false, left: false, right: true };
    pred.inputManagerRef = { getInput: () => rightInput };

    for (let i = 0; i < 60; i++) {
      pred.tickPrediction();
    }

    const authPos = { x: 200 + 40 * (PLAYER_SPEED * FIXED_DT), y: 300 }; // 40 ticks = 366.67
    pred.reconcile(authPos, 40, 20);

    // Replayed 20 remaining ticks -> total 60 ticks = 450
    const expectedX = 200 + 250; // 450
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Sustained movement expected ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 3: Input changes timeline
  await test('TEST 3 — Input changes timeline (RIGHT -> DOWN+RIGHT -> LEFT)', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);

    let currentInput = { up: false, down: false, left: false, right: true };
    pred.inputManagerRef = { getInput: () => currentInput };

    // Ticks 1..20: RIGHT
    for (let i = 0; i < 20; i++) pred.tickPrediction();

    // Ticks 21..40: DOWN+RIGHT
    currentInput = { up: false, down: true, left: false, right: true };
    for (let i = 0; i < 20; i++) pred.tickPrediction();

    // Ticks 41..60: LEFT
    currentInput = { up: false, down: false, left: true, right: false };
    for (let i = 0; i < 20; i++) pred.tickPrediction();

    const expectedPosAt60 = { ...pred.predictedPosition };

    // Reconcile at serverTick = 20 with auth position at tick 20
    const posAt20 = { x: 200 + 20 * (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(posAt20, 20, 10);

    assert(Math.abs(pred.predictedPosition.x - expectedPosAt60.x) < 0.0001, `X after timeline replay expected ${expectedPosAt60.x}, got ${pred.predictedPosition.x}`);
    assert(Math.abs(pred.predictedPosition.y - expectedPosAt60.y) < 0.0001, `Y after timeline replay expected ${expectedPosAt60.y}, got ${pred.predictedPosition.y}`);
  });

  // TEST 4: ACK sequence pruning
  await test('TEST 4 — ACK sequence pruning', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);
    for (let i = 101; i <= 105; i++) {
      pred.addInput(i, { up: false, down: false, left: false, right: true });
    }

    pred.reconcile({ x: 200, y: 300 }, 0, 103);
    assert(pred.getPendingCount() === 2, `Inputs <= 103 should be pruned (expected 2 remaining, got ${pred.getPendingCount()})`);
  });

  // TEST 5: ACK newest input (S = C)
  await test('TEST 5 — ACK newest input (serverTick = localTick -> predicted equals auth position)', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);
    pred.inputManagerRef = { getInput: () => ({ up: false, down: false, left: false, right: true }) };

    for (let i = 0; i < 10; i++) pred.tickPrediction();

    const authPos = { x: 500, y: 500 };
    pred.reconcile(authPos, 10, 10);

    assert(pred.predictedPosition.x === 500 && pred.predictedPosition.y === 500, `When S = C, predicted position should snap to auth position (500, 500), got (${pred.predictedPosition.x}, ${pred.predictedPosition.y})`);
  });

  // TEST 6: No pending inputs / stationary player
  await test('TEST 6 — Stationary player reconciliation does not drift', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);
    pred.inputManagerRef = { getInput: () => ({ up: false, down: false, left: false, right: false }) };

    for (let i = 0; i < 30; i++) pred.tickPrediction();

    pred.reconcile({ x: 200, y: 300 }, 15, 0);
    assert(pred.predictedPosition.x === 200 && pred.predictedPosition.y === 300, `Stationary player should remain at (200, 300), got (${pred.predictedPosition.x}, ${pred.predictedPosition.y})`);
  });

  // TEST 7: Repeated snapshots
  await test('TEST 7 — Repeated snapshots cause no runaway movement or accumulating drift', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);
    pred.inputManagerRef = { getInput: () => ({ up: false, down: false, left: false, right: true }) };

    for (let i = 0; i < 60; i++) pred.tickPrediction();

    const authPos1 = { x: 200 + 40 * (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos1, 40, 20);
    const xAfterFirst = pred.predictedPosition.x;

    const authPos2 = { x: 200 + 50 * (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos2, 50, 25);
    const xAfterSecond = pred.predictedPosition.x;

    assert(Math.abs(xAfterFirst - xAfterSecond) < 0.0001, `Repeated snapshot reconciliation should remain stable (${xAfterFirst} vs ${xAfterSecond})`);
  });

  // TEST 8: Diagonal movement
  await test('TEST 8 — Diagonal movement reconciliation preserves vector normalization', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 }, 0);
    const diagInput = { up: true, down: false, left: false, right: true };
    pred.inputManagerRef = { getInput: () => diagInput };

    for (let i = 0; i < 60; i++) pred.tickPrediction();

    const expectedX = 200 + 60 * (PLAYER_SPEED * (1 / Math.sqrt(2)) * FIXED_DT);
    const expectedY = 300 - 60 * (PLAYER_SPEED * (1 / Math.sqrt(2)) * FIXED_DT);

    const authPos = { x: 200 + 30 * (PLAYER_SPEED * (1 / Math.sqrt(2)) * FIXED_DT), y: 300 - 30 * (PLAYER_SPEED * (1 / Math.sqrt(2)) * FIXED_DT) };
    pred.reconcile(authPos, 30, 15);

    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Diagonal X expected ${expectedX}, got ${pred.predictedPosition.x}`);
    assert(Math.abs(pred.predictedPosition.y - expectedY) < 0.0001, `Diagonal Y expected ${expectedY}, got ${pred.predictedPosition.y}`);
  });

  console.log('\n── Integration Tests: End-to-End Game Start & Tick Reconciliation ──\n');

  // TEST 9: End-to-End integration test
  await test('TEST 9 — End-to-End integration: SNAPSHOT tick reconciliation', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;
    await drain(wsA, 100);
    await drain(wsB, 100);

    const seq = 25;
    wsA.send(JSON.stringify({
      type: 'INPUT',
      sequence: seq,
      input: { up: false, down: false, left: false, right: true }
    }));

    await new Promise(r => setTimeout(r, 150));
    const snapshot = await waitForMessageType(wsB, 'SNAPSHOT', 2000);
    const pA = snapshot.players.find(p => p.id === playerIdA);

    assert(pA.lastProcessedInput >= seq, `Server ACK (${pA.lastProcessedInput}) should be >= ${seq}`);
    assert(typeof snapshot.tick === 'number' && snapshot.tick > 0, `Snapshot tick must be a positive number, got ${snapshot.tick}`);

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
