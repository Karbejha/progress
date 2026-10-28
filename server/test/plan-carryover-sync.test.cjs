const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DailyPlansService } = require('../src/daily-plans/daily-plans.service');
const { normalizePlanDate } = require('../src/common/daily-progress');

function fixture({ sameDaySibling = false } = {}) {
  const user = { id: 'user', role: 'DIRECTOR', directorateId: 'directorate' };
  const tasks = new Map();
  const add = (id, day, extra = {}) => {
    const directorateId = extra.directorateId || user.directorateId;
    const dailyPlanId = `${directorateId}-${day}`;
    tasks.set(id, {
      id, dailyPlanId, title: 'Interview minutes', description: `Details for ${id}`,
      completionNote: `Note for ${id}`, priority: 'NORMAL', estimatedHours: 1,
      status: 'COMPLETED', completionPercentage: 100, isMultiDay: true, todayTargetMet: false,
      carriedFromTaskId: null, createdAt: new Date(`${day}T08:00:00Z`),
      dailyPlan: {
        id: dailyPlanId, directorateId, userId: user.id, planDate: normalizePlanDate(day),
        directorate: { name: 'Directorate' },
      }, ...extra,
    });
  };
  add('original', '2026-09-17');
  add('child', '2026-09-20', { carriedFromTaskId: 'original' });
  add('sibling', sameDaySibling ? '2026-09-20' : '2026-09-18', { carriedFromTaskId: 'original' });
  add('namesake', '2026-09-15', { status: 'IN_PROGRESS', completionPercentage: 30 });
  add('foreign', '2026-09-21', { directorateId: 'other', carriedFromTaskId: 'original' });
  const planWrites = [], familyReads = [], summaryWrites = [], agendaSyncs = [], notifications = [];
  const summaries = new Map([...tasks.values()].map(t => [t.dailyPlanId, { id: `summary-${t.dailyPlanId}`, overallCompletionRate: 100 }]));
  const plans = () => [...new Map([...tasks.values()].map(t => [t.dailyPlanId, {
    ...t.dailyPlan,
    tasks: [...tasks.values()].filter(other => other.dailyPlanId === t.dailyPlanId).map(t => ({ ...t })),
    dailySummary: summaries.get(t.dailyPlanId),
  }])).values()];
  const prisma = {
    planTask: {
      findUnique: async ({ where }) => tasks.get(where.id),
      findMany: async ({ where }) => {
        if (where.OR) {
          familyReads.push(where);
          return [...tasks.values()].filter(t => t.dailyPlan.directorateId === where.dailyPlan.directorateId && (
            where.OR.some(filter => filter.id ? filter.id.in.includes(t.id) : filter.carriedFromTaskId.in.includes(t.carriedFromTaskId))
          ));
        }
        return [...tasks.values()].filter(t => t.dailyPlanId === where.dailyPlanId);
      },
      update: async ({ where, data }) => {
        const current = tasks.get(where.id);
        if ((where.status !== undefined && where.status !== current.status) ||
            (where.completionPercentage !== undefined && where.completionPercentage !== current.completionPercentage)) {
          throw Object.assign(new Error('Progress changed concurrently'), { code: 'P2025' });
        }
        planWrites.push({ id: where.id, data: { ...data } });
        const updated = { ...tasks.get(where.id), ...data };
        tasks.set(where.id, updated);
        return updated;
      },
    },
    dailyPlan: {
      findUnique: async ({ where }) => plans().find(p => p.directorateId === where.directorateId_planDate.directorateId &&
        p.planDate.getTime() === where.directorateId_planDate.planDate.getTime()),
      findMany: async ({ where }) => plans().filter(p => p.directorateId === where.directorateId && (
        where.planDate.gte ? p.planDate >= where.planDate.gte : p.planDate < where.planDate.lt
      )).sort((a, b) => b.planDate - a.planDate),
      update: async ({ where }) => plans().find(p => p.id === where.id),
    },
    executiveTask: { findMany: async () => [] },
    dailySummary: {
      findUnique: async ({ where }) => summaries.get(where.dailyPlanId),
      update: async ({ where, data }) => { summaryWrites.push({ id: where.id, ...data }); return data; },
    },
  };
  const service = new DailyPlansService(prisma, { emitTaskUpdated() {} }, {
    createNotificationForRoles: (...args) => notifications.push(args),
  });
  service.syncPlanTaskToUserTodo = async (...args) => agendaSyncs.push(args);
  return { service, user, tasks, planWrites, familyReads, summaryWrites, agendaSyncs, notifications };
}

