import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/common/types/roles.enum';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PaginatedDto } from '../src/common/dto/paginated.dto';
import { GradeResponseDto, StudentCourseResponseDto } from '../src/courses/dto';
import { SeedService } from '../src/seed/seed.service';

process.env.JWT_SECRET = 'test-secret-key-for-e2e-testing';

const SET_UP_TIMEOUT = 60_000;

describe('Grades (e2e)', () => {
  let app: INestApplication<App>;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;

  let studentId: Types.ObjectId;
  let groupId: Types.ObjectId;
  let courseId: Types.ObjectId;
  let courseAssignmentId: Types.ObjectId;
  let accessToken: string;

  beforeAll(async () => {
    container = await new GenericContainer('mongo')
      .withExposedPorts(27017)
      .start();

    process.env.MONGODB_URI = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/test-db`;
  }, SET_UP_TIMEOUT);

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SeedService)
      .useValue({ onModuleInit: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    connection = app.get(getConnectionToken());
    jwtService = app.get(JwtService);

    studentId = new Types.ObjectId();
    groupId = new Types.ObjectId();
    courseId = new Types.ObjectId();
    courseAssignmentId = new Types.ObjectId();

    accessToken = jwtService.sign({
      sub: studentId.toHexString(),
      login: 'student_e2e',
      role: Role.STUDENT,
    });

    // Seed data
    await connection.collection('users').insertOne({
      _id: studentId,
      login: 'student_e2e',
      role: Role.STUDENT,
      email: 'student_e2e@test.com',
      firstName: 'Test',
      lastName: 'Student',
      studentProfile: {
        group: groupId,
        recordBookNumber: 'TEST-001',
        year: 1,
      },
    });

    await connection.collection('courses').insertOne({
      _id: courseId,
      name: 'Test Course',
      code: 'TC101',
      department: new Types.ObjectId(),
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

    await connection.collection('grades').insertMany([
      {
        student: studentId,
        courseAssignment: courseAssignmentId,
        date: new Date('2025-02-17'),
        type: 'current',
        value: 9,
        comment: 'Good job',
      },
      {
        student: studentId,
        courseAssignment: courseAssignmentId,
        date: new Date('2025-02-18'),
        type: 'current',
        value: 8,
      },
    ]);
  });

  afterEach(async () => {
    await connection.collection('users').deleteMany({});
    await connection.collection('courses').deleteMany({});
    await connection.collection('courseassignments').deleteMany({});
    await connection.collection('grades').deleteMany({});
    await app.close();
  });

  afterAll(async () => {
    await container.stop();
  });

  describe('GET /courses/grades/my/courses', () => {
    it('should return paginated list of courses with grades (200)', async () => {
      const response = await request(app.getHttpServer())
        .get('/courses/grades/my/courses')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<any>;
      expect(body.docs).toBeDefined();
      expect(body.docs.length).toBeGreaterThanOrEqual(1);
      
      const course = body.docs.find(d => d.courseName === 'Test Course');
      expect(course).toBeDefined();
    });
  });

  describe('GET /courses/grades/my/courses/:courseAssignmentId', () => {
    it('should return paginated grades for a specific course (200)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/courses/grades/my/courses/${courseAssignmentId.toHexString()}`)
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<GradeResponseDto>;
      expect(body.docs).toBeDefined();
      expect(body.docs.length).toBe(2);
      expect(body.docs[0].value).toBeDefined();
      expect(body.docs[0].courseName).toBe('Test Course');
    });

    it('should fail if unauthorized (401)', () => {
      return request(app.getHttpServer())
        .get(`/courses/grades/my/courses/${courseAssignmentId.toHexString()}`)
        .expect(401);
    });
  });

  describe('GET /courses/:courseAssignmentId/grades/student/:studentId', () => {
    it('should allow student to see their own grades (200)', async () => {
      await request(app.getHttpServer())
        .get(`/courses/${courseAssignmentId.toHexString()}/grades/student/${studentId.toHexString()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should allow teacher to see student grades (200)', async () => {
      const teacherToken = jwtService.sign({
        sub: new Types.ObjectId().toHexString(),
        login: 'teacher_e2e',
        role: Role.TEACHER,
      });

      const response = await request(app.getHttpServer())
        .get(`/courses/${courseAssignmentId.toHexString()}/grades/student/${studentId.toHexString()}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      expect(response.body.docs.length).toBe(2);
    });

    it('should forbid student from seeing another student grades (403)', async () => {
      const otherStudentId = new Types.ObjectId();
      return request(app.getHttpServer())
        .get(`/courses/${courseAssignmentId.toHexString()}/grades/student/${otherStudentId.toHexString()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  describe('Grade CRUD (Teacher)', () => {
    let teacherToken: string;
    let gradeId: string;

    beforeEach(() => {
      teacherToken = jwtService.sign({
        sub: new Types.ObjectId().toHexString(), // We'll mock teacher ownership later
        login: 'teacher_crud_e2e',
        role: Role.TEACHER,
      });
    });

    it('should create a grade (201)', async () => {
      // Need to use the same teacher as in seeded courseAssignment or admin
      const adminToken = jwtService.sign({
        sub: new Types.ObjectId().toHexString(),
        login: 'admin_e2e',
        role: Role.ADMIN,
      });

      const response = await request(app.getHttpServer())
        .post('/courses/grades')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: studentId.toHexString(),
          courseAssignmentId: courseAssignmentId.toHexString(),
          type: 'current',
          value: 10,
          comment: 'New grade',
        })
        .expect(201);

      expect(response.body.value).toBe(10);
      gradeId = response.body.id;
    });

    it('should update a grade (200)', async () => {
      // Seed a grade first
      const gid = new Types.ObjectId();
      await connection.collection('grades').insertOne({
        _id: gid,
        student: studentId,
        courseAssignment: courseAssignmentId,
        type: 'current',
        value: 5,
        date: new Date(),
      });

      const adminToken = jwtService.sign({
        sub: new Types.ObjectId().toHexString(),
        login: 'admin_e2e',
        role: Role.ADMIN,
      });

      const response = await request(app.getHttpServer())
        .patch(`/courses/grades/${gid.toHexString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 12 })
        .expect(200);

      expect(response.body.value).toBe(12);
    });

    it('should delete a grade (200)', async () => {
      const gid = new Types.ObjectId();
      await connection.collection('grades').insertOne({
        _id: gid,
        student: studentId,
        courseAssignment: courseAssignmentId,
        type: 'current',
        value: 5,
        date: new Date(),
      });

      const adminToken = jwtService.sign({
        sub: new Types.ObjectId().toHexString(),
        login: 'admin_e2e',
        role: Role.ADMIN,
      });

      await request(app.getHttpServer())
        .delete(`/courses/grades/${gid.toHexString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const deleted = await connection.collection('grades').findOne({ _id: gid });
      expect(deleted).toBeNull();
    });
  });
});
