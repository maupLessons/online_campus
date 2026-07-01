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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { sendSpreadsheetExport } from '../common/export';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import {
  CreateScheduleEntryDto,
  ApplyScheduleTemplateDto,
  BulkCancelScheduleEntriesDto,
  BulkCreateScheduleEntriesDto,
  CreateScheduleTemplateDto,
  RescheduleScheduleEntryDto,
  ScheduleEntryDto,
  ScheduleExportQueryDto,
  ScheduleQueryDto,
  ScheduleReasonDto,
  SubstituteScheduleEntryDto,
  UpdateScheduleTemplateDto,
  UpdateScheduleEntryDto,
} from './dto';
import { ScheduleService } from './schedule.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { createAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuditEvent } from '../audit-log/audit.decorator';

@ApiTags('schedule')
@ApiBearerAuth()
@Controller('schedule')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduleController {
  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List schedule entries visible to current user' })
  @ApiResponse({ status: 200, type: [ScheduleEntryDto] })
  findAll(
    @Query() query: ScheduleQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.findForUser(req.user, query);
  }

  @Get('my')
  @ApiOperation({ summary: 'List current user schedule entries' })
  @ApiResponse({ status: 200, type: [ScheduleEntryDto] })
  findMy(
    @Query() query: ScheduleQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.findMyForUser(req.user, query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export schedule entries as CSV or XLSX' })
  async exportCsv(
    @Query() query: ScheduleExportQueryDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const artifact = await this.scheduleService.export(req.user, query);
    return sendSpreadsheetExport(res, artifact);
  }

  @Get('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List active schedule templates' })
  findTemplates() {
    return this.scheduleService.findTemplates();
  }

  @Post('templates')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_TEMPLATE_CREATE, 'schedule-template')
  @ApiOperation({ summary: 'Create reusable schedule template' })
  createTemplate(
    @Body() body: CreateScheduleTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.createTemplate(
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Put('templates/:id')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_TEMPLATE_UPDATE, 'schedule-template')
  @ApiOperation({ summary: 'Update schedule template' })
  updateTemplate(
    @Param('id') id: string,
    @Body() body: UpdateScheduleTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.updateTemplate(
      id,
      body,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Delete('templates/:id')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_TEMPLATE_DELETE, 'schedule-template')
  @ApiOperation({ summary: 'Archive schedule template' })
  deleteTemplate(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.deleteTemplate(
      id,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Post('templates/:id/apply')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_TEMPLATE_APPLY, 'schedule-template')
  @ApiOperation({ summary: 'Apply schedule template to a date range' })
  applyTemplate(
    @Param('id') id: string,
    @Body() body: ApplyScheduleTemplateDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.applyTemplate(
      id,
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Post('bulk')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_BULK_CREATE, 'schedule')
  @ApiOperation({
    summary: 'Bulk create schedule entries with conflict checks',
  })
  bulkCreate(
    @Body() body: BulkCreateScheduleEntriesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.bulkCreate(
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Post('bulk/cancel')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_BULK_CANCEL, 'schedule')
  @ApiOperation({ summary: 'Bulk cancel schedule entries with one reason' })
  bulkCancel(
    @Body() body: BulkCancelScheduleEntriesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.bulkCancel(
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get schedule entry by id' })
  @ApiResponse({ status: 200, type: ScheduleEntryDto })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.scheduleService.findOneForUser(id, req.user);
  }

  @Post()
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_CREATE, 'schedule')
  @ApiOperation({ summary: 'Create schedule entry with conflict checks' })
  @ApiResponse({ status: 201, type: ScheduleEntryDto })
  create(
    @Body() body: CreateScheduleEntryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.create(
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_UPDATE, 'schedule')
  @ApiOperation({ summary: 'Update schedule entry with conflict checks' })
  @ApiResponse({ status: 200, type: ScheduleEntryDto })
  update(
    @Param('id') id: string,
    @Body() body: UpdateScheduleEntryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.update(
      id,
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_CANCEL, 'schedule')
  @ApiOperation({ summary: 'Cancel schedule entry with a required reason' })
  @ApiResponse({ status: 200, type: ScheduleEntryDto })
  cancel(
    @Param('id') id: string,
    @Body() body: ScheduleReasonDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.cancel(
      id,
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Post(':id/reschedule')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_RESCHEDULE, 'schedule')
  @ApiOperation({ summary: 'Move schedule entry to a new slot' })
  @ApiResponse({ status: 200, type: ScheduleEntryDto })
  reschedule(
    @Param('id') id: string,
    @Body() body: RescheduleScheduleEntryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.reschedule(
      id,
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Post(':id/substitution')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_SUBSTITUTE, 'schedule')
  @ApiOperation({
    summary: 'Substitute teacher/course/classroom/time for entry',
  })
  @ApiResponse({ status: 200, type: ScheduleEntryDto })
  substitute(
    @Param('id') id: string,
    @Body() body: SubstituteScheduleEntryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.scheduleService.substitute(
      id,
      body,
      createAuditContext(req, this.auditLogService),
      req.user,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.SCHEDULE_DELETE, 'schedule')
  @ApiOperation({ summary: 'Delete schedule entry' })
  delete(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.scheduleService.delete(
      id,
      createAuditContext(req, this.auditLogService),
    );
  }
}
