const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyPlanTaskUpdate } = require('../../client/src/lib/planTaskUpdates');

const makeTasks = () => [
  { id: 'current-copy', carriedFromTaskId: 'historical-origin', title: 'Shared title', status: 'IN_PROGRESS', completionPercentage: 30, completionNote: 'Current note', todayTargetMet: true, isMultiDay: true },
  { id: 'unrelated-current', title: 'Shared title', status: 'PENDING', completionPercentage: 0, completionNote: 'Other note' },
  { title: 'Shared title', status: 'PENDING', completionPercentage: 0, completionNote: 'Draft note' },
];

test('a historical event leaves same-title saved rows and unsaved drafts unchanged', () => {
  const tasks = makeTasks();
  const previous = structuredClone(tasks);
  const result = applyPlanTaskUpdate(tasks, {
    taskId: 'historical-origin', taskTitle: 'Shared title', status: 'COMPLETED', completionPercentage: 100,
  });
  assert.strictEqual(result, tasks);
  assert.deepEqual(result, previous);
  assert.equal(result[0].id, 'current-copy');
  assert.equal(result[1].id, 'unrelated-current');
  assert.equal(result[2].id, undefined);
});

test('an event updates only its exact saved ID and preserves omitted notes and daily target state', () => {
  const tasks = makeTasks();
  const result = applyPlanTaskUpdate(tasks, {
    taskId: 'current-copy', taskTitle: 'Shared title', status: 'COMPLETED', completionPercentage: 100,
  });
  assert.deepEqual(result[0], { ...tasks[0], status: 'COMPLETED', completionPercentage: 100 });
  assert.strictEqual(result[1], tasks[1]);
  assert.strictEqual(result[2], tasks[2]);
  assert.equal(result[0].completionNote, 'Current note');
  assert.equal(result[0].todayTargetMet, true);
  assert.equal(result[0].isMultiDay, true);
  assert.equal(tasks[0].completionPercentage, 30, 'The existing state is not mutated');
});

test('an explicitly empty completion note clears only the identified row', () => {
  const tasks = makeTasks();
  const result = applyPlanTaskUpdate(tasks, {
    taskId: 'unrelated-current', status: 'IN_PROGRESS', completionPercentage: 10, completionNote: '',
  });
  assert.equal(result[1].completionNote, '');
  assert.strictEqual(result[0], tasks[0]);
  assert.strictEqual(result[2], tasks[2]);
});

test('an event without a saved task ID cannot update a draft', () => {
  const tasks = makeTasks();
  assert.strictEqual(applyPlanTaskUpdate(tasks, {
    taskTitle: 'Shared title', status: 'COMPLETED', completionPercentage: 100,
  }), tasks);
});

test('a live update preserves an unsaved 100 percent completion and note', () => {
  const saved = makeTasks();
  const draft = [{ ...saved[0], status: 'COMPLETED', completionPercentage: 100, completionNote: 'Unsaved completion' }, ...saved.slice(1)];
  const result = applyPlanTaskUpdate(draft, {
    taskId: 'current-copy', status: 'IN_PROGRESS', completionPercentage: 30, completionNote: 'Other session note',
  }, saved);
  assert.equal(result[0].status, 'COMPLETED');
  assert.equal(result[0].completionPercentage, 100);
  assert.equal(result[0].completionNote, 'Unsaved completion');
  assert.strictEqual(result[1], saved[1]);
});
