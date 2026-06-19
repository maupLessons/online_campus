import { Db } from 'mongodb';

export interface DatabaseMigration {
  id: string;
  description: string;
  fingerprint: string;
  up(database: Db): Promise<void>;
}

export interface AppliedDatabaseMigration {
  _id: string;
  checksum: string;
  description: string;
  appliedAt: Date;
  durationMs: number;
  instanceId: string;
}

export interface DatabaseMigrationLock {
  _id: string;
  owner: string;
  lockedUntil: Date;
  acquiredAt: Date;
}
