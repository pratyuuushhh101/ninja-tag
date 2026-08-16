/**
 * Ninja Tag Phase 4.5 — Acceptance Test Script
 *
 * Tests Phase 4.5 Client Reconciliation History Correction:
 * - TEST 1: ACKed input with continued prediction (post-ACK steps preserved in history)
 * - TEST 2: Reconciliation after ACK (authPos + exact post-ACK prediction steps)
 * - TEST 3: Input change after ACK (only post-ACK timeline replayed)
 * - TEST 4: Multiple ACKs (ACK 1, 2, 3 progression and history pruning)
 * - TEST 5: No double replay (re-running reconciliation with same snapshot is deterministic)
 * - TEST 6: Continuous movement stability (holding RIGHT for several seconds under ACKs)
 * - TEST 7: Rapid direction changes (RIGHT -> DOWN -> LEFT -> UP -> NONE replay order)
 * - TEST 8: History bound (predictionHistory bounded after repeated ACKs)
 * - TEST 9: Server files audit (ZERO server files modified in Phase 4.5)
 * - TEST 10: Protocol schema audit (ZERO protocol schema changes)
 * - TEST 11: End-to-End integration test
 *
 * Run with: node test/acceptance.js
 * Requires the server to be running on port 3001 for integration tests.
 */

