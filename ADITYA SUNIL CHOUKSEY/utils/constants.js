// Shared constants for the chat engine.

// Maximum number of messages retained per room in memory.
const MAX_HISTORY = 50;

// Default rooms every server starts with.
const DEFAULT_ROOMS = ['#general', '#developers', '#random'];

// Validation limits.
const MAX_MESSAGE_LENGTH = 2000;
const MAX_USERNAME_LENGTH = 32;
const MAX_ROOM_LENGTH = 40;

// Server-side typing auto-stop timeout (ms).
const TYPING_TIMEOUT_MS = 3000;

module.exports = {
  MAX_HISTORY,
  DEFAULT_ROOMS,
  MAX_MESSAGE_LENGTH,
  MAX_USERNAME_LENGTH,
  MAX_ROOM_LENGTH,
  TYPING_TIMEOUT_MS,
};
