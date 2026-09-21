import { Injectable, Logger } from '@nestjs/common';
import { MaupStudentApiClient } from './maup-student-api.client';
import { MaupReferenceEndpoint, MaupWireValue } from './maup-student-api.types';

const REFERENCE_TTL_MS = 24 * 60 * 60 * 1000;

type ReferenceFields = { idField: string; nameField: string };

// Кожен довідник MAUP API має власні імена полів id/назви — спільних `id`/`name`
// не існує в жодному з них. Джерело: документація https://api.maup.com.ua/api,
// звірено 2026-09-21.
const MAUP_REFERENCE_FIELDS: Record<MaupReferenceEndpoint, ReferenceFields> = {
  groups: { idField: 'group_id', nameField: 'group_name' },
  institutes: { idField: 'institute_id', nameField: 'institute_name' },
  pairkind: { idField: 'pair_kind_id', nameField: 'pair_kind' },
  paytype: { idField: 'pay_type_id', nameField: 'pay_type' },
  payperiod: { idField: 'pay_period_id', nameField: 'pay_period' },
  orderoperation: { idField: 'operation_id', nameField: 'operation' },
  formlearn: { idField: 'form_learn_id', nameField: 'form_learn_name' },
  levellearn: { idField: 'level_learn_id', nameField: 'level_learn_name' },
  scheduleauditorium: {
    idField: 'auditorium_id',
    nameField: 'auditorium_name',
  },
  scheduleprepod: { idField: 'prepod_id', nameField: 'prepod_name' },
  marktypes: { idField: 'marktype_id', nameField: 'marktype' },
  testtypes: { idField: 'testtype_id', nameField: 'title' },
  subjkinds: { idField: 'subjkind_id', nameField: 'subjkind' },
  pairkinds: { idField: 'pair_kind_id', nameField: 'title' },
  chairs: { idField: 'chair_id', nameField: 'chair_name' },
  chairsubjects: { idField: 'subject_id', nameField: 'subject_name' },
};

type Entry = { map: Map<string, string>; expiresAt: number };

@Injectable()
export class MaupReferenceCacheService {
  private readonly logger = new Logger(MaupReferenceCacheService.name);
  private readonly entries = new Map<MaupReferenceEndpoint, Entry>();

  constructor(private readonly client: MaupStudentApiClient) {}

  async getMap(endpoint: MaupReferenceEndpoint): Promise<Map<string, string>> {
    const now = Date.now();
    const cached = this.entries.get(endpoint);
    if (cached && cached.expiresAt > now) {
      return cached.map;
    }
    try {
      const rows = await this.client.getReference(endpoint);
      const { idField, nameField } = MAUP_REFERENCE_FIELDS[endpoint];
      const map = new Map<string, string>();
      for (const row of rows) {
        if (!isRecord(row)) continue;
        const id = row[idField];
        const name = row[nameField];
        if (
          (typeof id === 'string' || typeof id === 'number') &&
          typeof name === 'string'
        ) {
          map.set(String(id), name.trim());
        }
      }
      this.entries.set(endpoint, { map, expiresAt: now + REFERENCE_TTL_MS });
      return map;
    } catch (error: unknown) {
      this.logger.warn(
        `reference ${endpoint} unavailable: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      return cached?.map ?? new Map();
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

function isRecord(
  value: MaupWireValue,
): value is Record<string, MaupWireValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