test('directly reopening a completed plan copy reopens its family and makes it available the next day', async () => {
  for (const percentage of [50, 0]) {
    const state = fixture();
    await state.service.updateTaskStatus(state.user, 'child', {
      status: percentage ? 'IN_PROGRESS' : 'PENDING', completionPercentage: percentage,
    });
    for (const id of ['original', 'child', 'sibling']) {
      assert.equal(state.tasks.get(id).completionPercentage, percentage);
      assert.equal(state.tasks.get(id).completionNote, `Note for ${id}`);
      assert.equal(state.tasks.get(id).description, `Details for ${id}`);
    }
    assert.equal(state.tasks.get('namesake').completionPercentage, 30);
    assert.equal(state.tasks.get('foreign').completionPercentage, 100);
    assert.equal(state.notifications.length, 1, 'Only the selected task creates an executive notification');
    assert.equal(state.summaryWrites.length, 3);
    assert.ok(state.summaryWrites.every(s => s.overallCompletionRate === percentage));
    const pending = await state.service.getIncompleteTasks(state.user, '2026-10-14');
    assert.deepEqual(pending.map(t => [t.id, t.completionPercentage]), [['child', percentage]]);
  }
});

test('plan form saving cannot undo an edited copy with an unchanged completed sibling', async () => {
  const state = fixture({ sameDaySibling: true });
  await state.service.createOrUpdatePlan(state.user, {
    planDate: '2026-09-20', isSilent: true,
    tasks: [
      { ...state.tasks.get('child'), status: 'IN_PROGRESS', completionPercentage: 50,
        expectedProgress: { status: 'COMPLETED', completionPercentage: 100 } },
      { ...state.tasks.get('sibling') },
    ],
  });
  for (const id of ['original', 'child', 'sibling']) {
    assert.equal(state.tasks.get(id).completionPercentage, 50);
  }
  assert.equal(state.agendaSyncs.length, 2);
  assert.ok(state.agendaSyncs.every(args => args[3] === false && args[6] === 50));
  assert.ok(state.summaryWrites.every(s => s.overallCompletionRate === 50));
});

test('editing notes or re-saving unchanged progress does not change linked plan records', async () => {
  for (const change of [{ completionNote: 'Edited note' }, { status: 'COMPLETED', completionPercentage: 100 }]) {
    const state = fixture();
    await state.service.updateTaskStatus(state.user, 'child', change);
    assert.deepEqual(state.familyReads, []);
    assert.deepEqual(state.planWrites.map(write => write.id), ['child']);
    assert.equal(state.tasks.get('original').completionNote, 'Note for original');
  }
});

test('a stale full-plan save cannot reopen a completed carryover family', async () => {
  for (const isSilent of [true, false]) {
    const state = fixture();
    // Avoid unrelated notification delivery in the explicit-submit case.
    state.service.eventsGateway.emitPlanSubmitted = () => {};
    await state.service.createOrUpdatePlan(state.user, {
      planDate: '2026-09-20', isSilent,
      tasks: [{ ...state.tasks.get('child'), title: 'Edited details from an old tab',
        status: 'IN_PROGRESS', completionPercentage: 30,
        expectedProgress: { status: 'IN_PROGRESS', completionPercentage: 30 } }],
    });
    for (const id of ['original', 'child', 'sibling']) {
      assert.equal(state.tasks.get(id).status, 'COMPLETED');
      assert.equal(state.tasks.get(id).completionPercentage, 100);
    }
    assert.equal(state.tasks.get('child').title, 'Edited details from an old tab');
    const pending = await state.service.getIncompleteTasks(state.user, '2026-10-14');
    assert.ok(!pending.some(task => task.id === 'child'));
  }
});

