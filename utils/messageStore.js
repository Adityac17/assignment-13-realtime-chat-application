// In-memory message history store.
//
// roomHistories: { [roomName: string]: Message[] }
// Each room keeps at most MAX_HISTORY (50) messages. Oldest messages are
// trimmed off the front once the cap is exceeded. This store is intentionally
// volatile — all history is lost when the process restarts (see README).

const { MAX_HISTORY, DEFAULT_ROOMS } = require('./constants');

// The backing object. Seeded with the default rooms so getHistory() on a
// known room always returns an array.
const roomHistories = {};
DEFAULT_ROOMS.forEach((room) => {
  roomHistories[room] = [];
});

/**
 * Ensure a room bucket exists.
 * @param {string} room
 */
function ensureRoom(room) {
  if (!Array.isArray(roomHistories[room])) {
    roomHistories[room] = [];
  }
}

/**
 * Append a message to a room's history and trim to MAX_HISTORY.
 * @param {string} room
 * @param {object} message
 * @returns {object} the stored message
 */
function addMessageToHistory(room, message) {
  ensureRoom(room);
  roomHistories[room].push(message);
  // Trim from the front so only the newest MAX_HISTORY remain.
  if (roomHistories[room].length > MAX_HISTORY) {
    roomHistories[room] = roomHistories[room].slice(-MAX_HISTORY);
  }
  return message;
}

/**
 * Return the last MAX_HISTORY messages for a room (a copy).
 * @param {string} room
 * @returns {object[]}
 */
function getHistory(room) {
  ensureRoom(room);
  return roomHistories[room].slice(-MAX_HISTORY);
}

/**
 * Remove all history for a room (used mainly in tests).
 * @param {string} room
 */
function clearHistory(room) {
  if (room === undefined) {
    Object.keys(roomHistories).forEach((r) => {
      roomHistories[r] = [];
    });
  } else {
    roomHistories[room] = [];
  }
}

/**
 * List rooms that currently have a history bucket.
 * @returns {string[]}
 */
function listRooms() {
  return Object.keys(roomHistories);
}

module.exports = {
  addMessageToHistory,
  getHistory,
  clearHistory,
  listRooms,
  roomHistories,
  MAX_HISTORY,
};
