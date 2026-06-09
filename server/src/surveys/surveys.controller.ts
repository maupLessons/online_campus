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
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SubmitSurveyResponseDto } from './dto/submit-survey-response.dto';
import {
  SurveyExportFormat,
  SurveyExportQueryDto,
} from './dto/survey-export-query.dto';
import { SurveyQueryDto } from './dto/survey-query.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { SurveysService } from './surveys.service';

@ApiTags('surveys')
@ApiBearerAuth()
@Controller('surveys')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Post()
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'Create a survey draft' })
  create(@Body() dto: CreateSurveyDto, @Request() req: AuthenticatedRequest) {
    return this.surveysService.create(dto, req.user);
  }

  @Get()
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'List surveys for managers' })
  findAll(
    @Query() query: SurveyQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.surveysService.findAll(query, req.user);
  }

  @Get('active')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'List active surveys available to current user' })
  findActive(@Request() req: AuthenticatedRequest) {
    return this.surveysService.findActiveForUser(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get survey details' })
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.findOne(id, req.user);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'Update a draft survey' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSurveyDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.surveysService.update(id, dto, req.user);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'Publish a survey' })
  publish(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.publish(id, req.user);
  }

  @Patch(':id/close')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR)
  @ApiOperation({ summary: 'Close a survey' })
  close(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.close(id, req.user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a draft survey' })
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.remove(id, req.user);
  }

  @Post(':id/respond')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiOperation({ summary: 'Submit a survey response' })
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
  getMyResponse(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.surveysService.getMyResponse(id, req.user);
  }

  @Get(':id/results')
  @Roles(Role.ADMIN, Role.DEAN, Role.RECTOR, Role.PRESIDENT)
  @ApiOperation({ summary: 'Get aggregated survey results' })
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
