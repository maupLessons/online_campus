import {
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { createAuditContext } from '../audit-log/audit-context';
import { AuditLogService } from '../audit-log/audit-log.service';
import { SkipAudit } from '../audit-log/audit.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/roles.guard';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { GradebookQueryDto } from './dto/gradebook-query.dto';
import { GradebookDto } from './gradebook.dto';
import { GradebookService } from './gradebook.service';

@ApiTags('gradebook')
@ApiBearerAuth()
@Controller('gradebook')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@SkipAudit()
export class GradebookController {
  constructor(
    private readonly gradebookService: GradebookService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('my')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Own gradebook (read-only MAUP data)' })
  @ApiOkResponse({ type: GradebookDto })
  async getMy(
    @Query() query: GradebookQueryDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<GradebookDto> {
    const dto = await this.gradebookService.getMy(req.user, query);
    await createAuditContext(req, this.auditLogService).record({
      action: AUDIT_ACTIONS.GRADEBOOK_VIEW,
      targetEntity: 'gradebook',
      details: {
        kind: 'gradebook',
        stale: dto.meta.stale,
        semesterCount: dto.semesters.length,
      },
    });
    return dto;
  }

  @Post('my/refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Force refresh of the own gradebook cache' })
  @ApiOkResponse({ type: GradebookDto })
  async refresh(@Request() req: AuthenticatedRequest): Promise<GradebookDto> {
    const dto = await this.gradebookService.getMy(req.user, { force: true });
    await createAuditContext(req, this.auditLogService).record({
      action: AUDIT_ACTIONS.GRADEBOOK_REFRESH,
      targetEntity: 'gradebook',
      details: {
        kind: 'gradebook',
        stale: dto.meta.stale,
        semesterCount: dto.semesters.length,
      },
    });
    return dto;
  }
}
