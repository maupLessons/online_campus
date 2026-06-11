import { Body, Controller, HttpCode, Module, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as request from 'supertest';
import { IsString } from 'class-validator';
import { configureApp } from '../src/app.config';

class SmokeDto {
  @IsString()
  name!: string;
}

@Controller('smoke')
class SmokeController {
  @Post()
  @HttpCode(200)
  echo(@Body() body: SmokeDto): SmokeDto {
    return body;
  }
}

@Module({
  controllers: [SmokeController],
})
class SmokeModule {}

describe('Application configuration (e2e smoke)', () => {
  let app: NestExpressApplication;
  let previousClientUrl: string | undefined;

  beforeAll(async () => {
    previousClientUrl = process.env.CLIENT_URL;
    process.env.CLIENT_URL = 'http://localhost:5173';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SmokeModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, { swaggerEnabled: false });
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app.close();
    if (previousClientUrl === undefined) {
      delete process.env.CLIENT_URL;
    } else {
      process.env.CLIENT_URL = previousClientUrl;
    }
  });

  it('returns a deterministic API health payload', async () => {
    await request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ message: 'API is running' });
      });
  });

  it('rejects unexpected request body fields', async () => {
    await request(app.getHttpServer())
      .post('/api/smoke')
      .send({ name: 'Campus', role: 'admin' })
      .expect(400)
      .expect(({ body }) => {
        const responseBody = body as { message: string[] };
        expect(responseBody.message).toContain(
          'property role should not exist',
        );
      });
  });

  it('allows the configured browser origin with credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/smoke')
      .set('Origin', 'http://localhost:5173')
      .send({ name: 'Campus' })
      .expect(200)
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173')
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('silently omits CORS headers for an untrusted origin', async () => {
    await request(app.getHttpServer())
      .post('/api/smoke')
      .set('Origin', 'https://evil.example')
      .send({ name: 'Campus' })
      .expect(200)
      .expect(({ headers }) => {
        expect(headers['access-control-allow-origin']).toBeUndefined();
        expect(headers['access-control-allow-credentials']).toBeUndefined();
      });
  });
});
