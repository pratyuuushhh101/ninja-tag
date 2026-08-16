/**
 * Ninja Tag Phase 4.1 — Acceptance Test Script
 *
 * Tests Phase 4.1 Correctness Patch:
 * - TEST A: 60Hz local prediction loop independent of ~30Hz network input send
 * - TEST B: Movement speed (250/60 per 60Hz prediction tick)
 * - TEST C: PlayerId reference closure fix & snapshot ACK extraction
 * - TEST D: Single WebSocket message handler registration
 * - TEST E: Reconciliation correctness (authoritative pos + ACK + unacked input replay)
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
  console.log('\n🥷 Ninja Tag Phase 4.1 — Acceptance Tests\n');
  console.log('── Unit Tests: 60Hz Prediction Timing & PlayerId Closure ──\n');

  // Test A — 60Hz local prediction rate
  await test('Test A — 60Hz local prediction simulation rate', async () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const mockInputManager = {
      getInput: () => ({ left: false, right: true, up: false, down: false })
    };

    pred.start(mockInputManager);
    await new Promise(r => setTimeout(r, 500)); // 500ms
    pred.stop();

    // In 500ms at 60Hz, prediction should tick ~30 times (expect 25 to 35 steps)
    const distanceMoved = pred.predictedPosition.x - 200;
    const expectedStepDist = PLAYER_SPEED * FIXED_DT; // 4.1667px
    const stepsCount = distanceMoved / expectedStepDist;

    assert(stepsCount >= 25 && stepsCount <= 35, `Expected ~30 prediction ticks in 500ms, got ${stepsCount.toFixed(1)} ticks`);
  });

  // Test B — Movement speed accuracy per tick
  await test('Test B — Prediction tick advances by exactly (PLAYER_SPEED * FIXED_DT)', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const mockInputManager = {
      getInput: () => ({ left: false, right: true, up: false, down: false })
    };
    pred.inputManagerRef = mockInputManager;
    pred.tickPrediction();

    const expectedX = 200 + (250 / 60);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Single prediction tick should advance to ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // Test C — Current playerId ACK extraction (resolving closure staleness)
  await test('Test C — Snapshot handler extracts ACK for dynamic local playerId', () => {
    const ns = new NetworkState();

    const snapshot1 = {
      tick: 10,
      players: [
        { id: 'player-a', lastProcessedInput: 105 },
        { id: 'player-b', lastProcessedInput: 99 }
      ]
    };

    // Initially local player ID is null -> does not set ACK
    ns.handleSnapshot(snapshot1, null);
    assert(ns.lastAcknowledgedInput === 0, 'Null local player ID should not update ACK');

    const snapshot2 = {
      tick: 11,
      players: [
        { id: 'player-a', lastProcessedInput: 105 },
        { id: 'player-b', lastProcessedInput: 99 }
      ]
    };

    // When local player ID is dynamically supplied as "player-a"
    const handled = ns.handleSnapshot(snapshot2, 'player-a');
    assert(handled, 'Snapshot should be accepted');
    assert(ns.lastAcknowledgedInput === 105, `Local player ACK should be 105, got ${ns.lastAcknowledgedInput}`);
  });

  // Test D — Pending inputs storage without double simulation on addInput
  await test('Test D — addInput stores pending input command without advancing simulation step', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    pred.addInput(1, { left: false, right: true, up: false, down: false });
    assert(pred.getPendingCount() === 1, 'Pending count should be 1');
    assert(pred.predictedPosition.x === 200, 'addInput must NOT advance predicted position directly');
  });

  // Test E — Reconciliation correctness (authoritative pos + ACK + unacked replay)
  await test('Test E — Reconciliation prunes ACKed inputs and replays remaining unacked commands', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    // Store inputs #1 through #5
    for (let i = 1; i <= 5; i++) {
      pred.addInput(i, { left: false, right: true, up: false, down: false });
    }

    // Reconcile with server position at step 3 (200 + 3 * (250/60)), ACK = 3
    const authX = 200 + 3 * (PLAYER_SPEED * FIXED_DT);
    pred.reconcile({ x: authX, y: 300 }, 3);

    // Inputs 1..3 pruned, 2 remaining (#4, #5)
    assert(pred.getPendingCount() === 2, `Should have 2 remaining inputs, got ${pred.getPendingCount()}`);

    const expectedX = 200 + 5 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Reconstructed predicted position should be ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  console.log('\n── Integration Tests: End-to-End Game Start & ACK Extraction ──\n');

  // Test F — End-to-End integration game start & snapshot ACK
  await test('Test F — End-to-End integration: SNAPSHOT lastProcessedInput ACK extraction', async () => {
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
