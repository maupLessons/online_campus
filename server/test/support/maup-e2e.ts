import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.config';
import { Role } from '../../src/common/types/roles.enum';
import { MAUP_API_FETCH } from '../../src/integrations/maup-student-api/maup-student-api.client';
import { MaupReferenceCacheService } from '../../src/integrations/maup-student-api/maup-reference-cache.service';
import { SeedService } from '../../src/seed-data/seed.service';

export const MAUP_E2E_SETUP_TIMEOUT = 120_000;

export type MaupE2eActor = { id: Types.ObjectId; token: string };
export type MaupE2eStudent = MaupE2eActor & { profileId: Types.ObjectId };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function startMongoContainer(): Promise<StartedTestContainer> {
  return new GenericContainer('mongo:7.0')
    .withExposedPorts(27017)
    .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
    .start();
}

export type MaupE2eHarness = {
  app: NestExpressApplication;
  connection: Connection;
  fetchMock: jest.Mock;
  collection(name: string): ReturnType<Connection['model']>['collection'];
  createActor(
    role: Role,
    suffix: string,
    extra?: Record<string, unknown>,
  ): Promise<MaupE2eActor>;
  createStudent(externalStudentId?: string): Promise<MaupE2eStudent>;
  resetData(): Promise<void>;
  close(): Promise<void>;
};

/**
 * Піднімає AppModule поверх уже запущеного контейнера Mongo.
 * `env` перекриває дефолти — саме так вмикається `MAUP_API_ENABLED: 'false'`.
 * Метод запитів MAUP лишається дефолтним (POST), тому в моках `fetch`
 * query-параметрів у URL немає і перевірки `href.endsWith('/marks')` коректні.
 */
export async function bootstrapMaupE2e(options: {
  container: StartedTestContainer;
  database: string;
  env?: Record<string, string>;
}): Promise<MaupE2eHarness> {
  const { container, database, env = {} } = options;
  const fetchMock = jest.fn();

  const testConfig = new ConfigService({
    MONGODB_URI: `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/${database}`,
    JWT_SECRET: 'maup-e2e-secret-with-sufficient-entropy',
    AUTH_CSRF_SECRET: 'maup-e2e-csrf-secret-with-sufficient-entropy',
    NODE_ENV: 'test',
    CLIENT_URL: 'http://localhost:5173',
    MAUP_API_ENABLED: 'true',
    MAUP_API_BASE_URL: 'https://api.maup.test/api',
    MAUP_API_ALLOWED_HOST: 'api.maup.test',
    MAUP_API_USERNAME: 'campus',
    MAUP_API_PASSWORD: 'secret',
    MAUP_API_RETRY_ATTEMPTS: '0',
    EXTERNAL_CACHE_TTL_SECONDS: '900',
    EXTERNAL_CACHE_STALE_SECONDS: '86400',
    ...env,
  });

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(SeedService)
    .useValue({ onModuleInit: jest.fn() })
    .overrideProvider(ConfigService)
    .useValue(testConfig)
    .overrideProvider(MAUP_API_FETCH)
    .useValue(fetchMock)
    .compile();

  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  app.useLogger(['error']);
  configureApp(app, { swaggerEnabled: false });
  await app.init();

  const connection = app.get<Connection>(getConnectionToken());
  const jwtService = app.get(JwtService);
  const referenceCache = app.get(MaupReferenceCacheService);
  await connection.syncIndexes();

  const collection = (name: string) => connection.model(name).collection;

  const createActor = async (
    role: Role,
    suffix: string,
    extra: Record<string, unknown> = {},
  ): Promise<MaupE2eActor> => {
    const id = new Types.ObjectId();
    await collection('User').insertOne({
      _id: id,
      login: `${role}_${suffix}`,
      passwordHash: 'not-used',
      role,
      email: `${role}_${suffix}@example.test`,
      firstName: role,
      lastName: suffix,
      status: 'active',
      ...extra,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const activeStudentProfileId = (
      extra.activeStudentProfileId as Types.ObjectId | undefined
    )?.toHexString();
    return {
      id,
      token: jwtService.sign({
        sub: id.toHexString(),
        login: `${role}_${suffix}`,
        role,
        ...(activeStudentProfileId ? { activeStudentProfileId } : {}),
      }),
    };
  };

  const createStudent = async (
    externalStudentId = '1001',
  ): Promise<MaupE2eStudent> => {
    const profileId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    await collection('Group').insertOne({
      _id: groupId,
      code: `G-${groupId.toHexString().slice(-6)}`,
      specialty: new Types.ObjectId(),
      course: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const actor = await createActor(Role.STUDENT, 'student', {
      studentProfiles: [
        {
          _id: profileId,
          externalStudentId,
          group: groupId,
          recordBookNumber: `RB-${profileId.toHexString().slice(-6)}`,
          year: 1,
          status: 'active',
          syncedAt: new Date(),
        },
      ],
      activeStudentProfileId: profileId,
    });
    return { ...actor, profileId };
  };

  return {
    app,
    connection,
    fetchMock,
    collection,
    createActor,
    createStudent,
    resetData: async () => {
      fetchMock.mockReset();
      // Довідники (marktypes/testtypes/paytype/...) кешуються в пам'яті
      // процесу на 24 год (MaupReferenceCacheService); без явного скидання
      // між тестами перший тест "заморожує" мок-відповідь для решти файлу,
      // включно з finance e2e, що піднімається на цьому ж bootstrap-і.
      referenceCache.clear();
      await Promise.all(
        Object.values(connection.collections).map((item) =>
          item.deleteMany({}),
        ),
      );
    },
    close: async () => {
      await app.close();
    },
  };
}

/**
 * `AuditLogService.logAction` записує в transactional outbox
 * (`AuditOutbox`); `AuditOutboxProcessor` перекладає записи в `AuditLog`
 * фоново, тому e2e-читання audit-рядків має короткий retry — той самий
 * патерн, що й `findAuditRows` у `academic-terms.e2e-spec.ts`.
 */
export async function findAuditRows(
  harness: Pick<MaupE2eHarness, 'collection'>,
  filter: Record<string, unknown>,
  attempts = 40,
): Promise<Record<string, unknown>[]> {
  const auditCollection = harness.collection('AuditLog');
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await auditCollection.find(filter).toArray();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return [];
}
