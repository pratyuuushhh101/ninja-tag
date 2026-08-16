/**
 * Ninja Tag — Shared Protocol Constants
 *
 * Single source of truth for message types, room states, error codes,
 * and room-code configuration. Used by both client and server.
 */

// ── Client → Server message types ──────────────────────────────────────
export const CLIENT_MESSAGES = Object.freeze({
  CREATE_ROOM: 'CREATE_ROOM',
  JOIN_ROOM: 'JOIN_ROOM',
});

// ── Server → Client message types ──────────────────────────────────────
export const SERVER_MESSAGES = Object.freeze({
  ROOM_CREATED: 'ROOM_CREATED',
  ROOM_JOINED: 'ROOM_JOINED',
  ROOM_STATE: 'ROOM_STATE',
  ERROR: 'ERROR',
});

// ── Room states ────────────────────────────────────────────────────────
export const ROOM_STATES = Object.freeze({
  WAITING_FOR_PLAYER: 'WAITING_FOR_PLAYER',
  FULL: 'FULL',
});

// ── Error codes ────────────────────────────────────────────────────────
export const ERROR_CODES = Object.freeze({
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  INVALID_STATE: 'INVALID_STATE',
});

// ── Room code configuration ────────────────────────────────────────────
// Excludes visually ambiguous characters: 0, O, 1, I
export const ROOM_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 5;

// ── Room capacity ──────────────────────────────────────────────────────
export const MAX_PLAYERS_PER_ROOM = 2;
