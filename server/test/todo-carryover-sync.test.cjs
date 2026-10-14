const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Priority, TaskStatus } = require('@prisma/client');
const { TodosService } = require('../src/todos/todos.service');

// All persistence is in-memory. These tests never construct a PrismaClient or
// connect to the database configured for the application.
function planTask(id, carriedFromTaskId = null, overrides = {}) {
  const directorateId = overrides.directorateId || 'directorate';
  const dailyPlanId = overrides.dailyPlanId || `plan-${id}`;
  const { directorateId: _directorateId, ...fields } = overrides;
  return {
    id, carriedFromTaskId, dailyPlanId, title: 'Minister interview record',
    description: `Historical description for ${id}`, priority: Priority.NORMAL,
    status: TaskStatus.IN_PROGRESS, completionPercentage: 30,
    dailyPlan: {
      id: dailyPlanId, directorateId, planDate: new Date('2026-09-17'),
      directorate: { id: directorateId, name: 'Administrative Development' },
    },
    ...fields,
  };
}

function fixture(initialTasks, options = {}) {
  const tasks = new Map(initialTasks.map((task) => [task.id, task]));
  const todo = {
    id: 'todo', userId: 'user', title: 'Minister interview record',
    description: '[معرف المهمة: original]', isCompleted: false,
    completionPercentage: 30, completedAt: null, attachments: [],
    ...options.todo,
  };
  const user = { id: 'user', role: 'DIRECTOR', fullName: 'Director', directorateId: options.directorateId === undefined ? 'directorate' : options.directorateId };
  const planWrites = [];
  const todoWrites = [];
  const continuationReads = [];
  const summaryWrites = [];
  const events = [];
  const notifications = [];
  const prisma = {
    user: { findUnique: async () => user },
    userTodo: {
      findUnique: async () => ({ ...todo }),
      update: async ({ where, data }) => {
        assert.equal(where.id, todo.id);
        todoWrites.push({ ...data });
        Object.assign(todo, data);
        return { ...todo };
      },
    },
    dailyPlan: {
      findUnique: async () => options.todayIds ? {
        tasks: options.todayIds.map((id) => tasks.get(id)),
      } : null,
    },
    planTask: {
      findUnique: async ({ where }) => tasks.get(where.id) || null,
      findMany: async ({ where }) => {
        if (where.OR) {
          continuationReads.push(where);
          assert.equal(where.dailyPlan.directorateId, user.directorateId);
          return [...tasks.values()].filter((task) =>
            where.OR.some((condition) =>
              condition.id?.in.includes(task.id) || condition.carriedFromTaskId?.in.includes(task.carriedFromTaskId)
            ) &&
            task.dailyPlan.directorateId === where.dailyPlan.directorateId
          );
        }
        return [...tasks.values()].filter((task) => task.dailyPlanId === where.dailyPlanId);
      },
      update: async ({ where, data }) => {
        assert.ok(tasks.has(where.id));
        planWrites.push({ id: where.id, data: { ...data } });
        const updated = { ...tasks.get(where.id), ...data };
        tasks.set(where.id, updated);
        return updated;
      },
    },
    executiveTask: { findMany: async () => [] },
    dailySummary: {
      findUnique: async ({ where }) => options.withSummaries ? { id: `summary-${where.dailyPlanId}` } : null,
      update: async (args) => { summaryWrites.push(args); return args.data; },
    },
    $transaction: async (work) => work(prisma),
  };
  const service = new TodosService(prisma, {
    emitTaskUpdated: (event) => events.push(event),
    emitTodoUpdated: () => {},
  }, {
    createNotificationForRoles: (...args) => notifications.push(args),
    createNotificationForDirectorate: (...args) => notifications.push(args),
  });
  return { service, tasks, todo, user, planWrites, todoWrites, continuationReads, summaryWrites, events, notifications };
}

async function sync(state, percentage, options) {
  const errors = [];
  const previousError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await state.service.syncLinkedEntities({ ...state.todo }, percentage === 100, percentage, options);
  } finally {
    console.error = previousError;
  }
  assert.deepEqual(errors, [], 'Synchronization must not silently swallow an error');
}

