import { SERVER_MESSAGES } from '../../../shared/protocol/constants.js';

/**
 * Creates an authoritative network snapshot from internal Game simulation state.
 * Isolates protocol message formatting from game simulation logic.
 *
 * @param {Game} game - The active game simulation instance
 * @returns {Object} Network snapshot message payload
 */
export function createSnapshot(game) {
  const players = [];
  for (const [, player] of game.players) {
    players.push({
      id: player.id,
      x: player.x,
      y: player.y,
      lastProcessedInput: player.lastProcessedInputSequence
    });
  }

  return {
    type: SERVER_MESSAGES.SNAPSHOT,
    tick: game.tick,
    players,
    itPlayerId: game.itPlayerId,
    serverTime: Date.now()
  };
}
