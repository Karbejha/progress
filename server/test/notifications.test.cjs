const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NotificationsService } = require('../src/notifications/notifications.service');
const { NotificationsController } = require('../src/notifications/notifications.controller');
const { validate } = require('class-validator');
const { RegisterDeviceTokenDto } = require('../src/notifications/dto/device-token.dto');

function fixture(prisma = {}) {
  const events = [], pushes = [];
  const service = new NotificationsService(prisma, {
    emitNotificationCreated: (userId, notification) => events.push({ userId, notification }),
    emitNotificationsRead: (userId, readKeys) => events.push({ userId, readKeys }),
  });
  service.logger = { error() {}, warn() {}, debug() {}, log() {} };
  service.sendPushToUser = async (userId, payload) => pushes.push({ userId, payload });
  return { service, events, pushes };
}

const input = {
  type: 'feedback', title: 'New guidance', message: 'Please review', referenceId: 'feedback-1',
  metadata: { directorateId: 'directorate-1' },
};

test('socket and push carry the saved notification ID only after persistence completes', async () => {
  let release;
  const save = new Promise(resolve => { release = resolve; });
  const { service, events, pushes } = fixture({ notification: { create: () => save } });
  const pending = service.createNotification({ ...input, userId: 'user-1' });
  assert.equal(events.length, 0);
  assert.equal(pushes.length, 0);
  const record = { ...input, userId: 'user-1', id: 'saved-id', createdAt: new Date('2026-10-14T10:00:00Z') };
  release(record);
  assert.strictEqual(await pending, record);
  assert.deepEqual(events, [{ userId: 'user-1', notification: record }]);
  assert.equal(pushes[0].payload.data.id, record.id);
  assert.equal(pushes[0].payload.data.notificationId, record.id);
  assert.equal(pushes[0].payload.data.userId, 'user-1');
  assert.equal(pushes[0].payload.data.createdAt, record.createdAt.toISOString());
  assert.deepEqual(JSON.parse(pushes[0].payload.data.metadata), input.metadata);
});

test('role fanout assigns durable unique IDs for every recipient and honors author exclusion', async () => {
  let recipients, saved;
  const { service, events, pushes } = fixture({
    user: { findMany: async (query) => { recipients = query; return [{ id: 'a' }, { id: 'b' }, { id: 'a' }]; } },
    notification: { createMany: async ({ data }) => { saved = data; return { count: data.length }; } },
  });
  await service.createNotificationForRoles(['GENERAL_DIRECTOR', 'OBSERVER'], input, 'author');
  assert.deepEqual(recipients.where.id, { not: 'author' });
  assert.deepEqual(recipients.where.role.in, ['GENERAL_DIRECTOR', 'OBSERVER']);
  assert.equal(recipients.where.isActive, true);
  assert.equal(saved.length, 2);
  assert.notEqual(saved[0].id, saved[1].id);
  assert.deepEqual(events.map(e => e.notification.id), saved.map(n => n.id));
  assert.deepEqual(pushes.map(p => p.payload.data.notificationId), saved.map(n => n.id));
});

test('a failed database write surfaces an error and cannot announce an unsaved notification', async () => {
  const failure = new Error('offline');
  const { service, events, pushes } = fixture({ notification: { create: async () => { throw failure; } } });
  await assert.rejects(service.createNotification({ ...input, userId: 'user-1' }), failure);
  assert.equal(events.length, 0);
  assert.equal(pushes.length, 0);
});

test('server startup does not invent historical alerts from silent autosaves', async () => {
  const previous = process.env.NOTIFICATION_HISTORY_BACKFILL;
  delete process.env.NOTIFICATION_HISTORY_BACKFILL;
  try {
    const { service } = fixture();
    let backfills = 0;
    service.autoBackfillHistoricalNotifications = async () => { backfills++; };
    await service.onModuleInit();
    assert.equal(backfills, 0);
    process.env.NOTIFICATION_HISTORY_BACKFILL = 'true';
    await service.onModuleInit();
    assert.equal(backfills, 1);
  } finally {
    if (previous === undefined) delete process.env.NOTIFICATION_HISTORY_BACKFILL;
    else process.env.NOTIFICATION_HISTORY_BACKFILL = previous;
  }
});

