const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { PrismaClient } = require('@prisma/client');
const { EventsGateway } = require('../src/events/events.gateway');
const { PrismaService } = require('../src/prisma/prisma.service');
const { NotificationsService } = require('../src/notifications/notifications.service');

const waitFor = (socket, event, action) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timed out waiting for ${event}`)); }, 5000);
  const handler = (payload) => { clearTimeout(timeout); resolve(payload); };
  socket.once(event, handler);
  try { action?.(); } catch (error) { clearTimeout(timeout); socket.off(event, handler); reject(error); }
});

const join = (socket, payload = {}) => new Promise((resolve, reject) => {
  socket.timeout(5000).emit('join', payload, (error, response) => error ? reject(error) : resolve(response));
});

test('Nest/Socket.IO: authenticated persisted notifications stay isolated and observer events/read synchronization work', {
  skip: !process.env.NOTIFICATION_TEST_DATABASE_URL,
  timeout: 20000,
}, async () => {
  const url = new URL(process.env.NOTIFICATION_TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Only the isolated loopback test database is allowed');
  assert.equal(url.port, '55432');
  assert.equal(url.pathname, '/notification_audit');
  const { io } = require('../../client/node_modules/socket.io-client');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const jwt = new JwtService({ secret: 'isolated-gateway-integration-secret' });
  const runId = randomUUID();
  const directorateIds = [], userIds = [], sockets = [];
  let app;
  try {
    const createDirectorate = async (suffix) => {
      const directorate = await prisma.directorate.create({ data: {
        name: `Notification gateway ${suffix}`, code: `GW_${suffix}_${runId}`, category: 'TEST',
      } });
      directorateIds.push(directorate.id);
      return directorate;
    };
    const own = await createDirectorate('own');
    const other = await createDirectorate('other');
    const createUser = async (suffix, role, directorateId = null) => {
      const user = await prisma.user.create({ data: {
        username: `gateway_${suffix}_${runId}`, email: `gateway_${suffix}_${runId}@example.test`,
        password: 'isolated-test', fullName: `Gateway ${suffix}`, title: 'Test', role, directorateId,
      } });
      userIds.push(user.id);
      return user;
    };
    const director = await createUser('director', 'DIRECTOR', own.id);
    const otherDirector = await createUser('other', 'DIRECTOR', other.id);
    const observer = await createUser('observer', 'OBSERVER');
    class TestModule {}
    Module({ providers: [
      EventsGateway,
      { provide: PrismaService, useValue: prisma },
      { provide: JwtService, useValue: jwt },
    ] })(TestModule);
    app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();
    const gateway = app.get(EventsGateway);
    const notifications = new NotificationsService(prisma, gateway);
    notifications.sendPushToUser = async () => {};
    const makeSocket = (user) => {
      const socket = io(baseUrl, {
        transports: ['websocket'], autoConnect: false, reconnection: false,
        auth: user ? { token: jwt.sign({ sub: user.id }, { expiresIn: '1h' }) } : {},
      });
      sockets.push(socket);
      return socket;
    };
    const unauthenticated = makeSocket();
    const rejection = await waitFor(unauthenticated, 'connect_error', () => unauthenticated.connect());
    assert.equal(rejection.message, 'Unauthorized');
    assert.equal(unauthenticated.connected, false);
    const clients = [director, otherDirector, observer].map(makeSocket);
    for (const socket of clients) {
      await waitFor(socket, 'connect', () => socket.connect());
      assert.equal((await join(socket)).status, 'joined');
    }
    const [directorSocket, otherSocket, observerSocket] = clients;
    const forged = await join(directorSocket, { userId: otherDirector.id, role: 'GENERAL_DIRECTOR', directorateId: other.id });
    assert.equal(forged.status, 'joined');
    const serverSocket = gateway.server.sockets.sockets.get(directorSocket.id);
    assert.ok(serverSocket.rooms.has(`room:user_${director.id}`));
    assert.ok(!serverSocket.rooms.has(`room:user_${otherDirector.id}`));
    assert.ok(!serverSocket.rooms.has('room:executive'));
    assert.ok(!serverSocket.rooms.has(`room:directorate_${other.id}`));

    const otherReceived = [], observerReceived = [];
    otherSocket.on('notification:created', (notification) => otherReceived.push(notification));
    observerSocket.on('notification:created', (notification) => observerReceived.push(notification));
    const ownEvent = waitFor(directorSocket, 'notification:created');
    const saved = await notifications.createNotification({
      userId: director.id, type: 'task', title: 'Private task update', message: 'Only its recipient',
      referenceId: 'isolated-task', metadata: { directorateId: own.id, taskId: 'isolated-task' },
    });
    const received = await ownEvent;
    assert.equal(received.id, saved.id);
    assert.equal(received.userId, director.id);
    assert.equal(received.metadata.taskId, 'isolated-task');
    assert.equal((await prisma.notification.findUnique({ where: { id: received.id } })).userId, director.id);

    const planPayload = { directorateId: other.id, directorateName: other.name, directorName: 'Other director', tasksCount: 1, planDate: '2026-10-14' };
    const otherPlan = waitFor(otherSocket, 'plan:submitted');
    const observerPlan = waitFor(observerSocket, 'plan:submitted');
    gateway.emitPlanSubmitted(planPayload);
    assert.deepEqual(await observerPlan, planPayload);
    assert.deepEqual(await otherPlan, planPayload);
    assert.deepEqual(otherReceived, [], 'A forged join cannot receive another user notification');
    assert.deepEqual(observerReceived, [], 'Executive room membership cannot reveal private recipient events');

    const readKey = saved.id;
    const synchronizedRead = waitFor(directorSocket, 'notifications:read');
    await notifications.markKeysAsRead(director.id, [readKey]);
    assert.deepEqual(await synchronizedRead, { readKeys: [readKey] });
    assert.ok((await notifications.getReadKeys(director.id)).includes(readKey));
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (app) await app.close();
    // These IDs are unique to this test; concurrent notification integration
    // tests and application records never appear in cleanup predicates.
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (directorateIds.length) await prisma.directorate.deleteMany({ where: { id: { in: directorateIds } } });
    await prisma.$disconnect();
  }
});
