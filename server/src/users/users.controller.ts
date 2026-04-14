import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Role } from '../common/types/roles.enum';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(Role.ADMIN, Role.RECTOR, Role.PRESIDENT)
  findAll(@Query('role') role?: Role) {
    return this.usersService.findAll(role);
  }

  @Get('search')
  @Roles(Role.ADMIN, Role.PRESIDENT, Role.RECTOR, Role.DEAN)
  search(@Query('q') query: string) {
    return this.usersService.findByName(query);
  }

  @Get('group/:groupId')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  getStudentsByGroup(@Param('groupId') groupId: string) {
    return this.usersService.getStudentsByGroup(groupId);
  }

  @Get('department/:departmentId')
  @Roles(Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  getTeachersByDepartment(@Param('departmentId') departmentId: string) {
    return this.usersService.getTeachersByDepartment(departmentId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PRESIDENT, Role.RECTOR, Role.DEAN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
