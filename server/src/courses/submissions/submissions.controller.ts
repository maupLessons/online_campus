import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { Role } from '../../common/types/roles.enum';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { SubmissionDto, SubmitAssignmentDto } from './dto';
import { RequestWithUser } from '../../common/types/request-with-user.interface';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionsController {
  constructor(private submissionsService: SubmissionsService) {}

  @Get('assignments/:assignmentId/submissions')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.ADMIN)
  @ApiResponse({ type: [SubmissionDto] })
  async getSubmissions(@Param('assignmentId') assignmentId: string) {
    return this.submissionsService.findSubmissions(assignmentId);
  }

  @Post('assignments/:id/submit')
  @Roles(Role.STUDENT)
  @ApiResponse({ type: SubmissionDto })
  async submitAssignment(
    @Param('id') id: string,
    @Body() dto: SubmitAssignmentDto,
    @Request() req: RequestWithUser,
  ): Promise<SubmissionDto> {
    return this.submissionsService.submitAssignment(id, dto, req.user.sub);
  }
}
