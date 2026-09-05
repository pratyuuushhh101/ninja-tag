import { ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, FIXED_DT } from '../../../shared/protocol/constants.js';
import { simulatePlayerMovement } from '../../../shared/game/movement.js';

export class Game {
  constructor() {
    this.tick = 0;
    this.players = new Map(); // playerId -> player object
    this.itPlayerId = null;
    this.arena = { width: ARENA_WIDTH, height: ARENA_HEIGHT };
    this.tagCooldownTicks = 0; // Cooldown timer (in 60Hz ticks) to allow infinite back-and-forth tagging
    this.matchDurationSeconds = 60;
    this.matchStartTime = null;
    this.matchEndTime = null;
    this.ended = false;
  }

  initialize(playerIds, durationSeconds = 60, botPlayerId = null) {
    this.tick = 0;
    this.tagCooldownTicks = 0;
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
      lastProcessedInputSequence: 0,
      isBot: ids[0] === botPlayerId
    });

    this.players.set(ids[1], {
      id: ids[1],
      x: 800,
      y: this.arena.height / 2,
      input: { up: false, down: false, left: false, right: false },
      inputQueue: [],
      lastReceivedInputSequence: 0,
      lastProcessedInputSequence: 0,
      isBot: ids[1] === botPlayerId
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

    // Decrement tag cooldown timer (0.5s immunity window after tag)
    if (this.tagCooldownTicks > 0) {
      this.tagCooldownTicks -= 1;
    }

    // Process at most 1 input command per player per 60Hz physics tick
    for (const [, player] of this.players) {
      if (player.isBot) {
        const otherPlayer = Array.from(this.players.values()).find(p => p.id !== player.id);
        if (otherPlayer) {
          const isBotIt = this.itPlayerId === player.id;

          // 1. Base direction: chase or flee (normalized to unit vector)
          let baseDx = otherPlayer.x - player.x;
          let baseDy = otherPlayer.y - player.y;
          if (!isBotIt) { baseDx = -baseDx; baseDy = -baseDy; }
          const baseMag = Math.sqrt(baseDx * baseDx + baseDy * baseDy);
          if (baseMag > 0) { baseDx /= baseMag; baseDy /= baseMag; }

          // 2. Wall repulsion forces (scale with proximity to boundary)
          //    Actual boundaries are at PLAYER_RADIUS and (dimension - PLAYER_RADIUS)
          const WALL_ZONE = 120; // pixels from boundary edge where repulsion activates
          const REPULSION_STRENGTH = 5; // max force magnitude (vs base magnitude of 1)

          const clearLeft   = player.x - PLAYER_RADIUS;
          const clearRight  = (this.arena.width - PLAYER_RADIUS) - player.x;
          const clearTop    = player.y - PLAYER_RADIUS;
          const clearBottom = (this.arena.height - PLAYER_RADIUS) - player.y;

          let repX = 0;
          let repY = 0;

          if (clearLeft < WALL_ZONE) {
            repX += REPULSION_STRENGTH * (1 - clearLeft / WALL_ZONE);  // push RIGHT
          }
          if (clearRight < WALL_ZONE) {
            repX -= REPULSION_STRENGTH * (1 - clearRight / WALL_ZONE); // push LEFT
          }
          if (clearTop < WALL_ZONE) {
            repY += REPULSION_STRENGTH * (1 - clearTop / WALL_ZONE);   // push DOWN
          }
          if (clearBottom < WALL_ZONE) {
            repY -= REPULSION_STRENGTH * (1 - clearBottom / WALL_ZONE); // push UP
          }

          // 3. Combine: base direction + wall repulsion
          const finalDx = baseDx + repX;
          const finalDy = baseDy + repY;

          player.input = {
            up:    finalDy < -0.1,
            down:  finalDy > 0.1,
            left:  finalDx < -0.1,
            right: finalDx > 0.1
          };
        }
      } else if (player.inputQueue.length > 0) {
        const cmd = player.inputQueue.shift();
        player.input = cmd.input;
        player.lastProcessedInputSequence = cmd.sequence;
      }

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
    const TAG_DISTANCE = PLAYER_RADIUS * 2 + 8; // 48px: 40px base + 8px margin so tag triggers as soon as they visually touch
    const touching = distance <= TAG_DISTANCE;

    if (touching && this.tagCooldownTicks === 0) {
      // Transfer IT with 90-tick (1.5s) immunity cooldown
      const itPlayer = this.itPlayerId === p1.id ? p1 : p2;
      const otherPlayer = this.itPlayerId === p1.id ? p2 : p1;
      this.itPlayerId = otherPlayer.id;
      this.tagCooldownTicks = 90; // 1.5 seconds at 60Hz
      console.log(`[NinjaTag] Tag! ${itPlayer.id} tagged ${otherPlayer.id} at tick ${this.tick}`);

      // Push players apart (80px each along the connecting axis) to prevent instant re-tag
      const SEPARATION = 80;
      if (distance > 0.01) {
        const nx = dx / distance;
        const ny = dy / distance;
        p1.x += nx * SEPARATION;
        p1.y += ny * SEPARATION;
        p2.x -= nx * SEPARATION;
        p2.y -= ny * SEPARATION;
      } else {
        // Players exactly overlapping — push horizontally
        p1.x += SEPARATION;
        p2.x -= SEPARATION;
      }

      // Clamp both to arena bounds
      p1.x = Math.max(PLAYER_RADIUS, Math.min(this.arena.width - PLAYER_RADIUS, p1.x));
      p1.y = Math.max(PLAYER_RADIUS, Math.min(this.arena.height - PLAYER_RADIUS, p1.y));
      p2.x = Math.max(PLAYER_RADIUS, Math.min(this.arena.width - PLAYER_RADIUS, p2.x));
      p2.y = Math.max(PLAYER_RADIUS, Math.min(this.arena.height - PLAYER_RADIUS, p2.y));
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
