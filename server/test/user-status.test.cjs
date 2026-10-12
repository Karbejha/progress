const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient, Role } = require('@prisma/client');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { UsersService } = require('../src/users/users.service');
const { UsersController } = require('../src/users/users.controller');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController } = require('../src/auth/auth.controller');
const { JwtStrategy } = require('../src/auth/jwt.strategy');
const { JwtAuthGuard } = require('../src/auth/jwt-auth.guard');
const { RolesGuard } = require('../src/auth/roles.guard');
const { ExecutiveService } = require('../src/executive/executive.service');
const { ExecutiveTasksService } = require('../src/executive-tasks/executive-tasks.service');
const { DailyPlansService } = require('../src/daily-plans/daily-plans.service');
const { DirectoratesService } = require('../src/directorates/directorates.service');
const { normalizePlanDate, progressDate, workingDateKey } = require('../src/common/daily-progress');

test('account status rejects invalid values, missing accounts and leadership accounts', async () => {
  let storedUser = null;
  let writes = 0;
  const users = new UsersService({ user: {
    findUnique: async () => storedUser,
    update: async () => { writes++; },
  } }, {});
  for (const value of [undefined, null, 'false', 0, {}]) {
    await assert.rejects(users.setActive('user', value), { status: 400 });
  }
  await assert.rejects(users.setActive('missing', false), { status: 404 });
  for (const role of [Role.GENERAL_DIRECTOR, Role.ASSISTANT_DIRECTOR, Role.OBSERVER]) {
    storedUser = { id: 'leadership', role };
    await assert.rejects(users.setActive(storedUser.id, false), { status: 403 });
  }
  assert.equal(writes, 0);
});

test('both login paths and existing JWT sessions reject a disabled account', async () => {
  const user = { id: 'director', username: 'director', role: Role.DIRECTOR, password: await bcrypt.hash('test-password', 4), isActive: false };
  const prisma = { user: { findFirst: async () => user, findUnique: async () => user } };
  let signed = false;
  const auth = new AuthService(prisma, { sign: () => { signed = true; } });
  await assert.rejects(auth.login({ usernameOrEmail: user.username, password: 'test-password' }), { status: 401 });
  await assert.rejects(auth.login({ directUserId: user.id }), { status: 401 });
  await assert.rejects(new JwtStrategy(prisma).validate({ sub: user.id }), { status: 401 });
  assert.equal(signed, false);
  assert.equal(await auth.validateUser(user.username, 'incorrect-password'), null);
});

