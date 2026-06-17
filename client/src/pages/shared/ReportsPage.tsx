import { keepPreviousData, useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  BarChart3,
  BookOpenCheck,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  RefreshCcw,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  reportsApi,
  type ReportCourseRow,
  type ReportExportFormat,
  type ReportOverview,
  type ReportQuery,
} from "../../services/reportsApi";
import { useAutoDismissState } from "../../hooks/useAutoDismissState";
import { downloadBlob } from "../../utils/spreadsheetExport";

type DraftFilters = {
  academicYear: string;
  semester: string;
  departmentId: string;
  groupId: string;
  courseAssignmentId: string;
  from: string;
  to: string;
};

const DEFAULT_FILTERS: DraftFilters = {
  academicYear: "",
  semester: "",
  departmentId: "",
  groupId: "",
  courseAssignmentId: "",
  from: "",
  to: "",
};

const PAGE_SIZE = 10;
const MAX_REPORT_RANGE_DAYS = 366;

function toQuery(filters: DraftFilters): ReportQuery {
  return {
    academicYear: filters.academicYear || undefined,
    semester: filters.semester ? Number(filters.semester) : undefined,
    departmentId: filters.departmentId || undefined,
    groupId: filters.groupId || undefined,
    courseAssignmentId: filters.courseAssignmentId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
}

function inclusiveDateRangeDays(from: string, to: string): number {
  const fromDate = Date.parse(`${from}T00:00:00.000Z`);
  const toDate = Date.parse(`${to}T00:00:00.000Z`);
  return Math.floor((toDate - fromDate) / 86_400_000) + 1;
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  tone: "blue" | "emerald" | "amber" | "indigo";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    indigo: "bg-indigo-50 text-indigo-700",
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          {icon}
        </div>
      </div>
    </article>
  );
}

