import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { promises as fs } from 'fs';
import { Connection, Types } from 'mongoose';
import * as path from 'path';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { Role } from '../src/common/types/roles.enum';
import { CourseAssignmentSource } from '../src/courses/schemas';
import { ScheduleEntryType } from '../src/schedule/schemas';
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
  scheduleAId: Types.ObjectId;
  scheduleBId: Types.ObjectId;
  fileId: Types.ObjectId;
  storagePath: string;
};

type IdView = {
  id: string;
};

type PaginatedIdView = {
  docs: IdView[];
};

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
    const scheduleAId = new Types.ObjectId();
    const scheduleBId = new Types.ObjectId();
    const fileId = new Types.ObjectId();
    const storagePath = `academic-access-${fileId.toHexString()}.pdf`;

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
      },
    });
    const teacherB = await createActor(Role.TEACHER, 'teacher-b', {
      teacherProfile: {
        department: departmentBId,
        position: 'Professor',
      },
    });
    const enrolledStudent = await createActor(Role.STUDENT, 'enrolled', {
      studentProfile: {
        group: groupAId,
        recordBookNumber: 'ACCESS-001',
        year: 1,
      },
    });
    const sameGroupOutsider = await createActor(Role.STUDENT, 'outsider', {
      studentProfile: {
        group: groupAId,
        recordBookNumber: 'ACCESS-002',
        year: 1,
      },
    });
    const foreignStudent = await createActor(Role.STUDENT, 'foreign', {
      studentProfile: {
        group: groupBId,
        recordBookNumber: 'ACCESS-003',
        year: 1,
      },
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
        semester: 1,
        credits: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: courseBId,
        name: 'Scoped Course B',
        code: 'ACCESS-B',
        department: departmentBId,
        semester: 1,
        credits: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('CourseAssignment').insertMany([
      {
        _id: assignmentAId,
        course: courseAId,
        group: groupAId,
        teacher: teacherA.id,
        academicYear: '2026/2027',
        semester: 1,
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
        academicYear: '2026/2027',
        semester: 1,
        source: CourseAssignmentSource.STANDARD,
        enrolledStudents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('ScheduleEntry').insertMany([
      {
        _id: scheduleAId,
        courseAssignment: assignmentAId,
        classroom: null,
        date: new Date('2026-09-01T00:00:00.000Z'),
        startTime: '08:30',
        endTime: '10:00',
        type: ScheduleEntryType.LECTURE,
        status: 'scheduled',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: scheduleBId,
        courseAssignment: assignmentBId,
        classroom: null,
        date: new Date('2026-09-02T00:00:00.000Z'),
        startTime: '08:30',
        endTime: '10:00',
        type: ScheduleEntryType.LECTURE,
        status: 'scheduled',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    await collection('File').insertOne({
      _id: fileId,
      originalName: 'elective-material.pdf',
      storagePath,
      mimetype: 'application/pdf',
      size: 18,
      uploadedBy: teacherA.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await collection('Material').insertOne({
      _id: new Types.ObjectId(),
      courseAssignment: assignmentAId,
      title: 'Elective material',
      description: 'Restricted to enrolled students',
      category: 'lecture',
      files: [fileId],
      resourceLinks: [],
      publishDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const uploadPath = path.join(process.cwd(), 'uploads', storagePath);
    await fs.mkdir(path.dirname(uploadPath), { recursive: true });
    await fs.writeFile(uploadPath, Buffer.from('%PDF academic access'));
    createdFiles.add(uploadPath);

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
      scheduleAId,
      scheduleBId,
      fileId,
      storagePath,
    };
  };

  it('protects elective files and schedules from same-group non-enrolled students', async () => {
    const fixture = await seedFixture();

    const enrolledSchedule = await request(app.getHttpServer())
      .get('/api/schedule')
      .set('Authorization', `Bearer ${fixture.enrolledStudent.token}`)
      .expect(200);
    expect(enrolledSchedule.body).toEqual([
      expect.objectContaining({ id: fixture.scheduleAId.toHexString() }),
    ]);

    const outsiderSchedule = await request(app.getHttpServer())
      .get('/api/schedule')
      .set('Authorization', `Bearer ${fixture.sameGroupOutsider.token}`)
      .expect(200);
    expect(outsiderSchedule.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`/api/files/download/${fixture.fileId.toHexString()}`)
      .set('Authorization', `Bearer ${fixture.enrolledStudent.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/files/download/${fixture.fileId.toHexString()}`)
      .set('Authorization', `Bearer ${fixture.sameGroupOutsider.token}`)
      .expect(403);
  });

  it('notifies only the assigned teacher and enrolled elective students', async () => {
    const fixture = await seedFixture();

    await request(app.getHttpServer())
      .post('/api/schedule')
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({
        courseAssignmentId: fixture.assignmentAId.toHexString(),
        date: '2026-09-10',
        startTime: '10:15',
        endTime: '11:45',
        type: ScheduleEntryType.LECTURE,
      })
      .expect(201);

    const notifications = await collection('Notification')
      .find({ type: 'schedule_change' })
      .toArray();
    const recipients = (
      notifications as unknown as Array<{ userId: Types.ObjectId }>
    ).map((item) => item.userId.toHexString());

    expect(recipients).toEqual(
      expect.arrayContaining([
        fixture.teacherA.id.toHexString(),
        fixture.enrolledStudent.id.toHexString(),
      ]),
    );
    expect(recipients).not.toContain(
      fixture.sameGroupOutsider.id.toHexString(),
    );
    expect(recipients).not.toContain(fixture.foreignStudent.id.toHexString());
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

    const assignments = await request(app.getHttpServer())
      .get('/api/courses/my')
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(200);
    expect((assignments.body as PaginatedIdView).docs).toEqual([
      expect.objectContaining({ id: fixture.assignmentAId.toHexString() }),
    ]);

    const schedule = await request(app.getHttpServer())
      .get('/api/schedule')
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(200);
    expect(schedule.body).toEqual([
      expect.objectContaining({ id: fixture.scheduleAId.toHexString() }),
    ]);
    expect(schedule.body).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: fixture.scheduleBId.toHexString() }),
      ]),
    );
  });
});