test('agenda completion reaches a previous-day carry-over absent from its explicit IDs', async () => {
  const state = fixture([planTask('original'), planTask('carried', 'original')], { withSummaries: true });
  await sync(state, 100);
  for (const id of ['original', 'carried']) {
    assert.equal(state.tasks.get(id).status, TaskStatus.COMPLETED);
    assert.equal(state.tasks.get(id).completionPercentage, 100);
  }
  assert.deepEqual(state.planWrites.map((write) => write.id), ['original', 'carried']);
  assert.equal(state.todoWrites.length, 0, 'Traversal must not add historical task tags to the agenda');
  assert.deepEqual(state.summaryWrites.map((write) => write.data.overallCompletionRate), [100, 100]);
  assert.equal(state.events.length, 2);
  assert.equal(state.notifications.length, 1, 'Historical copies produce one persisted notification per agenda change');
  assert.deepEqual(state.notifications[0][0], ['GENERAL_DIRECTOR', 'ASSISTANT_DIRECTOR', 'OBSERVER']);
  assert.equal(state.notifications[0][1].metadata.completionPercentage, 100);
  assert.equal(state.notifications[0][2], state.user.id, 'The actor is excluded from recipients');
});

test('transitive branches and cycles are deduplicated within the owning directorate', async () => {
  const state = fixture([
    planTask('original', 'grandchild'), planTask('child', 'original'),
    planTask('sibling', 'original'), planTask('grandchild', 'child'),
    planTask('foreign', 'original', { directorateId: 'other' }),
    planTask('through-foreign', 'foreign'), planTask('unrelated'),
  ], { todo: { description: '[معرف المهمة: original] [معرف المهمة: child] [معرف المهمة: original]' } });
  await sync(state, 65);
  assert.deepEqual(new Set(state.planWrites.map((write) => write.id)), new Set(['original', 'child', 'sibling', 'grandchild']));
  assert.equal(state.planWrites.length, 4);
  assert.equal(state.notifications.length, 1, 'A synchronization cycle cannot duplicate notification delivery');
  assert.ok(state.continuationReads.length <= 3, 'A continuation cycle must terminate');
  for (const id of ['original', 'child', 'sibling', 'grandchild']) {
    assert.equal(state.tasks.get(id).completionPercentage, 65);
    assert.equal(state.tasks.get(id).status, TaskStatus.IN_PROGRESS);
  }
  for (const id of ['foreign', 'through-foreign', 'unrelated']) {
    assert.equal(state.tasks.get(id).completionPercentage, 30);
  }
});

test('unchanged agenda synchronization is silent while successive progress changes each persist a notification', async () => {
  const state = fixture([planTask('original'), planTask('carried', 'original')]);
  await sync(state, 30);
  assert.equal(state.notifications.length, 0);
  await sync(state, 60);
  assert.equal(state.notifications.length, 1);
  await sync(state, 90);
  assert.equal(state.notifications.length, 2);
  assert.deepEqual(state.notifications.map(([, item]) => item.metadata.completionPercentage), [60, 90]);
  assert.equal(state.notifications[0][1].referenceId, state.notifications[1][1].referenceId, 'Entity references stay stable; canonical notification IDs distinguish the saved events');
});

test('foreign explicit IDs and agenda owners without a directorate cannot seed plan synchronization', async () => {
  for (const directorateId of ['directorate', null]) {
    const state = fixture([
      planTask('foreign', null, { directorateId: 'other' }),
      planTask('foreign-child', 'foreign', { directorateId: 'other' }),
    ], { directorateId, todo: { description: '[معرف المهمة: foreign]' } });
    await sync(state, 100);
    assert.deepEqual(state.planWrites, []);
    assert.deepEqual(state.continuationReads, []);
  }
});

test('progress and metadata edits preserve metadata on descendants found only through carry-over links', async () => {
  const state = fixture([planTask('original'), planTask('carried', 'original')]);
  await sync(state, 100, { title: 'Updated title', description: 'Updated details', priority: Priority.HIGH, syncProgress: true });
  assert.equal(state.tasks.get('original').title, 'Updated title');
  assert.equal(state.tasks.get('original').priority, Priority.HIGH);
  assert.equal(state.tasks.get('original').description, 'Updated details\n[معرف المفكرة: todo]');
  assert.deepEqual(state.planWrites.find((write) => write.id === 'carried').data, {
    status: TaskStatus.COMPLETED, completionPercentage: 100,
  });
  assert.equal(state.tasks.get('carried').description, 'Historical description for carried');
  assert.equal(state.tasks.get('carried').title, 'Minister interview record');
  assert.equal(state.tasks.get('carried').priority, Priority.NORMAL);
});

test('metadata-only saves do not traverse or overwrite historical carry-over progress', async () => {
  const state = fixture([
    planTask('original', null, { status: TaskStatus.COMPLETED, completionPercentage: 100 }),
    planTask('carried', 'original'),
  ]);
  await sync(state, 30, { title: 'Updated title', priority: Priority.HIGH, syncProgress: false });
  assert.deepEqual(state.continuationReads, []);
  assert.deepEqual(state.planWrites, [{ id: 'original', data: { title: 'Updated title', priority: Priority.HIGH } }]);
  assert.equal(state.tasks.get('original').completionPercentage, 100);
  assert.equal(state.tasks.get('carried').completionPercentage, 30);
});

