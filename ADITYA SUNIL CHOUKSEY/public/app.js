/* global io */
// Socket.io chat client.

(function () {
  'use strict';

  const ROOMS = ['#general', '#developers', '#random'];
  const TYPING_IDLE_MS = 1500; // client debounce before emitting typing:stop

  // ---- State ----
  let socket = null;
  let me = { username: null, avatar: null, socketId: null };
  let currentRoom = ROOMS[0];
  const messagesByRoom = {}; // room -> array of rendered message records
  const unread = {}; // room -> count
  let usersInRoom = []; // [{ socketId, username, avatar }]
  const typingUsers = new Set();
  let typingTimer = null;
  let typingActive = false;

  ROOMS.forEach((r) => { messagesByRoom[r] = []; unread[r] = 0; });

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const loginOverlay = $('login-overlay');
  const loginForm = $('login-form');
  const loginError = $('login-error');
  const appEl = $('app');
  const roomListEl = $('room-list');
  const userListEl = $('user-list');
  const messagesEl = $('messages');
  const messageForm = $('message-form');
  const messageInput = $('message-input');
  const currentRoomEl = $('current-room');
  const userpanelRoomEl = $('userpanel-room');
  const typingEl = $('typing-indicator');
  const connStatusEl = $('connection-status');

  // ---- Helpers ----
  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderRooms() {
    roomListEl.innerHTML = '';
    ROOMS.forEach((room) => {
      const li = document.createElement('li');
      li.textContent = room;
      if (room === currentRoom) li.classList.add('active');
      if (unread[room] > 0 && room !== currentRoom) {
        const badge = document.createElement('span');
        badge.className = 'unread';
        badge.textContent = unread[room];
        li.appendChild(badge);
      }
      li.addEventListener('click', () => switchRoom(room));
      roomListEl.appendChild(li);
    });
  }

  function renderUsers() {
    userListEl.innerHTML = '';
    usersInRoom.forEach((u) => {
      const li = document.createElement('li');
      const isSelf = u.socketId === me.socketId;
      if (isSelf) li.classList.add('self');
      li.innerHTML = `<span class="avatar">${escapeHtml(u.avatar || '👤')}</span>` +
        `<span>${escapeHtml(u.username)}${isSelf ? ' (you)' : ''}</span>`;
      if (!isSelf) {
        li.title = `Send a private message to ${u.username}`;
        li.addEventListener('click', () => sendDirect(u));
      }
      userListEl.appendChild(li);
    });
  }

  function addMessageRecord(room, record) {
    if (!messagesByRoom[room]) messagesByRoom[room] = [];
    messagesByRoom[room].push(record);
    if (room === currentRoom) {
      appendMessageEl(record);
    } else if (record.kind !== 'system') {
      unread[room] = (unread[room] || 0) + 1;
      renderRooms();
    }
  }

  function appendMessageEl(record) {
    const el = document.createElement('div');
    if (record.kind === 'system') {
      el.className = 'system-msg';
      el.textContent = record.text;
    } else {
      const isSelf = record.senderId === me.socketId ||
        (record.kind === 'dm-out');
      el.className = 'msg' + (isSelf ? ' self' : '') + (record.kind && record.kind.startsWith('dm') ? ' dm-msg' : '');
      const dmBadge = record.kind && record.kind.startsWith('dm')
        ? '<span class="dm-badge">DM</span>' : '';
      el.innerHTML =
        `<span class="avatar">${escapeHtml(record.avatar || '👤')}</span>` +
        `<div class="bubble">` +
        `<div class="meta"><span class="name">${escapeHtml(record.username)}</span>${dmBadge} · ${fmtTime(record.timestamp)}</div>` +
        `<div class="text">${escapeHtml(record.message)}</div>` +
        `</div>`;
    }
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function rerenderMessages() {
    messagesEl.innerHTML = '';
    (messagesByRoom[currentRoom] || []).forEach(appendMessageEl);
  }

  function renderTyping() {
    const names = Array.from(typingUsers);
    if (names.length === 0) {
      typingEl.innerHTML = '';
    } else if (names.length === 1) {
      typingEl.innerHTML = `<span>${escapeHtml(names[0])} is typing<span class="dots"></span></span>`;
    } else {
      typingEl.innerHTML = `<span>${escapeHtml(names.join(', '))} are typing<span class="dots"></span></span>`;
    }
  }

  // ---- Room switching ----
  function switchRoom(room) {
    if (room === currentRoom) return;
    socket.emit('room:leave', { room: currentRoom });
    currentRoom = room;
    unread[room] = 0;
    typingUsers.clear();
    renderTyping();
    currentRoomEl.textContent = room;
    userpanelRoomEl.textContent = room;
    renderRooms();
    rerenderMessages();
    socket.emit('room:join', { room });
  }

  // ---- Direct messages ----
  function sendDirect(user) {
    const text = window.prompt(`Private message to ${user.username}:`);
    if (!text || !text.trim()) return;
    socket.emit('direct:send', { recipientId: user.socketId, message: text.trim() }, (res) => {
      if (res && res.ok) {
        addMessageRecord(currentRoom, {
          kind: 'dm-out',
          username: `→ ${user.username}`,
          avatar: me.avatar,
          senderId: me.socketId,
          message: text.trim(),
          timestamp: Date.now(),
        });
      } else {
        addMessageRecord(currentRoom, {
          kind: 'system',
          text: `Could not deliver DM: ${(res && res.error) || 'unknown error'}`,
          timestamp: Date.now(),
        });
      }
    });
  }

  // ---- Typing (debounced) ----
  function handleTypingInput() {
    if (!typingActive) {
      socket.emit('typing:start', { room: currentRoom });
      typingActive = true;
    }
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      socket.emit('typing:stop', { room: currentRoom });
      typingActive = false;
    }, TYPING_IDLE_MS);
  }

  // ---- Socket wiring ----
  function connect() {
    socket = io();

    socket.on('connect', () => {
      me.socketId = socket.id;
      connStatusEl.textContent = 'online';
      connStatusEl.className = 'conn-status online';
      // (Re)login and (re)join current room.
      socket.emit('user:login', { username: me.username, avatar: me.avatar }, (res) => {
        if (res && res.ok) {
          me.socketId = res.socketId;
          me.avatar = res.avatar;
          $('me-avatar').textContent = me.avatar;
          socket.emit('room:join', { room: currentRoom });
        }
      });
    });

    socket.on('disconnect', () => {
      connStatusEl.textContent = 'offline';
      connStatusEl.className = 'conn-status offline';
    });

    socket.on('room:history', ({ room, messages }) => {
      messagesByRoom[room] = messages.map((m) => ({ ...m, kind: 'chat' }));
      if (room === currentRoom) rerenderMessages();
    });

    socket.on('chat:receive', (msg) => {
      addMessageRecord(msg.room, { ...msg, kind: 'chat' });
    });

    socket.on('direct:receive', (dm) => {
      addMessageRecord(currentRoom, {
        kind: 'dm-in',
        username: dm.from.username,
        avatar: dm.from.avatar,
        senderId: dm.from.socketId,
        message: dm.message,
        timestamp: dm.timestamp,
      });
    });

    socket.on('room:userlist', ({ room, users }) => {
      if (room === currentRoom) {
        usersInRoom = users;
        renderUsers();
      }
    });

    socket.on('room:system', ({ room, text, timestamp }) => {
      addMessageRecord(room, { kind: 'system', text, timestamp });
    });

    socket.on('typing:update', ({ room, username, isTyping }) => {
      if (room !== currentRoom) return;
      if (isTyping) typingUsers.add(username);
      else typingUsers.delete(username);
      renderTyping();
    });

    socket.on('error:message', ({ scope, error }) => {
      addMessageRecord(currentRoom, {
        kind: 'system',
        text: `⚠️ ${scope}: ${error}`,
        timestamp: Date.now(),
      });
    });
  }

  // ---- Login ----
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = $('username-input').value.trim();
    const avatar = $('avatar-input').value.trim();
    if (!username) {
      loginError.textContent = 'Please enter a username.';
      return;
    }
    me.username = username;
    me.avatar = avatar || null;
    loginOverlay.classList.add('hidden');
    appEl.classList.remove('hidden');
    $('me-name').textContent = username;
    currentRoomEl.textContent = currentRoom;
    userpanelRoomEl.textContent = currentRoom;
    renderRooms();
    connect();
  });

  // ---- Message send ----
  messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    socket.emit('chat:send', {
      room: currentRoom,
      message: text,
      timestamp: Date.now(),
    });
    messageInput.value = '';
    if (typingTimer) clearTimeout(typingTimer);
    if (typingActive) {
      socket.emit('typing:stop', { room: currentRoom });
      typingActive = false;
    }
  });

  messageInput.addEventListener('input', handleTypingInput);
})();
