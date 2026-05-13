import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Role } from '../common/types/roles.enum';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaginatedDto } from '../common/dto/paginated.dto';
import { UserDto } from './dto/user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated.response';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Patch(':id/block')
  @Roles(Role.ADMIN)
  toggleBlock(@Param('id') id: string) {
    return this.usersService.toggleBlock(id);
  }

  @Get()
  @Roles(Role.ADMIN, Role.RECTOR, Role.PRESIDENT)
  @ApiPaginatedResponse(UserDto)
  findAll(@Query() query: UserQueryDto): Promise<PaginatedDto<UserDto>> {
    const { role, ...paginationDto } = query;
    return this.usersService.findAll(paginationDto, role);
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
