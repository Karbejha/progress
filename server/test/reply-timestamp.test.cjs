const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaClient, Role } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const { ExecutiveTasksService } = require('../src/executive-tasks/executive-tasks.service');
const { formatReplyTimestamp } = require('../../client/src/lib/replyTimestamp');

test('reply time includes the full date, hour and minute in the working timezone across midnight', () => {
  const before = formatReplyTimestamp('2026-10-14T20:59:58Z');
  assert.match(before, /14.*10.*2026/);
  assert.match(before, /23:59/);
  assert.doesNotMatch(before, /\d{2}:\d{2}:\d{2}/);
  const after = formatReplyTimestamp('2026-10-14T21:00:01Z');
  assert.match(after, /15.*10.*2026/);
  assert.match(after, /00:00/);
  assert.doesNotMatch(after, /\d{2}:\d{2}:\d{2}/);
});

test('legacy and invalid reply times remain unknown', () => {
  for (const value of [undefined, null, '', 'invalid']) {
    assert.equal(formatReplyTimestamp(value), null);
  }
});

test('PostgreSQL: reply timestamps survive progress updates and refresh, track edits, and stay per directorate', {
  skip: !process.env.PROGRESS_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.PROGRESS_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/progress_daily_regression', 'Use the isolated regression database');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const notifications = [];
  const noDelivery = new Proxy({}, { get: () => () => Promise.resolve() });
  const service = new ExecutiveTasksService(prisma, noDelivery, {
    createNotificationForRoles: (_roles, notification) => {
      notifications.push(notification);
      return Promise.resolve();
    },
  });
  let directorate;
  let otherDirectorate;
  let user;
  const runId = randomUUID();
  try {
    directorate = await prisma.directorate.create({ data: { name: 'Reply regression', code: `REPLY_${runId}`, category: 'TEST' } });
    otherDirectorate = await prisma.directorate.create({ data: { name: 'Other reply', code: `OTHER_REPLY_${runId}`, category: 'TEST' } });
    user = await prisma.user.create({ data: {
      username: `reply_${runId}`, email: `reply_${runId}@example.test`, password: 'test',
      fullName: 'Regression', title: 'Test', role: Role.DIRECTOR, directorateId: directorate.id,
    } });
    const first = await prisma.executiveTask.create({ data: {
      title: 'Shared reply', directorateId: directorate.id, assignedById: user.id, sharedGroupId: runId,
    } });
    const otherTime = new Date('2026-09-01T09:15:30Z');
    const other = await prisma.executiveTask.create({ data: {
      title: first.title, directorateId: otherDirectorate.id, assignedById: user.id, sharedGroupId: first.sharedGroupId,
      completionNote: 'Other directorate response', completionNoteUpdatedAt: otherTime,
    } });

    const beforeSave = Date.now();
    const saved = await service.updateTask(user, first.id, {
      completionNote: 'Initial reply', completionNoteUpdatedAt: '2050-01-01T00:00:00Z',
    });
    assert.ok(saved.completionNoteUpdatedAt.getTime() >= beforeSave);
    assert.ok(saved.completionNoteUpdatedAt.getTime() <= Date.now(), 'The server supplies the reply time');
    const initialTime = saved.completionNoteUpdatedAt.toISOString();
    assert.equal(notifications.at(-1).metadata.completionNote, 'Initial reply');
    assert.equal(notifications.at(-1).metadata.completionNoteUpdatedAt.toISOString(), initialTime);
    assert.equal(saved.coTasks.find((task) => task.id === first.id).completionNoteUpdatedAt.toISOString(), initialTime);
    assert.equal(saved.coTasks.find((task) => task.id === other.id).completionNoteUpdatedAt.toISOString(), otherTime.toISOString());

    for (const changes of [
      { completionPercentage: 25 },
      { completionNote: 'Initial reply', completionPercentage: 50 },
      { completionNote: '  Initial reply  ', todayTargetMet: true },
    ]) {
      const result = await service.updateTask(user, first.id, changes);
      assert.equal(result.completionNoteUpdatedAt.toISOString(), initialTime);
    }
    await service.updateTask({ ...user, role: Role.GENERAL_DIRECTOR }, first.id, { title: 'Updated task title' });
    assert.equal((await service.getTaskById(user, first.id)).completionNoteUpdatedAt.toISOString(), initialTime);
    assert.equal((await service.getTasks(user))[0].completionNoteUpdatedAt.toISOString(), initialTime);

    const edited = await service.updateTask(user, first.id, { completionNote: 'Updated reply' });
    assert.ok(edited.completionNoteUpdatedAt.getTime() > saved.completionNoteUpdatedAt.getTime());
    assert.equal((await prisma.executiveTask.findUniqueOrThrow({ where: { id: other.id } })).completionNoteUpdatedAt.toISOString(), otherTime.toISOString());
    const removed = await service.updateTask(user, first.id, { completionNote: '' });
    assert.equal(removed.completionNoteUpdatedAt, null);
    const restored = await service.updateTask(user, first.id, { completionNote: 'New reply after removal' });
    assert.ok(restored.completionNoteUpdatedAt instanceof Date);

    const legacy = await prisma.executiveTask.create({ data: {
      title: 'Legacy response', directorateId: directorate.id, assignedById: user.id, completionNote: 'Undated reply',
    } });
    const unchangedLegacy = await service.updateTask(user, legacy.id, { completionNote: 'Undated reply', completionPercentage: 10 });
    assert.equal(unchangedLegacy.completionNoteUpdatedAt, null, 'Do not invent the time of an old response');
    assert.ok((await service.updateTask(user, legacy.id, { completionNote: 'Edited legacy reply' })).completionNoteUpdatedAt instanceof Date);
  } finally {
    if (user) await prisma.user.delete({ where: { id: user.id } });
    if (otherDirectorate) await prisma.directorate.delete({ where: { id: otherDirectorate.id } });
    if (directorate) await prisma.directorate.delete({ where: { id: directorate.id } });
    await prisma.$disconnect();
  }
});