test('explicit links exclude unrelated same-title and partial-title tasks in today\'s plan', async () => {
  const state = fixture([
    planTask('original'), planTask('carried', 'original'), planTask('namesake'),
    planTask('partial-title', null, { title: 'Minister interview record follow-up' }),
  ], { todayIds: ['carried', 'namesake', 'partial-title'] });
  await sync(state, 100, { title: 'Edited title', syncProgress: true });
  assert.deepEqual(state.planWrites.map((write) => write.id), ['original', 'carried']);
  assert.equal(state.tasks.get('namesake').completionPercentage, 30);
  assert.equal(state.tasks.get('partial-title').completionPercentage, 30);
  assert.equal(state.tasks.get('carried').title, 'Minister interview record');
  assert.equal(state.todoWrites.length, 0);
});

test('a reverse agenda link in today\'s plan seeds descendants and excludes a same-title task', async () => {
  const state = fixture([
    planTask('today', null, { description: '[معرف المفكرة: todo]' }),
    planTask('next', 'today'), planTask('namesake'),
  ], { todayIds: ['today', 'namesake'], todo: { description: null } });
  await sync(state, 100);
  assert.deepEqual(state.planWrites.map((write) => write.id), ['today', 'next']);
  assert.equal(state.tasks.get('namesake').completionPercentage, 30);
});

test('legacy exact-title matches can seed descendants without matching partial titles', async () => {
  const state = fixture([
    planTask('today'), planTask('next', 'today'),
    planTask('partial', null, { title: 'Minister interview record follow-up' }),
  ], { todayIds: ['today', 'partial'], todo: { description: null } });
  await sync(state, 100);
  assert.deepEqual(state.planWrites.map((write) => write.id), ['today', 'next']);
  assert.equal(state.tasks.get('partial').completionPercentage, 30);
});

test('deliberately reopening a completed agenda item reopens its root and all continuations', async () => {
  const state = fixture([
    planTask('original', null, { status: TaskStatus.COMPLETED, completionPercentage: 100 }),
    planTask('carried', 'original'), planTask('latest', 'carried'),
  ], { todo: { isCompleted: true, completionPercentage: 100, completedAt: new Date('2026-10-04') } });
  await state.service.toggleTodo(state.user, state.todo.id);
  assert.equal(state.todo.isCompleted, false);
  assert.equal(state.todo.completionPercentage, 0);
  for (const id of ['original', 'carried', 'latest']) {
    assert.equal(state.tasks.get(id).status, TaskStatus.PENDING);
    assert.equal(state.tasks.get(id).completionPercentage, 0);
  }
});

test('a child-only agenda link reopens completed ancestors and siblings without changing their metadata', async () => {
  const state = fixture([
    planTask('original', null, { status: TaskStatus.COMPLETED, completionPercentage: 100 }),
    planTask('carried', 'original'), planTask('sibling', 'original'),
    planTask('latest', 'carried'), planTask('namesake'),
    planTask('foreign-child', 'original', { directorateId: 'other' }),
  ], {
    todayIds: ['namesake'],
    todo: {
      description: '[معرف المهمة: carried]', isCompleted: true,
      completionPercentage: 100, completedAt: new Date('2026-10-04'),
    },
  });
  await state.service.updateTodo(state.user, state.todo.id, {
    completionPercentage: 40, title: 'Current agenda title', description: '[معرف المهمة: carried] Updated details', priority: Priority.HIGH,
  });
  for (const id of ['original', 'carried', 'sibling', 'latest']) {
    assert.equal(state.tasks.get(id).status, TaskStatus.IN_PROGRESS);
    assert.equal(state.tasks.get(id).completionPercentage, 40);
  }
  for (const id of ['original', 'sibling', 'latest']) {
    assert.equal(state.tasks.get(id).title, 'Minister interview record');
    assert.equal(state.tasks.get(id).description, `Historical description for ${id}`);
    assert.equal(state.tasks.get(id).priority, Priority.NORMAL);
    assert.deepEqual(state.planWrites.find((write) => write.id === id).data, {
      status: TaskStatus.IN_PROGRESS, completionPercentage: 40,
    });
  }
  assert.equal(state.tasks.get('carried').title, 'Current agenda title');
  assert.equal(state.tasks.get('carried').priority, Priority.HIGH);
  assert.equal(state.tasks.get('namesake').completionPercentage, 30);
  assert.equal(state.tasks.get('foreign-child').completionPercentage, 30);
  assert.equal(state.planWrites.length, 4);
});
