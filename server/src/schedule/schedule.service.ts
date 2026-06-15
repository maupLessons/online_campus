import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  createSpreadsheetExportArtifact,
  SpreadsheetExportArtifact,
  SpreadsheetExportFormat,
} from '../common/export';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { CourseAssignment, CourseAssignmentDocument } from '../courses/schemas';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Classroom } from '../references/schemas';
import {
  CreateScheduleEntryDto,
  ScheduleEntryDto,
  ScheduleQueryDto,
  UpdateScheduleEntryDto,
} from './dto';
import {
  ScheduleEntry,
  ScheduleEntryDocument,
  ScheduleEntryStatus,
  ScheduleEntryType,
} from './schemas';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { buildSpreadsheetCsv } from '../common/export';

type EntityObject = { _id?: unknown; id?: unknown };
type EntityRef = Types.ObjectId | string | EntityObject;

type CourseLean = EntityObject & {
  name?: string;
  code?: string;
};

type GroupLean = EntityObject & {
  code?: string;
};

type UserLean = EntityObject & {
  firstName?: string;
  lastName?: string;
  middleName?: string;
};

type ClassroomLean = EntityObject & {
  building?: string;
  roomNumber?: string;
};

type CourseAssignmentLean = EntityObject & {
  course?: CourseLean | EntityRef;
  group?: GroupLean | EntityRef;
  teacher?: UserLean | EntityRef;
};

type ScheduleEntryLean = {
  _id: unknown;
  courseAssignment?: CourseAssignmentLean | EntityRef;
  classroom?: ClassroomLean | EntityRef | null;
  date: Date | string;
  startTime: string;
  endTime: string;
  type: ScheduleEntryType;
  status: ScheduleEntryStatus;
  createdAt?: Date;
  updatedAt?: Date;
};

type NormalizedSchedulePayload = {
  courseAssignmentId: string;
  classroomId?: string;
  date: Date;
  dateString: string;
  startTime: string;
  endTime: string;
  type: ScheduleEntryType;
  status: ScheduleEntryStatus;
  assignment: CourseAssignmentLean;
};

type ScheduleConflictType = 'teacher' | 'classroom' | 'group';

type ScheduleConflict = {
  type: ScheduleConflictType;
  entryId: string;
  date: string;
  startTime: string;
  endTime: string;
  message: string;
};

