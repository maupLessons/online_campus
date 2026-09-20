import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types, PaginateModel, PaginateOptions } from 'mongoose';

import { CourseAssignmentCardDto, CourseAssignmentDto, CourseDto } from './dto';
import { termRef } from './dto/academic-term-ref.dto';
import { UpcomingLessonsPort } from './upcoming-lessons.port';
import { ScheduleService } from '../../schedule/schedule.service';
import { ScheduleEntryDto } from '../../schedule/dto';
import { Role } from '../../common/types/roles.enum';
import { toId } from '../../common/utils/to-id.util';
import { User, UserDocument } from '../../users/schemas';
import { UserDto } from '../../users/dto/user.dto';
import { UsersService } from '../../users/users.service';
import {
  activeStudentsInGroup,
  activeStudentsInGroups,
} from '../../users/student-profile.filters';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
  CourseDocument,
  CourseResource,
  CourseResourceType,
  CourseStatus,
} from '../schemas';
import {
  transformToPaginatedDto,
  transformToDto,
  transformToDtoArray,
} from '../../common/utils/transform.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import {
  PaginatedWithMeta,
  PaginatedMeta,
  emptyPaginated,
} from '../../common/dto/empty-paginated';
import { AcademicAccessService } from '../../common/access/academic-access.service';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { AcademicTermsService } from '../../academic-terms/academic-terms.service';
import { CoursesAccessService } from '../courses-access.service';
import { Department } from '../../references/schemas';
import {
  CreateCourseDto,
  UpdateCourseDto,
  UpdateMoodleUrlDto,
  UpdateResourcesDto,
  CatalogQueryDto,
} from '../dto';
import {
  assertMoodleUrl,
  assertResourceUrl,
  readHostList,
} from '../url-policy';
import { AUDIT_ACTIONS } from '../../audit-log/audit-actions';
import { DomainAuditContext } from '../../audit-log/audit-context';

