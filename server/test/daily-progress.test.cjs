const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient, TaskStatus, Role } = require('@prisma/client');
const {
  workingDateKey, normalizePlanDate, progressDate, withDailyExecutiveProgress,
  executiveDailyRate, averageDailyRate, dailyExecutiveTasks, recordExecutiveProgress,
} = require('../src/common/daily-progress');
const { ExecutiveService } = require('../src/executive/executive.service');
const { ExecutiveTasksService } = require('../src/executive-tasks/executive-tasks.service');
const { DailySummariesService } = require('../src/daily-summaries/daily-summaries.service');
const { DailyPlansService } = require('../src/daily-plans/daily-plans.service');
const { TodosService } = require('../src/todos/todos.service');
const { executiveDailyProgress } = require('../../client/src/lib/executiveDailyProgress');

const day = normalizePlanDate('2026-10-07');
const nextDay = normalizePlanDate('2026-10-08');
const legacyTask = { id: 'legacy', status: 'IN_PROGRESS', completionPercentage: 5, todayTargetMet: true };
const dailyTask = (entry, date = day) => withDailyExecutiveProgress({ ...legacyTask, dailyProgress: entry ? [entry] : [] }, date);

test('the reported two old assignments give 0% today while preserving cumulative 5%', () => {
  const first = dailyTask();
  const second = withDailyExecutiveProgress({ ...legacyTask, id: 'second', completionPercentage: 0 }, day);
  assert.equal(averageDailyRate([], [first, second]), 0);
  assert.equal(first.completionPercentage, 5);
  assert.equal(first.todayTargetMet, false);
  assert.equal(executiveDailyProgress(first, undefined, '2026-10-07').rate, 0);
});

test('partial daily credit is the increase from the first percentage of the day', () => {
  const task = dailyTask({ startCompletionPercentage: 5, completionPercentage: 15, todayTargetMet: false });
  assert.equal(executiveDailyRate(task), 10);
  assert.equal(executiveDailyProgress({ ...task, completionPercentage: 15 }, undefined, '2026-10-07').rate, 10);
});

test('daily target credit expires the next day in both calculations', () => {
  const task = dailyTask({ startCompletionPercentage: 5, completionPercentage: 5, todayTargetMet: true });
  assert.equal(executiveDailyRate(task), 100);
  assert.equal(executiveDailyProgress(task, undefined, '2026-10-07').rate, 100);
  assert.equal(executiveDailyProgress(task, undefined, '2026-10-08').rate, 0);
  assert.equal(executiveDailyRate(dailyTask(undefined, nextDay)), 0);
});

test('completion counts on the day completed, and metadata cannot complete it again', () => {
  const finished = { ...dailyTask({ startCompletionPercentage: 95, completionPercentage: 100, todayTargetMet: true }), status: 'COMPLETED', completionPercentage: 100 };
  assert.equal(executiveDailyRate(finished), 100);
  assert.equal(executiveDailyProgress(finished, undefined, '2026-10-08').rate, 0);
  const old = withDailyExecutiveProgress({ ...finished, dailyProgress: [] }, nextDay);
  assert.equal(executiveDailyRate(old), 0);
  assert.equal(executiveDailyProgress(old, undefined, '2026-10-08').rate, 0);
});

test('decreases and unchanged percentages do not give positive credit', () => {
  for (const percentage of [0, 5]) {
    assert.equal(executiveDailyRate(dailyTask({ startCompletionPercentage: 5, completionPercentage: percentage, todayTargetMet: false })), 0);
  }
});

test('the preview counts unsaved progress and same-percentage target confirmation', () => {
  const task = dailyTask();
  assert.equal(executiveDailyProgress(task, { status: 'IN_PROGRESS', completionPercentage: 10, isModified: true }, '2026-10-07').rate, 5);
  assert.equal(executiveDailyProgress(task, { status: 'IN_PROGRESS', completionPercentage: 5, todayTargetMet: true, isModified: true }, '2026-10-07').rate, 100);
  assert.equal(executiveDailyProgress(task, { status: 'IN_PROGRESS', completionPercentage: 5, isModified: true }, '2026-10-07').rate, 0);
});

test('a completed plan task and stale assignment average to 50%, and empty days to 0%', () => {
  assert.equal(averageDailyRate([{ status: 'COMPLETED', completionPercentage: 100 }], [dailyTask()]), 50);
  assert.equal(averageDailyRate([], []), 0);
});

