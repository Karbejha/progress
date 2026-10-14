const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeNotificationPayload, toNotificationIntegerId, isNotificationForUser } = require('../../client/src/lib/notificationPayload');

test('FCM canonical UUID and parsed metadata survive a cold-start tap', () => {
  const payload = normalizeNotificationPayload({
    notificationId: 'database-notification', id: 'legacy-id', type: 'EXECUTIVE_TASK',
    referenceId: 'task-id', userId: 'user-a', title: 'Assignment', message: 'Read me',
    metadata: JSON.stringify({ assignedByName: 'Director', isShared: true }),
  }, { id: 'fcm-transport-id', body: 'Fallback' });
  assert.equal(payload.id, 'database-notification');
  assert.equal(payload.notificationId, 'database-notification');
  assert.equal(payload.referenceId, 'task-id');
  assert.equal(payload.type, 'executive-task');
  assert.equal(payload.content, 'Read me');
  assert.equal(payload.assignedByName, 'Director');
  assert.equal(payload.isShared, true);
});

test('local object metadata and string boolean values normalize without losing the canonical ID', () => {
  const payload = normalizeNotificationPayload({ id: 'notification', type: 'ANNOUNCEMENT',
    metadata: { id: 'announcement', authorName: 'Director', content: 'Full circular' }, isShared: 'false' });
  assert.equal(payload.id, 'notification');
  assert.equal(payload.authorName, 'Director');
  assert.equal(payload.content, 'Full circular');
  assert.equal(payload.isShared, false);
});

test('malformed metadata does not break notification display or cold-start recovery', () => {
  for (const metadata of ['{bad-json', 'null', '[]', 123]) {
    assert.deepEqual(normalizeNotificationPayload({ id: 'notification', metadata }).metadata, {});
  }
  assert.equal(normalizeNotificationPayload(null), null);
  assert.equal(normalizeNotificationPayload({}), null);
});

test('late pushes for another account and notifications after logout are rejected', () => {
  assert.equal(isNotificationForUser({ userId: 'user-a' }, 'user-a'), true);
  assert.equal(isNotificationForUser({ userId: 'user-a' }, 'user-b'), false);
  assert.equal(isNotificationForUser({ userId: 'user-a' }, null), false);
  assert.equal(isNotificationForUser({}, null), false);
  assert.equal(isNotificationForUser({}, 'user-a'), true);
});

test('Android IDs are deterministic, positive, and fit a signed 32-bit integer', () => {
  for (const id of ['', 'zero', 'database-notification', 'إشعار رسمي', 'x'.repeat(500)]) {
    const integer = toNotificationIntegerId(id);
    assert.equal(integer, toNotificationIntegerId(id));
    assert.ok(Number.isInteger(integer) && integer > 0 && integer <= 2147483647);
  }
});
