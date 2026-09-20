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
  CourseAssignmentCardDto,
  CourseAssignmentDto,
} from '../src/courses/courses/dto';
import { SeedService } from '../src/seed-data/seed.service';
import { configureApp } from '../src/app.config';
import { CoursesService } from '../src/courses/courses/courses.service';

const SET_UP_TIMEOUT = 60_000;

function studentProfileFields(input: {
  group: Types.ObjectId;
  recordBookNumber?: string;
  year?: number;
  externalStudentId?: string;
}) {
  const _id = new Types.ObjectId();
  const recordBookNumber = input.recordBookNumber ?? _id.toHexString();
  return {
    studentProfiles: [
      {
        _id,
        externalStudentId: input.externalStudentId ?? recordBookNumber,
        group: input.group,
        recordBookNumber,
        year: input.year ?? 1,
        status: 'active',
        syncedAt: new Date(),
      },
    ],
    activeStudentProfileId: _id,
  };
}

describe('Courses (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;
  let coursesService: CoursesService;

  beforeAll(async () => {
    container = await new GenericContainer('mongo:7.0')
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
    coursesService = app.get(CoursesService);
  });

  afterEach(async () => {
    if (connection) {
      await connection.collection('users').deleteMany({});
      await connection.collection('courses').deleteMany({});
      await connection.collection('courseassignments').deleteMany({});
      await connection.collection('departments').deleteMany({});
      await connection.collection('academicterms').deleteMany({});
      await connection.collection('groups').deleteMany({});
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
    const termId = new Types.ObjectId();

    const accessToken = jwtService.sign({
      sub: studentId.toHexString(),
      login: 'student_e2e',
      role: Role.STUDENT,
    });

    await connection.collection('departments').insertOne({
      _id: deptId,
      name: 'Test Dept',
    });

    // getActiveStudentProfile() populates studentProfiles.group (plan 01) and callers read
    // profile.group._id/.code off the populated doc — without a real Group document, populate
    // returns null and CoursesService.findCoursesByStudent crashes on `profile.group._id`.
    await connection.collection('groups').insertOne({
      _id: groupId,
      code: 'TC-101',
      specialty: new Types.ObjectId(),
      course: 1,
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
      ...studentProfileFields({ group: groupId }),
    });

    await connection.collection('courses').insertOne({
      _id: courseId,
      name: 'Test Course',
      code: 'TC001',
      department: deptId,
      credits: 3,
    });

    await connection.collection('academicterms').insertOne({
      _id: termId,
      academicYear: '2026/2027',
      termNumber: 1,
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2027-01-31'),
      status: 'current',
      maupAcademicYear: 2026,
      maupSemester: 1,
    });

    await connection.collection('courseassignments').insertOne({
      _id: courseAssignmentId,
      course: courseId,
      teacher: new Types.ObjectId(),
      group: groupId,
      term: termId,
    });

    return {
      studentId,
      groupId,
      courseId,
      courseAssignmentId,
      termId,
      accessToken,
    };
  };

  describe('GET /courses', () => {
    // §5 of plan 05: the discipline catalog is for department/dean's office/admin personas only;
    // a student uses /courses/my
    it('should return 403 for a student (catalog is staff-only)', async () => {
      const { accessToken } = await setupData();
      await request(app.getHttpServer())
        .get('/api/courses')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({ page: 1, limit: 10 })
        .expect(403);
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

    it('returns only assignments of the current term', async () => {
      const { accessToken, groupId, courseId } = await setupData(); // setupData already creates the current term termId and one assignment; it doesn't return `deptId`
      const oldTerm = new Types.ObjectId();
      await connection.collection('academicterms').insertOne({
        _id: oldTerm,
        academicYear: '2025/2026',
        termNumber: 2,
        status: 'closed',
        startsAt: new Date('2026-02-01'),
        endsAt: new Date('2026-06-30'),
        maupAcademicYear: 2025,
        maupSemester: 2,
      });
      await connection.collection('courseassignments').insertOne({
        _id: new Types.ObjectId(),
        course: courseId,
        group: groupId,
        teacher: new Types.ObjectId(),
        term: oldTerm,
        source: 'standard',
        enrolledStudents: [],
      });

      const res = await request(app.getHttpServer())
        .get('/api/courses/my')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      const body = res.body as PaginatedDto<CourseAssignmentDto>;
      expect(body.totalDocs).toBe(1);
      expect(body.docs[0].term?.academicYear).toBe('2026/2027');
    });

    it('returns an empty page with meta.reason without a current term', async () => {
      const { accessToken } = await setupData();
      await connection
        .collection('academicterms')
        .updateMany({}, { $set: { status: 'closed' } });
      const res = await request(app.getHttpServer())
        .get('/api/courses/my')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        docs: [],
        totalDocs: 0,
        meta: { reason: 'no_current_term' },
      });
    });
  });

  describe('GET /courses/:id', () => {
    // §5 of plan 05: the discipline catalog is for department/dean's office/admin personas only;
    // a student uses /courses/my
    it('should return 403 for a student (catalog is staff-only)', async () => {
      const { accessToken, courseId } = await setupData();
      await request(app.getHttpServer())
        .get(`/api/courses/${courseId.toHexString()}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    // the role guard cuts off the student before the course lookup, so the id's
    // existence doesn't matter (404 logic for admin is covered separately in courses-access.service.spec.ts)
    it('should return 403 for a student regardless of existence', async () => {
      const { accessToken } = await setupData();
      const fakeId = new Types.ObjectId().toHexString();
      await request(app.getHttpServer())
        .get(`/api/courses/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
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

      const body = response.body as CourseAssignmentCardDto;
      expect(body.id).toBe(courseAssignmentId.toHexString());
      expect(body.course.name).toBe('Test Course');
    });

    it('should reject a course assignment from another group (403)', async () => {
      const { accessToken, courseId, termId } = await setupData();
      const foreignCourseAssignmentId = new Types.ObjectId();

      await connection.collection('courseassignments').insertOne({
        _id: foreignCourseAssignmentId,
        course: courseId,
        teacher: new Types.ObjectId(),
        group: new Types.ObjectId(),
        term: termId,
      });

      await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${foreignCourseAssignmentId.toHexString()}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('should reject an elective course without enrollment (403)', async () => {
      const { accessToken, groupId, termId } = await setupData();
      const electiveCourseAssignmentId = new Types.ObjectId();

      await connection.collection('courseassignments').insertOne({
        _id: electiveCourseAssignmentId,
        course: new Types.ObjectId(),
        teacher: new Types.ObjectId(),
        group: groupId,
        term: termId,
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

  describe('Elective course targets', () => {
    it('resolves only enrolled students for access and notifications', async () => {
      const { groupId, studentId, termId } = await setupData();
      const outsiderId = new Types.ObjectId();
      const teacherId = new Types.ObjectId();
      const electiveAssignmentId = new Types.ObjectId();

      await connection.collection('users').insertMany([
        {
          _id: outsiderId,
          login: 'elective_target_outsider',
          role: Role.STUDENT,
          email: 'elective_target_outsider@example.com',
          firstName: 'Other',
          lastName: 'Student',
          status: 'active',
          passwordHash: 'hash',
          ...studentProfileFields({ group: groupId }),
        },
        {
          _id: teacherId,
          login: 'elective_target_teacher',
          role: Role.TEACHER,
          email: 'elective_target_teacher@example.com',
          firstName: 'Course',
          lastName: 'Teacher',
          status: 'active',
          passwordHash: 'hash',
        },
      ]);
      await connection.collection('courseassignments').insertOne({
        _id: electiveAssignmentId,
        course: new Types.ObjectId(),
        teacher: teacherId,
        group: groupId,
        term: termId,
        source: 'elective',
        enrolledStudents: [studentId],
        finalizedAt: new Date(),
      });

      const targetIds = await coursesService.findStudentIdsByCourseTargets([
        electiveAssignmentId.toHexString(),
      ]);
      const recipientIds = await coursesService.findUserIdsByCourseTargets([
        electiveAssignmentId.toHexString(),
      ]);

      expect(targetIds).toEqual([studentId.toHexString()]);
      expect(recipientIds).toEqual(
        expect.arrayContaining([
          teacherId.toHexString(),
          studentId.toHexString(),
        ]),
      );
      expect(recipientIds).not.toContain(outsiderId.toHexString());
      await expect(
        coursesService.isUserAssignedToCourseTargets({
          userId: studentId.toHexString(),
          role: Role.STUDENT,
          targetIds: [electiveAssignmentId.toHexString()],
          groupId: groupId.toHexString(),
        }),
      ).resolves.toBe(true);
      await expect(
        coursesService.isUserAssignedToCourseTargets({
          userId: outsiderId.toHexString(),
          role: Role.STUDENT,
          targetIds: [electiveAssignmentId.toHexString()],
          groupId: groupId.toHexString(),
        }),
      ).resolves.toBe(false);
    });
  });
});
