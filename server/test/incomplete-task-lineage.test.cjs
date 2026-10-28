const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DailyPlansService } = require('../src/daily-plans/daily-plans.service');

const directorateId = 'directorate';
const targetDate = '2026-10-14';
const task = (id, extra = {}) => ({
  id, title: 'Interview minutes', status: 'IN_PROGRESS', completionPercentage: 30,
  carriedFromTaskId: null, createdAt: new Date('2026-09-20T08:00:00Z'),
  priority: 'NORMAL', estimatedHours: 1, isMultiDay: true, todayTargetMet: false,
  ...extra,
});
const plan = (day, tasks, extra = {}) => ({
  id: `plan-${day}`, directorateId, planDate: new Date(`${day}T00:00:00Z`),
  tasks: tasks.map(t => ({ ...t, dailyPlanId: `plan-${day}` })), ...extra,
});

async function pending(plans) {
  const prisma = new Proxy({ dailyPlan: { findMany: async ({ where }) => {
    assert.equal(where.directorateId, directorateId);
    return plans.filter(p => p.directorateId === where.directorateId && (
      where.planDate.gte ? p.planDate >= where.planDate.gte : p.planDate < where.planDate.lt
    )).sort((a, b) => b.planDate - a.planDate);
  } } }, { get(target, key) {
    assert.ok(key in target, `Unexpected database operation: ${String(key)}`);
    return target[key];
  } });
  const service = new DailyPlansService(prisma, {}, {});
  return service.getIncompleteTasks({ directorateId }, targetDate);
}

test('cloning the previous plan excludes completed, cancelled and stale closed carryovers', async () => {
  const plans = [
    plan('2026-09-17', [task('closed-original', { status: 'COMPLETED', completionPercentage: 100 })]),
    plan('2026-09-20', [
      task('finished', { title: 'Finished', status: 'COMPLETED', completionPercentage: 100 }),
      task('percent-only', { title: 'Percent only', completionPercentage: 100 }),
      task('cancelled', { title: 'Cancelled', status: 'CANCELLED' }),
      task('stale', { title: 'Renamed stale copy', carriedFromTaskId: 'closed-original' }),
      task('pending', { title: 'Still working', completionPercentage: 60 }),
    ]),
  ];
  const service = new DailyPlansService({ dailyPlan: {
    findFirst: async () => plans[1],
    findMany: async ({ where }) => plans.filter(p =>
      where.planDate.gte ? p.planDate >= where.planDate.gte : p.planDate < where.planDate.lt
    ).sort((a, b) => b.planDate - a.planDate),
  } }, {}, {});
  const cloned = await service.clonePreviousPlan({ directorateId }, targetDate);
  assert.deepEqual(cloned.tasks.map(t => [t.id, t.completionPercentage]), [['pending', 60]]);
});

test('a stale 30% carryover of a completed original is excluded without database writes', async () => {
  assert.deepEqual(await pending([
    plan('2026-09-17', [task('original', { status: 'COMPLETED', completionPercentage: 100 })]),
    plan('2026-09-20', [task('carryover', { carriedFromTaskId: 'original' })]),
  ]), []);
});

test('completion or cancellation anywhere in a renamed multi-stage lineage closes its stale copies', async () => {
  for (const terminal of [
    { status: 'COMPLETED', completionPercentage: 30 },
    { status: 'IN_PROGRESS', completionPercentage: 100 },
    { status: 'CANCELLED', completionPercentage: 0 },
  ]) {
    assert.deepEqual(await pending([
      plan('2026-09-17', [task('original')]),
      plan('2026-09-20', [task('middle', { title: 'Renamed task', carriedFromTaskId: 'original' })]),
      plan('2026-09-21', [task('finished', { title: 'Final task', carriedFromTaskId: 'middle', ...terminal })]),
      plan('2026-09-22', [task('stale-sibling', { title: 'Another copy', carriedFromTaskId: 'original' })]),
    ]), []);
  }
});

test('an independent newer task with the same title stays pending', async () => {
  const result = await pending([
    plan('2026-09-17', [task('old', { status: 'COMPLETED', completionPercentage: 100 })]),
    plan('2026-09-20', [task('independent')]),
  ]);
  assert.deepEqual(result.map(t => t.id), ['independent']);
});

test('renamed tasks already carried into the current or a future plan are not offered again', async () => {
  for (const day of ['2026-10-14', '2026-10-15']) {
    assert.deepEqual(await pending([
      plan('2026-09-17', [task('original')]),
      plan('2026-09-20', [task('middle', { carriedFromTaskId: 'original' })]),
      plan(day, [task('current', { title: 'New title', carriedFromTaskId: 'middle' })]),
    ]), []);
  }
});

test('unfinished renamed carryovers return only the newest copy and keep its total percentage', async () => {
  const result = await pending([
    plan('2026-09-17', [task('original')]),
    plan('2026-09-20', [task('newest', {
      title: 'New title', carriedFromTaskId: 'original', todayTargetMet: true,
    })]),
  ]);
  assert.deepEqual(result.map(t => t.id), ['newest']);
  assert.equal(result[0].completionPercentage, 30);
  assert.equal(result[0].todayTargetMet, false);
});

test('dangling references, cycles and references to another directorate cannot close an independent task', async () => {
  const result = await pending([
    plan('2026-09-17', [task('cycle-a', { carriedFromTaskId: 'cycle-b' })]),
    plan('2026-09-20', [
      task('cycle-b', { title: 'Renamed cycle', carriedFromTaskId: 'cycle-a' }),
      task('dangling', { title: 'Dangling', carriedFromTaskId: 'missing' }),
      task('safe', { title: 'Safe', carriedFromTaskId: 'foreign' }),
    ]),
    plan('2026-09-21', [task('foreign', { status: 'COMPLETED', completionPercentage: 100 })], {
      directorateId: 'other-directorate',
    }),
  ]);
  assert.deepEqual(result.map(t => t.id), ['cycle-b', 'dangling', 'safe']);
});
