import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/common/types/roles.enum';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PaginatedDto } from '../src/common/dto/paginated.dto';
import { CourseAssignmentDto, CourseDto } from '../src/courses/courses/dto';
import { SeedService } from '../src/seed-data/seed.service';
import { configureApp } from '../src/app.config';

const SET_UP_TIMEOUT = 60_000;

describe('Courses (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;

  beforeAll(async () => {
    container = await new GenericContainer('mongo')
      .withExposedPorts(27017)
      .start();

    process.env.MONGODB_URI = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/test-db`;
    process.env.JWT_SECRET = 'test-secret-key-for-e2e';
  }, SET_UP_TIMEOUT);

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SeedService)
      .useValue({ onModuleInit: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, { swaggerEnabled: false });
    await app.init();

    connection = app.get(getConnectionToken());
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    if (connection) {
      await connection.collection('users').deleteMany({});
      await connection.collection('courses').deleteMany({});
      await connection.collection('courseassignments').deleteMany({});
      await connection.collection('departments').deleteMany({});
    }
    if (app) {
      await app.close();
    }
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  const setupData = async () => {
    const studentId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    const courseId = new Types.ObjectId();
    const deptId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();

    const accessToken = jwtService.sign({
      sub: studentId.toHexString(),
      login: 'student_e2e',
      role: Role.STUDENT,
    });

    await connection.collection('departments').insertOne({
      _id: deptId,
      name: 'Test Dept',
    });

    await connection.collection('users').insertOne({
      _id: studentId,
      login: 'student_e2e',
      role: Role.STUDENT,
      email: 'student_e2e@example.com',
      firstName: 'Student',
      lastName: 'E2E',
      status: 'active',
      passwordHash: 'hash',
      studentProfile: {
        group: groupId,
      },
    });

    await connection.collection('courses').insertOne({
      _id: courseId,
      name: 'Test Course',
      code: 'TC001',
      department: deptId,
      semester: 1,
      credits: 3,
    });

    await connection.collection('courseassignments').insertOne({
      _id: courseAssignmentId,
      course: courseId,
      teacher: new Types.ObjectId(),
      group: groupId,
      academicYear: '2023-2024',
      semester: 1,
    });

    return {
      studentId,
      groupId,
      courseId,
      courseAssignmentId,
      accessToken,
    };
  };

  describe('GET /courses', () => {
    it('should return paginated courses (200)', async () => {
      const { accessToken } = await setupData();
      const response = await request(app.getHttpServer())
        .get('/api/courses')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      const body = response.body as PaginatedDto<CourseDto>;
      expect(body.docs).toBeDefined();
      expect(body.docs.length).toBeGreaterThanOrEqual(1);
      expect(body.docs[0].name).toBe('Test Course');
      expect(body.totalDocs).toBe(1);
    });
  });

  describe('GET /courses/my', () => {
    it('should return paginated student courses (200)', async () => {
      const { accessToken } = await setupData();
      const response = await request(app.getHttpServer())
        .get('/api/courses/my')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 10 })
        .expect(200);

      const body = response.body as PaginatedDto<CourseAssignmentDto>;
      expect(body.docs).toBeDefined();
      expect(body.docs.length).toBeGreaterThanOrEqual(1);
      expect(body.docs[0].courseName).toBe('Test Course');
      expect(body.totalDocs).toBe(1);
    });
  });

  describe('GET /courses/:id', () => {
    it('should return course by id (200)', async () => {
      const { accessToken, courseId } = await setupData();
      const response = await request(app.getHttpServer())
        .get(`/api/courses/${courseId.toHexString()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as CourseDto;
      expect(body.id).toBe(courseId.toHexString());
      expect(body.name).toBe('Test Course');
    });

    it('should return 404 if course not found', async () => {
      const { accessToken } = await setupData();
      const fakeId = new Types.ObjectId().toHexString();
      await request(app.getHttpServer())
        .get(`/api/courses/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /courses/course-assignments/:id', () => {
    it('should return course assignment details (200)', async () => {
      const { accessToken, courseAssignmentId } = await setupData();
      const response = await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${courseAssignmentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as CourseAssignmentDto;
      expect(body.id).toBe(courseAssignmentId.toHexString());
      expect(body.courseName).toBe('Test Course');
    });

    it('should reject a course assignment from another group (403)', async () => {
      const { accessToken, courseId } = await setupData();
      const foreignCourseAssignmentId = new Types.ObjectId();

      await connection.collection('courseassignments').insertOne({
        _id: foreignCourseAssignmentId,
        course: courseId,
        teacher: new Types.ObjectId(),
        group: new Types.ObjectId(),
        academicYear: '2023-2024',
        semester: 1,
      });

      await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${foreignCourseAssignmentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('should reject an elective course without enrollment (403)', async () => {
      const { accessToken, groupId } = await setupData();
      const electiveCourseAssignmentId = new Types.ObjectId();

      await connection.collection('courseassignments').insertOne({
        _id: electiveCourseAssignmentId,
        course: new Types.ObjectId(),
        teacher: new Types.ObjectId(),
        group: groupId,
        academicYear: '2024-2025',
        semester: 2,
        source: 'elective',
        enrolledStudents: [new Types.ObjectId()],
      });

      await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${electiveCourseAssignmentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });
});
