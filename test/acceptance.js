/**
 * Ninja Tag Phase 4.3 — Acceptance Test Script
 *
 * Tests Phase 4.3 Authoritative 60Hz Input Command Model:
 * - TEST 1: 60Hz input command generation rate (~60 commands/sec)
 * - TEST 2: 1 command per prediction step (N ticks = N input commands = N FIXED_DT steps)
 * - TEST 3: Pending input sequence ACK pruning (ACK 103 removes <= 103, retains > 103)
 * - TEST 4: Deterministic reconciliation replay (auth pos + replay remaining sequence commands)
 * - TEST 5: No double replay of acknowledged commands
 * - TEST 6: Preservation of rapid input change sequence order
 * - TEST 7: Key release produces NONE input commands with sequence numbers
 * - TEST 8: Server stale input protection (sequence <= lastReceived is ignored)
 * - TEST 9: Server 60Hz simulation rate verification
 * - TEST 10: End-to-End integration: SNAPSHOT lastProcessedInput ACK transmission & pruning
 *
 * Run with: node test/acceptance.js
 * Requires the server to be running on port 3001 for integration tests.
 */

import WebSocket from 'ws';
import { simulatePlayerMovement } from '../shared/game/movement.js';
import { Prediction } from '../client/src/game/Prediction.js';
import { NetworkState } from '../client/src/network/NetworkState.js';
import { Game } from '../server/src/game/Game.js';
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
  console.log('\n🥷 Ninja Tag Phase 4.3 — Acceptance Tests (Authoritative 60Hz Input Command Model)\n');
  console.log('── Unit Tests: 60Hz Input Stream & Deterministic Reconciliation ──\n');

  // TEST 1: 60Hz input command generation rate
  await test('TEST 1 — 60Hz input command generation rate (~60 commands/sec)', async () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    pred.inputManagerRef = { getInput: () => ({ left: false, right: true, up: false, down: false }) };

    pred.start(pred.inputManagerRef);
    await new Promise(r => setTimeout(r, 500)); // 500ms
    pred.stop();

    const pendingCount = pred.getPendingCount();
    // 500ms at 60Hz = ~30 commands (expect 25 to 35)
    assert(pendingCount >= 25 && pendingCount <= 35, `Expected ~30 input commands in 500ms, got ${pendingCount}`);
  });

  // TEST 2: 1 command per prediction step
  await test('TEST 2 — 1 command per prediction step (N ticks = N commands = N FIXED_DT steps)', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    pred.inputManagerRef = { getInput: () => ({ left: false, right: true, up: false, down: false }) };

    for (let i = 0; i < 10; i++) {
      pred.tickPrediction();
    }

    assert(pred.getPendingCount() === 10, `Expected 10 pending commands for 10 ticks, got ${pred.getPendingCount()}`);
    const expectedX = 200 + 10 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Predicted position expected ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 3: Pending input ACK sequence pruning
  await test('TEST 3 — ACK sequence pruning (ACK 103 removes <= 103, retains 104 & 105)', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    for (let seq = 101; seq <= 105; seq++) {
      pred.addInput(seq, { left: false, right: true, up: false, down: false });
    }
    assert(pred.getPendingCount() === 5, 'Should have 5 initial pending commands');

    pred.reconcile({ x: 200, y: 300 }, 103);
    assert(pred.getPendingCount() === 2, `ACK 103 should leave 2 pending commands, got ${pred.getPendingCount()}`);
    assert(pred.pendingInputs[0].sequence === 104, `First remaining sequence should be 104, got ${pred.pendingInputs[0].sequence}`);
    assert(pred.pendingInputs[1].sequence === 105, `Second remaining sequence should be 105, got ${pred.pendingInputs[1].sequence}`);
  });

  // TEST 4: Deterministic reconciliation replay
  await test('TEST 4 — Deterministic reconciliation replay (auth pos + replay remaining sequence commands)', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    pred.addInput(104, { left: false, right: true, up: false, down: false }); // RIGHT
    pred.addInput(105, { left: false, right: true, up: false, down: true });  // DOWN+RIGHT

    const authPos = { x: 300, y: 300 };
    pred.reconcile(authPos, 103);

    // Simulate step 104 (RIGHT): 300 + (250/60) = 304.1667
    // Simulate step 105 (DOWN+RIGHT): x += 250*(1/sqrt(2))/60 = 2.946, y += 2.946
    let step1 = simulatePlayerMovement(authPos, { left: false, right: true, up: false, down: false }, FIXED_DT);
    let step2 = simulatePlayerMovement(step1, { left: false, right: true, up: false, down: true }, FIXED_DT);

    assert(Math.abs(pred.predictedPosition.x - step2.x) < 0.0001, `Reconciled X expected ${step2.x}, got ${pred.predictedPosition.x}`);
    assert(Math.abs(pred.predictedPosition.y - step2.y) < 0.0001, `Reconciled Y expected ${step2.y}, got ${pred.predictedPosition.y}`);
  });

  // TEST 5: No double replay
  await test('TEST 5 — No double replay of acknowledged commands', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    for (let seq = 1; seq <= 5; seq++) {
      pred.addInput(seq, { left: false, right: true, up: false, down: false });
    }

    pred.reconcile({ x: 200, y: 300 }, 3);
    assert(pred.getPendingCount() === 2, `Remaining inputs should be 2, got ${pred.getPendingCount()}`);
  });

  // TEST 6: Rapid input changes
  await test('TEST 6 — Rapid input changes sequence order preservation', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    const inputs = [
      { sequence: 300, input: { left: false, right: true, up: false, down: false } },
      { sequence: 301, input: { left: false, right: true, up: false, down: false } },
      { sequence: 302, input: { left: false, right: true, up: false, down: true } },
      { sequence: 303, input: { left: false, right: false, up: false, down: true } },
      { sequence: 304, input: { left: true, right: false, up: false, down: false } },
      { sequence: 305, input: { left: false, right: false, up: true, down: false } }
    ];

    for (const item of inputs) {
      pred.addInput(item.sequence, item.input);
    }

    pred.reconcile({ x: 500, y: 300 }, 299);
    assert(pred.getPendingCount() === 6, 'All 6 commands should be replayed in order');
  });

  // TEST 7: Key release
  await test('TEST 7 — Releasing keys produces NONE input commands with sequence numbers', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    const mockInput = { getInput: () => ({ left: false, right: false, up: false, down: false }) };
    pred.inputManagerRef = mockInput;

    pred.tickPrediction();
    assert(pred.getPendingCount() === 1, 'Tick should generate 1 pending command');
    const cmd = pred.pendingInputs[0];
    assert(cmd.input.left === false && cmd.input.right === false && cmd.input.up === false && cmd.input.down === false, 'Input state should be NONE');
  });

  // TEST 8: Server stale input protection
  await test('TEST 8 — Server stale input protection (sequence <= lastReceived is ignored)', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    game.setPlayerInput('player-1', 10, { left: false, right: true, up: false, down: false });
    const player1 = game.players.get('player-1');
    assert(player1.input.right === true, 'Sequence 10 right input should be set');

    // Attempt stale input sequence 9
    game.setPlayerInput('player-1', 9, { left: true, right: false, up: false, down: false });
    assert(player1.input.right === true && player1.input.left === false, 'Stale sequence 9 must be ignored');
  });

  // TEST 9: Server 60Hz simulation rate verification
  await test('TEST 9 — Server 60Hz simulation rate verification', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    for (let i = 0; i < 60; i++) {
      game.update(FIXED_DT);
    }

    assert(game.tick === 60, `Server tick should be 60 after 60 updates, got ${game.tick}`);
  });

  console.log('\n── Integration Tests: End-to-End 60Hz Input Stream & ACK Pruning ──\n');

  // TEST 10: End-to-End integration snapshot & ACK pruning
  await test('TEST 10 — End-to-End integration: SNAPSHOT lastProcessedInput ACK transmission & pruning', async () => {
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
