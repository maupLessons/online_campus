import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Connection, Types } from 'mongoose';
import { getConnectionToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../src/common/types/roles.enum';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { MaterialDto } from '../src/courses/materials/dto';
import { SeedService } from '../src/seed-data/seed.service';
import { PaginatedDto } from '../src/common/dto/paginated.dto';
import { describeWithDb } from './e2e-db';

process.env.JWT_SECRET = 'test-secret-key-for-e2e-testing';

const SET_UP_TIMEOUT = 60_000;

describeWithDb('Materials (e2e)', () => {
  let app: INestApplication<App>;
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

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    connection = app.get(getConnectionToken());
    jwtService = app.get(JwtService);
  });

  afterEach(async () => {
    if (connection) {
      await connection.collection('users').deleteMany({});
      await connection.collection('courseassignments').deleteMany({});
      await connection.collection('materials').deleteMany({});
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

  const setupMaterials = async () => {
    const teacherId = new Types.ObjectId();
    const courseAssignmentId = new Types.ObjectId();
    const accessToken = jwtService.sign({
      sub: teacherId.toHexString(),
      login: 'teacher_e2e',
      role: Role.TEACHER,
    });

    // Seed necessary data
    await connection.collection('users').insertOne({
      _id: teacherId,
      login: 'teacher_e2e',
      email: 'teacher_e2e@example.com',
      role: Role.TEACHER,
      status: 'active',
      firstName: 'Test',
      lastName: 'Teacher',
      passwordHash: 'hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await connection.collection('courseassignments').insertOne({
      _id: courseAssignmentId,
      teacher: teacherId,
      course: new Types.ObjectId(),
      group: new Types.ObjectId(),
      academicYear: '2023-2024',
      semester: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return { teacherId, courseAssignmentId, accessToken };
  };

  describe('POST /courses/:courseAssignmentId/materials', () => {
    it('should create a material (201)', async () => {
      const { courseAssignmentId, accessToken } = await setupMaterials();
      const response = await request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'E2E Test Material',
          description: 'E2E Description',
          fileIds: [],
        })
        .expect(201);

      const body = response.body as MaterialDto;
      expect(body.title).toBe('E2E Test Material');
      expect(body.id).toBeDefined();
    });

    it('should fail if unauthorized (401)', async () => {
      const { courseAssignmentId } = await setupMaterials();
      return request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .send({
          title: 'Unauthorized Material',
        })
        .expect(401);
    });

    it('should fail if user is not the teacher (403)', async () => {
      const { courseAssignmentId } = await setupMaterials();
      const otherUserId = new Types.ObjectId();
      await connection.collection('users').insertOne({
        _id: otherUserId,
        login: 'other_user',
        email: 'other@example.com',
        role: Role.TEACHER,
        status: 'active',
        firstName: 'Other',
        lastName: 'User',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const otherUserToken = jwtService.sign({
        sub: otherUserId.toHexString(),
        login: 'other_user',
        role: Role.TEACHER,
      });

      return request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .set('Authorization', `Bearer ${otherUserToken}`)
        .send({
          title: 'Forbidden Material',
        })
        .expect(403);
    });
  });

  describe('GET /courses/:courseAssignmentId/materials', () => {
    it('should get materials for course assignment (200)', async () => {
      const { courseAssignmentId, accessToken } = await setupMaterials();
      // First create a material so there is something to GET
      const createRes = await request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Get Test Material',
          fileIds: [],
        })
        .expect(201);

      const materialId = (createRes.body as MaterialDto).id;

      const response = await request(app.getHttpServer())
        .get(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<MaterialDto>;
      expect(body.docs).toBeDefined();
      expect(Array.isArray(body.docs)).toBe(true);
      expect(body.docs.some((m) => m.id === materialId)).toBe(true);
    });
  });

  describe('PUT /courses/:courseAssignmentId/materials/:id', () => {
    it('should update material (200)', async () => {
      const { courseAssignmentId, accessToken } = await setupMaterials();
      const createRes = await request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Before Update',
          fileIds: [],
        })
        .expect(201);

      const materialId = (createRes.body as MaterialDto).id;

      const response = await request(app.getHttpServer())
        .put(
          `/courses/${courseAssignmentId.toHexString()}/materials/${materialId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Updated E2E Title',
        })
        .expect(200);

      const body = response.body as MaterialDto;
      expect(body.title).toBe('Updated E2E Title');
    });

    it('should return 404 for non-existent material', async () => {
      const { courseAssignmentId, accessToken } = await setupMaterials();
      const fakeId = new Types.ObjectId().toHexString();
      return request(app.getHttpServer())
        .put(`/courses/${courseAssignmentId.toHexString()}/materials/${fakeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'New Title' })
        .expect(404);
    });
  });

  describe('DELETE /courses/:courseAssignmentId/materials/:id', () => {
    it('should delete material (200)', async () => {
      const { courseAssignmentId, accessToken } = await setupMaterials();
      const createRes = await request(app.getHttpServer())
        .post(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'To Delete',
          fileIds: [],
        })
        .expect(201);

      const materialId = (createRes.body as MaterialDto).id;

      await request(app.getHttpServer())
        .delete(
          `/courses/${courseAssignmentId.toHexString()}/materials/${materialId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/courses/${courseAssignmentId.toHexString()}/materials`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const body = response.body as PaginatedDto<MaterialDto>;
      expect(body.docs.some((m) => m.id === materialId)).toBe(false);
    });
  });
});
