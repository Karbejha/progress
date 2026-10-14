const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ExecutiveTasksService } = require('../src/executive-tasks/executive-tasks.service');
const { TodosService } = require('../src/todos/todos.service');
const { UsersService } = require('../src/users/users.service');

function fixture(role = 'DIRECTOR', { foreign = false, shared = false, description = '' } = {}) {
  const actor = { id: 'actor', role, fullName: 'Test actor', directorateId: 'own' };
  let task = {
    id: 'assignment', title: 'Assignment', directorateId: foreign ? 'foreign' : 'own',
    directorate: { id: foreign ? 'foreign' : 'own', name: 'Directorate' },
    status: 'IN_PROGRESS', completionPercentage: 20, todayTargetMet: false,
    priority: 'NORMAL', description, completionNote: null,
    dueDate: null, dailyProgress: [], updatedAt: new Date('2026-10-14T10:00:00Z'),
    sharedGroupId: shared ? 'group' : null,
  };
  const peer = { ...task, id: 'peer-assignment', directorateId: 'peer', directorate: { id: 'peer', name: 'Peer directorate' } };
  const notifications = [], events = [], writes = [];
  const delivery = {
    createNotificationForRoles: async (...args) => notifications.push({ audience: 'roles', args }),
    createNotificationForDirectorate: async (...args) => notifications.push({ audience: 'directorate', args }),
  };
  const gateway = {
    emitExecutiveTaskUpdated: (payload) => events.push(payload),
    emitExecutiveTaskCreated: (payload) => events.push(payload),
    emitTodoUpdated() {},
  };
  const prisma = {
    $queryRaw: async () => [],
    $transaction: async (work) => work(prisma),
    user: { findUnique: async () => ({ ...actor }), findFirst: async () => null },
    dailyPlan: { findUnique: async () => null },
    executiveTask: {
      findUnique: async () => ({ ...task }),
      findUniqueOrThrow: async () => ({ ...task }),
      findMany: async () => shared ? [{ ...peer }] : [],
      updateMany: async ({ data }) => { Object.assign(peer, data); return { count: 2 }; },
      update: async ({ data }) => {
        writes.push(data);
        task = { ...task, ...data, updatedAt: new Date(task.updatedAt.getTime() + 1) };
        return { ...task };
      },
      create: async ({ data }) => ({ ...task, ...data }),
    },
    executiveTaskDailyProgress: {
      findUnique: async () => null,
      upsert: async ({ create }) => create,
    },
    directorate: { findUnique: async ({ where }) => ({ id: where.id, name: 'Directorate' }) },
    userTodo: { update: async () => ({}) },
  };
  const assignments = new ExecutiveTasksService(prisma, gateway, delivery);
  assignments.recalculateDailySummary = async () => {};
  assignments.enrichTasksWithCoTasks = async (tasks) => tasks;
  assignments.syncExecutiveTaskToUserTodo = async () => {};
  const todos = new TodosService(prisma, gateway, delivery);
  const todo = { id: 'todo', userId: actor.id, title: task.title, description: '[معرف التكليف: assignment]', priority: 'NORMAL', completionPercentage: 20 };
  todos.getTodoById = async () => ({ ...todo });
  return { actor, assignments, todos, todo, notifications, events, writes, delivery };
}

test('director assignment progress persists for all executive roles, while executive edits persist for the directorate', async () => {
  for (const role of ['DIRECTOR', 'GENERAL_DIRECTOR', 'ASSISTANT_DIRECTOR']) {
    const state = fixture(role);
    await state.assignments.updateTask(state.actor, 'assignment', { completionPercentage: 50 });
    assert.equal(state.notifications.length, 1);
    const { audience, args } = state.notifications[0];
    assert.equal(audience, role === 'DIRECTOR' ? 'roles' : 'directorate');
    assert.deepEqual(args[0], role === 'DIRECTOR' ? ['GENERAL_DIRECTOR', 'ASSISTANT_DIRECTOR', 'OBSERVER'] : 'own');
    assert.equal(args[1].metadata.taskId, 'assignment');
    assert.equal(args[1].metadata.completionPercentage, 50);
    assert.equal(args[2], state.actor.id);
    await state.assignments.updateTask(state.actor, 'assignment', { completionPercentage: 50 });
    assert.equal(state.notifications.length, 1, 'An unchanged save must not create another notification');
  }
});

