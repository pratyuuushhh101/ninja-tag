import { ARENA_WIDTH, ARENA_HEIGHT, PLAYER_RADIUS, PLAYER_SPEED, FIXED_DT } from '../protocol/constants.js';

/**
 * Shared deterministic movement simulation function used by both server
 * physics ticks and client-side prediction / reconciliation replay.
 *
 * @param {Object} position - Current { x, y } position
 * @param {Object} input - Input state { up, down, left, right }
 * @param {number} fixedDt - Simulation timestep delta in seconds
 * @returns {Object} New { x, y } position
 */
export function simulatePlayerMovement(position, input, fixedDt = FIXED_DT) {
  if (!position || !input) return { x: position?.x || 0, y: position?.y || 0 };

  let dx = 0;
  let dy = 0;

  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;

  // Normalize diagonal vectors
  if (dx !== 0 && dy !== 0) {
    const len = Math.sqrt(dx * dx + dy * dy);
    dx /= len;
    dy /= len;
  }

  let newX = position.x + dx * PLAYER_SPEED * fixedDt;
  let newY = position.y + dy * PLAYER_SPEED * fixedDt;

  // Clamp to rectangular arena boundaries
  newX = Math.max(PLAYER_RADIUS, Math.min(ARENA_WIDTH - PLAYER_RADIUS, newX));
  newY = Math.max(PLAYER_RADIUS, Math.min(ARENA_HEIGHT - PLAYER_RADIUS, newY));

  return { x: newX, y: newY };
}
