const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toInboxNotification, isInboxNotificationRead, mergeInboxNotifications } = require('../../client/src/lib/notificationInbox');

const record = (id, extra = {}) => toInboxNotification({
  id, type: 'task', title: 'Progress', message: 'Updated', referenceId: 'task-1',
  createdAt: '2026-10-14T08:00:00.000Z', ...extra,
});

test('reading one update does not read future updates to the same task', () => {
  const first = record('notification-1');
  const second = record('notification-2');
  const reads = ['notification-1', 'task-1'];
  assert.equal(isInboxNotificationRead(first, reads), true);
  assert.equal(isInboxNotificationRead(second, reads), false);
});

test('announcement reads retain the shared announcement identity', () => {
  assert.equal(isInboxNotificationRead(record('n', { type: 'announcement', referenceId: 'announcement-1' }), ['announcement-1']), true);
});

test('executive assignments open task details and preserve rich metadata', () => {
  const item = record('n', { type: 'executive-task', metadata: { taskId: 'task-1', description: 'Details', priority: 'HIGH' } });
  assert.equal(item.type, 'task');
  assert.equal(item.content, 'Details');
  assert.equal(item.fullPayload.taskId, 'task-1');
  assert.equal(item.fullPayload.dbId, 'n');
});

test('refresh merges without losing concurrent live records or duplicating notification IDs', () => {
  const old = record('old');
  const live = record('live', { createdAt: '2026-10-14T08:01:00.000Z' });
  const refreshed = record('old', { title: 'Canonical title' });
  const merged = mergeInboxNotifications([live, old], [refreshed]);
  assert.deepEqual(merged.map((n) => n.id), ['live', 'old']);
  assert.equal(merged[1].title, 'Canonical title');
  assert.deepEqual(mergeInboxNotifications(merged, [refreshed], 1).map((n) => n.id), ['live']);
});
