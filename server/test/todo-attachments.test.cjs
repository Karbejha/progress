const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Role } = require('@prisma/client');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { TodosController } = require('../src/todos/todos.controller');
const { TodosService } = require('../src/todos/todos.service');
const { AttachmentsController } = require('../src/attachments/attachments.controller');
const { AttachmentsService } = require('../src/attachments/attachments.service');
const { ExecutiveTasksService } = require('../src/executive-tasks/executive-tasks.service');
const { ExecutiveService } = require('../src/executive/executive.service');
const { JwtAuthGuard } = require('../src/auth/jwt-auth.guard');
const { JwtStrategy } = require('../src/auth/jwt.strategy');
const { JwtService } = require('@nestjs/jwt');
const { attachmentMimeType, MAX_ATTACHMENT_SIZE } = require('../src/attachments/attachment-files');
const { saveTodoAttachments, todoFileError } = require('../../client/src/lib/todoAttachments');

test('personal files accept common formats while official uploads remain PDF-only', () => {
  for (const [name, mime] of [
    ['report.PDF', 'application/pdf'], ['photo.png', 'image/png'],
    ['plan.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['table.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['notes.txt', 'text/plain'], ['table.csv', 'text/csv'], ['archive.zip', 'application/zip'],
  ]) {
    assert.equal(attachmentMimeType({ originalname: name, mimetype: 'application/octet-stream' }, 'TODO'), mime);
    assert.equal(todoFileError({ name, size: 100 }), null);
  }
  for (const name of ['script.html', 'icon.svg', 'app.exe', 'script.js', 'report.pdf.exe']) {
    assert.throws(() => attachmentMimeType({ originalname: name, mimetype: 'application/pdf' }, 'TODO'));
    assert.ok(todoFileError({ name, size: 100 }));
  }
  assert.throws(() => attachmentMimeType({ originalname: 'photo.png', mimetype: 'image/png' }, 'ANNOUNCEMENT'));
  assert.ok(todoFileError({ name: 'empty.pdf', size: 0 }));
  assert.ok(todoFileError({ name: 'large.pdf', size: MAX_ATTACHMENT_SIZE + 1 }));
});

test('saving uploads pending files and preserves existing attachment IDs', async () => {
  const uploaded = [];
  const api = {
    uploadAttachment: async (file, category) => { uploaded.push([file.name, category]); return { id: file.name }; },
    deleteAttachment: async () => assert.fail('Successful save must retain uploads'),
  };
  const result = await saveTodoAttachments(api, [{ name: 'new.pdf', size: 100 }], [{ id: 'existing' }], async (ids) => {
    assert.deepEqual(ids, ['existing', 'new.pdf']);
    return 'saved';
  });
  assert.equal(result, 'saved');
  assert.deepEqual(uploaded, [['new.pdf', 'TODO']]);
});

test('upload or save failures clean up only new, unlinked files and preserve the original error', async () => {
  for (const failUpload of [true, false]) {
    const cleaned = [];
    const api = {
      uploadAttachment: async (file) => {
        if (file.name === 'second.pdf' && failUpload) throw new Error('upload failed');
        return { id: file.name };
      },
      deleteAttachment: async (id, onlyUnlinked) => { cleaned.push([id, onlyUnlinked]); throw new Error('cleanup denied'); },
    };
    await assert.rejects(saveTodoAttachments(api,
      [{ name: 'first.pdf', size: 100 }, { name: 'second.pdf', size: 100 }], [{ id: 'existing' }],
      async () => { throw new Error('save failed'); }), new RegExp(failUpload ? 'upload failed' : 'save failed'));
    assert.deepEqual(cleaned, failUpload ? [['first.pdf', true]] : [['first.pdf', true], ['second.pdf', true]]);
  }
});

test('PostgreSQL and HTTP: private attachments survive refresh and progress edits; removal, rollback and permissions work', {
  skip: !process.env.PROGRESS_TEST_DATABASE_URL,
}, async (t) => {
  const url = new URL(process.env.PROGRESS_TEST_DATABASE_URL);
  assert.equal(url.pathname, '/progress_daily_regression', 'Use the isolated regression database');
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const events = { emitTodoUpdated() {} };
  const todos = new TodosService(prisma, events);
  const attachments = new AttachmentsService(prisma);
  const users = [];
  const uploads = [];
  const directorates = [];
  let app;
  let baseUrl;
  const previousJwtSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'attachment-regression-test-secret';
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  try {
    for (const role of [Role.DIRECTOR, Role.GENERAL_DIRECTOR]) {
      const id = randomUUID();
      users.push(await prisma.user.create({ data: { id, username: id, email: `${id}@example.test`, password: 'test', fullName: 'Attachment test', title: 'Test', role } }));
    }
    class TestModule {}
    Module({ controllers: [TodosController, AttachmentsController], providers: [
      { provide: TodosService, useValue: todos }, { provide: AttachmentsService, useValue: attachments },
      JwtAuthGuard, { provide: JwtStrategy, useValue: new JwtStrategy(prisma) },
    ] })(TestModule);
    app = await NestFactory.create(TestModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    const request = (endpoint, options = {}, user = users[0]) => fetch(baseUrl + endpoint, {
      ...options, headers: { Authorization: `Bearer ${jwt.sign({ sub: user.id, email: user.email, role: user.role })}`, ...options.headers },
    });
    const jsonRequest = (endpoint, method, data, user) => request(endpoint, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    }, user);
    const upload = async (name, type, category = 'TODO', user = users[0]) => {
      const form = new FormData();
      form.append('file', new Blob(['attachment content'], { type }), name);
      const response = await request(`/attachments/upload?category=${category}`, { method: 'POST', body: form }, user);
      assert.equal(response.status, 201, response.ok ? '' : await response.text());
      const attachment = await response.json();
      uploads.push(attachment);
      return attachment;
    };
    let todo, pdf, image, document;
    await t.test('upload, create and reload multiple files with Arabic filenames', async () => {
      pdf = await upload('تقرير المهمة.pdf', 'application/pdf');
      image = await upload('صورة.png', 'image/png');
      document = await upload('خطة العمل.docx', 'application/octet-stream');
      assert.equal(pdf.fileName, 'تقرير المهمة.pdf');
      assert.equal(document.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const response = await jsonRequest('/todos', 'POST', { title: 'Task with files', attachmentIds: [pdf.id, image.id, document.id] });
      assert.equal(response.status, 201);
      todo = await response.json();
      assert.equal(todo.attachments.length, 3);
      const refreshed = await (await request('/todos')).json();
      assert.equal(refreshed.todos.find((item) => item.id === todo.id).attachments.length, 3);
      await todos.updateTodo(users[0], todo.id, { completionPercentage: 100 });
      assert.equal((await todos.getTodoById(users[0], todo.id)).attachments.length, 3);
      await todos.toggleTodo(users[0], todo.id);
      assert.equal((await todos.getTodoById(users[0], todo.id)).attachments.length, 3);
    });
    await t.test('preview and download use the correct MIME type and filename', async () => {
      assert.equal((await fetch(`${baseUrl}/attachments/${pdf.id}/download`)).status, 401);
      const token = jwt.sign({ sub: users[0].id });
      assert.equal((await fetch(`${baseUrl}/attachments/${pdf.id}/download?token=${token}`)).status, 200);
      const preview = await request(`/attachments/${image.id}/download`);
      assert.equal(preview.status, 200);
      assert.match(preview.headers.get('content-type'), /image\/png/);
      assert.equal(preview.headers.get('x-content-type-options'), 'nosniff');
      const office = await request(`/attachments/${document.id}/download`);
      assert.equal(office.status, 200);
      assert.match(office.headers.get('content-disposition'), /^attachment;/);
      const download = await request(`/attachments/${pdf.id}/download?download=1`);
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-disposition'), /filename\*=UTF-8/);
    });
    await t.test('other users, including executives, cannot access or delete private attachments', async () => {
      for (const endpoint of [`/attachments/${pdf.id}`, `/attachments/${pdf.id}/download`]) {
        assert.equal((await request(endpoint, {}, users[1])).status, 403);
      }
      assert.equal((await request(`/attachments/${pdf.id}`, { method: 'DELETE' }, users[1])).status, 403);
      assert.equal((await request(`/todos/${todo.id}`, {}, users[1])).status, 404);
      const alien = await upload('other.pdf', 'application/pdf', 'TODO', users[1]);
      await assert.rejects(todos.updateTodo(users[0], todo.id, { title: 'Must roll back', attachmentIds: [pdf.id, alien.id] }));
      const reloaded = await todos.getTodoById(users[0], todo.id);
      assert.equal(reloaded.title, todo.title);
      assert.equal(reloaded.attachments.length, 3);
      assert.equal((await request(`/attachments/${alien.id}/download`)).status, 403);
    });
    await t.test('files cannot move between tasks, and failed creates leave no task behind', async () => {
      const before = await prisma.userTodo.count({ where: { userId: users[0].id } });
      const response = await jsonRequest('/todos', 'POST', { title: 'Invalid attachment', attachmentIds: [pdf.id] });
      assert.equal(response.status, 400);
      assert.equal(await prisma.userTodo.count({ where: { userId: users[0].id } }), before);
      const official = await upload('official.pdf', 'application/pdf', 'GENERAL');
      await assert.rejects(todos.updateTodo(users[0], todo.id, { attachmentIds: [official.id] }));
      assert.equal((await jsonRequest(`/todos/${todo.id}`, 'PATCH', { attachmentIds: [pdf.id, pdf.id] })).status, 400);
      assert.equal((await jsonRequest(`/todos/${todo.id}`, 'PATCH', { attachmentIds: Array.from({ length: 11 }, () => randomUUID()) })).status, 400);
    });
    await t.test('official assignments and announcements cannot expose or repurpose private uploads', async () => {
      const draft = await upload('private-draft.pdf', 'application/pdf');
      for (let index = 0; index < 2; index++) {
        directorates.push(await prisma.directorate.create({ data: { name: 'Attachment test', code: randomUUID() } }));
      }
      const noDelivery = new Proxy({}, { get: () => () => Promise.resolve() });
      const executiveTasks = new ExecutiveTasksService(prisma, noDelivery, noDelivery);
      const executive = new ExecutiveService(prisma, noDelivery, noDelivery);
      const single = await executiveTasks.createTasks(users[1], {
        title: 'Single attachment test', directorateIds: [directorates[0].id], attachmentIds: [pdf.id, draft.id],
      });
      await executiveTasks.updateTask(users[1], single[0].id, { attachmentIds: [pdf.id, draft.id] });
      await executiveTasks.createTasks(users[1], {
        title: 'Joint attachment test', directorateIds: directorates.map((item) => item.id), attachmentIds: [pdf.id, draft.id],
      });
      await executive.createAnnouncement(users[1], { title: 'Attachment test', content: 'Test', attachmentIds: [pdf.id, draft.id] });
      for (const id of [pdf.id, draft.id]) {
        const attachment = await prisma.attachment.findUnique({ where: { id } });
        assert.equal(attachment.category, 'TODO');
        assert.equal(attachment.executiveTaskId, null);
        assert.equal(attachment.announcementId, null);
        assert.equal(await prisma.attachment.count({ where: { fileUrl: attachment.fileUrl } }), 1);
        assert.equal((await request(`/attachments/${id}/download`, {}, users[1])).status, 403);
      }
    });
    await t.test('failed-response cleanup cannot delete files already saved to a task', async () => {
      assert.equal((await request(`/attachments/${pdf.id}?onlyUnlinked=1`, { method: 'DELETE' })).status, 403);
      assert.equal((await request(`/attachments/${pdf.id}/download`)).status, 200);
      const draft = await upload('draft.txt', 'text/plain');
      assert.equal((await request(`/attachments/${draft.id}?onlyUnlinked=1`, { method: 'DELETE' })).status, 200);
      assert.equal(fs.existsSync(path.resolve(draft.fileUrl)), false);
    });
    await t.test('unsupported, empty and oversize files are rejected; official uploads remain PDF-only', async () => {
      for (const [name, content, category] of [
        ['script.html', 'html', 'TODO'], ['empty.pdf', '', 'TODO'],
        ['large.pdf', new Uint8Array(MAX_ATTACHMENT_SIZE + 1), 'TODO'], ['photo.png', 'image', 'GENERAL'],
      ]) {
        const form = new FormData();
        form.append('file', new Blob([content]), name);
        assert.equal((await request(`/attachments/upload?category=${category}`, { method: 'POST', body: form })).status, name === 'large.pdf' ? 413 : 400);
      }
    });
    await t.test('removing one or all files and deleting the task clean up metadata and disk', async () => {
      const updated = await todos.updateTodo(users[0], todo.id, { attachmentIds: [pdf.id, document.id] });
      assert.equal(updated.attachments.length, 2);
      assert.equal(await prisma.attachment.findUnique({ where: { id: image.id } }), null);
      assert.equal(fs.existsSync(path.resolve(image.fileUrl)), false);
      const empty = await todos.updateTodo(users[0], todo.id, { attachmentIds: [] });
      assert.equal(empty.attachments.length, 0);
      const last = await upload('last.pdf', 'application/pdf');
      await todos.updateTodo(users[0], todo.id, { attachmentIds: [last.id] });
      await todos.deleteTodo(users[0], todo.id);
      assert.equal(await prisma.attachment.findUnique({ where: { id: last.id } }), null);
      assert.equal(fs.existsSync(path.resolve(last.fileUrl)), false);
    });
  } finally {
    if (app) await app.close();
    for (const user of users) await prisma.user.delete({ where: { id: user.id } });
    for (const directorate of directorates) await prisma.directorate.delete({ where: { id: directorate.id } });
    for (const attachment of uploads) fs.rmSync(path.resolve(attachment.fileUrl), { force: true });
    await prisma.$disconnect();
    if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousJwtSecret;
  }
});
