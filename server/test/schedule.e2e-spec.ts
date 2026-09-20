import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { useContainer } from 'class-validator';
import { Connection, Types } from 'mongoose';
import type { Response as SuperAgentResponse } from 'superagent';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { Role } from '../src/common/types/roles.enum';
import { MAUP_SCHEDULE_CONTRACT_FIXTURE } from '../src/integrations/maup-student-api/fixtures/maup-schedule.contract-fixture';
import { MAUP_API_FETCH } from '../src/integrations/maup-student-api/maup-student-api.client';
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const TEST_JWT_SECRET = 'schedule-e2e-jwt-secret-with-sufficient-entropy';
const TEST_CSRF_SECRET = 'schedule-e2e-csrf-secret-with-sufficient-entropy';
const API = '/api';

type Actor = {
  id: Types.ObjectId;
  login: string;
  token: string;
};

type ScheduleFixture = {
  admin: Actor;
  teacher: Actor;
  otherTeacher: Actor;
  student1: Actor;
  student2: Actor;
  dean: Actor;
  departmentHead: Actor;
};

function studentProfileFields(input: {
  group: Types.ObjectId;
  recordBookNumber: string;
  year: number;
  externalStudentId: string;
}) {
  const _id = new Types.ObjectId();
  return {
    studentProfiles: [
      {
        _id,
        externalStudentId: input.externalStudentId,
        group: input.group,
        recordBookNumber: input.recordBookNumber,
        year: input.year,
        status: 'active',
        syncedAt: new Date(),
      },
    ],
    activeStudentProfileId: _id,
  };
}

type ScheduleEntryLike = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  courseTitle: string;
  subjectKey: string;
  type: string;
  controlType?: string;
  teacherName?: string;
  classroom?: string;
  onlineFormat: boolean;
  onlineUrl?: string;
  groupCode: string;
};

type ScheduleResponse = {
  entries: ScheduleEntryLike[];
  meta: {
    term?: { id: string; academicYear: string; termNumber: number };
    fetchedAt?: string;
    stale: boolean;
    reason?: string;
  };
};

function responseBody<T>(response: SuperAgentResponse): T {
  const body: unknown = response.body;
  return body as T;
}

type WirePeriod = Record<string, unknown>;
const deepCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * A copy of the lesson fixture with period and pair dates shifted into the future.
 *
 * Fix round 1 (Critical): `MAUP_SCHEDULE_CONTRACT_FIXTURE[0]`'s items have no `day_date` — they
 * are recurring (`day_of_week_raw`). Previously the mutated pair (items[0], Понеділок, "Всі тижні")
 * stayed recurring and was expanded by maup-schedule.mapper.ts::expandRecurringDates into 4 dates in
 * the 2099-01-01..31 range (05/12/19/26): the classroom change affected all 4, the diff saw 4 changed out of
 * 6 future records (4 + 2 unchanged Wednesdays from items[1]) = 66.7% > 30% bulkThreshold →
 * ScheduleChangeNotifierService aggregated the notification (`actionUrl: '/schedule'`) instead of emitting
 * a per-record `actionUrl: '/schedule?date=…'`, as the test expected.
 * Fix: force-set `day_date` on items[0] (mapItem takes `exactDate` instead of
 * expandRecurringDates when `day_date` is valid — one date instead of four). items[1]
 * stays recurring (2 Wednesdays) as unchanged "noise": 1 changed out of 3 future = 33%, but
 * the aggregation guard — `items.length > 1 && …` — doesn't trigger when items.length === 1.
 */
function futureLessons(classroom = '101'): WirePeriod[] {
  const period = deepCopy(
    MAUP_SCHEDULE_CONTRACT_FIXTURE[0],
  ) as unknown as WirePeriod;
  period.from_date = '2099-01-01';
  period.to_date = '2099-01-31';
  const items = period.schedule as Array<Record<string, unknown>>;
  items[0].day_date = '2099-01-12';
  items[0].pair_auditorium = classroom;
  return [period];
}

