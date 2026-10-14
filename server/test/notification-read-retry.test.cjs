const { test } = require('node:test');
const assert = require('node:assert/strict');
const { api } = require('../../client/src/services/api');
const { markNotificationAsRead, getReadNotificationIds, flushPendingNotificationReads } = require('../../client/src/lib/announcements');

test('offline read state survives retry and cannot be uploaded by another account', async () => {
  const oldWindow = global.window, oldStorage = global.localStorage, oldEvent = global.CustomEvent;
  const original = { getToken: api.getToken, getCurrentUser: api.getCurrentUser, markNotificationsRead: api.markNotificationsRead };
  const storage = new Map();
  global.window = { dispatchEvent() {} };
  global.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  global.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  };
  let userId = 'user-1', fail = true;
  const writes = [];
  api.getToken = () => 'test-auth';
  api.getCurrentUser = () => ({ id: userId });
  api.markNotificationsRead = async (keys) => {
    if (fail) throw new Error('offline');
    writes.push({ userId, keys });
  };
  try {
    markNotificationAsRead('user-1', 'saved-notification');
    await flushPendingNotificationReads('user-1');
    assert.deepEqual(getReadNotificationIds('user-1'), ['saved-notification']);
    assert.deepEqual(JSON.parse(storage.get('ports_pending_notification_reads_user-1')), ['saved-notification']);
    fail = false;
    userId = 'user-2';
    await flushPendingNotificationReads('user-1');
    assert.deepEqual(writes, []);
    userId = 'user-1';
    await flushPendingNotificationReads('user-1');
    assert.deepEqual(writes, [{ userId: 'user-1', keys: ['saved-notification'] }]);
    assert.deepEqual(JSON.parse(storage.get('ports_pending_notification_reads_user-1')), []);
  } finally {
    Object.assign(api, original);
    global.window = oldWindow; global.localStorage = oldStorage; global.CustomEvent = oldEvent;
  }
});
