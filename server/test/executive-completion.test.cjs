const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient, Role, TaskStatus, Priority } = require('@prisma/client');
const { ExecutiveTasksService } = require('../src/executive-tasks/executive-tasks.service');
const { TodosService } = require('../src/todos/todos.service');
const { normalizePlanDate, dailyExecutiveTasks } = require('../src/common/daily-progress');
const {
  savedExecutiveTaskState, mergeExecutiveTaskStates, acceptSavedExecutiveTaskState,
  executiveDailyProgress, workingDateKey,
} = require('../../client/src/lib/executiveDailyProgress');

const finished = {
  id: 'assignment', title: 'Completed assignment', status: 'COMPLETED',
  completionPercentage: 100, completionNote: 'Saved', todayTargetMet: false,
  dailyProgressDate: '2026-10-08', dailyStartCompletionPercentage: 0, completedOnDate: true,
};

test('background updates preserve an unsaved 100% completion and edits to other assignments', () => {
  const stale = { ...finished, status: 'PENDING', completionPercentage: 0, completedOnDate: false };
  const draft = { ...savedExecutiveTaskState(stale), status: 'COMPLETED', completionPercentage: 100, isModified: true };
  const otherDraft = { ...draft, completionNote: 'Another unsaved note' };
  const states = mergeExecutiveTaskStates([stale, { ...stale, id: 'other' }], { assignment: draft, other: otherDraft });
  assert.equal(states.assignment, draft);
  assert.equal(states.other, otherDraft);
  assert.equal(states.assignment.completionPercentage, 100);
});

test('accepting a save uses the confirmed completion and keeps later edits', () => {
  const submitted = { ...savedExecutiveTaskState(finished), todayTargetMet: true, isModified: true };
  const saved = acceptSavedExecutiveTaskState(finished, submitted, submitted);
  assert.equal(saved.status, 'COMPLETED');
  assert.equal(saved.completionPercentage, 100);
  assert.equal(saved.todayTargetMet, false);
  assert.equal(saved.isModified, false);
  const laterEdit = { ...submitted, completionNote: 'Typed while saving' };
  assert.equal(acceptSavedExecutiveTaskState(finished, submitted, laterEdit), laterEdit);
});

test('a completed assignment remains completed after refresh and the next working day', () => {
  const states = mergeExecutiveTaskStates([finished], { assignment: savedExecutiveTaskState(finished) });
  assert.equal(states.assignment.status, 'COMPLETED');
  assert.equal(states.assignment.completionPercentage, 100);
  assert.equal(executiveDailyProgress(finished, states.assignment, '2026-10-08').completedToday, true);
  assert.equal(executiveDailyProgress(finished, states.assignment, '2026-10-09').rate, 0);
  assert.equal(states.assignment.status, 'COMPLETED');
});

test('PostgreSQL: completion survives agenda metadata, title matching and refresh; explicit reopening works', {
  skip: !process.env.PROGRESS_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.PROGRESS_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/progress_daily_regression', 'Use the isolated regression database');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const noDelivery = new Proxy({}, { get: () => () => Promise.resolve() });
  const assignments = new ExecutiveTasksService(prisma, noDelivery, noDelivery);
  const todos = new TodosService(prisma, noDelivery);
  let directorate;
  let user;
  try {
    directorate = await prisma.directorate.create({ data: { name: 'Completion regression', code: 'COMPLETION_REGRESSION', category: 'TEST' } });
    user = await prisma.user.create({ data: {
      username: 'completion_regression', email: 'completion_regression@example.test', password: 'test',
      fullName: 'Regression', title: 'Test', role: Role.DIRECTOR, directorateId: directorate.id,
    } });
    const createTask = (title) => prisma.executiveTask.create({ data: { title, directorateId: directorate.id, assignedById: user.id } });
    const assertCompleted = async (id) => {
      const reloaded = await assignments.getTaskById(user, id);
      assert.equal(reloaded.status, TaskStatus.COMPLETED);
      assert.equal(reloaded.completionPercentage, 100);
      assert.equal(executiveDailyProgress(reloaded, undefined, workingDateKey()).rate, 100);
      return reloaded;
    };

    // Both roles and both completion controls must store the same terminal state.
    const first = await createTask('Develop supply platform');
    await assignments.updateTask(user, first.id, { status: TaskStatus.PENDING, completionPercentage: 100 });
    await assertCompleted(first.id);
    const executiveTask = await createTask('Executive completion');
    await assignments.updateTask({ ...user, role: Role.GENERAL_DIRECTOR }, executiveTask.id, { completionPercentage: 100 });
    await assertCompleted(executiveTask.id);
    const statusOnly = await createTask('Status-only completion');
    await assignments.updateTask(user, statusOnly.id, { status: TaskStatus.COMPLETED });
    await assertCompleted(statusOnly.id);

    const plan = await prisma.dailyPlan.create({ data: {
      directorateId: directorate.id, userId: user.id, planDate: normalizePlanDate(),
      tasks: { create: { title: first.title, status: TaskStatus.COMPLETED, completionPercentage: 100 } },
    }, include: { tasks: true } });

    // An old linked agenda copy can still have 0%; editing its details must not
    // overwrite the completed assignment or the completed plan task.
    const staleTodo = await prisma.userTodo.create({ data: {
      userId: user.id, title: first.title, completionPercentage: 0, isCompleted: false,
      description: `[معرف التكليف: ${first.id}] [معرف المهمة: ${plan.tasks[0].id}]`,
    } });
    await todos.updateTodo(user, staleTodo.id, { priority: Priority.HIGH });
    await assertCompleted(first.id);
    await todos.updateTodo(user, staleTodo.id, { completionPercentage: 0, dueDate: '2026-10-10' });
    await assertCompleted(first.id);
    assert.equal((await prisma.planTask.findUniqueOrThrow({ where: { id: plan.tasks[0].id } })).completionPercentage, 100);

    // Similar or identical titles without an explicit link cannot reopen a
    // completed assignment. Partial titles must not affect active assignments.
    const unlinked = await todos.createTodo(user, { title: first.title });
    await todos.updateTodo(user, unlinked.id, { completionPercentage: 25 });
    await assertCompleted(first.id);
    const active = await createTask(`${first.title} follow-up`);
    await todos.updateTodo(user, unlinked.id, { completionPercentage: 30 });
    assert.equal((await assignments.getTaskById(user, active.id)).completionPercentage, 0);

    // Explicit IDs take precedence over a different assignment with the same title.
    const namesake = await createTask(first.title);
    await todos.updateTodo(user, staleTodo.id, { completionPercentage: 50 });
    assert.equal((await assignments.getTaskById(user, first.id)).completionPercentage, 50);
    assert.equal((await assignments.getTaskById(user, first.id)).status, TaskStatus.IN_PROGRESS);
    assert.equal((await assignments.getTaskById(user, namesake.id)).completionPercentage, 0);
    await assignments.updateTask(user, first.id, { completionPercentage: 100 });
    await assertCompleted(first.id);

    const tomorrow = normalizePlanDate(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTasks = await dailyExecutiveTasks(prisma, directorate.id, tomorrow);
    assert.equal(tomorrowTasks.some((task) => task.id === first.id), false);
    assert.equal((await assignments.getTasks(user)).find((task) => task.id === first.id).status, TaskStatus.COMPLETED);
  } finally {
    if (directorate) await prisma.directorate.delete({ where: { id: directorate.id } });
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
