const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('socket keeps notification listeners through reconnect, refreshes account credentials, and disconnects on logout', () => {
  const previousWindow = global.window, previousDocument = global.document, previousEvent = global.CustomEvent;
  const modulePath = require.resolve('../../client/src/lib/socket');
  const originalLoad = Module._load;
  const handlers = new Map(), events = new Map();
  let token = null, user = null, options, creations = 0, connections = 0, disconnections = 0;
  const socket = {
    connected: false,
    on: (name, callback) => { handlers.set(name, callback); return socket; },
    emit() {},
    connect: () => { connections++; socket.connected = true; return socket; },
    disconnect: () => { disconnections++; socket.connected = false; return socket; },
  };
  global.window = {
    addEventListener: (name, callback) => events.set(name, callback),
    dispatchEvent() {},
  };
  global.document = { visibilityState: 'visible' };
  global.CustomEvent = class {};
  Module._load = function (request, parent, ...args) {
    if (parent?.filename === modulePath && request === 'socket.io-client') return {
      io: (_url, opts) => { creations++; options = opts; return socket; },
    };
    if (parent?.filename === modulePath && request === '../services/api') return {
      api: { getToken: () => token, getCurrentUser: () => user }, getApiBaseUrl: () => 'https://test.example/api',
    };
    return originalLoad.call(this, request, parent, ...args);
  };
  try {
    delete require.cache[modulePath];
    const service = require(modulePath);
    assert.strictEqual(service.getSocket(), socket);
    assert.equal(options.autoConnect, false);
    token = 'account-1-token'; user = { id: 'account-1' };
    events.get('ports:auth_changed')();
    let handshake;
    options.auth((value) => { handshake = value; });
    assert.deepEqual(handshake, { token });
    const listener = () => {};
    socket.on('notification:created', listener);
    assert.strictEqual(service.forceReconnectSocket(), socket);
    assert.strictEqual(handlers.get('notification:created'), listener);
    assert.equal(creations, 1);
    token = 'account-2-token'; user = { id: 'account-2' };
    events.get('ports:auth_changed')();
    options.auth((value) => { handshake = value; });
    assert.deepEqual(handshake, { token });
    const beforeLogout = connections;
    token = null; user = null;
    events.get('ports:auth_changed')();
    assert.equal(socket.connected, false);
    events.get('online')();
    assert.equal(connections, beforeLogout);
    assert.ok(disconnections >= 3);
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
    global.window = previousWindow; global.document = previousDocument; global.CustomEvent = previousEvent;
  }
});
