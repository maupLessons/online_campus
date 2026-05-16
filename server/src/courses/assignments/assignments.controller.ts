import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../../auth/roles.guard';
import { Role } from '../../common/types/roles.enum';
import { ApiTags, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  AssignmentDto,
  AssignmentIdDto,
} from '../dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { ApiPaginatedResponse } from '../../common/swagger/api-paginated.response';

@ApiTags('courses')
@ApiBearerAuth()
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssignmentsController {
  constructor(private assignmentsService: AssignmentsService) {}

  @Get(':courseAssignmentId/assignments')
  @ApiPaginatedResponse(AssignmentDto)
  async getAssignments(
    @Param('courseAssignmentId') caId: string,
    @Query() paginationDto: PaginationDto,
    @Request() req: any,
  ): Promise<PaginatedDto<AssignmentDto>> {
    const { sub, role } = req.user;
    return this.assignmentsService.findAssignments(
      caId,
      paginationDto,
      sub,
      role,
    );
  }

  @Post(':courseAssignmentId/assignments')
  @Roles(Role.TEACHER)
  @ApiResponse({ type: AssignmentDto })
  async createAssignment(
    @Param('courseAssignmentId') caId: string,
    @Body() dto: CreateAssignmentDto,
    @Request() req: any,
  ): Promise<AssignmentDto> {
    const { sub, role } = req.user;
    return this.assignmentsService.create(caId, dto, sub, role);
  }

  @Put('assignments/:id')
  @Roles(Role.TEACHER)
  @ApiResponse({ type: AssignmentDto })
  async updateAssignment(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
    @Request() req: any,
  ): Promise<AssignmentDto> {
    const { sub, role } = req.user;
    return this.assignmentsService.update(id, dto, sub, role);
  }

  @Delete('assignments/:id')
  @Roles(Role.TEACHER)
  @ApiResponse({ type: AssignmentIdDto })
  async removeAssignment(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<AssignmentIdDto> {
    const { sub, role } = req.user;
    return this.assignmentsService.remove(id, sub, role);
  }

  @Get('assignments/my')
  @Roles(Role.STUDENT)
  @ApiPaginatedResponse(AssignmentDto)
  async getMyAssignments(
    @Query() paginationDto: PaginationDto,
    @Request() req: any,
  ): Promise<PaginatedDto<AssignmentDto>> {
    return this.assignmentsService.findAssignmentsByStudent(
      req.user.sub,
      paginationDto,
    );
  }

  @Get('assignments/:id')
  @ApiResponse({ type: AssignmentDto })
  async getAssignment(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<AssignmentDto> {
    const { sub, role } = req.user;
    return this.assignmentsService.findOne(id, sub, role);
  }
}
