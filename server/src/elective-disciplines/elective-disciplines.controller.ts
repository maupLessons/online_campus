import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import {
  CreateElectiveDisciplineDto,
  CreateElectivePeriodDto,
  ElectiveDisciplineQueryDto,
  ElectiveExportFormat,
  ElectiveExportQueryDto,
  ElectivePeriodQueryDto,
  SelectElectiveDto,
  SetElectiveDisciplineStatusDto,
  SetElectivePeriodStatusDto,
  UpdateElectiveDisciplineDto,
  UpdateElectivePeriodDto,
} from './dto';
import { ElectiveDisciplinesService } from './elective-disciplines.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { createAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuditEvent } from '../audit-log/audit.decorator';

const disciplineManagers = [
  Role.ADMIN,
  Role.DEPARTMENT_HEAD,
  Role.DEAN,
  Role.RECTOR,
  Role.PRESIDENT,
];

const periodManagers = [Role.ADMIN, Role.DEAN, Role.RECTOR, Role.PRESIDENT];

@ApiTags('elective-disciplines')
@ApiBearerAuth()
@Controller('electives')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ElectiveDisciplinesController {
  constructor(
    private readonly electivesService: ElectiveDisciplinesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('active')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'List active elective periods for current student' })
  findActive(@Request() req: AuthenticatedRequest) {
    return this.electivesService.findActiveForStudent(req.user);
  }

  @Get('my')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'List current student elective selections' })
  findMySelections(@Request() req: AuthenticatedRequest) {
    return this.electivesService.findMySelections(req.user);
  }

  @Post('periods/:periodId/select')
  @Roles(Role.STUDENT)
  @AuditEvent(AUDIT_ACTIONS.ELECTIVE_SELECTION_SELECT, 'elective_selection')
  @ApiOperation({ summary: 'Select an elective discipline for a period' })
  selectDiscipline(
    @Param('periodId') periodId: string,
    @Body() dto: SelectElectiveDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.selectDiscipline(
      periodId,
      dto,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Delete('periods/:periodId/selections/:selectionId')
  @Roles(Role.STUDENT)
  @AuditEvent(AUDIT_ACTIONS.ELECTIVE_SELECTION_CANCEL, 'elective_selection')
  @ApiOperation({ summary: 'Cancel current student elective selection' })
  cancelSelection(
    @Param('periodId') periodId: string,
    @Param('selectionId') selectionId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.cancelSelection(
      periodId,
      selectionId,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Post('disciplines')
  @Roles(...disciplineManagers)
  @ApiOperation({ summary: 'Create elective discipline draft' })
  createDiscipline(
    @Body() dto: CreateElectiveDisciplineDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.createDiscipline(dto, req.user);
  }

  @Get('disciplines')
  @Roles(...disciplineManagers)
  @ApiOperation({ summary: 'List elective disciplines for managers' })
  listDisciplines(
    @Query() query: ElectiveDisciplineQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.listDisciplines(query, req.user);
  }

  @Put('disciplines/:id')
  @Roles(...disciplineManagers)
  @ApiOperation({ summary: 'Update elective discipline' })
  updateDiscipline(
    @Param('id') id: string,
    @Body() dto: UpdateElectiveDisciplineDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.updateDiscipline(id, dto, req.user);
  }

  @Patch('disciplines/:id/status')
  @Roles(...disciplineManagers)
  @ApiOperation({ summary: 'Change elective discipline status' })
  setDisciplineStatus(
    @Param('id') id: string,
    @Body() dto: SetElectiveDisciplineStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.setDisciplineStatus(id, dto, req.user);
  }

  @Post('periods')
  @Roles(...periodManagers)
  @ApiOperation({ summary: 'Create elective selection period draft' })
  createPeriod(
    @Body() dto: CreateElectivePeriodDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.createPeriod(dto, req.user);
  }

  @Get('periods')
  @Roles(...periodManagers)
  @ApiOperation({ summary: 'List elective selection periods for managers' })
  listPeriods(
    @Query() query: ElectivePeriodQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.listPeriods(query, req.user);
  }

  @Put('periods/:id')
  @Roles(...periodManagers)
  @ApiOperation({ summary: 'Update elective selection period draft' })
  updatePeriod(
    @Param('id') id: string,
    @Body() dto: UpdateElectivePeriodDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.updatePeriod(id, dto, req.user);
  }

  @Patch('periods/:id/status')
  @Roles(...periodManagers)
  @AuditEvent(AUDIT_ACTIONS.ELECTIVE_PERIOD_STATUS_CHANGE, 'elective_period')
  @ApiOperation({ summary: 'Change elective selection period status' })
  setPeriodStatus(
    @Param('id') id: string,
    @Body() dto: SetElectivePeriodStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.setPeriodStatus(
      id,
      dto,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Post('periods/:id/finalize')
  @Roles(...periodManagers)
  @AuditEvent(AUDIT_ACTIONS.ELECTIVE_PERIOD_FINALIZE, 'elective_period')
  @ApiOperation({
    summary:
      'Finalize elective period and create course assignments for selections',
  })
  finalizePeriod(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.electivesService.finalizePeriod(
      id,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Get('periods/:id/results')
  @Roles(...periodManagers)
  @ApiOperation({ summary: 'Get elective selection period results' })
  getResults(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.electivesService.getPeriodResults(id, req.user);
  }

  @Get('periods/:id/results/export')
  @Roles(...periodManagers)
  @ApiOperation({
    summary: 'Export closed elective period results as CSV or XLSX',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiOkResponse({
    description: 'CSV or XLSX report file',
    schema: { type: 'string', format: 'binary' },
  })
  async exportResults(
    @Param('id') id: string,
    @Query() query: ElectiveExportQueryDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const format = query.format ?? ElectiveExportFormat.CSV;
    res.setHeader('Cache-Control', 'private, no-store');

    if (format === ElectiveExportFormat.XLSX) {
      const workbook = await this.electivesService.exportPeriodResultsXlsx(
        id,
        req.user,
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="elective-period-${id}-results.xlsx"`,
      );
      return res.send(workbook);
    }

    const csvBuffer = await this.electivesService.exportPeriodResultsCsv(
      id,
      req.user,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Length', csvBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elective-period-${id}-results.csv"`,
    );
    return res.send(csvBuffer);
  }
}
