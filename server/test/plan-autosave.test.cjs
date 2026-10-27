const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const {
  PLAN_AUTOSAVE_DELAY_MS,
  ensurePlanTaskDraftKeys,
  acceptSavedPlanTasks,
} = require('../../client/src/lib/planAutosave');

const makeTask = (extra = {}) => ({
  title: 'Original title', description: 'Original details', priority: 'NORMAL', estimatedHours: 2,
  status: 'PENDING', completionPercentage: 0, ...extra,
});

test('a late save assigns IDs to the right drafts without replacing edits or deleted rows', () => {
  const submitted = ensurePlanTaskDraftKeys([makeTask(), makeTask()]);
  const current = [
    { ...submitted[1], title: 'Edited while saving', description: 'New details' },
    ...ensurePlanTaskDraftKeys([makeTask({ title: 'Added while saving' })]),
  ];
  const result = acceptSavedPlanTasks(current, submitted, [
    { id: 'deleted-row', displayOrder: 1 }, { id: 'remaining-row', displayOrder: 2 },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'remaining-row');
  assert.equal(result[0].title, 'Edited while saving');
  assert.equal(result[0].description, 'New details');
  assert.equal(result[1].id, undefined);
  assert.equal(result[1].title, 'Added while saving');
  assert.equal(submitted[1].title, 'Original title');
});

// Exercise the component's real effects and event handlers with a tiny hook
// host, controlled network responses, and a deterministic clock. No server or
// browser is required to reproduce typing during a slow save or refresh.
const componentPath = path.resolve(__dirname, '../../client/src/components/DirectorPortal.tsx');
const componentCode = ts.transpileModule(fs.readFileSync(componentPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function createPortal(initialPlan = {
  id: 'plan', directorateId: 'directorate', planDate: '2026-10-27', status: 'SUBMITTED',
  generalFocus: 'Original focus', tasks: [makeTask({ id: 'saved-task', displayOrder: 1 })],
}) {
  const slots = [];
  const timers = new Map();
  const socketHandlers = new Map();
  const storage = new Map();
  const saves = [];
  const reads = [];
  const window = new EventTarget();
  window.innerWidth = 1280;
  const socket = {
    on(event, callback) { socketHandlers.set(event, callback); },
    off(event) { socketHandlers.delete(event); },
  };
  let serverPlan = structuredClone(initialPlan);
  let pendingRead = null;
  let cursor = 0;
  let dirty = true;
  let effects = [];
  let tree;
  let now = 0;
  let timerId = 0;
  const changedDeps = (a, b) => !a || !b || a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
  const react = {
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    Fragment: 'fragment',
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (update) => {
        const next = typeof update === 'function' ? update(slots[index]) : update;
        if (!Object.is(next, slots[index])) { slots[index] = next; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (changedDeps(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (changedDeps(slots[index]?.deps, deps)) {
        effects.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  const api = {
    getMyTodayPlan() {
      reads.push(true);
      if (pendingRead) { const read = pendingRead; pendingRead = null; return read.promise; }
      return Promise.resolve(structuredClone(serverPlan));
    },
    getAnnouncements: async () => [], getIncompleteTasks: async () => [],
    getExecutiveTasks: async () => [], getTaskTemplates: async () => [], getDirectorHistory: async () => [],
    submitPlan(payload) {
      const request = deferred();
      saves.push({ ...request, payload: structuredClone(payload) });
      return request.promise;
    },
  };
  const stub = new Proxy({}, { get: (_, name) => name === '__esModule' ? false : String(name) });
  const requireForComponent = (name) => {
    if (name === 'react') return react;
    if (name === '../services/api') return { api };
    if (name === '../lib/socket') return { getSocket: () => socket };
    if (name === '../lib/announcements') return { getReadAnnouncementIds: () => [], syncReadNotificationsFromServer() {} };
    if (name === '@capacitor/core') return { Capacitor: { isNativePlatform: () => false } };
    if (name === './TodosView') return { getCleanTodoDescription: (value) => value || '' };
    if (name.startsWith('../lib/')) return require(path.resolve(path.dirname(componentPath), name));
    return stub;
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'window', 'localStorage', 'navigator', 'setTimeout', 'clearTimeout', componentCode)(
    requireForComponent, module, module.exports, window,
    { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    { userAgent: '' },
    (callback, delay) => { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
    (id) => timers.delete(id),
  );
  const currentUser = { id: 'director', role: 'DIRECTOR', directorateId: 'directorate', directorate: { name: 'Directorate' } };
  const render = () => {
    cursor = 0; dirty = false; effects = [];
    tree = module.exports.DirectorPortal({ currentUser });
    effects.forEach((effect) => effect());
  };
  const settle = async () => {
    for (let turn = 0; turn < 30; turn++) {
      await Promise.resolve();
      if (dirty) render();
    }
    assert.equal(dirty, false, 'Component effects should settle');
  };
  const findAll = (predicate, node = tree) => {
    if (Array.isArray(node)) return node.flatMap((child) => findAll(predicate, child ?? null));
    if (!node || typeof node !== 'object') return [];
    return [...(predicate(node) ? [node] : []), ...findAll(predicate, node.props?.children ?? null)];
  };
  return {
    saves, reads, settle,
    titles: () => findAll((node) => node.type === 'input' && node.props.placeholder === 'عنوان المهمة...').map((node) => node.props.value),
    text: () => JSON.stringify(tree),
    async change(oldValue, value) {
      const input = findAll((node) => ['input', 'textarea'].includes(node.type) && node.props.value === oldValue)[0];
      assert.ok(input, `Input containing ${oldValue} exists`);
      input.props.onChange({ target: { value } });
      await settle();
    },
    async tick(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); next[1].callback(); await settle();
      }
      now = target;
      await settle();
    },
    async resolveSave(index) {
      const save = saves[index];
      serverPlan = { ...serverPlan, generalFocus: save.payload.generalFocus,
        tasks: save.payload.tasks.map((task, taskIndex) => ({ ...task, id: task.id || `new-${index}-${taskIndex}`, displayOrder: taskIndex + 1 })),
      };
      save.resolve(structuredClone(serverPlan));
      await settle();
    },
    async submit() {
      findAll((node) => node.type === 'form')[0].props.onSubmit({ preventDefault() {} });
      await settle();
    },
    async refresh() { socketHandlers.get('todo:updated')({ userId: currentUser.id }); await settle(); },
    holdRead() { pendingRead = deferred(); return pendingRead; },
    async taskEvent(update) { socketHandlers.get('task:updated')({ directorateId: currentUser.directorateId, ...update }); await settle(); },
    async addTask() {
      const textOf = (node) => JSON.stringify(node.props.children);
      findAll((node) => node.type === 'button' && textOf(node).includes('إضافة مهمة أخرى'))[0].props.onClick();
      await settle();
    },
  };
}

test('autosave waits for 2.5 seconds of inactivity and resets after each keystroke', async () => {
  const app = createPortal();
  await app.settle();
  await app.change('Original title', 'First edit');
  await app.tick(2000);
  assert.equal(app.saves.length, 0);
  await app.change('First edit', 'Second edit');
  await app.tick(PLAN_AUTOSAVE_DELAY_MS - 1);
  assert.equal(app.saves.length, 0);
  await app.tick(1);
  assert.equal(app.saves.length, 1);
  assert.equal(app.saves[0].payload.tasks[0].title, 'Second edit');
});

test('typing during a slow save survives the response and is saved next without overlapping requests', async () => {
  const app = createPortal();
  await app.settle();
  await app.change('Original details', 'Submitted details');
  await app.tick(PLAN_AUTOSAVE_DELAY_MS);
  await app.change('Submitted details', 'Newest details');
  await app.change('Original title', 'Newest title');
  await app.tick(10000);
  assert.equal(app.saves.length, 1);
  await app.resolveSave(0);
  assert.ok(app.text().includes('Newest details'));
  assert.deepEqual(app.titles(), ['Newest title']);
  assert.ok(app.text().includes('تعديلات بانتظار الحفظ'));
  assert.equal(app.reads.length, 1, 'An autosave must not reload its own form');
  await app.tick(PLAN_AUTOSAVE_DELAY_MS);
  assert.equal(app.saves.length, 2);
  assert.equal(app.saves[1].payload.tasks[0].description, 'Newest details');
  assert.equal(app.saves[1].payload.tasks[0].title, 'Newest title');
  await app.resolveSave(1);
  await app.tick(PLAN_AUTOSAVE_DELAY_MS * 2);
  assert.equal(app.saves.length, 2, 'The acknowledged snapshot should not be saved repeatedly');
});

test('refreshes started before or during typing cannot replace unsaved input', async () => {
  const app = createPortal();
  await app.settle();
  const read = app.holdRead();
  await app.refresh();
  await app.change('Original title', 'Unsaved title');
  read.resolve({ id: 'plan', generalFocus: 'Original focus', tasks: [makeTask({ id: 'saved-task' })] });
  await app.settle();
  assert.deepEqual(app.titles(), ['Unsaved title']);
  await app.refresh();
  assert.deepEqual(app.titles(), ['Unsaved title']);
  await app.tick(PLAN_AUTOSAVE_DELAY_MS);
  assert.equal(app.saves[0].payload.tasks[0].title, 'Unsaved title');
});

test('manual save preserves subsequent edits and a new draft keeps its assigned ID', async () => {
  const app = createPortal();
  await app.settle();
  await app.addTask();
  await app.change('', 'New draft');
  await app.submit();
  assert.equal(app.saves.length, 1);
  await app.change('New draft', 'Renamed during save');
  await app.submit();
  assert.equal(app.saves.length, 1, 'Manual requests cannot overlap a save');
  await app.resolveSave(0);
  assert.ok(app.titles().includes('Renamed during save'));
  await app.tick(PLAN_AUTOSAVE_DELAY_MS);
  assert.equal(app.saves[1].payload.tasks[1].title, 'Renamed during save');
  assert.equal(app.saves[1].payload.tasks[1].id, 'new-0-1');
});

test('a live progress event does not acknowledge unrelated unsaved text', async () => {
  const app = createPortal();
  await app.settle();
  await app.change('Original title', 'Unsaved title');
  await app.taskEvent({ taskId: 'saved-task', status: 'IN_PROGRESS', completionPercentage: 30 });
  await app.tick(PLAN_AUTOSAVE_DELAY_MS);
  assert.equal(app.saves.length, 1);
  assert.equal(app.saves[0].payload.tasks[0].title, 'Unsaved title');
  assert.equal(app.saves[0].payload.tasks[0].completionPercentage, 30);
});
