const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the real hook with controlled network responses and browser events.
function makeOverview() {
  const slots = [];
  let cursor = 0;
  let date = '2026-10-27';
  let effects = [];
  const requests = [];
  const errors = [];
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const socket = new EventEmitter();
  const changed = (previous, deps) => !previous || deps.some((dep, i) => dep !== previous[i]);
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: initial };
      return [slots[index].value, (value) => { slots[index].value = value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../../client/src/hooks/useExecutiveOverview.ts'), 'utf8');
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
  }).outputText, {
    exports, window, document, console: { error: (...args) => errors.push(args) },
    require(name) {
      if (name === 'react') return react;
      if (name === '../lib/socket') return { getSocket: () => socket };
      if (name === '../services/api') return { api: { getExecutiveOverview(requestDate) {
        return new Promise((resolve, reject) => requests.push({ date: requestDate, resolve, reject }));
      } } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const render = (nextDate = date) => {
    date = nextDate;
    cursor = 0;
    const result = exports.useExecutiveOverview(date);
    const pending = effects;
    effects = [];
    pending.forEach(effect => effect());
    return result;
  };
  const unmount = () => slots.forEach(slot => slot.cleanup?.());
  render();
  return { render, unmount, requests, errors, window, document, socket };
}

const settle = () => new Promise(setImmediate);
const overview = totalDirectorates => ({ kpis: { totalDirectorates }, directorates: [] });

test('a slow response cannot restore inactive accounts after a status refresh', async () => {
  for (const event of ['local', 'socket']) {
    const state = makeOverview();
    if (event === 'local') state.window.dispatchEvent(new Event('ports:user_status_changed'));
    else state.socket.emit('user:status-changed', { isActive: false });
    assert.equal(state.requests.length, 2);
    const updated = overview(1);
    state.requests[1].resolve(updated);
    await settle();
    state.requests[0].resolve(overview(2));
    await settle();
    assert.equal(state.render().data, updated);
    assert.equal(state.render().loading, false);
    state.unmount();
  }
});

test('an earlier request cannot end loading while the current status refresh is pending', async () => {
  const state = makeOverview();
  state.socket.emit('user:status-changed', { isActive: true });
  state.requests[0].resolve(overview(1));
  await settle();
  assert.equal(state.render().loading, true);
  assert.equal(state.render().data, null);
  const updated = overview(2);
  state.requests[1].resolve(updated);
  await settle();
  assert.equal(state.render().data, updated);
  assert.equal(state.render().loading, false);
  state.unmount();
});

test('reconnection and returning to a visible tab recover missed account changes', async () => {
  const state = makeOverview();
  state.requests[0].resolve(overview(2));
  await settle();
  state.socket.emit('connect');
  assert.equal(state.requests.length, 2);
  state.requests[1].resolve(overview(1));
  await settle();
  assert.equal(state.render().data.kpis.totalDirectorates, 1);
  state.document.visibilityState = 'hidden';
  state.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(state.requests.length, 2);
  state.document.visibilityState = 'visible';
  state.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(state.requests.length, 3);
  state.requests[2].resolve(overview(0));
  await settle();
  assert.equal(state.render().data.kpis.totalDirectorates, 0);
  state.unmount();
});

test('date changes and unmount invalidate pending responses and clean up refresh listeners', async () => {
  const state = makeOverview();
  state.render('2026-10-26');
  assert.equal(state.socket.listenerCount('connect'), 1);
  assert.equal(state.socket.listenerCount('user:status-changed'), 1);
  state.requests[0].resolve(overview(20));
  await settle();
  assert.equal(state.render().data, null);
  state.socket.emit('user:status-changed');
  assert.equal(state.requests[2].date, '2026-10-26');
  state.requests[1].reject(new Error('Old request failed'));
  await settle();
  assert.equal(state.errors.length, 0);
  state.unmount();
  state.requests[2].resolve(overview(10));
  await settle();
  assert.equal(state.socket.listenerCount('connect'), 0);
  assert.equal(state.socket.listenerCount('user:status-changed'), 0);
  state.window.dispatchEvent(new Event('ports:user_status_changed'));
  state.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(state.requests.length, 3);
  // Inspect existing state without running another mount effect.
  assert.equal(state.render().data, null);
});