test('editing shared assignment details delivers persisted updates to every affected directorate', async () => {
  const state = fixture('GENERAL_DIRECTOR', { shared: true });
  await state.assignments.updateTask(state.actor, 'assignment', { title: 'Updated title' });
  assert.deepEqual(state.notifications.map(({ args }) => args[0]), ['own', 'peer']);
  assert.deepEqual(state.notifications.map(({ args }) => args[1].metadata.taskTitle), ['Updated title', 'Updated title']);
  assert.deepEqual(state.events.map((event) => event.directorateId), ['own', 'peer']);
});

test('linked agenda progress uses the actor role to persist for the opposite audience', async () => {
  for (const role of ['DIRECTOR', 'GENERAL_DIRECTOR']) {
    const state = fixture(role);
    await state.todos.syncLinkedEntities(state.todo, false, 70);
    assert.equal(state.notifications.length, 1);
    assert.equal(state.notifications[0].audience, role === 'DIRECTOR' ? 'roles' : 'directorate');
    assert.equal(state.notifications[0].args[1].metadata.completionPercentage, 70);
    assert.equal(state.events[0].updatedByRole, role);
    await state.todos.syncLinkedEntities(state.todo, false, 70);
    assert.equal(state.notifications.length, 1, 'Internal synchronization remains silent when progress is unchanged');
  }
});

test('forged private agenda links cannot update another directorate assignment or notify its users', async () => {
  const state = fixture('DIRECTOR', { foreign: true });
  await state.todos.syncLinkedEntities(state.todo, true, 100);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.events, []);
  assert.deepEqual(state.notifications, []);
});

test('removing internal agenda link tags without changing assignment content does not alert its users', async () => {
  const state = fixture('GENERAL_DIRECTOR', { description: '[تم تحويلها إلى تكليف تنفيذي رسمي] [معرف التكليف: assignment]' });
  await state.todos.syncLinkedEntities(state.todo, false, 20, {
    description: '[تم تحويلها إلى تكليف تنفيذي رسمي] [معرف التكليف: assignment]', syncProgress: false,
  });
  assert.equal(state.notifications.length, 0);
});

test('issuing an assignment from an agenda waits for notification persistence before reporting success', async () => {
  const state = fixture('GENERAL_DIRECTOR');
  let release;
  state.delivery.createNotificationForDirectorate = () => new Promise((resolve) => { release = resolve; });
  let settled = false;
  const operation = state.todos.convertToExecutiveTask(state.actor, 'todo', { directorateIds: ['own'] })
    .then((result) => { settled = true; return result; });
  for (let attempt = 0; attempt < 10 && !release; attempt++) await Promise.resolve();
  assert.equal(typeof release, 'function');
  assert.equal(settled, false);
  release();
  assert.equal((await operation).success, true);
});

test('changing a user role or directorate revokes the old socket audience; unrelated profile edits stay connected', async () => {
  for (const changes of [{ role: 'OBSERVER' }, { directorateId: 'changed' }, { fullName: 'Changed name' }]) {
    const original = { id: 'user', role: 'DIRECTOR', directorateId: 'own', fullName: 'Original', password: 'hidden' };
    const revoked = [];
    const service = new UsersService({ user: {
      findUnique: async () => ({ ...original }),
      update: async ({ data }) => ({ ...original, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) }),
    } }, { disconnectUserSessions: (id) => revoked.push(id) });
    const result = await service.updateUser(original.id, changes);
    assert.equal(result.password, undefined);
    assert.deepEqual(revoked, changes.role || changes.directorateId ? ['user'] : []);
  }
});

test('deleting a user revokes its established socket sessions after the database deletion', async () => {
  let deleted = false;
  const revoked = [];
  const service = new UsersService({ user: {
    findUnique: async () => ({ id: 'user', role: 'DIRECTOR', directorateId: null }),
    delete: async () => { deleted = true; },
  } }, { disconnectUserSessions: (id) => { assert.equal(deleted, true); revoked.push(id); } });
  await service.deleteUser('user');
  assert.deepEqual(revoked, ['user']);
});
