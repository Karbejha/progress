const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Role } = require('@prisma/client');
const { DailyPlansService } = require('../src/daily-plans/daily-plans.service');
const { TodosService } = require('../src/todos/todos.service');
const { normalizePlanDate } = require('../src/common/daily-progress');

test('PostgreSQL: completed plans survive stale saves, carryover creation and next-day reads; deliberate reopening works', {
  skip: !process.env.PROGRESS_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.PROGRESS_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/progress_daily_regression', 'Use only the isolated regression database');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const noDelivery = new Proxy({}, { get: () => () => Promise.resolve() });
  const plans = new DailyPlansService(prisma, noDelivery, noDelivery);
  const todos = new TodosService(prisma, noDelivery, noDelivery);
  const suffix = randomUUID();
  let directorate;
  let user;
  try {
    directorate = await prisma.directorate.create({ data: {
      name: 'Plan completion regression', code: `PLAN_${suffix}`, category: 'TEST',
    } });
    user = await prisma.user.create({ data: {
      username: `plan_${suffix}`, email: `plan_${suffix}@example.test`, password: 'test',
      fullName: 'Regression', title: 'Test', role: Role.DIRECTOR, directorateId: directorate.id,
    } });
    const createPlan = (date, task) => prisma.dailyPlan.create({ data: {
      directorateId: directorate.id, userId: user.id, planDate: normalizePlanDate(date),
      tasks: { create: { title: 'Linked task', status: 'IN_PROGRESS', completionPercentage: 30, ...task } },
    }, include: { tasks: true } });
    const original = await createPlan('2026-10-25');
    const second = await createPlan('2026-10-26', { carriedFromTaskId: original.tasks[0].id });
    const child = second.tasks[0];
    const todo = await prisma.userTodo.create({ data: {
      userId: user.id, title: 'Linked task', completionPercentage: 30,
      description: `[معرف المهمة: ${original.tasks[0].id}]`,
    } });
    await prisma.dailySummary.create({ data: {
      dailyPlanId: second.id, directorateId: directorate.id, userId: user.id,
      summaryDate: normalizePlanDate('2026-10-26'), summaryText: 'Test',
    } });

    await todos.updateTodo(user, todo.id, { completionPercentage: 100 });
    assert.deepEqual(await plans.getIncompleteTasks(user, '2026-10-27'), []);

    const staleSave = await plans.createOrUpdatePlan(user, {
      planDate: '2026-10-26', isSilent: true,
      tasks: [{ ...child, title: 'Renamed after completion',
        expectedProgress: { status: 'IN_PROGRESS', completionPercentage: 30 } }],
    });
    assert.equal(staleSave.tasks[0].status, 'COMPLETED');
    assert.equal(staleSave.tasks[0].completionPercentage, 100);
    assert.equal(staleSave.dailySummary.overallCompletionRate, 100);
    assert.equal((await prisma.userTodo.findUniqueOrThrow({ where: { id: todo.id } })).isCompleted, true);
    assert.deepEqual((await plans.clonePreviousPlan(user, '2026-10-27')).tasks, []);

    // A stale picker may create a carryover after its source has completed.
    const third = await plans.createOrUpdatePlan(user, {
      planDate: '2026-10-27', isSilent: true,
      tasks: [{ title: 'Stale imported copy', carriedFromTaskId: child.id,
        status: 'IN_PROGRESS', completionPercentage: 30, todayTargetMet: true }],
    });
    assert.equal(third.tasks[0].completionPercentage, 100);
    assert.equal(third.tasks[0].status, 'COMPLETED');
    assert.equal(third.tasks[0].todayTargetMet, false);
    assert.deepEqual(await plans.getIncompleteTasks(user, '2026-10-28'), []);

    const withAnotherCopy = await plans.createOrUpdatePlan(user, {
      planDate: '2026-10-27', isSilent: true,
      tasks: [third.tasks[0], { title: 'Another stale imported copy', carriedFromTaskId: child.id,
        status: 'IN_PROGRESS', completionPercentage: 30 }],
    });
    assert.equal(withAnotherCopy.tasks.length, 2);
    assert.ok(withAnotherCopy.tasks.every(task => task.status === 'COMPLETED' && task.completionPercentage === 100));

    await plans.createOrUpdatePlan(user, {
      planDate: '2026-10-26', isSilent: true,
      tasks: [{ id: child.id, title: child.title, status: 'PENDING', completionPercentage: 0,
        expectedProgress: { status: 'COMPLETED', completionPercentage: 100 } }],
    });
    const reopened = await prisma.planTask.findMany({ where: { dailyPlan: { directorateId: directorate.id } } });
    assert.ok(reopened.every(task => task.status === 'PENDING' && task.completionPercentage === 0));
    assert.deepEqual((await plans.getIncompleteTasks(user, '2026-10-28')).map(task => task.id), [withAnotherCopy.tasks[1].id]);

    await prisma.userTodo.update({ where: { id: todo.id }, data: {
      title: 'Original agenda title', description: `[معرف المهمة: ${original.tasks[0].id}]`,
      isCompleted: false, completionPercentage: 0,
    } });
    const unrelatedTodo = await prisma.userTodo.create({ data: {
      userId: user.id, title: 'Finished renamed copy', completionPercentage: 20,
      description: `[معرف المهمة: ${randomUUID()}]`,
    } });

    await plans.updateTaskStatus(user, child.id, { title: 'Finished renamed copy', completionPercentage: 100 });
    const completed = await prisma.planTask.findMany({ where: { dailyPlan: { directorateId: directorate.id } } });
    assert.ok(completed.every(task => task.status === 'COMPLETED' && task.completionPercentage === 100));
    assert.deepEqual(await plans.getIncompleteTasks(user, '2026-10-28'), []);
    assert.equal((await prisma.userTodo.findUniqueOrThrow({ where: { id: todo.id } })).isCompleted, true,
      'Completion of a renamed copy must close the agenda linked only to its original');
    assert.equal((await prisma.userTodo.findUniqueOrThrow({ where: { id: unrelatedTodo.id } })).completionPercentage, 20,
      'A namesake agenda item with a different explicit link remains independent');

    const fresh = await plans.createOrUpdatePlan(user, {
      planDate: '2026-10-28', isSilent: true,
      tasks: [{ title: 'Percent only', completionPercentage: 100 }, { title: 'Status only', status: 'COMPLETED' }],
    });
    assert.ok(fresh.tasks.every(task => task.status === 'COMPLETED' && task.completionPercentage === 100));
    assert.deepEqual(await plans.getIncompleteTasks(user, '2026-10-29'), []);

    await assert.rejects(plans.createOrUpdatePlan(user, {
      planDate: '2026-10-29', isSilent: true,
      tasks: [{ title: 'Missing source', carriedFromTaskId: randomUUID() }],
    }), /المهمة الأصلية/);
    assert.equal(await prisma.dailyPlan.count({ where: {
      directorateId: directorate.id, planDate: normalizePlanDate('2026-10-29'),
    } }), 0, 'Invalid carryovers must not create an empty plan');
  } finally {
    if (directorate) await prisma.directorate.delete({ where: { id: directorate.id } });
    if (user) await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
