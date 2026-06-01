import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/seed-data/seed.service';
import { configureApp } from '../src/app.config';

const SET_UP_TIMEOUT = 60_000;

describe('App (e2e)', () => {
  let app: NestExpressApplication;
  let container: StartedTestContainer;

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
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  afterAll(async () => {
    if (container) {
      await container.stop();
    }
  });

  it('/api/auth/profile (GET) requires authentication', () => {
    return request(app.getHttpServer()).get('/api/auth/profile').expect(401);
  });
});