/** Document shape after populate in getCard (§7.2) — to avoid `any` when reading fields. */
interface PopulatedAssignmentLean {
  _id: Types.ObjectId;
  source?: CourseAssignmentSource;
  curriculumSemester?: number | null;
  resources?: CourseResource[];
  course: {
    _id: Types.ObjectId;
    code: string;
    name: string;
    description?: string;
    credits: number;
    moodleUrl?: string;
    externalSubjectId?: string;
    department?: { _id: Types.ObjectId; name?: string };
  };
  teacher?: {
    _id: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    middleName?: string;
  } | null;
  group?: { _id: Types.ObjectId; code?: string };
  term?: { _id: Types.ObjectId; academicYear?: string; termNumber?: number };
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private courseModel: PaginateModel<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: PaginateModel<CourseAssignmentDocument>,
    private readonly academicAccessService: AcademicAccessService,
    private readonly academicTerms: AcademicTermsService,
    private readonly usersService: UsersService,
    private readonly access: CoursesAccessService,
    private readonly config: ConfigService,
    @InjectModel(Department.name) private departmentModel: Model<Department>,
    private readonly scheduleService: ScheduleService,
  ) {}

  private moodleHosts(): string[] {
    return readHostList(this.config.get<string>('MOODLE_ALLOWED_HOSTS'), [
      'dist.maup.com.ua',
    ]);
  }

  private blockedHosts(): string[] {
    return readHostList(this.config.get<string>('RESOURCE_BLOCKED_HOSTS'), []);
  }

  private withMeta<T>(
    page: PaginatedDto<T>,
    meta: PaginatedMeta,
  ): PaginatedWithMeta<T> {
    return Object.assign(page, { meta });
  }

  /** §4.1a: MAUP key conflict — 409 with the owning course's code, not raw E11000 */
  private async assertExternalSubjectIdFree(
    value: string,
    selfId?: Types.ObjectId,
  ): Promise<void> {
    const owner = await this.courseModel
      .findOne({
        externalSubjectId: value,
        ...(selfId ? { _id: { $ne: selfId } } : {}),
      })
      .select('code')
      .lean<{ code: string } | null>()
      .exec();
    if (owner) {
      throw new ConflictException({
        code: 'course_external_subject_id_taken',
        courseCode: owner.code,
        message: `Ключ МАУП уже використовує дисципліна ${owner.code}`,
      });
    }
  }

  /**
   * FIX C (review Task 3): assertExternalSubjectIdFree/exists is check-then-act,
   * leaving a race window between the check and the write; a concurrent write slips
   * past the check and fails directly with E11000 on the unique index. We map this into the same
   * 409 payload as the check-then-act above (instead of letting a raw MongoServerError escape as a 500) —
   * mirrors executeReferenceWrite (references/reference-write.util.ts), but with
   * course-specific error codes, since there are two different unique indexes here with different payloads.
   */
  private async mapCourseWriteConflict(
    error: unknown,
    externalSubjectId?: string,
    selfId?: Types.ObjectId,
  ): Promise<never> {
    const mongoError = error as {
      code?: number;
      keyPattern?: Record<string, unknown>;
    };
    if (mongoError?.code === 11000) {
      if (mongoError.keyPattern?.externalSubjectId) {
        const owner = externalSubjectId
          ? await this.courseModel
              .findOne({
                externalSubjectId,
                ...(selfId ? { _id: { $ne: selfId } } : {}),
              })
              .select('code')
              .lean<{ code: string } | null>()
              .exec()
          : null;
        throw new ConflictException({
          code: 'course_external_subject_id_taken',
          ...(owner ? { courseCode: owner.code } : {}),
          message: owner
            ? `Ключ МАУП уже використовує дисципліна ${owner.code}`
            : 'Ключ МАУП уже використовується іншою дисципліною',
        });
      }
      if (mongoError.keyPattern?.code) {
        throw new ConflictException({
          code: 'course_code_taken',
          message: 'Дисципліна з таким кодом уже існує',
        });
      }
    }
    throw error;
  }

  async listCatalog(
    query: CatalogQueryDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedDto<CourseDto>> {
    const scope = await this.access.buildCatalogFilter(
      user,
      query.departmentId,
    );
    const filter = { ...scope, status: query.status ?? CourseStatus.ACTIVE };
    const result = await this.courseModel.paginate(filter, {
      page: query.page || 1,
      limit: query.limit || 10,
      sort: { code: 1 },
      populate: [{ path: 'department', select: 'name' }],
      lean: true,
    });
    const term = await this.academicTerms.getCurrent();
    const counts = term
      ? await this.courseAssignmentModel.aggregate<{
          _id: Types.ObjectId;
          n: number;
        }>([
          {
            $match: {
              term: term._id,
              course: { $in: result.docs.map((c) => c._id) },
            },
          },
          { $group: { _id: '$course', n: { $sum: 1 } } },
        ])
      : [];
    const byCourse = new Map(counts.map((c) => [toId(c._id), c.n]));
    const page = transformToPaginatedDto(CourseDto, result);
    page.docs = page.docs.map((dto) => ({
      ...dto,
      activeAssignmentsCount: byCourse.get(dto.id) ?? 0,
    }));
    return page;
  }

  async findCourseById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<CourseDto> {
    const course = await this.access.loadCourseForRead(id, user);
    await course.populate({ path: 'department', select: 'name' });
    return transformToDto(CourseDto, course.toObject());
  }

  async createCourse(
    dto: CreateCourseDto,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<CourseDto> {
    await this.access.assertCanCreateInDepartment(dto.departmentId, user);
    const department = await this.departmentModel
      .exists({ _id: dto.departmentId })
      .exec();
    if (!department) throw new BadRequestException('Кафедру не знайдено');
    const exists = await this.courseModel
      .exists({ code: dto.code.trim() })
      .exec();
    if (exists) {
      throw new ConflictException({
        code: 'course_code_taken',
        message: 'Дисципліна з таким кодом уже існує',
      });
    }
    const externalSubjectId = dto.externalSubjectId?.trim() || undefined;
    if (externalSubjectId)
      await this.assertExternalSubjectIdFree(externalSubjectId);
    const moodleUrl = dto.moodleUrl
      ? assertMoodleUrl(dto.moodleUrl, this.moodleHosts())
      : undefined;
    const created = await this.courseModel
      .create({
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() || undefined,
        department: new Types.ObjectId(dto.departmentId),
        credits: dto.credits,
        externalSubjectId,
        moodleUrl,
        status: CourseStatus.ACTIVE,
        createdBy: new Types.ObjectId(user.sub),
      })
      .catch((error: unknown) =>
        this.mapCourseWriteConflict(error, externalSubjectId),
      );
    await audit?.record({
      action: AUDIT_ACTIONS.COURSE_CREATE,
      targetEntity: 'Course',
      targetId: toId(created._id),
      details: { code: created.code, departmentId: dto.departmentId },
    });
    return this.findCourseById(toId(created._id), user);
  }

  async updateCourse(
    id: string,
    dto: UpdateCourseDto,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<CourseDto> {
    const course = await this.access.loadCourseForManage(id, user);
    const snapshot = (c: CourseDocument) => ({
      name: c.name,
      description: c.description,
      credits: c.credits,
      externalSubjectId: c.externalSubjectId,
    });
    const before = snapshot(course);
    if (dto.name !== undefined) course.name = dto.name.trim();
    if (dto.description !== undefined)
      course.description = dto.description?.trim() || undefined;
    if (dto.credits !== undefined) course.credits = dto.credits;
    let nextExternalSubjectId: string | undefined;
    if (dto.externalSubjectId !== undefined) {
      const next = dto.externalSubjectId.trim();
      if (next === '') {
        // §4.1a: must be $unset, not null — otherwise the partial unique index collides on a second such course
        course.set('externalSubjectId', undefined);
      } else {
        await this.assertExternalSubjectIdFree(next, course._id);
        course.externalSubjectId = next;
        nextExternalSubjectId = next;
      }
    }
    course.updatedBy = new Types.ObjectId(user.sub);
    await course
      .save()
      .catch((error: unknown) =>
        this.mapCourseWriteConflict(error, nextExternalSubjectId, course._id),
      );
    await audit?.record({
      action: AUDIT_ACTIONS.COURSE_UPDATE,
      targetEntity: 'Course',
      targetId: id,
      details: { before, after: snapshot(course) },
    });
    return this.findCourseById(id, user);
  }

  async archiveCourse(
    id: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<CourseDto> {
    const course = await this.access.loadCourseForManage(id, user);
    if (course.status === CourseStatus.ARCHIVED)
      return this.findCourseById(id, user);
    const term = await this.academicTerms.getCurrent();
    if (term) {
      const inUse = await this.courseAssignmentModel
        .exists({ course: course._id, term: term._id } as never)
        .exec();
      if (inUse) {
        throw new ConflictException({
          code: 'course_has_current_assignments',
          message: 'Дисципліна має призначення в поточному періоді',
        });
      }
    }
    course.status = CourseStatus.ARCHIVED;
    course.archivedAt = new Date();
    course.archivedBy = new Types.ObjectId(user.sub);
    await course.save();
    await audit?.record({
      action: AUDIT_ACTIONS.COURSE_ARCHIVE,
      targetEntity: 'Course',
      targetId: id,
    });
    return this.findCourseById(id, user);
  }

  async restoreCourse(
    id: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<CourseDto> {
    const course = await this.access.loadCourseForManage(id, user);
    course.status = CourseStatus.ACTIVE;
    course.archivedAt = null;
    course.archivedBy = null;
    await course.save();
    await audit?.record({
      action: AUDIT_ACTIONS.COURSE_RESTORE,
      targetEntity: 'Course',
      targetId: id,
    });
    return this.findCourseById(id, user);
  }

  async setMoodleUrl(
    id: string,
    dto: UpdateMoodleUrlDto,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<CourseDto> {
    const course = await this.access.loadCourseForManage(id, user);
    if (user.role === Role.ADMIN && !dto.reason) {
      throw new BadRequestException('Адміністратор має вказати причину зміни');
    }
    const before = course.moodleUrl;
    course.moodleUrl =
      dto.moodleUrl === null
        ? undefined
        : assertMoodleUrl(dto.moodleUrl, this.moodleHosts());
    course.updatedBy = new Types.ObjectId(user.sub);
    await course.save();
    await audit?.record({
      action: AUDIT_ACTIONS.COURSE_MOODLE_URL_CHANGE,
      targetEntity: 'Course',
      targetId: id,
      details: {
        before,
        after: course.moodleUrl,
        ...(dto.reason ? { reason: dto.reason } : {}),
      },
    });
    return this.findCourseById(id, user);
  }

  async setResources(
    assignmentId: string,
    dto: UpdateResourcesDto,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<CourseAssignmentCardDto> {
    const assignment = await this.access.loadAssignmentForResources(
      assignmentId,
      user,
    );
    const blocked = this.blockedHosts();
    const now = new Date();
    const previous = assignment.resources ?? [];
    const hosts = (items: Array<{ url: string }>) =>
      new Set(items.map((r) => new URL(r.url).hostname.toLowerCase()));
    const before = hosts(previous);
    assignment.resources = dto.resources.map((r) => ({
      _id: new Types.ObjectId(),
      title: r.title.trim(),
      type: r.type ?? CourseResourceType.LINK,
      url: assertResourceUrl(r.url, blocked),
      addedBy: new Types.ObjectId(user.sub),
      addedAt: now,
    }));
    await assignment.save();
    const after = hosts(assignment.resources);
    await audit?.record({
      action: AUDIT_ACTIONS.COURSE_ASSIGNMENT_RESOURCES_UPDATE,
      targetEntity: 'CourseAssignment',
      targetId: assignmentId,
      // §5.2 and criterion §10.10: the log has only hosts and counts, NO full URLs —
      // the teacher sets the link arbitrarily, it may contain ?token=… (AUD-003)
      details: {
        before: previous.length,
        after: assignment.resources.length,
        addedHosts: [...after].filter((h) => !before.has(h)).sort(),
        removedHosts: [...before].filter((h) => !after.has(h)).sort(),
      },
    });
    return this.getCard(assignmentId, user);
  }

  async getCard(
    id: string,
    user: AuthenticatedUser,
  ): Promise<CourseAssignmentCardDto> {
    const access = await this.access.loadAssignmentForRead(id, user);
    const assignment = await this.courseAssignmentModel
      .findById(access._id)
      .populate([
        { path: 'course', populate: { path: 'department', select: 'name' } },
        { path: 'teacher', select: 'firstName lastName middleName' },
        { path: 'group', select: 'code' },
        { path: 'term', select: 'academicYear termNumber' },
      ])
      .lean<PopulatedAssignmentLean>()
      .exec();
    if (!assignment)
      throw new NotFoundException('Призначення курсу не знайдено');

    const { upcomingLessons, scheduleUnavailable } =
      await this.loadUpcomingLessons(id);

    const course = assignment.course;
    const teacher = assignment.teacher;
    const [canEditResources, canEditMoodleUrl] = await Promise.all([
      this.access.canEditResources(access, user),
      this.access.canEditMoodleUrl(
        access.course as unknown as CourseDocument,
        user,
      ),
    ]);

    return {
      id: toId(assignment._id),
      source: assignment.source ?? CourseAssignmentSource.STANDARD,
      course: {
        id: toId(course._id),
        code: course.code,
        name: course.name,
        description: course.description ?? undefined,
        credits: course.credits,
        moodleUrl: course.moodleUrl ?? undefined,
        // §4.3: MAUP key — only to those who can edit it
        externalSubjectId: canEditMoodleUrl
          ? (course.externalSubjectId ?? undefined)
          : undefined,
        department: {
          id: toId(course.department),
          name: course.department?.name ?? '',
        },
      },
      group: { id: toId(assignment.group), code: assignment.group?.code ?? '' },
      // without this check, toId({}) gives '[object Object]' in an assignment without a teacher
      teacher: teacher
        ? {
            id: toId(teacher),
            fullName: [teacher.lastName, teacher.firstName, teacher.middleName]
              .filter(Boolean)
              .join(' '),
          }
        : null,
      term: {
        id: toId(assignment.term),
        academicYear: assignment.term?.academicYear ?? '',
        termNumber: assignment.term?.termNumber ?? 0,
      },
      curriculumSemester: assignment.curriculumSemester ?? undefined,
      resources: (assignment.resources ?? []).map((r) => ({
        id: toId(r._id),
        title: r.title,
        type: r.type,
        url: r.url,
        addedAt: r.addedAt?.toISOString?.() ?? String(r.addedAt),
      })),
      upcomingLessons,
      moodleHref: course.moodleUrl ?? this.moodleBaseUrl(),
      canEditResources,
      canEditMoodleUrl,
      meta: { scheduleUnavailable },
    };
  }

  private moodleBaseUrl(): string {
    return `https://${this.moodleHosts()[0]}/`;
  }

  /**
   * §7.2 + 02 §5.2a. The port is optional: until plan 02 is implemented, the method is absent —
   * the card still opens with 200 and an empty list.
   */
  private async loadUpcomingLessons(assignmentId: string): Promise<{
    upcomingLessons: ScheduleEntryDto[];
    scheduleUnavailable: boolean;
  }> {
    const port = this.scheduleService as UpcomingLessonsPort;
    if (typeof port.findUpcomingForAssignment !== 'function') {
      return { upcomingLessons: [], scheduleUnavailable: true };
    }
    try {
      const lessons = await port.findUpcomingForAssignment(assignmentId, 5);
      return lessons == null
        ? { upcomingLessons: [], scheduleUnavailable: true }
        : { upcomingLessons: lessons, scheduleUnavailable: false };
    } catch {
      return { upcomingLessons: [], scheduleUnavailable: true };
    }
  }

  async findStudentsByCourseAssignment(
    courseAssignmentId: string,
    user: AuthenticatedUser,
  ): Promise<UserDto[]> {
    const ca = await this.access.loadAssignmentForRead(
      courseAssignmentId,
      user,
    );

    const students = await this.userModel
      .find(this.buildCourseStudentRosterFilter(ca) as never)
      .sort({ lastName: 1, firstName: 1, middleName: 1 })
      .lean()
      .exec();

    return transformToDtoArray(UserDto, students);
  }

  buildCourseStudentRosterFilter(
    courseAssignment: Pick<
      CourseAssignment,
      'group' | 'source' | 'enrolledStudents'
    >,
  ): Record<string, unknown> {
    const groupId = toId(courseAssignment.group);
    this.assertValidObjectId(groupId, 'групи');

    const filter: Record<string, unknown> = {
      role: Role.STUDENT,
      status: 'active',
      ...activeStudentsInGroup(new Types.ObjectId(groupId)),
    };

    if (courseAssignment.source === CourseAssignmentSource.ELECTIVE) {
      filter._id = {
        $in: this.normalizeObjectIds(courseAssignment.enrolledStudents ?? []),
      };
    }

    return filter;
  }

  async assertStudentBelongsToCourseAssignment(
    courseAssignment: Pick<
      CourseAssignment,
      'group' | 'source' | 'enrolledStudents'
    >,
    studentId: string,
  ): Promise<void> {
    this.assertValidObjectId(studentId, 'студента');

    const studentExists = await this.userModel
      .exists({
        $and: [
          this.buildCourseStudentRosterFilter(courseAssignment),
          { _id: new Types.ObjectId(studentId) },
        ],
      } as never)
      .exec();

    if (!studentExists) {
      throw new BadRequestException('Студент не зарахований на цю дисципліну');
    }
  }

  /** §5.1: meta is always present — in the non-empty page and in both empty states */
  async findMy(
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ): Promise<PaginatedWithMeta<CourseAssignmentDto>> {
    const current = await this.academicTerms.getCurrent();
    if (!current) {
      return this.withMeta(emptyPaginated<CourseAssignmentDto>(pagination), {
        term: null,
        reason: 'no_current_term',
      });
    }
    const term = termRef(current);
    if (role === Role.STUDENT) {
      const profile = await this.usersService.getActiveStudentProfile(userId);
      if (!profile) {
        return this.withMeta(emptyPaginated<CourseAssignmentDto>(pagination), {
          term,
          reason: 'no_active_profile',
        });
      }
      return this.withMeta(
        await this.findCoursesByStudent(userId, pagination, current._id),
        { term },
      );
    }
    if (role === Role.TEACHER) {
      return this.withMeta(
        await this.findCoursesByTeacher(userId, pagination, current._id),
        { term },
      );
    }
    // the other-roles branch from plan 01 — kept verbatim; after the @Roles narrowing it's unreachable
    const options: PaginateOptions = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: ['course', 'teacher', 'group', 'term'],
      lean: true,
    };

    const scope = await this.academicAccessService.buildCourseAssignmentFilter({
      sub: userId,
      login: '',
      role,
    });
    const result = await this.courseAssignmentModel.paginate(
      { $and: [scope, { term: current._id }] },
      options,
    );
    return this.withMeta(transformToPaginatedDto(CourseAssignmentDto, result), {
      term,
    });
  }

  async findCourseAssignments(
    pagination: PaginationDto,
    user: AuthenticatedUser,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const options: PaginateOptions = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: [
        { path: 'course' },
        { path: 'teacher' },
        { path: 'term' },
        {
          path: 'group',
          populate: { path: 'specialty' },
        },
      ],
      sort: { createdAt: -1 },
      lean: true,
    };

    const filter =
      await this.academicAccessService.buildCourseAssignmentFilter(user);
    const result = await this.courseAssignmentModel.paginate(filter, options);

    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async findCoursesByStudent(
    studentId: string,
    pagination: PaginationDto,
    termId: Types.ObjectId,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const profile = await this.usersService.getActiveStudentProfile(studentId);
    if (!profile) {
      return emptyPaginated<CourseAssignmentDto>(pagination);
    }

    const options: PaginateOptions = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: ['course', 'teacher', 'term'],
      sort: { createdAt: -1 },
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      this.buildStudentCourseAssignmentFilter(
        studentId,
        toId(profile.group._id),
        termId,
      ),
      options,
    );

    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async findCoursesByTeacher(
    teacherId: string,
    pagination: PaginationDto,
    termId: Types.ObjectId,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const options: PaginateOptions = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: [
        { path: 'course' },
        { path: 'teacher' },
        { path: 'term' },
        {
          path: 'group',
          populate: { path: 'specialty' },
        },
      ],
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      { teacher: new Types.ObjectId(teacherId), term: termId },
      options,
    );

    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async isUserAssignedToCourseTargets(params: {
    userId: string;
    role: Role;
    targetIds: string[];
    groupId?: string | null;
  }): Promise<boolean> {
    const objectIds = params.targetIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return false;
    }

    const targetFilter: Record<string, unknown> = {
      $or: [{ _id: { $in: objectIds } }, { course: { $in: objectIds } }],
    };

    if (params.role === Role.TEACHER) {
      if (!Types.ObjectId.isValid(params.userId)) {
        return false;
      }

      const match = await this.courseAssignmentModel
        .exists({
          ...targetFilter,
          teacher: new Types.ObjectId(params.userId),
        } as never)
        .exec();

      return match !== null;
    }

    if (params.role === Role.STUDENT) {
      if (
        !params.groupId ||
        !Types.ObjectId.isValid(params.groupId) ||
        !Types.ObjectId.isValid(params.userId)
      ) {
        return false;
      }

      const match = await this.courseAssignmentModel
        .exists({
          $and: [
            targetFilter,
            { group: new Types.ObjectId(params.groupId) },
            {
              $or: [
                { source: { $exists: false } },
                { source: CourseAssignmentSource.STANDARD },
                {
                  source: CourseAssignmentSource.ELECTIVE,
                  enrolledStudents: new Types.ObjectId(params.userId),
                },
              ],
            },
          ],
        } as never)
        .exec();

      return match !== null;
    }

    return false;
  }

  async findUserIdsByCourseTargets(targetIds: string[]): Promise<string[]> {
    const courseAssignments = await this.findCourseTargetAssignments(targetIds);

    const teacherIds = courseAssignments.map((assignment) =>
      toId(assignment.teacher),
    );
    const studentIds =
      await this.findActiveStudentIdsForAssignments(courseAssignments);

    return [...new Set([...teacherIds, ...studentIds])];
  }

  async findStudentIdsByCourseTargets(targetIds: string[]): Promise<string[]> {
    const courseAssignments = await this.findCourseTargetAssignments(targetIds);
    return this.findActiveStudentIdsForAssignments(courseAssignments);
  }

  private async findCourseTargetAssignments(targetIds: string[]) {
    const objectIds = targetIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return [];
    }

    const assignmentFilter: Record<string, unknown> = {
      $or: [{ _id: { $in: objectIds } }, { course: { $in: objectIds } }],
    };

    return this.courseAssignmentModel
      .find(assignmentFilter as never)
      .select('teacher group source enrolledStudents')
      .lean()
      .exec();
  }

  private async findActiveStudentIdsForAssignments(
    courseAssignments: Array<
      Pick<
        CourseAssignment,
        'group' | 'source' | 'enrolledStudents' | 'teacher'
      >
    >,
  ): Promise<string[]> {
    const standardGroupIds = [
      ...new Set(
        courseAssignments
          .filter(
            (assignment) =>
              assignment.source !== CourseAssignmentSource.ELECTIVE,
          )
          .map((assignment) => toId(assignment.group)),
      ),
    ]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    const rosterFilters: Record<string, unknown>[] = [];

    if (standardGroupIds.length > 0) {
      rosterFilters.push(activeStudentsInGroups(standardGroupIds));
    }
    for (const assignment of courseAssignments) {
      if (assignment.source !== CourseAssignmentSource.ELECTIVE) {
        continue;
      }

      const groupId = toId(assignment.group);
      const enrolledStudents = this.normalizeObjectIds(
        assignment.enrolledStudents ?? [],
      );
      if (!Types.ObjectId.isValid(groupId) || enrolledStudents.length === 0) {
        continue;
      }

      rosterFilters.push({
        _id: { $in: enrolledStudents },
        ...activeStudentsInGroup(new Types.ObjectId(groupId)),
      });
    }
    if (rosterFilters.length === 0) {
      return [];
    }

    const students = await this.userModel
      .find({
        role: Role.STUDENT,
        status: 'active',
        $or: rosterFilters,
      } as never)
      .select('_id')
      .lean()
      .exec();

    return [...new Set(students.map((student) => toId(student._id)))];
  }

  private buildStudentCourseAssignmentFilter(
    studentId: string,
    groupId: string,
    termId: Types.ObjectId,
  ): Record<string, unknown> {
    return {
      group: new Types.ObjectId(groupId),
      term: termId,
      $or: [
        { source: { $exists: false } },
        { source: CourseAssignmentSource.STANDARD },
        {
          source: CourseAssignmentSource.ELECTIVE,
          enrolledStudents: new Types.ObjectId(studentId),
        },
      ],
    };
  }

  private normalizeObjectIds(values: unknown[]): Types.ObjectId[] {
    return [
      ...new Set(
        values
          .map((value) => toId(value))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));
  }

  private assertValidObjectId(value: string, entity: string): void {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Некоректний ID ${entity}`);
    }
  }
}
