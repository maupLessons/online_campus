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
  ApiCreatedResponse,
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
  CreateSurveyDto,
  SubmitSurveyResponseDto,
  SurveyDeleteResultDto,
  SurveyDto,
  SurveyExportFormat,
  SurveyExportQueryDto,
  SurveyQueryDto,
  SurveyResponseStateDto,
  SurveyResultsDto,
  SurveySubmissionResultDto,
  UpdateSurveyDto,
} from './dto';
import { SurveysService } from './surveys.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { createAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuditEvent } from '../audit-log/audit.decorator';

@ApiTags('surveys')
@ApiBearerAuth()
@Controller('surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SurveysController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'Create a survey draft' })
  @ApiCreatedResponse({ type: SurveyDto })
  create(@Body() dto: CreateSurveyDto, @Request() req: AuthenticatedRequest) {
    return this.surveysService.create(dto, req.user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'List surveys for managers' })
  @ApiOkResponse({ type: SurveyDto, isArray: true })
  findAll(
    @Query() query: SurveyQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.surveysService.findAll(query, req.user);
  }

  @Get('active')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'List active surveys available to current user' })
  @ApiOkResponse({ type: SurveyDto, isArray: true })
  findActive(@Request() req: AuthenticatedRequest) {
    return this.surveysService.findActiveForUser(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get survey details' })
  @ApiOkResponse({ type: SurveyDto })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.findOne(id, req.user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'Update a draft survey' })
  @ApiOkResponse({ type: SurveyDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSurveyDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.surveysService.update(id, dto, req.user);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @AuditEvent(AUDIT_ACTIONS.SURVEY_PUBLISH, 'survey')
  @ApiOperation({ summary: 'Publish a survey' })
  @ApiOkResponse({ type: SurveyDto })
  publish(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.publish(
      id,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Patch(':id/close')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @AuditEvent(AUDIT_ACTIONS.SURVEY_CLOSE, 'survey')
  @ApiOperation({ summary: 'Close a survey' })
  @ApiOkResponse({ type: SurveyDto })
  close(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.close(
      id,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a draft survey' })
  @ApiOkResponse({ type: SurveyDeleteResultDto })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.remove(id, req.user);
  }

  @Post(':id/respond')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Submit a survey response' })
  @ApiCreatedResponse({ type: SurveySubmissionResultDto })
  respond(
    @Param('id') id: string,
    @Body() dto: SubmitSurveyResponseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.surveysService.respond(id, dto, req.user);
  }

  @Get(':id/my-response')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Get current user response state' })
  @ApiOkResponse({ type: SurveyResponseStateDto })
  getMyResponse(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.getMyResponse(id, req.user);
  }

  @Get(':id/results')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR, Role.PRESIDENT)
  @ApiOperation({ summary: 'Get aggregated survey results' })
  @ApiOkResponse({ type: SurveyResultsDto })
  getResults(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.getResults(id, req.user);
  }

  @Get(':id/results/export')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR, Role.PRESIDENT)
  @ApiOperation({
    summary: 'Export closed survey results as CSV or XLSX',
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
    @Query() query: SurveyExportQueryDto,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const format = query.format ?? SurveyExportFormat.CSV;
    res.setHeader('Cache-Control', 'private, no-store');

    if (format === SurveyExportFormat.XLSX) {
      const workbook = await this.surveysService.exportResultsXlsx(
        id,
        req.user,
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Length', workbook.length);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="survey-${id}-results.xlsx"`,
      );
      return res.send(workbook);
    }

    const csvBuffer = await this.surveysService.exportResultsCsv(id, req.user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Length', csvBuffer.length);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="survey-${id}-results.csv"`,
    );
    return res.send(csvBuffer);
  }
}
