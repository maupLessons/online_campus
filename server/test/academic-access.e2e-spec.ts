import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { promises as fs } from 'fs';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { Role } from '../src/common/types/roles.enum';
import { CourseAssignmentSource } from '../src/courses/schemas';
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const TEST_JWT_SECRET = 'academic-access-e2e-jwt-secret-with-good-entropy';
const TEST_CSRF_SECRET = 'academic-access-e2e-csrf-secret-with-good-entropy';

type Actor = {
  id: Types.ObjectId;
  token: string;
};

type Fixture = {
  admin: Actor;
  deanA: Actor;
  enrolledStudent: Actor;
  sameGroupOutsider: Actor;
  foreignStudent: Actor;
  teacherA: Actor;
  teacherB: Actor;
  assignmentAId: Types.ObjectId;
  assignmentBId: Types.ObjectId;
  courseAId: Types.ObjectId;
  courseBId: Types.ObjectId;
  // Schedule is now a read-only MAUP API cache keyed by ScheduleSnapshotEntry.key, not a
  // per-lesson ObjectId (spec 02 §4.1) — this references the seeded snapshot entry's key.
  scheduleAEntryKey: string;
};

type IdView = {
  id: string;
};

type PaginatedIdView = {
  docs: IdView[];
};

function studentProfileFields(input: {
  group: Types.ObjectId;
  recordBookNumber: string;
  year: number;
  externalStudentId?: string;
  status?: 'active' | 'inactive';
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
        status: input.status ?? 'active',
        syncedAt: new Date(),
      },
    ],
    activeStudentProfileId: _id,
  };
}

