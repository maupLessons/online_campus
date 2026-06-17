import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { CourseAssignment, CourseAssignmentDocument } from '../courses/schemas';
import { ScheduleEntryDto, ScheduleQueryDto } from './dto';
import { ScheduleEntryStatus } from './schedule.enums';
import { ScheduleEntry, ScheduleEntryDocument } from './schemas';
import { ScheduleMapper } from './schedule.mapper';
import {
  CourseAssignmentFilter,
  ScheduleEntryLean,
  ScheduleFilter,
} from './schedule.types';

@Injectable()
export class ScheduleReaderService {
  private readonly privilegedScheduleRoles = new Set<Role>([
    Role.ADMIN,
    Role.DISPATCHER,
    Role.RECTOR,
    Role.PRESIDENT,
  ]);

  constructor(
    @InjectModel(ScheduleEntry.name)
    private readonly scheduleEntryModel: Model<ScheduleEntryDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    private readonly academicAccessService: AcademicAccessService,
    private readonly mapper: ScheduleMapper,
  ) {}

  async findAll(query: ScheduleQueryDto = {}): Promise<ScheduleEntryDto[]> {
    const filter = await this.buildScheduleFilter(query);
    return this.findEntries(filter);
  }

  async findForUser(
    user: AuthenticatedUser,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    if (this.privilegedScheduleRoles.has(user.role)) {
      return this.findAll(query);
    }

    const visibleAssignmentIds =
      await this.academicAccessService.findVisibleCourseAssignmentIds(user);
    const requestedAssignmentIds =
      await this.findRequestedCourseAssignmentObjectIds(query);

    if (visibleAssignmentIds.length === 0) {
      return [];
    }

    const scopedAssignmentIds = this.intersectObjectIds(
      visibleAssignmentIds,
      requestedAssignmentIds,
    );

    if (requestedAssignmentIds && scopedAssignmentIds.length === 0) {
      throw new ForbiddenException(
        'Фільтр виходить за межі дозволеного академічного scope',
      );
    }

    return this.findByCourseAssignmentIds(
      scopedAssignmentIds,
      this.omitUserScopeQuery(query),
    );
  }

  async findOne(id: string): Promise<ScheduleEntryDto> {
    return this.getPopulatedEntryOrThrow(id);
  }

  async findOneForUser(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    const entry = await this.findOne(id);
    if (this.privilegedScheduleRoles.has(user.role)) {
      return entry;
    }

    if (
      await this.academicAccessService.canAccessCourseAssignment(
        entry.courseAssignmentId,
        user,
      )
    ) {
      return entry;
    }

    throw new ForbiddenException('Немає доступу до цього запису розкладу');
  }

  async findByGroup(
    groupId: string,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    return this.findAll({ ...query, groupId });
  }

  async findByTeacher(
    teacherId: string,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    return this.findAll({ ...query, teacherId });
  }

  async findByStudent(
    studentId: string,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    const assignmentIds =
      await this.academicAccessService.findVisibleCourseAssignmentIds({
        sub: studentId,
        login: '',
        role: Role.STUDENT,
      });
    return this.findByCourseAssignmentIds(assignmentIds, query);
  }

  async findByDate(date: string): Promise<ScheduleEntryDto[]> {
    return this.findAll({ date });
  }

  async isClassroomUsed(classroomId: string): Promise<boolean> {
    const count = await this.scheduleEntryModel
      .countDocuments({
        classroom: this.mapper.toObjectId(classroomId),
        status: { $ne: ScheduleEntryStatus.CANCELLED },
      })
      .exec();

    return count > 0;
  }

  async getPopulatedEntryOrThrow(id: string): Promise<ScheduleEntryDto> {
    const entry = await this.scheduleEntryModel
      .findById(this.mapper.toObjectId(id))
      .populate(this.mapper.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleEntryLean>()
      .exec();

    if (!entry) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    return this.mapper.formatEntry(entry);
  }

  private async findEntries(
    filter: ScheduleFilter,
  ): Promise<ScheduleEntryDto[]> {
    const entries = await this.scheduleEntryModel
      .find(filter as never)
      .sort({ date: 1, startTime: 1, endTime: 1 })
      .populate(this.mapper.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleEntryLean[]>()
      .exec();

    return entries.map((entry) => this.mapper.formatEntry(entry));
  }

  private async findByCourseAssignmentIds(
    assignmentIds: Types.ObjectId[],
    query: ScheduleQueryDto,
  ): Promise<ScheduleEntryDto[]> {
    if (assignmentIds.length === 0) {
      return [];
    }

    const filter = await this.buildScheduleFilter(query);
    filter.courseAssignment = { $in: assignmentIds };
    return this.findEntries(filter);
  }

  private async buildScheduleFilter(
    query: ScheduleQueryDto,
  ): Promise<ScheduleFilter> {
    const filter: ScheduleFilter = {};

    if (query.date) {
      const range = this.mapper.getDayRange(
        this.mapper.normalizeDate(query.date),
      );
      filter.date = { $gte: range.start, $lt: range.end };
    } else if (query.startDate || query.endDate) {
      filter.date = this.mapper.buildDateRange(query.startDate, query.endDate);
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.groupId || query.teacherId) {
      const assignmentIds = await this.findCourseAssignmentIds(query);
      filter.courseAssignment =
        assignmentIds.length > 0
          ? { $in: assignmentIds.map((id) => new Types.ObjectId(id)) }
          : { $in: [] };
    }

    return filter;
  }

  private async findRequestedCourseAssignmentObjectIds(
    query: ScheduleQueryDto,
  ): Promise<Types.ObjectId[] | null> {
    if (!query.groupId && !query.teacherId) {
      return null;
    }

    const assignmentIds = await this.findCourseAssignmentIds(query);
    return assignmentIds.map((id) => new Types.ObjectId(id));
  }

  private intersectObjectIds(
    visibleIds: Types.ObjectId[],
    requestedIds: Types.ObjectId[] | null,
  ): Types.ObjectId[] {
    if (!requestedIds) {
      return visibleIds;
    }

    const visible = new Set(visibleIds.map((id) => id.toHexString()));
    return requestedIds.filter((id) => visible.has(id.toHexString()));
  }

  private async findCourseAssignmentIds(
    query: ScheduleQueryDto,
  ): Promise<string[]> {
    const filter: CourseAssignmentFilter = {};

    if (query.groupId) {
      filter.group = this.mapper.toObjectId(query.groupId);
    }
    if (query.teacherId) {
      filter.teacher = this.mapper.toObjectId(query.teacherId);
    }

    const assignments = await this.courseAssignmentModel
      .find(filter as never)
      .select('_id')
      .lean<Array<{ _id: unknown }>>()
      .exec();

    return assignments.map((assignment) => toId(assignment._id));
  }

  private omitUserScopeQuery(query: ScheduleQueryDto): ScheduleQueryDto {
    return {
      date: query.date,
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
    };
  }
}
