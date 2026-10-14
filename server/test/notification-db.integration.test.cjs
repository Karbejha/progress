const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient, Role } = require('@prisma/client');
const { NotificationsService } = require('../src/notifications/notifications.service');

function isolatedDatabaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid notification test database URL'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.port !== '55432' || url.pathname !== '/notification_audit'
    || (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public')) {
    throw new Error('Notification integration tests require the isolated local notification_audit database on port 55432');
  }
  return url.toString();
}

test('PostgreSQL: notification persistence, read state, recovery, token ownership and legacy upgrade', {
  skip: !process.env.NOTIFICATION_TEST_DATABASE_URL,
  timeout: 30000,
}, async (t) => {
  // Never modify the main DATABASE_URL or connect using its implicit datasource.
  const prisma = new PrismaClient({ datasourceUrl: isolatedDatabaseUrl(process.env.NOTIFICATION_TEST_DATABASE_URL) });
  const prefix = `notification-audit-${randomUUID()}`;
  const userIds = ['author', 'director', 'observer', 'assistant', 'inactive', 'other'].map(name => `${prefix}-${name}`);
  const [authorId, directorId, observerId, assistantId, inactiveId, otherId] = userIds;
  const directorateIds = [`${prefix}-directorate-a`, `${prefix}-directorate-b`];
  const events = [], pushes = [], readEvents = [];
  const gateway = {
    emitNotificationCreated: (userId, notification) => events.push({ userId, notification }),
    emitNotificationsRead: (userId, readKeys) => readEvents.push({ userId, readKeys }),
  };
  const service = new NotificationsService(prisma, gateway);
  service.logger = { warn() {}, error() {}, log() {}, debug() {} };
  // A real FCM client is never initialized or called by this integration suite.
  service.sendPushToUser = async (userId, payload) => pushes.push({ userId, payload });
  const data = (reference, type = 'task') => ({
    type, title: 'Notification integration', message: 'Saved test content',
    referenceId: `${prefix}-${reference}`, metadata: { test: prefix, taskId: 'test-task' },
  });
  try {
    await prisma.directorate.createMany({ data: directorateIds.map((id, i) => ({
      id, code: `${prefix}-code-${i}`, name: `Notification audit ${i}`, category: 'TEST',
    })) });
    const roles = [Role.GENERAL_DIRECTOR, Role.DIRECTOR, Role.OBSERVER, Role.ASSISTANT_DIRECTOR, Role.GENERAL_DIRECTOR, Role.DIRECTOR];
    await prisma.user.createMany({ data: userIds.map((id, i) => ({
      id, username: id, email: `${id}@example.test`, password: 'unused-test-password',
      fullName: `Notification audit ${i}`, title: 'Test', role: roles[i], isActive: i !== 4,
      directorateId: i === 5 ? directorateIds[1] : directorateIds[0],
    })) });

    await t.test('role fanout saves exact canonical IDs before targeted delivery and excludes author/inactive users', async () => {
      const notificationData = data('roles');
      const executiveRoles = [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER];
      await service.createNotificationForRoles(executiveRoles, notificationData, authorId);
      const records = await prisma.notification.findMany({ where: { referenceId: notificationData.referenceId } });
      // Other integration files may create/delete their own users concurrently.
      // The audience query stays broad; assertions cover this suite's stable fixtures.
      const ownRecords = records.filter(record => userIds.includes(record.userId));
      assert.deepEqual(new Set(ownRecords.map(record => record.userId)), new Set([observerId, assistantId]));
      assert.ok(records.some(record => record.userId === observerId));
      assert.ok(records.some(record => record.userId === assistantId));
      assert.ok(records.every(record => ![authorId, inactiveId, directorId].includes(record.userId)));
      assert.equal(new Set(records.map(record => record.id)).size, records.length);
      const savedById = new Map(ownRecords.map(record => [record.id, record]));
      const emitted = events.filter(event => event.notification.referenceId === notificationData.referenceId && userIds.includes(event.userId));
      assert.equal(emitted.length, ownRecords.length);
      for (const event of emitted) {
        assert.deepEqual(event.notification, savedById.get(event.notification.id));
        assert.equal(event.userId, event.notification.userId);
        const push = pushes.find(item => item.payload.data.notificationId === event.notification.id);
        assert.equal(push.userId, event.userId);
      }
    });

    await t.test('directorate and all-user audiences remain active and respect author exclusion', async () => {
      const directorateData = data('directorate');
      await service.createNotificationForDirectorate(directorateIds[0], directorateData, authorId);
      const records = await prisma.notification.findMany({ where: { referenceId: directorateData.referenceId } });
      assert.deepEqual(new Set(records.map(record => record.userId)), new Set([directorId, observerId, assistantId]));
      const allData = data('all');
      await service.createNotificationForAllUsers(allData, authorId);
      const everyone = await prisma.notification.findMany({ where: { referenceId: allData.referenceId } });
      const ownRecipients = everyone.filter(record => userIds.includes(record.userId)).map(record => record.userId);
      assert.deepEqual(new Set(ownRecipients), new Set([directorId, observerId, assistantId, otherId]));
      assert.ok(everyone.some(record => record.userId === otherId));
      assert.ok(everyone.every(record => record.userId !== inactiveId && record.userId !== authorId));
    });

    await t.test('same-task updates keep separate read IDs and detail lookup enforces ownership', async () => {
      const first = await service.createNotification({ ...data('stable-task'), userId: directorId });
      await service.markKeysAsRead(directorId, [first.id]);
      const second = await service.createNotification({ ...data('stable-task'), userId: directorId });
      assert.notEqual(first.id, second.id);
      assert.equal(first.referenceId, second.referenceId);
      const readKeys = await service.getReadKeys(directorId);
      assert.ok(readKeys.includes(first.id));
      assert.ok(!readKeys.includes(second.id));
      assert.ok(!readKeys.includes(first.referenceId));
      assert.deepEqual(await service.getNotification(directorId, first.id), first);
      await assert.rejects(service.getNotification(otherId, first.id), /Notification not found/);
      assert.ok(readEvents.some(event => event.userId === directorId && event.readKeys.includes(first.id)));
    });

    await t.test('recovery returns more than 50 missed records without leaking another user records', async () => {
      const since = new Date('2030-01-01T00:00:00.000Z');
      const records = Array.from({ length: 75 }, (_, i) => ({
        id: `${prefix}-recover-${i}`, userId: directorId, ...data(`recover-${i}`),
        createdAt: new Date(since.getTime() + i + 1),
      }));
      await prisma.notification.createMany({ data: records });
      await prisma.notification.create({ data: {
        userId: otherId, ...data('recover-foreign'), createdAt: new Date(since.getTime() + 100),
      } });
      const recovered = await service.getNotificationsSince(directorId, since);
      assert.equal(recovered.length, 75);
      assert.deepEqual(new Set(recovered.map(record => record.id)), new Set(records.map(record => record.id)));
      assert.ok(recovered.every(record => record.userId === directorId));
    });

    await t.test('announcement read commits both tables and rolls back both on a transactional failure', async () => {
      const announcement = await prisma.announcement.create({ data: {
        id: `${prefix}-announcement`, title: 'Audit announcement', content: 'Content', authorId,
      } });
      const notification = await service.createNotification({
        ...data('announcement', 'announcement'), referenceId: announcement.id, userId: directorId,
      });
      const brokenPrisma = {
        $transaction: (callback) => prisma.$transaction(tx => callback(new Proxy(tx, {
          get(target, property) {
            if (property === 'announcementRead') return { createMany: async () => { throw new Error('Injected read failure'); } };
            return Reflect.get(target, property);
          },
        }))),
      };
      const brokenService = new NotificationsService(brokenPrisma, gateway);
      await assert.rejects(brokenService.markKeysAsRead(directorId, [notification.id]), /Injected read failure/);
      assert.equal(await prisma.notificationRead.count({ where: { userId: directorId, notificationKey: notification.id } }), 0);
      assert.equal(await prisma.announcementRead.count({ where: { userId: directorId, announcementId: announcement.id } }), 0);
      await service.markKeysAsRead(directorId, [notification.id, notification.id]);
      assert.equal(await prisma.notificationRead.count({ where: { userId: directorId, notificationKey: notification.id } }), 1);
      assert.equal(await prisma.announcementRead.count({ where: { userId: directorId, announcementId: announcement.id } }), 1);
      const readKeys = await service.getReadKeys(directorId);
      assert.ok(readKeys.includes(notification.id));
      assert.ok(readKeys.includes(announcement.id));
    });

    await t.test('concurrent account transfers cannot leave a token linked to multiple users', async () => {
      const token = `${prefix}-shared-device`;
      await service.registerDeviceToken(authorId, token);
      for (let i = 0; i < 5; i++) {
        await Promise.all([
          service.registerDeviceToken(directorId, token, 'android'),
          service.registerDeviceToken(otherId, token, 'android'),
        ]);
        const rows = await prisma.deviceToken.findMany({ where: { token } });
        assert.equal(rows.length, 1);
        assert.ok([directorId, otherId].includes(rows[0].userId));
      }
      const [owned] = await prisma.deviceToken.findMany({ where: { token } });
      const formerOwner = owned.userId === directorId ? otherId : directorId;
      await service.unregisterDeviceToken(formerOwner, token);
      assert.equal(await prisma.deviceToken.count({ where: { token } }), 1);
      await service.unregisterDeviceToken(owned.userId, token);
      assert.equal(await prisma.deviceToken.count({ where: { token } }), 0);
    });

    await t.test('the upgrade reconciles old duplicate device ownership before installing uniqueness', async () => {
      const migrationSql = fs.readFileSync(path.join(__dirname, '../prisma/prepare-device-tokens.sql'), 'utf8');
      const token = `${prefix}-legacy-device`;
      // This DDL executes only in the explicitly refused-safe audit database.
      // Index changes and duplicate fixture rows roll back together on failure.
      await prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe('DROP INDEX "DeviceToken_token_key"');
        await tx.deviceToken.createMany({ data: [
          { id: `${prefix}-legacy-old`, userId: directorId, token, updatedAt: new Date('2020-01-01T00:00:00Z') },
          { id: `${prefix}-legacy-new`, userId: otherId, token, updatedAt: new Date('2021-01-01T00:00:00Z') },
        ] });
        await tx.$executeRawUnsafe(migrationSql);
        const rows = await tx.deviceToken.findMany({ where: { token } });
        assert.equal(rows.length, 1);
        assert.equal(rows[0].userId, otherId);
      });
      await assert.rejects(prisma.deviceToken.create({ data: { userId: directorId, token } }), error => error.code === 'P2002');
      await prisma.$executeRawUnsafe(migrationSql);
      assert.equal(await prisma.deviceToken.count({ where: { token } }), 1, 'The upgrade can run repeatedly');
    });
  } finally {
    try {
      // References, IDs and user IDs are generated by this test only. No table-wide cleanup.
      await prisma.notification.deleteMany({ where: { referenceId: { startsWith: prefix } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.directorate.deleteMany({ where: { id: { in: directorateIds } } });
    } finally {
      await prisma.$disconnect();
    }
  }
});