describe('Academic object access (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;
  const createdFiles = new Set<string>();

  const collection = (modelName: string) =>
    connection.model(modelName).collection;

  beforeAll(async () => {
    container = await new GenericContainer('mongo:7.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .start();

    const mongoUri = `mongodb://${container.getHost()}:${container.getMappedPort(
      27017,
    )}/academic-access-e2e`;
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

  afterEach(async () => {
    await Promise.all(
      [...createdFiles].map((filePath) =>
        fs.unlink(filePath).catch(() => undefined),
      ),
    );
    createdFiles.clear();
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
    const login = `${role}_${suffix}`;
    await collection('User').insertOne({
      _id: id,
      login,
      passwordHash: 'not-used-in-token-e2e',
      role,
      email: `${login}@example.test`,
      firstName: 'Scoped',
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
        login,
        role,
      }),
    };
  };

  const seedFixture = async (): Promise<Fixture> => {
    const facultyAId = new Types.ObjectId();
    const facultyBId = new Types.ObjectId();
    const departmentAId = new Types.ObjectId();
    const departmentBId = new Types.ObjectId();
    const groupAId = new Types.ObjectId();
    const groupBId = new Types.ObjectId();
    const courseAId = new Types.ObjectId();
    const courseBId = new Types.ObjectId();
    const assignmentAId = new Types.ObjectId();
    const assignmentBId = new Types.ObjectId();
    const scheduleAEntryKey = 'ACCESS-A-1';
    const termId = new Types.ObjectId();

    const admin = await createActor(Role.ADMIN, 'admin');
    const deanA = await createActor(Role.DEAN, 'dean-a', {
      teacherProfile: { department: departmentAId, position: 'Dean' },
    });
    const deanB = await createActor(Role.DEAN, 'dean-b', {
      teacherProfile: { department: departmentBId, position: 'Dean' },
    });
    const teacherA = await createActor(Role.TEACHER, 'teacher-a', {
      teacherProfile: {
        department: departmentAId,
        position: 'Professor',
        externalTeacherId: 'TCH-A',
      },
    });
    const teacherB = await createActor(Role.TEACHER, 'teacher-b', {
      teacherProfile: {
        department: departmentBId,
        position: 'Professor',
      },
    });
    const enrolledStudent = await createActor(Role.STUDENT, 'enrolled', {
      ...studentProfileFields({
        group: groupAId,
        recordBookNumber: 'ACCESS-001',
        year: 1,
      }),
    });
    const sameGroupOutsider = await createActor(Role.STUDENT, 'outsider', {
      ...studentProfileFields({
        group: groupAId,
        recordBookNumber: 'ACCESS-002',
        year: 1,
      }),
    });
    const foreignStudent = await createActor(Role.STUDENT, 'foreign', {
      ...studentProfileFields({
        group: groupBId,
        recordBookNumber: 'ACCESS-003',
        year: 1,
      }),
    });

    await collection('Faculty').insertMany([
      {
        _id: facultyAId,
        name: 'Scoped Faculty A',
        dean: deanA.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: facultyBId,
        name: 'Scoped Faculty B',
        dean: deanB.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('Department').insertMany([
      {
        _id: departmentAId,
        name: 'Scoped Department A',
        faculty: facultyAId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: departmentBId,
        name: 'Scoped Department B',
        faculty: facultyBId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('Group').insertMany([
      {
        _id: groupAId,
        code: 'ACCESS-A',
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: groupBId,
        code: 'ACCESS-B',
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('Course').insertMany([
      {
        _id: courseAId,
        name: 'Scoped Elective A',
        code: 'ACCESS-EL-A',
        department: departmentAId,
        credits: 3,
        status: 'active',
        createdBy: admin.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: courseBId,
        name: 'Scoped Course B',
        code: 'ACCESS-B',
        department: departmentBId,
        credits: 3,
        status: 'active',
        createdBy: admin.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
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
    await collection('CourseAssignment').insertMany([
      {
        _id: assignmentAId,
        course: courseAId,
        group: groupAId,
        teacher: teacherA.id,
        term: termId,
        source: CourseAssignmentSource.ELECTIVE,
        enrolledStudents: [enrolledStudent.id],
        finalizedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: assignmentBId,
        course: courseBId,
        group: groupBId,
        teacher: teacherB.id,
        term: termId,
        source: CourseAssignmentSource.STANDARD,
        enrolledStudents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    // Schedule is now a read-only cache of MAUP API snapshots (spec 02 §4.1), shared per
    // {group, term}, not a per-course-assignment ScheduleEntry — seed the ScheduleSnapshot
    // directly (MAUP_API_ENABLED is unset/false here, so ScheduleSnapshotService.getOrRefresh
    // serves it straight from the DB without calling out).
    await collection('ScheduleSnapshot').insertOne({
      _id: new Types.ObjectId(),
      groupCode: 'ACCESS-A',
      term: termId,
      isExamSession: false,
      fetchedAt: new Date(),
      fetchedByUserId: null,
      rawHash: 'test-hash-access-a',
      entries: [
        {
          key: scheduleAEntryKey,
          date: '2026-09-15',
          startTime: '08:30',
          endTime: '10:00',
          courseTitle: 'Scoped Elective A',
          subjectKey: 'ACCESS-EL-A',
          type: 'lecture',
          teacherName: 'Teacher A',
          teacherExternalId: 'TCH-A',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return {
      admin,
      deanA,
      enrolledStudent,
      sameGroupOutsider,
      foreignStudent,
      teacherA,
      teacherB,
      assignmentAId,
      assignmentBId,
      courseAId,
      courseBId,
      scheduleAEntryKey,
    };
  };

  // Schedule mutation (POST /schedule) and the elective-enrollment-aware schedule filter it
  // used to drive no longer exist: spec 02 makes the MAUP API the sole source for schedule/session,
  // campus stops editing it, and the shared per-group ScheduleSnapshot carries no per-student
  // elective-enrollment data to filter on (confirmed: no `elective`/`enrolled` references anywhere
  // under src/schedule). So a same-group student who isn't enrolled in the elective now sees the
  // same group-wide cache as everyone else — this test is rewritten to assert that (still real
  // group-scoping, just no elective distinction), instead of a "protects" behavior that no longer exists.
  it('scopes /schedule/my to the group cache; a different group sees nothing', async () => {
    const fixture = await seedFixture();
    const range = '?from=2026-09-01&to=2026-09-30';

    const enrolledSchedule = await request(app.getHttpServer())
      .get(`/api/schedule/my${range}`)
      .set('Authorization', `Bearer ${fixture.enrolledStudent.token}`)
      .expect(200);
    expect((enrolledSchedule.body as { entries: IdView[] }).entries).toEqual([
      expect.objectContaining({ id: fixture.scheduleAEntryKey }),
    ]);

    // Same group, not enrolled in the elective assignment: no per-student filtering left in the
    // schedule module, so the outsider sees the same group-wide cache as the enrolled student.
    const outsiderSchedule = await request(app.getHttpServer())
      .get(`/api/schedule/my${range}`)
      .set('Authorization', `Bearer ${fixture.sameGroupOutsider.token}`)
      .expect(200);
    expect((outsiderSchedule.body as { entries: IdView[] }).entries).toEqual([
      expect.objectContaining({ id: fixture.scheduleAEntryKey }),
    ]);

    // A genuinely different group is still scoped out (no snapshot seeded for it).
    const foreignSchedule = await request(app.getHttpServer())
      .get(`/api/schedule/my${range}`)
      .set('Authorization', `Bearer ${fixture.foreignStudent.token}`)
      .expect(200);
    expect((foreignSchedule.body as { entries: IdView[] }).entries).toEqual([]);
  });

  // Notification-on-schedule-change is covered end-to-end in schedule.e2e-spec.ts ("notifies each
  // active student once when a classroom changes"), including that it is group-wide, not
  // elective-enrollment-scoped (schedule-change-notifier.service.ts uses activeStudentsInGroup).
  // What's left to check here, specifically for academic access, is teacher-side scoping: a
  // teacher only sees group-A's cache when their externalTeacherId matches the entry.
  it('only the assigned teacher sees the group schedule via /schedule/my', async () => {
    const fixture = await seedFixture();
    const range = '?from=2026-09-01&to=2026-09-30';

    const teacherASchedule = await request(app.getHttpServer())
      .get(`/api/schedule/my${range}`)
      .set('Authorization', `Bearer ${fixture.teacherA.token}`)
      .expect(200);
    expect((teacherASchedule.body as { entries: IdView[] }).entries).toEqual([
      expect.objectContaining({ id: fixture.scheduleAEntryKey }),
    ]);

    // teacherB has no externalTeacherId at all — a different reason, but still zero entries.
    const teacherBSchedule = await request(app.getHttpServer())
      .get(`/api/schedule/my${range}`)
      .set('Authorization', `Bearer ${fixture.teacherB.token}`)
      .expect(200);
    expect((teacherBSchedule.body as { entries: IdView[] }).entries).toEqual(
      [],
    );
  });

  it('limits dean user, course and schedule reads to the managed faculty', async () => {
    const fixture = await seedFixture();

    const userSearch = await request(app.getHttpServer())
      .get('/api/users/search?q=Scoped')
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(200);
    const visibleUserIds = (userSearch.body as IdView[]).map((user) => user.id);

    expect(visibleUserIds).toEqual(
      expect.arrayContaining([
        fixture.deanA.id.toHexString(),
        fixture.teacherA.id.toHexString(),
        fixture.enrolledStudent.id.toHexString(),
        fixture.sameGroupOutsider.id.toHexString(),
      ]),
    );
    expect(visibleUserIds).not.toContain(fixture.teacherB.id.toHexString());
    expect(visibleUserIds).not.toContain(
      fixture.foreignStudent.id.toHexString(),
    );

    await request(app.getHttpServer())
      .get(`/api/users/${fixture.foreignStudent.id.toHexString()}`)
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(404);

    const courses = await request(app.getHttpServer())
      .get('/api/courses')
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(200);
    expect((courses.body as PaginatedIdView).docs).toEqual([
      expect.objectContaining({ id: fixture.courseAId.toHexString() }),
    ]);

    await request(app.getHttpServer())
      .get('/api/courses/my')
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(403);

    // Bare GET /schedule no longer exists (spec 02 — removed campus-side schedule editing);
    // staff read the per-group cache via GET /schedule/groups/:groupCode, scoped by
    // AcademicAccessService.canAccessGroup (course.department in the dean's managed faculty).
    const scheduleGroupA = await request(app.getHttpServer())
      .get('/api/schedule/groups/ACCESS-A?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(200);
    expect((scheduleGroupA.body as { entries: IdView[] }).entries).toEqual([
      expect.objectContaining({ id: fixture.scheduleAEntryKey }),
    ]);

    await request(app.getHttpServer())
      .get('/api/schedule/groups/ACCESS-B?from=2026-09-01&to=2026-09-30')
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(403);
  });

  it('scopes /api/courses/my to the active student profile group', async () => {
    const groupAId = new Types.ObjectId();
    const groupBId = new Types.ObjectId();
    const courseAId = new Types.ObjectId();
    const courseBId = new Types.ObjectId();
    const assignmentAId = new Types.ObjectId();
    const assignmentBId = new Types.ObjectId();
    const termId = new Types.ObjectId();
    const departmentId = new Types.ObjectId();
    const teacher = await createActor(Role.TEACHER, 'multi-profile-teacher', {
      teacherProfile: { department: departmentId, position: 'Professor' },
    });

    const profileAId = new Types.ObjectId();
    const profileBId = new Types.ObjectId();
    const student = await createActor(Role.STUDENT, 'multi-profile', {
      studentProfiles: [
        {
          _id: profileAId,
          externalStudentId: 'MULTI-A',
          group: groupAId,
          recordBookNumber: 'MULTI-A',
          year: 1,
          status: 'active',
          syncedAt: new Date(),
        },
        {
          _id: profileBId,
          externalStudentId: 'MULTI-B',
          group: groupBId,
          recordBookNumber: 'MULTI-B',
          year: 1,
          status: 'active',
          syncedAt: new Date(),
        },
      ],
      activeStudentProfileId: profileAId,
    });

    await collection('Group').insertMany([
      {
        _id: groupAId,
        code: 'MULTI-A',
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: groupBId,
        code: 'MULTI-B',
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('Course').insertMany([
      {
        _id: courseAId,
        name: 'Multi Profile Course A',
        code: 'MULTI-CRS-A',
        department: departmentId,
        credits: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: courseBId,
        name: 'Multi Profile Course B',
        code: 'MULTI-CRS-B',
        department: departmentId,
        credits: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
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
    await collection('CourseAssignment').insertMany([
      {
        _id: assignmentAId,
        course: courseAId,
        group: groupAId,
        teacher: teacher.id,
        term: termId,
        source: CourseAssignmentSource.STANDARD,
        enrolledStudents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: assignmentBId,
        course: courseBId,
        group: groupBId,
        teacher: teacher.id,
        term: termId,
        source: CourseAssignmentSource.STANDARD,
        enrolledStudents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const assignments = await request(app.getHttpServer())
      .get('/api/courses/my')
      .set('Authorization', `Bearer ${student.token}`)
      .expect(200);

    expect((assignments.body as PaginatedIdView).docs).toEqual([
      expect.objectContaining({ id: assignmentAId.toHexString() }),
    ]);
  });
});
