import { createHash } from 'crypto';
import {
  MaupWireArray,
  MaupWireObject,
  MaupWireValue,
} from '../integrations/maup-student-api/maup-student-api.types';
import { ScheduleEntryDto, ScheduleQueryDto } from './dto';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';

type DateRange = {
  start?: Date;
  end?: Date;
};

const DEFAULT_RECURRING_LOOKAHEAD_DAYS = 31;

export function mapMaupScheduleResponse(
  response: MaupWireArray,
  query: ScheduleQueryDto = {},
): ScheduleEntryDto[] {
  const entries: ScheduleEntryDto[] = [];

  for (const period of response) {
    if (!isWireObject(period)) {
      continue;
    }

    const periodRange = {
      start: parseIsoDate(asString(period.from_date)),
      end: parseIsoDate(asString(period.to_date)),
    };
    const requestedRange = resolveRequestedRange(query, periodRange);
    const scheduleItems = Array.isArray(period.schedule) ? period.schedule : [];

    for (const item of scheduleItems) {
      if (!isWireObject(item)) {
        continue;
      }

      entries.push(
        ...mapMaupScheduleItem(
          item,
          period,
          requestedRange,
          periodRange.start ?? requestedRange.start,
          query,
        ),
      );
    }
  }

  return entries
    .filter((entry) => matchesStatusFilter(entry, query))
    .sort((first, second) =>
      `${first.date} ${first.startTime}`.localeCompare(
        `${second.date} ${second.startTime}`,
      ),
    );
}

function mapMaupScheduleItem(
  item: MaupWireObject,
  period: MaupWireObject,
  range: Required<DateRange>,
  periodStart: Date,
  query: ScheduleQueryDto,
): ScheduleEntryDto[] {
  const startTime = normalizeTime(asString(item.from_time));
  const endTime = normalizeTime(asString(item.to_time));
  if (!startTime || !endTime) {
    return [];
  }

  const exactDate = parseIsoDate(asString(item.day_date));
  const dates = exactDate
    ? isWithinRange(exactDate, range)
      ? [exactDate]
      : []
    : expandRecurringDates(item, range, periodStart);

  return dates
    .filter((date) => matchesDateQuery(date, query))
    .map((date) => buildScheduleEntry(item, period, date, startTime, endTime));
}

function buildScheduleEntry(
  item: MaupWireObject,
  period: MaupWireObject,
  date: Date,
  startTime: string,
  endTime: string,
): ScheduleEntryDto {
  const dateString = formatDate(date);
  const subjectId = asString(item.subject_id);
  const courseName = valueOrFallback(asString(item.pair_subject), 'Дисципліна');
  const courseAssignmentId = `maup:${subjectId || stableHash(courseName)}`;
  const identity = stableHash([
    asString(period.student_id),
    subjectId,
    dateString,
    startTime,
    endTime,
    asString(item.pair_idx),
    courseName,
  ]);

  return {
    id: `maup:${identity}`,
    courseAssignmentId,
    classroomId: asString(item.auditorium_id)
      ? `maup:${asString(item.auditorium_id)}`
      : undefined,
    date: dateString,
    startTime,
    endTime,
    type: mapPairKindToEntryType(asString(item.pair_kind)),
    status: ScheduleEntryStatus.SCHEDULED,
    courseName,
    courseCode: subjectId ? `MAUP-${subjectId}` : undefined,
    groupCode: asString(period.group) ?? undefined,
    teacherId: asString(item.prepod_id)
      ? `maup:${asString(item.prepod_id)}`
      : undefined,
    teacherName: asString(item.pair_prepod) ?? undefined,
    classroom: asString(item.pair_auditorium) ?? 'Онлайн',
  };
}

function resolveRequestedRange(
  query: ScheduleQueryDto,
  periodRange: DateRange,
): Required<DateRange> {
  if (query.date) {
    const date = parseIsoDate(query.date);
    if (date) {
      return { start: date, end: date };
    }
  }

  const requestedStart = parseIsoDate(query.startDate);
  const requestedEnd = parseIsoDate(query.endDate);
  const fallbackStart = periodRange.start ?? startOfUtcDay(new Date());
  const fallbackEnd =
    periodRange.end ?? addDays(fallbackStart, DEFAULT_RECURRING_LOOKAHEAD_DAYS);

  const start =
    requestedStart && requestedStart > fallbackStart
      ? requestedStart
      : fallbackStart;
  const end =
    requestedEnd && requestedEnd < fallbackEnd ? requestedEnd : fallbackEnd;

  return start <= end ? { start, end } : { start: end, end };
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

function matchesDateQuery(date: Date, query: ScheduleQueryDto): boolean {
  const dateString = formatDate(date);
  if (query.date) {
    return dateString === query.date;
  }
  if (query.startDate && dateString < query.startDate) {
    return false;
  }
  if (query.endDate && dateString > query.endDate) {
    return false;
  }
  return true;
}

function matchesStatusFilter(
  entry: ScheduleEntryDto,
  query: ScheduleQueryDto,
): boolean {
  return !query.status || query.status === entry.status;
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

function isWithinRange(date: Date, range: Required<DateRange>): boolean {
  return date >= range.start && date <= range.end;
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

function valueOrFallback(value: string | undefined, fallback: string): string {
  return value && value.length <= 300 ? value : fallback;
}

function stableHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex')
    .slice(0, 24);
}