test('a conflicting deliberate form edit preserves newer saved progress', async () => {
  const state = fixture();
  await state.service.createOrUpdatePlan(state.user, {
    planDate: '2026-09-20', isSilent: true,
    tasks: [{ ...state.tasks.get('child'), status: 'IN_PROGRESS', completionPercentage: 60,
      expectedProgress: { status: 'IN_PROGRESS', completionPercentage: 30 } }],
  });
  assert.equal(state.tasks.get('child').completionPercentage, 100);
  assert.deepEqual(state.familyReads, []);
});

test('older clients without a baseline cannot lower progress through full-plan saves', async () => {
  const state = fixture();
  await state.service.createOrUpdatePlan(state.user, {
    planDate: '2026-09-20', isSilent: true,
    tasks: [{ ...state.tasks.get('child'), status: 'IN_PROGRESS', completionPercentage: 30 }],
  });
  assert.equal(state.tasks.get('child').completionPercentage, 100);
  assert.deepEqual(state.familyReads, []);
});

test('deliberately resetting a task to zero through the plan form reopens its family', async () => {
  const state = fixture();
  await state.service.createOrUpdatePlan(state.user, {
    planDate: '2026-09-20', isSilent: true,
    tasks: [{ ...state.tasks.get('child'), status: 'PENDING', completionPercentage: 0,
      expectedProgress: { status: 'COMPLETED', completionPercentage: 100 } }],
  });
  for (const id of ['original', 'child', 'sibling']) {
    assert.equal(state.tasks.get(id).status, 'PENDING');
    assert.equal(state.tasks.get(id).completionPercentage, 0);
  }
});

test('saving only 100 percent or only COMPLETED stores a consistent terminal state', async () => {
  for (const change of [{ completionPercentage: 100 }, { status: 'COMPLETED' }]) {
    const state = fixture();
    for (const id of ['original', 'child', 'sibling']) {
      Object.assign(state.tasks.get(id), { status: 'IN_PROGRESS', completionPercentage: 30 });
    }
    await state.service.updateTaskStatus(state.user, 'child', change);
    for (const id of ['original', 'child', 'sibling']) {
      assert.equal(state.tasks.get(id).status, 'COMPLETED');
      assert.equal(state.tasks.get(id).completionPercentage, 100);
    }
  }
});

test('completion committed between reading and writing a plan cannot be undone by that save', async () => {
  const state = fixture();
  Object.assign(state.tasks.get('child'), { status: 'IN_PROGRESS', completionPercentage: 30 });
  const update = state.service.prisma.planTask.update;
  let raced = false;
  state.service.prisma.planTask.update = async (args) => {
    if (!raced) {
      raced = true;
      Object.assign(state.tasks.get('child'), { status: 'COMPLETED', completionPercentage: 100 });
    }
    return update(args);
  };
  await state.service.createOrUpdatePlan(state.user, {
    planDate: '2026-09-20', isSilent: true,
    tasks: [{ ...state.tasks.get('child'), title: 'Text survives the conflict',
      status: 'IN_PROGRESS', completionPercentage: 60,
      expectedProgress: { status: 'IN_PROGRESS', completionPercentage: 30 } }],
  });
  assert.equal(state.tasks.get('child').completionPercentage, 100);
  assert.equal(state.tasks.get('child').title, 'Text survives the conflict');
  assert.deepEqual(state.familyReads, []);
});
