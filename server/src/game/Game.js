import { ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, FIXED_DT } from '../../../shared/protocol/constants.js';
import { simulatePlayerMovement } from '../../../shared/game/movement.js';

export class Game {
  constructor() {
    this.tick = 0;
    this.players = new Map(); // playerId -> player object
    this.itPlayerId = null;
    this.arena = { width: ARENA_WIDTH, height: ARENA_HEIGHT };
    this.tagLocked = false; // prevents tag flickering
  }

  initialize(playerIds) {
    this.tick = 0;
    const ids = Array.from(playerIds);

    this.players.set(ids[0], {
      id: ids[0],
      x: 200,
      y: this.arena.height / 2,
      input: { up: false, down: false, left: false, right: false },
      currentInputSequence: 0,
      lastReceivedInputSequence: 0,
      lastProcessedInputSequence: 0
    });

    this.players.set(ids[1], {
      id: ids[1],
      x: 800,
      y: this.arena.height / 2,
      input: { up: false, down: false, left: false, right: false },
      currentInputSequence: 0,
      lastReceivedInputSequence: 0,
      lastProcessedInputSequence: 0
    });

    // Randomly assign IT
    this.itPlayerId = Math.random() < 0.5 ? ids[0] : ids[1];
  }

  setPlayerInput(playerId, sequence, input) {
    const player = this.players.get(playerId);
    if (!player) return;

    // Ignore stale or duplicate input sequence numbers
    if (sequence <= player.lastReceivedInputSequence) {
      return;
    }

    player.lastReceivedInputSequence = sequence;
    player.currentInputSequence = sequence;
    player.input = input;
    // NOTE: lastProcessedInputSequence is NOT updated here on receipt!
  }

  update(fixedDt = FIXED_DT) {
    this.tick += 1;

    // Process inputs and update movement for each player using shared movement logic
    for (const [, player] of this.players) {
      const newPos = simulatePlayerMovement({ x: player.x, y: player.y }, player.input, fixedDt);
      player.x = newPos.x;
      player.y = newPos.y;
      player.lastProcessedInputSequence = player.currentInputSequence;
    }

    // Check tag collision
    this.checkTagCollision();
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
