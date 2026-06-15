import {
  Controller,
  Get,
  Header,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { createAuditContext } from '../audit-log/audit-context';
import { AuditEvent } from '../audit-log/audit.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { sendSpreadsheetExport } from '../common/export';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import {
  ReportExportFormat,
  ReportExportQueryDto,
  ReportCourseBreakdownDto,
  ReportOverviewDto,
  ReportQueryDto,
} from './dto';
import { ReportsService } from './reports.service';

const REPORT_ROLES = [
  Role.DEPARTMENT_HEAD,
  Role.DEAN,
  Role.RECTOR,
  Role.PRESIDENT,
  Role.ADMIN,
];

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('overview')
  @Roles(...REPORT_ROLES)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @AuditEvent(AUDIT_ACTIONS.REPORT_VIEW, 'report', false)
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie, Authorization')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary:
      'Get privacy-preserving academic performance and attendance analytics',
  })
  @ApiOkResponse({ type: ReportOverviewDto })
  async getOverview(
    @Query() query: ReportQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const report = await this.reportsService.getOverview(query, req.user);
    await createAuditContext(req, this.auditLogService).record({
      action: AUDIT_ACTIONS.REPORT_VIEW,
      targetEntity: 'report',
      details: {
        reportType: 'academic_overview',
        aggregateOnly: true,
        scopeType: report.scope.type,
        filters: report.filters.selected,
      },
    });
    return report;
  }

  @Get('courses')
  @Roles(...REPORT_ROLES)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @AuditEvent(AUDIT_ACTIONS.REPORT_VIEW, 'report', false)
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Cookie, Authorization')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Get a paginated aggregate course breakdown for a report',
  })
  @ApiOkResponse({ type: ReportCourseBreakdownDto })
  async getCourseBreakdown(
    @Query() query: ReportQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.reportsService.getCourseBreakdown(
      query,
      req.user,
    );
    await createAuditContext(req, this.auditLogService).record({
      action: AUDIT_ACTIONS.REPORT_VIEW,
      targetEntity: 'report',
      details: {
        reportType: 'academic_course_breakdown',
        aggregateOnly: true,
        page: result.page,
        limit: result.limit,
        filters: {
          academicYear: query.academicYear ?? null,
          semester: query.semester ?? null,
          departmentId: query.departmentId ?? null,
          groupId: query.groupId ?? null,
          courseAssignmentId: query.courseAssignmentId ?? null,
          from: query.from ?? null,
          to: query.to ?? null,
        },
      },
    });
    return result;
  }

  @Get('export')
  @Roles(...REPORT_ROLES)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @AuditEvent(AUDIT_ACTIONS.REPORT_EXPORT, 'report', false)
  @ApiOperation({
    summary:
      'Export privacy-preserving academic analytics as secure CSV or XLSX',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({
    description: 'CSV or XLSX report file',
    schema: { type: 'string', format: 'binary' },
  })
  async export(
    @Query() query: ReportExportQueryDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const format = query.format ?? ReportExportFormat.CSV;
    const exported = await this.reportsService.export(query, req.user);

    await createAuditContext(req, this.auditLogService).record({
      action: AUDIT_ACTIONS.REPORT_EXPORT,
      targetEntity: 'report',
      details: {
        reportType: 'academic_overview',
        aggregateOnly: true,
        format,
        filters: exported.filters,
      },
    });

    return sendSpreadsheetExport(res, exported.artifact);
  }
}