test('working-day rollover uses Istanbul time, even when the host uses UTC', () => {
  assert.equal(workingDateKey(new Date('2026-10-07T20:59:59.999Z')), '2026-10-07');
  assert.equal(workingDateKey(new Date('2026-10-07T21:00:00Z')), '2026-10-08');
  assert.equal(progressDate(day).toISOString(), '2026-10-07T00:00:00.000Z');
});

test('the dashboard ignores old stored rates today and preserves historical reports', async () => {
  const today = normalizePlanDate();
  const fixture = {
    id: 'dir', name: 'IT', users: [], executiveTasks: [legacyTask, { ...legacyTask, id: 'other', completionPercentage: 0 }],
    dailyPlans: [{ tasks: [], dailySummary: { overallCompletionRate: 2.5 }, feedbacks: [] }],
  };
  const service = new ExecutiveService({ directorate: { findMany: async () => [fixture] } }, {}, {});
  const result = await service.getDailyOverview(workingDateKey());
  assert.equal(result.directorates[0].completionRate, 0);
  assert.equal(result.kpis.averageCompletionRate, 0);
  assert.equal(result.directorates[0].completedTasksCount, 0);
  const past = new Date(today); past.setDate(past.getDate() - 1);
  const pastKey = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
  assert.equal((await service.getDailyOverview(pastKey)).directorates[0].completionRate, 2.5);
});