// interception of the MAUP API
const apiCalls: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
let apiResponse: unknown = MAUP_SCHEDULE_CONTRACT_FIXTURE;
let apiFails = false;

// The client always calls fetchImpl(url, init) with a real URL (executeRequest in
// maup-student-api.client.ts), so the mock is typed narrower than `typeof fetch` —
// that's enough for the DI substitution via .useValue (Nest doesn't check the value's type).
const fetchMock = (input: URL, init?: RequestInit): Promise<Response> => {
  const url = input.href;
  const endpoint = url.split('/').pop() ?? '';
  const rawBody = typeof init?.body === 'string' ? init.body : undefined;
  apiCalls.push({
    endpoint,
    body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {},
  });
  if (apiFails) {
    return Promise.resolve(new Response('upstream down', { status: 503 }));
  }
  const body = endpoint === 'schedule' ? apiResponse : [];
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
};

describe('Schedule (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;

  const collection = (modelName: string) =>
    connection.model(modelName).collection;
  const http = () => request(app.getHttpServer());

  const authGet = (token: string, path: string) =>
    http().get(`${API}${path}`).auth(token, { type: 'bearer' });
  const authPut = (
    token: string,
    path: string,
    body: Record<string, unknown>,
  ) => http().put(`${API}${path}`).auth(token, { type: 'bearer' }).send(body);
  const authPost = (
    token: string,
    path: string,
    body: Record<string, unknown> = {},
  ) => http().post(`${API}${path}`).auth(token, { type: 'bearer' }).send(body);

  beforeAll(async () => {
    container = await new GenericContainer('mongo:7.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .start();

    const mongoUri = `mongodb://${container.getHost()}:${container.getMappedPort(
      27017,
    )}/schedule-e2e`;
    const testConfig = new ConfigService({
      MONGODB_URI: mongoUri,
      JWT_SECRET: TEST_JWT_SECRET,
      AUTH_CSRF_SECRET: TEST_CSRF_SECRET,
      AUDIT_TRANSACTIONAL_OUTBOX: 'false',
      DB_MIGRATIONS_ENABLED: 'false',
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173',
      MAUP_API_ENABLED: 'true',
      MAUP_API_BASE_URL: 'https://maup.test/api',
      MAUP_API_ALLOWED_HOST: 'maup.test',
      MAUP_API_USERNAME: 'u',
      MAUP_API_PASSWORD: 'p',
      SCHEDULE_CACHE_TTL_MS: '900000',
      SCHEDULE_DIFF_BULK_THRESHOLD: '20',
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

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.useLogger(['error']);
    useContainer(app.select(AppModule), { fallbackOnErrors: true });
    configureApp(app, { swaggerEnabled: false });
    await app.init();

    connection = app.get(getConnectionToken());
    jwtService = app.get(JwtService);
    await connection.syncIndexes();
  }, SETUP_TIMEOUT);

  beforeEach(async () => {
    await Promise.all(
      Object.values(connection.collections).map((c) => c.deleteMany({})),
    );
    apiCalls.length = 0;
    apiFails = false;
    apiResponse = MAUP_SCHEDULE_CONTRACT_FIXTURE;
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  // Audit entries are written through a transactional outbox (AuditOutboxProcessor), which flushes on
  // a separate timer (AUDIT_OUTBOX_POLL_INTERVAL_MS, default 500ms) — not synchronously
  // with the request response. A direct findOne right after PUT is a race; follow the consistent
  // pattern from electives.e2e-spec.ts.
  async function waitForAuditEntry(
    action: string,
  ): Promise<Record<string, unknown> | null> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const entry = await collection('AuditLog').findOne({ action });
      if (entry) return entry;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return null;
  }

  const createActor = async (
    role: Role,
    suffix: string,
    profile?: Record<string, unknown>,
  ): Promise<Actor> => {
    const id = new Types.ObjectId();
    const login = `${role}_${suffix}`;
    await collection('User').insertOne({
      _id: id,
      login,
      passwordHash: 'not-used-in-token-e2e',
      role,
      email: `${login}@example.test`,
      firstName: role,
      lastName: suffix,
      status: 'active',
      ...profile,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return {
      id,
      login,
      token: jwtService.sign({ sub: id.toHexString(), login, role }),
    };
  };

  const seedFixture = async ({
    withTerm = true,
  }: { withTerm?: boolean } = {}): Promise<ScheduleFixture> => {
    const specialtyId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    const group12Id = new Types.ObjectId();
    const departmentId = new Types.ObjectId();
    const courseId = new Types.ObjectId();
    const termId = new Types.ObjectId();

    const admin = await createActor(Role.ADMIN, 'admin');
    const dean = await createActor(Role.DEAN, 'dean');
    const departmentHead = await createActor(Role.DEPARTMENT_HEAD, 'depthead');
    const teacher = await createActor(Role.TEACHER, 'teacher', {
      teacherProfile: {
        department: departmentId,
        externalTeacherId: '701',
        position: 'Викладач',
      },
    });
    const otherTeacher = await createActor(Role.TEACHER, 'otherteacher', {
      teacherProfile: {
        department: departmentId,
        externalTeacherId: '999',
        position: 'Викладач',
      },
    });
    const student1 = await createActor(Role.STUDENT, 'student1', {
      ...studentProfileFields({
        group: groupId,
        recordBookNumber: 'SCH-001',
        year: 1,
        externalStudentId: 'student-001',
      }),
    });
    const student2 = await createActor(Role.STUDENT, 'student2', {
      ...studentProfileFields({
        group: groupId,
        recordBookNumber: 'SCH-002',
        year: 1,
        externalStudentId: 'student-002',
      }),
    });

    await Promise.all([
      collection('Specialty').insertOne({
        _id: specialtyId,
        code: '121',
        name: 'Computer Science',
      }),
      collection('Group').insertMany([
        { _id: groupId, code: 'КН-11', specialty: specialtyId, course: 1 },
        { _id: group12Id, code: 'КН-12', specialty: specialtyId, course: 1 },
      ]),
      collection('Course').insertOne({
        _id: courseId,
        name: 'Основи програмування',
        code: 'SCH-101',
        externalSubjectId: '1001',
        department: departmentId,
        credits: 4,
      }),
    ]);

    if (withTerm) {
      await collection('AcademicTerm').insertOne({
        _id: termId,
        academicYear: '2026/2027',
        termNumber: 1,
        status: 'current',
        maupAcademicYear: 2026,
        maupSemester: 1,
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2027-01-31'),
      });
      await collection('CourseAssignment').insertOne({
        _id: new Types.ObjectId(),
        course: courseId,
        group: groupId,
        teacher: teacher.id,
        term: termId,
        source: 'standard',
        enrolledStudents: [],
      });
    }

    return {
      admin,
      teacher,
      otherTeacher,
      student1,
      student2,
      dean,
      departmentHead,
    };
  };

  describe('GET /api/schedule/my', () => {
    it('calls the API once per group under concurrent requests and passes term params', async () => {
      const f = await seedFixture();
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          authGet(
            i % 2 ? f.student1.token : f.student2.token,
            '/schedule/my?from=2026-09-01&to=2026-09-30',
          ),
        ),
      );
      responses.forEach((r) => expect(r.status).toBe(200));
      const scheduleCalls = apiCalls.filter((c) => c.endpoint === 'schedule');
      expect(scheduleCalls).toHaveLength(1);
      expect(scheduleCalls[0].body).toMatchObject({
        semestr: 1,
        year_navch: 2026,
        zes_schedule: 0,
      });
      expect(scheduleCalls[0].body.year).toBeNull();
      expect(
        responseBody<ScheduleResponse>(responses[0]).entries.length,
      ).toBeGreaterThan(0);
    });

    it('returns no_current_term without API calls', async () => {
      const f = await seedFixture({ withTerm: false });
      const r = await authGet(f.student1.token, '/schedule/my');
      expect(r.status).toBe(200);
      expect(responseBody<ScheduleResponse>(r)).toEqual({
        entries: [],
        meta: { stale: false, reason: 'no_current_term' },
      });
      expect(apiCalls).toHaveLength(0);
    });

    it('rejects the removed date parameter with 400 (forbidNonWhitelisted)', async () => {
      const f = await seedFixture();
      expect(
        (await authGet(f.student1.token, '/schedule/my?date=2026-09-21'))
          .status,
      ).toBe(400);
    });

    // Fix round 1: MAX_RANGE_DAYS = 62 in schedule-reader.service.ts::resolveRange — `days > 62`
    // throws 400, so exactly 62 days (2026-09-01..2026-11-02) are valid, but 63 (…-11-03) is not.
    it('rejects a range exceeding 62 days with 400, and accepts exactly 62 days', async () => {
      const f = await seedFixture();
      expect(
        (
          await authGet(
            f.student1.token,
            '/schedule/my?from=2026-09-01&to=2026-11-03',
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await authGet(
            f.student1.token,
            '/schedule/my?from=2026-09-01&to=2026-11-02',
          )
        ).status,
      ).toBe(200);
    });

    it('serves stale cache when API fails, and no_snapshot when nothing cached', async () => {
      const f = await seedFixture();
      apiFails = true;
      const first = await authGet(
        f.student1.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      expect(responseBody<ScheduleResponse>(first).meta).toMatchObject({
        stale: true,
        reason: 'no_snapshot',
      });
      apiFails = false;
      await authGet(
        f.student1.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      await collection('ScheduleSnapshot').updateMany(
        {},
        { $set: { fetchedAt: new Date(0) } },
      );
      apiFails = true;
      const third = await authGet(
        f.student1.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      expect(responseBody<ScheduleResponse>(third).meta.stale).toBe(true);
      expect(
        responseBody<ScheduleResponse>(third).entries.length,
      ).toBeGreaterThan(0);
    });

    it('shows teacher only entries with their externalTeacherId across snapshots', async () => {
      const f = await seedFixture();
      await authGet(
        f.student1.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      const r = await authGet(
        f.teacher.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      const entries = responseBody<ScheduleResponse>(r).entries;
      expect(entries.length).toBeGreaterThan(0);
      expect(
        entries.every((e) => e.courseTitle === 'Основи програмування'),
      ).toBe(true);
    });

    it('reports no_external_teacher_id for a teacher without the MAUP id', async () => {
      const f = await seedFixture();
      await collection('User').updateOne(
        { _id: f.otherTeacher.id },
        { $unset: { 'teacherProfile.externalTeacherId': '' } },
      );
      const r = await authGet(f.otherTeacher.token, '/schedule/my');
      expect(responseBody<ScheduleResponse>(r).meta.reason).toBe(
        'no_external_teacher_id',
      );
    });
  });

  describe('GET /api/schedule/today', () => {
    it('returns {date, lessons, session, meta} with the Kyiv date', async () => {
      const f = await seedFixture();
      const r = await authGet(f.student1.token, '/schedule/today');
      expect(r.status).toBe(200);
      const body = responseBody<{
        date: string;
        lessons: unknown[];
        session: unknown[];
        meta: { stale: boolean };
      }>(r);
      expect(Object.keys(body).sort()).toEqual([
        'date',
        'lessons',
        'meta',
        'session',
      ]);
      expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(body.lessons)).toBe(true);
      expect(Array.isArray(body.session)).toBe(true);
    });
  });

  describe('GET /api/schedule/session/my', () => {
    it('passes zes_schedule=1 and maps control type', async () => {
      const f = await seedFixture();
      apiResponse = [MAUP_SCHEDULE_CONTRACT_FIXTURE[1]];
      const r = await authGet(
        f.student1.token,
        '/schedule/session/my?from=2027-01-01&to=2027-01-31',
      );
      expect(
        apiCalls.find((c) => c.endpoint === 'schedule')?.body,
      ).toMatchObject({ zes_schedule: 1 });
      expect(responseBody<ScheduleResponse>(r).entries[0]).toMatchObject({
        controlType: 'exam',
        type: 'exam',
      });
    });
  });

  describe('schedule change notifications', () => {
    it('notifies each active student once when a classroom changes', async () => {
      const f = await seedFixture();
      apiResponse = futureLessons(); // first snapshot — 2099 dates, no notifications
      await authGet(
        f.student1.token,
        '/schedule/my?from=2099-01-01&to=2099-01-31',
      );
      expect(
        await collection('Notification').countDocuments({
          type: 'schedule_change',
        }),
      ).toBe(0);

      await collection('ScheduleSnapshot').updateMany(
        {},
        { $set: { fetchedAt: new Date(Date.now() - 3_600_000) } },
      );
      apiResponse = futureLessons('999'); // second — same pair, different classroom
      await authGet(
        f.student1.token,
        '/schedule/my?from=2099-01-01&to=2099-01-31',
      );

      const notes = await collection('Notification')
        .find({ type: 'schedule_change' })
        .toArray();
      expect(
        notes.filter((n) => String(n.userId) === f.student1.id.toHexString()),
      ).toHaveLength(1);
      expect(
        notes.filter((n) => String(n.userId) === f.student2.id.toHexString()),
      ).toHaveLength(1);
      expect(String(notes[0].actionUrl)).toMatch(/^\/schedule\?date=/);
    });

    it('announces the first exam session snapshot', async () => {
      const f = await seedFixture();
      apiResponse = [MAUP_SCHEDULE_CONTRACT_FIXTURE[1]];
      await authGet(
        f.student1.token,
        '/schedule/session/my?from=2027-01-01&to=2027-01-31',
      );
      const notes = await collection('Notification')
        .find({ type: 'schedule_change' })
        .toArray();
      expect(notes).toHaveLength(2); // one for each active student in the group
      expect(String(notes[0].actionUrl)).toBe('/schedule/session');
    });
  });

  describe('online links', () => {
    const body = {
      groupCode: 'КН-11',
      subjectKey: '1001',
      url: 'https://meet.google.com/abc',
    };

    it('rejects a teacher without assignment or snapshot match', async () => {
      const f = await seedFixture();
      expect(
        (await authPut(f.otherTeacher.token, '/schedule/online-links', body))
          .status,
      ).toBe(403);
    });

    it.each([['admin'], ['departmentHead']] as const)(
      'rejects role %s at @Roles level',
      async (actor) => {
        const f = await seedFixture();
        expect(
          (await authPut(f[actor].token, '/schedule/online-links', body))
            .status,
        ).toBe(403);
      },
    );

    it('accepts a teacher with an assignment and exposes the link to students', async () => {
      const f = await seedFixture();
      expect(
        (await authPut(f.teacher.token, '/schedule/online-links', body)).status,
      ).toBe(200);
      const r = await authGet(
        f.student1.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      const withLink = responseBody<ScheduleResponse>(r).entries.filter(
        (e) => e.subjectKey === '1001',
      );
      expect(withLink.length).toBeGreaterThan(0);
      expect(withLink.every((e) => e.onlineUrl === body.url)).toBe(true);
    });

    it.each([
      ['http://x.y'],
      ['https://user:pass@meet.google.com/abc'],
      ['https://192.168.0.10/room'],
    ])('rejects unsafe url %s with 400', async (url) => {
      const f = await seedFixture();
      expect(
        (
          await authPut(f.teacher.token, '/schedule/online-links', {
            ...body,
            url,
          })
        ).status,
      ).toBe(400);
    });

    it('writes audit without the full url', async () => {
      const f = await seedFixture();
      await authPut(f.teacher.token, '/schedule/online-links', body);
      const entry = await waitForAuditEntry('schedule.online_link.set');
      expect(entry?.details).toMatchObject({
        groupCode: 'КН-11',
        subjectKey: '1001',
        urlHost: 'meet.google.com',
      });
      expect(JSON.stringify(entry?.details)).not.toContain('/abc');
    });

    it('pair link overrides subject link', async () => {
      const f = await seedFixture();
      await authPut(f.teacher.token, '/schedule/online-links', body);
      await authPut(f.teacher.token, '/schedule/online-links', {
        ...body,
        date: '2026-09-07',
        startTime: '08:30',
        url: 'https://pair.example',
      });
      const r = await authGet(
        f.student1.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      const entries = responseBody<ScheduleResponse>(r).entries.filter(
        (e) => e.subjectKey === '1001',
      );
      expect(entries.find((e) => e.date === '2026-09-07')?.onlineUrl).toBe(
        'https://pair.example',
      );
      expect(entries.find((e) => e.date === '2026-09-14')?.onlineUrl).toBe(
        body.url,
      );
    });
  });

  describe('GET /api/schedule/groups/:groupCode', () => {
    it('returns only whitelisted keys for admin and 404 for an unknown group', async () => {
      const f = await seedFixture();
      await authGet(
        f.student1.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      const r = await authGet(
        f.admin.token,
        '/schedule/groups/КН-11?from=2026-09-01&to=2026-09-30',
      );
      expect(r.status).toBe(200);
      const body = responseBody<Record<string, unknown>>(r);
      expect(Object.keys(body).sort()).toEqual(
        [
          'entries',
          'fetchedAt',
          'groupCode',
          'isExamSession',
          'periodFrom',
          'periodTo',
          'stale',
        ].sort(),
      );
      const raw = JSON.stringify(body);
      for (const forbidden of [
        'fetchedByUserId',
        'rawHash',
        'teacherExternalId',
        'classroomExternalId',
        'externalStudentId',
        'sourceStudentId',
        'subjectId',
      ]) {
        expect(raw).not.toContain(forbidden);
      }
      expect(
        (await authGet(f.admin.token, '/schedule/groups/НЕМА-1')).status,
      ).toBe(404);
    });

    it('403 for a dean outside the group scope and for a student', async () => {
      const f = await seedFixture();
      expect(
        (await authGet(f.dean.token, '/schedule/groups/КН-11')).status,
      ).toBe(403);
      expect(
        (await authGet(f.student1.token, '/schedule/groups/КН-11')).status,
      ).toBe(403);
    });
  });

  describe('POST /api/schedule/refresh', () => {
    it('fills snapshots for every group and reports groups without source students', async () => {
      const f = await seedFixture();
      const r = await authPost(f.admin.token, '/schedule/refresh');
      expect(r.status).toBe(201);
      const { groups } = responseBody<{
        groups: Array<{ groupCode: string; status: string; reason?: string }>;
      }>(r);
      expect(groups).toEqual(
        expect.arrayContaining([
          { groupCode: 'КН-11', status: 'updated' },
          {
            groupCode: 'КН-12',
            status: 'skipped',
            reason: 'no_source_student',
          },
        ]),
      );
      // Criterion §10.14: after the cache is populated, the teacher sees their own lessons without needing any students.
      const teacherView = await authGet(
        f.teacher.token,
        '/schedule/my?from=2026-09-01&to=2026-09-30',
      );
      expect(
        responseBody<ScheduleResponse>(teacherView).entries.length,
      ).toBeGreaterThan(0);
    });

    it('403 for non-admin', async () => {
      const f = await seedFixture();
      expect(
        (await authPost(f.teacher.token, '/schedule/refresh')).status,
      ).toBe(403);
    });
  });

  describe('removed editor endpoints', () => {
    it.each([
      ['post', '/schedule'],
      ['put', '/schedule/abc'],
      ['delete', '/schedule/abc'],
      ['post', '/schedule/bulk'],
      ['post', '/schedule/bulk/cancel'],
      ['get', '/schedule/templates'],
      ['post', '/schedule/abc/cancel'],
      ['post', '/schedule/abc/reschedule'],
      ['post', '/schedule/abc/substitution'],
      ['get', '/schedule'],
      ['get', '/schedule/abc'],
    ] as const)('%s %s → 404', async (method, path) => {
      const f = await seedFixture();
      const r = await http()
        [method](`${API}${path}`)
        .auth(f.admin.token, { type: 'bearer' })
        .send({});
      expect(r.status).toBe(404);
    });
  });
});
