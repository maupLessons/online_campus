import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  UseGuards,
  Query,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { Role } from '../common/types/roles.enum';
import {
  CreateClassroomDto,
  CreateDepartmentDto,
  CreateFacultyDto,
  CreateGroupDto,
  CreateSpecialtyDto,
  UpdateClassroomDto,
  UpdateDepartmentDto,
  UpdateFacultyDto,
  UpdateGroupDto,
  UpdateSpecialtyDto,
  GroupDto,
  ClassroomDto,
  DepartmentDto,
  FacultyDto,
  SpecialtyDto,
} from './dto';
import { GroupsService } from './groups.service';
import { ClassroomsService } from './classrooms.service';
import { DepartmentsService } from './departments.service';
import { FacultiesService } from './faculties.service';
import { SpecialtiesService } from './specialties.service';

@ApiTags('references')
@ApiBearerAuth()
@Controller('references')
@UseGuards(JwtAuthGuard)
export class ReferencesController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly classroomsService: ClassroomsService,
    private readonly departmentsService: DepartmentsService,
    private readonly facultiesService: FacultiesService,
    private readonly specialtiesService: SpecialtiesService,
  ) {}

  @Get('groups')
  @ApiQuery({ name: 'course', required: false, type: Number })
  @ApiResponse({ status: 200, type: [GroupDto] })
  getGroups(@Query('course') course?: number) {
    const query: { course?: number } = {};
    if (course) {
      query.course = Number(course);
    }
    return this.groupsService.findAll(query);
  }

  @Get('groups/:id')
  @ApiResponse({ status: 200, type: GroupDto })
  getGroupById(@Param('id') id: string) {
    return this.groupsService.findById(id);
  }

  @Post('groups')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 201,
    type: String,
    description: 'The ID of the created group.',
  })
  createGroup(@Body() createGroupDto: CreateGroupDto) {
    return this.groupsService.create(createGroupDto);
  }

  @Put('groups/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    type: String,
    description: 'The ID of the updated group.',
  })
  updateGroup(@Param('id') id: string, @Body() updateGroupDto: UpdateGroupDto) {
    return this.groupsService.update(id, updateGroupDto);
  }

  @Delete('groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 204, description: 'Group successfully deleted.' })
  removeGroup(@Param('id') id: string) {
    return this.groupsService.remove(id);
  }

  @Get('classrooms')
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'building', required: false, type: String })
  @ApiResponse({ status: 200, type: [ClassroomDto] })
  getClassrooms(
    @Query('type') type?: string,
    @Query('building') building?: string,
  ) {
    const query: { type?: string; building?: string } = {};
    if (type) {
      query.type = type;
    }
    if (building) {
      query.building = building;
    }
    return this.classroomsService.findAll(query);
  }

  @Post('classrooms')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 201,
    type: String,
    description: 'The ID of the created classroom.',
  })
  createClassroom(@Body() createClassroomDto: CreateClassroomDto) {
    return this.classroomsService.create(createClassroomDto);
  }

  @Put('classrooms/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    type: String,
    description: 'The ID of the updated classroom.',
  })
  updateClassroom(
    @Param('id') id: string,
    @Body() updateClassroomDto: UpdateClassroomDto,
  ) {
    return this.classroomsService.update(id, updateClassroomDto);
  }

  @Delete('classrooms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 204, description: 'Classroom successfully deleted.' })
  removeClassroom(@Param('id') id: string) {
    return this.classroomsService.remove(id);
  }

  @Get('departments')
  @ApiResponse({ status: 200, type: [DepartmentDto] })
  getDepartments() {
    return this.departmentsService.findAll();
  }

  @Get('departments/:id')
  @ApiResponse({ status: 200, type: DepartmentDto })
  getDepartmentById(@Param('id') id: string) {
    return this.departmentsService.findById(id);
  }

  @Post('departments')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 201,
    type: String,
    description: 'The ID of the created department.',
  })
  createDepartment(@Body() createDepartmentDto: CreateDepartmentDto) {
    return this.departmentsService.create(createDepartmentDto);
  }

  @Put('departments/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    type: String,
    description: 'The ID of the updated department.',
  })
  updateDepartment(
    @Param('id') id: string,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.update(id, updateDepartmentDto);
  }

  @Delete('departments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 204, description: 'Department successfully deleted.' })
  removeDepartment(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }

  @Get('faculties')
  @ApiResponse({ status: 200, type: [FacultyDto] })
  getFaculties() {
    return this.facultiesService.findAll();
  }

  @Post('faculties')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 201,
    type: String,
    description: 'The ID of the created faculty.',
  })
  createFaculty(@Body() createFacultyDto: CreateFacultyDto) {
    return this.facultiesService.create(createFacultyDto);
  }

  @Put('faculties/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    type: String,
    description: 'The ID of the updated faculty.',
  })
  updateFaculty(
    @Param('id') id: string,
    @Body() updateFacultyDto: UpdateFacultyDto,
  ) {
    return this.facultiesService.update(id, updateFacultyDto);
  }

  @Delete('faculties/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 204, description: 'Faculty successfully deleted.' })
  removeFaculty(@Param('id') id: string) {
    return this.facultiesService.remove(id);
  }

  @Get('specialties')
  @ApiResponse({ status: 200, type: [SpecialtyDto] })
  getSpecialties() {
    return this.specialtiesService.findAll();
  }

  @Post('specialties')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 201,
    type: String,
    description: 'The ID of the created specialty.',
  })
  createSpecialty(@Body() createSpecialtyDto: CreateSpecialtyDto) {
    return this.specialtiesService.create(createSpecialtyDto);
  }

  @Put('specialties/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({
    status: 200,
    type: String,
    description: 'The ID of the updated specialty.',
  })
  updateSpecialty(
    @Param('id') id: string,
    @Body() updateSpecialtyDto: UpdateSpecialtyDto,
  ) {
    return this.specialtiesService.update(id, updateSpecialtyDto);
  }

  @Delete('specialties/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiResponse({ status: 204, description: 'Specialty successfully deleted.' })
  removeSpecialty(@Param('id') id: string) {
    return this.specialtiesService.remove(id);
  }
}