test('PostgreSQL: updates, repeated saves, metadata, targets, concurrency and day rollover', {
  skip: !process.env.PROGRESS_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.PROGRESS_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/progress_daily_regression', 'Integration tests require the isolated regression database');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  let directorate;
  let user;
  try {
    directorate = await prisma.directorate.create({ data: { name: 'Daily regression', code: 'DAILY_REGRESSION', category: 'TEST' } });
    user = await prisma.user.create({ data: { username: 'daily_regression', email: 'daily_regression@example.test', password: 'test', fullName: 'Regression', title: 'Test', role: Role.DIRECTOR, directorateId: directorate.id } });
    const task = await prisma.executiveTask.create({ data: { title: 'Legacy 5%', directorateId: directorate.id, assignedById: user.id, completionPercentage: 5, status: TaskStatus.IN_PROGRESS, todayTargetMet: true, createdAt: new Date('2026-10-01T09:00:00Z') } });
    const read = async (date) => (await dailyExecutiveTasks(prisma, directorate.id, date))[0];
    const update = async (changes, date = day) => prisma.$transaction(async (tx) => {
      const targetMet = await recordExecutiveProgress(tx, task.id, changes, date);
      return tx.executiveTask.update({ where: { id: task.id }, data: { ...changes, todayTargetMet: targetMet } });
    });
    assert.equal(executiveDailyRate(await read(day)), 0);
    await update({ title: 'Metadata only', completionPercentage: 5 });
    assert.equal(await prisma.executiveTaskDailyProgress.count({ where: { executiveTaskId: task.id } }), 0);
    await update({ completionPercentage: 10 });
    assert.equal(executiveDailyRate(await read(day)), 5);
    await update({ completionPercentage: 15 });
    await update({ completionPercentage: 15, completionNote: 'Same percentage' });
    assert.equal((await read(day)).dailyStartCompletionPercentage, 5);
    assert.equal(executiveDailyRate(await read(day)), 10);
    assert.equal(await prisma.executiveTaskDailyProgress.count({ where: { executiveTaskId: task.id } }), 1);
    await update({ todayTargetMet: true });
    assert.equal(executiveDailyRate(await read(day)), 100);
    assert.equal(executiveDailyRate(await read(nextDay)), 0);
    await update({ completionNote: 'A note tomorrow' }, nextDay);
    assert.equal(executiveDailyRate(await read(nextDay)), 0);
    assert.equal(await prisma.executiveTaskDailyProgress.count({ where: { executiveTaskId: task.id } }), 1);
    await update({ todayTargetMet: true }, nextDay);
    assert.equal(executiveDailyRate(await read(nextDay)), 100);
    await update({ todayTargetMet: false }, nextDay);
    await Promise.all([update({ completionPercentage: 20 }, nextDay), update({ completionPercentage: 25 }, nextDay)]);
    assert.equal((await read(nextDay)).dailyStartCompletionPercentage, 15);
    assert.equal(await prisma.executiveTaskDailyProgress.count({ where: { executiveTaskId: task.id } }), 2);
    await update({ completionPercentage: 100, status: TaskStatus.COMPLETED }, nextDay);
    assert.equal((await read(nextDay)).completedOnDate, true);
    const later = normalizePlanDate('2026-10-09');
    await update({ title: 'Completed metadata edited' }, later);
    assert.deepEqual(await dailyExecutiveTasks(prisma, directorate.id, later), []);
    assert.equal(executiveDailyRate(await read(day)), 100, 'Later edits preserve the first day\'s target');
  } finally {
    if (directorate) await prisma.directorate.delete({ where: { id: directorate.id } });
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});

test('PostgreSQL: dashboard, summaries, plan edits and agenda use the same daily rate', {
  skip: !process.env.PROGRESS_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.PROGRESS_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/progress_daily_regression');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  // Suppress notifications and WebSocket delivery in the isolated test.
  const noDelivery = new Proxy({}, { get: () => () => Promise.resolve() });
  const executive = new ExecutiveService(prisma, noDelivery, noDelivery);
  const assignments = new ExecutiveTasksService(prisma, noDelivery, noDelivery);
  const summaries = new DailySummariesService(prisma, noDelivery, noDelivery);
  const plans = new DailyPlansService(prisma, noDelivery, noDelivery);
  const todos = new TodosService(prisma, noDelivery);
  let directorate;
  let user;
  try {
    directorate = await prisma.directorate.create({ data: { name: 'Service regression', code: 'SERVICE_REGRESSION', category: 'TEST' } });
    user = await prisma.user.create({ data: { username: 'service_regression', email: 'service_regression@example.test', password: 'test', fullName: 'Regression', title: 'Test', role: Role.DIRECTOR, directorateId: directorate.id } });
    const first = await prisma.executiveTask.create({ data: { title: 'Old assignment', directorateId: directorate.id, assignedById: user.id, status: TaskStatus.IN_PROGRESS, completionPercentage: 5, todayTargetMet: true } });
    await prisma.executiveTask.create({ data: { title: 'Other assignment', directorateId: directorate.id, assignedById: user.id } });
    const dashboard = async () => (await executive.getDailyOverview()).directorates.find((item) => item.directorateId === directorate.id);
    const storedRate = async () => (await summaries.getMySummary(user)).overallCompletionRate;
    assert.equal((await dashboard()).completionRate, 0);
    assert.equal((await assignments.getTasks(user))[0].todayTargetMet, false);
    await assignments.updateTask(user, first.id, { completionPercentage: 5, completionNote: 'A note only' });
    assert.equal((await dashboard()).completionRate, 0);
    assert.equal((await summaries.submitSummary(user, { summaryText: 'Daily report' })).overallCompletionRate, 0);
    const saved = await assignments.updateTask(user, first.id, { completionPercentage: 10 });
    assert.equal(saved.dailyCompletionPercentage, 5);
    assert.equal((await dashboard()).completionRate, 2.5);
    assert.equal(await storedRate(), 2.5);
    assert.equal((await plans.getMyPlanForDate(user)).dailySummary.overallCompletionRate, 2.5);
    await assignments.updateTask(user, first.id, { todayTargetMet: true });
    assert.equal((await dashboard()).completedTasksCount, 1);
    assert.equal(await storedRate(), 50);
    await assignments.updateTask(user, first.id, { todayTargetMet: false });
    const plan = await plans.createOrUpdatePlan(user, { tasks: [{ title: 'Independent daily task' }] });
    assert.equal(await storedRate(), 1.7);
    await plans.updateTaskStatus(user, plan.tasks[0].id, { completionPercentage: 100, status: TaskStatus.COMPLETED });
    assert.equal(await storedRate(), 35);
    const todo = await todos.createTodo(user, { title: 'Old assignment', description: `[معرف التكليف: ${first.id}]`, completionPercentage: 10 });
    await todos.updateTodo(user, todo.id, { completionPercentage: 15 });
    assert.equal(await storedRate(), 36.7);
    assert.equal((await dashboard()).completionRate, 36.7);
    assert.equal((await assignments.getTaskById(user, first.id)).dailyStartCompletionPercentage, 5);
    await plans.deletePlanTask(user, plan.tasks[0].id);
    assert.equal(await storedRate(), 5);
    await assignments.deleteTask({ ...user, role: Role.GENERAL_DIRECTOR }, first.id);
    assert.equal(await storedRate(), 0);
  } finally {
    if (directorate) await prisma.directorate.delete({ where: { id: directorate.id } });
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
