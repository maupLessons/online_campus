import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { Role } from '../../common/types/roles.enum';
import { MaupStudentApiClient } from './maup-student-api.client';
import { MaupCircuitState } from './maup-student-api.types';

type MaupIntegrationStatus = 'disabled' | 'ready' | 'degraded';

type MaupStudentApiDiagnosticsResponse = {
  status: MaupIntegrationStatus;
  enabled: boolean;
  circuitState: MaupCircuitState;
  requestCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
};

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations/maup-student-api')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class MaupStudentApiController {
  constructor(private readonly maupClient: MaupStudentApiClient) {}

  @Get('diagnostics')
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    summary: 'Get safe MAUP student API diagnostics without secrets',
  })
  @ApiOkResponse({
    description:
      'Safe runtime diagnostics. Does not include base URL, username, password or Authorization headers.',
  })
  diagnostics(): MaupStudentApiDiagnosticsResponse {
    const diagnostics = this.maupClient.getDiagnostics();
    return {
      status: resolveStatus(diagnostics.enabled, diagnostics.circuitState),
      ...diagnostics,
    };
  }
}

function resolveStatus(
  enabled: boolean,
  circuitState: MaupCircuitState,
): MaupIntegrationStatus {
  if (!enabled) {
    return 'disabled';
  }
  return circuitState === 'closed' ? 'ready' : 'degraded';
}
