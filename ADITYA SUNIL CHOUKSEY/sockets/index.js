// Socket.io event wiring for the real-time chat engine.

const crypto = require('crypto');
const { addMessageToHistory, getHistory } = require('../utils/messageStore');
const {
  addUser,
  getUser,
  removeUser,
  setUserRoom,
  isUsernameTakenInRoom,
  getUsersInRoom,
} = require('../utils/userStore');
const {
  validateUsername,
  validateRoom,
  validateMessage,
} = require('../utils/validators');
const { TYPING_TIMEOUT_MS } = require('../utils/constants');

// Typing auto-stop timers, keyed by `${socketId}::${room}`.
const typingTimers = new Map();

function typingKey(socketId, room) {
  return `${socketId}::${room}`;
}

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Emit the current user list for a room to everyone in that room.
 */
function broadcastUserList(io, room) {
  io.to(room).emit('room:userlist', {
    room,
    users: getUsersInRoom(room),
  });
}

/**
 * Tell a room that a user stopped typing, and clear their timer.
 */
function clearTyping(io, socketId, room, username) {
  const key = typingKey(socketId, room);
  const timer = typingTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    typingTimers.delete(key);
  }
  if (room && username) {
    // EXCEPT sender.
    io.to(room).except(socketId).emit('typing:update', {
      room,
      username,
      isTyping: false,
    });
  }
}

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // ---- USER LOGIN ----
    socket.on('user:login', (payload = {}, ack) => {
      const nameCheck = validateUsername(payload.username);
      if (!nameCheck.ok) {
        socket.emit('error:message', { scope: 'user:login', error: nameCheck.error });
        if (typeof ack === 'function') ack({ ok: false, error: nameCheck.error });
        return;
      }
      const avatar = typeof payload.avatar === 'string' && payload.avatar.trim()
        ? payload.avatar.trim()
        : defaultAvatar(nameCheck.value);

      addUser(socket.id, { username: nameCheck.value, avatar, currentRoom: null });
      if (typeof ack === 'function') {
        ack({ ok: true, socketId: socket.id, username: nameCheck.value, avatar });
      }
      socket.emit('user:login:ok', { socketId: socket.id, username: nameCheck.value, avatar });
    });

    // ---- ROOM JOIN ----
    socket.on('room:join', (payload = {}, ack) => {
      const user = getUser(socket.id);
      if (!user) {
        const error = 'You must log in before joining a room.';
        socket.emit('error:message', { scope: 'room:join', error });
        if (typeof ack === 'function') ack({ ok: false, error });
        return;
      }
      const roomCheck = validateRoom(payload.room);
      if (!roomCheck.ok) {
        socket.emit('error:message', { scope: 'room:join', error: roomCheck.error });
        if (typeof ack === 'function') ack({ ok: false, error: roomCheck.error });
        return;
      }
      const room = roomCheck.value;

      // Prevent duplicate usernames in the same room.
      if (isUsernameTakenInRoom(user.username, room, socket.id)) {
        const error = `Username "${user.username}" is already in use in ${room}.`;
        socket.emit('error:message', { scope: 'room:join', error });
        if (typeof ack === 'function') ack({ ok: false, error });
        return;
      }

      // Leave the previous active room (single active room model).
      const previousRoom = user.currentRoom;
      if (previousRoom && previousRoom !== room) {
        leaveRoom(io, socket, previousRoom);
      }

      socket.join(room);
      setUserRoom(socket.id, room);

      // Send history to the joiner only.
      socket.emit('room:history', { room, messages: getHistory(room) });

      // Announce join to the room (system message, not persisted).
      io.to(room).emit('room:system', {
        room,
        text: `${user.username} joined ${room}`,
        timestamp: Date.now(),
      });

      // Update presence for everyone in the room.
      broadcastUserList(io, room);

      if (typeof ack === 'function') ack({ ok: true, room });
    });

    // ---- ROOM LEAVE ----
    socket.on('room:leave', (payload = {}, ack) => {
      const roomCheck = validateRoom(payload.room);
      if (!roomCheck.ok) {
        if (typeof ack === 'function') ack({ ok: false, error: roomCheck.error });
        return;
      }
      leaveRoom(io, socket, roomCheck.value);
      const user = getUser(socket.id);
      if (user && user.currentRoom === roomCheck.value) {
        setUserRoom(socket.id, null);
      }
      if (typeof ack === 'function') ack({ ok: true, room: roomCheck.value });
    });

    // ---- CHAT SEND (group) ----
    socket.on('chat:send', (payload = {}, ack) => {
      const user = getUser(socket.id);
      if (!user) {
        const error = 'You must log in before sending messages.';
        socket.emit('error:message', { scope: 'chat:send', error });
        if (typeof ack === 'function') ack({ ok: false, error });
        return;
      }
      const roomCheck = validateRoom(payload.room);
      if (!roomCheck.ok) {
        socket.emit('error:message', { scope: 'chat:send', error: roomCheck.error });
        if (typeof ack === 'function') ack({ ok: false, error: roomCheck.error });
        return;
      }
      const msgCheck = validateMessage(payload.message);
      if (!msgCheck.ok) {
        socket.emit('error:message', { scope: 'chat:send', error: msgCheck.error });
        if (typeof ack === 'function') ack({ ok: false, error: msgCheck.error });
        return;
      }
      const room = roomCheck.value;

      // Only members of the room may post to it.
      if (!socket.rooms.has(room)) {
        const error = `You are not a member of ${room}.`;
        socket.emit('error:message', { scope: 'chat:send', error });
        if (typeof ack === 'function') ack({ ok: false, error });
        return;
      }

      const message = {
        id: newId(),
        room,
        username: user.username,
        avatar: user.avatar,
        senderId: socket.id,
        message: msgCheck.value,
        timestamp: Number(payload.timestamp) || Date.now(),
      };

      addMessageToHistory(room, message);

      // Sender no longer typing once they send.
      clearTyping(io, socket.id, room, user.username);

      io.to(room).emit('chat:receive', message);
      if (typeof ack === 'function') ack({ ok: true, id: message.id });
    });

    // ---- DIRECT MESSAGE ----
    socket.on('direct:send', (payload = {}, ack) => {
      const user = getUser(socket.id);
      if (!user) {
        const error = 'You must log in before sending direct messages.';
        socket.emit('error:message', { scope: 'direct:send', error });
        if (typeof ack === 'function') ack({ ok: false, error });
        return;
      }
      const recipientId = payload.recipientId;
      const recipient = recipientId ? getUser(recipientId) : null;
      if (!recipient) {
        const error = 'Recipient is not online.';
        socket.emit('error:message', { scope: 'direct:send', error });
        if (typeof ack === 'function') ack({ ok: false, error });
        return;
      }
      const msgCheck = validateMessage(payload.message);
      if (!msgCheck.ok) {
        socket.emit('error:message', { scope: 'direct:send', error: msgCheck.error });
        if (typeof ack === 'function') ack({ ok: false, error: msgCheck.error });
        return;
      }

      const dm = {
        id: newId(),
        from: { socketId: socket.id, username: user.username, avatar: user.avatar },
        to: { socketId: recipientId, username: recipient.username },
        message: msgCheck.value,
        timestamp: Date.now(),
      };

      // Deliver ONLY to the recipient socket.
      io.to(recipientId).emit('direct:receive', dm);
      if (typeof ack === 'function') ack({ ok: true, id: dm.id });
    });

    // ---- TYPING START ----
    socket.on('typing:start', (payload = {}) => {
      const user = getUser(socket.id);
      const roomCheck = validateRoom(payload.room);
      if (!user || !roomCheck.ok) return;
      const room = roomCheck.value;
      if (!socket.rooms.has(room)) return;

      io.to(room).except(socket.id).emit('typing:update', {
        room,
        username: user.username,
        isTyping: true,
      });

      // Reset the 3s auto-stop timer.
      const key = typingKey(socket.id, room);
      const existing = typingTimers.get(key);
      if (existing) clearTimeout(existing);
      typingTimers.set(
        key,
        setTimeout(() => {
          clearTyping(io, socket.id, room, user.username);
        }, TYPING_TIMEOUT_MS)
      );
    });

    // ---- TYPING STOP ----
    socket.on('typing:stop', (payload = {}) => {
      const user = getUser(socket.id);
      const roomCheck = validateRoom(payload.room);
      if (!user || !roomCheck.ok) return;
      clearTyping(io, socket.id, roomCheck.value, user.username);
    });

    // ---- DISCONNECT ----
    socket.on('disconnect', () => {
      const user = getUser(socket.id);
      if (!user) return;
      const room = user.currentRoom;

      // Clear any typing indicators this user had.
      if (room) {
        clearTyping(io, socket.id, room, user.username);
      }

      removeUser(socket.id);

      if (room) {
        // socket.io auto-removes the socket from its rooms on disconnect,
        // so recompute presence after removal.
        io.to(room).emit('room:system', {
          room,
          text: `${user.username} left ${room}`,
          timestamp: Date.now(),
        });
        broadcastUserList(io, room);
      }
    });
  });
}

/**
 * Leave a room: notify the room, update presence, clear typing.
 */
function leaveRoom(io, socket, room) {
  const user = getUser(socket.id);
  socket.leave(room);
  if (user) {
    clearTyping(io, socket.id, room, user.username);
    // Clear the user's active room BEFORE recomputing presence so the
    // leaver is excluded from the broadcast userlist.
    if (user.currentRoom === room) {
      setUserRoom(socket.id, null);
    }
    io.to(room).emit('room:system', {
      room,
      text: `${user.username} left ${room}`,
      timestamp: Date.now(),
    });
  }
  broadcastUserList(io, room);
}

/**
 * Deterministic default avatar (emoji) derived from the username.
 */
function defaultAvatar(username) {
  const avatars = ['🦊', '🐼', '🐨', '🦁', '🐸', '🐵', '🦄', '🐙', '🐝', '🦉', '🐧', '🦖'];
  let sum = 0;
  for (let i = 0; i < username.length; i += 1) sum += username.charCodeAt(i);
  return avatars[sum % avatars.length];
}

module.exports = { registerSocketHandlers, defaultAvatar };
