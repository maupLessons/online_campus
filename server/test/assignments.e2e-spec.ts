import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/common/types/roles.enum';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { SeedService } from '../src/seed-data/seed.service';
import { PaginatedDto } from '../src/common/dto/paginated.dto';
import { AssignmentDto } from '../src/courses/assignments/dto';
import { SubmissionDto } from '../src/courses/submissions/dto';
import { configureApp } from '../src/app.config';

const SET_UP_TIMEOUT = 60_000;

describe('Assignments (e2e)', () => {
  let app: NestExpressApplication;
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

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, { swaggerEnabled: false });
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
      await connection.collection('grades').deleteMany({});
      await connection.collection('notifications').deleteMany({});
      await connection.collection('files').deleteMany({});
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
    const departmentId = new Types.ObjectId();
    const courseId = new Types.ObjectId();
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

    await connection.collection('courses').insertOne({
      _id: courseId,
      name: 'Enterprise Testing',
      code: `ET-${courseAssignmentId.toHexString().slice(-6)}`,
      department: departmentId,
      semester: 1,
      credits: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await connection.collection('courseassignments').insertOne({
      _id: courseAssignmentId,
      teacher: teacherId,
      course: courseId,
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
      courseId,
      courseAssignmentId,
      teacherToken,
      studentToken,
    };
  };

  const createUploadedFile = async (uploadedBy: Types.ObjectId) => {
    const fileId = new Types.ObjectId();
    await connection.collection('files').insertOne({
      _id: fileId,
      originalName: 'submission.pdf',
      storagePath: `${fileId.toHexString()}.pdf`,
      mimetype: 'application/pdf',
      size: 1024,
      uploadedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return fileId;
  };

  describe('GET /courses/:courseAssignmentId/assignments', () => {
    it('should return assignments for course (200)', async () => {
      const { courseAssignmentId, teacherToken } = await setupAssignments();
      await request(app.getHttpServer())
        .get(`/api/courses/${courseAssignmentId.toHexString()}/assignments`)
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
        .get(`/api/courses/${courseAssignmentId.toHexString()}/assignments`)
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

    it('should reject assignments from another group (403)', async () => {
      const { teacherId, studentToken } = await setupAssignments();
      const foreignCourseAssignmentId = new Types.ObjectId();

      await connection.collection('courseassignments').insertOne({
        _id: foreignCourseAssignmentId,
        teacher: teacherId,
        course: new Types.ObjectId(),
        group: new Types.ObjectId(),
        academicYear: '2025-2026',
        semester: 1,
      });

      await request(app.getHttpServer())
        .get(
          `/api/courses/${foreignCourseAssignmentId.toHexString()}/assignments`,
        )
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should reject assignments from an unselected elective (403)', async () => {
      const { teacherId, studentToken, groupId } = await setupAssignments();
      const electiveCourseAssignmentId = new Types.ObjectId();

      await connection.collection('courseassignments').insertOne({
        _id: electiveCourseAssignmentId,
        teacher: teacherId,
        course: new Types.ObjectId(),
        group: groupId,
        academicYear: '2025-2026',
        semester: 2,
        source: 'elective',
        enrolledStudents: [new Types.ObjectId()],
      });

      await request(app.getHttpServer())
        .get(
          `/api/courses/${electiveCourseAssignmentId.toHexString()}/assignments`,
        )
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
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
        .get(`/api/courses/assignments/${assignmentId.toHexString()}`)
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
        .get(`/api/courses/assignments/${assignmentId.toHexString()}`)
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
        .get(`/api/courses/assignments/${new Types.ObjectId().toHexString()}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(404);
    });
  });

  describe('POST /courses/:courseAssignmentId/assignments', () => {
    it('should create an assignment (201)', async () => {
      const { courseAssignmentId, teacherToken } = await setupAssignments();
      const response = await request(app.getHttpServer())
        .post(`/api/courses/${courseAssignmentId.toHexString()}/assignments`)
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
        .post(`/api/courses/${courseAssignmentId.toHexString()}/assignments`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ title: 'Forbidden' })
        .expect(403);
    });
  });

  describe('GET /courses/assignments/my', () => {
    it('should return student assignments (200)', async () => {
      const { courseAssignmentId, studentId, studentToken, groupId } =
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

      const selectedElectiveId = new Types.ObjectId();
      const unselectedElectiveId = new Types.ObjectId();
      await connection.collection('courseassignments').insertMany([
        {
          _id: selectedElectiveId,
          teacher: new Types.ObjectId(),
          course: new Types.ObjectId(),
          group: groupId,
          academicYear: '2025-2026',
          semester: 1,
          source: 'elective',
          enrolledStudents: [studentId],
        },
        {
          _id: unselectedElectiveId,
          teacher: new Types.ObjectId(),
          course: new Types.ObjectId(),
          group: groupId,
          academicYear: '2025-2026',
          semester: 2,
          source: 'elective',
          enrolledStudents: [new Types.ObjectId()],
        },
      ]);

      await connection.collection('assignments').insertMany([
        {
          _id: new Types.ObjectId(),
          courseAssignment: selectedElectiveId,
          group: groupId,
          title: 'Selected Elective Assignment',
          description: 'Visible',
          dueDate: new Date(Date.now() + 86400000),
          maxScore: 100,
          files: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new Types.ObjectId(),
          courseAssignment: unselectedElectiveId,
          group: groupId,
          title: 'Unselected Elective Assignment',
          description: 'Hidden',
          dueDate: new Date(Date.now() + 86400000),
          maxScore: 100,
          files: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/courses/assignments/my')
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
      expect(
        body.docs.some((item) => item.title === 'Selected Elective Assignment'),
      ).toBe(true);
      expect(
        body.docs.some(
          (item) => item.title === 'Unselected Elective Assignment',
        ),
      ).toBe(false);
    });
  });

  describe('POST /courses/assignments/:id/submit', () => {
    it('should submit an assignment (201)', async () => {
      const {
        courseAssignmentId,
        teacherId,
        studentId,
        studentToken,
        groupId,
      } = await setupAssignments();
      const assignmentId = new Types.ObjectId();
      const fileId = await createUploadedFile(studentId);
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
        .post(`/api/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fileIds: [fileId.toHexString()],
        })
        .expect(201);

      const body = response.body as SubmissionDto;
      expect(body.status).toBe('submitted');

      const notification = await connection
        .collection('notifications')
        .findOne({
          userId: teacherId,
          type: 'assignment_submitted',
          entityType: 'submission',
          entityId: body.id,
        });

      expect(notification).toBeTruthy();
      expect(notification?.actionUrl).toBe(
        `/courses/${courseAssignmentId.toHexString()}?tab=submissions&assignmentId=${assignmentId.toHexString()}`,
      );
    });

    it('should reject student submissions after deadline (400)', async () => {
      const { courseAssignmentId, studentId, studentToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      const fileId = await createUploadedFile(studentId);

      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'Expired Submit',
        description: 'Desc',
        dueDate: new Date(Date.now() - 3600000),
        maxScore: 100,
        files: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app.getHttpServer())
        .post(`/api/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fileIds: [fileId.toHexString()],
        })
        .expect(400);
    });

    it('should fail if submitting twice (409)', async () => {
      const { courseAssignmentId, studentId, studentToken, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      const fileId = await createUploadedFile(studentId);
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
        .post(`/api/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fileIds: [fileId.toHexString()],
        })
        .expect(201);

      // Second submission
      await request(app.getHttpServer())
        .post(`/api/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          fileIds: [fileId.toHexString()],
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
        .post(`/api/courses/assignments/${assignmentId.toHexString()}/submit`)
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({
          fileIds: [new Types.ObjectId().toHexString()],
        })
        .expect(403);
    });
  });

  describe('POST /courses/submissions/:id/grade', () => {
    it('should grade a submission (201)', async () => {
      const {
        courseAssignmentId,
        teacherToken,
        studentToken,
        studentId,
        groupId,
      } = await setupAssignments();
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
        .post(`/api/courses/submissions/${submissionId.toHexString()}/grade`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          score: 95,
          comment: 'Good job',
        })
        .expect(201);

      const body = response.body as SubmissionDto;
      expect(body.status).toBe('graded');
      expect(body.score).toBe(95);

      const pendingResponse = await request(app.getHttpServer())
        .get(
          `/api/courses/assignments/${assignmentId.toHexString()}/submissions`,
        )
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
      const pendingBody = pendingResponse.body as PaginatedDto<SubmissionDto>;
      expect(pendingBody.docs).toHaveLength(0);

      const grade = await connection.collection('grades').findOne({
        submission: submissionId,
        assignment: assignmentId,
        student: studentId,
        courseAssignment: courseAssignmentId,
      });

      expect(grade).toBeTruthy();
      expect(grade?.value).toBe(95);
      expect(grade?.type).toBe('current');
      if (!grade?._id) {
        throw new Error('Expected assignment grade to be created');
      }
      const gradeId = grade._id.toHexString();

      const notification = await connection
        .collection('notifications')
        .findOne({
          userId: studentId,
          type: 'grade',
          entityType: 'grade',
          entityId: gradeId,
        });

      expect(notification).toBeTruthy();
      expect(notification?.actionUrl).toBe('/assignments');

      await request(app.getHttpServer())
        .post(`/api/courses/submissions/${submissionId.toHexString()}/grade`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          score: 95,
          comment: 'Good job',
        })
        .expect(201);

      const gradeNotifications = await connection
        .collection('notifications')
        .countDocuments({
          userId: studentId,
          type: 'grade',
          entityType: 'grade',
          entityId: gradeId,
        });
      expect(gradeNotifications).toBe(1);

      await request(app.getHttpServer())
        .patch(`/api/courses/grades/${gradeId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          type: 'current',
          value: 88,
          comment: 'Updated after review',
        })
        .expect(200);

      const updatedSubmission = await connection
        .collection('submissions')
        .findOne({ _id: submissionId });
      expect(updatedSubmission?.status).toBe('graded');
      expect(updatedSubmission?.score).toBe(88);
      expect(updatedSubmission?.comment).toBe('Updated after review');

      const studentAssignmentsResponse = await request(app.getHttpServer())
        .get('/api/courses/assignments/my')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const studentAssignmentsBody =
        studentAssignmentsResponse.body as PaginatedDto<AssignmentDto>;
      const studentAssignment = studentAssignmentsBody.docs.find(
        (assignment) => assignment.id === assignmentId.toHexString(),
      );
      expect(studentAssignment?.submission?.status).toBe('graded');
      expect(studentAssignment?.submission?.score).toBe(88);
      expect(studentAssignment?.submission?.comment).toBe(
        'Updated after review',
      );

      const updatedGradeNotifications = await connection
        .collection('notifications')
        .countDocuments({
          userId: studentId,
          type: 'grade',
          entityType: 'grade',
          entityId: gradeId,
        });
      expect(updatedGradeNotifications).toBe(2);

      const gradesResponse = await request(app.getHttpServer())
        .get(
          `/api/courses/grades/my/courses/${courseAssignmentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const gradesBody = gradesResponse.body as PaginatedDto<{
        assignmentTitle?: string;
        value: number;
      }>;
      expect(gradesBody.docs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assignmentTitle: 'To Grade',
            value: 88,
          }),
        ]),
      );
    });

    it('should reject a grade above assignment max score (400)', async () => {
      const { courseAssignmentId, teacherToken, studentId, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      const submissionId = new Types.ObjectId();

      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'Limited Score',
        description: 'Desc',
        dueDate: new Date(Date.now() + 86400000),
        maxScore: 60,
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

      await request(app.getHttpServer())
        .post(`/api/courses/submissions/${submissionId.toHexString()}/grade`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          score: 70,
          comment: 'Too high',
        })
        .expect(400);
    });

    it('should reject editing an already graded submission after deadline (400)', async () => {
      const { courseAssignmentId, teacherToken, studentId, groupId } =
        await setupAssignments();
      const assignmentId = new Types.ObjectId();
      const submissionId = new Types.ObjectId();

      await connection.collection('assignments').insertOne({
        _id: assignmentId,
        courseAssignment: courseAssignmentId,
        group: groupId,
        title: 'Locked Grade',
        description: 'Desc',
        dueDate: new Date(Date.now() - 86400000),
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
        status: 'graded',
        score: 80,
        comment: 'Initial grade',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const gradeId = new Types.ObjectId();
      await connection.collection('grades').insertOne({
        _id: gradeId,
        student: studentId,
        courseAssignment: courseAssignmentId,
        assignment: assignmentId,
        submission: submissionId,
        type: 'current',
        value: 80,
        comment: 'Initial grade',
        date: new Date(Date.now() - 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await request(app.getHttpServer())
        .post(`/api/courses/submissions/${submissionId.toHexString()}/grade`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          score: 90,
          comment: 'Late edit',
        })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/api/courses/grades/${gradeId.toHexString()}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          type: 'current',
          value: 90,
          comment: 'Late journal edit',
        })
        .expect(400);
    });
  });
});
