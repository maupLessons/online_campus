import { Logger } from '@nestjs/common';
import { upsertPublicAdministrationCatalog } from '../seed-data/catalogs/public-administration-electives';
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
  {
    id: '202609200001-elective-selection-partial-unique-indexes',
    description:
      'Drop pre-plan-06 non-partial unique indexes on electiveselections ' +
      '({period,student,discipline} and {period,student,choiceSlot}) so ' +
      'Mongoose can (re)create the partial unique replacements',
    fingerprint: 'elective-selection-partial-unique-indexes-v1',
    async up(database): Promise<void> {
      const exists = await database
        .listCollections({ name: 'electiveselections' })
        .toArray();
      if (exists.length === 0) {
        return;
      }

      const collection = database.collection('electiveselections');
      const staleKeySignatures = new Set([
        JSON.stringify({ period: 1, student: 1, discipline: 1 }),
        JSON.stringify({ period: 1, student: 1, choiceSlot: 1 }),
      ]);

      const indexes = await collection.indexes();
      for (const index of indexes) {
        if (!index.name || index.partialFilterExpression) {
          continue;
        }
        if (staleKeySignatures.has(JSON.stringify(index.key))) {
          await collection.dropIndex(index.name);
        }
      }
    },
  },
  {
    id: '202611180001-public-administration-electives',
    description:
      'Add the public administration department and its 26 elective disciplines for the current term',
    fingerprint: 'public-administration-electives-v1',
    async up(database): Promise<void> {
      const logger = new Logger('PublicAdministrationCatalogMigration');
      // An empty database is a fresh install: the demo seeder adds the catalog
      // after the reference data, so creating the faculty here would make the
      // faculty/department seeders skip their mock data.
      if ((await database.collection('users').estimatedDocumentCount()) === 0) {
        logger.log(
          'Public administration catalog skipped: empty database (fresh install)',
        );
        return;
      }
      await upsertPublicAdministrationCatalog(database, logger);
    },
  },
];
