import { Injectable } from '@nestjs/common';
import { ScheduleSnapshotEntry } from './schemas/schedule-snapshot.schema';

export type ScheduleDiffField =
  'endTime' | 'classroom' | 'teacherName' | 'type' | 'controlType';
export type ScheduleDiffItem = {
  kind: 'added' | 'removed' | 'changed';
  entry: ScheduleSnapshotEntry;
  changedFields?: ScheduleDiffField[];
};

// Spec §7.2: for the session snapshot, controlType is also compared; for lessons it's always undefined,
// so a separate field list isn't needed.
const COMPARED_FIELDS: ScheduleDiffField[] = [
  'endTime',
  'classroom',
  'teacherName',
  'type',
  'controlType',
];

@Injectable()
export class ScheduleDiffService {
  diff(
    prev: ScheduleSnapshotEntry[],
    next: ScheduleSnapshotEntry[],
    today: string,
  ): ScheduleDiffItem[] {
    const prevMap = new Map(
      prev.filter((e) => e.date >= today).map((e) => [e.key, e]),
    );
    const nextMap = new Map(
      next.filter((e) => e.date >= today).map((e) => [e.key, e]),
    );
    const result: ScheduleDiffItem[] = [];

    for (const [key, entry] of nextMap) {
      const before = prevMap.get(key);
      if (!before) continue;
      const changedFields = COMPARED_FIELDS.filter(
        (f) => (before[f] ?? null) !== (entry[f] ?? null),
      );
      if (changedFields.length > 0)
        result.push({ kind: 'changed', entry, changedFields });
    }
    for (const [key, entry] of prevMap) {
      if (!nextMap.has(key)) result.push({ kind: 'removed', entry });
    }
    for (const [key, entry] of nextMap) {
      if (!prevMap.has(key)) result.push({ kind: 'added', entry });
    }
    return result;
  }
}
