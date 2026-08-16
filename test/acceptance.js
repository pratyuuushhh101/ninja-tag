/**
 * Ninja Tag Phase 4.4 — Acceptance Test Script
 *
 * Tests Phase 4.4 Correct Input-State / Simulation Semantics:
 * - TEST 1: Multiple inputs before one server tick (latest input state applied, lastProcessedInputSequence = 103)
 * - TEST 2: Same input across multiple server ticks (input-state version remains active across ticks)
 * - TEST 3: Stale input protection (sequence <= lastReceivedInputSequence is ignored)
 * - TEST 4: ACK does NOT mean received (lastProcessedInputSequence updates only on physics tick)
 * - TEST 5: ~30Hz input stream / 60Hz server simulation semantics
 * - TEST 6: 60Hz client local prediction independence
 * - TEST 7: Key release produces NONE input-state update
 * - TEST 8: Rapid input state changes apply latest state on simulation tick
 * - TEST 9: Reconciliation does NOT treat pending inputs as 1 tick (replays recorded tick counts)
 * - TEST 10: Verification of complete removal of Phase 4.2/4.3 localTick and tickHistory artifacts
 * - TEST 11: End-to-End integration test
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
  console.log('\n🥷 Ninja Tag Phase 4.4 — Acceptance Tests (Correct Input-State / Simulation Semantics)\n');
  console.log('── Server & Client Unit Tests ──\n');

  // TEST 1: Multiple inputs before one server tick
  await test('TEST 1 — Multiple inputs before one server tick (latest input state applied, ACK = 103)', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    // Send 101, 102, 103 before simulation tick
    game.setPlayerInput('player-1', 101, { left: false, right: true, up: false, down: false });
    game.setPlayerInput('player-1', 102, { left: false, right: true, up: false, down: false });
    game.setPlayerInput('player-1', 103, { left: true, right: false, up: false, down: false }); // LEFT

    const player = game.players.get('player-1');
    assert(player.input.left === true, 'Current input should be LEFT');
    assert(player.currentInputSequence === 103, 'Current input sequence should be 103');

    // Run 1 simulation tick
    game.update(FIXED_DT);

    // Player should move LEFT (x = 200 - 250 * FIXED_DT = 195.8333)
    const expectedX = 200 - (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(player.x - expectedX) < 0.0001, `X should be ${expectedX}, got ${player.x}`);
    assert(player.lastProcessedInputSequence === 103, `lastProcessedInputSequence should be 103, got ${player.lastProcessedInputSequence}`);
  });

  // TEST 2: Same input across multiple server ticks
  await test('TEST 2 — Same input version used across multiple server ticks', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    game.setPlayerInput('player-1', 200, { left: false, right: true, up: false, down: false });

    // Run 5 server ticks without new input updates
    for (let i = 0; i < 5; i++) {
      game.update(FIXED_DT);
    }

    const player = game.players.get('player-1');
    const expectedX = 200 + 5 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(player.x - expectedX) < 0.0001, `X after 5 ticks expected ${expectedX}, got ${player.x}`);
    assert(player.currentInputSequence === 200, `currentInputSequence should remain 200, got ${player.currentInputSequence}`);
    assert(player.lastProcessedInputSequence === 200, `lastProcessedInputSequence should remain 200, got ${player.lastProcessedInputSequence}`);
  });

  // TEST 3: Stale input protection
  await test('TEST 3 — Stale input protection (sequence <= lastReceived is ignored)', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    game.setPlayerInput('player-1', 100, { left: false, right: true, up: false, down: false });
    game.setPlayerInput('player-1', 99, { left: true, right: false, up: false, down: false });

    const player = game.players.get('player-1');
    assert(player.input.right === true && player.currentInputSequence === 100, 'Stale sequence 99 must be ignored');
  });

  // TEST 4: ACK does NOT mean received
  await test('TEST 4 — Receiving input does NOT advance lastProcessedInputSequence before simulation tick', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    const player = game.players.get('player-1');
    assert(player.lastProcessedInputSequence === 0, 'Initial lastProcessedInputSequence should be 0');

    game.setPlayerInput('player-1', 105, { left: false, right: true, up: false, down: false });

    assert(player.lastReceivedInputSequence === 105, 'lastReceivedInputSequence should be 105');
    assert(player.lastProcessedInputSequence === 0, 'lastProcessedInputSequence MUST remain 0 before simulation tick!');

    // Execute simulation tick
    game.update(FIXED_DT);
    assert(player.lastProcessedInputSequence === 105, 'lastProcessedInputSequence should become 105 after simulation tick');
  });

  // TEST 5: ~30Hz input stream & 60Hz server simulation semantics
  await test('TEST 5 — ~30Hz input stream & 60Hz server simulation semantics', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    game.setPlayerInput('player-1', 1, { left: false, right: true, up: false, down: false });
    game.update(FIXED_DT); // tick 1
    game.update(FIXED_DT); // tick 2

    const player = game.players.get('player-1');
    assert(game.tick === 2, `Server tick should be 2, got ${game.tick}`);
    assert(player.lastProcessedInputSequence === 1, `lastProcessedInputSequence should be 1`);
  });

  // TEST 6: 60Hz client local prediction independence
  await test('TEST 6 — 60Hz client local prediction runs independently', async () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });
    pred.inputManagerRef = { getInput: () => ({ left: false, right: true, up: false, down: false }) };

    pred.start(pred.inputManagerRef);
    await new Promise(r => setTimeout(r, 500));
    pred.stop();

    const expectedDist = pred.predictedPosition.x - 200;
    assert(expectedDist > 100, `Prediction should advance position over 500ms, moved ${expectedDist.toFixed(1)}px`);
  });

  // TEST 7: Key release produces NONE input-state update
  await test('TEST 7 — Key release produces NONE input-state update', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    game.setPlayerInput('player-1', 10, { left: false, right: true, up: false, down: false });
    game.update(FIXED_DT);

    game.setPlayerInput('player-1', 11, { left: false, right: false, up: false, down: false }); // NONE
    game.update(FIXED_DT);

    const player = game.players.get('player-1');
    assert(player.input.right === false && player.currentInputSequence === 11, 'Server should update to NONE input on seq 11');
  });

  // TEST 8: Rapid input state changes apply latest state on simulation tick
  await test('TEST 8 — Rapid input state changes apply latest state on simulation tick', () => {
    const game = new Game();
    game.initialize(['player-1', 'player-2']);

    game.setPlayerInput('player-1', 1, { left: false, right: true, up: false, down: false });
    game.setPlayerInput('player-1', 2, { left: false, right: false, up: false, down: true });
    game.setPlayerInput('player-1', 3, { left: true, right: false, up: false, down: false }); // LEFT

    game.update(FIXED_DT);
    const player = game.players.get('player-1');
    assert(player.input.left === true, 'Latest input (LEFT) must be active for simulation tick');
    assert(player.lastProcessedInputSequence === 3, 'ACK should be 3');
  });

  // TEST 9: Reconciliation does NOT treat pending inputs as 1 tick
  await test('TEST 9 — Reconciliation replays exact recorded tick counts (ticks) per input version', () => {
    const pred = new Prediction();
    pred.init({ x: 200, y: 300 });

    pred.sendInputState({ left: false, right: true, up: false, down: false }); // seq 1
    // Execute 4 prediction ticks under seq 1
    for (let i = 0; i < 4; i++) {
      pred.tickPrediction();
    }
    assert(pred.pendingInputs[0].ticks === 4, `seq 1 ticks should be 4, got ${pred.pendingInputs[0].ticks}`);

    // Reconcile from authPos = (200, 300), ACK = 0
    pred.reconcile({ x: 200, y: 300 }, 0);

    const expectedX = 200 + 4 * (PLAYER_SPEED * FIXED_DT);
    assert(Math.abs(pred.predictedPosition.x - expectedX) < 0.0001, `Reconciled position should be ${expectedX}, got ${pred.predictedPosition.x}`);
  });

  // TEST 10: Verification of complete removal of localTick and tickHistory
  await test('TEST 10 — Verification of complete removal of Phase 4.2 localTick and tickHistory artifacts', () => {
    const pred = new Prediction();
    assert(pred.localTick === undefined, 'localTick must not exist on Prediction instance');
    assert(pred.tickHistory === undefined, 'tickHistory must not exist on Prediction instance');
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
