const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

function makeApi(fetch) {
  const window = new EventTarget();
  window.location = { hostname: 'localhost', origin: 'http://localhost' };
  const store = new Map();
  const localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../../client/src/services/api.ts'), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
  vm.runInNewContext(javascript, {
    module, exports: module.exports, window, localStorage, fetch,
    CustomEvent, FormData, AbortController, setTimeout, clearTimeout, URL,
    process: { env: {} }, console: { warn: () => {} },
    require: (name) => { throw new Error(`Unexpected dependency ${name}`); },
  });
  return { api: module.exports.api, window, store };
}

test('a late 401 from a previous account cannot log out the new account', async () => {
  let finishRequest;
  const { api, window } = makeApi(() => new Promise((resolve) => { finishRequest = resolve; }));
  let expiredEvents = 0;
  window.addEventListener('ports:session_expired', () => expiredEvents++);
  api.setToken('session-a');
  api.setCurrentUser({ id: 'user-a' });
  const request = api.getMe();
  api.setToken('session-b');
  api.setCurrentUser({ id: 'user-b' });
  finishRequest({ ok: false, status: 401, text: async () => JSON.stringify({ message: 'Expired old session' }) });
  await assert.rejects(request, /Expired old session/);
  assert.equal(api.getToken(), 'session-b');
  assert.equal(api.getCurrentUser().id, 'user-b');
  assert.equal(expiredEvents, 0);
});

test('logout clears authentication synchronously and unlinks using captured previous credentials', () => {
  const requests = [];
  const { api, window, store } = makeApi((url, options) => {
    requests.push({ url, options });
    return new Promise(() => {});
  });
  const events = [];
  window.addEventListener('ports:auth_changed', (event) => events.push(event.detail));
  api.setToken('session-a');
  api.setCurrentUser({ id: 'user-a' });
  store.set('ports_device_token', 'device-a');
  api.logout();
  assert.equal(api.getToken(), null);
  assert.equal(api.getCurrentUser(), null);
  assert.equal(store.has('ports_device_token'), false);
  assert.equal(events.at(-1).authenticated, false);
  assert.equal(requests[0].options.headers.Authorization, 'Bearer session-a');
  assert.equal(JSON.parse(requests[0].options.body).token, 'device-a');
  api.setToken('session-b');
  api.setCurrentUser({ id: 'user-b' });
  assert.equal(requests[0].options.headers.Authorization, 'Bearer session-a');
  assert.equal(api.getToken(), 'session-b');
});

test('device registration returns backend failure and includes a cancellable request signal', async () => {
  const requests = [];
  const { api } = makeApi(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ success: false }) };
  });
  api.setToken('session-a');
  api.setCurrentUser({ id: 'user-a' });
  assert.equal(await api.registerDeviceToken('device-a', 'android'), false);
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  assert.equal(requests[0].options.signal.aborted, false);
});
