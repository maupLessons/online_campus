import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  UseGuards,
  Request,
  Query,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles, RolesGuard } from '../../auth/roles.guard';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CourseAssignmentCardDto, CourseAssignmentDto, CourseDto } from './dto';
import { UserDto } from '../../users/dto/user.dto';
import { AuthenticatedRequest } from '../../common/types/authenticated-request';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated.response';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { PaginatedWithMeta } from '../../common/dto/empty-paginated';
import { Role } from '../../common/types/roles.enum';
import {
  CreateCourseDto,
  UpdateCourseDto,
  UpdateMoodleUrlDto,
  UpdateResourcesDto,
  CatalogQueryDto,
} from '../dto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { createAuditContext } from '../../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../../audit-log/audit-actions';
import { AuditEvent } from '../../audit-log/audit.decorator';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get()
  @Roles(Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiPaginatedResponse(CourseDto)
  listCatalog(
    @Query() query: CatalogQueryDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<PaginatedDto<CourseDto>> {
    return this.coursesService.listCatalog(query, req.user);
  }

  @Get('my')
  @Roles(Role.STUDENT, Role.TEACHER)
  @ApiPaginatedResponse(CourseAssignmentDto)
  findMy(
    @Request() req: AuthenticatedRequest,
    @Query() pagination: PaginationDto,
  ): Promise<PaginatedWithMeta<CourseAssignmentDto>> {
    return this.coursesService.findMy(req.user.sub, req.user.role, pagination);
  }

  @Get('course-assignments')
  @Roles(Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiPaginatedResponse(CourseAssignmentDto)
  async findCourseAssignments(
    @Request() req: AuthenticatedRequest,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    return this.coursesService.findCourseAssignments(paginationDto, req.user);
  }

  @Get('course-assignments/:id/students')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiResponse({ type: [UserDto] })
  async findAssignmentStudents(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<UserDto[]> {
    return this.coursesService.findStudentsByCourseAssignment(id, req.user);
  }

  @Put('course-assignments/:id/resources')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD)
  @AuditEvent(
    AUDIT_ACTIONS.COURSE_ASSIGNMENT_RESOURCES_UPDATE,
    'CourseAssignment',
  )
  setResources(
    @Param('id') id: string,
    @Body() dto: UpdateResourcesDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.coursesService.setResources(
      id,
      dto,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Get('course-assignments/:id')
  @Roles(
    Role.STUDENT,
    Role.TEACHER,
    Role.DEPARTMENT_HEAD,
    Role.DEAN,
    Role.ADMIN,
  )
  @ApiResponse({ type: CourseAssignmentCardDto })
  async findOneAssignment(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CourseAssignmentCardDto> {
    return this.coursesService.getCard(id, req.user);
  }

  @Post()
  @Roles(Role.DEPARTMENT_HEAD, Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.COURSE_CREATE, 'Course')
  createCourse(
    @Body() dto: CreateCourseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.coursesService.createCourse(
      dto,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Patch(':id')
  @Roles(Role.DEPARTMENT_HEAD, Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.COURSE_UPDATE, 'Course')
  updateCourse(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.coursesService.updateCourse(
      id,
      dto,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  // @HttpCode(200) is required: by default @Post returns 201,
  // but the response body is an updated resource, not a created one (e2e expects 200)
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DEPARTMENT_HEAD, Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.COURSE_ARCHIVE, 'Course')
  archiveCourse(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.coursesService.archiveCourse(
      id,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.DEPARTMENT_HEAD, Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.COURSE_RESTORE, 'Course')
  restoreCourse(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.coursesService.restoreCourse(
      id,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Patch(':id/moodle-url')
  @Roles(Role.DEPARTMENT_HEAD, Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.COURSE_MOODLE_URL_CHANGE, 'Course')
  setMoodleUrl(
    @Param('id') id: string,
    @Body() dto: UpdateMoodleUrlDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.coursesService.setMoodleUrl(
      id,
      dto,
      req.user,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Get(':id')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  @ApiResponse({ type: CourseDto })
  findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<CourseDto> {
    return this.coursesService.findCourseById(id, req.user);
  }
}