test('long Unicode content stays within FCM budget while complete detail remains in the saved record', () => {
  const { service } = fixture();
  const record = {
    ...input, id: 'n', userId: 'u', createdAt: new Date(), title: '🚢'.repeat(2000),
    message: 'إشعار مهم '.repeat(3000), metadata: { description: 'x'.repeat(6000) },
  };
  const payload = service.notificationPushPayload(record);
  assert.ok(Buffer.byteLength(payload.title, 'utf8') <= 200);
  assert.ok(Buffer.byteLength(payload.body, 'utf8') <= 800);
  assert.equal(payload.data.metadata, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(payload), 'utf8') < 3600);
  assert.equal(record.metadata.description.length, 6000);
  assert.ok(!payload.title.includes('\ufffd'));
});

test('Firebase Admin v14 modular APIs reuse the default app across simultaneous recipients without sending', async () => {
  const { getApps, initializeApp, deleteApp } = require('firebase-admin/app');
  assert.equal(getApps().length, 0, 'This test never accesses production credentials');
  const app = initializeApp({
    projectId: 'notification-offline-test',
    credential: { getAccessToken: async () => { throw new Error('Network access forbidden in this test'); } },
  });
  try {
    const { service } = fixture();
    const [first, second] = await Promise.all([service.getMessagingClient(), service.getMessagingClient()]);
    assert.ok(first);
    assert.strictEqual(first, second);
    assert.strictEqual(first.app, app);
    assert.equal(getApps().length, 1);
  } finally {
    await deleteApp(app);
  }
});

test('background FCM has display notification, canonical data, Android channel, and iOS alert settings', async () => {
  const messages = [], deleted = [];
  const { service } = fixture({ deviceToken: {
    findMany: async ({ where }) => {
      assert.deepEqual(where, { userId: 'user-1', user: { isActive: true } });
      return [{ token: 'good-device' }, { token: 'expired-device' }, { token: 'temporary-failure' }];
    },
    deleteMany: async ({ where }) => deleted.push(where),
  } });
  // Exercise the real delivery method; all network calls are replaced by this stub.
  service.sendPushToUser = NotificationsService.prototype.sendPushToUser;
  service.getMessagingClient = async () => ({ send: async (message) => {
    if (message.token === 'expired-device') throw { code: 'messaging/registration-token-not-registered' };
    if (message.token === 'temporary-failure') throw { code: 'messaging/server-unavailable' };
    messages.push(message);
  } });
  await service.sendPushToUser('user-1', { title: 'Title', body: 'Body', data: { notificationId: 'n' } });
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].notification, { title: 'Title', body: 'Body' });
  assert.equal(messages[0].data.notificationId, 'n');
  assert.equal(messages[0].android.priority, 'high');
  assert.equal(messages[0].android.notification.channelId, 'ports_urgent');
  assert.equal(messages[0].android.notification.icon, 'ic_stat_notification');
  assert.equal(messages[0].apns.headers['apns-push-type'], 'alert');
  assert.equal(messages[0].apns.payload.aps.sound, 'default');
  assert.deepEqual(deleted, [{ token: 'expired-device', userId: 'user-1' }]);
});

test('account switching atomically transfers a device token and retries a concurrent uniqueness conflict', async () => {
  const writes = [];
  let attempts = 0;
  const prisma = {
    $executeRaw: async (_query, token) => writes.push({ lock: token }),
    deviceToken: {
      deleteMany: async ({ where }) => writes.push({ delete: where }),
      upsert: async (query) => writes.push({ upsert: query }),
    },
    $transaction: async (fn) => {
      attempts++;
      if (attempts === 1) throw { code: 'P2002' };
      return fn(prisma);
    },
  };
  const { service } = fixture(prisma);
  assert.deepEqual(await service.registerDeviceToken('new-user', 'device-token', 'android'), { success: true });
  assert.equal(attempts, 2);
  assert.deepEqual(writes[0], { lock: 'device-token' });
  assert.deepEqual(writes[1], { delete: { token: 'device-token', userId: { not: 'new-user' } } });
  assert.deepEqual(writes[2].upsert.where, { userId_token: { userId: 'new-user', token: 'device-token' } });
  assert.deepEqual(writes[2].upsert.create, { userId: 'new-user', token: 'device-token', platform: 'android' });
});

