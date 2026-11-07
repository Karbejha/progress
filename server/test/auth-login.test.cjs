const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { AuthService } = require('../src/auth/auth.service');
const { AuthController } = require('../src/auth/auth.controller');
const { JwtStrategy } = require('../src/auth/jwt.strategy');
const { JwtAuthGuard } = require('../src/auth/jwt-auth.guard');
const { RolesGuard } = require('../src/auth/roles.guard');
const { AUTH_SESSION_VERSION } = require('../src/auth/auth-session');
const { EventsGateway } = require('../src/events/events.gateway');
const { PrismaService } = require('../src/prisma/prisma.service');

test('passwordless and malformed service logins cannot look up an account or issue a token', async () => {
  const auth = new AuthService({ user: {
    findFirst() { assert.fail('Missing credentials must not query accounts'); },
    findUnique() { assert.fail('Login must never select a user by directUserId'); },
  } }, { sign() { assert.fail('Missing credentials must not issue a session'); } });

  for (const payload of [
    undefined, null, {}, { directUserId: 'admin' },
    { directUserId: 'admin', password: 'anything' },
    { usernameOrEmail: 'admin', directUserId: 'admin' },
    { usernameOrEmail: 'admin', password: '' },
    { usernameOrEmail: 'admin', password: 42 },
    { usernameOrEmail: { id: 'admin' }, password: 'anything' },
    { usernameOrEmail: '   ', password: 'anything' },
  ]) {
    await assert.rejects(auth.login(payload), { status: 401 });
  }
});