test('PostgreSQL and HTTP: suspension excludes stored activity, reports and shared tasks, and reactivation restores them', {
  skip: !process.env.PROGRESS_TEST_DATABASE_URL,
}, async (t) => {
  const url = new URL(process.env.PROGRESS_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/progress_daily_regression', 'Use the isolated regression database');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const userIds = [];
  const directorateIds = [];
  let app;
  let announcement;
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'user-status-regression-secret';
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const emissions = [];
  const events = { emitUserStatusChanged: (payload) => emissions.push(payload) };
  const noDelivery = new Proxy({}, { get: () => () => Promise.resolve() });
  try {
    const password = await bcrypt.hash('test-password', 4);
    const createUser = async (role, directorateId) => {
      const id = randomUUID();
      const user = await prisma.user.create({ data: {
        id, username: id, email: `${id}@example.test`, fullName: 'Status regression', title: 'Test', password, role, directorateId,
      } });
      userIds.push(id);
      assert.equal(user.isActive, true, 'Existing and new accounts default to active');
      return user;
    };
    const general = await createUser(Role.GENERAL_DIRECTOR);
    const assistant = await createUser(Role.ASSISTANT_DIRECTOR);
    const observer = await createUser(Role.OBSERVER);
    const directors = [];
    const date = normalizePlanDate();
    const sharedGroupId = randomUUID();
    for (const completionPercentage of [100, 0]) {
      const dir = await prisma.directorate.create({ data: { code: randomUUID(), name: `Status regression ${completionPercentage}` } });
      directorateIds.push(dir.id);
      const director = await createUser(Role.DIRECTOR, dir.id);
      directors.push(director);
      const plan = await prisma.dailyPlan.create({ data: {
        directorateId: dir.id, userId: director.id, planDate: date,
        tasks: { create: { title: 'Preserved plan task', completionPercentage, status: completionPercentage === 100 ? 'COMPLETED' : 'PENDING' } },
      } });
      await prisma.dailySummary.create({ data: {
        dailyPlanId: plan.id, directorateId: dir.id, userId: director.id, summaryDate: date,
        summaryText: 'Preserved summary', overallCompletionRate: completionPercentage, urgentFlag: completionPercentage === 0,
      } });
      await prisma.executiveTask.create({ data: {
        title: 'Shared assignment', directorateId: dir.id, assignedById: general.id, sharedGroupId,
        completionPercentage, status: completionPercentage === 100 ? 'COMPLETED' : 'PENDING',
        dailyProgress: { create: { progressDate: progressDate(date), startCompletionPercentage: 0, completionPercentage } },
      } });
    }
    const [active, target] = directors;
    const users = new UsersService(prisma, events);
    const auth = new AuthService(prisma, jwt);
    // Constrain aggregate queries to these fixtures so other regression files
    // can run concurrently without changing the expected denominators.
    const overviewPrisma = prisma.$extends({ query: { directorate: {
      async findMany({ args, query }) {
        args.where = { AND: [args.where || {}, { id: { in: directorateIds } }] };
        return query(args);
      },
      async count({ args, query }) {
        args.where = { AND: [args.where || {}, { id: { in: directorateIds } }] };
        return query(args);
      },
    } } });
    const executive = new ExecutiveService(overviewPrisma, noDelivery, noDelivery);
    const assignments = new ExecutiveTasksService(prisma, noDelivery, noDelivery);
    const plans = new DailyPlansService(prisma, noDelivery, noDelivery);
    const directorates = new DirectoratesService(prisma);

    class TestModule {}
    Module({ controllers: [UsersController, AuthController], providers: [
      { provide: UsersService, useValue: users }, { provide: AuthService, useValue: auth },
      JwtAuthGuard, RolesGuard, { provide: JwtStrategy, useValue: new JwtStrategy(prisma) },
    ] })(TestModule);
    app = await NestFactory.create(TestModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    const baseUrl = await app.getUrl();
    const targetToken = jwt.sign({ sub: target.id });
    const request = (path, actor, data, token) => fetch(baseUrl + path, {
      method: data === undefined ? 'GET' : 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(actor || token ? { Authorization: `Bearer ${token || jwt.sign({ sub: actor.id })}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const statusPath = `/users/${target.id}/status`;
    const overview = () => executive.getDailyOverview(workingDateKey());
    const historicalKey = '2026-10-01';

    await t.test('only the general director can change status; malformed requests never write', async () => {
      assert.equal((await request(statusPath, null, { isActive: false })).status, 401);
      for (const actor of [assistant, observer, active]) {
        assert.equal((await request(statusPath, actor, { isActive: false })).status, 403);
      }
      for (const isActive of ['false', 0, null, undefined]) {
        assert.equal((await request(statusPath, general, { isActive })).status, 400);
      }
      assert.equal((await request(`/users/${general.id}/status`, general, { isActive: false })).status, 403);
      assert.equal((await request(`/users/${randomUUID()}/status`, general, { isActive: false })).status, 404);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).isActive, true);
    });

    await t.test('suspension removes a directorate even when it already has plans, summaries and assignments', async () => {
      const before = await overview();
      assert.equal(before.kpis.totalDirectorates, 2);
      assert.equal(before.kpis.averageCompletionRate, 50);
      const response = await request(statusPath, general, { isActive: false });
      assert.equal(response.status, 200);
      const updated = await response.json();
      assert.equal(updated.isActive, false);
      assert.equal(updated.password, undefined);
      assert.deepEqual(emissions.at(-1), { userId: target.id, directorateId: target.directorateId, isActive: false });
      const after = await overview();
      assert.deepEqual(after.directorates.map((d) => d.directorateId), [active.directorateId]);
      assert.equal(after.kpis.totalDirectorates, 1);
      assert.equal(after.kpis.plansSubmittedCount, 1);
      assert.equal(after.kpis.summariesSubmittedCount, 1);
      assert.equal(after.kpis.plansSubmissionRate, 100);
      assert.equal(after.kpis.averageCompletionRate, 100);
      assert.equal(after.kpis.totalTasksCount, 2);
      assert.equal(after.kpis.urgentIssuesCount, 0);
      assert.equal((await executive.getDailyOverview(historicalKey)).directorates.some((d) => d.directorateId === target.directorateId), false);
      assert.equal((await assignments.getTasks(general)).some((task) => task.directorateId === target.directorateId), false);
      const shared = (await assignments.getTasks(general)).find((task) => task.sharedGroupId === sharedGroupId);
      assert.equal(shared.sharedDirectoratesCount, 1);
      assert.equal(shared.coTasks.some((task) => task.directorateId === target.directorateId), false);
      await assert.rejects(plans.getAchievementsReport(general, { directorateId: target.directorateId }), { status: 404 });
      assert.equal((await directorates.findAll()).some((dir) => dir.id === target.directorateId), false);
      assert.equal((await directorates.findAll(true)).some((dir) => dir.id === target.directorateId), true);
    });

    await t.test('saved tokens, password login and direct account switching cannot bypass suspension', async () => {
      assert.equal((await request('/auth/me', null, undefined, targetToken)).status, 401);
      for (const payload of [{ usernameOrEmail: target.username, password: 'test-password' }, { directUserId: target.id }]) {
        const response = await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        assert.equal(response.status, 401);
      }
      assert.equal((await auth.getAllUsersForSwitch()).some((user) => user.id === target.id), false);
      const managed = (await users.findAll()).find((user) => user.id === target.id);
      assert.equal(managed.isActive, false, 'Disabled accounts stay manageable');
    });

    await t.test('announcement percentages ignore disabled readers and unread directorates', async () => {
      announcement = await prisma.announcement.create({ data: { title: 'Status regression', content: 'Test', authorId: general.id } });
      await prisma.announcementRead.createMany({ data: directors.map((user) => ({ announcementId: announcement.id, userId: user.id })) });
      let readers = await executive.getAnnouncementReaders(general, announcement.id);
      assert.equal(readers.stats.totalDirectorates, 1);
      assert.equal(readers.stats.readCount, 1);
      assert.equal(readers.stats.readPercentage, 100);
      assert.equal(readers.readers.some((r) => r.userId === target.id), false);
      const listed = (await executive.getAnnouncements(general)).find((ann) => ann.id === announcement.id);
      assert.equal(listed.readCount, 1);
      assert.equal(listed.readPercentage, 100);
      await prisma.announcementRead.deleteMany({ where: { announcementId: announcement.id } });
      readers = await executive.getAnnouncementReaders(general, announcement.id);
      assert.deepEqual(readers.unreadDirectorates.map((dir) => dir.directorateId), [active.directorateId]);
    });

    await t.test('another active director keeps a shared directorate operational and excludes disabled authors', async () => {
      const replacement = await createUser(Role.DIRECTOR, target.directorateId);
      const result = await overview();
      const dir = result.directorates.find((d) => d.directorateId === target.directorateId);
      assert.equal(dir.director.id, replacement.id);
      assert.equal(dir.hasPlan, false);
      assert.equal(dir.hasSummary, false);
      const report = await plans.getAchievementsReport(general, { directorateId: target.directorateId });
      assert.equal(report.director.id, replacement.id);
      assert.equal(report.stats.totalPlansCount, 0);
      const assignedTask = await prisma.executiveTask.create({ data: {
        title: 'Directly assigned to disabled director', assignedById: general.id,
        directorateId: target.directorateId, assignedToUserId: target.id,
      } });
      assert.equal((await assignments.getTasks(general)).some((task) => task.id === assignedTask.id), false);
      await prisma.executiveTask.delete({ where: { id: assignedTask.id } });
      await prisma.user.delete({ where: { id: replacement.id } });
    });

    await t.test('a suspended directorate with no activity stops lowering submission percentages', async () => {
      const idleDir = await prisma.directorate.create({ data: { code: randomUUID(), name: 'Idle status regression' } });
      directorateIds.push(idleDir.id);
      const idleDirector = await createUser(Role.DIRECTOR, idleDir.id);
      await users.setActive(target.id, true);
      let result = await overview();
      assert.equal(result.kpis.totalDirectorates, 3);
      assert.equal(result.kpis.plansSubmissionRate, 67);
      assert.equal(result.kpis.summariesSubmissionRate, 67);
      await users.setActive(idleDirector.id, false);
      result = await overview();
      assert.equal(result.kpis.totalDirectorates, 2);
      assert.equal(result.kpis.plansSubmissionRate, 100);
      assert.equal(result.kpis.summariesSubmissionRate, 100);
      assert.equal(result.directorates.some((dir) => dir.directorateId === idleDir.id), false);
      await users.setActive(target.id, false);
    });

    await t.test('reactivation restores login and unchanged activity; suspending every director yields safe zero KPIs', async () => {
      const response = await request(statusPath, general, { isActive: true });
      assert.equal(response.status, 200);
      assert.equal((await request('/auth/me', null, undefined, targetToken)).status, 200);
      assert.ok((await auth.login({ usernameOrEmail: target.username, password: 'test-password' })).access_token);
      assert.equal((await overview()).kpis.totalDirectorates, 2);
      assert.equal((await overview()).kpis.averageCompletionRate, 50);
      const restored = await plans.getAchievementsReport(general, { directorateId: target.directorateId });
      assert.equal(restored.stats.totalPlansCount, 1);
      assert.equal(restored.stats.totalSummariesCount, 1);
      assert.equal(restored.stats.executiveTasksCount, 1);
      for (const director of directors) await users.setActive(director.id, false);
      const empty = await overview();
      assert.deepEqual(empty.directorates, []);
      for (const value of Object.values(empty.kpis)) assert.equal(value, 0);
      for (const director of directors) await users.setActive(director.id, true);
    });
  } finally {
    if (app) await app.close();
    if (announcement) await prisma.announcement.deleteMany({ where: { id: announcement.id } });
    await prisma.directorate.deleteMany({ where: { id: { in: directorateIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
