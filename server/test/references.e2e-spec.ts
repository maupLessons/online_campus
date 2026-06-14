import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
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
const TEST_JWT_SECRET = 'references-e2e-secret-with-sufficient-entropy';
const TEST_CSRF_SECRET = 'references-e2e-csrf-secret-with-sufficient-entropy';

const parseBinaryResponse = (
  response: SuperAgentResponse,
  callback: (error: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
  response.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

type Actor = {
  id: Types.ObjectId;
  token: string;
  login: string;
};

type AdminListBody = {
  totalDocs: number;
  docs: Array<{ name: string; dean?: Record<string, unknown> }>;
};

type CatalogBody = {
  totalDocs: number;
  docs: Array<{ id: string; name?: string; code?: string }>;
};

type ConflictBody = {
  usages: Array<{ resource: string; count: number }>;
};

type ImportBody = {
  errors: Array<{ row: number; message: string }>;
};

function responseId(response: SuperAgentResponse): string {
  const candidate =
    typeof response.body === 'string'
      ? response.body
      : response.text.replace(/^"|"$/g, '');
  if (!Types.ObjectId.isValid(candidate)) {
    throw new Error(`Expected ObjectId response, received: ${response.text}`);
  }
  return candidate;
}

describe('References management (e2e)', () => {
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
    )}/references-e2e`;
    const testConfig = new ConfigService({
      MONGODB_URI: mongoUri,
      JWT_SECRET: TEST_JWT_SECRET,
      AUTH_CSRF_SECRET: TEST_CSRF_SECRET,
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

  const createActor = async (role: Role, suffix: string): Promise<Actor> => {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return {
      id,
      login,
      token: jwtService.sign({ sub: id.toHexString(), login, role }),
    };
  };

  const seedReferences = async () => {
    const admin = await createActor(Role.ADMIN, 'admin');
    const student = await createActor(Role.STUDENT, 'student');
    const dean = await createActor(Role.DEAN, 'dean');
    const head = await createActor(Role.DEPARTMENT_HEAD, 'head');
    const teacher = await createActor(Role.TEACHER, 'teacher');
    const facultyResponse = await request(app.getHttpServer())
      .post('/api/references/faculties')
      .auth(admin.token, { type: 'bearer' })
      .send({ name: 'Faculty of Testing', dean: dean.id.toHexString() });
    if (facultyResponse.status !== 201) {
      throw new Error(
        `Faculty fixture failed: ${JSON.stringify(facultyResponse.body)}`,
      );
    }
    const facultyId = responseId(facultyResponse);
    const specialtyResponse = await request(app.getHttpServer())
      .post('/api/references/specialties')
      .auth(admin.token, { type: 'bearer' })
      .send({ code: 'QA-01', name: 'Quality Assurance' })
      .expect(201);
    const specialtyId = responseId(specialtyResponse);
    const departmentResponse = await request(app.getHttpServer())
      .post('/api/references/departments')
      .auth(admin.token, { type: 'bearer' })
      .send({
        name: 'Secure Systems',
        faculty: facultyId,
        head: head.id.toHexString(),
      });
    if (departmentResponse.status !== 201) {
      throw new Error(
        `Department fixture failed: ${JSON.stringify(departmentResponse.body)}`,
      );
    }
    const departmentId = responseId(departmentResponse);
    const groupResponse = await request(app.getHttpServer())
      .post('/api/references/groups')
      .auth(admin.token, { type: 'bearer' })
      .send({
        code: 'QA-11',
        specialty: specialtyId,
        course: 1,
        curator: teacher.id.toHexString(),
      })
      .expect(201);
    const groupId = responseId(groupResponse);
    const classroomResponse = await request(app.getHttpServer())
      .post('/api/references/classrooms')
      .auth(admin.token, { type: 'bearer' })
      .send({
        building: 'QA Campus',
        roomNumber: '101',
        capacity: 30,
        type: 'lecture',
      })
      .expect(201);
    const classroomId = responseId(classroomResponse);

    await Promise.all([
      collection('User').updateOne(
        { _id: student.id },
        {
          $set: {
            studentProfile: {
              group: new Types.ObjectId(groupId),
              recordBookNumber: 'QA-REC-001',
              year: 1,
            },
          },
        },
      ),
      collection('User').updateOne(
        { _id: teacher.id },
        {
          $set: {
            teacherProfile: {
              department: new Types.ObjectId(departmentId),
              position: 'Associate professor',
            },
          },
        },
      ),
    ]);

    const courseId = new Types.ObjectId();
    const assignmentId = new Types.ObjectId();
    await collection('Course').insertOne({
      _id: courseId,
      name: 'Reference Security',
      code: 'REF-SEC-01',
      department: new Types.ObjectId(departmentId),
      semester: 1,
      credits: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await collection('CourseAssignment').insertOne({
      _id: assignmentId,
      course: courseId,
      group: new Types.ObjectId(groupId),
      teacher: teacher.id,
      academicYear: '2026/2027',
      semester: 1,
      source: 'standard',
      enrolledStudents: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await collection('ScheduleEntry').insertOne({
      _id: new Types.ObjectId(),
      courseAssignment: assignmentId,
      classroom: new Types.ObjectId(classroomId),
      date: new Date('2026-09-01T00:00:00.000Z'),
      startTime: '09:00',
      endTime: '10:30',
      type: 'lecture',
      status: 'scheduled',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const foreignFacultyId = new Types.ObjectId();
    const foreignDepartmentId = new Types.ObjectId();
    const foreignSpecialtyId = new Types.ObjectId();
    const foreignGroupId = new Types.ObjectId();
    const foreignClassroomId = new Types.ObjectId();
    await Promise.all([
      collection('Faculty').insertOne({
        _id: foreignFacultyId,
        name: 'Foreign Faculty',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      collection('Specialty').insertOne({
        _id: foreignSpecialtyId,
        code: 'FOREIGN-01',
        name: 'Foreign Specialty',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      collection('Classroom').insertOne({
        _id: foreignClassroomId,
        building: 'Foreign Campus',
        roomNumber: '999',
        capacity: 20,
        type: 'seminar',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ]);
    await collection('Department').insertOne({
      _id: foreignDepartmentId,
      name: 'Foreign Department',
      faculty: foreignFacultyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await collection('Group').insertOne({
      _id: foreignGroupId,
      code: 'FOREIGN-11',
      specialty: foreignSpecialtyId,
      course: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      admin,
      student,
      dean,
      head,
      teacher,
      facultyId,
      departmentId,
      specialtyId,
      groupId,
      classroomId,
      foreignFacultyId: foreignFacultyId.toHexString(),
      foreignDepartmentId: foreignDepartmentId.toHexString(),
      foreignSpecialtyId: foreignSpecialtyId.toHexString(),
      foreignGroupId: foreignGroupId.toHexString(),
      foreignClassroomId: foreignClassroomId.toHexString(),
    };
  };

  it('enforces authentication and admin-only management access', async () => {
    const fixture = await seedReferences();

    await request(app.getHttpServer())
      .get('/api/references/admin/faculties')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/references/admin/faculties')
      .auth(fixture.student.token, { type: 'bearer' })
      .expect(403);

    const response = await request(app.getHttpServer())
      .get('/api/references/admin/faculties?search=Testing&page=1&limit=10')
      .auth(fixture.admin.token, { type: 'bearer' })
      .expect(200);
    const body = response.body as AdminListBody;

    expect(body.totalDocs).toBe(1);
    expect(body.docs[0].name).toBe('Faculty of Testing');
    expect(body.docs[0].dean).not.toHaveProperty('login');
  });

  it('validates relation roles and maps duplicate keys to conflict', async () => {
    const fixture = await seedReferences();

    await request(app.getHttpServer())
      .post('/api/references/faculties')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send({
        name: 'Invalid Faculty',
        dean: fixture.student.id.toHexString(),
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/references/specialties')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send({ code: 'QA-01', name: 'Duplicate specialty' })
      .expect(409);
  });

  it('applies role-aware read scopes and hides foreign reference objects', async () => {
    const fixture = await seedReferences();
    const dispatcher = await createActor(Role.DISPATCHER, 'dispatcher');

    for (const actor of [
      fixture.student,
      fixture.teacher,
      fixture.head,
      fixture.dean,
    ]) {
      const groupsResponse = await request(app.getHttpServer())
        .get('/api/references/catalog/groups?page=1&limit=10')
        .auth(actor.token, { type: 'bearer' })
        .expect(200);
      const groups = groupsResponse.body as CatalogBody;

      expect(groups.totalDocs).toBe(1);
      expect(groups.docs[0].id).toBe(fixture.groupId);
    }

    const studentFaculties = await request(app.getHttpServer())
      .get('/api/references/catalog/faculties?page=1&limit=10')
      .auth(fixture.student.token, { type: 'bearer' })
      .expect(200);
    expect((studentFaculties.body as CatalogBody).docs).toEqual([
      expect.objectContaining({ id: fixture.facultyId }),
    ]);

    const teacherClassrooms = await request(app.getHttpServer())
      .get('/api/references/catalog/classrooms?page=1&limit=10')
      .auth(fixture.teacher.token, { type: 'bearer' })
      .expect(200);
    expect((teacherClassrooms.body as CatalogBody).docs).toEqual([
      expect.objectContaining({ id: fixture.classroomId }),
    ]);

    const globalCatalog = await request(app.getHttpServer())
      .get('/api/references/catalog/groups?page=1&limit=10')
      .auth(dispatcher.token, { type: 'bearer' })
      .expect(200);
    expect((globalCatalog.body as CatalogBody).totalDocs).toBe(2);

    await request(app.getHttpServer())
      .get(`/api/references/groups/${fixture.groupId}`)
      .auth(fixture.student.token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/references/groups/${fixture.foreignGroupId}`)
      .auth(fixture.student.token, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/references/classrooms/${fixture.foreignClassroomId}`)
      .auth(fixture.teacher.token, { type: 'bearer' })
      .expect(404);
  });

  it('blocks deleting references used by electives and notifications', async () => {
    const fixture = await seedReferences();
    const now = new Date();

    await collection('ElectiveDiscipline').insertOne({
      _id: new Types.ObjectId(),
      code: 'EL-QA-01',
      title: 'Secure elective',
      department: new Types.ObjectId(fixture.departmentId),
      semester: 1,
      credits: 3,
      capacity: 30,
      enrolledCount: 0,
      status: 'draft',
      createdBy: fixture.admin.id,
      createdAt: now,
      updatedAt: now,
    });
    await collection('Notification').insertOne({
      _id: new Types.ObjectId(),
      userId: null,
      title: 'Group notice',
      message: 'Reference integrity test',
      type: 'announcement',
      targetType: 'group',
      groupId: new Types.ObjectId(fixture.groupId),
      readBy: [],
      dismissedBy: [],
      important: false,
      createdAt: now,
      updatedAt: now,
    });

    const departmentDelete = await request(app.getHttpServer())
      .delete(`/api/references/departments/${fixture.departmentId}`)
      .auth(fixture.admin.token, { type: 'bearer' })
      .expect(409);
    const groupDelete = await request(app.getHttpServer())
      .delete(`/api/references/groups/${fixture.groupId}`)
      .auth(fixture.admin.token, { type: 'bearer' })
      .expect(409);
    const departmentConflict = departmentDelete.body as ConflictBody;
    const groupConflict = groupDelete.body as ConflictBody;

    expect(departmentConflict.usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'electiveDisciplines' }),
      ]),
    );
    expect(groupConflict.usages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resource: 'notifications' }),
      ]),
    );
  });

  it('exports safe CSV/XLSX files and supports dry-run import validation', async () => {
    const fixture = await seedReferences();
    await request(app.getHttpServer())
      .post('/api/references/specialties')
      .auth(fixture.admin.token, { type: 'bearer' })
      .send({ code: 'SAFE-01', name: '=HYPERLINK("https://example.test")' })
      .expect(201);

    const csvResponse = await request(app.getHttpServer())
      .get('/api/references/admin/specialties/export?format=csv&locale=uk')
      .auth(fixture.admin.token, { type: 'bearer' })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200);
    const csvBuffer = Buffer.from(csvResponse.body);
    expect([...csvBuffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csv = csvBuffer.toString('utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.split('\r\n')[0]).toBe('\uFEFFКод;Назва');
    expect(csv).toContain(`'=HYPERLINK`);

    const englishCsvResponse = await request(app.getHttpServer())
      .get('/api/references/admin/specialties/export?format=csv&locale=en')
      .auth(fixture.admin.token, { type: 'bearer' })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200);
    const englishCsv = Buffer.from(englishCsvResponse.body).toString('utf8');
    expect(englishCsv.split('\r\n')[0]).toBe('\uFEFFCode;Name');

    const xlsxResponse = await request(app.getHttpServer())
      .get('/api/references/admin/faculties/export?format=xlsx&locale=en')
      .auth(fixture.admin.token, { type: 'bearer' })
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Buffer.from(xlsxResponse.body) as unknown as Parameters<
        typeof workbook.xlsx.load
      >[0],
    );
    expect(workbook.worksheets[0].getRow(1).values).toEqual(
      expect.arrayContaining(['Name', 'Dean login', 'Dean']),
    );
    expect(workbook.worksheets[0].getColumn(1).width).toBeGreaterThanOrEqual(
      'Faculty of Testing'.length + 4,
    );

    const exportedImport = await request(app.getHttpServer())
      .post('/api/references/admin/specialties/import?dryRun=true&mode=upsert')
      .auth(fixture.admin.token, { type: 'bearer' })
      .attach('file', csvBuffer, 'specialties.csv')
      .expect(201);
    expect(exportedImport.body).toMatchObject({
      dryRun: true,
      totalRows: 3,
      validRows: 3,
      errors: [],
    });

    const validImport = await request(app.getHttpServer())
      .post('/api/references/admin/specialties/import?dryRun=true&mode=upsert')
      .auth(fixture.admin.token, { type: 'bearer' })
      .attach(
        'file',
        Buffer.from('code;name\r\nIMP-01;Imported specialty\r\n', 'utf8'),
        'specialties.csv',
      )
      .expect(201);
    expect(validImport.body).toMatchObject({
      dryRun: true,
      totalRows: 1,
      validRows: 1,
      created: 1,
      errors: [],
    });

    const duplicateImport = await request(app.getHttpServer())
      .post('/api/references/admin/specialties/import?dryRun=true&mode=upsert')
      .auth(fixture.admin.token, { type: 'bearer' })
      .attach(
        'file',
        Buffer.from(
          'code;name\r\nIMP-02;First\r\nIMP-02;Duplicate\r\n',
          'utf8',
        ),
        'specialties.csv',
      )
      .expect(201);
    expect((duplicateImport.body as ImportBody).errors).toHaveLength(1);
  });
});
