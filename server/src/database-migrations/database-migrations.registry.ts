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
];