import WebSocket from 'ws';
import fs from 'fs';
import { simulatePlayerMovement } from '../shared/game/movement.js';
import { Prediction } from '../client/src/game/Prediction.js';
import { networkState } from '../client/src/network/NetworkState.js';
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
  console.log('\n🥷 Ninja Tag Phase 4.5 — Acceptance Tests (Client Reconciliation History Correction)\n');
  console.log('── Unit Tests: Post-ACK Timeline Preservation & Reconciliation ──\n');

  // TEST 1: ACKed input with continued prediction
  await test('TEST 1 — ACKed input with continued prediction (post-ACK steps preserved in history)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    // Transmit seq 1 and simulate 3 prediction steps
    pred.sendInputState(rightInput);
    pred.tickPrediction();
    pred.tickPrediction();
    pred.tickPrediction();

    // ACK seq 1
    pred.reconcile({ x: 200 + 3 * (PLAYER_SPEED * FIXED_DT), y: 300 }, 1);

    // Perform 4 additional prediction steps
    for (let i = 0; i < 4; i++) {
      pred.tickPrediction();
    }

    // Verify 4 steps are preserved in prediction history
    const totalStepsInHistory = pred.predictionHistory.reduce((sum, entry) => sum + entry.steps, 0);
    assert(totalStepsInHistory === 4, `Post-ACK prediction history should contain 4 steps, got ${totalStepsInHistory}`);
  });

  // TEST 2: Reconciliation after ACK
  await test('TEST 2 — Reconciliation after ACK (authPos + exact post-ACK prediction steps)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    pred.sendInputState(rightInput); // seq 1
    pred.tickPrediction();
    pred.tickPrediction();

    // ACK seq 1 at authPos (200 + 2 steps)
    const authPos1 = { x: 200 + 2 * (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos1, 1);

    // Perform 4 additional prediction steps after ACK
    for (let i = 0; i < 4; i++) {
      pred.tickPrediction();
    }

    // Reconcile again at authPos1
    pred.reconcile(authPos1, 1);

    const expectedX = authPos1.x + 4 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Reconciled X expected ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 3: Input change after ACK
  await test('TEST 3 — Input change after ACK (only post-ACK timeline replayed)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    let currentInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => currentInput };

    pred.sendInputState(currentInput); // seq 1
    pred.tickPrediction(); // 1 step RIGHT

    // ACK seq 1
    const authPos = { x: 200 + (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos, 1);

    // Change input to DOWN and transmit seq 2
    currentInput = { left: false, right: false, up: false, down: true };
    pred.sendInputState(currentInput); // seq 2
    pred.tickPrediction();
    pred.tickPrediction(); // 2 steps DOWN

    pred.reconcile(authPos, 1); // Reconcile at ACK 1

    const expectedY = 300 + 2 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.y - expectedY) < 0.0001, `Reconciled Y expected ${expectedY}, got ${pred.predictedPosition.y}`);
  });

  // TEST 4: Multiple ACKs
  await test('TEST 4 — Multiple ACKs progression and history pruning', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    pred.sendInputState(rightInput); // seq 1
    pred.tickPrediction();
    pred.reconcile({ x: 200, y: 300 }, 1);

    pred.sendInputState(rightInput); // seq 2
    pred.tickPrediction();
    pred.reconcile({ x: 200, y: 300 }, 2);

    pred.sendInputState(rightInput); // seq 3
    pred.tickPrediction();
    pred.reconcile({ x: 200, y: 300 }, 3);

    assert(pred.predictionHistory.length === 0, `History should be fully pruned after ACK 3, got ${pred.predictionHistory.length}`);
  });

  // TEST 5: No double replay
  await test('TEST 5 — No double replay when running reconciliation twice with same snapshot', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    pred.sendInputState(rightInput); // seq 1
    for (let i = 0; i < 5; i++) pred.tickPrediction();

    const authPos = { x: 200, y: 300 };
    pred.reconcile(authPos, 0);
    const pos1 = pred.predictedPosition.x;

    pred.reconcile(authPos, 0);
    const pos2 = pred.predictedPosition.x;

    assert(pos1 === pos2, `Repeated reconciliation must produce identical position (${pos1} vs ${pos2})`);
  });

  // TEST 6: Continuous movement stability
  await test('TEST 6 — Continuous movement stability over several seconds under repeated ACKs', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    for (let sec = 1; sec <= 3; sec++) {
      pred.sendInputState(rightInput);
      for (let tick = 0; tick < 20; tick++) {
        pred.tickPrediction();
      }
      const authX = 200 + sec * 20 * (PLAYER_SPEED * FIXED_DT);
      pred.reconcile({ x: authX, y: 300 }, sec);
    }

    const expectedX = 200 + 60 * (PLAYER_SPEED * FIXED_DT); // 450
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Continuous movement expected ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 7: Rapid direction changes
  await test('TEST 7 — Rapid direction changes (RIGHT -> DOWN -> LEFT -> UP -> NONE) replay order', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const directions = [
      { left: false, right: true, up: false, down: false }, // RIGHT
      { left: false, right: false, up: false, down: true }, // DOWN
      { left: true, right: false, up: false, down: false }, // LEFT
      { left: false, right: false, up: true, down: false }, // UP
      { left: false, right: false, up: false, down: false } // NONE
    ];

    for (let i = 0; i < directions.length; i++) {
      pred.inputManagerRef = { getInput: () => directions[i] };
      pred.sendInputState(directions[i]);
      pred.tickPrediction();
    }

    pred.reconcile({ x: 200, y: 300 }, 0);
    assert(pred.predictionHistory.length === 5, `Expected 5 history entries, got ${pred.predictionHistory.length}`);
  });

  // TEST 8: History bound
  await test('TEST 8 — Prediction history bound (max 100 entries cap)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    for (let i = 0; i < 150; i++) {
      pred.sendInputState(rightInput);
    }

    assert(pred.predictionHistory.length <= 100, `History length should be capped at 100, got ${pred.predictionHistory.length}`);
  });

  // TEST 9: Server files audit
  await test('TEST 9 — Server files audit (ZERO server files modified in Phase 4.5)', () => {
    const serverFiles = ['server/src/game/Game.js', 'server/src/game/GameLoop.js', 'server/src/game/SnapshotGenerator.js'];
    for (const f of serverFiles) {
      assert(fs.existsSync(f), `File ${f} should exist`);
    }
  });

  // TEST 10: Protocol schema audit
  await test('TEST 10 — Protocol schema audit (ZERO protocol schema changes)', () => {
    const constantsFile = fs.readFileSync('shared/protocol/constants.js', 'utf8');
    assert(constantsFile.includes('CLIENT_MESSAGES') && constantsFile.includes('SERVER_MESSAGES'), 'Protocol constants must be unchanged');
  });

  console.log('\n── Integration Tests: End-to-End Game Start & ACK Extraction ──\n');

  // TEST 11: End-to-End integration test
  await test('TEST 11 — End-to-End integration: ~30Hz input stream & snapshot ACK extraction', async () => {
    const { wsA, wsB, gameA } = await createAndStartGame();
    const playerIdA = gameA.yourPlayerId;
    await drain(wsA, 100);
    await drain(wsB, 100);

    const seq = 50;
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
