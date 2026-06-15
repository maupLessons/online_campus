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
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const JWT_SECRET = 'reports-e2e-jwt-secret-with-sufficient-entropy';
const CSRF_SECRET = 'reports-e2e-csrf-secret-with-sufficient-entropy';

type Actor = {
  id: Types.ObjectId;
  token: string;
};

type ReportBody = {
  scope: { assignmentCount: number };
  summary: {
    averageGrade: number | null;
    attendanceRate: number | null;
  };
};

type CourseBreakdownBody = {
  docs: Array<{
    courseName: string;
    averageGrade: number | null;
    attendanceRate: number | null;
  }>;
  totalDocs: number;
  page: number;
  totalPages: number;
};

describe('Reports (e2e)', () => {
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

    const testConfig = new ConfigService({
      MONGODB_URI: `mongodb://${container.getHost()}:${container.getMappedPort(
        27017,
      )}/reports-e2e`,
      JWT_SECRET,
      AUTH_CSRF_SECRET: CSRF_SECRET,
      AUDIT_TRANSACTIONAL_OUTBOX: 'false',
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
    const login = `${role}_${suffix}`;
    await collection('User').insertOne({
      _id: id,
      login,
      passwordHash: 'not-used',
      role,
      email: `${login}@example.test`,
      firstName: 'Report',
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

  const seedFixture = async () => {
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

    const head = await createActor(Role.DEPARTMENT_HEAD, 'head');
    const dean = await createActor(Role.DEAN, 'dean');
    const rector = await createActor(Role.RECTOR, 'rector');
    const dispatcher = await createActor(Role.DISPATCHER, 'dispatcher');
    const student = await createActor(Role.STUDENT, 'student', {
      studentProfile: {
        group: groupAId,
        recordBookNumber: 'REPORT-001',
        year: 2,
      },
    });
    const foreignStudent = await createActor(Role.STUDENT, 'foreign', {
      studentProfile: {
        group: groupBId,
        recordBookNumber: 'REPORT-002',
        year: 2,
      },
    });
    const teacher = await createActor(Role.TEACHER, 'teacher');

    await collection('Faculty').insertMany([
      {
        _id: facultyAId,
        name: 'Faculty A',
        dean: dean.id,
      },
      {
        _id: facultyBId,
        name: 'Faculty B',
      },
    ]);
    await collection('Department').insertMany([
      {
        _id: departmentAId,
        name: 'Department A',
        faculty: facultyAId,
        head: head.id,
      },
      {
        _id: departmentBId,
        name: 'Department B',
        faculty: facultyBId,
      },
    ]);
    await collection('Group').insertMany([
      {
        _id: groupAId,
        code: 'A-21',
        specialty: new Types.ObjectId(),
        course: 2,
      },
      {
        _id: groupBId,
        code: 'B-21',
        specialty: new Types.ObjectId(),
        course: 2,
      },
    ]);
    await collection('Course').insertMany([
      {
        _id: courseAId,
        name: 'Scoped Analytics',
        code: 'SA-101',
        department: departmentAId,
        semester: 1,
        credits: 4,
      },
      {
        _id: courseBId,
        name: 'Foreign Analytics',
        code: 'FA-101',
        department: departmentBId,
        semester: 1,
        credits: 4,
      },
    ]);
    await collection('CourseAssignment').insertMany([
      {
        _id: assignmentAId,
        course: courseAId,
        group: groupAId,
        teacher: teacher.id,
        academicYear: '2025-2026',
        semester: 1,
        source: 'standard',
        enrolledStudents: [],
      },
      {
        _id: assignmentBId,
        course: courseBId,
        group: groupBId,
        teacher: teacher.id,
        academicYear: '2025/2026',
        semester: 1,
        source: 'standard',
        enrolledStudents: [],
      },
    ]);
    await collection('Grade').insertMany([
      {
        student: student.id,
        courseAssignment: assignmentAId,
        date: new Date('2025-10-01T00:00:00.000Z'),
        type: 'current',
        value: 80,
        status: 'active',
      },
      {
        student: foreignStudent.id,
        courseAssignment: assignmentBId,
        date: new Date('2025-10-01T00:00:00.000Z'),
        type: 'current',
        value: 40,
        status: 'active',
      },
    ]);
    await collection('LessonJournalEntry').insertMany([
      {
        courseAssignment: assignmentAId,
        teacher: teacher.id,
        date: new Date('2025-10-01T00:00:00.000Z'),
        topic: 'Scoped lesson',
        attendance: [{ student: student.id, status: 'present', comment: '' }],
      },
      {
        courseAssignment: assignmentBId,
        teacher: teacher.id,
        date: new Date('2025-10-01T00:00:00.000Z'),
        topic: 'Foreign lesson',
        attendance: [
          { student: foreignStudent.id, status: 'present', comment: '' },
        ],
      },
    ]);

    return {
      head,
      dean,
      rector,
      dispatcher,
      student,
      teacher,
      departmentBId,
    };
  };

  it('enforces role and academic scope without exposing student identities', async () => {
    const fixture = await seedFixture();

    const headReport = await request(app.getHttpServer())
      .get('/api/reports/overview')
      .set('Authorization', `Bearer ${fixture.head.token}`)
      .expect(200);
    const headBody = headReport.body as unknown as ReportBody;
    expect(headReport.headers['cache-control']).toBe('private, no-store');
    expect(headReport.headers.vary).toContain('Cookie');
    expect(headBody.scope.assignmentCount).toBe(1);
    expect(headBody.summary.averageGrade).toBe(80);
    expect(headBody.summary.attendanceRate).toBe(100);
    expect(JSON.stringify(headBody)).not.toContain(
      fixture.student.id.toHexString(),
    );

    const headCourses = await request(app.getHttpServer())
      .get('/api/reports/courses?page=1&limit=10')
      .set('Authorization', `Bearer ${fixture.head.token}`)
      .expect(200);
    const headCoursesBody = headCourses.body as unknown as CourseBreakdownBody;
    expect(headCoursesBody).toMatchObject({
      totalDocs: 1,
      page: 1,
      totalPages: 1,
    });
    expect(headCoursesBody.docs[0]).toMatchObject({
      courseName: 'Scoped Analytics',
      averageGrade: 80,
      attendanceRate: 100,
    });

    const deanReport = await request(app.getHttpServer())
      .get('/api/reports/overview')
      .set('Authorization', `Bearer ${fixture.dean.token}`)
      .expect(200);
    const deanBody = deanReport.body as unknown as ReportBody;
    expect(deanBody.scope.assignmentCount).toBe(1);

    const rectorReport = await request(app.getHttpServer())
      .get('/api/reports/overview')
      .set('Authorization', `Bearer ${fixture.rector.token}`)
      .expect(200);
    const rectorBody = rectorReport.body as unknown as ReportBody;
    expect(rectorBody.scope.assignmentCount).toBe(2);
    expect(rectorBody.summary.averageGrade).toBe(60);

    await request(app.getHttpServer())
      .get('/api/reports/overview')
      .set('Authorization', `Bearer ${fixture.student.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/reports/overview')
      .set('Authorization', `Bearer ${fixture.teacher.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/reports/overview')
      .set('Authorization', `Bearer ${fixture.dispatcher.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(
        `/api/reports/overview?departmentId=${fixture.departmentBId.toHexString()}`,
      )
      .set('Authorization', `Bearer ${fixture.head.token}`)
      .expect(403);

    const legacyYear = await request(app.getHttpServer())
      .get('/api/reports/overview?academicYear=2025-2026')
      .set('Authorization', `Bearer ${fixture.rector.token}`)
      .expect(200);
    expect((legacyYear.body as ReportBody).scope.assignmentCount).toBe(2);

    await request(app.getHttpServer())
      .get('/api/reports/overview?academicYear=2025_2026')
      .set('Authorization', `Bearer ${fixture.rector.token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/api/reports/overview?from=2024-01-01&to=2025-12-31')
      .set('Authorization', `Bearer ${fixture.rector.token}`)
      .expect(400);
  });

  it('exports only aggregate rows from the authorized scope', async () => {
    const fixture = await seedFixture();

    const response = await request(app.getHttpServer())
      .get('/api/reports/export?format=csv&locale=en')
      .set('Authorization', `Bearer ${fixture.head.token}`)
      .expect(200);

    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.text).toContain('Scoped Analytics');
    expect(response.text).not.toContain('Foreign Analytics');
    expect(response.text).not.toContain(fixture.student.id.toHexString());

    const xlsxResponse = await request(app.getHttpServer())
      .get('/api/reports/export?format=xlsx&locale=uk')
      .set('Authorization', `Bearer ${fixture.head.token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(xlsxResponse.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect((xlsxResponse.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
});
