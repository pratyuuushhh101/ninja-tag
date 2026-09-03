import { ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, FIXED_DT } from '../../../shared/protocol/constants.js';
import { simulatePlayerMovement } from '../../../shared/game/movement.js';

export class Game {
  constructor() {
    this.tick = 0;
    this.players = new Map(); // playerId -> player object
    this.itPlayerId = null;
    this.arena = { width: ARENA_WIDTH, height: ARENA_HEIGHT };
    this.tagLocked = false; // prevents tag flickering
    this.matchDurationSeconds = 60;
    this.matchStartTime = null;
    this.matchEndTime = null;
    this.ended = false;
  }

  initialize(playerIds, durationSeconds = 60) {
    this.tick = 0;
    this.matchDurationSeconds = durationSeconds;
    this.matchStartTime = null;
    this.matchEndTime = null;
    this.ended = false;
    const ids = Array.from(playerIds);

    this.players.set(ids[0], {
      id: ids[0],
      x: 200,
      y: this.arena.height / 2,
      input: { up: false, down: false, left: false, right: false },
      inputQueue: [],
      lastReceivedInputSequence: 0,
      lastProcessedInputSequence: 0
    });

    this.players.set(ids[1], {
      id: ids[1],
      x: 800,
      y: this.arena.height / 2,
      input: { up: false, down: false, left: false, right: false },
      inputQueue: [],
      lastReceivedInputSequence: 0,
      lastProcessedInputSequence: 0
    });

    // Randomly assign IT
    this.itPlayerId = Math.random() < 0.5 ? ids[0] : ids[1];
  }

  startMatch() {
    this.matchStartTime = Date.now();
    this.matchEndTime = this.matchStartTime + (this.matchDurationSeconds * 1000);
  }

  setPlayerInput(playerId, sequence, input) {
    const player = this.players.get(playerId);
    if (!player) return;

    // Ignore stale or duplicate input sequence numbers
    if (sequence <= player.lastReceivedInputSequence) {
      return;
    }

    player.lastReceivedInputSequence = sequence;

    // Queue input command in sequence order
    player.inputQueue.push({ sequence, input });
    player.inputQueue.sort((a, b) => a.sequence - b.sequence);

    // Defensive queue cap to prevent memory growth from malformed clients
    if (player.inputQueue.length > 100) {
      player.inputQueue.shift();
    }
  }

  update(fixedDt = FIXED_DT) {
    this.tick += 1;

    // Process at most 1 input command per player per 60Hz physics tick
    for (const [, player] of this.players) {
      if (player.inputQueue.length > 0) {
        const cmd = player.inputQueue.shift();
        player.input = cmd.input;
        player.lastProcessedInputSequence = cmd.sequence;
      }
      // Note: If inputQueue is empty, player.input remains unchanged (reused)
      // and lastProcessedInputSequence remains at its current value until new commands are processed.

      const newPos = simulatePlayerMovement({ x: player.x, y: player.y }, player.input, fixedDt);
      player.x = newPos.x;
      player.y = newPos.y;
    }

    // Check tag collision
    this.checkTagCollision();

    // Check timer expiration
    if (this.matchEndTime && !this.ended && Date.now() >= this.matchEndTime) {
      this.ended = true;
      const playerIds = Array.from(this.players.keys());
      const loserId = this.itPlayerId;
      const winnerId = playerIds.find(id => id !== loserId) || null;
      return {
        expired: true,
        winnerId,
        loserId
      };
    }

    return null;
  }

  checkTagCollision() {
    const playerArray = Array.from(this.players.values());
    if (playerArray.length !== 2) return;

    const [p1, p2] = playerArray;
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const touching = distance <= PLAYER_RADIUS * 2;

    if (touching && !this.tagLocked) {
      // Transfer IT
      const itPlayer = this.itPlayerId === p1.id ? p1 : p2;
      const otherPlayer = this.itPlayerId === p1.id ? p2 : p1;
      this.itPlayerId = otherPlayer.id;
      this.tagLocked = true;
      console.log(`[NinjaTag] Tag! ${itPlayer.id} tagged ${otherPlayer.id} at tick ${this.tick}`);
    } else if (!touching && this.tagLocked) {
      // Players separated, unlock tag
      this.tagLocked = false;
    }
  }

  getState() {
    const players = [];
    for (const [, player] of this.players) {
      players.push({
        id: player.id,
        x: player.x,
        y: player.y,
        lastProcessedInput: player.lastProcessedInputSequence
      });
    }
    return { tick: this.tick, players, itPlayerId: this.itPlayerId };
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }
}
