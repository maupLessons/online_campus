import {
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
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
import { FinanceDto } from './finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiBearerAuth()
@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@SkipAudit()
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('my')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Own finance overview (read-only MAUP data)' })
  @ApiOkResponse({ type: FinanceDto })
  async getMy(@Request() req: AuthenticatedRequest): Promise<FinanceDto> {
    const dto = await this.financeService.getMy(req.user, {});
    await createAuditContext(req, this.auditLogService).record({
      action: AUDIT_ACTIONS.FINANCE_VIEW,
      targetEntity: 'finance',
      details: {
        kind: 'finance',
        stale: dto.meta.stale,
        paymentCount:
          dto.tuition.payments.length + dto.dormitory.payments.length,
      },
    });
    return dto;
  }

  @Post('my/refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Force refresh of the own finance cache' })
  @ApiOkResponse({ type: FinanceDto })
  async refresh(@Request() req: AuthenticatedRequest): Promise<FinanceDto> {
    const dto = await this.financeService.getMy(req.user, { force: true });
    await createAuditContext(req, this.auditLogService).record({
      action: AUDIT_ACTIONS.FINANCE_REFRESH,
      targetEntity: 'finance',
      details: {
        kind: 'finance',
        stale: dto.meta.stale,
        paymentCount:
          dto.tuition.payments.length + dto.dormitory.payments.length,
      },
    });
    return dto;
  }
}
