// In-memory user registry.
//
// connectedUsers: Map<socketId, { username, avatar, currentRoom }>
// Volatile — cleared on restart.

const connectedUsers = new Map();

/**
 * Register / update a connected user.
 */
function addUser(socketId, { username, avatar, currentRoom = null }) {
  connectedUsers.set(socketId, { username, avatar, currentRoom });
  return connectedUsers.get(socketId);
}

function getUser(socketId) {
  return connectedUsers.get(socketId);
}

function removeUser(socketId) {
  const user = connectedUsers.get(socketId);
  connectedUsers.delete(socketId);
  return user;
}

function setUserRoom(socketId, room) {
  const user = connectedUsers.get(socketId);
  if (user) {
    user.currentRoom = room;
  }
  return user;
}

/**
 * Is a username already taken in a given room (case-insensitive)?
 * Optionally ignore a specific socket (e.g. the requester).
 */
function isUsernameTakenInRoom(username, room, ignoreSocketId = null) {
  const lower = username.toLowerCase();
  for (const [socketId, user] of connectedUsers.entries()) {
    if (socketId === ignoreSocketId) continue;
    if (user.currentRoom === room && user.username.toLowerCase() === lower) {
      return true;
    }
  }
  return false;
}

/**
 * List users currently in a room: [{ socketId, username, avatar }]
 */
function getUsersInRoom(room) {
  const list = [];
  for (const [socketId, user] of connectedUsers.entries()) {
    if (user.currentRoom === room) {
      list.push({ socketId, username: user.username, avatar: user.avatar });
    }
  }
  return list;
}

module.exports = {
  connectedUsers,
  addUser,
  getUser,
  removeUser,
  setUserRoom,
  isUsernameTakenInRoom,
  getUsersInRoom,
};
