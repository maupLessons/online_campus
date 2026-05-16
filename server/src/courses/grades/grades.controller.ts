import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { Role } from '../../common/types/roles.enum';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import {
  GradeResponseDto,
  StudentCourseResponseDto,
  GradeSubmissionDto,
  SubmissionDto,
  CreateGradeDto,
  UpdateGradeDto,
  GradeJournalResponseDto,
} from '../dto';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated.response';

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
    @Request() req: any,
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
    @Request() req: any,
  ): Promise<GradeResponseDto> {
    const { sub, role } = req.user;
    return this.gradesService.update(id, dto, sub, role);
  }

  @Delete('grades/:id')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  async deleteGrade(@Param('id') id: string, @Request() req: any) {
    const { sub, role } = req.user;
    return this.gradesService.remove(id, sub, role);
  }

  @Post('submissions/:id/grade')
  @Roles(Role.TEACHER)
  @ApiResponse({ type: SubmissionDto })
  async gradeSubmission(
    @Param('id') id: string,
    @Body() dto: GradeSubmissionDto,
    @Request() req: any,
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
  ): Promise<PaginatedDto<GradeJournalResponseDto>> {
    return this.gradesService.findGradesByCourseAssignment(caId, paginationDto);
  }

  @Get('grades/my/courses')
  @Roles(Role.STUDENT)
  @ApiPaginatedResponse(StudentCourseResponseDto)
  async getMyCoursesWithGrades(
    @Request() req: any,
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
    @Request() req: any,
    @Param('courseAssignmentId') caId: string,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedDto<GradeResponseDto>> {
    return this.gradesService.findStudentGradesByCourse(
      req.user.sub,
      caId,
      paginationDto,
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
    @Request() req: any,
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
    );
  }
}
