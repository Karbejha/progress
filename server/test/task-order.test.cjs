const { test } = require('node:test');
const assert = require('node:assert/strict');
const { newestTaskEntries, newestTasksFirst } = require('../../client/src/lib/taskOrder');

const savedTask = (id, day, extra = {}) => ({
  id,
  title: id,
  createdAt: `2026-10-${day}T08:00:00.000Z`,
  ...extra,
});

test('manager assignments stay above newer daily tasks, with newest first within each group', () => {
  const tasks = [
    savedTask('old-daily', '10'),
    savedTask('old-manager', '08', { isExecutive: true }),
    savedTask('new-daily', '12'),
    savedTask('new-manager', '11', { isExecutive: true }),
  ];
  assert.deepEqual(newestTasksFirst(tasks).map(t => t.id), [
    'new-manager', 'old-manager', 'new-daily', 'old-daily',
  ]);
});

test('new drafts appear first and keep the same position after saving and reloading', () => {
  const old = savedTask('old', '10', { displayOrder: 1 });
  const draft = { title: 'new' };
  assert.deepEqual(newestTasksFirst([old, draft]).map(t => t.title), ['new', 'old']);
  const saved = savedTask('new', '12', { displayOrder: 2 });
  assert.deepEqual(newestTasksFirst([old, saved]).map(t => t.title), ['new', 'old']);
  // Reloading or saving a different display order cannot override creation dates.
  assert.deepEqual(newestTasksFirst([
    { ...saved, displayOrder: 1 }, { ...old, displayOrder: 2 },
  ]).map(t => t.title), ['new', 'old']);
});

test('editing and deleting the first displayed task targets its original source index', () => {
  const tasks = [savedTask('old', '10'), savedTask('new', '12'), savedTask('middle', '11')];
  const before = [...tasks];
  const first = newestTaskEntries(tasks)[0];
  assert.equal(first.index, 1);
  assert.equal(first.task, tasks[1]);
  assert.deepEqual(tasks, before);
  const edited = tasks.map((t, index) => index === first.index ? { ...t, title: 'edited' } : t);
  assert.equal(newestTasksFirst(edited)[0].title, 'edited');
  const remaining = tasks.filter((_, index) => index !== first.index);
  assert.deepEqual(newestTasksFirst(remaining).map(t => t.id), ['middle', 'old']);
});

test('completion, priority and later edits do not move an older task above a newer one', () => {
  const old = savedTask('old', '10', { status: 'IN_PROGRESS', priority: 'URGENT', updatedAt: '2026-10-13T08:00:00Z' });
  const newer = savedTask('new', '12', { status: 'COMPLETED', priority: 'NORMAL' });
  assert.deepEqual(newestTasksFirst([old, newer]).map(t => t.id), ['new', 'old']);
});

test('equal timestamps and older drafts without timestamps preserve latest-added-first order', () => {
  const tasks = [savedTask('old', '12', { displayOrder: 1 }), savedTask('new', '12', { displayOrder: 2 })];
  assert.deepEqual(newestTasksFirst(tasks).map(t => t.id), ['new', 'old']);
  assert.deepEqual(newestTasksFirst([{ title: 'old' }, { title: 'new' }]).map(t => t.title), ['new', 'old']);
  assert.deepEqual(newestTasksFirst([]), []);
});
