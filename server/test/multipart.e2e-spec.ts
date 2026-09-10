import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import * as request from 'supertest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { Role } from '../src/common/types/roles.enum';
import { FilesController } from '../src/files/files.controller';
import { FilesService } from '../src/files/files.service';
import { ReferencesController } from '../src/references/references.controller';
import { ReferencesImportService } from '../src/references/references-import.service';

const PDF_FILE = Buffer.from('%PDF-1.4\n% Multipart regression fixture\n');
const CSV_FILE = Buffer.from('name\nExample\n');

describe('Single-file multipart boundaries (e2e)', () => {
  let app: NestExpressApplication;
  const saveFile = jest.fn().mockResolvedValue({ id: 'uploaded-file' });
  const importFile = jest.fn().mockResolvedValue({ imported: 1 });

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      controllers: [FilesController, ReferencesController],
      providers: [
        { provide: FilesService, useValue: { saveFile } },
        { provide: ReferencesImportService, useValue: { import: importFile } },
      ],
    })
      .useMocker(() => ({}))
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest<
            Request & {
              user?: { sub: string; login: string; role: Role };
            }
          >();
          if (req.get('Authorization') !== 'Bearer multipart-test-session') {
            throw new UnauthorizedException();
          }
          req.user = {
            sub: 'multipart-test-user',
            login: 'multipart-test-user',
            role: Role.ADMIN,
          };
          return true;
        },
      })
      .compile();

    app = fixture.createNestApplication<NestExpressApplication>();
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app?.close();
  });

  const endpoints = [
    {
      path: '/files/upload',
      file: PDF_FILE,
      filename: 'document.pdf',
      contentType: 'application/pdf',
      maxSize: 10 * 1024 * 1024,
      handler: saveFile,
    },
    {
      path: '/references/admin/groups/import',
      file: CSV_FILE,
      filename: 'groups.csv',
      contentType: 'text/csv',
      maxSize: 2 * 1024 * 1024,
      handler: importFile,
    },
  ];

  describe.each(endpoints)('$path', (endpoint) => {
    function upload() {
      return request(app.getHttpServer())
        .post(endpoint.path)
        .set('Authorization', 'Bearer multipart-test-session')
        .timeout({ response: 3000, deadline: 5000 });
    }

    function expectNoDomainCalls() {
      expect(saveFile).not.toHaveBeenCalled();
      expect(importFile).not.toHaveBeenCalled();
    }

    it('accepts one legitimate file without text fields', async () => {
      await upload()
        .attach('file', endpoint.file, {
          filename: endpoint.filename,
          contentType: endpoint.contentType,
        })
        .expect(201);

      expect(endpoint.handler).toHaveBeenCalledTimes(1);
      if (endpoint.path === '/files/upload') {
        expect(endpoint.handler).toHaveBeenCalledWith(
          expect.objectContaining({ buffer: endpoint.file }),
          'multipart-test-user',
          expect.any(Object),
        );
      } else {
        expect(endpoint.handler).toHaveBeenCalledWith(
          'groups',
          expect.objectContaining({ buffer: endpoint.file }),
          undefined,
          undefined,
        );
      }
    });

    it('requires authentication before parsing an upload', async () => {
      await request(app.getHttpServer())
        .post(endpoint.path)
        .attach('file', endpoint.file, endpoint.filename)
        .expect(401);
      expectNoDomainCalls();
    });

    it.each([
      'note',
      'data[2][name]',
      'data[invalid][nested]',
      '__proto__[value]',
    ])(
      'rejects the unexpected text field %s without reaching domain services',
      async (fieldName) => {
        await upload()
          .field(fieldName, 'small harmless fixture')
          .attach('file', endpoint.file, endpoint.filename)
          .expect(400);
        expectNoDomainCalls();
      },
    );

    it('rejects a text field after the valid file', async () => {
      await upload()
        .attach('file', endpoint.file, endpoint.filename)
        .field('note', 'not part of the upload contract')
        .expect(400);
      expectNoDomainCalls();
    });

    it('rejects a second file', async () => {
      await upload()
        .attach('file', endpoint.file, endpoint.filename)
        .attach('file', endpoint.file, endpoint.filename)
        .expect(400);
      expectNoDomainCalls();
    });

    it('rejects an unexpected file field', async () => {
      await upload()
        .attach('attachment', endpoint.file, endpoint.filename)
        .expect(400);
      expectNoDomainCalls();
    });

    it('bounds file field names', async () => {
      await upload()
        .attach('f'.repeat(101), endpoint.file, endpoint.filename)
        .expect(400);
      expectNoDomainCalls();
    });

    it('bounds the total number of parts, including ignored dispositions', async () => {
      const boundary = 'multipart-regression-boundary';
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\n` +
            'Content-Disposition: attachment; name="ignored"\r\n\r\n' +
            `ignored part\r\n--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${endpoint.filename}"\r\n` +
            `Content-Type: ${endpoint.contentType}\r\n\r\n`,
        ),
        endpoint.file,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);

      await upload()
        .set('Content-Type', `multipart/form-data; boundary=${boundary}`)
        .send(body)
        .expect(400);
      expectNoDomainCalls();
    });

    it('preserves the endpoint-specific file size limit', async () => {
      await upload()
        .attach('file', Buffer.alloc(endpoint.maxSize + 1), endpoint.filename)
        .expect(413);
      expectNoDomainCalls();
    });

    it('rejects malformed multipart bodies with no boundary', async () => {
      await upload()
        .set('Content-Type', 'multipart/form-data')
        .send('malformed multipart fixture')
        .expect(400);
      expectNoDomainCalls();
    });
  });
});