test('HTTP and WebSocket authentication require verified passwords and reject all legacy sessions', { timeout: 20000 }, async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-password-login-regression-secret';
  const jwt = new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '1h' } });
  const users = [];
  for (const [id, role, isActive] of [
    ['admin', 'GENERAL_DIRECTOR', true], ['deputy', 'ASSISTANT_DIRECTOR', true],
    ['director', 'DIRECTOR', true], ['observer', 'OBSERVER', true], ['inactive', 'DIRECTOR', false],
  ]) {
    users.push({ id, username: id, email: `${id}@example.test`, fullName: id, role, isActive,
      directorateId: role === 'DIRECTOR' ? 'own' : null,
      password: await bcrypt.hash(` ${id}-password `, 4) });
  }
  let accountReads = 0;
  const prisma = { user: {
    findFirst: async ({ where }) => {
      accountReads++;
      return users.find((user) => where.OR.some((clause) => Object.entries(clause).every(([key, value]) => user[key] === value))) || null;
    },
    findUnique: async ({ where }) => {
      accountReads++;
      return users.find((user) => user.id === where.id) || null;
    },
    findMany: async () => users.filter((user) => user.isActive).map(({ password, ...user }) => user),
  } };
  const sockets = [];
  let app;
  try {
    class TestModule {}
    Module({ controllers: [AuthController], providers: [
      AuthService, JwtStrategy, JwtAuthGuard, RolesGuard, EventsGateway,
      { provide: PrismaService, useValue: prisma }, { provide: JwtService, useValue: jwt },
    ] })(TestModule);
    app = await NestFactory.create(TestModule, { logger: false });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const login = (body) => fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const get = (path, token) => fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const credentials = (id) => ({ usernameOrEmail: id, password: ` ${id}-password ` });
    const sessions = new Map();

    await t.test('missing, empty and non-string credentials fail validation before any account lookup', async () => {
      const readsBefore = accountReads;
      for (const body of [
        {}, null, { directUserId: 'admin' }, { usernameOrEmail: 'admin', directUserId: 'admin' },
        { usernameOrEmail: 'admin', password: '' }, { usernameOrEmail: 'admin', password: 42 },
        { usernameOrEmail: ['admin'], password: 'anything' }, { usernameOrEmail: '   ', password: 'anything' },
      ]) {
        const response = await login(body);
        assert.equal(response.status, 400, JSON.stringify(body));
        assert.equal((await response.json()).access_token, undefined);
      }
      assert.equal(accountReads, readsBefore);
    });

    await t.test('a direct user ID cannot bypass a wrong password, an unknown account or a disabled account', async () => {
      for (const body of [
        { usernameOrEmail: 'admin', password: 'wrong', directUserId: 'admin' },
        { usernameOrEmail: 'unknown', password: 'anything', directUserId: 'admin' },
        { ...credentials('inactive'), directUserId: 'admin' },
      ]) {
        const response = await login(body);
        assert.equal(response.status, 401);
        assert.equal((await response.json()).access_token, undefined);
      }
    });

    await t.test('correct passwords issue current sessions for the credential owner and never return password hashes', async () => {
      for (const id of ['admin', 'deputy', 'director', 'observer']) {
        const response = await login({ ...credentials(id), usernameOrEmail: `  ${id.toUpperCase()}  `, directUserId: 'inactive' });
        assert.equal(response.status, 201);
        const body = await response.json();
        assert.equal(body.user.id, id, 'An extra ID must not change the authenticated account');
        assert.equal(body.user.password, undefined);
        const payload = jwt.verify(body.access_token);
        assert.equal(payload.sub, id);
        assert.equal(payload.sessionVersion, AUTH_SESSION_VERSION);
        sessions.set(id, body.access_token);
        const profile = await get('/auth/me', body.access_token);
        assert.equal(profile.status, 200);
        assert.equal((await profile.json()).password, undefined);
      }
      const emailLogin = await login({ usernameOrEmail: 'DIRECTOR@EXAMPLE.TEST', password: credentials('director').password });
      assert.equal(emailLogin.status, 201, 'Email login stays supported');
    });

    await t.test('user enumeration requires both a current session and an authorized management role', async () => {
      assert.equal((await get('/auth/users')).status, 401);
      for (const id of ['director', 'observer']) assert.equal((await get('/auth/users', sessions.get(id))).status, 403);
      for (const id of ['admin', 'deputy']) {
        const response = await get('/auth/users', sessions.get(id));
        assert.equal(response.status, 200);
        const listed = await response.json();
        assert(!listed.some((user) => user.id === 'inactive' || user.password !== undefined));
      }
      const forgedRole = jwt.sign({ sub: 'director', role: 'GENERAL_DIRECTOR', sessionVersion: AUTH_SESSION_VERSION });
      assert.equal((await get('/auth/users', forgedRole)).status, 403, 'Roles come from the account, not token claims');
    });

    await t.test('previously signed sessions are rejected for bearer access, attachment-style query tokens and user lists', async () => {
      for (const payload of [
        { sub: 'admin' }, { sub: 'admin', sessionVersion: 1 },
        { sub: 'admin', sessionVersion: String(AUTH_SESSION_VERSION) },
        { sessionVersion: AUTH_SESSION_VERSION },
      ]) {
        const token = jwt.sign(payload);
        assert.equal((await get('/auth/me', token)).status, 401);
        assert.equal((await get(`/auth/me?token=${token}`)).status, 401);
        assert.equal((await get('/auth/users', token)).status, 401);
      }
      const currentQuery = await get(`/auth/me?token=${sessions.get('director')}`);
      assert.equal(currentQuery.status, 200);
      const expired = jwt.sign({ sub: 'admin', sessionVersion: AUTH_SESSION_VERSION }, { expiresIn: -1 });
      assert.equal((await get('/auth/me', expired)).status, 401);
      const invalidSignature = new JwtService({ secret: 'wrong-secret' }).sign({ sub: 'admin', sessionVersion: AUTH_SESSION_VERSION });
      assert.equal((await get('/auth/me', invalidSignature)).status, 401);
    });

    await t.test('real Socket.IO connections also reject legacy tokens and accept a new password-authenticated session', async () => {
      const { io } = require('socket.io-client');
      const connect = (token) => new Promise((resolve, reject) => {
        const socket = io(base, { auth: { token }, transports: ['websocket'], autoConnect: false, reconnection: false });
        sockets.push(socket);
        const timer = setTimeout(() => reject(new Error('Socket authentication timed out')), 3000);
        socket.once('connect', () => { clearTimeout(timer); resolve({ socket }); });
        socket.once('connect_error', (error) => { clearTimeout(timer); resolve({ socket, error }); });
        socket.connect();
      });
      for (const payload of [{ sub: 'admin' }, { sub: 'admin', sessionVersion: 1 }]) {
        const { socket, error } = await connect(jwt.sign(payload));
        assert.equal(error?.message, 'Unauthorized');
        assert.equal(socket.connected, false);
      }
      const { socket, error } = await connect(sessions.get('director'));
      assert.equal(error, undefined);
      const joined = await new Promise((resolve, reject) => socket.timeout(3000).emit('join', {}, (error, result) => error ? reject(error) : resolve(result)));
      assert.equal(joined.status, 'joined');
      const serverSocket = app.get(EventsGateway).server.sockets.sockets.get(socket.id);
      assert(serverSocket.rooms.has('room:user_director'));
      assert(!serverSocket.rooms.has('room:executive'));
    });
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (app) await app.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
