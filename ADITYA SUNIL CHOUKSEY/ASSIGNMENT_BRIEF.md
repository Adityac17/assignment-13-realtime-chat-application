# 💬 Assignment 13: Real-Time Group Chat & Messaging Engine (Socket.io)
> **Track:** Backend & Real-Time Web | **Level:** Advanced | **Estimated Time:** 7–9 Hours  
> **Tech Stack:** Node.js, Express.js, Socket.io, In-Memory/Database History Store, CORS

---

## 📌 1. Objective & Overview

Build a scalable **Real-Time Group Chat & Direct Messaging Engine** using **Node.js, Express.js, and Socket.io**. Students will master real-time WebSocket communication channels, dynamic room creation (`#general`, `#gaming`, `#tech`), real-time typing indicators with debounce timeouts, active user presence tracking, and message history replay upon room connection.

### Key Learning Outcomes:
- Managing multi-channel chat rooms using `socket.join(roomName)` and `socket.leave(roomName)`.
- Broadcasting messages selectively to room participants vs emitting private direct messages (`io.to(recipientSocketId)`).
- Implementing debounced user typing indicator states (`typing:start`, `typing:stop`).
- Tracking real-time user presence and maintaining connected participant rosters.
- Caching recent chat history buffers (last 50 messages) and hydrating new joiners instantly.

---

## 🛠️ 2. Tech Stack & Dependencies

```bash
# Initialize project
npm init -y

# Install dependencies
npm install express socket.io cors dotenv

# Install development tools
npm install -D nodemon
```

---

## 📡 3. Real-Time Socket Event Protocol

### 🔄 Session & Room Management

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `user:login` | `Client -> Server` | `{ "username": "Aarav", "avatar": "avatar1.png" }` | Registers user identity and socket mapping |
| `room:join` | `Client -> Server` | `{ "room": "developers" }` | Joins a specific chat channel |
| `room:history` | `Server -> Client` | `{ "room": "developers", "messages": [...] }` | Emits recent message history buffer to joined user |
| `room:userlist` | `Server -> Room` | `{ "room": "developers", "users": ["Aarav", "Priya"] }` | Broadcasts updated online users list in the room |
| `room:leave` | `Client -> Server` | `{ "room": "developers" }` | Leaves the room |

### 💬 Messaging & Indicators

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `chat:send` | `Client -> Server` | `{ "room": "developers", "message": "Hey everyone!" }` | Sends message to a room |
| `chat:receive` | `Server -> Room` | `{ "id": "msg_123", "sender": "Aarav", "message": "Hey everyone!", "timestamp": "14:32" }` | Broadcasts message to all members in room |
| `typing:start` | `Client -> Server` | `{ "room": "developers" }` | User started typing in room |
| `typing:stop` | `Client -> Server` | `{ "room": "developers" }` | User stopped typing or sent message |
| `typing:update` | `Server -> Room (broadcast.to)` | `{ "username": "Aarav", "isTyping": true }` | Displays "Aarav is typing..." to others |
| `direct:send` | `Client -> Server` | `{ "recipientId": "socket_id_xyz", "message": "Secret DM" }` | Sends private direct message |
| `direct:receive`| `Server -> Client` | `{ "from": "Aarav", "message": "Secret DM", "timestamp": "14:35" }` | Delivered only to intended recipient socket |

---

## 🧠 4. Server-Side Data Structures

```javascript
// In-Memory Chat State
const connectedUsers = new Map(); // socketId -> { username, currentRoom }

const roomHistories = {
  "general": [],
  "developers": [],
  "random": []
};

const MAX_HISTORY = 50;

function addMessageToHistory(room, messageObj) {
  if (!roomHistories[room]) roomHistories[room] = [];
  roomHistories[room].push(messageObj);
  if (roomHistories[room].length > MAX_HISTORY) {
    roomHistories[room].shift();
  }
}
```

---

## 🏗️ 5. Project Architecture

```text
assignment-13-chat-socket/
├── public/
│   ├── index.html           # Multi-room chat UI with dark theme
│   ├── app.js               # Client socket event listeners & UI updates
│   └── style.css            # Chat bubbles, sidebar, user list styling
├── sockets/
│   ├── chatHandler.js       # Room messaging, DM & typing handlers
│   └── userHandler.js       # User login, room join/leave & disconnects
├── utils/
│   └── messageStore.js      # Message history management
├── server.js                # Express & Socket.io server bootstrap
├── package.json
└── README.md
```

---

## 🧪 6. Testing & Validation

1. Start the server on `http://localhost:5000`.
2. Open three browser tabs: User A (Aarav), User B (Priya), and User C (Rohan).
3. Have Aarav and Priya join `#developers`, while Rohan joins `#random`.
4. When Aarav types in `#developers`, verify only Priya sees "Aarav is typing...". Rohan in `#random` should see nothing.
5. Send messages in `#developers`: verify Priya receives them in real time.
6. Open a fourth tab, join `#developers` as a new user, and verify all previous messages are immediately displayed from history.
7. Send a direct message from Aarav to Priya: verify Rohan does not receive it.

---

## 📊 7. Grading Rubric (100 Marks)

| Evaluation Component | Marks |
|---|:---:|
| **Socket.io Multi-Room & Channel Management** | 25 |
| **Real-Time Group Messaging & DM Dispatching** | 25 |
| **Active Room Participant Roster & Presence Tracking** | 15 |
| **Typing Indicators with Debounce Handling** | 15 |
| **Message History Hydration & In-Memory Store** | 20 |
| **Total Marks** | **100** |

---

## 📤 8. Submission Guidelines

- Submit your GitHub repository: `itm-assignment-13-chat-socket`.
- Include a 1-minute video demo demonstrating group chat, typing indicators, and private DMs across multiple tabs.
