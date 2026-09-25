// Input validation helpers. All return { ok: boolean, value?, error? }.

const {
  MAX_MESSAGE_LENGTH,
  MAX_USERNAME_LENGTH,
  MAX_ROOM_LENGTH,
} = require('./constants');

function validateUsername(username) {
  if (typeof username !== 'string') {
    return { ok: false, error: 'Username must be a string.' };
  }
  const value = username.trim();
  if (value.length === 0) {
    return { ok: false, error: 'Username cannot be empty.' };
  }
  if (value.length > MAX_USERNAME_LENGTH) {
    return { ok: false, error: `Username exceeds ${MAX_USERNAME_LENGTH} characters.` };
  }
  return { ok: true, value };
}

function validateRoom(room) {
  if (typeof room !== 'string') {
    return { ok: false, error: 'Room must be a string.' };
  }
  const value = room.trim();
  if (value.length === 0) {
    return { ok: false, error: 'Room name cannot be empty.' };
  }
  if (value.length > MAX_ROOM_LENGTH) {
    return { ok: false, error: `Room name exceeds ${MAX_ROOM_LENGTH} characters.` };
  }
  return { ok: true, value };
}

function validateMessage(message) {
  if (typeof message !== 'string') {
    return { ok: false, error: 'Message must be a string.' };
  }
  const value = message.trim();
  if (value.length === 0) {
    return { ok: false, error: 'Message cannot be empty.' };
  }
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` };
  }
  return { ok: true, value };
}

module.exports = { validateUsername, validateRoom, validateMessage };
