import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { createHash, randomUUID } from 'crypto';
import { Connection, mongo } from 'mongoose';
import {
  AppliedDatabaseMigration,
  DatabaseMigration,
  DatabaseMigrationLock,
} from './database-migration.types';
import { DATABASE_MIGRATIONS_TOKEN } from './database-migrations.registry';

const MIGRATIONS_COLLECTION = 'database_migrations';
const LOCKS_COLLECTION = 'database_migration_locks';
const GLOBAL_LOCK_ID = 'global';

export interface RetiredMigrationIdentity {
  idHash: string;
  checksum: string;
}

// Definitions remain absent from the runtime registry. Cryptographic identities
// preserve compatibility with ledgers that applied them before retirement.
const RETIRED_MIGRATIONS: readonly RetiredMigrationIdentity[] = [
  {
    idHash: '6a4f612cc4a06b93efd0a10b1d9813d109973ec3158840d710a42ab741ab30ba',
    checksum:
      '020f5bda5c00ee72c4c7ab34200c6d93d2aa2b3bbea90f43229c41e6656eaa7c',
  },
];

@Injectable()
export class DatabaseMigrationsService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseMigrationsService.name);
  private readonly instanceId = randomUUID();

  constructor(
    private readonly configService: ConfigService,
    @InjectConnection() private readonly connection: Connection,
    @Inject(DATABASE_MIGRATIONS_TOKEN)
    private readonly migrations: readonly DatabaseMigration[],
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log('Automatic database migrations are disabled.');
      return;
    }

    validateMigrationRegistry(this.migrations);
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB connection is unavailable for migrations');
    }

    const acquired = await this.waitForLock();
    if (!acquired) {
      await this.assertDatabaseIsCurrent();
      return;
    }

    try {
      await this.applyPendingMigrations();
    } finally {
      await database
        .collection<DatabaseMigrationLock>(LOCKS_COLLECTION)
        .deleteOne({ _id: GLOBAL_LOCK_ID, owner: this.instanceId });
    }
  }

  private async applyPendingMigrations(): Promise<void> {
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB connection is unavailable for migrations');
    }

    const records = database.collection<AppliedDatabaseMigration>(
      MIGRATIONS_COLLECTION,
    );
    const applied = await records.find({}).toArray();
    assertAppliedMigrationsAreCompatible(applied, this.migrations);
    const pending = getPendingMigrations(applied, this.migrations);

    if (pending.length === 0) {
      this.logger.log('Database schema is current.');
      return;
    }

    for (const migration of pending) {
      await this.renewLock();
      const startedAt = Date.now();
      this.logger.log(`Applying database migration ${migration.id}`);
      await this.runWithLockHeartbeat(() => migration.up(database));
      await records.insertOne({
        _id: migration.id,
        checksum: getMigrationChecksum(migration),
        description: migration.description,
        appliedAt: new Date(),
        durationMs: Date.now() - startedAt,
        instanceId: this.instanceId,
      });
      this.logger.log(`Applied database migration ${migration.id}`);
    }
  }

  private async waitForLock(): Promise<boolean> {
    const waitTimeoutMs = this.readPositiveNumber(
      'DB_MIGRATION_WAIT_TIMEOUT_MS',
      60_000,
    );
    const pollIntervalMs = this.readPositiveNumber(
      'DB_MIGRATION_POLL_INTERVAL_MS',
      1_000,
    );
    const deadline = Date.now() + waitTimeoutMs;

    while (Date.now() <= deadline) {
      if (await this.tryAcquireLock()) {
        return true;
      }
      await sleep(pollIntervalMs);
    }

    return false;
  }

  private async tryAcquireLock(): Promise<boolean> {
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB connection is unavailable for migrations');
    }

    const now = new Date();
    const lockedUntil = new Date(
      now.getTime() +
        this.readPositiveNumber('DB_MIGRATION_LOCK_TTL_MS', 300_000),
    );

    try {
      const lock = await database
        .collection<DatabaseMigrationLock>(LOCKS_COLLECTION)
        .findOneAndUpdate(
          {
            _id: GLOBAL_LOCK_ID,
            $or: [{ lockedUntil: { $lte: now } }, { owner: this.instanceId }],
          },
          {
            $set: {
              owner: this.instanceId,
              lockedUntil,
              acquiredAt: now,
            },
          },
          { upsert: true, returnDocument: 'after' },
        );

      return lock?.owner === this.instanceId;
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }
  }

  private async renewLock(): Promise<void> {
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB connection is unavailable for migrations');
    }

    const result = await database
      .collection<DatabaseMigrationLock>(LOCKS_COLLECTION)
      .updateOne(
        { _id: GLOBAL_LOCK_ID, owner: this.instanceId },
        {
          $set: {
            lockedUntil: new Date(
              Date.now() +
                this.readPositiveNumber('DB_MIGRATION_LOCK_TTL_MS', 300_000),
            ),
          },
        },
      );

    if (result.matchedCount !== 1) {
      throw new Error('Database migration lock was lost');
    }
  }

  private async runWithLockHeartbeat(operation: () => Promise<void>) {
    const intervalMs = getMigrationHeartbeatInterval(
      this.readPositiveNumber('DB_MIGRATION_LOCK_TTL_MS', 300_000),
    );
    let heartbeatError: unknown;
    let renewal = Promise.resolve();
    const timer = setInterval(() => {
      renewal = renewal
        .then(() => this.renewLock())
        .catch((error: unknown) => {
          heartbeatError = error;
          clearInterval(timer);
        });
    }, intervalMs);
    timer.unref();

    try {
      await operation();
    } finally {
      clearInterval(timer);
      await renewal;
    }

    if (heartbeatError) {
      throw heartbeatError instanceof Error
        ? heartbeatError
        : new Error('Database migration lock heartbeat failed');
    }
  }

  private async assertDatabaseIsCurrent(): Promise<void> {
    const database = this.connection.db;
    if (!database) {
      throw new Error('MongoDB connection is unavailable for migrations');
    }

    const applied = await database
      .collection<AppliedDatabaseMigration>(MIGRATIONS_COLLECTION)
      .find({})
      .toArray();
    assertAppliedMigrationsAreCompatible(applied, this.migrations);

    if (getPendingMigrations(applied, this.migrations).length > 0) {
      throw new Error(
        'Timed out waiting for another instance to finish database migrations',
      );
    }

    this.logger.log('Database migrations completed by another instance.');
  }

  private isEnabled(): boolean {
    const configured = this.configService.get<string>('DB_MIGRATIONS_ENABLED');
    if (configured === undefined) {
      return this.configService.get<string>('NODE_ENV') !== 'test';
    }
    return ['1', 'true', 'yes'].includes(configured.toLowerCase());
  }

  private readPositiveNumber(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}

