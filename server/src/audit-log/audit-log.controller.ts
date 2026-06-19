import {
  Controller,
  Get,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Role } from '../common/types/roles.enum';
import { PaginatedDto } from '../common/dto/paginated.dto';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated.response';
import { AuditLogService } from './audit-log.service';
import { AuditLogEntryDto, AuditLogQueryDto } from './dto';
import { AuditLogExportQueryDto } from './dto';
import { AuditLogExportService } from './audit-log-export.service';
import { sendSpreadsheetExport } from '../common/export';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { createAuditContext } from './audit-context';
import { AUDIT_ACTIONS } from './audit-actions';

@ApiTags('audit-log')
@ApiBearerAuth()
@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly auditLogExportService: AuditLogExportService,
  ) {}

  @Get('export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Export filtered audit log entries' })
  async export(
    @Query() query: AuditLogExportQueryDto,
    @Request() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const artifact = await this.auditLogExportService.build(query);
    await createAuditContext(request, this.auditLogService).record({
      action: AUDIT_ACTIONS.AUDIT_LOG_EXPORT,
      targetEntity: 'audit-log',
      details: {
        domain: query.domain ?? null,
        result: query.result ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        format: query.format,
      },
    });
    return sendSpreadsheetExport(response, artifact);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List audit log entries for administrators' })
  @ApiPaginatedResponse(AuditLogEntryDto)
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async findAll(
    @Query() query: AuditLogQueryDto,
    @Request() request: AuthenticatedRequest,
  ): Promise<PaginatedDto<AuditLogEntryDto>> {
    const result = await this.auditLogService.findAll(query);
    await createAuditContext(request, this.auditLogService).record({
      action: AUDIT_ACTIONS.AUDIT_LOG_VIEW,
      targetEntity: 'audit-log',
      details: {
        domain: query.domain ?? null,
        result: query.result ?? null,
        page: result.page,
        limit: result.limit,
      },
    });
    return result;
  }
}
