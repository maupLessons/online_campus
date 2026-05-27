import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { SubmitSurveyResponseDto } from './dto/submit-survey-response.dto';
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
  findAll(@Query() query: SurveyQueryDto) {
    return this.surveysService.findAll(query);
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
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export aggregated survey results as CSV' })
  async exportResults(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.surveysService.exportResultsCsv(id, req.user);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="survey-${id}-results.csv"`,
    );
    return csv;
  }
}
