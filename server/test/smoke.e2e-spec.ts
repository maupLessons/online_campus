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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [SmokeModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app, { swaggerEnabled: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
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
});
