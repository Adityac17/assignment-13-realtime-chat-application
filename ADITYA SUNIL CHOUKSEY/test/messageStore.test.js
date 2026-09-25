// Unit tests for utils/messageStore.js (no test framework — plain assert).

const assert = require('assert');
const store = require('../utils/messageStore');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`      ${err.message}`);
  }
}

console.log('messageStore unit tests');

test('addMessageToHistory appends a message', () => {
  store.clearHistory('#unit');
  store.addMessageToHistory('#unit', { id: 1, message: 'hi' });
  const h = store.getHistory('#unit');
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].message, 'hi');
});

test('addMessageToHistory returns the stored message', () => {
  store.clearHistory('#unit');
  const m = store.addMessageToHistory('#unit', { id: 2, message: 'yo' });
  assert.strictEqual(m.message, 'yo');
});

test('getHistory returns [] for an unknown room', () => {
  const h = store.getHistory('#does-not-exist-yet');
  assert.ok(Array.isArray(h));
  assert.strictEqual(h.length, 0);
});

test('history is trimmed (capped) to MAX_HISTORY (50)', () => {
  store.clearHistory('#cap');
  for (let i = 0; i < 120; i += 1) {
    store.addMessageToHistory('#cap', { id: i, message: `m${i}` });
  }
  const h = store.getHistory('#cap');
  assert.strictEqual(h.length, store.MAX_HISTORY);
  assert.strictEqual(store.MAX_HISTORY, 50);
});

test('trimming keeps the newest 50, drops the oldest', () => {
  store.clearHistory('#cap2');
  for (let i = 0; i < 60; i += 1) {
    store.addMessageToHistory('#cap2', { id: i, message: `m${i}` });
  }
  const h = store.getHistory('#cap2');
  // Oldest 10 (0..9) dropped; should start at id 10 and end at id 59.
  assert.strictEqual(h[0].id, 10);
  assert.strictEqual(h[h.length - 1].id, 59);
});

test('getHistory returns the last 50 in insertion order', () => {
  store.clearHistory('#order');
  for (let i = 0; i < 55; i += 1) {
    store.addMessageToHistory('#order', { id: i });
  }
  const h = store.getHistory('#order');
  for (let i = 1; i < h.length; i += 1) {
    assert.ok(h[i].id > h[i - 1].id, 'ids must be ascending');
  }
  assert.strictEqual(h.length, 50);
});

test('default rooms are pre-seeded', () => {
  const rooms = store.listRooms();
  ['#general', '#developers', '#random'].forEach((r) => {
    assert.ok(rooms.includes(r), `${r} should exist`);
  });
});

console.log(`\nmessageStore: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
