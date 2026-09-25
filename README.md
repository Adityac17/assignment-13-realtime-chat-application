# Assignment 13 — Real-Time Group Chat & Messaging Engine

A real-time, multi-room group chat with private messaging, typing indicators,
per-room presence, and message-history replay. Built with **Node.js + Express +
Socket.io**. No database — all state lives in memory (see
[In-Memory Store Design](#in-memory-store-design--limitations)).

---

## Features

- **Multi-room chat** with dynamic room switching (`#general`, `#developers`, `#random`).
- **Real-time broadcast** — messages are pushed to every member of a room instantly.
- **Room isolation** — a message sent to one room never leaks into another.
- **Direct (private) messaging** — DMs are delivered only to the target socket.
- **Typing indicators** with a **server-side 3s auto-stop** and **client-side debounce**.
- **Per-room presence roster** — live online-user list per room, updated on join/leave/disconnect.
- **History replay on join** — a late joiner receives the last 50 messages of the room.
- **Dark-theme UI** — chat bubbles, animations, responsive 3-column layout.
- **Robust validation** — empty/oversized messages rejected, duplicate usernames per room prevented, graceful disconnects.

---

## Tech Stack

| Purpose            | Package            |
| ------------------ | ------------------ |
| HTTP server        | `express`          |
| Real-time transport| `socket.io`        |
| CORS               | `cors`             |
| Config             | `dotenv`           |
| Dev auto-reload    | `nodemon` (dev)    |
| Integration tests  | `socket.io-client` (dev) |

---

## Project Structure

```
assignment-13-realtime-chat/
├── server.js                 # Express + Socket.io bootstrap (port 5000)
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── public/                   # Static client (served by Express)
│   ├── index.html            # Multi-room chat UI
│   ├── app.js                # Socket.io client + DOM logic
│   └── style.css             # Dark theme, bubbles, animations, responsive
├── sockets/
│   └── index.js              # All Socket.io event handlers
├── utils/
│   ├── constants.js          # MAX_HISTORY, default rooms, limits, timeouts
│   ├── messageStore.js       # roomHistories + add/get/trim (50 cap)
│   ├── userStore.js          # connectedUsers Map + presence helpers
│   └── validators.js         # username/room/message validation
└── test/
    ├── messageStore.test.js       # unit tests
    └── socket.integration.test.js # end-to-end socket tests
```

---

## Setup & Run

Requires Node.js 18+.

```bash
cd assignment-13-realtime-chat
npm install

# optional: create a .env (defaults are fine)
cp .env.example .env

# development (auto-reload)
npm run dev

# production
npm start
```

Then open **http://localhost:5000** in your browser.

### Port note

The server listens on **port 5000** by default. Override with the `PORT`
environment variable, e.g. `PORT=8080 npm start`.

> **macOS note:** On recent macOS, port 5000 is often occupied by the AirPlay
> Receiver (ControlCenter). If you see `EADDRINUSE :::5000`, either disable
> *System Settings → General → AirDrop & Handoff → AirPlay Receiver*, or run with
> a different port: `PORT=5055 npm start`.

---

## How to Manually Test (3+ browser tabs)

1. Run `npm run dev` and open **http://localhost:5000** in **three** browser tabs.
2. In each tab, log in with a **different username** (avatar emoji optional).
3. **Group chat / isolation:** In tabs A and B, click `#general`. In tab C, click
   `#developers`. Send a message from A — it appears in A and B, but **not** in C.
4. **Presence:** Watch the right-hand "Online in #general" panel update as tabs
   join, switch rooms, or close.
5. **Typing indicator:** Start typing in tab A (don't send). Tab B shows
   "alice is typing…". Stop for 3s and it clears automatically.
6. **History replay:** Send a few messages in `#general`, then open a fresh tab,
   log in, and join `#general` — the recent messages load immediately.
7. **Direct messages:** In the online-users panel, click another user's name and
   type a private message. It appears only for you (sender) and the recipient,
   tagged **DM** — nobody else in the room sees it.

---

## Socket Event Reference

### Client → Server

| Event          | Payload                                   | Description |
| -------------- | ----------------------------------------- | ----------- |
| `user:login`   | `{ username, avatar? }`                    | Register the user in `connectedUsers`. Ack: `{ ok, socketId, username, avatar }`. |
| `room:join`    | `{ room }`                                 | Join a room. Server replies `room:history` to joiner and `room:userlist` to the room. |
| `room:leave`   | `{ room }`                                 | Leave a room; server re-broadcasts `room:userlist`. |
| `chat:send`    | `{ room, message, timestamp }`             | Send a group message. Stored (max 50/room) + broadcast as `chat:receive`. |
| `direct:send`  | `{ recipientId, message }`                 | Send a private message to one socket. Ack: `{ ok, id }`. |
| `typing:start` | `{ room }`                                 | Announce typing to the room (except sender). Auto-stops after 3s. |
| `typing:stop`  | `{ room }`                                 | Announce stop typing. |

### Server → Client

| Event           | Payload                                      | Description |
| --------------- | -------------------------------------------- | ----------- |
| `user:login:ok` | `{ socketId, username, avatar }`             | Login confirmation. |
| `room:history`  | `{ room, messages[] }`                       | Last 50 messages, sent to the joiner only. |
| `room:userlist` | `{ room, users: [{ socketId, username, avatar }] }` | Current online users in a room. |
| `room:system`   | `{ room, text, timestamp }`                  | System notices ("X joined/left"). |
| `chat:receive`  | `{ id, room, username, avatar, senderId, message, timestamp }` | A broadcast group message. |
| `direct:receive`| `{ id, from, to, message, timestamp }`       | A private message, delivered only to the recipient. |
| `typing:update` | `{ room, username, isTyping }`               | Typing state, broadcast to room members **except** the sender. |
| `error:message` | `{ scope, error }`                           | Validation / operational error for the client to surface. |

---

## In-Memory Store Design & Limitations

Two structures hold all runtime state:

- **`connectedUsers`** (`Map<socketId, { username, avatar, currentRoom }>`) — the
  presence registry, in `utils/userStore.js`.
- **`roomHistories`** (`Object<roomName, Message[]>`) — recent messages per room,
  in `utils/messageStore.js`. Each room is capped at **`MAX_HISTORY = 50`**; when
  a 51st message arrives, the oldest is trimmed off the front.

`utils/messageStore.js` exposes:

- `addMessageToHistory(room, message)` — append + trim to 50.
- `getHistory(room)` — return the last 50 messages for a room.

**Limitations (by design):**

- **No persistence.** All history and presence live in process memory and are
  **lost on restart**. There is no database.
- **Single-node only.** State is per-process; running multiple instances behind a
  load balancer would need a shared adapter (e.g. `@socket.io/redis-adapter`).
- **History is bounded** to the newest 50 messages per room.

---

## Design Choices (documented, made autonomously)

- **Single active room per socket.** Each user has one `currentRoom`. Joining a new
  room auto-leaves the previous one. This keeps the presence roster and typing
  indicators unambiguous and matches the tab-style UI. (Socket.io itself still
  supports multi-room; this is a product choice enforced in the handlers.)
- **Duplicate-username prevention is scoped per room** (case-insensitive), not
  globally, so the same display name can exist in different rooms but not collide
  within one room.
- **Typing auto-stop is enforced on the server** (`TYPING_TIMEOUT_MS = 3000`) with
  a per-user-per-room timer, so a client that disconnects mid-type never leaves a
  stuck "typing…" indicator. The client additionally debounces (1.5s idle) to
  avoid event spam.
- **DMs are ephemeral and not stored** in `roomHistories` — they are routed
  directly to the recipient socket via `io.to(recipientId)`.
- **Validation limits:** message ≤ 2000 chars, username ≤ 32, room ≤ 40; empty
  values rejected. Invalid input yields an `error:message` event rather than a
  thrown exception.
- **Avatars** default to a deterministic emoji derived from the username when none
  is supplied, so users are visually distinct without extra input.
- **Health endpoint** `GET /api/health` returns server status and known rooms —
  handy for smoke tests and load balancers.

---

## Tests

```bash
npm test        # runs unit + integration suites
```

**Unit — `test/messageStore.test.js`** (plain Node `assert`): append, 50-message
cap/trimming, `getHistory` returns the last 50 in order, default rooms seeded.

**Integration — `test/socket.integration.test.js`** (`socket.io-client`, spins up a
real server, connects 3+ clients):

1. **Room isolation** — a `chat:send` in `#general` reaches other `#general`
   members but **not** a client in `#developers`.
2. **Typing** — `typing:update` reaches room members **except** the sender.
3. **Direct message** — `direct:send` reaches only the target socket, not the room.
4. **Presence** — `room:userlist` updates on join, leave, and disconnect.
5. **History** — a late joiner receives `room:history`.

_Latest local run:_ **messageStore 7/7 passed**, **integration 5/5 passed**.

---

## License

MIT
