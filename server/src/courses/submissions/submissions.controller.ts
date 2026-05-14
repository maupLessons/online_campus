import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { Role } from '../../common/types/roles.enum';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionsController {
  constructor(private submissionsService: SubmissionsService) {}

  @Get('assignments/:assignmentId/submissions')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.ADMIN)
  async getSubmissions(@Param('assignmentId') assignmentId: string) {
    return this.submissionsService.findSubmissions(assignmentId);
  }
}
