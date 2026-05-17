import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { CourseAssignmentDto } from './dto';
import { RequestWithUser } from '../../common/types/request-with-user.interface';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  @Get()
  async findAll() {
    return this.coursesService.findAllCourses();
  }

  @Get('my')
  @ApiResponse({ type: [CourseAssignmentDto] })
  async findMy(@Request() req: RequestWithUser) {
    const { sub, role } = req.user;
    return this.coursesService.findMy(sub, role);
  }
}