type ScheduleChangeAction = 'created' | 'updated' | 'deleted';
type ScheduleFilter = Record<string, unknown>;
type CourseAssignmentFilter = Record<string, unknown>;

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
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
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
    private readonly notificationsService: NotificationsService,
    private readonly academicAccessService: AcademicAccessService,
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

    const assignmentIds =
      await this.academicAccessService.findVisibleCourseAssignmentIds(user);
    return this.findByCourseAssignmentIds(
      assignmentIds,
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

  async create(
    dto: CreateScheduleEntryDto,
    audit?: DomainAuditContext,
  ): Promise<ScheduleEntryDto> {
    const payload = await this.normalizeCreatePayload(dto);
    await this.assertNoConflicts(payload);

    const created = await this.scheduleEntryModel.create({
      courseAssignment: new Types.ObjectId(payload.courseAssignmentId),
      classroom: payload.classroomId
        ? new Types.ObjectId(payload.classroomId)
        : null,
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      status: payload.status,
    } as never);

    const entry = await this.getPopulatedEntryOrThrow(toId(created._id));
    await this.notifyScheduleChanged('created', entry);
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_CREATE,
      targetEntity: 'schedule',
      targetId: entry.id,
      details: { after: this.toAuditSnapshot(entry) },
    });
    return entry;
  }

  async update(
    id: string,
    dto: UpdateScheduleEntryDto,
    audit?: DomainAuditContext,
  ): Promise<ScheduleEntryDto> {
    const entryId = this.toObjectId(id);
    const [currentEntry, currentView] = await Promise.all([
      this.scheduleEntryModel.findById(entryId).exec(),
      this.getPopulatedEntryOrThrow(id),
    ]);

    if (!currentEntry) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    const payload = await this.normalizeUpdatePayload(currentEntry, dto);
    await this.assertNoConflicts(payload, id);

    currentEntry.set({
      courseAssignment: new Types.ObjectId(payload.courseAssignmentId),
      classroom: payload.classroomId
        ? new Types.ObjectId(payload.classroomId)
        : null,
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      status: payload.status,
    });

    await currentEntry.save();

    const updatedEntry = await this.getPopulatedEntryOrThrow(id);
    await this.notifyScheduleChanged('updated', updatedEntry, currentView);
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_UPDATE,
      targetEntity: 'schedule',
      targetId: id,
      details: {
        before: this.toAuditSnapshot(currentView),
        after: this.toAuditSnapshot(updatedEntry),
      },
    });
    return updatedEntry;
  }

  async delete(
    id: string,
    audit?: DomainAuditContext,
  ): Promise<{ deleted: true }> {
    const entryId = this.toObjectId(id);
    const currentView = await this.getPopulatedEntryOrThrow(id);
    const result = await this.scheduleEntryModel
      .deleteOne({ _id: entryId })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    await this.notifyScheduleChanged('deleted', currentView);
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_DELETE,
      targetEntity: 'schedule',
      targetId: id,
      details: { before: this.toAuditSnapshot(currentView) },
    });
    return { deleted: true };
  }

  async isClassroomUsed(classroomId: string): Promise<boolean> {
    const count = await this.scheduleEntryModel
      .countDocuments({
        classroom: this.toObjectId(classroomId),
        status: { $ne: ScheduleEntryStatus.CANCELLED },
      })
      .exec();

    return count > 0;
  }

  async exportCsv(
    user: AuthenticatedUser,
    query: ScheduleQueryDto = {},
  ): Promise<SpreadsheetExportArtifact> {
    const entries = await this.findForUser(user, query);
    const rows = [
      [
        'date',
        'start_time',
        'end_time',
        'type',
        'status',
        'course_code',
        'course_name',
        'group',
        'teacher',
        'classroom',
      ],
      ...entries.map((entry) => [
        entry.date,
        entry.startTime,
        entry.endTime,
        entry.type,
        entry.status,
        entry.courseCode ?? '',
        entry.courseName ?? '',
        entry.groupCode ?? '',
        entry.teacherName ?? '',
        entry.classroom ?? '',
      ]),
    ];

    return createSpreadsheetExportArtifact({
      content: buildSpreadsheetCsv(rows),
      filename: 'schedule',
      format: SpreadsheetExportFormat.CSV,
    });
  }

  private async findEntries(
    filter: ScheduleFilter,
  ): Promise<ScheduleEntryDto[]> {
    const entries = await this.scheduleEntryModel
      .find(filter as never)
      .sort({ date: 1, startTime: 1, endTime: 1 })
      .populate(this.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleEntryLean[]>()
      .exec();

    return entries.map((entry) => this.formatEntry(entry));
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

  private async getPopulatedEntryOrThrow(
    id: string,
  ): Promise<ScheduleEntryDto> {
    const entry = await this.scheduleEntryModel
      .findById(this.toObjectId(id))
      .populate(this.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleEntryLean>()
      .exec();

    if (!entry) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    return this.formatEntry(entry);
  }

  private async buildScheduleFilter(
    query: ScheduleQueryDto,
  ): Promise<ScheduleFilter> {
    const filter: ScheduleFilter = {};

    if (query.date) {
      const range = this.getDayRange(this.normalizeDate(query.date));
      filter.date = { $gte: range.start, $lt: range.end };
    } else if (query.startDate || query.endDate) {
      filter.date = this.buildDateRange(query.startDate, query.endDate);
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

  private async findCourseAssignmentIds(
    query: ScheduleQueryDto,
  ): Promise<string[]> {
    const filter: CourseAssignmentFilter = {};

    if (query.groupId) {
      filter.group = this.toObjectId(query.groupId);
    }
    if (query.teacherId) {
      filter.teacher = this.toObjectId(query.teacherId);
    }

    const assignments = await this.courseAssignmentModel
      .find(filter as never)
      .select('_id')
      .lean<Array<{ _id: unknown }>>()
      .exec();

    return assignments.map((assignment) => toId(assignment._id));
  }

  private async normalizeCreatePayload(
    dto: CreateScheduleEntryDto,
  ): Promise<NormalizedSchedulePayload> {
    return this.normalizePayload({
      courseAssignmentId: dto.courseAssignmentId,
      classroomId: dto.classroomId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      type: dto.type,
      status: dto.status ?? ScheduleEntryStatus.SCHEDULED,
    });
  }

  private async normalizeUpdatePayload(
    currentEntry: ScheduleEntryDocument,
    dto: UpdateScheduleEntryDto,
  ): Promise<NormalizedSchedulePayload> {
    const currentClassroomId = currentEntry.classroom
      ? toId(currentEntry.classroom)
      : undefined;

    return this.normalizePayload({
      courseAssignmentId:
        dto.courseAssignmentId ?? toId(currentEntry.courseAssignment),
      classroomId:
        dto.classroomId !== undefined ? dto.classroomId : currentClassroomId,
      date: dto.date ?? this.formatDate(currentEntry.date),
      startTime: dto.startTime ?? currentEntry.startTime,
      endTime: dto.endTime ?? currentEntry.endTime,
      type: dto.type ?? currentEntry.type,
      status: dto.status ?? currentEntry.status,
    });
  }

  private async normalizePayload(payload: {
    courseAssignmentId: string;
    classroomId?: string;
    date: string;
    startTime: string;
    endTime: string;
    type: ScheduleEntryType;
    status: ScheduleEntryStatus;
  }): Promise<NormalizedSchedulePayload> {
    if (payload.startTime >= payload.endTime) {
      throw new BadRequestException(
        'Час завершення повинен бути пізніше часу початку',
      );
    }

    const date = this.normalizeDate(payload.date);
    const [assignment] = await Promise.all([
      this.getCourseAssignmentOrThrow(payload.courseAssignmentId),
      this.assertClassroomExists(payload.classroomId),
    ]);

    return {
      ...payload,
      date,
      dateString: this.formatDate(date),
      classroomId: payload.classroomId || undefined,
      assignment,
    };
  }

  private async assertNoConflicts(
    payload: NormalizedSchedulePayload,
    excludeEntryId?: string,
  ): Promise<void> {
    if (payload.status === ScheduleEntryStatus.CANCELLED) {
      return;
    }

    const range = this.getDayRange(payload.date);
    const filter: ScheduleFilter = {
      date: { $gte: range.start, $lt: range.end },
      status: { $ne: ScheduleEntryStatus.CANCELLED },
      startTime: { $lt: payload.endTime },
      endTime: { $gt: payload.startTime },
    };

    if (excludeEntryId) {
      filter._id = { $ne: this.toObjectId(excludeEntryId) };
    }

    const overlappingEntries = await this.scheduleEntryModel
      .find(filter as never)
      .populate(this.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleEntryLean[]>()
      .exec();

    const conflicts = this.collectConflicts(payload, overlappingEntries);

    if (conflicts.length > 0) {
      throw new ConflictException({
        message: 'Конфлікт розкладу',
        conflicts,
      });
    }
  }

  private collectConflicts(
    payload: NormalizedSchedulePayload,
    overlappingEntries: ScheduleEntryLean[],
  ): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const teacherId = this.idToString(payload.assignment.teacher);
    const groupId = this.idToString(payload.assignment.group);

    for (const entry of overlappingEntries) {
      const assignment = this.asCourseAssignment(entry.courseAssignment);
      const conflictBase = {
        entryId: this.idToString(entry),
        date: this.formatDate(entry.date),
        startTime: entry.startTime,
        endTime: entry.endTime,
      };

      if (teacherId && this.idToString(assignment?.teacher) === teacherId) {
        conflicts.push({
          ...conflictBase,
          type: 'teacher',
          message: `Викладач зайнятий: ${entry.startTime}-${entry.endTime}`,
        });
      }

      if (
        payload.classroomId &&
        this.idToString(entry.classroom) === payload.classroomId
      ) {
        conflicts.push({
          ...conflictBase,
          type: 'classroom',
          message: `Аудиторія зайнята: ${entry.startTime}-${entry.endTime}`,
        });
      }

      if (groupId && this.idToString(assignment?.group) === groupId) {
        conflicts.push({
          ...conflictBase,
          type: 'group',
          message: `Група зайнята: ${entry.startTime}-${entry.endTime}`,
        });
      }
    }

    return conflicts;
  }

  private async getCourseAssignmentOrThrow(
    id: string,
  ): Promise<CourseAssignmentLean> {
    const assignment = await this.courseAssignmentModel
      .findById(this.toObjectId(id))
      .populate(this.courseAssignmentPopulate().populate)
      .lean<CourseAssignmentLean>()
      .exec();

    if (!assignment) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }

    return assignment;
  }

  private async assertClassroomExists(classroomId?: string): Promise<void> {
    if (!classroomId) {
      return;
    }

    const classroomExists = await this.classroomModel
      .exists({ _id: this.toObjectId(classroomId) })
      .exec();

    if (!classroomExists) {
      throw new NotFoundException('Аудиторію не знайдено');
    }
  }

  private async notifyScheduleChanged(
    action: ScheduleChangeAction,
    entry: ScheduleEntryDto,
    previousEntry?: ScheduleEntryDto,
  ): Promise<void> {
    try {
      const recipientIds = await this.resolveNotificationRecipients([
        entry.courseAssignmentId,
        previousEntry?.courseAssignmentId,
      ]);

      if (recipientIds.length === 0) {
        this.logger.warn(
          `Schedule notification skipped: no recipients for entry ${entry.id}`,
        );
        return;
      }

      await this.notificationsService.createMany(
        recipientIds.map((userId) => ({
          userId,
          title: this.getNotificationTitle(action),
          message: this.getNotificationMessage(action, entry, previousEntry),
          type: NotificationType.SCHEDULE_CHANGE,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Schedule notification was not created for ${entry.id}: ${message}`,
      );
    }
  }

  private async resolveNotificationRecipients(
    courseAssignmentIds: Array<string | undefined>,
  ): Promise<string[]> {
    const objectIds = [
      ...new Set(
        courseAssignmentIds
          .filter((id): id is string => Boolean(id))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return [];
    }

    return this.academicAccessService.findCourseAssignmentRecipientIds(
      objectIds.map((id) => id.toHexString()),
    );
  }

  private getNotificationTitle(action: ScheduleChangeAction): string {
    if (action === 'created') return 'Нове заняття в розкладі';
    if (action === 'deleted') return 'Заняття видалено з розкладу';
    return 'Зміна розкладу';
  }

  private getNotificationMessage(
    action: ScheduleChangeAction,
    entry: ScheduleEntryDto,
    previousEntry?: ScheduleEntryDto,
  ): string {
    const course = entry.courseName ?? entry.courseCode ?? 'Заняття';
    const nextSlot = `${entry.date} ${entry.startTime}-${entry.endTime}`;

    if (action === 'created') {
      return `${course}: додано заняття ${nextSlot}.`;
    }
    if (action === 'deleted') {
      return `${course}: заняття ${nextSlot} видалено з розкладу.`;
    }

    const previousSlot = previousEntry
      ? `${previousEntry.date} ${previousEntry.startTime}-${previousEntry.endTime}`
      : 'попередній час';

    return `${course}: розклад змінено з ${previousSlot} на ${nextSlot}.`;
  }

  private formatEntry(entry: ScheduleEntryLean): ScheduleEntryDto {
    const assignment = this.asCourseAssignment(entry.courseAssignment);
    const course = this.asCourse(assignment?.course);
    const group = this.asGroup(assignment?.group);
    const teacher = this.asUser(assignment?.teacher);
    const classroom = this.asClassroom(entry.classroom);
    const teacherName = this.formatPersonName(teacher);

    return {
      id: this.idToString(entry),
      courseAssignmentId: this.idToString(assignment),
      classroomId: this.idToString(classroom) || undefined,
      date: this.formatDate(entry.date),
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      status: entry.status,
      courseName: course?.name,
      courseCode: course?.code,
      groupCode: group?.code,
      teacherId: this.idToString(teacher) || undefined,
      teacherName,
      classroom: classroom
        ? `${classroom.building ?? ''}, ауд. ${
            classroom.roomNumber ?? ''
          }`.trim()
        : 'Онлайн',
      createdAt: entry.createdAt?.toISOString(),
      updatedAt: entry.updatedAt?.toISOString(),
    };
  }

  private courseAssignmentPopulate() {
    return {
      path: 'courseAssignment',
      populate: [
        { path: 'course', select: 'name code' },
        { path: 'group', select: 'code' },
        { path: 'teacher', select: 'firstName lastName middleName' },
      ],
    };
  }

  private asCourseAssignment(
    value: CourseAssignmentLean | EntityRef | undefined,
  ): CourseAssignmentLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private asCourse(
    value: CourseLean | EntityRef | undefined,
  ): CourseLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private asGroup(
    value: GroupLean | EntityRef | undefined,
  ): GroupLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private asUser(
    value: UserLean | EntityRef | undefined,
  ): UserLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private asClassroom(
    value: ClassroomLean | EntityRef | null | undefined,
  ): ClassroomLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private normalizeDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Дата повинна мати формат YYYY-MM-DD');
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || this.formatDate(date) !== value) {
      throw new BadRequestException('Некоректна дата');
    }

    return date;
  }

  private buildDateRange(
    startDate?: string,
    endDate?: string,
  ): { $gte?: Date; $lt?: Date } {
    const range: { $gte?: Date; $lt?: Date } = {};

    if (startDate) {
      range.$gte = this.normalizeDate(startDate);
    }
    if (endDate) {
      range.$lt = this.getDayRange(this.normalizeDate(endDate)).end;
    }
    if (range.$gte && range.$lt && range.$gte >= range.$lt) {
      throw new BadRequestException(
        'Дата завершення повинна бути не раніше дати початку',
      );
    }

    return range;
  }

  private getDayRange(date: Date): { start: Date; end: Date } {
    const start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private formatDate(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некоректний ID');
    }
    return new Types.ObjectId(id);
  }

  private idToString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return toId(value);
  }

  private formatPersonName(person?: UserLean): string | undefined {
    if (!person) {
      return undefined;
    }

    const name = [person.lastName, person.firstName, person.middleName]
      .filter(Boolean)
      .join(' ');

    return name || undefined;
  }

  private omitUserScopeQuery(query: ScheduleQueryDto): ScheduleQueryDto {
    return {
      date: query.date,
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
    };
  }

  private toAuditSnapshot(entry: ScheduleEntryDto): Record<string, unknown> {
    return {
      courseAssignmentId: entry.courseAssignmentId,
      courseCode: entry.courseCode,
      courseName: entry.courseName,
      groupCode: entry.groupCode,
      teacherId: entry.teacherId,
      classroomId: entry.classroomId,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      status: entry.status,
    };
  }
}
