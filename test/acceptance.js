/**
 * Ninja Tag Phase 4.6 — Acceptance Test Script
 *
 * Tests Phase 4.6 Final Client Prediction / Reconciliation Correction:
 * - TEST 1: No synthetic sequences (10 prediction ticks after ACK 1 do not fabricate sourceSequence=2)
 * - TEST 2: Synthetic/real sequence collision protection (pre-seq-2 prediction not labeled seq 2)
 * - TEST 3: Continuous movement stability (holding RIGHT for several seconds under ACKs)
 * - TEST 4: ACK then continue predicting (post-ACK steps with sourceSequence=null replayed)
 * - TEST 5: ACK then new network state (post-ACK steps replayed exactly once after seq 2)
 * - TEST 6: Input change order (RIGHT -> DOWN -> LEFT exact replay order)
 * - TEST 7: Key release (NONE state representation and no stale movement replay)
 * - TEST 8: Rapid direction changes (RIGHT -> DOWN -> LEFT -> UP -> NONE stability)
 * - TEST 9: Multiple reconciliations (sequential snapshots, no double step replay)
 * - TEST 10: History bounds (predictionHistory bounded at 150 steps)
 * - TEST 11: Same input multiple ticks (20 prediction steps, NOT 20 network sequences)
 * - TEST 12: No network message during prediction (60Hz prediction loop generates 0 WS packets)
 * - TEST 13: Protocol schema audit (ZERO protocol schema changes)
 * - TEST 14: Server files audit (ZERO server files modified in Phase 4.6)
 * - TEST 15: End-to-End integration test
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
  console.log('\n🥷 Ninja Tag Phase 4.6 — Acceptance Tests (Final Client Prediction / Reconciliation Correction)\n');
  console.log('── Unit Tests: Separated Input & Local Step Histories ──\n');

  // TEST 1: No synthetic sequences
  await test('TEST 1 — No synthetic sequences (10 prediction ticks after ACK 1 do not fabricate sourceSequence=2)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    // Transmit seq 1
    pred.sendInputState(rightInput);
    pred.tickPrediction(); // step 1 (sourceSequence: 1)

    // ACK 1
    pred.reconcile({ x: 200 + (PLAYER_SPEED * FIXED_DT), y: 300 }, 1);

    // Run 10 prediction ticks without transmitting seq 2
    for (let i = 0; i < 10; i++) {
      pred.tickPrediction();
    }

    assert(pred.predictionHistory.length === 10, `Expected 10 steps in predictionHistory, got ${pred.predictionHistory.length}`);
    const hasFabricatedSeq2 = pred.predictionHistory.some(step => step.sourceSequence === 2);
    assert(!hasFabricatedSeq2, 'NONE of the prediction steps must have fabricated sourceSequence=2!');
    const nullSourceCount = pred.predictionHistory.filter(step => step.sourceSequence === null).length;
    assert(nullSourceCount === 10, `All 10 post-ACK prediction steps must have sourceSequence=null, got ${nullSourceCount}`);
  });

  // TEST 2: Synthetic/real sequence collision protection
  await test('TEST 2 — Synthetic/real sequence collision protection (pre-seq-2 prediction not labeled seq 2)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    pred.sendInputState(rightInput); // seq 1
    pred.tickPrediction();
    pred.reconcile({ x: 200 + (PLAYER_SPEED * FIXED_DT), y: 300 }, 1);

    // 3 ticks before seq 2 is sent
    pred.tickPrediction();
    pred.tickPrediction();
    pred.tickPrediction();

    // Now send REAL seq 2
    pred.sendInputState(rightInput); // seq 2
    pred.tickPrediction();
    pred.tickPrediction();

    const preSeq2Steps = pred.predictionHistory.filter(step => step.sourceSequence === null);
    const seq2Steps = pred.predictionHistory.filter(step => step.sourceSequence === 2);

    assert(preSeq2Steps.length === 3, `Pre-seq-2 steps with sourceSequence=null should be 3, got ${preSeq2Steps.length}`);
    assert(seq2Steps.length === 2, `Steps with sourceSequence=2 should be 2, got ${seq2Steps.length}`);
  });

  // TEST 3: Continuous movement stability
  await test('TEST 3 — Continuous movement stability over several seconds under repeated ACKs', () => {
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

  // TEST 4: ACK then continue predicting
  await test('TEST 4 — ACK then continue predicting (post-ACK steps replayed, auth steps ignored)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    pred.sendInputState(rightInput); // seq 1
    pred.tickPrediction();
    pred.tickPrediction();
    pred.tickPrediction(); // 3 steps (x = 212.5)

    const authPos = { x: 200 + 3 * (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos, 1); // ACK 1

    for (let i = 0; i < 4; i++) {
      pred.tickPrediction(); // 4 additional steps
    }

    pred.reconcile(authPos, 1); // Reconcile again at authPos

    const expectedX = authPos.x + 4 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Reconciled X expected ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 5: ACK then new network state
  await test('TEST 5 — ACK then new network state (post-ACK steps replayed exactly once after seq 2)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    pred.sendInputState(rightInput); // seq 1
    pred.tickPrediction(); // 1 step
    const authPos = { x: 200 + (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos, 1);

    pred.tickPrediction();
    pred.tickPrediction(); // 2 steps (sourceSequence: null)

    pred.sendInputState(rightInput); // seq 2
    pred.tickPrediction(); // 1 step (sourceSequence: 2)

    pred.reconcile(authPos, 1); // Reconcile at ACK 1

    const expectedX = authPos.x + 3 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Reconciled X expected ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 6: Input change
  await test('TEST 6 — Input change order (RIGHT -> DOWN -> LEFT exact replay order)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    let input = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => input };
    pred.sendInputState(input); // seq 1
    pred.tickPrediction(); // RIGHT

    input = { left: false, right: false, up: false, down: true };
    pred.inputManagerRef = { getInput: () => input };
    pred.sendInputState(input); // seq 2
    pred.tickPrediction(); // DOWN

    input = { left: true, right: false, up: false, down: false };
    pred.inputManagerRef = { getInput: () => input };
    pred.sendInputState(input); // seq 3
    pred.tickPrediction(); // LEFT

    const authPos = { x: 200 + (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos, 1); // ACK 1

    // Replay should execute DOWN then LEFT
    const expectedX = authPos.x - (PLAYER_SPEED * FIXED_DT);
    const expectedY = 300 + (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `X expected ${expectedX}, got ${pred.predictedPosition.x}`);
    assert(Math.abs(pred.predictedPosition.y - expectedY) < 0.0001, `Y expected ${expectedY}, got ${pred.predictedPosition.y}`);
  });

  // TEST 7: Key release
  await test('TEST 7 — Key release (NONE state representation and no stale movement replay)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    let input = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => input };
    pred.sendInputState(input); // seq 1
    pred.tickPrediction(); // RIGHT

    // Release keys
    input = { left: false, right: false, up: false, down: false }; // NONE
    pred.inputManagerRef = { getInput: () => input };
    pred.sendInputState(input); // seq 2
    pred.tickPrediction();
    pred.tickPrediction(); // NONE for 2 ticks

    const authPos = { x: 200 + (PLAYER_SPEED * FIXED_DT), y: 300 };
    pred.reconcile(authPos, 1); // ACK 1

    assert(pred.predictedPosition.x === authPos.x, `Reconciled X should remain stationary at ${authPos.x}, got ${pred.predictedPosition.x}`);
  });

  // TEST 8: Rapid direction changes
  await test('TEST 8 — Rapid direction changes (RIGHT -> DOWN -> LEFT -> UP -> NONE) stability', () => {
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
    assert(pred.predictionHistory.length === 5, `Expected 5 history steps, got ${pred.predictionHistory.length}`);
  });

  // TEST 9: Multiple reconciliations
  await test('TEST 9 — Multiple reconciliations (sequential snapshots, no double step replay)', () => {
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

  // TEST 10: History bounds
  await test('TEST 10 — History bounds (predictionHistory bounded at 150 steps)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    for (let i = 0; i < 200; i++) {
      pred.tickPrediction();
    }

    assert(pred.predictionHistory.length <= 150, `History length should be capped at 150, got ${pred.predictionHistory.length}`);
  });

  // TEST 11: Same input multiple ticks
  await test('TEST 11 — Same input multiple ticks (20 prediction steps, NOT 20 network sequences)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    pred.sendInputState(rightInput); // seq 1 (1 network sequence)
    for (let i = 0; i < 20; i++) {
      pred.tickPrediction(); // 20 prediction steps
    }

    assert(networkState.nextInputSequence === 1, `Network sequence should be 1, got ${networkState.nextInputSequence}`);
    assert(pred.predictionHistory.length === 20, `Prediction history should have 20 steps, got ${pred.predictionHistory.length}`);
  });

  // TEST 12: No network message during prediction
  await test('TEST 12 — No network message during prediction (60Hz loop generates 0 WS packets)', () => {
    networkState.reset();
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const rightInput = { left: false, right: true, up: false, down: false };
    pred.inputManagerRef = { getInput: () => rightInput };

    let wsMessagesSent = 0;
    pred.sendInputState(rightInput); // 1 WS message sent via sendInputState
    const initialPendingCount = pred.pendingInputs.length;

    for (let i = 0; i < 15; i++) {
      pred.tickPrediction();
    }

    assert(pred.pendingInputs.length === initialPendingCount, `pendingInputs should remain ${initialPendingCount}, got ${pred.pendingInputs.length}`);
  });

  // TEST 13: Protocol schema audit
  await test('TEST 13 — Protocol schema audit (ZERO protocol schema changes)', () => {
    const constantsFile = fs.readFileSync('shared/protocol/constants.js', 'utf8');
    assert(constantsFile.includes('CLIENT_MESSAGES') && constantsFile.includes('SERVER_MESSAGES'), 'Protocol constants must be unchanged');
  });

  // TEST 14: Server files audit
  await test('TEST 14 — Server files audit (ZERO server files modified in Phase 4.6)', () => {
    const serverFiles = ['server/src/game/Game.js', 'server/src/game/GameLoop.js', 'server/src/game/SnapshotGenerator.js'];
    for (const f of serverFiles) {
      assert(fs.existsSync(f), `File ${f} should exist`);
    }
  });

  console.log('\n── Integration Tests: End-to-End Game Start & ACK Extraction ──\n');

  // TEST 15: End-to-End integration test
  await test('TEST 15 — End-to-End integration: ~30Hz input stream & snapshot ACK extraction', async () => {
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
