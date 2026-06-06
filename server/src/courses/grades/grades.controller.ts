import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { GradesService } from './grades.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import {
  GradeResponseDto,
  CreateGradeDto,
  UpdateGradeDto,
  GradeJournalResponseDto,
  GradeSubmissionDto,
} from './dto';
import { StudentCourseResponseDto } from '../courses/dto';
import { SubmissionDto } from '../submissions/dto';
import { Role } from '../../common/types/roles.enum';
import { RequestWithUser } from '../../common/types/request-with-user.interface';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated.response';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradesController {
  constructor(private gradesService: GradesService) {}

  @Post('grades')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiResponse({ type: GradeResponseDto })
  async createGrade(
    @Body() dto: CreateGradeDto,
    @Request() req: RequestWithUser,
  ): Promise<GradeResponseDto> {
    const { sub, role } = req.user;
    return this.gradesService.create(dto, sub, role);
  }

  @Patch('grades/:id')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiResponse({ type: GradeResponseDto })
  async updateGrade(
    @Param('id') id: string,
    @Body() dto: UpdateGradeDto,
    @Request() req: RequestWithUser,
  ): Promise<GradeResponseDto> {
    const { sub, role } = req.user;
    return this.gradesService.update(id, dto, sub, role);
  }

  @Post('submissions/:id/grade')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.ADMIN)
  @ApiResponse({ type: SubmissionDto })
  async gradeSubmission(
    @Param('id') id: string,
    @Body() dto: GradeSubmissionDto,
    @Request() req: RequestWithUser,
  ): Promise<SubmissionDto> {
    const { sub, role } = req.user;
    return this.gradesService.gradeSubmission(id, dto, sub, role);
  }

  @Get(':courseAssignmentId/grades')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiPaginatedResponse(GradeJournalResponseDto)
  async getGradeJournal(
    @Param('courseAssignmentId') caId: string,
    @Query() paginationDto: PaginationDto,
    @Request() req: RequestWithUser,
  ): Promise<PaginatedDto<GradeJournalResponseDto>> {
    return this.gradesService.findGradesByCourseAssignment(
      caId,
      paginationDto,
      req.user.sub,
      req.user.role,
    );
  }

  @Get('grades/my/courses')
  @Roles(Role.STUDENT)
  @ApiPaginatedResponse(StudentCourseResponseDto)
  async getMyCoursesWithGrades(
    @Request() req: RequestWithUser,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.gradesService.findMyCoursesWithGrades(
      req.user.sub,
      paginationDto,
    );
  }

  @Get('grades/my/courses/:courseAssignmentId')
  @Roles(Role.STUDENT)
  @ApiPaginatedResponse(GradeResponseDto)
  async getMyGradesByCourse(
    @Request() req: RequestWithUser,
    @Param('courseAssignmentId') caId: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedDto<GradeResponseDto>> {
    return this.gradesService.findStudentGradesByCourse(
      req.user.sub,
      caId,
      paginationDto,
      req.user.sub,
      req.user.role,
    );
  }

  @Get(':courseAssignmentId/grades/student/:studentId')
  @Roles(
    Role.STUDENT,
    Role.TEACHER,
    Role.DEPARTMENT_HEAD,
    Role.DEAN,
    Role.ADMIN,
  )
  @ApiPaginatedResponse(GradeResponseDto)
  async getStudentGradesByCourse(
    @Request() req: RequestWithUser,
    @Param('courseAssignmentId') caId: string,
    @Param('studentId') studentId: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedDto<GradeResponseDto>> {
    if (req.user.role === Role.STUDENT && req.user.sub !== studentId) {
      throw new ForbiddenException(
        'Ви не можете переглядати оцінки інших студентів',
      );
    }

    return this.gradesService.findStudentGradesByCourse(
      studentId,
      caId,
      paginationDto,
      req.user.sub,
      req.user.role,
    );
  }
}
