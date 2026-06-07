import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { Role } from '../src/common/types/roles.enum';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionPeriodStatus,
} from '../src/elective-disciplines/schemas';
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const TEST_JWT_SECRET = 'electives-e2e-secret-with-sufficient-entropy';
const TEST_CSRF_SECRET = 'electives-e2e-csrf-secret-with-sufficient-entropy';

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
};

type DisciplineBody = {
  id: string;
  code: string;
  department: { id: string };
};

type ActivePeriodBody = {
  disciplines: Array<{ id: string }>;
};

type SelectionBody = {
  id: string;
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
      studentProfile: {
        group: groupAId,
        recordBookNumber: `EA-${new Types.ObjectId().toHexString()}`,
        year: 1,
      },
    });
    const studentB = await createActor(Role.STUDENT, 'student-b', {
      studentProfile: {
        group: groupAId,
        recordBookNumber: `EB-${new Types.ObjectId().toHexString()}`,
        year: 1,
      },
    });
    const outsiderStudent = await createActor(Role.STUDENT, 'outsider', {
      studentProfile: {
        group: groupBId,
        recordBookNumber: `EO-${new Types.ObjectId().toHexString()}`,
        year: 1,
      },
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
      semester: 1,
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
      academicYear: '2026/2027',
      semester: 1,
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

  const select = (
    actor: Actor,
    periodId: Types.ObjectId,
    disciplineId: Types.ObjectId,
  ) =>
    request(app.getHttpServer())
      .post(`/api/electives/periods/${periodId.toHexString()}/select`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ disciplineId: disciplineId.toHexString() });

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
        semester: 1,
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
        semester: 1,
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
        semester: 1,
        credits: 3,
        capacity: 25,
        unexpectedPrivilege: true,
      })
      .expect(400);

    await expectAuditEntry('electives-rbac-success', 'success');
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

    await select(fixture.outsiderStudent, periodId, disciplineId).expect(403);
    await request(app.getHttpServer())
      .get('/api/electives/active')
      .set('Authorization', `Bearer ${fixture.teacherA.token}`)
      .expect(403);
  });

  it('atomically assigns the last available seat to only one student', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture, { capacity: 1 });
    const periodId = await seedPeriod(fixture);

    const responses = await Promise.all([
      select(fixture.studentA, periodId, disciplineId),
      select(fixture.studentB, periodId, disciplineId),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await collection('ElectiveSelection').countDocuments({
        period: periodId,
        discipline: disciplineId,
      }),
    ).toBe(1);
    const discipline = await collection('ElectiveDiscipline').findOne({
      _id: disciplineId,
    });
    expect(discipline?.enrolledCount).toBe(1);
  });

  it('prevents concurrent requests from exceeding requiredChoices', async () => {
    const fixture = await seedBase();
    const firstDisciplineId = await seedDiscipline(fixture);
    const secondDisciplineId = await seedDiscipline(fixture);
    const periodId = await seedPeriod(fixture, { requiredChoices: 1 });

    const responses = await Promise.all([
      select(fixture.studentA, periodId, firstDisciplineId),
      select(fixture.studentA, periodId, secondDisciplineId),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await collection('ElectiveSelection').countDocuments({
        period: periodId,
        student: fixture.studentA.id,
      }),
    ).toBe(1);

    const disciplines = await collection('ElectiveDiscipline')
      .find({ _id: { $in: [firstDisciplineId, secondDisciplineId] } })
      .toArray();
    expect(
      disciplines.reduce(
        (total, discipline) => total + Number(discipline.enrolledCount ?? 0),
        0,
      ),
    ).toBe(1);
  });

  it('decrements capacity only once for concurrent cancellation attempts', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture, { capacity: 1 });
    const periodId = await seedPeriod(fixture);
    const selected = await select(
      fixture.studentA,
      periodId,
      disciplineId,
    ).expect(201);
    const selectedBody = selected.body as SelectionBody;
    const selectionId = selectedBody.id;

    const cancel = () =>
      request(app.getHttpServer())
        .delete(
          `/api/electives/periods/${periodId.toHexString()}/selections/${selectionId}`,
        )
        .set('Authorization', `Bearer ${fixture.studentA.token}`);
    const responses = await Promise.all([cancel(), cancel()]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404,
    ]);
    expect(
      await collection('ElectiveSelection').countDocuments({
        _id: new Types.ObjectId(selectionId),
      }),
    ).toBe(0);
    const discipline = await collection('ElectiveDiscipline').findOne({
      _id: disciplineId,
    });
    expect(discipline?.enrolledCount).toBe(0);
  });

  it('prevents cross-student cancellation and mutations outside the active period', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture);
    const periodId = await seedPeriod(fixture);
    const selected = await select(
      fixture.studentA,
      periodId,
      disciplineId,
    ).expect(201);
    const selectionId = (selected.body as SelectionBody).id;

    await request(app.getHttpServer())
      .delete(
        `/api/electives/periods/${periodId.toHexString()}/selections/${selectionId}`,
      )
      .set('Authorization', `Bearer ${fixture.studentB.token}`)
      .expect(404);
    await select(fixture.teacherA, periodId, disciplineId).expect(403);

    await request(app.getHttpServer())
      .patch(`/api/electives/periods/${periodId.toHexString()}/status`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({ status: ElectiveSelectionPeriodStatus.CLOSED })
      .expect(200);
    await request(app.getHttpServer())
      .delete(
        `/api/electives/periods/${periodId.toHexString()}/selections/${selectionId}`,
      )
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(400);

    expect(
      await collection('ElectiveSelection').countDocuments({
        _id: new Types.ObjectId(selectionId),
        student: fixture.studentA.id,
      }),
    ).toBe(1);
    const discipline = await collection('ElectiveDiscipline').findOne({
      _id: disciplineId,
    });
    expect(discipline?.enrolledCount).toBe(1);
  });

  it('finalizes selections idempotently and exposes only enrolled courses', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture);
    const periodId = await seedPeriod(fixture);
    const selected = await select(
      fixture.studentA,
      periodId,
      disciplineId,
    ).expect(201);
    const selectionId = (selected.body as SelectionBody).id;

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
    await request(app.getHttpServer())
      .get('/api/electives/active')
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200, []);
    await request(app.getHttpServer())
      .delete(
        `/api/electives/periods/${periodId.toHexString()}/selections/${selectionId}`,
      )
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(400);
    await expectAuditEntry('electives-finalize-success', 'success');
  });

  it('releases the finalization lock after validation failure and allows retry', async () => {
    const fixture = await seedBase();
    const disciplineId = await seedDiscipline(fixture);
    const periodId = await seedPeriod(fixture);
    await select(fixture.studentA, periodId, disciplineId).expect(201);

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

  it('exports authorized CSV results and neutralizes spreadsheet formulas', async () => {
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
    await select(fixture.studentA, periodId, disciplineId).expect(201);

    const results = await request(app.getHttpServer())
      .get(`/api/electives/periods/${periodId.toHexString()}/results`)
      .set('Authorization', `Bearer ${fixture.dean.token}`)
      .expect(200);
    const resultsBody = results.body as ResultsBody;
    expect(resultsBody.totalSelections).toBe(1);
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
      .expect('Content-Type', /text\/csv/)
      .expect(
        'Content-Disposition',
        `attachment; filename="elective-period-${periodId.toHexString()}-results.csv"`,
      )
      .expect(200);
    expect(csv.text.startsWith('\uFEFF')).toBe(true);
    expect(csv.text).toContain(`'=SUM(1,1)`);
    expect(csv.text).toContain(`'@dangerous-title`);
    expect(csv.text).toContain(`'=HYPERLINK`);
  });

  async function expectAuditEntry(
    requestId: string,
    result: 'success' | 'failure',
  ): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const entry = await collection('AuditLog').findOne({ requestId, result });
      if (entry) {
        expect(entry.targetEntity).toBe('electives');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(`Audit entry ${requestId} was not persisted`);
  }
});
