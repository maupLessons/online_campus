import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import {
  SpreadsheetExportArtifact,
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../common/export';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import {
  ReportCourseBreakdownDto,
  ReportExportDataDto,
  ReportExportQueryDto,
  ReportOverviewDto,
  ReportQueryDto,
} from './dto';
import { ReportsAnalyticsService } from './reports-analytics.service';
import { ReportsExportService } from './reports-export.service';
import {
  parseReportDateRange,
  resolveReportTrendUnit,
} from './reports-query.util';
import { ReportsScopeService } from './reports-scope.service';
import {
  MAX_REPORT_EXPORT_ASSIGNMENTS,
  ResolvedReportScope,
} from './reports.types';

@Injectable()
export class ReportsService {
  constructor(
    private readonly scopeService: ReportsScopeService,
    private readonly analyticsService: ReportsAnalyticsService,
    private readonly exportService: ReportsExportService,
  ) {}

  async getOverview(
    query: ReportQueryDto,
    user: AuthenticatedUser,
  ): Promise<ReportOverviewDto> {
    const dateRange = parseReportDateRange(query.from, query.to);
    const scope = await this.scopeService.resolve(query, user);
    const trendUnit = resolveReportTrendUnit(dateRange);
    const [studentCount, analytics] = await Promise.all([
      this.scopeService.countStudents(scope.selectedAssignments),
      this.analyticsService.getOverview({
        assignments: scope.selectedAssignments,
        dateRange,
        trendUnit,
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      trendUnit,
      scope: this.scopeService.describe(scope, user.role, studentCount),
      filters: scope.filters,
      ...analytics,
    };
  }

  async getCourseBreakdown(
    query: ReportQueryDto,
    user: AuthenticatedUser,
  ): Promise<ReportCourseBreakdownDto> {
    const dateRange = parseReportDateRange(query.from, query.to);
    const scope = await this.scopeService.resolve(query, user);
    const page = paginateAssignments(scope, query.page ?? 1, query.limit ?? 10);
    const docs = await this.analyticsService.getCourseRows(
      page.assignments,
      dateRange,
    );

    return {
      docs,
      totalDocs: page.totalDocs,
      limit: page.limit,
      page: page.page,
      totalPages: page.totalPages,
      hasNextPage: page.page < page.totalPages,
      hasPrevPage: page.page > 1 && page.totalPages > 0,
    };
  }

  async export(
    query: ReportExportQueryDto,
    user: AuthenticatedUser,
  ): Promise<{
    artifact: SpreadsheetExportArtifact;
    filters: ReportExportDataDto['filters']['selected'];
  }> {
    const dateRange = parseReportDateRange(query.from, query.to);
    const scope = await this.scopeService.resolve(query, user);
    this.assertExportSize(scope.selectedAssignments.length);

    const trendUnit = resolveReportTrendUnit(dateRange);
    const [studentCount, analytics, courseRows] = await Promise.all([
      this.scopeService.countStudents(scope.selectedAssignments),
      this.analyticsService.getOverview({
        assignments: scope.selectedAssignments,
        dateRange,
        trendUnit,
      }),
      this.analyticsService.getCourseRows(scope.selectedAssignments, dateRange),
    ]);
    const report: ReportExportDataDto = {
      generatedAt: new Date().toISOString(),
      trendUnit,
      scope: this.scopeService.describe(scope, user.role, studentCount),
      filters: scope.filters,
      ...analytics,
      courseBreakdown: {
        docs: courseRows,
        totalDocs: courseRows.length,
        limit: Math.max(courseRows.length, 1),
        page: 1,
        totalPages: courseRows.length > 0 ? 1 : 0,
        hasNextPage: false,
        hasPrevPage: false,
      },
    };
    const format = query.format ?? SpreadsheetExportFormat.CSV;
    const locale = query.locale ?? SpreadsheetExportLocale.UK;

    return {
      artifact: await this.exportService.build(report, format, locale),
      filters: report.filters.selected,
    };
  }

  private assertExportSize(assignmentCount: number): void {
    if (assignmentCount > MAX_REPORT_EXPORT_ASSIGNMENTS) {
      throw new PayloadTooLargeException(
        `Report export cannot exceed ${MAX_REPORT_EXPORT_ASSIGNMENTS} course assignments; narrow the filters and retry`,
      );
    }
  }
}

function paginateAssignments(
  scope: ResolvedReportScope,
  requestedPage: number,
  requestedLimit: number,
): {
  assignments: ResolvedReportScope['selectedAssignments'];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
} {
  const totalDocs = scope.selectedAssignments.length;
  const limit = Math.max(1, requestedLimit);
  const totalPages = totalDocs === 0 ? 0 : Math.ceil(totalDocs / limit);
  const page =
    totalPages === 0 ? 1 : Math.min(Math.max(requestedPage, 1), totalPages);
  const start = (page - 1) * limit;

  return {
    assignments: scope.selectedAssignments.slice(start, start + limit),
    totalDocs,
    limit,
    page,
    totalPages,
  };
}
