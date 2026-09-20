import { createHash } from 'crypto';
import {
  MaupWireArray,
  MaupWireObject,
  MaupWireValue,
} from '../integrations/maup-student-api/maup-student-api.types';
import { ScheduleSnapshotEntry } from './schemas/schedule-snapshot.schema';
import { ScheduleControlType, ScheduleEntryType } from './schedule.enums';
import { buildEntryKey, normalizeSubjectKey } from './schedule-keys';

type DateRange = {
  start?: Date;
  end?: Date;
};

export type MappedSnapshot = {
  groupCode: string;
  periodFrom?: string;
  periodTo?: string;
  entries: ScheduleSnapshotEntry[];
};

export function mapMaupScheduleToSnapshot(
  response: MaupWireArray,
  options: { isExamSession: boolean },
): MappedSnapshot {
  let groupCode = '';
  let periodFrom: string | undefined;
  let periodTo: string | undefined;
  const entries: ScheduleSnapshotEntry[] = [];

  for (const period of response) {
    if (!isWireObject(period)) continue;
    groupCode = groupCode || (asString(period.group) ?? '');
    const start = parseIsoDate(asString(period.from_date));
    const end = parseIsoDate(asString(period.to_date));
    periodFrom = periodFrom ?? (start ? formatDate(start) : undefined);
    periodTo = periodTo ?? (end ? formatDate(end) : undefined);
    if (!start || !end) continue;
    const items = Array.isArray(period.schedule) ? period.schedule : [];
    for (const item of items) {
      if (!isWireObject(item)) continue;
      entries.push(
        ...mapItem(item, groupCode, { start, end }, options.isExamSession),
      );
    }
  }

  entries.sort((a, b) =>
    `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
  );
  return { groupCode, periodFrom, periodTo, entries };
}

function mapItem(
  item: MaupWireObject,
  groupCode: string,
  range: { start: Date; end: Date },
  isExamSession: boolean,
): ScheduleSnapshotEntry[] {
  const startTime = normalizeTime(asString(item.from_time));
  const endTime = normalizeTime(asString(item.to_time));
  if (!startTime || !endTime) return [];

  const exactDate = parseIsoDate(asString(item.day_date));
  const dates = exactDate
    ? exactDate >= range.start && exactDate <= range.end
      ? [exactDate]
      : []
    : expandRecurringDates(item, range, range.start);

  const subjectId = asString(item.subject_id);
  const courseTitle = clip(asString(item.pair_subject) ?? 'Дисципліна');
  const subjectKey = normalizeSubjectKey(subjectId, courseTitle);
  const pairKind = asString(item.pair_kind);
  const pairIdx = toSafeInteger(item.pair_idx);
  const classroom = asString(item.pair_auditorium);

  return dates.map((d) => {
    const date = formatDate(d);
    return {
      key: buildEntryKey({ groupCode, date, startTime, subjectKey, pairIdx }),
      date,
      startTime,
      endTime,
      courseTitle,
      subjectKey,
      subjectId: clip(subjectId, 64),
      type: isExamSession
        ? ScheduleEntryType.EXAM
        : mapPairKindToEntryType(pairKind),
      controlType: isExamSession ? mapControlType(pairKind) : undefined,
      teacherName: clip(asString(item.pair_prepod)),
      teacherExternalId: clip(asString(item.prepod_id), 64),
      classroom: classroom ? clip(classroom) : undefined,
      classroomExternalId: clip(asString(item.auditorium_id), 64),
      pairIdx,
    };
  });
}

export function mapControlType(
  pairKind: string | undefined,
): ScheduleControlType {
  const v = pairKind?.toLowerCase() ?? '';
  if (v.includes('екз') || v.includes('ісп')) return ScheduleControlType.EXAM;
  if (v.includes('зал')) return ScheduleControlType.CREDIT;
  if (v.includes('курс')) return ScheduleControlType.COURSEWORK;
  return ScheduleControlType.OTHER;
}

export function hashWireResponse(response: MaupWireArray): string {
  return createHash('sha256').update(JSON.stringify(response)).digest('hex');
}

function clip(value: string, maxLength?: number): string;
function clip(
  value: string | undefined,
  maxLength?: number,
): string | undefined;
function clip(value: string | undefined, maxLength = 300) {
  return value === undefined ? undefined : value.slice(0, maxLength);
}

function expandRecurringDates(
  item: MaupWireObject,
  range: Required<DateRange>,
  periodStart: Date,
): Date[] {
  const rawDay = toSafeInteger(item.day_of_week_raw);
  if (rawDay === undefined || rawDay < 0 || rawDay > 6) {
    return [];
  }

  const dates: Date[] = [];
  for (
    let date = nextDateForRawDay(range.start, rawDay);
    date <= range.end;
    date = addDays(date, 7)
  ) {
    if (matchesPairWeeks(date, periodStart, asString(item.pair_weeks))) {
      dates.push(date);
    }
  }
  return dates;
}

function matchesPairWeeks(
  date: Date,
  rangeStart: Date,
  pairWeeks: string | undefined,
): boolean {
  const normalized = pairWeeks?.trim().toLowerCase();
  if (!normalized || normalized.includes('всі')) {
    return true;
  }

  const weekIndex =
    Math.floor(
      (date.getTime() - rangeStart.getTime()) / (7 * 24 * 60 * 60 * 1000),
    ) + 1;

  if (normalized.includes('парн') && !normalized.includes('непарн')) {
    return weekIndex % 2 === 0;
  }
  if (normalized.includes('непарн')) {
    return weekIndex % 2 === 1;
  }

  const explicitWeeks = normalized
    .split(/[^0-9]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0);

  return explicitWeeks.length === 0 || explicitWeeks.includes(weekIndex);
}

function mapPairKindToEntryType(value: string | undefined): ScheduleEntryType {
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('лаб')) return ScheduleEntryType.LAB;
  if (normalized.includes('сем') || normalized.includes('практ')) {
    return ScheduleEntryType.SEMINAR;
  }
  if (normalized.includes('екз')) {
    return ScheduleEntryType.EXAM;
  }
  if (normalized.includes('конс')) return ScheduleEntryType.CONSULTATION;
  return ScheduleEntryType.LECTURE;
}

function normalizeTime(value: string | undefined): string | null {
  const match = value?.trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function nextDateForRawDay(start: Date, rawDay: number): Date {
  const date = startOfUtcDay(start);
  const currentRawDay = (date.getUTCDay() + 6) % 7;
  const offset = (rawDay - currentRawDay + 7) % 7;
  return addDays(date, offset);
}

function parseIsoDate(value: string | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function addDays(date: Date, days: number): Date {
  const next = startOfUtcDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function asString(value: MaupWireValue | undefined): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function toSafeInteger(value: MaupWireValue | undefined): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function isWireObject(value: MaupWireValue): value is MaupWireObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
