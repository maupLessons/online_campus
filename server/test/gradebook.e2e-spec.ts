import { StartedTestContainer } from 'testcontainers';
import * as request from 'supertest';
import { Types } from 'mongoose';
import { Role } from '../src/common/types/roles.enum';
import { MAUP_MARKS_FIXTURE } from '../src/gradebook/fixtures/maup-marks.contract-fixture';
import {
  bootstrapMaupE2e,
  findAuditRows,
  jsonResponse,
  MAUP_E2E_SETUP_TIMEOUT,
  MaupE2eHarness,
  startMongoContainer,
} from './support/maup-e2e';

type GradebookEntryBody = {
  subject: string;
  teacher?: string;
  controlType: string;
  score?: number;
  ects?: string;
  date?: string;
  status: string;
};
type GradebookSemesterBody = {
  academicYear: string;
  semester: number;
  isCurrent: boolean;
  entries: GradebookEntryBody[];
};
type GradebookMetaBody = {
  profileId: string | null;
  fetchedAt: string | null;
  stale: boolean;
  reason?: string;
};
type GradebookBody = {
  semesters: GradebookSemesterBody[];
  meta: GradebookMetaBody;
};
type ErrorBody = { code?: string };
type IndexDescriptor = {
  key: Record<string, number>;
  name?: string;
  expireAfterSeconds?: number;
};

function asGradebook(response: request.Response): GradebookBody {
  return response.body as GradebookBody;
}

function asError(response: request.Response): ErrorBody {
  return response.body as ErrorBody;
}

