import {
  Controller,
  Get,
  UseGuards,
  Request,
  Query,
  Param,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CourseAssignmentDto, CourseDto } from './dto';
import { RequestWithUser } from '../../common/types/request-with-user.interface';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated.response';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Get()
  @ApiPaginatedResponse(CourseDto)
  async findAll(
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedDto<CourseDto>> {
    return this.coursesService.findAllCourses(paginationDto);
  }

  @Get('my')
  @ApiPaginatedResponse(CourseAssignmentDto)
  async findMy(
    @Request() req: RequestWithUser,
    @Query() paginationDto: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const { sub, role } = req.user;
    return this.coursesService.findMy(sub, role, paginationDto);
  }

  @Get(':id')
  @ApiResponse({ type: CourseDto })
  async findOne(@Param('id') id: string): Promise<CourseDto> {
    return this.coursesService.findCourseById(id);
  }

  @Get('assignments/:id/details')
  @ApiResponse({ type: CourseAssignmentDto })
  async findOneAssignment(
    @Param('id') id: string,
  ): Promise<CourseAssignmentDto> {
    return this.coursesService.findCourseAssignmentById(id);
  }
}