function TrendChart({
  title,
  subtitle,
  items,
  value,
  formatPeriod,
  color,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  items: Array<{ period: string }>;
  value: (item: { period: string }) => number | null;
  formatPeriod: (period: string) => string;
  color: string;
  emptyLabel: string;
}) {
  const values = items
    .map((item) => value(item))
    .filter((item): item is number => item !== null);
  const maximum = Math.max(...values, 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      {items.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-sm text-slate-400">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto pb-2">
          <div className="flex h-52 min-w-full items-end gap-2">
            {items.map((item) => {
              const itemValue = value(item);
              const height =
                itemValue === null
                  ? 2
                  : Math.max((itemValue / maximum) * 100, 4);
              return (
                <div
                  key={item.period}
                  className="flex w-10 shrink-0 flex-col items-center justify-end gap-2"
                  title={`${formatPeriod(item.period)}: ${itemValue ?? "—"}`}
                >
                  <span className="text-[11px] font-semibold text-slate-600">
                    {itemValue ?? "—"}
                  </span>
                  <div className="flex h-32 w-full items-end rounded bg-slate-100">
                    <div
                      className={`w-full rounded ${color}`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="w-full truncate text-center text-[10px] text-slate-500">
                    {formatPeriod(item.period)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function AttendanceDistribution({ report }: { report: ReportOverview }) {
  const { t } = useTranslation();
  const total = report.summary.attendanceRecords;
  const rows = [
    {
      key: "present",
      value: report.summary.present,
      color: "bg-emerald-500",
    },
    { key: "late", value: report.summary.late, color: "bg-amber-500" },
    { key: "absent", value: report.summary.absent, color: "bg-rose-500" },
    { key: "excused", value: report.summary.excused, color: "bg-sky-500" },
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        {t("reports.attendanceDistribution")}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {t("reports.attendanceDistributionSubtitle")}
      </p>

      <div className="mt-5 space-y-4">
        {rows.map((row) => {
          const percentage = total === 0 ? 0 : (row.value / total) * 100;
          return (
            <div key={row.key}>
              <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-slate-700">
                  {t(`reports.attendance.${row.key}`)}
                </span>
                <span className="tabular-nums text-slate-500">
                  {row.value} · {percentage.toFixed(1)}%
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded bg-slate-100">
                <div
                  className={`h-full rounded ${row.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CourseMobileCard({
  course,
  formatMetric,
}: {
  course: ReportCourseRow;
  formatMetric: (value: number | null, suffix?: string) => string;
}) {
  const { t } = useTranslation();

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{course.courseName}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {course.courseCode} · {course.groupCode}
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {t("reports.semesterShort", { semester: course.semester })}
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        {course.departmentName}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-blue-50 p-2.5">
          <p className="text-[11px] text-blue-700">
            {t("reports.averageGrade")}
          </p>
          <p className="mt-1 font-bold text-blue-950">
            {formatMetric(course.averageGrade)}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2.5">
          <p className="text-[11px] text-emerald-700">
            {t("reports.attendanceRate")}
          </p>
          <p className="mt-1 font-bold text-emerald-950">
            {formatMetric(course.attendanceRate, "%")}
          </p>
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5">
          <p className="text-[11px] text-slate-600">{t("reports.lessons")}</p>
          <p className="mt-1 font-bold text-slate-900">
            {course.lessonsRecorded}
          </p>
        </div>
      </div>
    </article>
  );
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const [draftFilters, setDraftFilters] =
    useState<DraftFilters>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<DraftFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useAutoDismissState("");
  const [exporting, setExporting] = useState<ReportExportFormat | null>(null);
  const [exportError, setExportError] = useAutoDismissState("");
  const query = useMemo(() => toQuery(appliedFilters), [appliedFilters]);

  const reportQuery = useQuery({
    queryKey: ["reports", "overview", query],
    queryFn: () => reportsApi.getOverview(query),
    placeholderData: keepPreviousData,
  });
  const coursesQuery = useQuery({
    queryKey: ["reports", "courses", query, page],
    queryFn: () =>
      reportsApi.getCourseBreakdown({
        ...query,
        page,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const report = reportQuery.data;
  const courseBreakdown = coursesQuery.data;
  const locale = i18n.language.startsWith("en") ? "en-US" : "uk-UA";
  const exportLocale = i18n.language.startsWith("en") ? "en" : "uk";

  const filteredCourseOptions = useMemo(() => {
    const options = report?.filters.courseAssignments ?? [];
    return options.filter((option) => {
      if (
        draftFilters.academicYear &&
        option.academicYear !== draftFilters.academicYear
      ) {
        return false;
      }
      if (
        draftFilters.semester &&
        option.semester !== Number(draftFilters.semester)
      ) {
        return false;
      }
      if (
        draftFilters.departmentId &&
        option.departmentId !== draftFilters.departmentId
      ) {
        return false;
      }
      if (draftFilters.groupId && option.groupId !== draftFilters.groupId) {
        return false;
      }
      return true;
    });
  }, [draftFilters, report?.filters.courseAssignments]);

  const handleSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    setFilterError("");

    if (Boolean(draftFilters.from) !== Boolean(draftFilters.to)) {
      setFilterError(t("reports.filters.datePairError"));
      return;
    }
    if (
      draftFilters.from &&
      draftFilters.to &&
      draftFilters.from > draftFilters.to
    ) {
      setFilterError(t("reports.filters.dateOrderError"));
      return;
    }
    if (
      draftFilters.from &&
      draftFilters.to &&
      inclusiveDateRangeDays(draftFilters.from, draftFilters.to) >
        MAX_REPORT_RANGE_DAYS
    ) {
      setFilterError(t("reports.filters.dateRangeTooLong"));
      return;
    }

    setPage(1);
    setAppliedFilters({ ...draftFilters });
  };

  const handleReset = () => {
    setFilterError("");
    setPage(1);
    setDraftFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
  };

  const handleExport = async (format: ReportExportFormat) => {
    setExporting(format);
    setExportError("");

    try {
      const blob = await reportsApi.export(
        toQuery(appliedFilters),
        format,
        exportLocale,
      );
      downloadBlob(blob, `academic-report.${format}`);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data instanceof Blob
          ? t("reports.exportError")
          : error.message
        : t("reports.exportError");
      setExportError(message || t("reports.exportError"));
    } finally {
      setExporting(null);
    }
  };

  const formatMetric = (value: number | null, suffix = "") =>
    value === null
      ? "—"
      : `${new Intl.NumberFormat(locale, {
          maximumFractionDigits: 2,
        }).format(value)}${suffix}`;
  const formatPeriod = (period: string) =>
    new Intl.DateTimeFormat(locale, {
      month: report?.trendUnit === "day" ? "short" : "short",
      day: report?.trendUnit === "month" ? undefined : "numeric",
      year: report?.trendUnit === "month" ? "2-digit" : undefined,
      timeZone: "UTC",
    }).format(new Date(period));
  const scopeLabel = report
    ? report.scope.names.length > 0
      ? report.scope.names.join(", ")
      : t(`reports.scope.${report.scope.type}`)
    : "";

  return (
    <div className="space-y-6">
      <section className="border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <BarChart3 className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-950">
                {t("reports.title")}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                {t("reports.subtitle")}
              </p>
              {scopeLabel && (
                <p className="mt-2 text-xs font-semibold uppercase text-blue-700">
                  {t("reports.scopeLabel")}: {scopeLabel}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleExport("csv")}
              disabled={!report || exporting !== null}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {exporting === "csv"
                ? t("reports.exporting")
                : t("reports.exportCsv")}
            </button>
            <button
              type="button"
              onClick={() => void handleExport("xlsx")}
              disabled={!report || exporting !== null}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              {exporting === "xlsx"
                ? t("reports.exporting")
                : t("reports.exportXlsx")}
            </button>
          </div>
        </div>
        {exportError && (
          <p className="mt-3 text-sm text-rose-700">{exportError}</p>
        )}
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Filter className="h-4 w-4" aria-hidden="true" />
          {t("reports.filters.title")}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect
            label={t("reports.filters.academicYear")}
            value={
              draftFilters.academicYear ||
              report?.filters.selected.academicYear ||
              ""
            }
            onChange={(value) =>
              setDraftFilters((current) => ({
                ...current,
                academicYear: value,
                courseAssignmentId: "",
              }))
            }
            allLabel={t("reports.filters.latestYear")}
            options={(report?.filters.academicYears ?? []).map((year) => ({
              id: year,
              label: year,
            }))}
          />
          <FilterSelect
            label={t("reports.filters.semester")}
            value={draftFilters.semester}
            onChange={(value) =>
              setDraftFilters((current) => ({
                ...current,
                semester: value,
                courseAssignmentId: "",
              }))
            }
            allLabel={t("reports.filters.allSemesters")}
            options={(report?.filters.semesters ?? []).map((semester) => ({
              id: String(semester),
              label: String(semester),
            }))}
          />
          <FilterSelect
            label={t("reports.filters.department")}
            value={draftFilters.departmentId}
            onChange={(value) =>
              setDraftFilters((current) => ({
                ...current,
                departmentId: value,
                courseAssignmentId: "",
              }))
            }
            allLabel={t("reports.filters.allDepartments")}
            options={report?.filters.departments ?? []}
          />
          <FilterSelect
            label={t("reports.filters.group")}
            value={draftFilters.groupId}
            onChange={(value) =>
              setDraftFilters((current) => ({
                ...current,
                groupId: value,
                courseAssignmentId: "",
              }))
            }
            allLabel={t("reports.filters.allGroups")}
            options={report?.filters.groups ?? []}
          />
          <FilterSelect
            label={t("reports.filters.course")}
            value={draftFilters.courseAssignmentId}
            onChange={(value) =>
              setDraftFilters((current) => ({
                ...current,
                courseAssignmentId: value,
              }))
            }
            allLabel={t("reports.filters.allCourses")}
            options={filteredCourseOptions}
          />
          <label className="space-y-1.5 text-sm text-slate-600">
            <span>{t("reports.filters.from")}</span>
            <input
              type="date"
              value={draftFilters.from}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  from: event.target.value,
                }))
              }
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="space-y-1.5 text-sm text-slate-600">
            <span>{t("reports.filters.to")}</span>
            <input
              type="date"
              value={draftFilters.to}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  to: event.target.value,
                }))
              }
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              {t("reports.filters.apply")}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50"
              title={t("reports.filters.reset")}
              aria-label={t("reports.filters.reset")}
            >
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {filterError && (
          <p className="mt-3 text-sm text-rose-700">{filterError}</p>
        )}
      </form>

      {reportQuery.isLoading && !report ? (
        <div className="flex justify-center py-16">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : reportQuery.isError || !report ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
          {t("reports.loadError")}
        </div>
      ) : (
        <>
          {(reportQuery.isFetching || coursesQuery.isFetching) && (
            <div className="h-1 overflow-hidden rounded bg-blue-100">
              <div className="h-full w-1/3 animate-pulse rounded bg-blue-600" />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label={t("reports.averageGrade")}
              value={formatMetric(report.summary.averageGrade)}
              detail={t("reports.gradeCount", {
                count: report.summary.gradeCount,
              })}
              icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
              tone="blue"
            />
            <MetricCard
              label={t("reports.attendanceRate")}
              value={formatMetric(report.summary.attendanceRate, "%")}
              detail={t("reports.attendanceRecords", {
                count: report.summary.attendanceRecords,
              })}
              icon={<CalendarCheck2 className="h-5 w-5" aria-hidden="true" />}
              tone="emerald"
            />
            <MetricCard
              label={t("reports.studentsCovered")}
              value={String(report.scope.studentCount)}
              detail={t("reports.courseAssignments", {
                count: report.scope.assignmentCount,
              })}
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
              tone="amber"
            />
            <MetricCard
              label={t("reports.lessonsRecorded")}
              value={String(report.summary.lessonsRecorded)}
              detail={t("reports.journalData")}
              icon={<BookOpenCheck className="h-5 w-5" aria-hidden="true" />}
              tone="indigo"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <TrendChart
              title={t("reports.gradeTrend")}
              subtitle={t("reports.gradeTrendSubtitle")}
              items={report.gradeTrend}
              value={(item) =>
                (item as ReportOverview["gradeTrend"][number]).averageGrade
              }
              formatPeriod={formatPeriod}
              color="bg-blue-500"
              emptyLabel={t("reports.noGradeData")}
            />
            <TrendChart
              title={t("reports.attendanceTrend")}
              subtitle={t("reports.attendanceTrendSubtitle")}
              items={report.attendanceTrend}
              value={(item) =>
                (item as ReportOverview["attendanceTrend"][number])
                  .attendanceRate
              }
              formatPeriod={formatPeriod}
              color="bg-emerald-500"
              emptyLabel={t("reports.noAttendanceData")}
            />
          </div>

          <AttendanceDistribution report={report} />

          <section>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("reports.courseBreakdown")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("reports.courseBreakdownSubtitle")}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                {t("reports.generatedAt", {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(report.generatedAt)),
                })}
              </p>
            </div>

            {coursesQuery.isError && !courseBreakdown ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700">
                {t("reports.courseLoadError")}
              </div>
            ) : !courseBreakdown && coursesQuery.isLoading ? (
              <div className="flex justify-center rounded-lg border border-slate-200 bg-white py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : !courseBreakdown || courseBreakdown.docs.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
                {t("reports.empty")}
              </div>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {courseBreakdown.docs.map((course) => (
                    <CourseMobileCard
                      key={course.courseAssignmentId}
                      course={course}
                      formatMetric={formatMetric}
                    />
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm md:block">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3">
                          {t("reports.table.course")}
                        </th>
                        <th className="px-4 py-3">
                          {t("reports.table.scope")}
                        </th>
                        <th className="px-4 py-3 text-right">
                          {t("reports.table.averageGrade")}
                        </th>
                        <th className="px-4 py-3 text-right">
                          {t("reports.table.attendance")}
                        </th>
                        <th className="px-4 py-3 text-right">
                          {t("reports.table.lessons")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courseBreakdown.docs.map((course) => (
                        <tr
                          key={course.courseAssignmentId}
                          className="align-top hover:bg-slate-50"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">
                              {course.courseName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {course.courseCode} · {course.academicYear} ·{" "}
                              {t("reports.semesterShort", {
                                semester: course.semester,
                              })}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-700">
                              {course.groupCode}
                            </p>
                            <p className="mt-1 max-w-xs text-xs text-slate-500">
                              {course.departmentName}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <p className="font-semibold text-slate-900">
                              {formatMetric(course.averageGrade)}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {t("reports.gradeCount", {
                                count: course.gradeCount,
                              })}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <p className="font-semibold text-slate-900">
                              {formatMetric(course.attendanceRate, "%")}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {t("reports.attendanceRecords", {
                                count: course.attendanceRecords,
                              })}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                            {course.lessonsRecorded}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {courseBreakdown && courseBreakdown.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between gap-4">
                <p className="text-sm text-slate-500">
                  {t("reports.pageInfo", {
                    page: courseBreakdown.page,
                    total: courseBreakdown.totalPages,
                    count: courseBreakdown.totalDocs,
                  })}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) => Math.max(1, current - 1))
                    }
                    disabled={!courseBreakdown.hasPrevPage}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    aria-label={t("reports.previous")}
                    title={t("reports.previous")}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={!courseBreakdown.hasNextPage}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    aria-label={t("reports.next")}
                    title={t("reports.next")}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  allLabel,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <label className="space-y-1.5 text-sm text-slate-600">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
