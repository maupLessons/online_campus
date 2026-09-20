import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { createAuditContext } from '../audit-log/audit-context';
import { SkipAudit } from '../audit-log/audit.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { sendSpreadsheetExport } from '../common/export';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import {
  ScheduleExportQueryDto,
  ScheduleGroupResponseDto,
  ScheduleRangeQueryDto,
  ScheduleResponseDto,
  TodayScheduleResponseDto,
  UpsertOnlineLinkDto,
} from './dto';
import { OnlineLessonLinksService } from './online-lesson-links.service';
import { ScheduleService } from './schedule.service';

@ApiTags('schedule')
@ApiBearerAuth()
@Controller('schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly links: OnlineLessonLinksService,
    private readonly terms: AcademicTermsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('my')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Personal class schedule from MAUP API cache' })
  @ApiResponse({ status: 200, type: ScheduleResponseDto })
  findMy(
    @Query() query: ScheduleRangeQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.schedule.findMy(req.user, query);
  }

  @Get('session/my')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Personal exam session schedule' })
  findSession(
    @Query() query: ScheduleRangeQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.schedule.findSession(req.user, query);
  }

  @Get('today')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({
    summary: 'Today lessons + session for the dashboard widget (DASH-001)',
  })
  @ApiResponse({ status: 200, type: TodayScheduleResponseDto })
  // No parameters (spec §5.3a): the date is computed by the server in Europe/Kyiv.
  findToday(@Request() req: AuthenticatedRequest) {
    return this.schedule.findToday(req.user);
  }

  @Get('export')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Export personal schedule as CSV or XLSX' })
  async export(
    @Query() query: ScheduleExportQueryDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const artifact = await this.schedule.export(req.user, query);
    return sendSpreadsheetExport(res, artifact);
  }

  @Get('online-links/my')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Own online lesson links for the current term' })
  async listMyLinks(@Request() req: AuthenticatedRequest) {
    const term = await this.terms.requireCurrent();
    return this.links.listMine(req.user, String(term._id));
  }

  // Р12 and spec §5.2: ONLY the teacher sets the online link.
  // department_head and admin get 403 here, at the @Roles level (acceptance criterion §10.6).
  @Put('online-links')
  @Roles(Role.TEACHER)
  @SkipAudit()
  @ApiOperation({
    summary: 'Set online lesson link for a subject/date/pair (teacher only)',
  })
  async upsertLink(
    @Body() body: UpsertOnlineLinkDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const term = await this.terms.requireCurrent();
    return this.links.upsert(
      body,
      req.user,
      String(term._id),
      createAuditContext(req, this.auditLogService),
    );
  }

  @Delete('online-links/:id')
  @Roles(Role.TEACHER)
  @SkipAudit()
  async deleteLink(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.links.remove(
      id,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
    return { deleted: true };
  }

  @Get('groups/:groupCode')
  @Roles(
    Role.ADMIN,
    Role.RECTOR,
    Role.PRESIDENT,
    Role.DEAN,
    Role.DEPARTMENT_HEAD,
  )
  @ApiOperation({ summary: 'Cached group schedule (no API refresh)' })
  @ApiResponse({ status: 200, type: ScheduleGroupResponseDto })
  findForGroup(
    @Param('groupCode') groupCode: string,
    @Query() query: ScheduleRangeQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.schedule.findForGroup(
      req.user,
      groupCode,
      query,
      query.session === 'true',
    );
  }

  @Post('groups/:groupCode/refresh')
  @Roles(Role.ADMIN)
  @SkipAudit()
  @ApiOperation({
    summary: 'Force refresh of a group snapshot from MAUP API (ignores TTL)',
  })
  refreshGroup(
    @Param('groupCode') groupCode: string,
    @Query() query: ScheduleRangeQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    // session not set → both snapshots are refreshed (lessons + session), spec §7.1.
    const session =
      query.session === undefined ? undefined : query.session === 'true';
    return this.schedule.refreshGroup(
      req.user,
      groupCode,
      session,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Post('refresh')
  @Roles(Role.ADMIN)
  @SkipAudit()
  @ApiOperation({
    summary:
      'Force refresh of every group of the current term (both snapshots)',
  })
  refreshAll(@Request() req: AuthenticatedRequest) {
    return this.schedule.refreshAll(
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }
}
