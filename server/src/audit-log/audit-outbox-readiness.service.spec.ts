import { ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
import { AuditOutboxReadinessService } from './audit-outbox-readiness.service';

describe('AuditOutboxReadinessService', () => {
  function createService(
    hello: Record<string, unknown>,
    enabled = 'true',
  ): AuditOutboxReadinessService {
    const connection = {
      db: {
        admin: () => ({
          command: jest
            .fn<Promise<Record<string, unknown>>, [Record<string, unknown>]>()
            .mockResolvedValue(hello),
        }),
      },
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'AUDIT_TRANSACTIONAL_OUTBOX' ? enabled : 'development',
      ),
    };

    return new AuditOutboxReadinessService(
      connection as unknown as Connection,
      config as unknown as ConfigService,
    );
  }

  it('accepts a configured replica set', async () => {
    const service = createService({ setName: 'rs0', isWritablePrimary: true });

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('rejects standalone MongoDB when transactions are enabled', async () => {
    const service = createService({ isWritablePrimary: true });

    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'AUDIT_TRANSACTIONAL_OUTBOX requires a MongoDB replica set',
    );
  });

  it('skips topology validation when transactional mode is disabled', async () => {
    const service = createService({}, 'false');

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });
});
