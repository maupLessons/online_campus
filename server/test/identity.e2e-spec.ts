import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { useContainer } from 'class-validator';
import { Connection, Types } from 'mongoose';
import type { Response as SuperAgentResponse } from 'superagent';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { Role } from '../src/common/types/roles.enum';
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const TEST_PASSWORD = 'StrongPass1';
const TEST_JWT_SECRET = 'identity-e2e-jwt-secret-with-sufficient-entropy';
const TEST_CSRF_SECRET = 'identity-e2e-csrf-secret-with-sufficient-entropy';

type TestUser = {
  id: Types.ObjectId;
  login: string;
};

function setCookieHeaders(response: SuperAgentResponse): string[] {
  const raw = response.headers['set-cookie'];
  if (Array.isArray(raw)) return raw;
  return typeof raw === 'string' ? [raw] : [];
}

function cookieHeader(response: SuperAgentResponse): string {
  return setCookieHeaders(response)
    .map((cookie) => cookie.split(';', 1)[0])
    .join('; ');
}

function responseBody<T>(response: SuperAgentResponse): T {
  const body: unknown = response.body;
  return body as T;
}

function cookieValue(response: SuperAgentResponse, name: string): string {
  const cookie = setCookieHeaders(response).find((item) =>
    item.startsWith(`${name}=`),
  );
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return decodeURIComponent(cookie.split(';', 1)[0].slice(name.length + 1));
}

describe('Identity and session security (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;

  const users = () => connection.model('User').collection;

  beforeAll(async () => {
    container = await new GenericContainer('mongo:7.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .start();

    const mongoUri = `mongodb://${container.getHost()}:${container.getMappedPort(
      27017,
    )}/identity-e2e`;
    const testConfig = new ConfigService({
      MONGODB_URI: mongoUri,
      JWT_SECRET: TEST_JWT_SECRET,
      AUTH_CSRF_SECRET: TEST_CSRF_SECRET,
      AUDIT_TRANSACTIONAL_OUTBOX: 'false',
      DB_MIGRATIONS_ENABLED: 'false',
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173',
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SeedService)
      .useValue({ onModuleInit: jest.fn() })
      .overrideProvider(ConfigService)
      .useValue(testConfig)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useLogger(['error']);
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    configureApp(app, { swaggerEnabled: false });
    await app.init();

    connection = app.get(getConnectionToken());
    await connection.syncIndexes();
  }, SETUP_TIMEOUT);

  beforeEach(async () => {
    await Promise.all(
      Object.values(connection.collections).map((item) => item.deleteMany({})),
    );
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  const createUser = async (
    role: Role,
    suffix: string,
    status: 'active' | 'blocked' = 'active',
  ): Promise<TestUser> => {
    const id = new Types.ObjectId();
    const login = `${role}_${suffix}`;
    await users().insertOne({
      _id: id,
      login,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 12),
      refreshTokenHashes: [],
      role,
      email: `${login}@example.test`,
      firstName: role,
      lastName: suffix,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { id, login };
  };

  const login = (user: TestUser) =>
    request(app.getHttpServer()).post('/api/auth/login').send({
      login: user.login,
      password: TEST_PASSWORD,
    });

  it('issues hardened cookies without exposing tokens in JSON', async () => {
    const student = await createUser(Role.STUDENT, 'cookies');
    const response = await login(student).expect(201);
    const body = responseBody<{
      user: { login: string; passwordHash?: string };
      accessToken?: unknown;
      refreshToken?: unknown;
    }>(response);

    expect(body.user).toMatchObject({ login: student.login });
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
    expect(body.user).not.toHaveProperty('passwordHash');

    const cookies = setCookieHeaders(response);
    expect(
      cookies.find((cookie) => cookie.startsWith('campus_access_token=')),
    ).toMatch(/Path=\/api;.*HttpOnly;.*SameSite=Strict/i);
    expect(
      cookies.find((cookie) => cookie.startsWith('campus_refresh_token=')),
    ).toMatch(/Path=\/api\/auth;.*HttpOnly;.*SameSite=Strict/i);
    expect(
      cookies.find((cookie) => cookie.startsWith('campus_csrf_binding=')),
    ).toMatch(/HttpOnly/i);
    expect(
      cookies.find((cookie) => cookie.startsWith('campus_csrf_token=')),
    ).not.toMatch(/HttpOnly/i);

    await request(app.getHttpServer())
      .get('/api/auth/profile')
      .set('Cookie', cookieHeader(response))
      .expect(200)
      .expect((profileResponse) => {
        const profile = responseBody<{ login: string }>(profileResponse);
        expect(profile.login).toBe(student.login);
      });
  });

  it('rotates refresh tokens and rejects reuse of the previous token', async () => {
    const student = await createUser(Role.STUDENT, 'rotation');
    const session = await login(student).expect(201);
    const oldCookies = cookieHeader(session);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', oldCookies)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', oldCookies)
      .send({})
      .expect(401);
  });

  it('enforces CSRF and administrator-only user management', async () => {
    const admin = await createUser(Role.ADMIN, 'admin');
    const session = await login(admin).expect(201);
    const cookies = cookieHeader(session);
    const csrfToken = cookieValue(session, 'campus_csrf_token');
    const payload = {
      login: 'teacher_created',
      password: 'TeacherPass1',
      role: Role.TEACHER,
      email: 'teacher.created@example.test',
      firstName: 'Created',
      lastName: 'Teacher',
    };

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookies)
      .send(payload)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/users')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send(payload)
      .expect(201);

    const created = await users().findOne({ login: payload.login });
    expect(created).toBeTruthy();

    const rector = await createUser(Role.RECTOR, 'rector-read-only');
    const rectorSession = await login(rector).expect(201);
    const rectorCookies = cookieHeader(rectorSession);
    const rectorCsrfToken = cookieValue(rectorSession, 'campus_csrf_token');

    await request(app.getHttpServer())
      .patch(`/api/users/${created?._id.toString()}`)
      .set('Cookie', rectorCookies)
      .set('X-CSRF-Token', rectorCsrfToken)
      .send({ firstName: 'Forbidden change' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/users/${created?._id.toString()}/block`)
      .set('Cookie', rectorCookies)
      .set('X-CSRF-Token', rectorCsrfToken)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/users/${created?._id.toString()}/block`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrfToken)
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: payload.login, password: payload.password })
      .expect(403);
  });

  it('returns the same generic error for unknown users and wrong passwords', async () => {
    const student = await createUser(Role.STUDENT, 'generic-error');
    const unknown = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: 'does-not-exist', password: TEST_PASSWORD })
      .expect(401);
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ login: student.login, password: 'WrongPass1' })
      .expect(401);

    expect(responseBody<{ message: string }>(unknown).message).toBe(
      responseBody<{ message: string }>(wrongPassword).message,
    );
  });
});
