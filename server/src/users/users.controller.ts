import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { UsersService } from './users.service';
import { Role } from '../common/types/roles.enum';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import { PaginatedDto } from '../common/dto/paginated.dto';
import { UserDto } from './dto/user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { UserSearchQueryDto } from './dto/user-search-query.dto';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated.response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { createAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuditEvent } from '../audit-log/audit.decorator';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.USER_UPDATE, 'user')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.update(
      id,
      updateUserDto,
      req.user.sub,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Patch(':id/role')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.USER_ROLE_CHANGE, 'user')
  @ApiOperation({ summary: 'Change user role' })
  @ApiResponse({ status: 200, type: UserDto })
  @ApiResponse({ status: 400, description: 'Invalid role transition payload' })
  @ApiResponse({ status: 403, description: 'Cannot change own role' })
  @ApiResponse({ status: 404, description: 'User not found' })
  changeRole(
    @Param('id') id: string,
    @Body() changeUserRoleDto: ChangeUserRoleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.usersService.changeRole(
      id,
      changeUserRoleDto,
      req.user.sub,
      createAuditContext(req, this.auditLogService),
    );
  }

  @Patch(':id/block')
  @Roles(Role.ADMIN)
  @AuditEvent(AUDIT_ACTIONS.USER_STATUS_CHANGE, 'user')
  toggleBlock(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.usersService.toggleBlock(
      id,
      req.user.sub,
      createAuditContext(req, this.auditLogService),
    );
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
  search(@Query() query: UserSearchQueryDto) {
    return this.usersService.findByName(query.q ?? '', query.role);
  }

  @Get('group/:groupId')
  @Roles(Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN)
  getStudentsByGroup(@Param('groupId') groupId: string) {
    return this.usersService.getStudentsByGroup(groupId);
  }

  @Get('department/:departmentId')
  @Roles(
    Role.DEPARTMENT_HEAD,
    Role.DEAN,
    Role.RECTOR,
    Role.PRESIDENT,
    Role.ADMIN,
  )
  getTeachersByDepartment(@Param('departmentId') departmentId: string) {
    return this.usersService.getTeachersByDepartment(departmentId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PRESIDENT, Role.RECTOR, Role.DEAN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }
}
