const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const payloadHelpers = require('../../client/src/lib/notificationPayload');

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise(setImmediate);
};

function makeService({ loggedIn = true, backendAvailable = true } = {}) {
  const window = new EventTarget();
  const store = new Map();
  const localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const calls = [];
  const pushListeners = new Map();
  const localListeners = new Map();
  const appListeners = new Map();
  const state = { userId: loggedIn ? 'user-a' : null, authToken: loggedIn ? 'session-a' : null, backendAvailable };
  window.setInterval = (callback) => { state.retry = callback; return 1; };
  const listener = (map) => async (name, callback) => {
    calls.push(`listener:${name}`);
    map.set(name, callback);
    return { remove: async () => map.delete(name) };
  };
  const PushNotifications = {
    addListener: listener(pushListeners),
    checkPermissions: async () => ({ receive: 'granted' }),
    requestPermissions: async () => { calls.push('push-permission'); return { receive: 'granted' }; },
    register: async () => {
      calls.push('register');
      assert.ok(pushListeners.has('registration'));
      assert.ok(pushListeners.has('pushNotificationActionPerformed'));
      pushListeners.get('registration')({ value: state.nativeToken || 'native-token' });
    },
    unregister: async () => { calls.push('unregister'); },
    removeAllDeliveredNotifications: async () => { calls.push('clear-push'); },
  };
  const LocalNotifications = {
    addListener: listener(localListeners),
    createChannel: async (channel) => {
      calls.push(`channel:${channel.id}`);
      if (state.channelUnavailable) throw new Error('Unavailable below Android O');
    },
    checkPermissions: async () => ({ display: 'granted' }),
    requestPermissions: async () => { calls.push('local-permission'); return { display: 'granted' }; },
    schedule: async (notification) => { calls.push(notification); },
    removeAllDeliveredNotifications: async () => { calls.push('clear-local'); },
  };
  const api = {
    getToken: () => state.authToken,
    getCurrentUser: () => state.userId ? { id: state.userId } : null,
    registerDeviceToken: async (token, platform) => {
      calls.push({ binding: true, userId: state.userId, token, platform });
      return state.registerDeviceToken ? state.registerDeviceToken(token, state.userId) : state.backendAvailable;
    },
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../../client/src/lib/notifications.ts'), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  vm.runInNewContext(javascript, {
    module, exports: module.exports, window, localStorage,
    document: { visibilityState: 'visible' }, CustomEvent,
    console: { warn: () => {}, error: () => {}, log: () => {} },
    require: (name) => {
      if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } };
      if (name === '@capacitor/app') return { App: { getState: async () => ({ isActive: true }), addListener: listener(appListeners) } };
      if (name === '@capacitor/local-notifications') return { LocalNotifications };
      if (name === '@capacitor/push-notifications') return { PushNotifications };
      if (name === '../services/api') return { api };
      if (name === './notificationPayload') return payloadHelpers;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const authChanged = (userId, authToken) => {
    state.userId = userId;
    state.authToken = authToken;
    window.dispatchEvent(new CustomEvent('ports:auth_changed', { detail: { authenticated: Boolean(userId && authToken) } }));
  };
  return { service: module.exports, calls, state, window, store, pushListeners, localListeners, appListeners, authChanged };
}

test('anonymous startup installs listeners and login registers exactly once with the authenticated backend', async () => {
  const context = makeService({ loggedIn: false });
  await context.service.initNotificationService();
  await context.service.initNotificationService();
  assert.equal(context.calls.filter((call) => call === 'register').length, 0);
  context.authChanged('user-a', 'session-a');
  await settle();
  assert.equal(context.calls.filter((call) => call === 'register').length, 1);
  assert.equal(context.calls.filter((call) => call?.binding).length, 1);
  assert.equal(context.calls.filter((call) => call === 'listener:registration').length, 1);
  assert.equal(context.store.get('ports_device_token'), 'native-token');
});

test('backend binding failure retries after resume and never records false success', async () => {
  const context = makeService({ backendAvailable: false });
  await context.service.initNotificationService();
  assert.equal(context.calls.filter((call) => call?.binding).length, 1);
  context.state.backendAvailable = true;
  context.appListeners.get('appStateChange')({ isActive: true });
  await settle();
  assert.equal(context.calls.filter((call) => call?.binding).length, 2);
  await context.service.registerPushNotifications();
  assert.equal(context.calls.filter((call) => call?.binding).length, 2);
});

test('Android 7 channel unavailability does not prevent supported native push registration', async () => {
  const context = makeService();
  context.state.channelUnavailable = true;
  await context.service.initNotificationService();
  assert.equal(context.calls.filter((call) => call === 'register').length, 1);
  assert.equal(context.calls.filter((call) => call?.binding).length, 1);
});

