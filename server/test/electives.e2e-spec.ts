import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { Connection, Types } from 'mongoose';
import type { Response as SuperAgentResponse } from 'superagent';
import request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { Role } from '../src/common/types/roles.enum';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionPeriodStatus,
} from '../src/elective-disciplines/schemas';
import { DATABASE_MIGRATIONS } from '../src/database-migrations/database-migrations.registry';
import { upsertPublicAdministrationCatalog } from '../src/seed-data/catalogs/public-administration-electives';
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const TEST_JWT_SECRET = 'electives-e2e-secret-with-sufficient-entropy';
const TEST_CSRF_SECRET = 'electives-e2e-csrf-secret-with-sufficient-entropy';

const parseBinaryResponse = (
  response: SuperAgentResponse,
  callback: (error: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

type Actor = {
  id: Types.ObjectId;
  token: string;
};

type BaseFixture = {
  admin: Actor;
  dean: Actor;
  departmentHeadA: Actor;
  departmentHeadB: Actor;
  teacherA: Actor;
  teacherB: Actor;
  studentA: Actor;
  studentB: Actor;
  outsiderStudent: Actor;
  departmentAId: Types.ObjectId;
  departmentBId: Types.ObjectId;
  groupAId: Types.ObjectId;
  groupBId: Types.ObjectId;
  termId: Types.ObjectId;
};

type DisciplineBody = {
  id: string;
  code: string;
  department: { id: string };
};

function studentProfileFields(input: {
  group: Types.ObjectId;
  recordBookNumber: string;
  year: number;
  externalStudentId?: string;
}) {
  const _id = new Types.ObjectId();
  return {
    studentProfiles: [
      {
        _id,
        externalStudentId: input.externalStudentId ?? input.recordBookNumber,
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

type ActivePeriodBody = {
  period: { id: string };
  phase: string;
  disciplines: Array<{ id: string }>;
};

type ReplaceBody = {
  period: { id: string };
  selectedCount: number;
  remainingChoices: number;
};

type ErrorBody = {
  code: string;
  disciplineIds?: string[];
};

type FinalizationBody = {
  period: { status: ElectiveSelectionPeriodStatus };
  courseAssignments: Array<{ id: string }>;
};

type CourseListBody = {
  docs: Array<{ id: string }>;
};

type ResultsBody = {
  totalSelections: number;
  totalStudents: number;
  expectedSelections: number;
  completionRate: number;
  disciplines: Array<{ students: Array<{ id: string }> }>;
};

describe('Elective disciplines (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;

  const collection = (modelName: string) =>
    connection.model(modelName).collection;

  beforeAll(async () => {
    container = await new GenericContainer('mongo:7.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .start();

    const mongoUri = `mongodb://${container.getHost()}:${container.getMappedPort(
      27017,
    )}/electives-e2e`;
    const testConfig = new ConfigService({
      MONGODB_URI: mongoUri,
      JWT_SECRET: TEST_JWT_SECRET,
      AUTH_CSRF_SECRET: TEST_CSRF_SECRET,
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
    configureApp(app, { swaggerEnabled: false });
    await app.init();

    connection = app.get(getConnectionToken());
    jwtService = app.get(JwtService);
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

  const createActor = async (
    role: Role,
    suffix: string,
    profile: Record<string, unknown> = {},
  ): Promise<Actor> => {
    const id = new Types.ObjectId();
    await collection('User').insertOne({
      _id: id,
      login: `${role}_${suffix}`,
      passwordHash: 'not-used-in-token-e2e',
      role,
      email: `${role}_${suffix}@example.test`,
      firstName: role,
      lastName: suffix,
      status: 'active',
      ...profile,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      id,
      token: jwtService.sign({
        sub: id.toHexString(),
        login: `${role}_${suffix}`,
        role,
      }),
    };
  };

  const seedBase = async (): Promise<BaseFixture> => {
    const departmentAId = new Types.ObjectId();
    const departmentBId = new Types.ObjectId();
    const groupAId = new Types.ObjectId();
    const groupBId = new Types.ObjectId();
    const termId = new Types.ObjectId();

    await collection('AcademicTerm').insertOne({
      _id: termId,
      academicYear: '2026/2027',
      termNumber: 1,
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2027-01-31'),
      status: 'current',
      maupAcademicYear: 2026,
      maupSemester: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await collection('Department').insertMany([
      {
        _id: departmentAId,
        name: 'Department A',
        faculty: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: departmentBId,
        name: 'Department B',
        faculty: new Types.ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('Group').insertMany([
      {
        _id: groupAId,
        code: `EA-${groupAId.toHexString().slice(-6)}`,
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: groupBId,
        code: `EB-${groupBId.toHexString().slice(-6)}`,
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const admin = await createActor(Role.ADMIN, 'admin');
    const dean = await createActor(Role.DEAN, 'dean', {
      teacherProfile: { department: departmentAId, position: 'Dean' },
    });
    const departmentHeadA = await createActor(Role.DEPARTMENT_HEAD, 'head-a', {
      teacherProfile: {
        department: departmentAId,
        position: 'Department head',
      },
    });
    const departmentHeadB = await createActor(Role.DEPARTMENT_HEAD, 'head-b', {
      teacherProfile: {
        department: departmentBId,
        position: 'Department head',
      },
    });
    const teacherA = await createActor(Role.TEACHER, 'teacher-a', {
      teacherProfile: { department: departmentAId, position: 'Professor' },
    });
    const teacherB = await createActor(Role.TEACHER, 'teacher-b', {
      teacherProfile: { department: departmentBId, position: 'Professor' },
    });
    const studentA = await createActor(Role.STUDENT, 'student-a', {
      ...studentProfileFields({
        group: groupAId,
        recordBookNumber: `EA-${new Types.ObjectId().toHexString()}`,
        year: 1,
      }),
    });
    const studentB = await createActor(Role.STUDENT, 'student-b', {
      ...studentProfileFields({
        group: groupAId,
        recordBookNumber: `EB-${new Types.ObjectId().toHexString()}`,
        year: 1,
      }),
    });
    const outsiderStudent = await createActor(Role.STUDENT, 'outsider', {
      ...studentProfileFields({
        group: groupBId,
        recordBookNumber: `EO-${new Types.ObjectId().toHexString()}`,
        year: 1,
      }),
    });

    return {
      admin,
      dean,
      departmentHeadA,
      departmentHeadB,
      teacherA,
      teacherB,
      studentA,
      studentB,
      outsiderStudent,
      departmentAId,
      departmentBId,
      groupAId,
      groupBId,
      termId,
    };
  };

  const seedDiscipline = async (
    fixture: BaseFixture,
    overrides: Record<string, unknown> = {},
  ) => {
    const id = new Types.ObjectId();
    await collection('ElectiveDiscipline').insertOne({
      _id: id,
      code: `EL-${id.toHexString().slice(-8).toUpperCase()}`,
      title: 'Enterprise elective',
      description: 'Secure elective workflow',
      department: fixture.departmentAId,
      teacher: fixture.teacherA.id,
      term: fixture.termId,
      credits: 3,
      capacity: 10,
      enrolledCount: 0,
      status: ElectiveDisciplineStatus.ACTIVE,
      createdBy: fixture.admin.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return id;
  };

  const seedPeriod = async (
    fixture: BaseFixture,
    overrides: Record<string, unknown> = {},
  ) => {
    const id = new Types.ObjectId();
    await collection('ElectiveSelectionPeriod').insertOne({
      _id: id,
      title: 'Enterprise selection period',
      term: fixture.termId,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60 * 60_000),
      status: ElectiveSelectionPeriodStatus.ACTIVE,
      targetGroups: [fixture.groupAId],
      requiredChoices: 1,
      createdBy: fixture.admin.id,
      publishedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
    return id;
  };

  const saveSelections = (
    actor: Actor,
    periodId: Types.ObjectId,
    disciplineIds: Types.ObjectId[],
  ) =>
    request(app.getHttpServer())
      .put(`/api/electives/periods/${periodId.toHexString()}/selections`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ disciplineIds: disciplineIds.map(String) });

  const activeSelections = (periodId: Types.ObjectId, student: Actor) =>
    collection('ElectiveSelection')
      .find({
        period: periodId,
        student: student.id,
        status: { $in: ['selected', 'enrolled'] },
      })
      .toArray();

  const enrolled = async (id: Types.ObjectId) =>
    Number(
      (await collection('ElectiveDiscipline').findOne({ _id: id }))
        ?.enrolledCount ?? 0,
    );

  const seedDisciplines = (
    fixture: BaseFixture,
    count: number,
    overrides: Record<string, unknown> = {},
  ) =>
    Promise.all(
      Array.from({ length: count }, () => seedDiscipline(fixture, overrides)),
    );

  it('enforces authentication, role boundaries and department scoping', async () => {
    const fixture = await seedBase();
    await seedDiscipline(fixture, {
      department: fixture.departmentBId,
      teacher: fixture.teacherB.id,
    });

    await request(app.getHttpServer())
      .get('/api/electives/disciplines')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/electives/disciplines')
      .set('Authorization', `Bearer ${fixture.teacherA.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/electives/periods')
      .set('Authorization', `Bearer ${fixture.departmentHeadA.token}`)
      .send({})
      .expect(403);

    const ownDiscipline = await request(app.getHttpServer())
      .post('/api/electives/disciplines')
      .set('Authorization', `Bearer ${fixture.departmentHeadA.token}`)
      .set('X-Request-Id', 'electives-rbac-success')
      .send({
        code: 'EL-OWN-01',
        title: 'Own department elective',
        departmentId: fixture.departmentAId.toHexString(),
        teacherId: fixture.teacherA.id.toHexString(),
        credits: 3,
        capacity: 25,
      })
      .expect(201);
    const ownDisciplineBody = ownDiscipline.body as DisciplineBody;
    expect(ownDisciplineBody.department.id).toBe(
      fixture.departmentAId.toHexString(),
    );

    await request(app.getHttpServer())
      .post('/api/electives/disciplines')
      .set('Authorization', `Bearer ${fixture.departmentHeadA.token}`)
      .send({
        code: 'EL-FOREIGN-01',
        title: 'Foreign department elective',
        departmentId: fixture.departmentBId.toHexString(),
        teacherId: fixture.teacherB.id.toHexString(),
        credits: 3,
        capacity: 25,
      })
      .expect(403);

    const scopedList = await request(app.getHttpServer())
      .get('/api/electives/disciplines')
      .set('Authorization', `Bearer ${fixture.departmentHeadA.token}`)
      .expect(200);
    const scopedListBody = scopedList.body as DisciplineBody[];
    expect(scopedListBody).toHaveLength(1);
    expect(scopedListBody[0].code).toBe('EL-OWN-01');

    await request(app.getHttpServer())
      .post('/api/electives/disciplines')
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({
        code: 'EL-INVALID',
        title: 'Invalid payload',
        departmentId: fixture.departmentAId.toHexString(),
        credits: 3,
        capacity: 25,
        unexpectedPrivilege: true,
      })
      .expect(400);

    await expectAuditEntry('electives-rbac-success', 'success');
  });

  it('stores, validates and clears the syllabus link', async () => {
    const fixture = await seedBase();
    const base = {
      code: 'EL-SYL-01',
      title: 'Електронне врядування',
      departmentId: fixture.departmentAId.toHexString(),
      credits: 3,
      capacity: 30,
    };
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/api/electives/disciplines')
        .set('Authorization', `Bearer ${fixture.admin.token}`)
        .send(body);

    for (const bad of [
      'http://maup.com.ua/x.pdf',
      'javascript:alert(1)',
      'maup.com.ua/x.pdf',
      `https://maup.com.ua/${'a'.repeat(2050)}.pdf`,
    ]) {
      await post({ ...base, syllabusUrl: bad }).expect(400);
    }

    const created = await post({
      ...base,
      syllabusUrl: '  https://maup.com.ua/x.pdf  ',
    }).expect(201);
    const createdBody = created.body as DisciplineBody & {
      syllabusUrl?: string;
    };
    expect(createdBody.syllabusUrl).toBe('https://maup.com.ua/x.pdf');

    const cleared = await request(app.getHttpServer())
      .put(`/api/electives/disciplines/${createdBody.id}`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ syllabusUrl: '' })
      .expect(200);
    expect(
      (cleared.body as { syllabusUrl?: string }).syllabusUrl,
    ).toBeUndefined();
    const stored = await collection('ElectiveDiscipline').findOne({
      _id: new Types.ObjectId(createdBody.id),
    });
    expect(stored).not.toHaveProperty('syllabusUrl');
  });

  it('generates discipline codes and keeps them immutable', async () => {
    const fixture = await seedBase();
    const term = await collection('AcademicTerm').findOne({
      _id: fixture.termId,
    });
    const prefix = `EL-${String(term?.academicYear).slice(0, 4)}-${term?.termNumber}-`;
    const create = (title: string, extra: Record<string, unknown> = {}) =>
      request(app.getHttpServer())
        .post('/api/electives/disciplines')
        .set('Authorization', `Bearer ${fixture.admin.token}`)
        .send({
          title,
          departmentId: fixture.departmentAId.toHexString(),
          credits: 3,
          capacity: 30,
          ...extra,
        });

    await create('Ручна', { code: 'el-ai-01' }).expect(201);
    const [a, b] = await Promise.all([create('Перша'), create('Друга')]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const codes = [a.body, b.body]
      .map((body) => (body as DisciplineBody).code)
      .sort();
    expect(codes).toEqual([`${prefix}001`, `${prefix}002`]);

    await request(app.getHttpServer())
      .put(`/api/electives/disciplines/${(a.body as DisciplineBody).id}`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ code: 'EL-NEW' })
      .expect(400);
  });

  it('shows periods only to targeted students and rejects foreign groups', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture);
    const periodId = await seedPeriod(fixture);

    const visible = await request(app.getHttpServer())
      .get('/api/electives/active')
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    const visibleBody = visible.body as ActivePeriodBody[];
    expect(visibleBody).toHaveLength(1);
    expect(visibleBody[0].disciplines[0].id).toBe(disciplineId.toHexString());

    const hidden = await request(app.getHttpServer())
      .get('/api/electives/active')
      .set('Authorization', `Bearer ${fixture.outsiderStudent.token}`)
      .expect(200);
    expect(hidden.body).toEqual([]);

    await saveSelections(fixture.outsiderStudent, periodId, [
      disciplineId,
    ]).expect(403);
    await request(app.getHttpServer())
      .get('/api/electives/active')
      .set('Authorization', `Bearer ${fixture.teacherA.token}`)
      .expect(403);
  });

  it('returns [] without a current academic term', async () => {
    const fixture = await seedBase();
    await seedDiscipline(fixture);
    await seedPeriod(fixture);
    await collection('AcademicTerm').updateMany(
      {},
      { $set: { status: 'closed' } },
    );

    const res = await request(app.getHttpServer())
      .get('/api/electives/active')
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('accepts up to 10 required choices and fills slots up to 9', async () => {
    const fixture = await seedBase();
    const create = (requiredChoices: number) =>
      request(app.getHttpServer())
        .post('/api/electives/periods')
        .set('Authorization', `Bearer ${fixture.admin.token}`)
        .send({
          title: `Ліміт ${requiredChoices}`,
          startsAt: new Date(Date.now() - 60_000).toISOString(),
          endsAt: new Date(Date.now() + 86_400_000).toISOString(),
          targetGroupIds: [fixture.groupAId.toHexString()],
          requiredChoices,
        });
    await create(10).expect(201);
    await create(11).expect(400);

    const periodId = await seedPeriod(fixture, { requiredChoices: 10 });
    const disciplineIds = await Promise.all(
      Array.from({ length: 10 }, () => seedDiscipline(fixture)),
    );
    await saveSelections(fixture.studentA, periodId, disciplineIds).expect(200);
    const slots = await collection('ElectiveSelection')
      .find({ period: periodId, student: fixture.studentA.id })
      .map((doc) => doc.choiceSlot as number)
      .toArray();
    expect(slots.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('saves a full set and fills slots', async () => {
    const fixture = await seedBase();
    const ids = await seedDisciplines(fixture, 6);
    const periodId = await seedPeriod(fixture, { requiredChoices: 6 });

    const res = await saveSelections(fixture.studentA, periodId, ids).expect(
      200,
    );

    const body = res.body as ReplaceBody;
    expect(body.period.id).toBe(periodId.toHexString());
    expect(body.selectedCount).toBe(6);
    expect(body.remainingChoices).toBe(0);
    const selections = await activeSelections(periodId, fixture.studentA);
    expect(selections.map((s) => s.choiceSlot as number).sort()).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
    for (const id of ids) {
      expect(await enrolled(id)).toBe(1);
    }
  });

  it('replaces part of the set and adjusts only changed counters', async () => {
    const fixture = await seedBase();
    const ids = await seedDisciplines(fixture, 8);
    const periodId = await seedPeriod(fixture, { requiredChoices: 6 });
    await saveSelections(fixture.studentA, periodId, ids.slice(0, 6)).expect(
      200,
    );
    const before = await activeSelections(periodId, fixture.studentA);
    const slotOf = new Map(
      before.map((s) => [
        (s.discipline as Types.ObjectId).toHexString(),
        s.choiceSlot as number,
      ]),
    );

    await saveSelections(fixture.studentA, periodId, [
      ...ids.slice(0, 4),
      ids[6],
      ids[7],
    ])
      .set('X-Request-Id', 'electives-replace-partial')
      .expect(200);

    for (const removed of ids.slice(4, 6)) {
      const doc = await collection('ElectiveSelection').findOne({
        period: periodId,
        student: fixture.studentA.id,
        discipline: removed,
      });
      expect(doc?.status).toBe('cancelled');
      expect(doc?.cancelReason).toBe('student');
      expect(await enrolled(removed)).toBe(0);
    }
    const freedSlots = ids
      .slice(4, 6)
      .map((id) => slotOf.get(id.toHexString()) as number)
      .sort((a, b) => a - b);
    const addedSlots = (
      await Promise.all(
        ids.slice(6).map((id) =>
          collection('ElectiveSelection').findOne({
            period: periodId,
            student: fixture.studentA.id,
            discipline: id,
            status: 'selected',
          }),
        ),
      )
    )
      .map((doc) => doc?.choiceSlot as number)
      .sort((a, b) => a - b);
    expect(addedSlots).toEqual(freedSlots);
    for (const id of [...ids.slice(0, 4), ...ids.slice(6)]) {
      expect(await enrolled(id)).toBe(1);
    }
    expect(await activeSelections(periodId, fixture.studentA)).toHaveLength(6);
    await expectAuditEntry(
      'electives-replace-partial',
      'success',
      'elective_period',
      'elective.selection.replace',
    );
  });

  it('treats the same set in another order as a no-op', async () => {
    const fixture = await seedBase();
    const ids = await seedDisciplines(fixture, 6);
    const periodId = await seedPeriod(fixture, { requiredChoices: 6 });
    await saveSelections(fixture.studentA, periodId, ids)
      .set('X-Request-Id', 'electives-replace-first')
      .expect(200);
    await expectAuditEntry(
      'electives-replace-first',
      'success',
      'elective_period',
      'elective.selection.replace',
    );
    const snapshot = async () => ({
      selections: await collection('ElectiveSelection')
        .find({ period: periodId })
        .sort({ _id: 1 })
        .toArray(),
      disciplines: await collection('ElectiveDiscipline')
        .find({})
        .sort({ _id: 1 })
        .toArray(),
    });
    const before = await snapshot();

    const res = await saveSelections(
      fixture.studentA,
      periodId,
      [...ids].reverse(),
    )
      .set('X-Request-Id', 'electives-replace-noop')
      .expect(200);

    expect((res.body as ReplaceBody).selectedCount).toBe(6);
    expect(await snapshot()).toEqual(before);
    // Audit records go through an async outbox: wait for it to drain, then
    // check that the no-op request left no record (not even a fallback).
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const open = await connection.collection('audit_outbox').countDocuments({
        status: { $in: ['pending', 'processing'] },
      });
      if (open === 0) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(
      await connection.collection('audit_outbox').countDocuments({
        'payload.requestId': 'electives-replace-noop',
      }),
    ).toBe(0);
    expect(
      await collection('AuditLog').countDocuments({
        requestId: 'electives-replace-noop',
        action: 'elective.selection.replace',
      }),
    ).toBe(0);
  });

  it('rejects wrong count and unavailable disciplines', async () => {
    const fixture = await seedBase();
    const ids = await seedDisciplines(fixture, 6);
    const periodId = await seedPeriod(fixture, { requiredChoices: 6 });

    const mismatch = await saveSelections(
      fixture.studentA,
      periodId,
      ids.slice(0, 5),
    ).expect(400);
    expect((mismatch.body as ErrorBody).code).toBe(
      'elective_choice_count_mismatch',
    );

    const draftId = await seedDiscipline(fixture, {
      status: ElectiveDisciplineStatus.DRAFT,
    });
    const otherTermId = new Types.ObjectId();
    const foreignTermId = await seedDiscipline(fixture, { term: otherTermId });
    for (const bad of [draftId, foreignTermId]) {
      const res = await saveSelections(fixture.studentA, periodId, [
        ...ids.slice(0, 5),
        bad,
      ]).expect(400);
      const body = res.body as ErrorBody;
      expect(body.code).toBe('elective_discipline_unavailable');
      expect(body.disciplineIds).toContain(bad.toHexString());
    }

    await saveSelections(
      fixture.studentA,
      periodId,
      Array.from({ length: 11 }, () => new Types.ObjectId()),
    ).expect(400);
    expect(await activeSelections(periodId, fixture.studentA)).toHaveLength(0);
  });

  it('gives the last seat to one student and keeps the other set intact', async () => {
    const fixture = await seedBase();
    const [x, y] = await seedDisciplines(fixture, 2);
    await collection('ElectiveDiscipline').updateOne(
      { _id: y },
      { $set: { capacity: 1 } },
    );
    const periodId = await seedPeriod(fixture, { requiredChoices: 1 });
    await saveSelections(fixture.studentB, periodId, [x]).expect(200);

    const responses = await Promise.all([
      saveSelections(fixture.studentA, periodId, [y]),
      saveSelections(fixture.studentB, periodId, [y]),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const loserIndex = responses.findIndex((r) => r.status === 409);
    const loserBody = responses[loserIndex].body as ErrorBody;
    expect(loserBody.code).toBe('elective_capacity_full');
    expect(loserBody.disciplineIds).toEqual([y.toHexString()]);
    if (loserIndex === 1) {
      const kept = await activeSelections(periodId, fixture.studentB);
      expect(kept.map((s) => String(s.discipline))).toEqual([x.toHexString()]);
    }
    expect(await enrolled(y)).toBe(1);
    expect(
      await collection('ElectiveSelection').countDocuments({
        period: periodId,
        discipline: y,
        status: { $in: ['selected', 'enrolled'] },
      }),
    ).toBe(1);
  });

  it('keeps counters consistent under concurrent saves of one student', async () => {
    const fixture = await seedBase();
    const [a, b, c, d] = await seedDisciplines(fixture, 4);
    const periodId = await seedPeriod(fixture, { requiredChoices: 2 });

    const responses = await Promise.all([
      saveSelections(fixture.studentA, periodId, [a, b]),
      saveSelections(fixture.studentA, periodId, [c, d]),
    ]);

    expect(responses.some((r) => r.status === 200)).toBe(true);
    for (const r of responses.filter((item) => item.status !== 200)) {
      expect(r.status).toBe(409);
      expect([
        'elective_selection_conflict',
        'elective_capacity_full',
      ]).toContain((r.body as ErrorBody).code);
    }
    const active = await activeSelections(periodId, fixture.studentA);
    expect(active).toHaveLength(2);
    for (const id of [a, b, c, d]) {
      expect(await enrolled(id)).toBe(
        active.filter((s) => String(s.discipline) === id.toHexString()).length,
      );
    }
  });

  it('rejects ids that differ only in hex case as a count mismatch', async () => {
    const fixture = await seedBase();
    const [x, y] = await seedDisciplines(fixture, 2);
    const periodId = await seedPeriod(fixture, { requiredChoices: 2 });
    await saveSelections(fixture.studentA, periodId, [x, y]).expect(200);
    const [p] = await seedDisciplines(fixture, 1);

    const res = await request(app.getHttpServer())
      .put(`/api/electives/periods/${periodId.toHexString()}/selections`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .send({
        disciplineIds: [p.toHexString(), p.toHexString().toUpperCase()],
      })
      .expect(400);

    expect((res.body as ErrorBody).code).toBe('elective_choice_count_mismatch');
    const active = await activeSelections(periodId, fixture.studentA);
    expect(active.map((s) => String(s.discipline)).sort()).toEqual(
      [x, y].map(String).sort(),
    );
    expect(await enrolled(p)).toBe(0);
  });

  it('does not lose an update when two saves of one student remove disjoint disciplines', async () => {
    const fixture = await seedBase();
    const [x, y, p, q] = await seedDisciplines(fixture, 4);
    const periodId = await seedPeriod(fixture, { requiredChoices: 2 });
    await saveSelections(fixture.studentA, periodId, [x, y]).expect(200);

    const requests = [
      [x, p],
      [y, q],
    ];
    const responses = await Promise.all(
      requests.map((ids) => saveSelections(fixture.studentA, periodId, ids)),
    );

    for (const r of responses.filter((item) => item.status !== 200)) {
      expect(r.status).toBe(409);
      expect([
        'elective_selection_conflict',
        'elective_capacity_full',
      ]).toContain((r.body as ErrorBody).code);
    }
    const active = await activeSelections(periodId, fixture.studentA);
    expect(active).toHaveLength(2);
    const finalSet = active.map((s) => String(s.discipline)).sort();
    const sets = (ids: Types.ObjectId[]) => ids.map(String).sort();
    const accepted = requests
      .filter((_, index) => responses[index].status === 200)
      .map(sets);
    // The final set is a winner's set; with no winner it is the original one.
    expect(
      accepted.length > 0
        ? accepted.some((set) => set.join() === finalSet.join())
        : finalSet.join() === sets([x, y]).join(),
    ).toBe(true);
    for (const id of [x, y, p, q]) {
      expect(await enrolled(id)).toBe(
        active.filter((s) => String(s.discipline) === id.toHexString()).length,
      );
    }
  });

  it('rejects non-students, foreign groups and closed periods', async () => {
    const fixture = await seedBase();
    const [id] = await seedDisciplines(fixture, 1);
    const periodId = await seedPeriod(fixture, { requiredChoices: 1 });
    await saveSelections(fixture.studentA, periodId, [id]).expect(200);

    await saveSelections(fixture.teacherA, periodId, [id]).expect(403);
    await saveSelections(fixture.outsiderStudent, periodId, [id]).expect(403);

    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${periodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(200);
    await saveSelections(fixture.studentB, periodId, [id]).expect(400);

    expect(await activeSelections(periodId, fixture.studentA)).toHaveLength(1);
    expect(
      await collection('ElectiveSelection').countDocuments({
        period: periodId,
      }),
    ).toBe(1);
    expect(await enrolled(id)).toBe(1);
  });

  it('finalizes selections idempotently and exposes only enrolled courses', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture);
    const periodId = await seedPeriod(fixture);
    await saveSelections(fixture.studentA, periodId, [disciplineId]).expect(
      200,
    );

    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${periodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(200);

    const finalized = await request(app.getHttpServer())
      .post(`/api/electives/periods/${periodId.toHexString()}/finalize`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .set('X-Request-Id', 'electives-finalize-success')
      .send({})
      .expect(201);
    const finalizedBody = finalized.body as FinalizationBody;
    expect(finalizedBody.period.status).toBe(
      ElectiveSelectionPeriodStatus.FINALIZED,
    );
    expect(finalizedBody.courseAssignments).toHaveLength(1);

    const assignmentId = new Types.ObjectId(
      finalizedBody.courseAssignments[0].id,
    );
    const assignment = await collection('CourseAssignment').findOne({
      _id: assignmentId,
    });
    expect(assignment?.source).toBe('elective');
    expect(
      (assignment?.enrolledStudents as Types.ObjectId[]).map((id) =>
        id.toHexString(),
      ),
    ).toEqual([fixture.studentA.id.toHexString()]);

    const studentCourses = await request(app.getHttpServer())
      .get('/api/courses/my')
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    const studentCoursesBody = studentCourses.body as CourseListBody;
    expect(
      studentCoursesBody.docs.some(
        (course) => course.id === assignmentId.toHexString(),
      ),
    ).toBe(true);

    const outsiderCourses = await request(app.getHttpServer())
      .get('/api/courses/my')
      .set('Authorization', `Bearer ${fixture.studentB.token}`)
      .expect(200);
    const outsiderCoursesBody = outsiderCourses.body as CourseListBody;
    expect(
      outsiderCoursesBody.docs.some(
        (course) => course.id === assignmentId.toHexString(),
      ),
    ).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/electives/periods/${periodId.toHexString()}/finalize`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({})
      .expect(201);
    expect(
      await collection('CourseAssignment').countDocuments({
        electivePeriod: periodId,
      }),
    ).toBe(1);
    expect(
      await collection('Notification').countDocuments({
        userId: fixture.studentA.id,
        entityType: 'elective',
        entityId: periodId.toHexString(),
      }),
    ).toBe(1);
    const afterFinalize = await request(app.getHttpServer())
      .get('/api/electives/active')
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    const afterFinalizeBody = afterFinalize.body as ActivePeriodBody[];
    expect(afterFinalizeBody).toHaveLength(1);
    expect(afterFinalizeBody[0].period.id).toBe(periodId.toHexString());
    expect(afterFinalizeBody[0].phase).toBe('finalized');
    await saveSelections(fixture.studentA, periodId, [disciplineId]).expect(
      400,
    );
    await expectAuditEntry(
      'electives-finalize-success',
      'success',
      'elective_period',
      'elective.period.finalize',
    );
  });

  it('releases the finalization lock after validation failure and allows retry', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture);
    const periodId = await seedPeriod(fixture);
    await saveSelections(fixture.studentA, periodId, [disciplineId]).expect(
      200,
    );

    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${periodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(200);
    await collection('User').updateOne(
      { _id: fixture.teacherA.id },
      { $set: { status: 'blocked' } },
    );

    await request(app.getHttpServer())
      .post(`/api/electives/periods/${periodId.toHexString()}/finalize`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({})
      .expect(400);

    const failedPeriod = await collection('ElectiveSelectionPeriod').findOne({
      _id: periodId,
    });
    expect(failedPeriod?.status).toBe(ElectiveSelectionPeriodStatus.CLOSED);
    expect(failedPeriod?.finalizationStartedAt).toBeUndefined();
    expect(failedPeriod?.finalizationStartedBy).toBeUndefined();
    expect(failedPeriod?.finalizationToken).toBeUndefined();

    await collection('User').updateOne(
      { _id: fixture.teacherA.id },
      { $set: { status: 'active' } },
    );
    const retried = await request(app.getHttpServer())
      .post(`/api/electives/periods/${periodId.toHexString()}/finalize`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({})
      .expect(201);
    expect((retried.body as FinalizationBody).period.status).toBe(
      ElectiveSelectionPeriodStatus.FINALIZED,
    );
  });

  it('rejects an active finalization lock and recovers a stale lock', async () => {
    const fixture = await seedBase();
    const periodId = await seedPeriod(fixture, {
      status: ElectiveSelectionPeriodStatus.CLOSED,
      closedAt: new Date(),
      finalizationStartedAt: new Date(),
      finalizationStartedBy: fixture.dean.id,
      finalizationToken: 'active-lock',
    });

    await request(app.getHttpServer())
      .post(`/api/electives/periods/${periodId.toHexString()}/finalize`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({})
      .expect(409);

    await collection('ElectiveSelectionPeriod').updateOne(
      { _id: periodId },
      {
        $set: {
          finalizationStartedAt: new Date(Date.now() - 16 * 60_000),
        },
      },
    );

    const response = await request(app.getHttpServer())
      .post(`/api/electives/periods/${periodId.toHexString()}/finalize`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({})
      .expect(201);
    const responseBody = response.body as FinalizationBody;
    expect(responseBody.period.status).toBe(
      ElectiveSelectionPeriodStatus.FINALIZED,
    );
  });

  it('enforces period lifecycle for closing, results and exports', async () => {
    const fixture = await seedBase();
    const draftPeriodId = await seedPeriod(fixture, {
      status: ElectiveSelectionPeriodStatus.DRAFT,
      publishedAt: undefined,
    });

    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${draftPeriodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/electives/periods/${draftPeriodId.toHexString()}/results/export`,
      )
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${draftPeriodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.ACTIVE })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${draftPeriodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.DRAFT })
      .expect(400);

    const activePeriodId = await seedPeriod(fixture);
    await request(app.getHttpServer())
      .get(`/api/electives/periods/${activePeriodId.toHexString()}/results`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/electives/periods/${activePeriodId.toHexString()}/results/export?format=xlsx`,
      )
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${activePeriodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${activePeriodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(400);
    await request(app.getHttpServer())
      .get(
        `/api/electives/periods/${activePeriodId.toHexString()}/results/export?format=pdf`,
      )
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(400);
  });

  it('exports secure, structured CSV and XLSX reports after closing', async () => {
    const fixture = await seedBase();
    await collection('User').updateOne(
      { _id: fixture.studentA.id },
      { $set: { lastName: '=HYPERLINK("https://invalid.test")' } },
    );
    const disciplineId = await seedDiscipline(fixture, {
      title: '@dangerous-title',
    });
    const periodId = await seedPeriod(fixture, {
      title: '=SUM(1,1)',
    });
    await saveSelections(fixture.studentA, periodId, [disciplineId]).expect(
      200,
    );

    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${periodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(200);

    const results = await request(app.getHttpServer())
      .get(`/api/electives/periods/${periodId.toHexString()}/results`)
      .set('Authorization', `Bearer ${fixture.dean.token}`)
      .expect(200);
    const resultsBody = results.body as ResultsBody;
    expect(resultsBody.totalSelections).toBe(1);
    expect(resultsBody.totalStudents).toBe(1);
    expect(resultsBody.expectedSelections).toBe(2);
    expect(resultsBody.completionRate).toBe(50);
    expect(resultsBody.disciplines[0].students).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/api/electives/periods/${periodId.toHexString()}/results/export`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/electives/periods/${periodId.toHexString()}/results/export`)
      .set('Authorization', `Bearer ${fixture.departmentHeadA.token}`)
      .expect(403);

    const csv = await request(app.getHttpServer())
      .get(`/api/electives/periods/${periodId.toHexString()}/results/export`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect('Content-Type', /text\/csv/)
      .expect(
        'Content-Disposition',
        `attachment; filename="elective-period-${periodId.toHexString()}-results.csv"`,
      )
      .expect(200);
    expect(Buffer.isBuffer(csv.body)).toBe(true);
    const csvBuffer = csv.body as Buffer;
    expect([...csvBuffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csvText = csvBuffer.toString('utf8');
    expect(csvText.startsWith('\uFEFF')).toBe(true);
    expect(csvText).not.toContain('sep=;');
    expect(csvText.split('\r\n')[0]).toContain(
      'Період;Навчальний рік;Навчальний період;Статус',
    );
    expect(csvText).toContain('Код дисципліни;Дисципліна;Кафедра');
    expect(csvText).toContain('ID студента;Логін;ПІБ студента;Група');
    expect(csvText).toContain(`'=SUM(1,1)`);
    expect(csvText).toContain(`'@dangerous-title`);
    expect(csvText).toContain(`'=HYPERLINK`);

    const xlsx = await request(app.getHttpServer())
      .get(
        `/api/electives/periods/${periodId.toHexString()}/results/export?format=xlsx`,
      )
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(
        'Content-Type',
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      )
      .expect(
        'Content-Disposition',
        `attachment; filename="elective-period-${periodId.toHexString()}-results.xlsx"`,
      )
      .expect(200);

    expect(Buffer.isBuffer(xlsx.body)).toBe(true);
    const workbook = new ExcelJS.Workbook();
    const workbookData = Uint8Array.from(xlsx.body as Buffer).buffer;
    await workbook.xlsx.load(workbookData);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Зведення',
      'Вибори студентів',
    ]);
    expect(workbook.getWorksheet('Зведення')?.getCell('A1').value).toBe(
      'Результати вибору вибіркових дисциплін',
    );
    const summaryWorksheet = workbook.getWorksheet('Зведення');
    expect(summaryWorksheet?.getColumn(1).width).toBe(38);
    expect(summaryWorksheet?.getCell('B3').alignment.horizontal).toBe('left');
    expect(summaryWorksheet?.getCell('B17').alignment.horizontal).toBe('left');
    expect(summaryWorksheet?.getCell('G18').alignment.horizontal).toBe('left');
    expect(
      workbook.getWorksheet('Вибори студентів')?.getCell('D3').value,
    ).toContain(`'=HYPERLINK`);
  });

  async function expectAuditEntry(
    requestId: string,
    result: 'success' | 'failure',
    targetEntity = 'electives',
    action?: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const entry = await collection('AuditLog').findOne({ requestId, result });
      if (entry) {
        expect(entry.targetEntity).toBe(targetEntity);
        if (action) {
          expect(entry.action).toBe(action);
        }
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Audit entry ${requestId} was not persisted`);
  }

  it('upserts the public administration catalog idempotently', async () => {
    const fixture = await seedBase();
    const db = connection.db!;
    const logger = { log: jest.fn(), warn: jest.fn() };

    const first = await upsertPublicAdministrationCatalog(db, logger);
    expect(first.disciplinesInserted).toBe(26);
    const department = await collection('Department').findOne({
      name: 'Кафедра публічного адміністрування',
    });
    const disciplines = await collection('ElectiveDiscipline')
      .find({ department: department?._id, term: fixture.termId })
      .toArray();
    expect(disciplines).toHaveLength(26);
    expect(
      disciplines.every(
        (d) => d.credits === 3 && d.capacity === 30 && d.status === 'active',
      ),
    ).toBe(true);
    expect(
      disciplines.every((d) =>
        String(d.syllabusUrl).startsWith('https://maup.com.ua/assets/'),
      ),
    ).toBe(true);
    expect(
      disciplines.every((d) => /^EL-\d{4}-[12]-\d{3,}$/.test(String(d.code))),
    ).toBe(true);

    await collection('ElectiveDiscipline').updateOne(
      { _id: disciplines[0]._id },
      { $set: { capacity: 45 } },
    );
    const second = await upsertPublicAdministrationCatalog(db, logger);
    expect(second.disciplinesInserted).toBe(0);
    expect(
      (
        await collection('ElectiveDiscipline').findOne({
          _id: disciplines[0]._id,
        })
      )?.capacity,
    ).toBe(45);
    expect(
      await collection('Faculty').countDocuments({
        name: 'Інститут економіки',
      }),
    ).toBe(1);
  });

  it('creates only the department when there is no current term', async () => {
    await seedBase();
    await collection('AcademicTerm').updateMany(
      { status: 'current' },
      { $set: { status: 'closed' } },
    );
    const logger = { log: jest.fn(), warn: jest.fn() };
    const result = await upsertPublicAdministrationCatalog(
      connection.db!,
      logger,
    );
    expect(result.disciplinesInserted).toBe(0);
    expect(logger.warn).toHaveBeenCalled();
    expect(
      await collection('Department').countDocuments({
        name: 'Кафедра публічного адміністрування',
      }),
    ).toBe(1);
  });

  it('public administration migration skips an empty database and seeds a populated one', async () => {
    const migration = DATABASE_MIGRATIONS.find(
      (item) => item.id === '202611180001-public-administration-electives',
    );
    expect(migration).toBeDefined();

    await migration!.up(connection.db!);
    expect(
      await collection('Faculty').countDocuments({
        name: 'Інститут економіки',
      }),
    ).toBe(0);
    expect(
      await collection('Department').countDocuments({
        name: 'Кафедра публічного адміністрування',
      }),
    ).toBe(0);

    await seedBase();
    await migration!.up(connection.db!);
    expect(
      await collection('ElectiveDiscipline').countDocuments({
        title: 'Електронне врядування',
      }),
    ).toBe(1);
    expect(await collection('ElectiveDiscipline').countDocuments()).toBe(26);
  });
});
