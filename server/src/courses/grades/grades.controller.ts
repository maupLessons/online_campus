import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { GradesService } from './grades.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { Role } from '../../common/types/roles.enum';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradesController {
  constructor(private gradesService: GradesService) {}

  @Get(':courseAssignmentId/grades')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  async getGradeJournal(@Param('courseAssignmentId') caId: string) {
    return this.gradesService.findGradesByCourseAssignment(caId);
  }

  @Get('grades/my')
  async getMyGrades(@Request() req: any) {
    return this.gradesService.findGradesByStudent(req.user.sub);
  }
}
