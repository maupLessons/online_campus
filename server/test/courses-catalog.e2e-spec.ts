import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Connection, Types } from 'mongoose';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { SeedService } from '../src/seed-data/seed.service';
import { Role } from '../src/common/types/roles.enum';
import { ScheduleService } from '../src/schedule/schedule.service';

const SETUP_TIMEOUT = 120_000;
const TEST_JWT_SECRET = 'test-jwt-secret-courses-catalog';
const TEST_CSRF_SECRET = 'test-csrf-secret-courses-catalog';

type Actor = { id: Types.ObjectId; token: string };

type CourseBody = {
  id: string;
  status: string;
  departmentId: string;
  moodleUrl?: string;
  externalSubjectId?: string;
};

type CatalogListBody = { docs: unknown[] };

type ResourcesBody = { resources: Array<{ type: string }> };

type CardBody = {
  course: { code: string; externalSubjectId?: string };
  term: { academicYear: string };
  moodleHref: string;
  upcomingLessons: unknown[];
  canEditResources: boolean;
  canEditMoodleUrl: boolean;
  meta: { scheduleUnavailable: boolean };
};

describe('Courses catalog (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;
  let connection: Connection;
  let jwtService: JwtService;
  const findUpcoming = jest.fn().mockResolvedValue([]);

  const collection = (modelName: string) =>
    connection.model(modelName).collection;

  beforeAll(async () => {
    container = await new GenericContainer('mongo:7.0')
      .withExposedPorts(27017)
      .withWaitStrategy(Wait.forLogMessage(/Waiting for connections/))
      .start();
    const mongoUri = `mongodb://${container.getHost()}:${container.getMappedPort(27017)}/courses-e2e`;
    const testConfig = new ConfigService({
      MONGODB_URI: mongoUri,
      JWT_SECRET: TEST_JWT_SECRET,
      AUTH_CSRF_SECRET: TEST_CSRF_SECRET,
      NODE_ENV: 'test',
      CLIENT_URL: 'http://localhost:5173',
      MOODLE_ALLOWED_HOSTS: 'dist.maup.com.ua',
      RESOURCE_BLOCKED_HOSTS: 'bad.example',
    });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SeedService)
      .useValue({ onModuleInit: jest.fn() })
      .overrideProvider(ConfigService)
      .useValue(testConfig)
      .overrideProvider(ScheduleService)
      .useValue({ findUpcomingForAssignment: findUpcoming })
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
    findUpcoming.mockReset().mockResolvedValue([]);
    await Promise.all(
      Object.values(connection.collections).map((c) => c.deleteMany({})),
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
    await collection('User').insertOne({
      _id: id,
      login: `${role}_${suffix}`,
      passwordHash: 'x',
      role,
      email: `${role}_${suffix}@example.test`,
      firstName: role,
      lastName: suffix,
      status: 'active',
      ...profile,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const activeStudentProfileId = (
      profile.activeStudentProfileId as Types.ObjectId | undefined
    )?.toHexString();
    return {
      id,
      token: jwtService.sign({
        sub: id.toHexString(),
        login: `${role}_${suffix}`,
        role,
        activeStudentProfileId,
      }),
    };
  };

  type Fixture = {
    termCurrent: Types.ObjectId;
    termOld: Types.ObjectId;
    facultyA: Types.ObjectId;
    deptA: Types.ObjectId;
    deptB: Types.ObjectId;
    groupA: Types.ObjectId;
    courseA: Types.ObjectId;
    courseB: Types.ObjectId;
    assignmentA: Types.ObjectId;
    assignmentOld: Types.ObjectId;
    headA: Actor;
    headB: Actor;
    dean: Actor;
    admin: Actor;
    teacher: Actor;
    otherTeacher: Actor;
    student: Actor;
    rector: Actor;
  };

  const seed = async (): Promise<Fixture> => {
    const termCurrent = new Types.ObjectId();
    const termOld = new Types.ObjectId();
    await collection('AcademicTerm').insertMany([
      {
        _id: termCurrent,
        academicYear: '2026/2027',
        termNumber: 1,
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2027-01-31'),
        status: 'current',
        maupAcademicYear: 2026,
        maupSemester: 1,
      },
      {
        _id: termOld,
        academicYear: '2025/2026',
        termNumber: 2,
        startsAt: new Date('2026-02-01'),
        endsAt: new Date('2026-06-30'),
        status: 'closed',
        maupAcademicYear: 2025,
        maupSemester: 2,
      },
    ]);
    const facultyA = new Types.ObjectId();
    const deptA = new Types.ObjectId();
    const deptB = new Types.ObjectId();
    const dean = await createActor(Role.DEAN, 'a');
    const headA = await createActor(Role.DEPARTMENT_HEAD, 'a');
    const headB = await createActor(Role.DEPARTMENT_HEAD, 'b');
    await collection('Faculty').insertOne({
      _id: facultyA,
      name: 'Ф-А',
      dean: dean.id,
    });
    await collection('Department').insertMany([
      { _id: deptA, name: 'Кафедра А', faculty: facultyA, head: headA.id },
      {
        _id: deptB,
        name: 'Кафедра Б',
        faculty: new Types.ObjectId(),
        head: headB.id,
      },
    ]);
    const specialty = new Types.ObjectId();
    await collection('Specialty').insertOne({
      _id: specialty,
      name: 'КН',
      code: '122',
    });
    const groupA = new Types.ObjectId();
    await collection('Group').insertOne({
      _id: groupA,
      code: 'КН-31',
      specialty,
      course: 3,
    });
    const admin = await createActor(Role.ADMIN, 'root');
    const teacher = await createActor(Role.TEACHER, 't1', {
      teacherProfile: { department: deptA, position: 'доцент' },
    });
    const otherTeacher = await createActor(Role.TEACHER, 't2', {
      teacherProfile: { department: deptA, position: 'доцент' },
    });
    const rector = await createActor(Role.RECTOR, 'r');
    const profileId = new Types.ObjectId();
    const student = await createActor(Role.STUDENT, 's1', {
      studentProfiles: [
        {
          _id: profileId,
          externalStudentId: 'ext-1',
          group: groupA,
          recordBookNumber: 'RB-1',
          year: 3,
          status: 'active',
          syncedAt: new Date(),
        },
      ],
      activeStudentProfileId: profileId,
    });
    const courseA = new Types.ObjectId();
    const courseB = new Types.ObjectId();
    await collection('Course').insertMany([
      {
        _id: courseA,
        name: 'Курс А',
        code: 'A-1',
        department: deptA,
        credits: 4,
        status: 'active',
        createdBy: admin.id,
      },
      {
        _id: courseB,
        name: 'Курс Б',
        code: 'B-1',
        department: deptB,
        credits: 3,
        status: 'active',
        createdBy: admin.id,
      },
    ]);
    const assignmentA = new Types.ObjectId();
    const assignmentOld = new Types.ObjectId();
    await collection('CourseAssignment').insertMany([
      {
        _id: assignmentA,
        course: courseA,
        group: groupA,
        teacher: teacher.id,
        term: termCurrent,
        source: 'standard',
        enrolledStudents: [],
        resources: [],
      },
      {
        _id: assignmentOld,
        course: courseA,
        group: groupA,
        teacher: teacher.id,
        term: termOld,
        source: 'standard',
        enrolledStudents: [],
        resources: [],
      },
    ]);
    return {
      termCurrent,
      termOld,
      facultyA,
      deptA,
      deptB,
      groupA,
      courseA,
      courseB,
      assignmentA,
      assignmentOld,
      headA,
      headB,
      dean,
      admin,
      teacher,
      otherTeacher,
      student,
      rector,
    };
  };

  const auth = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

  describe('catalog write', () => {
    it('department_head creates a course only in own department', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .post('/api/courses')
        .set(auth(f.headA))
        .send({
          code: 'A-2',
          name: 'Новий',
          departmentId: f.deptA.toHexString(),
          credits: 3,
        })
        .expect(201)
        .expect(({ body }: { body: CourseBody }) => {
          expect(body.status).toBe('active');
          expect(body.departmentId).toBe(f.deptA.toHexString());
        });
      await request(app.getHttpServer())
        .post('/api/courses')
        .set(auth(f.headA))
        .send({
          code: 'B-2',
          name: 'Чужий',
          departmentId: f.deptB.toHexString(),
          credits: 3,
        })
        .expect(403);
      const audit = await collection('AuditLog').findOne({
        action: 'course.created',
      });
      expect(audit).not.toBeNull();
    });

    it('department_head updates own course, 403 for other department, dean read-only', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseA.toHexString()}`)
        .set(auth(f.headA))
        .send({ name: 'Курс А+' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseB.toHexString()}`)
        .set(auth(f.headA))
        .send({ name: 'x' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseA.toHexString()}`)
        .set(auth(f.dean))
        .send({ name: 'x' })
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/courses/${f.courseA.toHexString()}`)
        .set(auth(f.dean))
        .expect(200);
    });

    it('archive is blocked while assignments exist in current term', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .post(`/api/courses/${f.courseA.toHexString()}/archive`)
        .set(auth(f.headA))
        .expect(409);
      await request(app.getHttpServer())
        .post(`/api/courses/${f.courseB.toHexString()}/archive`)
        .set(auth(f.headB))
        .expect(200)
        .expect(({ body }: { body: CourseBody }) =>
          expect(body.status).toBe('archived'),
        );
      await request(app.getHttpServer())
        .get('/api/courses')
        .set(auth(f.headB))
        .query({ status: 'active' })
        .expect(200)
        .expect(({ body }: { body: CatalogListBody }) =>
          expect(body.docs).toHaveLength(0),
        );
      await request(app.getHttpServer())
        .post(`/api/courses/${f.courseB.toHexString()}/restore`)
        .set(auth(f.headB))
        .expect(200)
        .expect(({ body }: { body: CourseBody }) =>
          expect(body.status).toBe('active'),
        );
    });

    it('moodle-url respects allowlist and admin reason', async () => {
      const f = await seed();
      const url = `/api/courses/${f.courseA.toHexString()}/moodle-url`;
      await request(app.getHttpServer())
        .patch(url)
        .set(auth(f.headA))
        .send({ moodleUrl: 'https://evil.example/c' })
        .expect(400);
      await request(app.getHttpServer())
        .patch(url)
        .set(auth(f.headA))
        .send({ moodleUrl: 'https://dist.maup.com.ua/course/view.php?id=1' })
        .expect(200)
        .expect(({ body }: { body: CourseBody }) =>
          expect(body.moodleUrl).toBe(
            'https://dist.maup.com.ua/course/view.php?id=1',
          ),
        );
      await request(app.getHttpServer())
        .patch(url)
        .set(auth(f.admin))
        .send({ moodleUrl: null })
        .expect(400);
      await request(app.getHttpServer())
        .patch(url)
        .set(auth(f.admin))
        .send({ moodleUrl: null, reason: 'Помилкове посилання' })
        .expect(200)
        .expect(({ body }: { body: CourseBody }) =>
          expect(body.moodleUrl).toBeUndefined(),
        );
      const audit = await collection('AuditLog')
        .find({ action: 'course.moodle_url.changed' })
        .toArray();
      expect(audit).toHaveLength(2);
      expect(audit[1].details).toMatchObject({ reason: 'Помилкове посилання' });
    });

    it('externalSubjectId is trimmed, unique and validated', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseA.toHexString()}`)
        .set(auth(f.headA))
        .send({ externalSubjectId: '  1001  ' })
        .expect(200)
        .expect(({ body }: { body: CourseBody }) =>
          expect(body.externalSubjectId).toBe('1001'),
        );
      // the same key on a second course — 409 with a code and the owning course's code
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseB.toHexString()}`)
        .set(auth(f.headB))
        .send({ externalSubjectId: '1001' })
        .expect(409)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            code: 'course_external_subject_id_taken',
            courseCode: 'A-1',
          }),
        );
      // an empty string REMOVES the field ($unset), so a second course with '' passes
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseA.toHexString()}`)
        .set(auth(f.headA))
        .send({ externalSubjectId: '' })
        .expect(200)
        .expect(({ body }: { body: CourseBody }) =>
          expect(body.externalSubjectId).toBeUndefined(),
        );
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseB.toHexString()}`)
        .set(auth(f.headB))
        .send({ externalSubjectId: '' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/courses/${f.courseA.toHexString()}`)
        .set(auth(f.headA))
        .send({ externalSubjectId: '1001; DROP' })
        .expect(400);
      const audit = await collection('AuditLog').findOne({
        action: 'course.updated',
      });
      expect(audit).not.toBeNull();
    });

    it('rector has no access to any /courses endpoint', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .get('/api/courses')
        .set(auth(f.rector))
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/courses/course-assignments/${f.assignmentA.toHexString()}`)
        .set(auth(f.rector))
        .expect(403);
    });
  });

  describe('my courses envelope', () => {
    it('student always gets meta with term; no active profile → no_active_profile', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .get('/api/courses/my')
        .set(auth(f.student))
        .expect(200)
        .expect(
          ({
            body,
          }: {
            body: {
              docs: unknown[];
              meta: { term: { academicYear: string; termNumber: number } };
            };
          }) => {
            expect(body.docs).toHaveLength(1);
            expect(body.meta.term).toMatchObject({
              academicYear: '2026/2027',
              termNumber: 1,
            });
            expect((body.meta as { reason?: string }).reason).toBeUndefined();
          },
        );
      await collection('User').updateOne(
        { _id: f.student.id },
        { $set: { 'studentProfiles.0.status': 'inactive' } },
      );
      await request(app.getHttpServer())
        .get('/api/courses/my')
        .set(auth(f.student))
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            docs: [],
            totalDocs: 0,
            meta: { reason: 'no_active_profile' },
          }),
        );
    });

    it('no current term → 200 with meta.term null and no_current_term', async () => {
      const f = await seed();
      await collection('AcademicTerm').updateMany(
        {},
        { $set: { status: 'closed' } },
      );
      await request(app.getHttpServer())
        .get('/api/courses/my')
        .set(auth(f.student))
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            docs: [],
            totalDocs: 0,
            meta: { term: null, reason: 'no_current_term' },
          }),
        );
    });
  });

  describe('resources', () => {
    const url = (f: Awaited<ReturnType<typeof seed>>) =>
      `/api/courses/course-assignments/${f.assignmentA.toHexString()}/resources`;

    it('teacher replaces resources on own assignment', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .put(url(f))
        .set(auth(f.teacher))
        .send({
          resources: [
            {
              title: 'Лекція 1',
              type: 'video',
              url: 'https://youtube.com/watch?v=1',
            },
          ],
        })
        .expect(200)
        .expect(({ body }: { body: ResourcesBody }) => {
          expect(body.resources).toHaveLength(1);
          expect(body.resources[0].type).toBe('video');
        });
      const audit = await collection('AuditLog').findOne({
        action: 'course_assignment.resources.updated',
      });
      expect(audit?.details).toMatchObject({
        before: 0,
        after: 1,
        addedHosts: ['youtube.com'],
        removedHosts: [],
      });
      // §10 criterion: no full URLs in the payload
      expect(JSON.stringify(audit?.details)).not.toContain('https://');
    });

    it('foreign teacher, admin and student get 403', async () => {
      const f = await seed();
      const body = { resources: [] };
      await request(app.getHttpServer())
        .put(url(f))
        .set(auth(f.otherTeacher))
        .send(body)
        .expect(403);
      await request(app.getHttpServer())
        .put(url(f))
        .set(auth(f.admin))
        .send(body)
        .expect(403);
      await request(app.getHttpServer())
        .put(url(f))
        .set(auth(f.student))
        .send(body)
        .expect(403);
    });

    it('validates https, userinfo, private hosts, blocklist and max 20', async () => {
      const f = await seed();
      // the first three are filtered out at the DTO level (IsSafeHttpsUrl), the fourth — in assertResourceUrl
      for (const bad of [
        'http://plain.example/x',
        'https://user:pass@ok.example/x',
        'https://192.168.0.10/x',
        'https://bad.example/x',
      ]) {
        await request(app.getHttpServer())
          .put(url(f))
          .set(auth(f.teacher))
          .send({ resources: [{ title: 'x', url: bad }] })
          .expect(400);
      }
      const many = Array.from({ length: 21 }, (_, i) => ({
        title: `r${i}`,
        url: `https://ok.example/${i}`,
      }));
      await request(app.getHttpServer())
        .put(url(f))
        .set(auth(f.teacher))
        .send({ resources: many })
        .expect(400);
    });

    it('department_head of the course department can edit resources', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .put(url(f))
        .set(auth(f.headA))
        .send({
          resources: [
            {
              title: 'Силабус',
              type: 'document',
              url: 'https://drive.example/s',
            },
          ],
        })
        .expect(200);
      await request(app.getHttpServer())
        .put(url(f))
        .set(auth(f.headB))
        .send({ resources: [] })
        .expect(403);
    });
  });

  describe('card', () => {
    it('student opens card in current term; upcoming lessons come from schedule', async () => {
      const f = await seed();
      findUpcoming.mockResolvedValueOnce([
        {
          id: 'x',
          date: '2026-09-21',
          startTime: '10:00',
          endTime: '11:20',
          type: 'lecture',
          courseAssignmentId: f.assignmentA.toHexString(),
        },
      ]);
      const { body } = (await request(app.getHttpServer())
        .get(`/api/courses/course-assignments/${f.assignmentA.toHexString()}`)
        .set(auth(f.student))
        .expect(200)) as unknown as { body: CardBody };
      expect(body.course.code).toBe('A-1');
      expect(body.term.academicYear).toBe('2026/2027');
      expect(body.moodleHref).toBe('https://dist.maup.com.ua/');
      expect(body.upcomingLessons).toHaveLength(1);
      expect(body.canEditResources).toBe(false);
      expect(body.meta.scheduleUnavailable).toBe(false);
      expect(findUpcoming).toHaveBeenCalledWith(f.assignmentA.toHexString(), 5);
    });

    it.each([
      ['знімка немає', null],
      ['порт кинув помилку', 'throw'],
    ])(
      'card still opens when schedule is unavailable (%s)',
      async (_label, mode) => {
        const f = await seed();
        if (mode === 'throw')
          findUpcoming.mockRejectedValueOnce(new Error('cache empty'));
        else findUpcoming.mockResolvedValueOnce(null);
        const { body } = (await request(app.getHttpServer())
          .get(`/api/courses/course-assignments/${f.assignmentA.toHexString()}`)
          .set(auth(f.teacher))
          .expect(200)) as unknown as { body: CardBody };
        expect(body.upcomingLessons).toEqual([]);
        expect(body.meta.scheduleUnavailable).toBe(true);
        expect(body.canEditResources).toBe(true);
      },
    );

    it('empty snapshot is not the same as a missing one', async () => {
      const f = await seed();
      findUpcoming.mockResolvedValueOnce([]);
      const { body } = (await request(app.getHttpServer())
        .get(`/api/courses/course-assignments/${f.assignmentA.toHexString()}`)
        .set(auth(f.teacher))
        .expect(200)) as unknown as { body: CardBody };
      expect(body.upcomingLessons).toEqual([]);
      expect(body.meta.scheduleUnavailable).toBe(false);
    });

    it('student is forbidden for a past-term assignment; moodleHref uses course url when set', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .get(`/api/courses/course-assignments/${f.assignmentOld.toHexString()}`)
        .set(auth(f.student))
        .expect(403);
      await collection('Course').updateOne(
        { _id: f.courseA },
        {
          $set: {
            moodleUrl: 'https://dist.maup.com.ua/course/view.php?id=9',
            externalSubjectId: '1001',
          },
        },
      );
      const { body } = (await request(app.getHttpServer())
        .get(`/api/courses/course-assignments/${f.assignmentA.toHexString()}`)
        .set(auth(f.headA))
        .expect(200)) as unknown as { body: CardBody };
      expect(body.moodleHref).toBe(
        'https://dist.maup.com.ua/course/view.php?id=9',
      );
      expect(body.canEditMoodleUrl).toBe(true);
      expect(body.course.externalSubjectId).toBe('1001');
      // §4.3: the MAUP key is not given to the student
      const { body: studentBody } = (await request(app.getHttpServer())
        .get(`/api/courses/course-assignments/${f.assignmentA.toHexString()}`)
        .set(auth(f.student))
        .expect(200)) as unknown as { body: CardBody };
      expect(studentBody.course.externalSubjectId).toBeUndefined();
    });

    it('department_head reads students of own department assignment (regression on validateOwnership)', async () => {
      const f = await seed();
      await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${f.assignmentA.toHexString()}/students`,
        )
        .set(auth(f.headA))
        .expect(200);
      await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${f.assignmentA.toHexString()}/students`,
        )
        .set(auth(f.headB))
        .expect(403);
      await request(app.getHttpServer())
        .get(
          `/api/courses/course-assignments/${f.assignmentA.toHexString()}/students`,
        )
        .set(auth(f.rector))
        .expect(403);
    });
  });
});