export function getMigrationHeartbeatInterval(lockTtlMs: number): number {
  return Math.max(1_000, Math.floor(lockTtlMs / 3));
}

export function getMigrationChecksum(migration: DatabaseMigration): string {
  return createHash('sha256')
    .update(
      `${migration.id}\u0000${migration.description}\u0000${migration.fingerprint}`,
    )
    .digest('hex');
}

export function getMigrationIdHash(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

export function getPendingMigrations(
  applied: readonly AppliedDatabaseMigration[],
  migrations: readonly DatabaseMigration[],
): DatabaseMigration[] {
  const appliedIds = new Set(applied.map((migration) => migration._id));
  return migrations.filter((migration) => !appliedIds.has(migration.id));
}

export function validateMigrationRegistry(
  migrations: readonly DatabaseMigration[],
): void {
  const ids = migrations.map((migration) => migration.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('Database migration ids must be unique');
  }

  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  if (ids.some((id, index) => id !== sorted[index])) {
    throw new Error('Database migrations must be ordered by id');
  }

  for (const migration of migrations) {
    if (!/^\d{12,14}-[a-z0-9-]+$/.test(migration.id)) {
      throw new Error(`Invalid database migration id: ${migration.id}`);
    }
    if (!migration.description.trim() || !migration.fingerprint.trim()) {
      throw new Error(
        `Database migration ${migration.id} requires description and fingerprint`,
      );
    }
  }
}

export function assertAppliedMigrationsAreCompatible(
  applied: readonly AppliedDatabaseMigration[],
  migrations: readonly DatabaseMigration[],
  retiredMigrations: readonly RetiredMigrationIdentity[] = RETIRED_MIGRATIONS,
): void {
  const expected = new Map(
    migrations.map((migration) => [migration.id, migration]),
  );

  for (const record of applied) {
    const migration = expected.get(record._id);
    if (!migration) {
      const isRetired = retiredMigrations.some(
        (retired) =>
          retired.idHash === getMigrationIdHash(record._id) &&
          retired.checksum === record.checksum,
      );
      if (isRetired) {
        continue;
      }
      throw new Error(
        `Database contains unknown migration ${record._id}; refusing to run older code`,
      );
    }
    if (record.checksum !== getMigrationChecksum(migration)) {
      throw new Error(`Database migration checksum mismatch for ${record._id}`);
    }
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof mongo.MongoServerError && error.code === 11000;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