test('account switching during an in-flight backend binding retries for the new session immediately', async () => {
  const context = makeService({ loggedIn: false });
  await context.service.initNotificationService();
  let finishFirstBinding;
  let attempts = 0;
  context.state.registerDeviceToken = () => ++attempts === 1
    ? new Promise((resolve) => { finishFirstBinding = resolve; }) : true;
  context.authChanged('user-a', 'session-a');
  await settle();
  assert.equal(attempts, 1);
  context.authChanged('user-b', 'session-b');
  finishFirstBinding(true);
  await settle();
  const bindings = context.calls.filter((call) => call?.binding);
  assert.equal(bindings.length, 2);
  assert.equal(bindings[0].userId, 'user-a');
  assert.equal(bindings[1].userId, 'user-b');
  await context.service.registerPushNotifications();
  assert.equal(context.calls.filter((call) => call?.binding).length, 2);
});

test('token rotation during an in-flight backend binding does not lose the refreshed token', async () => {
  const context = makeService();
  let finishFirstBinding;
  let attempts = 0;
  context.state.registerDeviceToken = () => ++attempts === 1
    ? new Promise((resolve) => { finishFirstBinding = resolve; }) : true;
  const initialized = context.service.initNotificationService();
  await settle();
  context.pushListeners.get('registration')({ value: 'refreshed-token' });
  context.state.nativeToken = 'refreshed-token';
  finishFirstBinding(true);
  await initialized;
  await settle();
  assert.deepEqual(context.calls.filter((call) => call?.binding).map((call) => call.token), ['native-token', 'refreshed-token']);
  await context.service.registerPushNotifications();
  assert.equal(attempts, 2);
});

test('resume rechecks a rotated native token even when the previous backend binding succeeded', async () => {
  const context = makeService();
  await context.service.initNotificationService();
  context.state.nativeToken = 'rotated-outside-js';
  context.appListeners.get('appStateChange')({ isActive: true });
  await settle();
  assert.deepEqual(context.calls.filter((call) => call?.binding).map((call) => call.token), ['native-token', 'rotated-outside-js']);
});

test('an offline backend binding does not delay native token deletion at logout', async () => {
  const context = makeService();
  let finishBinding;
  context.state.registerDeviceToken = () => new Promise((resolve) => { finishBinding = resolve; });
  const initialized = context.service.initNotificationService();
  await settle();
  context.authChanged(null, null);
  await settle();
  assert.ok(context.calls.includes('unregister'));
  assert.equal(context.store.has('ports_device_token'), false);
  finishBinding(false);
  await initialized;
});

test('socket and FCM foreground delivery produce one local notification; background and wrong-account pushes produce none', async () => {
  const context = makeService();
  await context.service.initNotificationService();
  const item = { id: 'database-notification', notificationId: 'database-notification', userId: 'user-a', type: 'task', title: 'Task', message: 'New assignment' };
  await context.service.notifyGeneric(item);
  context.pushListeners.get('pushNotificationReceived')({ id: 'fcm-id', data: item, title: item.title, body: item.message });
  await settle();
  const scheduled = context.calls.filter((call) => call?.notifications);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].notifications[0].extra.notificationId, 'database-notification');
  assert.equal(scheduled[0].notifications[0].extra.userId, 'user-a');
  context.appListeners.get('appStateChange')({ isActive: false });
  await context.service.notifyGeneric({ ...item, id: 'background-item' });
  context.pushListeners.get('pushNotificationReceived')({ id: 'fcm-other', data: { ...item, id: 'wrong-user', notificationId: 'wrong-user', userId: 'user-b' } });
  await settle();
  assert.equal(context.calls.filter((call) => call?.notifications).length, 1);
});

test('cold-start taps wait for Header subscription and drain once with parsed metadata', async () => {
  const context = makeService();
  await context.service.initNotificationService();
  context.pushListeners.get('pushNotificationActionPerformed')({ notification: { id: 'fcm-id', data: {
    notificationId: 'canonical-id', userId: 'user-a', type: 'ANNOUNCEMENT', referenceId: 'announcement-id',
    metadata: JSON.stringify({ authorName: 'Director' }),
  } } });
  const received = [];
  const unsubscribe = context.service.subscribeToNotificationClicks((event) => received.push(event.detail));
  assert.equal(received.length, 1);
  assert.equal(received[0].id, 'canonical-id');
  assert.equal(received[0].referenceId, 'announcement-id');
  assert.equal(received[0].authorName, 'Director');
  unsubscribe();
  context.service.subscribeToNotificationClicks((event) => received.push(event.detail))();
  assert.equal(received.length, 1);
});

test('logout rotates the native token, clears delivered notifications, and rejects late pushes', async () => {
  const context = makeService();
  await context.service.initNotificationService();
  context.authChanged(null, null);
  await settle();
  assert.ok(context.calls.includes('unregister'));
  assert.ok(context.calls.includes('clear-push'));
  assert.ok(context.calls.includes('clear-local'));
  assert.equal(context.store.has('ports_device_token'), false);
  context.pushListeners.get('registration')({ value: 'late-token' });
  context.pushListeners.get('pushNotificationReceived')({ data: { id: 'late-push', userId: 'user-a', title: 'Late notification' } });
  await settle();
  assert.equal(context.store.has('ports_device_token'), false);
  assert.equal(context.calls.filter((call) => call?.notifications).length, 0);
  context.authChanged('user-b', 'session-b');
  await settle();
  assert.equal(context.calls.filter((call) => call?.binding).at(-1).userId, 'user-b');
});
