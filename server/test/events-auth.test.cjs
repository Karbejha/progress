const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JwtService } = require('@nestjs/jwt');
const { EventsGateway } = require('../src/events/events.gateway');

function fixture() {
  const users = new Map([
    ['director', { id: 'director', role: 'DIRECTOR', directorateId: 'own', isActive: true }],
    ['observer', { id: 'observer', role: 'OBSERVER', directorateId: null, isActive: true }],
    ['inactive', { id: 'inactive', role: 'DIRECTOR', directorateId: 'own', isActive: false }],
  ]);
  const jwt = new JwtService({ secret: 'isolated-websocket-test-secret' });
  const broadcasts = [];
  const disconnects = [];
  let middleware;
  const server = {
    use(handler) { middleware = handler; },
    to(room) { return { emit(event, payload) { broadcasts.push({ room, event, payload }); } }; },
    in(room) { return { disconnectSockets(force) { disconnects.push({ room, force }); } }; },
  };
  const gateway = new EventsGateway(jwt, {
    user: { findUnique: async ({ where }) => {
      const user = users.get(where.id);
      return user ? { ...user } : null;
    } },
  });
  gateway.logger = { log() {} };
  gateway.server = server;
  gateway.afterInit(server);
  const token = (id, options = {}) => jwt.sign({ sub: id }, { expiresIn: '1h', ...options });
  const socket = (auth = {}, headers = {}) => ({
    id: 'socket', handshake: { auth, headers }, data: {}, rooms: new Set(), disconnected: false,
    join(rooms) { for (const room of Array.isArray(rooms) ? rooms : [rooms]) this.rooms.add(room); },
    leave(room) { this.rooms.delete(room); },
    disconnect(force) { this.disconnected = force; },
  });
  const authenticate = (client) => new Promise((resolve) => middleware(client, resolve));
  return { gateway, users, token, socket, authenticate, broadcasts, disconnects };
}

test('WebSocket authentication rejects absent, invalid, expired and inactive sessions before joining rooms', async () => {
  const state = fixture();
  for (const token of [undefined, 'invalid', state.token('director', { expiresIn: -1 }), state.token('inactive'), state.token('missing')]) {
    const client = state.socket({ token });
    const error = await state.authenticate(client);
    assert.equal(error?.message, 'Unauthorized');
    assert.equal(client.rooms.size, 0);
    assert.equal(client.data.authenticatedUser, undefined);
  }
});

test('the verified database identity determines private rooms, ignoring forged join data', async () => {
  const state = fixture();
  const client = state.socket({ token: state.token('director') });
  assert.equal(await state.authenticate(client), undefined);
  await state.gateway.handleConnection(client);
  try {
    await state.gateway.handleJoinRoom(client, { userId: 'another-user', role: 'GENERAL_DIRECTOR', directorateId: 'another-directorate' });
    assert.deepEqual([...client.rooms].sort(), ['room:authenticated', 'room:directorate_own', 'room:user_director']);
    state.users.get('director').directorateId = 'changed';
    await state.gateway.handleJoinRoom(client);
    assert.ok(client.rooms.has('room:directorate_changed'));
    assert.ok(!client.rooms.has('room:directorate_own'), 'Old permissions are removed on room refresh');
    state.users.get('director').isActive = false;
    assert.deepEqual(await state.gateway.handleJoinRoom(client), { status: 'unauthorized' });
    assert.equal(client.disconnected, true);
  } finally {
    state.gateway.handleDisconnect(client);
  }
});

test('observer sessions receive the same executive business events as their persisted notification audience', async () => {
  const state = fixture();
  const client = state.socket({}, { authorization: `Bearer ${state.token('observer')}` });
  assert.equal(await state.authenticate(client), undefined);
  await state.gateway.handleConnection(client);
  try {
    assert.ok(client.rooms.has('room:executive'));
    assert.ok(client.rooms.has('room:user_observer'));
  } finally {
    state.gateway.handleDisconnect(client);
  }
});

test('a token expiring while the handshake is in progress cannot join any delivery room', async () => {
  const state = fixture();
  const client = state.socket({ token: state.token('director') });
  assert.equal(await state.authenticate(client), undefined);
  client.data.tokenExpiresAt = Math.floor(Date.now() / 1000) - 1;
  await state.gateway.handleConnection(client);
  assert.equal(client.disconnected, true);
  assert.equal(client.rooms.size, 0);
});

test('canonical notification and read events target only the authenticated recipient room', () => {
  const state = fixture();
  const notification = { id: 'persisted-id', userId: 'director', type: 'task', metadata: { taskId: 'task' } };
  state.gateway.emitNotificationCreated('director', notification);
  state.gateway.emitNotificationsRead('director', ['notification-persisted-id']);
  state.gateway.emitAnnouncementCreated({ title: 'Announcement', content: 'Content', priority: 'NORMAL', authorName: 'Executive' });
  assert.deepEqual(state.broadcasts.slice(0, 2), [
    { room: 'room:user_director', event: 'notification:created', payload: notification },
    { room: 'room:user_director', event: 'notifications:read', payload: { readKeys: ['notification-persisted-id'] } },
  ]);
  assert.equal(state.broadcasts[2].room, 'room:authenticated', 'Announcements must never broadcast to unauthenticated sockets');
  state.gateway.emitUserStatusChanged({ userId: 'director', directorateId: 'own', isActive: false });
  assert.deepEqual(state.disconnects, [{ room: 'room:user_director', force: true }]);
});