describe('Gradebook (e2e)', () => {
  let container: StartedTestContainer;
  let harness: MaupE2eHarness;

  const collection = (name: string) => harness.collection(name);
  const createActor = (...args: Parameters<MaupE2eHarness['createActor']>) =>
    harness.createActor(...args);
  const createStudent = (externalStudentId?: string) =>
    harness.createStudent(externalStudentId);
  const server = () => harness.app.getHttpServer();

  beforeAll(async () => {
    container = await startMongoContainer();
    harness = await bootstrapMaupE2e({ container, database: 'gradebook-e2e' });
  }, MAUP_E2E_SETUP_TIMEOUT);

  // За замовчуванням кожен тест бачить активний AcademicTerm, що збігається з
  // семестром 2025/2026:2 у фікстурі — так головні сценарії перевіряють і
  // isCurrent, і відсутність meta.reason. Сценарій "немає поточного періоду"
  // видаляє цей документ окремо (спека 04 §5 п.7).
  const seedCurrentTerm = () =>
    collection('AcademicTerm').insertOne({
      _id: new Types.ObjectId(),
      academicYear: '2025/2026',
      termNumber: 2,
      startsAt: new Date('2026-02-01T00:00:00.000Z'),
      endsAt: new Date('2026-06-30T00:00:00.000Z'),
      status: 'current',
      maupAcademicYear: 2025,
      maupSemester: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  beforeEach(async () => {
    await harness.resetData();
    await seedCurrentTerm();
  });

  afterAll(async () => {
    await harness?.close();
    await container?.stop();
  });

  // Реальні імена полів довідників (MAUP_REFERENCE_FIELDS у
  // MaupReferenceCacheService, документація api.maup.com.ua): не спільні
  // `id`/`name`, а `marktype_id`/`marktype` і `testtype_id`/`title`.
  const referenceResponse = (endpoint: string) => {
    if (endpoint.endsWith('/marktypes')) {
      return jsonResponse([
        { marktype_id: 1, marktype: 'Відмітка про залік' },
        { marktype_id: 3, marktype: 'Бали' },
      ]);
    }
    if (endpoint.endsWith('/testtypes')) {
      return jsonResponse([
        { testtype_id: 1, title: 'Екзамен' },
        { testtype_id: 2, title: 'Залік' },
      ]);
    }
    return null;
  };

  const mockMaup = (marks: unknown = MAUP_MARKS_FIXTURE) => {
    harness.fetchMock.mockImplementation((url: URL | string) => {
      const href = String(url);
      const reference = referenceResponse(href);
      if (reference) return Promise.resolve(reference);
      if (href.endsWith('/marks')) return Promise.resolve(jsonResponse(marks));
      return Promise.resolve(jsonResponse([], 404));
    });
  };

  it('returns semesters newest first with statuses, retake dedup and control-type fallback', async () => {
    const student = await createStudent();
    mockMaup();

    const response = await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const body = asGradebook(response);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(body.meta.profileId).toBe(student.profileId.toHexString());
    expect(body.meta.stale).toBe(false);
    expect(body.meta.reason).toBeUndefined();
    expect(
      body.semesters.map((s) => `${s.academicYear}:${s.semester}`),
    ).toEqual(['2026/2027:3', '2025/2026:2', '2025/2026:1']);
    expect(body.semesters.map((s) => s.isCurrent)).toEqual([
      false,
      true,
      false,
    ]);

    const oldest = body.semesters[2].entries;
    expect(oldest).toHaveLength(3);
    expect(oldest[0]).toMatchObject({
      subject: 'Вища математика',
      score: 85,
      status: 'graded',
    });
    expect(oldest[1]).toMatchObject({
      subject: 'Філософія',
      score: 55,
      status: 'graded',
    });
    // Перескладання (subject_id 103): лишається запис з max mark_act_date (65), не первинні 40.
    expect(oldest[2]).toMatchObject({
      subject: 'Економіка',
      score: 65,
      status: 'graded',
    });

    const middle = body.semesters[1].entries;
    expect(middle).toHaveLength(2);
    // testtype відсутній у фікстурі — резолюція через testtype_id + довідник testtypes.
    expect(middle[0]).toMatchObject({
      subject: 'Історія України',
      status: 'absent',
      controlType: 'Екзамен',
    });
    expect(middle[0].score).toBeUndefined();
    // GRADE-003 (рев'ю фінального батчу): залік «зараховано» (шкала
    // «Відмітка про залік») приходить статусом 'graded' і БЕЗ поля score —
    // це не 0 балів, а складений результат без числового балу.
    expect(middle[1]).toMatchObject({
      subject: 'Бази даних',
      status: 'graded',
      controlType: 'залік',
    });
    expect(middle[1].score).toBeUndefined();

    const newest = body.semesters[0].entries;
    expect(newest).toHaveLength(2);
    expect(newest[0]).toMatchObject({
      subject: 'Програмування',
      status: 'pending',
    });
    expect(newest[0].score).toBeUndefined();
    expect(newest[1]).toMatchObject({
      subject: 'Архітектура програмного забезпечення',
      status: 'not_admitted',
    });
  });

  it('calls MAUP marks once for two consecutive requests', async () => {
    const student = await createStudent();
    mockMaup();

    await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);
    await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const markCalls = harness.fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith('/marks'),
    );
    expect(markCalls).toHaveLength(1);
  });

  // Критерій §10 п.10: у кеші лежить лише нормалізований DTO §4.1.
  it('stores only DTO keys in the cached payload', async () => {
    const student = await createStudent();
    mockMaup();

    await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const [row] = await collection('ExternalDataCache').find({}).toArray();
    expect(Object.keys(row).sort()).toEqual([
      '_id',
      'fetchedAt',
      'freshUntil',
      'kind',
      'payload',
      'purgeAt',
      'studentProfileId',
      'userId',
    ]);
    const semesterKeys = new Set<string>();
    const entryKeys = new Set<string>();
    for (const semester of row.payload as Record<string, unknown>[]) {
      Object.keys(semester).forEach((key) => semesterKeys.add(key));
      for (const entry of semester.entries as Record<string, unknown>[]) {
        Object.keys(entry).forEach((key) => entryKeys.add(key));
      }
    }
    expect([...semesterKeys].sort()).toEqual([
      'academicYear',
      'entries',
      'isCurrent',
      'semester',
    ]);
    expect([...entryKeys].sort()).toEqual([
      'controlType',
      'date',
      'ects',
      'score',
      'status',
      'subject',
      'teacher',
    ]);
    // Ані сирі поля MAUP (student_id, testtype_id, mark_act_date...), ані сирий mark-текст
    // персональних записів не потрапляють у payload.
    expect(JSON.stringify(row.payload)).not.toContain('student_id');
    expect(JSON.stringify(row.payload)).not.toContain('mark_act_date');
  });

  // Критерій §10 п.9: TTL-індекс на `purgeAt` перевіряється через
  // `listIndexes` на справжній Mongo, а не декларацією в схемі —
  // `@Prop` у коді й реальний індекс у базі можуть розійтись (вимкнений
  // autoIndex, конфлікт з наявним індексом тощо), і про це варто дізнатись
  // до того, як персональні дані перестануть протухати.
  it('has a TTL index on purgeAt (expireAfterSeconds: 0) and no expiresAt field or index', async () => {
    const student = await createStudent();
    mockMaup();

    await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const indexes = (await collection('ExternalDataCache')
      .listIndexes()
      .toArray()) as unknown as IndexDescriptor[];

    const purgeAtIndex = indexes.find(
      (index) => Object.keys(index.key).length === 1 && index.key.purgeAt === 1,
    );
    expect(purgeAtIndex).toBeDefined();
    expect(purgeAtIndex?.expireAfterSeconds).toBe(0);

    expect(indexes.some((index) => 'expiresAt' in index.key)).toBe(false);

    const [row] = await collection('ExternalDataCache').find({}).toArray();
    expect(row).not.toHaveProperty('expiresAt');
  });

  it('serves stale data when MAUP fails after the cache expired', async () => {
    const student = await createStudent();
    mockMaup();
    await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    await collection('ExternalDataCache').updateMany(
      {},
      { $set: { freshUntil: new Date(Date.now() - 1000) } },
    );
    harness.fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: 'E-99' }, 503)),
    );

    const response = await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const body = asGradebook(response);
    expect(body.meta.stale).toBe(true);
    expect(body.semesters).toHaveLength(3);
  });

  it('returns 503 maup_unavailable without cache', async () => {
    const student = await createStudent();
    harness.fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ error: 'E-99' }, 503)),
    );

    const response = await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(503);

    expect(asError(response).code).toBe('maup_unavailable');
  });

  // Критерій §10 п.8: жоден endpoint спеки не віддає 409.
  it('returns 200 with meta.reason no_active_profile when the profile has no external id', async () => {
    const student = await createStudent('');
    mockMaup();

    const response = await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const body = asGradebook(response);
    expect(body.semesters).toEqual([]);
    expect(body.meta).toEqual({
      profileId: null,
      fetchedAt: null,
      stale: false,
      reason: 'no_active_profile',
    });
    expect(
      harness.fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith('/marks'),
      ),
    ).toHaveLength(0);
  });

  // Спека §5 п.7: без активного AcademicTerm дані все одно віддаються повністю,
  // лише isCurrent скрізь false і meta.reason сигналізує стан.
  it('returns 200 with meta.reason no_current_term when there is no active academic term', async () => {
    await collection('AcademicTerm').deleteMany({});
    const student = await createStudent();
    mockMaup();

    const response = await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    const body = asGradebook(response);
    expect(body.meta.reason).toBe('no_current_term');
    expect(body.semesters).toHaveLength(3);
    expect(body.semesters.every((s) => s.isCurrent === false)).toBe(true);
  });

  it.each([Role.ADMIN, Role.DEAN, Role.TEACHER])(
    'rejects %s with 403',
    async (role) => {
      const actor = await createActor(role, 'other');
      mockMaup();

      await request(server())
        .get('/api/gradebook/my')
        .set('Authorization', `Bearer ${actor.token}`)
        .expect(403);
    },
  );

  it('writes a bodyless audit record on view', async () => {
    const student = await createStudent();
    mockMaup();

    await request(server())
      .get('/api/gradebook/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    // `AuditLogService.logAction` записує в transactional outbox; `AuditLog`
    // наповнюється фоновим процесором асинхронно (той самий патерн, що й у
    // academic-terms.e2e-spec.ts), тому читання йде з коротким retry.
    const entries = await findAuditRows(harness, {
      action: 'gradebook.viewed',
    });
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0].details as object).sort()).toEqual([
      'kind',
      'semesterCount',
      'stale',
    ]);
    expect(JSON.stringify(entries[0])).not.toContain('1001');
    expect(JSON.stringify(entries[0])).not.toContain('Вища математика');
  });

  it('throttles the fourth refresh within a minute', async () => {
    const student = await createStudent();
    mockMaup();
    const agent = request.agent(server());

    for (let i = 0; i < 3; i += 1) {
      await agent
        .post('/api/gradebook/my/refresh')
        .set('Authorization', `Bearer ${student.token}`)
        .expect(200);
    }
    await agent
      .post('/api/gradebook/my/refresh')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(429);
  });
});
