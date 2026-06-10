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
import {
  GradeJournalResponseDto,
  GradeResponseDto,
} from '../src/courses/grades/dto';
import { StudentCourseResponseDto } from '../src/courses/courses/dto';
import { SeedService } from '../src/seed-data/seed.service';
import { configureApp } from '../src/app.config';

process.env.JWT_SECRET = 'test-secret-key-for-e2e-testing';

const SET_UP_TIMEOUT = 60_000;

describe('Grades (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;

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
      await connection.collection('grades').deleteMany({});
      await connection.collection('lessonjournalentries').deleteMany({});
      await connection.collection('notifications').deleteMany({});
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

  const setupGrades = async () => {
    const teacherId = new Types.ObjectId();
    const studentId = new Types.ObjectId();
    const groupId = new Types.ObjectId();
    const courseId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();

    const accessToken = jwtService.sign({
      sub: studentId.toHexString(),
      login: 'student_e2e',
      role: Role.STUDENT,
    });
    const teacherToken = jwtService.sign({
      sub: teacherId.toHexString(),
      login: 'teacher_e2e',
      role: Role.TEACHER,
    });

    await connection.collection('users').insertOne({
      _id: teacherId,
      login: 'teacher_e2e',
      role: Role.TEACHER,
      email: 'teacher_e2e@test.com',
      firstName: 'Test',
      lastName: 'Teacher',
      status: 'active',
      passwordHash: 'hash',
    });

    await connection.collection('users').insertOne({
      _id: studentId,
      login: 'student_e2e',
      role: Role.STUDENT,
      email: 'student_e2e@test.com',
      firstName: 'Test',
      lastName: 'Student',
      status: 'active',
      passwordHash: 'hash',
      studentProfile: {
        group: groupId,
        recordBookNumber: `TEST-${studentId.toHexString().slice(-4)}`,
        year: 1,
      },
    });

    await connection.collection('courses').insertOne({
      _id: courseId,
      name: 'Test Course',
      code: `TC-${courseId.toHexString().slice(-4)}`,
      department: new Types.ObjectId(),
      semester: 1,
      credits: 3,
    });

    await connection.collection('courseassignments').insertOne({
      _id: courseAssignmentId,
      course: courseId,
      teacher: teacherId,
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

    return {
      teacherId,
      studentId,
      groupId,
      courseId,
      courseAssignmentId,
      accessToken,
      teacherToken,
    };
  };

  describe('GET /courses/grades/my/courses', () => {
    it('should return paginated list of courses with grades (200)', async () => {
      const { accessToken, courseAssignmentId } = await setupGrades();
      const response = await request(app.getHttpServer())
        .get('/api/courses/grades/my/courses')
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<StudentCourseResponseDto>;
      expect(body.docs).toBeDefined();
      expect(body.docs.length).toBeGreaterThanOrEqual(1);

      const course = body.docs.find(
        (d: StudentCourseResponseDto) =>
          d.courseAssignmentId === courseAssignmentId.toHexString(),
      );
      expect(course).toBeDefined();
      expect(course?.courseName).toBe('Test Course');
    });
  });

  describe('GET /courses/grades/my/courses/:courseAssignmentId', () => {
    it('should return paginated grades for a specific course (200)', async () => {
      const { accessToken, courseAssignmentId } = await setupGrades();
      const response = await request(app.getHttpServer())
        .get(
          `/api/courses/grades/my/courses/${courseAssignmentId.toHexString()}`,
        )
        .query({ page: 1, limit: 10 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<GradeResponseDto>;
      expect(body.docs).toBeDefined();
      expect(body.docs.length).toBe(2);
      expect(body.docs[0].value).toBeDefined();
      expect(body.docs[0].courseName).toBe('Test Course');
    });

    it('should fail if unauthorized (401)', async () => {
      const { courseAssignmentId } = await setupGrades();
      return request(app.getHttpServer())
        .get(
          `/api/courses/grades/my/courses/${courseAssignmentId.toHexString()}`,
        )
        .expect(401);
    });
  });

  describe('GET /courses/:courseAssignmentId/grades/student/:studentId', () => {
    it('should allow student to see their own grades (200)', async () => {
      const { accessToken, courseAssignmentId, studentId } =
        await setupGrades();
      await request(app.getHttpServer())
        .get(
          `/api/courses/${courseAssignmentId.toHexString()}/grades/student/${studentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should allow teacher to see student grades (200)', async () => {
      const { courseAssignmentId, studentId, teacherToken } =
        await setupGrades();

      const response = await request(app.getHttpServer())
        .get(
          `/api/courses/${courseAssignmentId.toHexString()}/grades/student/${studentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<GradeResponseDto>;
      expect(body.docs.length).toBe(2);
    });

    it('should forbid student from seeing another student grades (403)', async () => {
      const { accessToken, courseAssignmentId } = await setupGrades();
      const otherStudentId = new Types.ObjectId();
      return request(app.getHttpServer())
        .get(
          `/api/courses/${courseAssignmentId.toHexString()}/grades/student/${otherStudentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });
  });

  describe('Elective course roster integrity', () => {
    it('uses only enrolled students across course, journal and grade flows', async () => {
      const { courseAssignmentId, groupId, studentId, teacherToken } =
        await setupGrades();
      const outsiderId = new Types.ObjectId();

      await connection.collection('users').insertOne({
        _id: outsiderId,
        login: 'elective_outsider',
        role: Role.STUDENT,
        email: 'elective_outsider@test.com',
        firstName: 'Other',
        lastName: 'Student',
        status: 'active',
        passwordHash: 'hash',
        studentProfile: {
          group: groupId,
          recordBookNumber: 'OUTSIDER-1',
          year: 1,
        },
      });
      await connection.collection('courseassignments').updateOne(
        { _id: courseAssignmentId },
        {
          $set: {
            source: 'elective',
            enrolledStudents: [studentId],
            finalizedAt: new Date(),
          },
        },
      );
      await connection.collection('grades').insertOne({
        student: outsiderId,
        courseAssignment: courseAssignmentId,
        date: new Date('2025-02-19'),
        type: 'current',
        value: 7,
        comment: 'Legacy invalid grade',
      });

      const studentsResponse = await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${courseAssignmentId.toHexString()}/students`,
        )
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
      const students = studentsResponse.body as Array<{ id: string }>;

      expect(students.map((student) => student.id)).toEqual([
        studentId.toHexString(),
      ]);

      const gradesResponse = await request(app.getHttpServer())
        .get(`/api/courses/${courseAssignmentId.toHexString()}/grades`)
        .query({ page: 1, limit: 100 })
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
      const gradeJournal =
        gradesResponse.body as PaginatedDto<GradeJournalResponseDto>;

      expect(gradeJournal.totalDocs).toBe(1);
      expect(gradeJournal.docs).toHaveLength(1);
      expect(gradeJournal.docs[0].studentId).toBe(studentId.toHexString());
      expect(
        gradeJournal.docs[0].grades.every(
          (grade) => grade.studentId === studentId.toHexString(),
        ),
      ).toBe(true);

      await request(app.getHttpServer())
        .post('/api/courses/grades')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          studentId: outsiderId.toHexString(),
          courseAssignmentId: courseAssignmentId.toHexString(),
          type: 'current',
          value: 10,
        })
        .expect(400);

      await request(app.getHttpServer())
        .get(
          `/api/courses/${courseAssignmentId.toHexString()}/grades/student/${outsiderId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(400);

      await request(app.getHttpServer())
        .post(`/api/courses/${courseAssignmentId.toHexString()}/journal`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          date: '2026-06-10',
          topic: 'Elective roster check',
          attendance: [
            {
              studentId: outsiderId.toHexString(),
              status: 'present',
            },
          ],
        })
        .expect(400);

      expect(
        await connection.collection('lessonjournalentries').countDocuments(),
      ).toBe(0);
    });

    it('never falls back to the whole group for an empty elective roster', async () => {
      const { courseAssignmentId, teacherToken } = await setupGrades();

      await connection.collection('courseassignments').updateOne(
        { _id: courseAssignmentId },
        {
          $set: {
            source: 'elective',
            enrolledStudents: [],
            finalizedAt: new Date(),
          },
        },
      );

      const studentsResponse = await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${courseAssignmentId.toHexString()}/students`,
        )
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
      expect(studentsResponse.body).toEqual([]);

      const gradesResponse = await request(app.getHttpServer())
        .get(`/api/courses/${courseAssignmentId.toHexString()}/grades`)
        .query({ page: 1, limit: 100 })
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
      const gradeJournal =
        gradesResponse.body as PaginatedDto<GradeJournalResponseDto>;

      expect(gradeJournal.totalDocs).toBe(0);
      expect(gradeJournal.docs).toEqual([]);
    });
  });

  describe('Grade CRUD (Teacher)', () => {
    it('should create a grade (201)', async () => {
      const { studentId, courseAssignmentId } = await setupGrades();
      const adminId = new Types.ObjectId();
      await connection.collection('users').insertOne({
        _id: adminId,
        login: 'admin_e2e',
        email: 'admin@test.com',
        role: Role.ADMIN,
        status: 'active',
        firstName: 'Admin',
        lastName: 'E2E',
        passwordHash: 'hash',
      });
      const adminToken = jwtService.sign({
        sub: adminId.toHexString(),
        login: 'admin_e2e',
        role: Role.ADMIN,
      });

      const response = await request(app.getHttpServer())
        .post('/api/courses/grades')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          studentId: studentId.toHexString(),
          courseAssignmentId: courseAssignmentId.toHexString(),
          type: 'current',
          value: 10,
          comment: 'New grade',
        })
        .expect(201);

      const body = response.body as GradeResponseDto;
      expect(body.value).toBe(10);
    });

    it('should update a grade (200)', async () => {
      const { studentId, courseAssignmentId } = await setupGrades();
      const gid = new Types.ObjectId();
      await connection.collection('grades').insertOne({
        _id: gid,
        student: studentId,
        courseAssignment: courseAssignmentId,
        type: 'current',
        value: 5,
        date: new Date(),
      });

      const adminId = new Types.ObjectId();
      await connection.collection('users').insertOne({
        _id: adminId,
        login: 'admin_e2e_update',
        email: 'admin_upd@test.com',
        role: Role.ADMIN,
        status: 'active',
        firstName: 'Admin',
        lastName: 'E2E',
        passwordHash: 'hash',
      });
      const adminToken = jwtService.sign({
        sub: adminId.toHexString(),
        login: 'admin_e2e_update',
        role: Role.ADMIN,
      });

      const response = await request(app.getHttpServer())
        .patch(`/api/courses/grades/${gid.toHexString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 12 })
        .expect(200);

      const body = response.body as GradeResponseDto;
      expect(body.value).toBe(12);
    });

    it('should not expose hard deletion for academic grades (404)', async () => {
      const { studentId, courseAssignmentId } = await setupGrades();
      const gid = new Types.ObjectId();
      await connection.collection('grades').insertOne({
        _id: gid,
        student: studentId,
        courseAssignment: courseAssignmentId,
        type: 'current',
        value: 5,
        date: new Date(),
      });

      const adminId = new Types.ObjectId();
      await connection.collection('users').insertOne({
        _id: adminId,
        login: 'admin_e2e_delete',
        email: 'admin_del@test.com',
        role: Role.ADMIN,
        status: 'active',
        firstName: 'Admin',
        lastName: 'E2E',
        passwordHash: 'hash',
      });
      const adminToken = jwtService.sign({
        sub: adminId.toHexString(),
        login: 'admin_e2e_delete',
        role: Role.ADMIN,
      });

      await request(app.getHttpServer())
        .delete(`/api/courses/grades/${gid.toHexString()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      const preserved = await connection
        .collection('grades')
        .findOne({ _id: gid });
      expect(preserved).toBeTruthy();
    });
  });
});
