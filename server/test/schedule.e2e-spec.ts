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
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const TEST_JWT_SECRET = 'schedule-e2e-jwt-secret-with-sufficient-entropy';
const TEST_CSRF_SECRET = 'schedule-e2e-csrf-secret-with-sufficient-entropy';

type Actor = {
  id: Types.ObjectId;
  login: string;
  token: string;
};

type ScheduleFixture = {
  admin: Actor;
  teacher: Actor;
  student: Actor;
  courseAssignmentId: string;
  classroomId: string;
  secondClassroomId: string;
};

type ScheduleResponse = {
  id: string;
  courseAssignmentId?: string;
  groupCode?: string;
  status?: string;
  changeReason?: string;
};

type BulkScheduleResponse = {
  dryRun: boolean;
  created: number;
  skipped: number;
  items: unknown[];
};

function responseBody<T>(response: SuperAgentResponse): T {
  const body: unknown = response.body;
  return body as T;
}

describe('Schedule workflows (e2e)', () => {
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
    )}/schedule-e2e`;
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

  const seedFixture = async (): Promise<ScheduleFixture> => {
    const specialtyId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    const departmentId = new Types.ObjectId();
    const admin = await createActor(Role.ADMIN, 'admin');
    const teacher = await createActor(Role.TEACHER, 'teacher', {
      teacherProfile: {
        department: departmentId,
        position: 'Professor',
      },
    });
    const student = await createActor(Role.STUDENT, 'student', {
      studentProfile: {
        group: groupId,
        recordBookNumber: 'SCH-001',
        year: 1,
      },
    });
    const courseId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();
    const classroomId = new Types.ObjectId();
    const secondClassroomId = new Types.ObjectId();

    await Promise.all([
      collection('Specialty').insertOne({
        _id: specialtyId,
        code: '121',
        name: 'Computer Science',
      }),
      collection('Group').insertOne({
        _id: groupId,
        code: 'SCH-11',
        specialty: specialtyId,
        course: 1,
      }),
      collection('Course').insertOne({
        _id: courseId,
        name: 'Schedule Engineering',
        code: 'SCH-101',
        department: departmentId,
        semester: 1,
        credits: 4,
      }),
      collection('Classroom').insertMany([
        {
          _id: classroomId,
          building: 'Campus',
          roomNumber: '101',
          capacity: 30,
          type: 'lecture',
        },
        {
          _id: secondClassroomId,
          building: 'Campus',
          roomNumber: '102',
          capacity: 30,
          type: 'seminar',
        },
      ]),
    ]);
    await collection('CourseAssignment').insertOne({
      _id: courseAssignmentId,
      course: courseId,
      group: groupId,
      teacher: teacher.id,
      academicYear: '2026-2027',
      semester: 1,
      source: 'standard',
      enrolledStudents: [],
    });

    return {
      admin,
      teacher,
      student,
      courseAssignmentId: courseAssignmentId.toHexString(),
      classroomId: classroomId.toHexString(),
      secondClassroomId: secondClassroomId.toHexString(),
    };
  };

  const entryPayload = (fixture: ScheduleFixture) => ({
    courseAssignmentId: fixture.courseAssignmentId,
    classroomId: fixture.classroomId,
    date: '2026-09-07',
    startTime: '08:30',
    endTime: '10:05',
    type: 'lecture',
    status: 'scheduled',
  });

  it('enforces administrator-only mutation RBAC and student visibility', async () => {
    const fixture = await seedFixture();
    await request(app.getHttpServer())
      .post('/api/schedule')
      .auth(fixture.teacher.token, { type: 'bearer' })
      .send(entryPayload(fixture))
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/schedule')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send(entryPayload(fixture))
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/schedule/my')
      .auth(fixture.student.token, { type: 'bearer' })
      .expect(200)
      .expect((scheduleResponse) => {
        const body = responseBody<ScheduleResponse[]>(scheduleResponse);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          courseAssignmentId: fixture.courseAssignmentId,
          groupCode: 'SCH-11',
        });
      });
  });

  it('rejects group, teacher, and classroom overlaps with structured conflicts', async () => {
    const fixture = await seedFixture();
    await request(app.getHttpServer())
      .post('/api/schedule')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send(entryPayload(fixture))
      .expect(201);

    const conflict = await request(app.getHttpServer())
      .post('/api/schedule')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send({
        ...entryPayload(fixture),
        classroomId: fixture.secondClassroomId,
        startTime: '09:00',
        endTime: '10:30',
      })
      .expect(409);

    const conflictBody = responseBody<{
      message: string;
      conflicts: Array<{ type: string }>;
    }>(conflict);
    expect(conflictBody.message).toBe('Конфлікт розкладу');
    expect(conflictBody.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'teacher' }),
        expect.objectContaining({ type: 'group' }),
      ]),
    );
  });

  it('releases a cancelled slot and notifies the affected academic scope', async () => {
    const fixture = await seedFixture();
    const created = await request(app.getHttpServer())
      .post('/api/schedule')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send(entryPayload(fixture))
      .expect(201);

    const createdBody = responseBody<ScheduleResponse>(created);
    await request(app.getHttpServer())
      .post(`/api/schedule/${createdBody.id}/cancel`)
      .auth(fixture.admin.token, { type: 'bearer' })
      .send({ reason: 'Lecturer is unavailable' })
      .expect(201)
      .expect((cancelResponse) => {
        const body = responseBody<ScheduleResponse>(cancelResponse);
        expect(body.status).toBe('cancelled');
        expect(body.changeReason).toBe('Lecturer is unavailable');
      });

    await request(app.getHttpServer())
      .post('/api/schedule')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send(entryPayload(fixture))
      .expect(201);

    const notifications = await collection('Notification')
      .find({ userId: fixture.student.id })
      .toArray();
    expect(notifications.length).toBeGreaterThanOrEqual(2);
    expect(notifications.some((item) => item.important === true)).toBe(true);
  });

  it('supports dry-run and idempotent conflict skipping when applying templates', async () => {
    const fixture = await seedFixture();
    const template = await request(app.getHttpServer())
      .post('/api/schedule/templates')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send({
        title: 'SCH-11 Monday lecture',
        courseAssignmentId: fixture.courseAssignmentId,
        classroomId: fixture.classroomId,
        dayOfWeek: 1,
        startTime: '08:30',
        endTime: '10:05',
        type: 'lecture',
      })
      .expect(201);

    const range = {
      startDate: '2026-09-14',
      endDate: '2026-09-28',
    };
    const templateBody = responseBody<{ id: string }>(template);
    const dryRun = await request(app.getHttpServer())
      .post(`/api/schedule/templates/${templateBody.id}/apply`)
      .auth(fixture.admin.token, { type: 'bearer' })
      .send({ ...range, dryRun: true })
      .expect(201);
    const dryRunBody = responseBody<BulkScheduleResponse>(dryRun);
    expect(dryRunBody).toMatchObject({ dryRun: true, created: 0, skipped: 0 });
    expect(dryRunBody.items).toHaveLength(3);
    expect(await collection('ScheduleEntry').countDocuments()).toBe(0);

    const applied = await request(app.getHttpServer())
      .post(`/api/schedule/templates/${templateBody.id}/apply`)
      .auth(fixture.admin.token, { type: 'bearer' })
      .send(range)
      .expect(201);
    expect(responseBody<BulkScheduleResponse>(applied)).toMatchObject({
      dryRun: false,
      created: 3,
      skipped: 0,
    });

    const repeated = await request(app.getHttpServer())
      .post(`/api/schedule/templates/${templateBody.id}/apply`)
      .auth(fixture.admin.token, { type: 'bearer' })
      .send(range)
      .expect(201);
    expect(responseBody<BulkScheduleResponse>(repeated)).toMatchObject({
      dryRun: false,
      created: 0,
      skipped: 3,
    });
    expect(await collection('ScheduleEntry').countDocuments()).toBe(3);
  });
});
