// Integration tests using socket.io-client against a real server instance.
//
// Scenarios covered:
//  1. Room isolation: chat:send in #general reaches other #general members
//     but NOT a client in #developers.
//  2. typing:update reaches room members except the sender.
//  3. direct:send reaches only the target socket, not the room.
//  4. room:userlist updates when a user joins / leaves / disconnects.
//  5. A late joiner receives room:history.

const assert = require('assert');
const http = require('http');
const { Server } = require('socket.io');
const { io: ClientIO } = require('socket.io-client');

const { registerSocketHandlers } = require('../sockets');
const { clearHistory } = require('../utils/messageStore');

let passed = 0;
let failed = 0;
const results = {};

function record(name, ok, err) {
  results[name] = ok;
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}${err ? ` — ${err.message || err}` : ''}`);
  }
}

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function connectClient(port) {
  return new Promise((resolve, reject) => {
    const c = ClientIO(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    c.on('connect', () => resolve(c));
    c.on('connect_error', reject);
  });
}

function login(client, username) {
  return new Promise((resolve) => {
    client.emit('user:login', { username }, (res) => resolve(res));
  });
}

function join(client, room) {
  return new Promise((resolve) => {
    client.emit('room:join', { room }, (res) => resolve(res));
  });
}

async function main() {
  clearHistory();

  const server = http.createServer();
  const ioServer = new Server(server, { cors: { origin: '*' } });
  registerSocketHandlers(ioServer);

  const port = await new Promise((resolve) => {
    server.listen(0, () => resolve(server.address().port));
  });
  console.log(`socket integration tests (server on :${port})`);

  // Connect 3 clients.
  const alice = await connectClient(port);
  const bob = await connectClient(port);
  const carol = await connectClient(port);

  await login(alice, 'alice');
  await login(bob, 'bob');
  await login(carol, 'carol');

  // alice + bob in #general, carol in #developers.
  await join(alice, '#general');
  await join(bob, '#general');
  await join(carol, '#developers');
  await wait(100);

  // ---- Scenario 1: room isolation ----
  try {
    let bobGot = null;
    let carolGot = null;
    bob.on('chat:receive', (m) => { if (m.message === 'iso-test') bobGot = m; });
    carol.on('chat:receive', (m) => { if (m.message === 'iso-test') carolGot = m; });

    alice.emit('chat:send', { room: '#general', message: 'iso-test', timestamp: Date.now() });
    await wait(200);

    assert.ok(bobGot, 'bob (same room) should receive the message');
    assert.strictEqual(bobGot.username, 'alice');
    assert.strictEqual(carolGot, null, 'carol (other room) should NOT receive it');
    record('isolation: chat stays within its room', true);
  } catch (err) {
    record('isolation: chat stays within its room', false, err);
  }

  // ---- Scenario 2: typing:update excludes sender ----
  try {
    let bobTyping = null;
    let aliceTyping = null;
    bob.on('typing:update', (t) => { if (t.username === 'alice') bobTyping = t; });
    alice.on('typing:update', (t) => { if (t.username === 'alice') aliceTyping = t; });

    alice.emit('typing:start', { room: '#general' });
    await wait(150);

    assert.ok(bobTyping && bobTyping.isTyping === true, 'bob should see alice typing');
    assert.strictEqual(aliceTyping, null, 'alice should NOT receive her own typing event');
    record('typing: broadcast to room except sender', true);
  } catch (err) {
    record('typing: broadcast to room except sender', false, err);
  }

  // ---- Scenario 3: direct:send reaches only target ----
  try {
    let bobDM = null;
    let carolDM = null;
    let aliceRoomLeak = null;
    bob.on('direct:receive', (d) => { bobDM = d; });
    carol.on('direct:receive', (d) => { carolDM = d; });
    // Ensure it does not arrive as a room chat message either.
    bob.on('chat:receive', (m) => { if (m.message === 'secret-dm') aliceRoomLeak = m; });

    const bobId = bob.id;
    alice.emit('direct:send', { recipientId: bobId, message: 'secret-dm' });
    await wait(200);

    assert.ok(bobDM && bobDM.message === 'secret-dm', 'bob should receive the DM');
    assert.strictEqual(carolDM, null, 'carol should NOT receive the DM');
    assert.strictEqual(aliceRoomLeak, null, 'DM must not leak into room chat');
    record('direct message: reaches only the target socket', true);
  } catch (err) {
    record('direct message: reaches only the target socket', false, err);
  }

  // ---- Scenario 4: room:userlist updates on join / leave / disconnect ----
  try {
    const userlists = [];
    bob.on('room:userlist', (u) => { if (u.room === '#general') userlists.push(u.users.map((x) => x.username).sort()); });

    // carol joins #general -> list should include carol.
    await join(carol, '#general');
    await wait(150);
    const afterJoin = userlists[userlists.length - 1];
    assert.ok(afterJoin.includes('carol'), 'userlist should include carol after join');
    assert.ok(afterJoin.includes('alice') && afterJoin.includes('bob'));

    // carol leaves -> list should drop carol.
    await new Promise((resolve) => carol.emit('room:leave', { room: '#general' }, resolve));
    await wait(150);
    const afterLeave = userlists[userlists.length - 1];
    assert.ok(!afterLeave.includes('carol'), 'userlist should drop carol after leave');

    // alice disconnects -> list should drop alice.
    alice.disconnect();
    await wait(200);
    const afterDisconnect = userlists[userlists.length - 1];
    assert.ok(!afterDisconnect.includes('alice'), 'userlist should drop alice after disconnect');
    record('presence: userlist updates on join/leave/disconnect', true);
  } catch (err) {
    record('presence: userlist updates on join/leave/disconnect', false, err);
  }

  // ---- Scenario 5: late joiner receives history ----
  try {
    // bob posts a couple messages in #general.
    bob.emit('chat:send', { room: '#general', message: 'history-1', timestamp: Date.now() });
    bob.emit('chat:send', { room: '#general', message: 'history-2', timestamp: Date.now() });
    await wait(150);

    const dave = await connectClient(port);
    await login(dave, 'dave');
    const history = await new Promise((resolve) => {
      dave.on('room:history', (h) => { if (h.room === '#general') resolve(h.messages); });
      dave.emit('room:join', { room: '#general' });
    });
    const texts = history.map((m) => m.message);
    assert.ok(texts.includes('history-1') && texts.includes('history-2'), 'late joiner should get prior messages');
    record('history: late joiner receives room:history', true);
    dave.disconnect();
  } catch (err) {
    record('history: late joiner receives room:history', false, err);
  }

  // Cleanup.
  [bob, carol].forEach((c) => c.connected && c.disconnect());
  await wait(50);
  ioServer.close();
  server.close();

  console.log(`\nintegration: ${passed} passed, ${failed} failed`);
  console.log('summary:', JSON.stringify(results, null, 2));
  if (failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
