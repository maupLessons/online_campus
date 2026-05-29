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
import { ConfigService } from '@nestjs/config';
import { SeedService } from '../src/seed-data/seed.service';
import { PaginatedDto } from '../src/common/dto/paginated.dto';
import { AssignmentDto } from '../src/courses/assignments/dto';
import { SubmissionDto } from '../src/courses/submissions/dto';
import { describeWithDb } from './e2e-db';

const SET_UP_TIMEOUT = 60_000;

describeWithDb('Assignments (e2e)', () => {
  let app: INestApplication<App>;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;

  beforeAll(async () => {
    container = await new GenericContainer('mongo')
      .withExposedPorts(27017)
      .start();
  }, SET_UP_TIMEOUT);

  beforeEach(async () => {
    const mongoUri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/test-db`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SeedService)
      .useValue({ onModuleInit: jest.fn() })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'MONGODB_URI') return mongoUri;
          if (key === 'JWT_SECRET') return 'test-secret-key';
          return process.env[key];
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    connection = app.get(getConnectionToken());
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    if (connection) {
      await connection.collection('users').deleteMany({});
      await connection.collection('courseassignments').deleteMany({});
      await connection.collection('assignments').deleteMany({});
      await connection.collection('submissions').deleteMany({});
      await connection.collection('faculties').deleteMany({});
      await connection.collection('departments').deleteMany({});
      await connection.collection('groups').deleteMany({});
      await connection.collection('specialties').deleteMany({});
      await connection.collection('classrooms').deleteMany({});
      await connection.collection('courses').deleteMany({});
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

  const setupAssignments = async () => {
    const teacherId = new Types.ObjectId();
    const studentId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();

    const teacherToken = jwtService.sign({
      sub: teacherId.toHexString(),
      login: 'teacher_e2e_unique',
      role: Role.TEACHER,
    });

    const studentToken = jwtService.sign({
      sub: studentId.toHexString(),
      login: 'student_e2e_unique',
      role: Role.STUDENT,
    });

    // Seed necessary data
    await connection.collection('users').insertOne({
      _id: teacherId,
      login: 'teacher_e2e_unique',
      role: Role.TEACHER,
      status: 'active',
      passwordHash: 'hash',
      email: 'teacher_asgn_e2e@test.com',
      firstName: 'Teacher',
      lastName: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await connection.collection('users').insertOne({
      _id: studentId,
      login: 'student_e2e_unique',
      role: Role.STUDENT,
      studentProfile: {
        group: groupId,
        recordBookNumber: `E2E-ASGN-${studentId.toHexString().slice(-4)}`,
        year: 1,
      },
      status: 'active',
      passwordHash: 'hash',
      email: 'student_asgn_e2e@test.com',
      firstName: 'Student',
      lastName: 'Test',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await connection.collection('courseassignments').insertOne({
      _id: courseAssignmentId,
      teacher: teacherId,
      course: new Types.ObjectId(),
      group: groupId,
      academicYear: '2023-2024',
      semester: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      teacherId,
      studentId,
      groupId,
      courseAssignmentId,
      teacherToken,
      studentToken,
    };
  };

  describe('GET /courses/:courseAssignmentId/assignments', () => {
    it('should return assignments for course (200)', async () => {
      const { courseAssignmentId, teacherToken } = await setupAssignments();
      await request(app.getHttpServer())
        .get(`/courses/${courseAssignmentId.toHexString()}/assignments`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
    });

    it('should return assignments with submissions for student (200)', async () => {
      const { courseAssignmentId, studentId, studentToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'With Submission',
        description: 'Desc',
        dueDate: new Date(Date.now() + 86400000), // 1 day in future
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await connection.collection('submissions').insertOne({
        assignment: assignmentId,
        student: studentId,
        files: [],
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .get(`/courses/${courseAssignmentId.toHexString()}/assignments`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<AssignmentDto>;
      expect(body.docs).toBeDefined();
      expect(Array.isArray(body.docs)).toBe(true);
      const assignment = body.docs.find(
        (a: AssignmentDto) => a.id === assignmentId.toHexString(),
      );
      expect(assignment).toBeDefined();
      if (assignment) {
        expect(assignment.submission).toBeDefined();
        expect(assignment.submission?.status).toBe('submitted');
      }
    });
  });

  describe('GET /courses/assignments/:id', () => {
    it('should return a single assignment (200)', async () => {
      const { courseAssignmentId, teacherToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'Single Assignment',
        description: 'Desc',
        dueDate: new Date(Date.now() + 86400000), // 1 day in future
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .get(`/courses/assignments/${assignmentId.toHexString()}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      const body = response.body as AssignmentDto;
      expect(body.id).toBe(assignmentId.toHexString());
      expect(body.title).toBe('Single Assignment');
    });

    it('should return assignment with submission for student (200)', async () => {
      const { courseAssignmentId, studentId, studentToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'Single with Submission',
        description: 'Desc',
        dueDate: new Date(Date.now() + 86400000), // 1 day in future
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await connection.collection('submissions').insertOne({
        assignment: assignmentId,
        student: studentId,
        files: [],
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .get(`/courses/assignments/${assignmentId.toHexString()}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const body = response.body as AssignmentDto;
      expect(body.id).toBe(assignmentId.toHexString());
      expect(body.submission).toBeDefined();
      expect(body.submission?.status).toBe('submitted');
    });

    it('should return 404 for non-existent assignment', async () => {
      const { teacherToken } = await setupAssignments();
      await request(app.getHttpServer())
        .get(`/courses/assignments/${new Types.ObjectId().toHexString()}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(404);
    });
  });

  describe('POST /courses/:courseAssignmentId/assignments', () => {
    it('should create an assignment (201)', async () => {
      const { courseAssignmentId, teacherToken } = await setupAssignments();
      const response = await request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/assignments`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          title: 'E2E Assignment',
          description: 'E2E Description',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
          maxScore: 100,
          fileIds: [],
        })
        .expect(201);

      const body = response.body as AssignmentDto;
      expect(body.title).toBe('E2E Assignment');
      expect(body.id).toBeDefined();
    });

    it('should fail for student (403)', async () => {
      const { courseAssignmentId, studentToken } = await setupAssignments();
      await request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/assignments`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Forbidden' })
        .expect(403);
    });
  });

  describe('GET /courses/assignments/my', () => {
    it('should return student assignments (200)', async () => {
      const { courseAssignmentId, studentToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      // Create an assignment first
      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'My Assignment',
        description: 'Desc',
        dueDate: new Date(Date.now() + 86400000), // 1 day in future
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .get('/courses/assignments/my')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<AssignmentDto>;
      expect(body.docs).toBeDefined();
      expect(Array.isArray(body.docs)).toBe(true);
      const assignment = body.docs.find(
        (a: AssignmentDto) => a.title === 'My Assignment',
      );
      expect(assignment).toBeDefined();
      expect(assignment?.id).toBeDefined();
    });
  });

  describe('POST /courses/assignments/:id/submit', () => {
    it('should submit an assignment (201)', async () => {
      const { courseAssignmentId, studentToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'To Submit',
        description: 'Desc',
        dueDate: new Date(Date.now() + 3600000), // 1 hour in future
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post(`/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fileIds: [new Types.ObjectId().toHexString()],
        })
        .expect(201);

      const body = response.body as SubmissionDto;
      expect(body.status).toBe('submitted');
    });

    it('should fail if submitting twice (409)', async () => {
      const { courseAssignmentId, studentToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'Submit Twice',
        description: 'Desc',
        dueDate: new Date(Date.now() + 3600000),
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // First submission
      await request(app.getHttpServer())
        .post(`/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fileIds: [new Types.ObjectId().toHexString()],
        })
        .expect(201);

      // Second submission
      await request(app.getHttpServer())
        .post(`/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fileIds: [new Types.ObjectId().toHexString()],
        })
        .expect(409);
    });

    it('should fail if student is from another group (403)', async () => {
      const { courseAssignmentId, groupId } = await setupAssignments();
      const otherGroupId = new Types.ObjectId();
      const otherStudentId = new Types.ObjectId();

      await connection.collection('users').insertOne({
        _id: otherStudentId,
        login: 'other_student_unique',
        role: Role.STUDENT,
        studentProfile: {
          group: otherGroupId,
          recordBookNumber: 'E2E-OTHER-STUDENT',
          year: 1,
        },
        status: 'active',
        passwordHash: 'hash',
        email: 'other_asgn@test.com',
        firstName: 'Other',
        lastName: 'Student',
      });

      const otherStudentToken = jwtService.sign({
        sub: otherStudentId.toHexString(),
        login: 'other_student_unique',
        role: Role.STUDENT,
      });

      const assignmentId = new Types.ObjectId();
      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId, // Assignment for original group
        title: 'Wrong Group Submit',
        description: 'Desc',
        dueDate: new Date(Date.now() + 3600000),
        maxScore: 100,
        files: [],
      });

      await request(app.getHttpServer())
        .post(`/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({
          fileIds: [new Types.ObjectId().toHexString()],
        })
        .expect(403);
    });
  });

  describe('POST /courses/submissions/:id/grade', () => {
    it('should grade a submission (201)', async () => {
      const { courseAssignmentId, teacherToken, studentId, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      const submissionId = new Types.ObjectId();

      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'To Grade',
        description: 'Desc',
        dueDate: new Date(Date.now() + 86400000), // 1 day in future
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await connection.collection('submissions').insertOne({
        _id: submissionId,
        assignment: assignmentId,
        student: studentId,
        files: [],
        status: 'submitted',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post(`/courses/submissions/${submissionId.toHexString()}/grade`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          score: 95,
          comment: 'Good job',
        })
        .expect(201);

      const body = response.body as SubmissionDto;
      expect(body.status).toBe('graded');
      expect(body.score).toBe(95);
    });
  });
});
