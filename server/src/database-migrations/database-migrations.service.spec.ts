import { ConfigService } from '@nestjs/config';
import { Connection } from 'mongoose';
import { DatabaseMigration } from './database-migration.types';
import {
  assertAppliedMigrationsAreCompatible,
  DatabaseMigrationsService,
  getMigrationChecksum,
  getMigrationHeartbeatInterval,
  getMigrationIdHash,
  getPendingMigrations,
  validateMigrationRegistry,
} from './database-migrations.service';

function migration(
  id = '202606180001-test-migration',
  fingerprint = 'test-v1',
): DatabaseMigration {
  return {
    id,
    fingerprint,
    description: 'Test migration',
    up: jest.fn().mockResolvedValue(undefined),
  };
}

describe('DatabaseMigrationsService', () => {
  it('does not access MongoDB when migrations are disabled', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'DB_MIGRATIONS_ENABLED' ? 'false' : undefined,
      ),
    } as unknown as ConfigService;
    const connection = {} as Connection;
    const service = new DatabaseMigrationsService(config, connection, []);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('produces a stable checksum and detects fingerprint changes', () => {
    expect(getMigrationChecksum(migration())).toBe(
      getMigrationChecksum(migration()),
    );
    expect(getMigrationChecksum(migration())).not.toBe(
      getMigrationChecksum(migration(undefined, 'test-v2')),
    );
  });

  it('renews a migration lock well before its TTL expires', () => {
    expect(getMigrationHeartbeatInterval(300_000)).toBe(100_000);
    expect(getMigrationHeartbeatInterval(5_000)).toBe(1_666);
    expect(getMigrationHeartbeatInterval(1_500)).toBe(1_000);
  });

  it('rejects duplicate and unordered migration ids', () => {
    const first = migration('202606180001-first');
    const second = migration('202606180002-second');

    expect(() => validateMigrationRegistry([first, first])).toThrow(
      /must be unique/,
    );
    expect(() => validateMigrationRegistry([second, first])).toThrow(
      /must be ordered/,
    );
  });

  it('rejects unknown or modified migrations already applied to the database', () => {
    const item = migration();
    const applied = {
      _id: item.id,
      checksum: getMigrationChecksum(item),
      description: item.description,
      appliedAt: new Date(),
      durationMs: 1,
      instanceId: 'test',
    };

    expect(() =>
      assertAppliedMigrationsAreCompatible([applied], [item]),
    ).not.toThrow();
    expect(() => assertAppliedMigrationsAreCompatible([applied], [])).toThrow(
      /unknown migration/,
    );
    expect(() =>
      assertAppliedMigrationsAreCompatible(
        [applied],
        [migration(undefined, 'changed')],
      ),
    ).toThrow(/checksum mismatch/);
  });

  it('accepts only an exact cryptographic identity for a retired ledger record', () => {
    const applied = {
      _id: '202606180001-retired-test-migration',
      checksum: 'retired-checksum',
      description: 'Retired test migration',
      appliedAt: new Date(),
      durationMs: 1,
      instanceId: 'test',
    };
    const retired = [
      {
        idHash: getMigrationIdHash(applied._id),
        checksum: applied.checksum,
      },
    ];

    expect(() =>
      assertAppliedMigrationsAreCompatible([applied], [], retired),
    ).not.toThrow();
    expect(() =>
      assertAppliedMigrationsAreCompatible(
        [{ ...applied, checksum: 'modified' }],
        [],
        retired,
      ),
    ).toThrow(/unknown migration/);
    expect(() =>
      assertAppliedMigrationsAreCompatible(
        [{ ...applied, _id: '202606180002-other-migration' }],
        [],
        retired,
      ),
    ).toThrow(/unknown migration/);
  });

  it('does not treat extra retired ledger records as pending migrations', () => {
    const current = migration();
    const currentRecord = {
      _id: current.id,
      checksum: getMigrationChecksum(current),
      description: current.description,
      appliedAt: new Date(),
      durationMs: 1,
      instanceId: 'test',
    };
    const retiredRecord = {
      ...currentRecord,
      _id: '202606170001-retired-test-migration',
    };

    expect(
      getPendingMigrations([currentRecord, retiredRecord], [current]),
    ).toEqual([]);
    expect(getPendingMigrations([retiredRecord], [current])).toEqual([current]);
  });
});
