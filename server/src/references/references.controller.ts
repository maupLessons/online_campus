import {
  BadRequestException,
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
  ParseEnumPipe,
  Request,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
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
  ReferenceAdminQueryDto,
  ReferenceImportQueryDto,
} from './dto';
import { GroupsService } from './groups.service';
import { ClassroomsService } from './classrooms.service';
import { DepartmentsService } from './departments.service';
import { FacultiesService } from './faculties.service';
import { SpecialtiesService } from './specialties.service';
import { SPREADSHEET_EXPORT_CONFIG } from '../common/utils/spreadsheet-export.util';
import { ReferencesAdminService } from './references-admin.service';
import { ReferencesExportService } from './references-export.service';
import { ReferencesImportService } from './references-import.service';
import {
  ReferenceExportFormat,
  ReferenceExportLocale,
  ReferenceType,
} from './reference.types';
import { AuthenticatedRequest } from '../common/types/authenticated-request';
import {
  ReferenceReadFilter,
  ReferencesAccessService,
} from './references-access.service';

const REFERENCE_IMPORT_FILE_LIMIT = 2 * 1024 * 1024;

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
    private readonly adminService: ReferencesAdminService,
    private readonly exportService: ReferencesExportService,
    private readonly importService: ReferencesImportService,
    private readonly accessService: ReferencesAccessService,
  ) {}

  @Get('catalog/:type')
  async getReferenceCatalog(
    @Param('type', new ParseEnumPipe(ReferenceType)) type: ReferenceType,
    @Query() query: ReferenceAdminQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const filter = await this.accessService.buildReadFilter(type, req.user);
    return this.adminService.findAll(type, query, filter);
  }

  @Get('admin/:type')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getAdminReferences(
    @Param('type', new ParseEnumPipe(ReferenceType)) type: ReferenceType,
    @Query() query: ReferenceAdminQueryDto,
  ) {
    return this.adminService.findAll(type, query);
  }

  @Get('admin/:type/export')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async exportReferences(
    @Param('type', new ParseEnumPipe(ReferenceType)) type: ReferenceType,
    @Query('format', new ParseEnumPipe(ReferenceExportFormat))
    format: ReferenceExportFormat,
    @Query(
      'locale',
      new ParseEnumPipe(ReferenceExportLocale, { optional: true }),
    )
    locale: ReferenceExportLocale = ReferenceExportLocale.UK,
    @Res() response: Response,
  ) {
    const buffer =
      format === ReferenceExportFormat.XLSX
        ? await this.exportService.toXlsx(type, locale)
        : await this.exportService.toCsv(type, locale);
    response.set({
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="references-${type}.${format}"`,
      'Content-Length': buffer.length,
      'Content-Type':
        format === ReferenceExportFormat.XLSX
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : SPREADSHEET_EXPORT_CONFIG.csvMimeType,
      'X-Content-Type-Options': 'nosniff',
    });
    response.send(buffer);
  }

  @Post('admin/:type/import')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: REFERENCE_IMPORT_FILE_LIMIT, files: 1 },
    }),
  )
  importReferences(
    @Param('type', new ParseEnumPipe(ReferenceType)) type: ReferenceType,
    @Query() query: ReferenceImportQueryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('CSV or XLSX import file is required');
    }
    return this.importService.import(type, file, query.dryRun, query.mode);
  }

  @Get('groups')
  @ApiQuery({ name: 'course', required: false, type: Number })
  @ApiResponse({ status: 200, type: [GroupDto] })
  async getGroups(
    @Request() req: AuthenticatedRequest,
    @Query('course') course?: number,
  ) {
    const courseNumber = course === undefined ? undefined : Number(course);
    const filter = await this.scopedFilter(
      ReferenceType.GROUPS,
      req.user,
      Number.isFinite(courseNumber) ? { course: courseNumber } : {},
    );
    return this.adminService.getAll(ReferenceType.GROUPS, filter);
  }

  @Get('groups/:id')
  @ApiResponse({ status: 200, type: GroupDto })
  async getGroupById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.accessService.assertCanRead(ReferenceType.GROUPS, id, req.user);
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
  @ApiResponse({ status: 409, description: 'Group is in use.' })
  removeGroup(@Param('id') id: string) {
    return this.groupsService.remove(id);
  }

  @Get('classrooms')
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'building', required: false, type: String })
  @ApiResponse({ status: 200, type: [ClassroomDto] })
  async getClassrooms(
    @Request() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('building') building?: string,
  ) {
    const query: ReferenceReadFilter = {};
    if (type) {
      query.type = type;
    }
    if (building) {
      query.building = building;
    }
    const filter = await this.scopedFilter(
      ReferenceType.CLASSROOMS,
      req.user,
      query,
    );
    return this.adminService.getAll(ReferenceType.CLASSROOMS, filter);
  }

  @Get('classrooms/:id')
  @ApiResponse({ status: 200, type: ClassroomDto })
  async getClassroomById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.accessService.assertCanRead(
      ReferenceType.CLASSROOMS,
      id,
      req.user,
    );
    return this.classroomsService.findById(id);
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
  @ApiResponse({ status: 409, description: 'Classroom is in use.' })
  removeClassroom(@Param('id') id: string) {
    return this.classroomsService.remove(id);
  }

  @Get('departments')
  @ApiResponse({ status: 200, type: [DepartmentDto] })
  async getDepartments(@Request() req: AuthenticatedRequest) {
    const filter = await this.accessService.buildReadFilter(
      ReferenceType.DEPARTMENTS,
      req.user,
    );
    return this.adminService.getAll(ReferenceType.DEPARTMENTS, filter);
  }

  @Get('departments/:id')
  @ApiResponse({ status: 200, type: DepartmentDto })
  async getDepartmentById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.accessService.assertCanRead(
      ReferenceType.DEPARTMENTS,
      id,
      req.user,
    );
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
  @ApiResponse({ status: 409, description: 'Department is in use.' })
  removeDepartment(@Param('id') id: string) {
    return this.departmentsService.remove(id);
  }

  @Get('faculties')
  @ApiResponse({ status: 200, type: [FacultyDto] })
  async getFaculties(@Request() req: AuthenticatedRequest) {
    const filter = await this.accessService.buildReadFilter(
      ReferenceType.FACULTIES,
      req.user,
    );
    return this.adminService.getAll(ReferenceType.FACULTIES, filter);
  }

  @Get('faculties/:id')
  @ApiResponse({ status: 200, type: FacultyDto })
  async getFacultyById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.accessService.assertCanRead(
      ReferenceType.FACULTIES,
      id,
      req.user,
    );
    return this.facultiesService.findById(id);
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
  @ApiResponse({ status: 409, description: 'Faculty is in use.' })
  removeFaculty(@Param('id') id: string) {
    return this.facultiesService.remove(id);
  }

  @Get('specialties')
  @ApiResponse({ status: 200, type: [SpecialtyDto] })
  async getSpecialties(@Request() req: AuthenticatedRequest) {
    const filter = await this.accessService.buildReadFilter(
      ReferenceType.SPECIALTIES,
      req.user,
    );
    return this.adminService.getAll(ReferenceType.SPECIALTIES, filter);
  }

  @Get('specialties/:id')
  @ApiResponse({ status: 200, type: SpecialtyDto })
  async getSpecialtyById(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    await this.accessService.assertCanRead(
      ReferenceType.SPECIALTIES,
      id,
      req.user,
    );
    return this.specialtiesService.findById(id);
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
  @ApiResponse({ status: 409, description: 'Specialty is in use.' })
  removeSpecialty(@Param('id') id: string) {
    return this.specialtiesService.remove(id);
  }

  private async scopedFilter(
    type: ReferenceType,
    user: AuthenticatedRequest['user'],
    additionalFilter: ReferenceReadFilter = {},
  ): Promise<ReferenceReadFilter> {
    const accessFilter = await this.accessService.buildReadFilter(type, user);
    const activeFilters = [accessFilter, additionalFilter].filter(
      (filter) => Object.keys(filter).length > 0,
    );
    if (activeFilters.length === 0) {
      return {};
    }
    if (activeFilters.length === 1) {
      return activeFilters[0];
    }
    return { $and: activeFilters };
  }
}
