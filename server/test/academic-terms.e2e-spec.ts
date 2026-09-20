import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/common/types/roles.enum';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SeedService } from '../src/seed-data/seed.service';
import { configureApp } from '../src/app.config';
import { AcademicTermDto } from '../src/academic-terms/dto/academic-term.dto';

const SET_UP_TIMEOUT = 60_000;

type ErrorBody = { code?: string };
type StoredTerm = { _id: Types.ObjectId; status: string };
type AuditRow = {
  action: string;
  targetId?: string;
  details?: { source?: string };
};

function asTerm(response: request.Response): AcademicTermDto {
  return response.body as AcademicTermDto;
}

function asError(response: request.Response): ErrorBody {
  return response.body as ErrorBody;
}

async function findAuditRows(
  connection: Connection,
  targetId: string,
): Promise<AuditRow[]> {
  const auditCollection = connection.collection<AuditRow>('auditlogs');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rows = await auditCollection.find({ targetId }).toArray();
    if (rows.length > 0) return rows;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return [];
}

describe('Academic terms (e2e)', () => {
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
    await connection.collection('users').deleteMany({});
    await connection.collection('academicterms').deleteMany({});
    await connection.collection('auditlogs').deleteMany({});
    await connection.collection('audit_outbox').deleteMany({});
    await app.close();
  });

  afterAll(async () => {
    await container.stop();
  });

  const makeUser = async (role: Role) => {
    const id = new Types.ObjectId();
    await connection.collection('users').insertOne({
      _id: id,
      login: `${role}_e2e`,
      role,
      email: `${role}@e2e.test`,
      firstName: 'A',
      lastName: 'B',
      status: 'active',
      passwordHash: 'x',
      refreshTokenHashes: [],
      studentProfiles: [],
      teacherProfile: undefined,
    });
    const token = jwtService.sign({
      sub: id.toHexString(),
      login: `${role}_e2e`,
      role,
    });
    return { id, token };
  };

  const body = {
    academicYear: '2026/2027',
    termNumber: 1,
    startsAt: '2026-09-01',
    endsAt: '2027-01-31',
  };

  it('GET /academic-terms/current returns 404 no_current_term when nothing is active', async () => {
    const { token } = await makeUser(Role.STUDENT);
    const res = await request(app.getHttpServer())
      .get('/api/academic-terms/current')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(asError(res).code).toBe('no_current_term');
  });

  it('admin creates and activates a term; student sees it as current', async () => {
    const admin = await makeUser(Role.ADMIN);
    const student = await makeUser(Role.STUDENT);

    const created = await request(app.getHttpServer())
      .post('/api/academic-terms')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);
    expect(created.status).toBe(201);
    expect(asTerm(created)).toMatchObject({
      status: 'planned',
      maupAcademicYear: 2026,
      maupSemester: 1,
    });

    const activated = await request(app.getHttpServer())
      .post(`/api/academic-terms/${asTerm(created).id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(activated.status).toBe(201);
    expect(asTerm(activated).status).toBe('current');

    const current = await request(app.getHttpServer())
      .get('/api/academic-terms/current')
      .set('Authorization', `Bearer ${student.token}`);
    expect(current.status).toBe(200);
    expect(asTerm(current).id).toBe(asTerm(created).id);
  });

  it('activate records exactly one audit row, not an http-fallback duplicate', async () => {
    const admin = await makeUser(Role.ADMIN);
    const created = asTerm(
      await request(app.getHttpServer())
        .post('/api/academic-terms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(body),
    );
    await request(app.getHttpServer())
      .post(`/api/academic-terms/${created.id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`);

    const rows = await findAuditRows(connection, created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('academic_term.activate');

    const auditCollection = connection.collection<AuditRow>('auditlogs');
    const fallbackCount = await auditCollection.countDocuments({
      targetId: created.id,
      'details.source': 'http-fallback',
    });
    expect(fallbackCount).toBe(0);
  });

  it('activating a second term closes the first; only one current exists', async () => {
    const admin = await makeUser(Role.ADMIN);
    const first = asTerm(
      await request(app.getHttpServer())
        .post('/api/academic-terms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(body),
    );
    const second = asTerm(
      await request(app.getHttpServer())
        .post('/api/academic-terms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          ...body,
          termNumber: 2,
          startsAt: '2027-02-01',
          endsAt: '2027-06-30',
        }),
    );
    await request(app.getHttpServer())
      .post(`/api/academic-terms/${first.id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`);
    await request(app.getHttpServer())
      .post(`/api/academic-terms/${second.id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`);

    const docs = await connection
      .collection<StoredTerm>('academicterms')
      .find({})
      .toArray();
    expect(docs.filter((d) => d.status === 'current')).toHaveLength(1);
    expect(docs.find((d) => d._id.toHexString() === first.id)?.status).toBe(
      'closed',
    );
  });

  it('non-admin cannot create', async () => {
    const dean = await makeUser(Role.DEAN);
    const res = await request(app.getHttpServer())
      .post('/api/academic-terms')
      .set('Authorization', `Bearer ${dean.token}`)
      .send(body);
    expect(res.status).toBe(403);
  });

  it('duplicate {academicYear, termNumber} returns 409', async () => {
    const admin = await makeUser(Role.ADMIN);
    await request(app.getHttpServer())
      .post('/api/academic-terms')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);
    const dup = await request(app.getHttpServer())
      .post('/api/academic-terms')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);
    expect(dup.status).toBe(409);
  });

  it('update and delete are rejected once a term is no longer planned', async () => {
    const admin = await makeUser(Role.ADMIN);
    const created = asTerm(
      await request(app.getHttpServer())
        .post('/api/academic-terms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(body),
    );
    await request(app.getHttpServer())
      .post(`/api/academic-terms/${created.id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`);

    const update = await request(app.getHttpServer())
      .patch(`/api/academic-terms/${created.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ endsAt: '2027-02-28' });
    expect(update.status).toBe(409);

    const remove = await request(app.getHttpServer())
      .delete(`/api/academic-terms/${created.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(remove.status).toBe(409);
  });

  it('/health/ready is degraded without a current term and ready with one', async () => {
    const before = await request(app.getHttpServer()).get('/api/health/ready');
    expect(before.status).toBe(200);
    expect(before.body).toEqual({
      status: 'degraded',
      checks: { mongodb: 'ok', academicTerm: 'missing' },
    });

    const admin = await makeUser(Role.ADMIN);
    const created = asTerm(
      await request(app.getHttpServer())
        .post('/api/academic-terms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(body),
    );
    await request(app.getHttpServer())
      .post(`/api/academic-terms/${created.id}/activate`)
      .set('Authorization', `Bearer ${admin.token}`);

    const after = await request(app.getHttpServer()).get('/api/health/ready');
    expect(after.body).toEqual({
      status: 'ready',
      checks: { mongodb: 'ok', academicTerm: 'ok' },
    });
  });

  it('parallel activation of two terms still leaves exactly one current', async () => {
    const admin = await makeUser(Role.ADMIN);
    const first = asTerm(
      await request(app.getHttpServer())
        .post('/api/academic-terms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send(body),
    );
    const second = asTerm(
      await request(app.getHttpServer())
        .post('/api/academic-terms')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          ...body,
          termNumber: 2,
          startsAt: '2027-02-01',
          endsAt: '2027-06-30',
        }),
    );

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/academic-terms/${first.id}/activate`)
        .set('Authorization', `Bearer ${admin.token}`),
      request(app.getHttpServer())
        .post(`/api/academic-terms/${second.id}/activate`)
        .set('Authorization', `Bearer ${admin.token}`),
    ]);

    expect(responses.some((res) => res.status === 201)).toBe(true);

    const docs = await connection
      .collection<StoredTerm>('academicterms')
      .find({})
      .toArray();
    expect(docs.filter((doc) => doc.status === 'current')).toHaveLength(1);
  });
});
