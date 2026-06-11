import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import * as ExcelJS from 'exceljs';
import { Connection, Types } from 'mongoose';
import type { Response as SuperAgentResponse } from 'superagent';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.config';
import { Role } from '../src/common/types/roles.enum';
import {
  SurveyQuestionType,
  SurveyStatus,
  SurveyTargetType,
} from '../src/surveys/schemas';
import { SeedService } from '../src/seed-data/seed.service';

const SETUP_TIMEOUT = 120_000;
const TEST_JWT_SECRET = 'surveys-e2e-secret-with-sufficient-entropy';
const TEST_CSRF_SECRET = 'surveys-e2e-csrf-secret-with-sufficient-entropy';

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
};

type Fixture = {
  admin: Actor;
  deanA: Actor;
  deanB: Actor;
  teacher: Actor;
  studentA: Actor;
  studentB: Actor;
  outsider: Actor;
  groupAId: Types.ObjectId;
  groupBId: Types.ObjectId;
};

type SurveyBody = {
  id: string;
  title: string;
  status: SurveyStatus;
  startDate?: string;
  questions: Array<{ id: string; type: SurveyQuestionType }>;
};

describe('Surveys (e2e)', () => {
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
    )}/surveys-e2e`;
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
      passwordHash: 'not-used-in-token-e2e',
      role,
      email: `${role}_${suffix}@example.test`,
      firstName: role,
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
        login: `${role}_${suffix}`,
        role,
      }),
    };
  };

  const seedFixture = async (): Promise<Fixture> => {
    const groupAId = new Types.ObjectId();
    const groupBId = new Types.ObjectId();

    await collection('Group').insertMany([
      {
        _id: groupAId,
        code: 'SURVEY-A',
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: groupBId,
        code: 'SURVEY-B',
        specialty: new Types.ObjectId(),
        course: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const admin = await createActor(Role.ADMIN, 'admin');
    const deanA = await createActor(Role.DEAN, 'dean-a');
    const deanB = await createActor(Role.DEAN, 'dean-b');
    const teacher = await createActor(Role.TEACHER, 'teacher');
    const studentA = await createActor(Role.STUDENT, 'student-a', {
      studentProfile: {
        group: groupAId,
        recordBookNumber: 'SURVEY-A-1',
        year: 1,
      },
    });
    const studentB = await createActor(Role.STUDENT, 'student-b', {
      studentProfile: {
        group: groupAId,
        recordBookNumber: 'SURVEY-A-2',
        year: 1,
      },
    });
    const outsider = await createActor(Role.STUDENT, 'outsider', {
      studentProfile: {
        group: groupBId,
        recordBookNumber: 'SURVEY-B-1',
        year: 1,
      },
    });

    return {
      admin,
      deanA,
      deanB,
      teacher,
      studentA,
      studentB,
      outsider,
      groupAId,
      groupBId,
    };
  };

  const createSurvey = async (
    actor: Actor,
    groupId: Types.ObjectId,
    overrides: Record<string, unknown> = {},
  ): Promise<SurveyBody> => {
    const now = Date.now();
    const response = await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({
        title: 'Enterprise survey',
        description: 'Survey lifecycle E2E coverage',
        anonymous: true,
        targetType: SurveyTargetType.GROUPS,
        targetIds: [groupId.toHexString()],
        startDate: new Date(now - 60_000).toISOString(),
        endDate: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
        questions: [
          {
            type: SurveyQuestionType.SINGLE,
            text: 'Choose one',
            options: ['A', 'B'],
            required: true,
            order: 0,
          },
          {
            type: SurveyQuestionType.MULTIPLE,
            text: 'Choose many',
            options: ['X', 'Y', 'Z'],
            required: true,
            order: 1,
          },
          {
            type: SurveyQuestionType.RATING,
            text: 'Rate',
            required: true,
            order: 2,
          },
          {
            type: SurveyQuestionType.TEXT,
            text: 'Comment',
            required: false,
            order: 3,
          },
        ],
        ...overrides,
      })
      .expect(201);

    return response.body as SurveyBody;
  };

  const publishSurvey = async (
    actor: Actor,
    surveyId: string,
  ): Promise<SurveyBody> => {
    const response = await request(app.getHttpServer())
      .patch(`/api/surveys/${surveyId}/publish`)
      .set('Authorization', `Bearer ${actor.token}`)
      .expect(200);

    return response.body as SurveyBody;
  };

  it('enforces manager ownership and preserves scheduled publication', async () => {
    const fixture = await seedFixture();
    const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Authorization', `Bearer ${fixture.teacher.token}`)
      .send({})
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/surveys')
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .send({
        title: 'Survey without lifecycle dates',
        targetType: SurveyTargetType.ALL,
        questions: [
          {
            type: SurveyQuestionType.TEXT,
            text: 'Comment',
            required: true,
            order: 0,
          },
        ],
      })
      .expect(400);

    const draft = await createSurvey(fixture.deanA, fixture.groupAId, {
      startDate: futureStart,
      endDate: futureEnd,
    });

    const deanBList = await request(app.getHttpServer())
      .get('/api/surveys')
      .set('Authorization', `Bearer ${fixture.deanB.token}`)
      .expect(200);
    expect(deanBList.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`/api/surveys/${draft.id}`)
      .set('Authorization', `Bearer ${fixture.deanB.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/surveys/${draft.id}/results`)
      .set('Authorization', `Bearer ${fixture.deanB.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/surveys/${draft.id}/results`)
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/surveys/${draft.id}/close`)
      .set('Authorization', `Bearer ${fixture.deanA.token}`)
      .expect(400);

    const published = await publishSurvey(fixture.deanA, draft.id);
    expect(published.status).toBe(SurveyStatus.ACTIVE);
    expect(published.startDate).toBe(futureStart);

    const activeList = await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    expect(activeList.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`/api/surveys/${draft.id}`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/surveys/${draft.id}/respond`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .send({ answers: [] })
      .expect(400);
  });

  it('enforces group targeting and accepts an empty optional response', async () => {
    const fixture = await seedFixture();
    const draft = await createSurvey(fixture.admin, fixture.groupAId, {
      anonymous: false,
      questions: [
        {
          type: SurveyQuestionType.TEXT,
          text: 'Optional comment',
          required: false,
          order: 0,
        },
      ],
    });
    await publishSurvey(fixture.admin, draft.id);

    await request(app.getHttpServer())
      .get(`/api/surveys/${draft.id}`)
      .set('Authorization', `Bearer ${fixture.outsider.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/surveys/${draft.id}`)
      .set('Authorization', `Bearer ${fixture.teacher.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/surveys/${draft.id}/respond`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .send({ answers: [] })
      .expect(201);

    const state = await request(app.getHttpServer())
      .get(`/api/surveys/${draft.id}/my-response`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    expect(state.body).toMatchObject({
      completed: true,
      anonymous: false,
      response: { answers: [] },
    });
  });

  it('stores anonymous answers without identity and rejects concurrent duplicates', async () => {
    const fixture = await seedFixture();
    const draft = await createSurvey(fixture.admin, fixture.groupAId);
    const survey = await publishSurvey(fixture.admin, draft.id);
    const [single, multiple, rating, text] = survey.questions;
    const payload = {
      answers: [
        { questionId: single.id, value: 'A' },
        { questionId: multiple.id, value: ['X', 'Z'] },
        { questionId: rating.id, value: 5 },
        { questionId: text.id, value: '=1+1' },
      ],
    };

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/surveys/${survey.id}/respond`)
        .set('Authorization', `Bearer ${fixture.studentA.token}`)
        .send(payload),
      request(app.getHttpServer())
        .post(`/api/surveys/${survey.id}/respond`)
        .set('Authorization', `Bearer ${fixture.studentA.token}`)
        .send(payload),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);

    const storedResponse = await collection('SurveyResponse').findOne({
      survey: new Types.ObjectId(survey.id),
    });
    expect(storedResponse?.user).toBeNull();
    expect(
      await collection('SurveyCompletion').countDocuments({
        survey: new Types.ObjectId(survey.id),
        user: fixture.studentA.id,
      }),
    ).toBe(1);

    const ownState = await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}/my-response`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    expect(ownState.body).toEqual({
      completed: true,
      anonymous: true,
      response: null,
    });

    const activeList = await request(app.getHttpServer())
      .get('/api/surveys/active')
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
    expect(activeList.body).toEqual([
      expect.objectContaining({
        id: survey.id,
        completed: true,
      }),
    ]);
  });

  it('returns live statistics and exports secure CSV/XLSX only after closing', async () => {
    const fixture = await seedFixture();
    const draft = await createSurvey(fixture.admin, fixture.groupAId);
    const survey = await publishSurvey(fixture.admin, draft.id);
    const [single, multiple, rating, text] = survey.questions;

    await request(app.getHttpServer())
      .post(`/api/surveys/${survey.id}/respond`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .send({
        answers: [
          { questionId: single.id, value: 'A' },
          { questionId: multiple.id, value: ['X', 'Y'] },
          { questionId: rating.id, value: 4 },
          { questionId: text.id, value: '=HYPERLINK("https://example.test")' },
        ],
      })
      .expect(201);

    await collection('User').updateOne(
      { _id: fixture.outsider.id },
      { $set: { 'studentProfile.group': fixture.groupAId } },
    );

    const results = await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}/results`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(200);

    expect(results.body).toMatchObject({
      anonymous: true,
      totalResponses: 1,
      totalCompletions: 1,
      expectedRecipients: 2,
      completionRate: 50,
    });
    expect(JSON.stringify(results.body)).not.toContain(
      fixture.studentA.id.toHexString(),
    );

    await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}/results/export`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}/results/export?format=xlsx`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/surveys/${survey.id}/close`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(200);

    const csv = await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}/results/export`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200)
      .expect('Content-Type', /text\/csv/)
      .expect(
        'Content-Disposition',
        `attachment; filename="survey-${survey.id}-results.csv"`,
      )
      .expect('Cache-Control', 'private, no-store');
    expect(Buffer.isBuffer(csv.body)).toBe(true);
    const csvBuffer = csv.body as Buffer;
    expect([...csvBuffer.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const csvText = csvBuffer.toString('utf8');
    expect(csvText.startsWith('\uFEFF')).toBe(true);
    expect(csvText.split('\r\n')[0]).toContain(
      'Опитування;Статус;Анонімне;Цільова аудиторія',
    );
    expect(csvText).toContain(`'=HYPERLINK`);

    const xlsx = await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}/results/export?format=xlsx`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .buffer(true)
      .parse(parseBinaryResponse)
      .expect(200)
      .expect(
        'Content-Type',
        /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
      )
      .expect(
        'Content-Disposition',
        `attachment; filename="survey-${survey.id}-results.xlsx"`,
      )
      .expect('Cache-Control', 'private, no-store');
    expect(Buffer.isBuffer(xlsx.body)).toBe(true);

    const workbook = new ExcelJS.Workbook();
    const workbookData = Uint8Array.from(xlsx.body as Buffer).buffer;
    await workbook.xlsx.load(workbookData);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Зведення',
      'Розподіл відповідей',
      'Текстові відповіді',
    ]);
    expect(workbook.getWorksheet('Зведення')?.getCell('A1').value).toBe(
      'Результати опитування',
    );
    expect(workbook.getWorksheet('Зведення')?.getColumn(1).width).toBe(38);
    expect(
      workbook.getWorksheet('Текстові відповіді')?.getCell('D3').value,
    ).toBe(`'=HYPERLINK("https://example.test")`);

    await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}/results/export?format=pdf`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(400);
  });

  it('closes an active survey and rejects further responses', async () => {
    const fixture = await seedFixture();
    const draft = await createSurvey(fixture.admin, fixture.groupAId);
    const survey = await publishSurvey(fixture.admin, draft.id);

    const closed = await request(app.getHttpServer())
      .patch(`/api/surveys/${survey.id}/close`)
      .set('Authorization', `Bearer ${fixture.admin.token}`)
      .expect(200);
    expect((closed.body as SurveyBody).status).toBe(SurveyStatus.CLOSED);

    await request(app.getHttpServer())
      .post(`/api/surveys/${survey.id}/respond`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .send({ answers: [] })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/api/surveys/${survey.id}`)
      .set('Authorization', `Bearer ${fixture.studentA.token}`)
      .expect(200);
  });
});
