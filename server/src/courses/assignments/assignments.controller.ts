import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @Get(':courseAssignmentId/assignments')
  async getAssignments(@Param('courseAssignmentId') caId: string) {
    return this.assignmentsService.findAssignments(caId);
  }

  @Get('assignments/my')
  async getMyAssignments(@Request() req: any) {
    return this.assignmentsService.findAssignmentsByStudent(req.user.sub);
  }
}
