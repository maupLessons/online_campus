import { createHash } from 'crypto';

export type EntryKeyInput = {
  groupCode: string;
  date: string;
  startTime: string;
  subjectKey: string;
  pairIdx?: number;
};

// Spec §4.1.1: sha256(join('\x1f', [groupCode, date, startTime, subjectKey, pairIdx ?? ''])).slice(0, 16).
// groupCode and subjectKey are normalized with trim().toLowerCase() before hashing.
export function buildEntryKey(input: EntryKeyInput): string {
  return createHash('sha256')
    .update(
      [
        input.groupCode.trim().toLowerCase(),
        input.date,
        input.startTime,
        input.subjectKey.trim().toLowerCase(),
        input.pairIdx ?? '',
      ].join('\x1f'),
    )
    .digest('hex')
    .slice(0, 16);
}

export function normalizeSubjectKey(
  subjectId: string | undefined,
  title: string,
): string {
  if (subjectId && subjectId.trim()) {
    return subjectId.trim();
  }
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

const KYIV_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayKyiv(now: Date = new Date()): string {
  return KYIV_FORMATTER.format(now); // en-CA → YYYY-MM-DD
}

export function addDaysIso(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
