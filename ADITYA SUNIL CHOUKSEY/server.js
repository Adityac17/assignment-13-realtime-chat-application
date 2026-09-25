// Entry point: Express + Socket.io real-time chat server.

require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { registerSocketHandlers } = require('./sockets');
const { DEFAULT_ROOMS } = require('./utils/constants');
const { listRooms } = require('./utils/messageStore');

const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Serve the static client from public/.
app.use(express.static(path.join(__dirname, 'public')));

// Simple health/info endpoint.
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: listRooms(), defaultRooms: DEFAULT_ROOMS });
});

// Root explicitly serves the SPA (also covered by static middleware).
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
});

registerSocketHandlers(io);

// Only start listening when run directly (not when required by tests).
if (require.main === module) {
  server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Chat server listening on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Default rooms: ${DEFAULT_ROOMS.join(', ')}`);
  });
}

module.exports = { app, server, io };
