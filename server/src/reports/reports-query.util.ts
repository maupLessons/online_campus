import { BadRequestException } from '@nestjs/common';
import { ReportTrendUnit } from './dto';
import {
  AttendanceCounts,
  DateRange,
  MAX_REPORT_RANGE_DAYS,
} from './reports.types';

export function parseReportDateRange(
  from?: string,
  to?: string,
): DateRange | null {
  if (Boolean(from) !== Boolean(to)) {
    throw new BadRequestException(
      'Both from and to dates must be supplied together',
    );
  }
  if (!from || !to) {
    return null;
  }

  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  if (!fromDate || !toDate || fromDate > toDate) {
    throw new BadRequestException('Invalid report date range');
  }

  const toExclusive = new Date(toDate);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const days = Math.round(
    (toExclusive.getTime() - fromDate.getTime()) / 86_400_000,
  );
  if (days > MAX_REPORT_RANGE_DAYS) {
    throw new BadRequestException(
      `Report date range cannot exceed ${MAX_REPORT_RANGE_DAYS} days`,
    );
  }

  return { from: fromDate, toExclusive, days };
}

export function normalizeReportAcademicYear(value: string): string {
  const normalized = value.trim();
  const match = /^(\d{4})[/-](\d{4})$/.exec(normalized);
  return match ? `${match[1]}/${match[2]}` : normalized;
}

export function resolveReportTrendUnit(
  dateRange: DateRange | null,
): ReportTrendUnit {
  if (!dateRange) return 'month';
  if (dateRange.days <= 45) return 'day';
  if (dateRange.days <= 210) return 'week';
  return 'month';
}

export function reportDateFilter(
  dateRange: DateRange | null,
): Record<string, unknown> {
  return dateRange
    ? {
        date: {
          $gte: dateRange.from,
          $lt: dateRange.toExclusive,
        },
      }
    : {};
}

export function reportDateBucket(
  field: string,
  unit: ReportTrendUnit,
): Record<string, unknown> {
  return {
    $dateTrunc: {
      date: field,
      unit,
      timezone: 'UTC',
      ...(unit === 'week' ? { startOfWeek: 'monday' } : {}),
    },
  };
}

export function attendanceGroupFields(): Record<string, unknown> {
  const countStatus = (status: string) => ({
    $sum: {
      $cond: [{ $eq: ['$attendance.status', status] }, 1, 0],
    },
  });

  return {
    present: countStatus('present'),
    late: countStatus('late'),
    absent: countStatus('absent'),
    excused: countStatus('excused'),
  };
}

export function emptyAttendance(): AttendanceCounts {
  return {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    attendanceRecords: 0,
  };
}

export function attendanceRate(counts: AttendanceCounts): number | null {
  const denominator = counts.present + counts.late + counts.absent;
  return denominator === 0
    ? null
    : round(((counts.present + counts.late) / denominator) * 100, 1);
}

export function round(value: number, precision = 2): number {
  const multiplier = 10 ** precision;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function roundNullable(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? round(value)
    : null;
}

function parseIsoDate(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed;
}
