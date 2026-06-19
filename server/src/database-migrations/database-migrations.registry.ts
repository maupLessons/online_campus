import { DatabaseMigration } from './database-migration.types';

export const DATABASE_MIGRATIONS_TOKEN = Symbol('DATABASE_MIGRATIONS_TOKEN');

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    id: '202606180001-initialize-migration-ledger',
    description: 'Initialize the versioned MongoDB migration ledger',
    fingerprint: 'initialize-migration-ledger-v1',
    async up(): Promise<void> {
      // Baseline migration. Future schema/data changes are appended here.
    },
  },
];
