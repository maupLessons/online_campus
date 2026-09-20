import { BadRequestException } from '@nestjs/common';
import { ReportTrendUnit } from './dto';
import {
  DateRange,
  MAX_REPORT_RANGE_DAYS,
  ReportTermRef,
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

export function formatTermLabel(term: ReportTermRef | null): string {
  return term ? `${term.academicYear} · ${term.termNumber}` : '—';
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
