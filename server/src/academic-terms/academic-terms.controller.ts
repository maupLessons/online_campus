import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { Role } from '../common/types/roles.enum';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import {
  transformToDto,
  transformToDtoArray,
} from '../common/utils/transform.util';
import { AuditLogService } from '../audit-log/audit-log.service';
import { createAuditContext } from '../audit-log/audit-context';
import { AcademicTermsService } from './academic-terms.service';
import { AcademicTermDto } from './dto/academic-term.dto';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';

@ApiTags('academic-terms')
@ApiBearerAuth()
@Controller('academic-terms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicTermsController {
  constructor(
    private readonly service: AcademicTermsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiResponse({ type: [AcademicTermDto] })
  async list(): Promise<AcademicTermDto[]> {
    const docs = await this.service.list();
    return transformToDtoArray(
      AcademicTermDto,
      docs.map((d) => d.toObject() as Record<string, unknown>),
    );
  }

  @Get('current')
  @ApiOperation({ summary: 'Поточний навчальний період' })
  @ApiResponse({ status: 200, type: AcademicTermDto })
  @ApiResponse({ status: 404, description: '{ code: "no_current_term" }' })
  async current(): Promise<AcademicTermDto> {
    return transformToDto(
      AcademicTermDto,
      (await this.service.requireCurrent()).toObject(),
    );
  }

  @Post()
  @Roles(Role.ADMIN)
  async create(@Body() dto: CreateAcademicTermDto): Promise<AcademicTermDto> {
    return transformToDto(
      AcademicTermDto,
      (await this.service.create(dto)).toObject(),
    );
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermDto> {
    return transformToDto(
      AcademicTermDto,
      (await this.service.update(id, dto)).toObject(),
    );
  }

  @Post(':id/activate')
  @Roles(Role.ADMIN)
  async activate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AcademicTermDto> {
    const activated = await this.service.activate(
      id,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
    return transformToDto(
      AcademicTermDto,
      activated.toObject() as Record<string, unknown>,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string): Promise<{ deleted: true }> {
    return this.service.remove(id);
  }
}