test('device registration validates token and platform and surfaces storage failure instead of false success', async () => {
  const { service } = fixture({ $transaction: async () => { throw new Error('storage unavailable'); } });
  await assert.rejects(service.registerDeviceToken('u', '   '), /valid device token/);
  await assert.rejects(service.registerDeviceToken('u', 'token', 'desktop'), /Invalid device platform/);
  await assert.rejects(service.registerDeviceToken('u', 'token'), /storage unavailable/);
  const dto = Object.assign(new RegisterDeviceTokenDto(), { token: ' ', platform: 'anything' });
  assert.ok((await validate(dto)).length >= 2);
});

test('marking a canonical announcement notification read updates shared read state and announcement indicator atomically', async () => {
  const readKeys = new Set(['previous-key']), announcementReads = new Set();
  let announcementLookup, emitted, transactions = 0;
  const prisma = {
    notificationRead: {
      createMany: async ({ data, skipDuplicates }) => {
        assert.equal(skipDuplicates, true);
        data.forEach(row => readKeys.add(row.notificationKey));
      },
      findMany: async ({ where }) => {
        assert.equal(where.userId, 'user-1');
        return [...readKeys].map(notificationKey => ({ notificationKey }));
      },
    },
    notification: { findMany: async ({ where }) => {
      assert.deepEqual(where, { userId: 'user-1', id: { in: ['saved-announcement'] }, type: 'announcement' });
      return [{ referenceId: 'announcement-entity' }];
    } },
    announcement: { findMany: async ({ where }) => {
      announcementLookup = where.id.in;
      return [{ id: 'announcement-entity' }];
    } },
    announcementRead: {
      createMany: async ({ data }) => data.forEach(row => announcementReads.add(row.announcementId)),
      findMany: async () => [...announcementReads].map(announcementId => ({ announcementId })),
    },
    $transaction: async (fn) => { transactions++; return fn(prisma); },
  };
  const { service, events } = fixture(prisma);
  const response = await service.markKeysAsRead('user-1', ['saved-announcement', ' saved-announcement ']);
  assert.equal(transactions, 1);
  assert.equal(response.count, 1);
  assert.deepEqual(announcementLookup, ['saved-announcement', 'announcement-entity']);
  assert.deepEqual(new Set(response.readKeys), new Set(['previous-key', 'saved-announcement', 'announcement-entity']));
  assert.deepEqual(events, [{ userId: 'user-1', readKeys: response.readKeys }]);
  assert.deepEqual((await service.markKeysAsRead('user-1', [])).readKeys, response.readKeys);
});

test('missed notification recovery returns every matching record and rejects an invalid date', async () => {
  const records = Array.from({ length: 75 }, (_, i) => ({ id: `n-${i}` }));
  const since = new Date('2026-10-13T12:00:00Z');
  let query;
  const { service } = fixture({ notification: { findMany: async (args) => { query = args; return records; } } });
  assert.equal((await service.getNotificationsSince('u', since)).length, 75);
  assert.deepEqual(query.where, { userId: 'u', createdAt: { gt: since } });
  assert.equal(query.take, undefined);
  await assert.rejects(service.getNotificationsSince('u', new Date('invalid')), /Invalid notification recovery date/);
  const controller = new NotificationsController(service);
  await assert.rejects(controller.getNotificationsSince({ user: { id: 'u' } }, 'bad-date'), /valid date/);
  await assert.rejects(controller.getUserNotifications({ user: { id: 'u' } }, '-10'), /positive integer/);
});

test('opening an older push retrieves its full saved detail only for the owning user', async () => {
  const record = { id: 'old-notification', userId: 'owner', metadata: { detail: 'full content omitted from push' } };
  const { service } = fixture({ notification: { findFirst: async ({ where }) => {
    assert.equal(where.id, record.id);
    return where.userId === record.userId ? record : null;
  } } });
  assert.strictEqual(await service.getNotification('owner', record.id), record);
  await assert.rejects(service.getNotification('other-user', record.id), /Notification not found/);
});

test('push status exposes setup and user registration counts without credentials or device tokens', async () => {
  const { service } = fixture({ deviceToken: { findMany: async ({ where }) => {
    assert.deepEqual(where, { userId: 'u' });
    return [{ platform: 'android' }, { platform: 'android' }, { platform: 'ios' }];
  } } });
  service.getMessagingClient = async () => ({});
  assert.deepEqual(await service.getPushStatus('u'), {
    serverConfigured: true, registeredDevices: 3, platforms: ['android', 'ios'],
  });
});
