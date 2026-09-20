import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Model, Types } from 'mongoose';
import {
  buildSpreadsheetExportArtifact,
  SpreadsheetExportArtifact,
  SpreadsheetExportFormat,
} from '../common/export';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
  CourseDocument,
  CourseStatus,
} from '../courses/schemas';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { Department, Group } from '../references/schemas';
import { User, UserDocument } from '../users/schemas';
import { UsersService } from '../users/users.service';
import { pickActiveStudentProfile } from '../users/dto/user.dto';
import { activeStudentsInGroups } from '../users/student-profile.filters';
import {
  CreateElectiveDisciplineDto,
  CreateElectivePeriodDto,
  ElectiveDisciplineQueryDto,
  ElectivePeriodQueryDto,
  SelectElectiveDto,
  SetElectiveDisciplineStatusDto,
  SetElectivePeriodStatusDto,
  UpdateElectiveDisciplineDto,
  UpdateElectivePeriodDto,
} from './dto';
import {
  buildElectiveResultsCsv,
  buildElectiveResultsXlsx,
  ElectiveExportResults,
} from './elective-results-exporter';
import {
  ACTIVE_SELECTION_STATUSES,
  ElectiveDiscipline,
  ElectiveDisciplineDocument,
  ElectiveDisciplineStatus,
  ElectiveSelection,
  ElectiveSelectionCancelReason,
  ElectiveSelectionDocument,
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodDocument,
  ElectiveSelectionPeriodStatus,
  ElectiveSelectionStatus,
} from './schemas';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuditLogService } from '../audit-log/audit-log.service';
import { computeElectivePhase, ElectivePhase } from './elective-phase';

type ReferenceView = {
  id: string;
  name?: string;
  code?: string;
};

type TermView = { id: string; academicYear?: string; termNumber?: 1 | 2 };

export type ElectiveDisciplineView = {
  id: string;
  code: string;
  title: string;
  description?: string;
  department: ReferenceView;
  teacher?: ReferenceView | null;
  term: TermView;
  credits: number;
  capacity: number;
  enrolledCount: number;
  availableSeats: number;
  status: ElectiveDisciplineStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
  cancelReason?: string;
  cancelledAt?: string;
};

export type ElectivePeriodView = {
  id: string;
  title: string;
  term: TermView;
  startsAt: string;
  endsAt: string;
  status: ElectiveSelectionPeriodStatus;
  targetGroups: ReferenceView[];
  requiredChoices: number;
  createdBy: string;
  publishedAt?: string;
  closedAt?: string;
  finalizedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ElectiveSelectionView = {
  id: string;
  periodId: string;
  discipline: ElectiveDisciplineView;
  student: ReferenceView;
  group: ReferenceView;
  selectedAt: string;
  status: ElectiveSelectionStatus;
  cancelReason?: ElectiveSelectionCancelReason;
  cancelledAt?: string;
  courseAssignmentId?: string;
  finalizedAt?: string;
};

export type ActiveElectivePeriodView = {
  period: ElectivePeriodView;
  phase: ElectivePhase;
  disciplines: ElectiveDisciplineView[];
  selections: ElectiveSelectionView[];
  selectedCount: number;
  remainingChoices: number;
};

export type ElectivePeriodResultsView = {
  period: ElectivePeriodView;
  totalSelections: number;
  totalStudents: number;
  expectedSelections: number;
  completionRate: number;
  disciplines: Array<{
    discipline: ElectiveDisciplineView;
    selectedCount: number;
    capacity: number;
    groups: Array<{ group: ReferenceView; selectedCount: number }>;
    students: Array<{
      id: string;
      login?: string;
      fullName: string;
      group: ReferenceView;
      selectedAt: string;
    }>;
  }>;
  cancelledByDiscipline: Array<{
    discipline: ElectiveDisciplineView;
    cancelledCount: number;
  }>;
};

export type ElectivePeriodFinalizationView = {
  period: ElectivePeriodView;
  totalSelections: number;
  courseAssignments: Array<{
    id: string;
    courseId: string;
    disciplineId: string;
    groupId: string;
    studentCount: number;
  }>;
};

const DISCIPLINE_MANAGER_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.DEPARTMENT_HEAD,
  Role.DEAN,
]);

const PERIOD_MANAGER_ROLES = new Set<Role>([Role.ADMIN, Role.DEAN]);

type FinalizationBucket = {
  discipline: ElectiveDisciplineDocument;
  groupId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  selectionIds: Types.ObjectId[];
};

type ExistingSelectionQuota = {
  discipline?: Types.ObjectId | string;
  choiceSlot?: number;
};

const FINALIZATION_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class ElectiveDisciplinesService {
  private readonly logger = new Logger(ElectiveDisciplinesService.name);

  constructor(
    @InjectModel(ElectiveDiscipline.name)
    private readonly disciplineModel: Model<ElectiveDisciplineDocument>,
    @InjectModel(ElectiveSelectionPeriod.name)
    private readonly periodModel: Model<ElectiveSelectionPeriodDocument>,
    @InjectModel(ElectiveSelection.name)
    private readonly selectionModel: Model<ElectiveSelectionDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
    @InjectModel(Group.name)
    private readonly groupModel: Model<Group>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly academicTerms: AcademicTermsService,
    private readonly configService: ConfigService,
    private readonly auditLogService?: AuditLogService,
  ) {}

  private async resolveTermId(termId?: string): Promise<Types.ObjectId> {
    if (termId) {
      const term = await this.academicTerms.findById(termId);
      return term._id;
    }
    return (await this.academicTerms.requireCurrent())._id;
  }

  async createDiscipline(
    dto: CreateElectiveDisciplineDto,
    user: AuthenticatedUser,
  ): Promise<ElectiveDisciplineView> {
    this.ensureDisciplineManager(user);

    const departmentId = this.toObjectId(dto.departmentId);
    await this.ensureCanManageDepartment(user, departmentId);
    await this.assertDepartmentExists(departmentId);
    const teacherId = await this.normalizeTeacherId(
      dto.teacherId,
      departmentId,
    );

    const discipline = await this.disciplineModel.create({
      code: this.normalizeCode(dto.code),
      title: this.trimRequired(dto.title, 'Назва дисципліни обовʼязкова'),
      description: this.trimOptional(dto.description),
      department: departmentId,
      teacher: teacherId,
      term: await this.resolveTermId(dto.termId),
      credits: dto.credits,
      capacity: dto.capacity,
      enrolledCount: 0,
      status: ElectiveDisciplineStatus.DRAFT,
      createdBy: this.toObjectId(user.sub),
    });

    return this.findDisciplineView(discipline._id);
  }

  async listDisciplines(
    query: ElectiveDisciplineQueryDto,
    user: AuthenticatedUser,
  ): Promise<ElectiveDisciplineView[]> {
    this.ensureDisciplineManager(user);

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.termId) filter.term = this.toObjectId(query.termId);

    if (query.departmentId) {
      const departmentId = this.toObjectId(query.departmentId);
      await this.ensureCanManageDepartment(user, departmentId);
      filter.department = departmentId;
    } else if (user.role === Role.DEPARTMENT_HEAD) {
      filter.department = await this.getManagerDepartmentId(user);
    }

    const disciplines = await this.disciplineModel
      .find(filter)
      .populate('department')
      .populate('teacher')
      .populate('term')
      .sort({ title: 1 })
      .exec();

    return disciplines.map((discipline) => this.formatDiscipline(discipline));
  }

  async updateDiscipline(
    id: string,
    dto: UpdateElectiveDisciplineDto,
    user: AuthenticatedUser,
  ): Promise<ElectiveDisciplineView> {
    this.ensureDisciplineManager(user);

    const discipline = await this.getDisciplineOrThrow(id);
    const currentDepartmentId = this.toObjectId(
      this.idToString(discipline.department),
    );
    await this.ensureCanManageDepartment(user, currentDepartmentId);

    let nextDepartmentId = currentDepartmentId;
    let departmentChanged = false;
    if (dto.departmentId) {
      nextDepartmentId = this.toObjectId(dto.departmentId);
      await this.ensureCanManageDepartment(user, nextDepartmentId);
      await this.assertDepartmentExists(nextDepartmentId);
      discipline.department = nextDepartmentId;
      departmentChanged = !nextDepartmentId.equals(currentDepartmentId);
    }

    if (dto.teacherId !== undefined) {
      discipline.teacher = await this.normalizeTeacherId(
        dto.teacherId,
        nextDepartmentId,
      );
    } else if (departmentChanged) {
      discipline.teacher = null;
    }

    if (dto.code !== undefined) discipline.code = this.normalizeCode(dto.code);
    if (dto.title !== undefined) {
      discipline.title = this.trimRequired(
        dto.title,
        'Назва дисципліни обовʼязкова',
      );
    }
    if (dto.description !== undefined) {
      discipline.description = this.trimOptional(dto.description);
    }
    if (dto.termId !== undefined) {
      discipline.term = await this.resolveTermId(dto.termId);
    }
    if (dto.credits !== undefined) discipline.credits = dto.credits;
    if (dto.capacity !== undefined) {
      if (dto.capacity < discipline.enrolledCount) {
        throw new BadRequestException(
          'Місткість не може бути меншою за кількість уже обраних місць',
        );
      }
      discipline.capacity = dto.capacity;
    }

    await discipline.save();
    return this.findDisciplineView(discipline._id);
  }

  async setDisciplineStatus(
    id: string,
    dto: SetElectiveDisciplineStatusDto,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<ElectiveDisciplineView> {
    if (dto.status === ElectiveDisciplineStatus.CANCELLED) {
      return this.cancelDiscipline(id, dto.reason ?? '', user, audit);
    }

    this.ensureDisciplineManager(user);
    const discipline = await this.getDisciplineOrThrow(id);
    if (discipline.status === ElectiveDisciplineStatus.CANCELLED) {
      throw new BadRequestException('Скасовану дисципліну не можна змінити');
    }
    await this.ensureCanManageDepartment(
      user,
      this.toObjectId(this.idToString(discipline.department)),
    );

    const previousStatus = discipline.status;
    discipline.status = dto.status;
    await discipline.save();
    await audit?.record({
      action: AUDIT_ACTIONS.ELECTIVE_DISCIPLINE_STATUS_CHANGE,
      targetEntity: 'elective_discipline',
      targetId: this.idToString(discipline._id),
      details: {
        code: discipline.code,
        before: { status: previousStatus },
        after: { status: dto.status },
      },
    });
    return this.findDisciplineView(discipline._id);
  }

  async cancelDiscipline(
    id: string,
    reason: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<ElectiveDisciplineView> {
    this.ensureDisciplineManager(user);
    const trimmedReason = this.trimRequired(
      reason,
      'Вкажіть причину скасування',
    );
    const discipline = await this.getDisciplineOrThrow(id);
    const departmentId = this.toObjectId(
      this.idToString(discipline.department),
    );
    await this.ensureCanManageDepartment(user, departmentId);

    if (discipline.status !== ElectiveDisciplineStatus.ACTIVE) {
      throw new BadRequestException('Скасувати можна лише активну дисципліну');
    }

    // Spec §5.1 / criterion #2: 409 if the discipline's period is already finalized.
    // There's no direct discipline → period reference in the model (§4.1), so the link
    // is derived via this discipline's selections. Checking for the presence of ENROLLED selections
    // is NOT equivalent: the period can be finalized while all selections of this discipline
    // are cancelled as incomplete_set.
    const periodIds = (await this.selectionModel
      .distinct('period', { discipline: discipline._id })
      .exec()) as Types.ObjectId[];
    if (periodIds.length > 0) {
      const finalizedFilter: Record<string, unknown> = {
        _id: { $in: periodIds },
        status: ElectiveSelectionPeriodStatus.FINALIZED,
      };
      const finalized = await this.periodModel.exists(finalizedFilter).exec();
      if (finalized) {
        throw new ConflictException(
          'Період вибору вже фіналізовано — дисципліну не можна скасувати',
        );
      }
    }

    const now = new Date();

    // Step 1 (point of no return): atomic conditional transition ACTIVE →
    // CANCELLED — BEFORE the selections cascade. With no transactions in this codebase this
    // minimizes the failure window: if the process crashes right here, the discipline either
    // stays ACTIVE (and a retry safely repeats everything from the start),
    // or is already CANCELLED (and a retry falls on the condition below instead of
    // silently counting affectedSelections as 0 and skipping the notification —
    // as used to happen when the cascade ran first and the flip ran last).
    const cancelledDiscipline = await this.disciplineModel
      .findOneAndUpdate(
        { _id: discipline._id, status: ElectiveDisciplineStatus.ACTIVE },
        {
          $set: {
            status: ElectiveDisciplineStatus.CANCELLED,
            cancelledAt: now,
            cancelledBy: this.toObjectId(user.sub),
            cancelReason: trimmedReason,
            enrolledCount: 0,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!cancelledDiscipline) {
      throw new ConflictException('Дисципліну вже скасовано');
    }

    // Step 2: cascade. affectedSelections is counted from the updateMany result
    // (not from a read before the mutation) — otherwise a retry after a crash between
    // step 1 and step 2 would report 0 affected selections.
    const cascadeResult = await this.selectionModel
      .updateMany(
        {
          discipline: discipline._id,
          status: ElectiveSelectionStatus.SELECTED,
        },
        {
          $set: {
            status: ElectiveSelectionStatus.CANCELLED,
            cancelReason: 'discipline_cancelled',
            cancelledAt: now,
          },
        },
      )
      .exec();
    const affectedSelections = cascadeResult.modifiedCount;

    const affected = await this.selectionModel
      .find({
        discipline: discipline._id,
        cancelReason: 'discipline_cancelled',
        cancelledAt: now,
      })
      .select('_id student period')
      .lean<
        Array<{
          _id: Types.ObjectId;
          student: Types.ObjectId;
          period: Types.ObjectId;
        }>
      >()
      .exec();

    await this.notifyDisciplineCancelled(
      discipline,
      trimmedReason,
      affected,
      departmentId,
    );
    await audit?.record({
      action: AUDIT_ACTIONS.ELECTIVE_DISCIPLINE_STATUS_CHANGE,
      targetEntity: 'elective_discipline',
      targetId: this.idToString(discipline._id),
      // AUD-003: only a count of affected selections, no student list
      details: {
        code: discipline.code,
        reason: trimmedReason,
        affectedSelections,
        before: { status: ElectiveDisciplineStatus.ACTIVE },
        after: { status: ElectiveDisciplineStatus.CANCELLED },
      },
    });
    return this.findDisciplineView(discipline._id);
  }

  private async notifyDisciplineCancelled(
    discipline: ElectiveDisciplineDocument,
    reason: string,
    affected: Array<{ student: Types.ObjectId }>,
    departmentId: Types.ObjectId,
  ): Promise<void> {
    try {
      const studentIds = [
        ...new Set(affected.map((item) => this.idToString(item.student))),
      ];
      const department = await this.departmentModel
        .findById(departmentId)
        .select('faculty')
        .lean<{ faculty?: Types.ObjectId }>()
        .exec();
      const facultyDepartmentIds = department?.faculty
        ? (
            await this.departmentModel
              .find({ faculty: department.faculty })
              .select('_id')
              .lean<Array<{ _id: Types.ObjectId }>>()
              .exec()
          ).map((d) => d._id)
        : [departmentId];
      const deansFilter: Record<string, unknown> = {
        role: Role.DEAN,
        status: 'active',
        'teacherProfile.department': { $in: facultyDepartmentIds },
      };
      const deans = await this.userModel
        .find(deansFilter)
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>()
        .exec();

      const disciplineId = this.idToString(discipline._id);
      await this.notificationsService.createMany([
        ...studentIds.map((userId) => ({
          title: 'Вибіркову дисципліну скасовано',
          message: `«${discipline.title}» скасовано: ${reason}. Оберіть іншу дисципліну, якщо період ще відкритий.`,
          type: NotificationType.ELECTIVE,
          targetType: 'all' as const,
          userId,
          actionUrl: '/electives',
          entityType: 'elective',
          entityId: disciplineId,
          important: true,
        })),
        ...deans.map((dean) => ({
          title: 'Скасовано вибіркову дисципліну',
          message: `«${discipline.title}» (${discipline.code}) скасовано. Заторкнуто студентів: ${studentIds.length}.`,
          type: NotificationType.ELECTIVE,
          targetType: 'all' as const,
          userId: this.idToString(dean._id),
          actionUrl: '/electives/admin',
          entityType: 'elective',
          entityId: disciplineId,
          important: false,
        })),
      ]);
    } catch (error) {
      this.logger.warn(
        `Elective cancellation notification skipped: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async createPeriod(
    dto: CreateElectivePeriodDto,
    user: AuthenticatedUser,
  ): Promise<ElectivePeriodView> {
    this.ensurePeriodManager(user);

    const dates = this.normalizePeriodDates(dto.startsAt, dto.endsAt);
    const targetGroups = this.normalizeObjectIds(dto.targetGroupIds);
    await this.assertGroupsExist(targetGroups);

    const period = await this.periodModel.create({
      title: this.trimRequired(dto.title, 'Назва періоду обовʼязкова'),
      term: await this.resolveTermId(dto.termId),
      startsAt: dates.startsAt,
      endsAt: dates.endsAt,
      status: ElectiveSelectionPeriodStatus.DRAFT,
      targetGroups,
      requiredChoices: dto.requiredChoices ?? 1,
      createdBy: this.toObjectId(user.sub),
    });

    return this.findPeriodView(period._id);
  }

  async listPeriods(
    query: ElectivePeriodQueryDto,
    user: AuthenticatedUser,
  ): Promise<ElectivePeriodView[]> {
    this.ensurePeriodManager(user);
    await this.closeExpiredPeriods();
    await this.remindDuePeriods(
      new Date(),
      Number(this.configService.get<string>('ELECTIVE_REMINDER_DAYS') ?? 3),
    );

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.termId) filter.term = this.toObjectId(query.termId);

    const periods = await this.periodModel
      .find(filter)
      .populate('targetGroups')
      .populate('term')
      .sort({ startsAt: -1, createdAt: -1 })
      .exec();

    return periods.map((period) => this.formatPeriod(period));
  }

  async updatePeriod(
    id: string,
    dto: UpdateElectivePeriodDto,
    user: AuthenticatedUser,
  ): Promise<ElectivePeriodView> {
    this.ensurePeriodManager(user);

    const period = await this.getPeriodOrThrow(id);
    this.ensureDraftPeriod(period);

    if (dto.title !== undefined) {
      period.title = this.trimRequired(dto.title, 'Назва періоду обовʼязкова');
    }
    if (dto.termId !== undefined) {
      period.term = await this.resolveTermId(dto.termId);
    }
    if (dto.startsAt !== undefined || dto.endsAt !== undefined) {
      const dates = this.normalizePeriodDates(
        dto.startsAt ?? period.startsAt.toISOString(),
        dto.endsAt ?? period.endsAt.toISOString(),
      );
      period.startsAt = dates.startsAt;
      period.endsAt = dates.endsAt;
    }
    if (dto.targetGroupIds !== undefined) {
      const targetGroups = this.normalizeObjectIds(dto.targetGroupIds);
      await this.assertGroupsExist(targetGroups);
      period.targetGroups = targetGroups;
    }
    if (dto.requiredChoices !== undefined) {
      period.requiredChoices = dto.requiredChoices;
    }

    await period.save();
    return this.findPeriodView(period._id);
  }

  async setPeriodStatus(
    id: string,
    dto: SetElectivePeriodStatusDto,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<ElectivePeriodView> {
    this.ensurePeriodManager(user);

    const period = await this.getPeriodOrThrow(id);
    const now = new Date();

    if (period.status === ElectiveSelectionPeriodStatus.FINALIZED) {
      throw new BadRequestException('Фіналізований період змінювати не можна');
    }

    if (dto.status === ElectiveSelectionPeriodStatus.FINALIZED) {
      throw new BadRequestException(
        'Для фіналізації використовуйте окрему дію',
      );
    }

    if (dto.status === ElectiveSelectionPeriodStatus.ACTIVE) {
      if (period.status !== ElectiveSelectionPeriodStatus.DRAFT) {
        throw new BadRequestException('Активувати можна лише чернетку');
      }
      if (period.endsAt <= now) {
        throw new BadRequestException('Дата завершення періоду вже минула');
      }
      if (period.targetGroups.length === 0) {
        throw new BadRequestException('Період повинен мати цільові групи');
      }

      const activated = await this.periodModel
        .findOneAndUpdate(
          {
            _id: period._id,
            status: ElectiveSelectionPeriodStatus.DRAFT,
          },
          {
            $set: {
              status: ElectiveSelectionPeriodStatus.ACTIVE,
              publishedAt: now,
            },
            $unset: { closedAt: '' },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();
      if (!activated) {
        throw new ConflictException(
          'Стан періоду вже змінився. Оновіть сторінку та повторіть дію',
        );
      }

      await this.notifyPeriodPublished(activated);
      const view = await this.findPeriodView(activated._id);
      await audit?.record({
        action: AUDIT_ACTIONS.ELECTIVE_PERIOD_PUBLISH,
        targetEntity: 'elective_period',
        targetId: view.id,
        details: {
          title: view.title,
          academicYear: view.term.academicYear,
          termNumber: view.term.termNumber,
          targetGroupCount: view.targetGroups.length,
          before: { status: ElectiveSelectionPeriodStatus.DRAFT },
          after: { status: view.status },
        },
      });
      return view;
    }

    if (dto.status === ElectiveSelectionPeriodStatus.CLOSED) {
      if (period.status !== ElectiveSelectionPeriodStatus.ACTIVE) {
        throw new BadRequestException(
          'Закрити можна лише активний період вибору',
        );
      }

      const closed = await this.periodModel
        .findOneAndUpdate(
          {
            _id: period._id,
            status: ElectiveSelectionPeriodStatus.ACTIVE,
          },
          {
            $set: {
              status: ElectiveSelectionPeriodStatus.CLOSED,
              closedAt: now,
            },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();
      if (!closed) {
        throw new ConflictException(
          'Стан періоду вже змінився. Оновіть сторінку та повторіть дію',
        );
      }

      const view = await this.findPeriodView(closed._id);
      await audit?.record({
        action: AUDIT_ACTIONS.ELECTIVE_PERIOD_CLOSE,
        targetEntity: 'elective_period',
        targetId: view.id,
        details: {
          title: view.title,
          academicYear: view.term.academicYear,
          termNumber: view.term.termNumber,
          before: { status: ElectiveSelectionPeriodStatus.ACTIVE },
          after: { status: view.status },
        },
      });
      return view;
    }

    throw new BadRequestException('Недопустимий перехід стану періоду вибору');
  }

  async finalizePeriod(
    periodId: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<ElectivePeriodFinalizationView> {
    this.ensurePeriodManager(user);
    await this.closeExpiredPeriods();

    const periodObjectId = this.toObjectId(periodId);
    const finalizedAt = new Date();
    const finalizedBy = this.toObjectId(user.sub);
    const finalizationToken = randomUUID();
    const staleBefore = new Date(
      finalizedAt.getTime() - FINALIZATION_LOCK_TIMEOUT_MS,
    );

    const period = await this.periodModel
      .findOneAndUpdate(
        {
          _id: periodObjectId,
          status: ElectiveSelectionPeriodStatus.CLOSED,
          $or: [
            { finalizationStartedAt: null },
            { finalizationStartedAt: { $exists: false } },
            { finalizationStartedAt: { $lt: staleBefore } },
          ],
        },
        {
          $set: {
            finalizationStartedAt: finalizedAt,
            finalizationStartedBy: finalizedBy,
            finalizationToken,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!period) {
      const currentPeriod = await this.getPeriodOrThrow(periodId);
      if (currentPeriod.status === ElectiveSelectionPeriodStatus.FINALIZED) {
        const summary = await this.getFinalizationSummary(currentPeriod);
        await audit?.record({
          action: AUDIT_ACTIONS.ELECTIVE_PERIOD_FINALIZE,
          targetEntity: 'elective_period',
          targetId: summary.period.id,
          details: {
            title: summary.period.title,
            before: { status: ElectiveSelectionPeriodStatus.FINALIZED },
            after: { status: ElectiveSelectionPeriodStatus.FINALIZED },
            idempotentReplay: true,
            totalSelections: summary.totalSelections,
            courseAssignmentCount: summary.courseAssignments.length,
          },
        });
        return summary;
      }
      if (
        currentPeriod.status === ElectiveSelectionPeriodStatus.CLOSED &&
        currentPeriod.finalizationStartedAt
      ) {
        throw new ConflictException('Фіналізація періоду вже виконується');
      }
      throw new BadRequestException(
        'Фіналізувати можна лише закритий період вибору',
      );
    }

    try {
      const selections = await this.selectionModel
        .find({ period: period._id, status: ElectiveSelectionStatus.SELECTED })
        .populate({
          path: 'discipline',
          populate: [
            { path: 'department' },
            { path: 'teacher' },
            { path: 'term' },
          ],
        })
        .populate('student')
        .populate('group')
        .exec();

      const countByStudent = new Map<string, number>();
      for (const s of selections) {
        const key = this.idToString(s.student);
        countByStudent.set(key, (countByStudent.get(key) ?? 0) + 1);
      }
      const incompleteStudentIds = [...countByStudent.entries()]
        .filter(([, count]) => count < period.requiredChoices)
        .map(([id]) => this.toObjectId(id));
      if (incompleteStudentIds.length > 0) {
        await this.selectionModel
          .updateMany(
            {
              period: period._id,
              student: { $in: incompleteStudentIds },
              status: ElectiveSelectionStatus.SELECTED,
            },
            {
              $set: {
                status: ElectiveSelectionStatus.CANCELLED,
                cancelReason: 'incomplete_set',
                cancelledAt: finalizedAt,
              },
            },
          )
          .exec();

        const incompleteSelections = selections.filter((s) =>
          incompleteStudentIds.some((id) =>
            id.equals(this.toObjectId(this.idToString(s.student))),
          ),
        );
        for (const s of incompleteSelections) {
          const disciplineId = this.toObjectId(
            this.idToString((s.discipline as ElectiveDisciplineDocument)._id),
          );
          await this.disciplineModel
            .updateOne(
              { _id: disciplineId, enrolledCount: { $gt: 0 } },
              { $inc: { enrolledCount: -1 } },
            )
            .exec();
        }
      }
      const completeSelections = selections.filter(
        (s) =>
          !incompleteStudentIds.some((id) =>
            id.equals(this.toObjectId(this.idToString(s.student))),
          ),
      );

      const buckets = this.groupSelectionsForFinalization(completeSelections);
      await this.validateFinalizationBuckets(
        buckets,
        this.toObjectId(this.idToString(period.term)),
      );

      const courseAssignments: ElectivePeriodFinalizationView['courseAssignments'] =
        [];

      for (const bucket of buckets.values()) {
        const discipline = bucket.discipline;
        const teacherId = this.toObjectId(this.idToString(discipline.teacher));
        const departmentId = this.toObjectId(
          this.idToString(discipline.department),
        );
        const course = await this.courseModel
          .findOneAndUpdate(
            { code: discipline.code },
            {
              $setOnInsert: {
                name: discipline.title,
                code: discipline.code,
                department: departmentId,
                credits: discipline.credits,
                status: CourseStatus.ACTIVE,
                createdBy: finalizedBy,
              },
            },
            {
              returnDocument: 'after',
              runValidators: true,
              setDefaultsOnInsert: true,
              upsert: true,
            },
          )
          .exec();

        if (!course) {
          throw new NotFoundException('Не вдалося створити курс дисципліни');
        }
        if (course.status === CourseStatus.ARCHIVED) {
          // §7.4: no new assignment; the administrator does a restore and retries finalization
          throw new ConflictException({
            code: 'course_archived',
            courseCode: course.code,
            message: `Дисципліна ${course.code} архівована — відновіть її перед фіналізацією`,
          });
        }

        this.ensureCourseMatchesDiscipline(course, discipline);

        const assignment = await this.upsertFinalizedCourseAssignment({
          courseId: course._id,
          discipline,
          groupId: bucket.groupId,
          period,
          studentIds: bucket.studentIds,
          teacherId,
          finalizedAt,
        });

        await this.selectionModel
          .updateMany(
            { _id: { $in: bucket.selectionIds } },
            {
              $set: {
                status: ElectiveSelectionStatus.ENROLLED,
                courseAssignment: assignment._id,
                finalizedAt,
                finalizedBy,
              },
            },
          )
          .exec();

        courseAssignments.push({
          id: this.idToString(assignment._id),
          courseId: this.idToString(course._id),
          disciplineId: this.idToString(discipline._id),
          groupId: this.idToString(bucket.groupId),
          studentCount: bucket.studentIds.length,
        });
      }

      const finalizedPeriod = await this.periodModel
        .findOneAndUpdate(
          {
            _id: period._id,
            status: ElectiveSelectionPeriodStatus.CLOSED,
            finalizationToken,
          },
          {
            $set: {
              status: ElectiveSelectionPeriodStatus.FINALIZED,
              closedAt: period.closedAt ?? finalizedAt,
              finalizedAt,
              finalizedBy,
            },
            $unset: {
              finalizationStartedAt: '',
              finalizationStartedBy: '',
              finalizationToken: '',
            },
          },
          { returnDocument: 'after' },
        )
        .exec();

      if (!finalizedPeriod) {
        throw new ConflictException(
          'Не вдалося підтвердити право на фіналізацію періоду',
        );
      }

      await this.notifyPeriodFinalized(
        finalizedPeriod,
        completeSelections,
        incompleteStudentIds,
      );

      const result = {
        period: await this.findPeriodView(finalizedPeriod._id),
        totalSelections: completeSelections.length,
        courseAssignments,
      };
      await audit?.record({
        action: AUDIT_ACTIONS.ELECTIVE_PERIOD_FINALIZE,
        targetEntity: 'elective_period',
        targetId: result.period.id,
        details: {
          title: result.period.title,
          academicYear: result.period.term.academicYear,
          termNumber: result.period.term.termNumber,
          before: { status: ElectiveSelectionPeriodStatus.CLOSED },
          after: { status: result.period.status },
          totalSelections: result.totalSelections,
          courseAssignmentCount: result.courseAssignments.length,
        },
      });
      return result;
    } catch (error) {
      await this.releaseFinalizationLock(period._id, finalizationToken);
      throw error;
    }
  }

  async findActiveForStudent(
    user: AuthenticatedUser,
  ): Promise<ActiveElectivePeriodView[]> {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('Вибір дисциплін доступний лише студентам');
    }

    const term = await this.academicTerms.getCurrent();
    if (!term) {
      return [];
    }

    await this.closeExpiredPeriods();
    await this.remindDuePeriods(
      new Date(),
      Number(this.configService.get<string>('ELECTIVE_REMINDER_DAYS') ?? 3),
    );

    const profile = await this.usersService.getActiveStudentProfile(user.sub);
    if (!profile) {
      return [];
    }

    const groupObjectId = this.toObjectId(this.idToString(profile.group._id));
    const now = new Date();
    const periods = await this.periodModel
      .find({
        term: term._id,
        status: {
          $in: [
            ElectiveSelectionPeriodStatus.ACTIVE,
            ElectiveSelectionPeriodStatus.CLOSED,
            ElectiveSelectionPeriodStatus.FINALIZED,
          ],
        },
        targetGroups: groupObjectId,
      })
      .populate('targetGroups')
      .populate('term')
      .sort({ startsAt: 1 })
      .exec();

    if (periods.length === 0) {
      return [];
    }

    const [disciplines, selections] = await Promise.all([
      this.disciplineModel
        .find({
          status: {
            $in: [
              ElectiveDisciplineStatus.ACTIVE,
              ElectiveDisciplineStatus.CANCELLED,
            ],
          },
          term: term._id,
        })
        .populate('department')
        .populate('teacher')
        .populate('term')
        .sort({ title: 1 })
        .exec(),
      this.selectionModel
        .find({
          period: { $in: periods.map((period) => period._id) },
          student: this.toObjectId(user.sub),
        })
        .populate({
          path: 'discipline',
          populate: [
            { path: 'department' },
            { path: 'teacher' },
            { path: 'term' },
          ],
        })
        .populate('group')
        .sort({ selectedAt: 1 })
        .exec(),
    ]);

    const disciplineViews = disciplines.map((discipline) =>
      this.formatDiscipline(discipline),
    );

    const selectionsByPeriod = new Map<string, ElectiveSelectionDocument[]>();
    for (const selection of selections) {
      const periodId = this.idToString(selection.period);
      selectionsByPeriod.set(periodId, [
        ...(selectionsByPeriod.get(periodId) ?? []),
        selection,
      ]);
    }

    return periods.map((period) => {
      const periodSelections =
        selectionsByPeriod.get(this.idToString(period._id)) ?? [];
      const selectedCount = periodSelections.filter((selection) =>
        (
          ACTIVE_SELECTION_STATUSES as readonly ElectiveSelectionStatus[]
        ).includes(selection.status),
      ).length;

      return {
        period: this.formatPeriod(period),
        phase: computeElectivePhase(period, now),
        disciplines: disciplineViews,
        selections: periodSelections.map((selection) =>
          this.formatSelection(selection),
        ),
        selectedCount,
        remainingChoices: Math.max(0, period.requiredChoices - selectedCount),
      };
    });
  }

  async findMySelections(
    user: AuthenticatedUser,
  ): Promise<ElectiveSelectionView[]> {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('Вибір дисциплін доступний лише студентам');
    }

    const selections = await this.selectionModel
      .find({ student: this.toObjectId(user.sub) })
      .populate({
        path: 'discipline',
        populate: [
          { path: 'department' },
          { path: 'teacher' },
          { path: 'term' },
        ],
      })
      .populate('group')
      .sort({ selectedAt: -1 })
      .exec();

    return selections.map((selection) => this.formatSelection(selection));
  }

  async selectDiscipline(
    periodId: string,
    dto: SelectElectiveDto,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<ElectiveSelectionView> {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('Вибір дисциплін доступний лише студентам');
    }

    await this.closeExpiredPeriods();

    const [period, profile] = await Promise.all([
      this.getPeriodOrThrow(periodId),
      this.usersService.findOne(user.sub),
    ]);
    this.ensurePeriodIsOpen(period);

    const groupId = pickActiveStudentProfile(profile)?.group?.id;
    if (!groupId) {
      throw new BadRequestException('У профілі студента не вказана група');
    }
    if (!this.periodTargetsGroup(period, groupId)) {
      throw new ForbiddenException('Період вибору недоступний для вашої групи');
    }

    const studentId = this.toObjectId(user.sub);
    const disciplineId = this.toObjectId(dto.disciplineId);
    const groupObjectId = this.toObjectId(groupId);

    const [existingSelections, discipline] = await Promise.all([
      this.selectionModel
        .find({
          period: period._id,
          student: studentId,
          status: { $in: ACTIVE_SELECTION_STATUSES },
        })
        .select('discipline choiceSlot')
        .lean<ExistingSelectionQuota[]>()
        .exec(),
      this.disciplineModel.findById(disciplineId).exec(),
    ]);

    if (!discipline) {
      throw new NotFoundException('Вибіркова дисципліна не знайдена');
    }
    if (discipline.status !== ElectiveDisciplineStatus.ACTIVE) {
      throw new BadRequestException('Дисципліна недоступна для вибору');
    }
    if (this.idToString(discipline.term) !== this.idToString(period.term)) {
      throw new BadRequestException(
        'Дисципліна не належить до навчального періоду цього періоду вибору',
      );
    }
    if (
      existingSelections.some(
        (selection) =>
          this.idToString(selection.discipline) === disciplineId.toHexString(),
      )
    ) {
      throw new ConflictException('Цю дисципліну вже обрано');
    }
    if (existingSelections.length >= period.requiredChoices) {
      throw new ConflictException(
        'Ліміт вибору дисциплін для періоду вичерпано',
      );
    }

    const reserved = await this.disciplineModel
      .findOneAndUpdate(
        {
          _id: disciplineId,
          status: ElectiveDisciplineStatus.ACTIVE,
          term: period.term,
          $expr: { $lt: ['$enrolledCount', '$capacity'] },
        },
        { $inc: { enrolledCount: 1 } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!reserved) {
      throw new ConflictException('Вільних місць на дисципліні вже немає');
    }

    let selection: ElectiveSelectionDocument;
    try {
      selection = await this.createSelectionInAvailableSlot({
        period,
        disciplineId,
        studentId,
        groupId: groupObjectId,
        existingSelections,
      });
    } catch (error) {
      await this.disciplineModel
        .updateOne(
          { _id: disciplineId, enrolledCount: { $gt: 0 } },
          { $inc: { enrolledCount: -1 } },
        )
        .exec();

      throw error;
    }

    const populated = await this.selectionModel
      .findById(selection._id)
      .populate({
        path: 'discipline',
        populate: [
          { path: 'department' },
          { path: 'teacher' },
          { path: 'term' },
        ],
      })
      .populate('group')
      .exec();

    if (!populated) {
      throw new NotFoundException('Вибір не знайдено після створення');
    }

    const view = this.formatSelection(populated);
    await audit?.record({
      action: AUDIT_ACTIONS.ELECTIVE_SELECTION_SELECT,
      targetEntity: 'elective_selection',
      targetId: view.id,
      details: {
        periodId: view.periodId,
        periodTitle: period.title,
        disciplineId: view.discipline.id,
        disciplineCode: view.discipline.code,
        disciplineTitle: view.discipline.title,
        groupId: view.group.id,
        choiceSlot: selection.choiceSlot,
      },
    });
    return view;
  }

  async cancelSelection(
    periodId: string,
    selectionId: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<{ success: true }> {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('Вибір дисциплін доступний лише студентам');
    }

    const period = await this.getPeriodOrThrow(periodId);
    this.ensurePeriodIsOpen(period);

    const selection = await this.selectionModel
      .findOneAndUpdate(
        {
          _id: this.toObjectId(selectionId),
          period: period._id,
          student: this.toObjectId(user.sub),
          status: ElectiveSelectionStatus.SELECTED,
        },
        {
          $set: {
            status: ElectiveSelectionStatus.CANCELLED,
            cancelReason: 'student',
            cancelledAt: new Date(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!selection) {
      throw new NotFoundException('Вибір дисципліни не знайдено');
    }

    const disciplineId = this.toObjectId(this.idToString(selection.discipline));
    await this.disciplineModel
      .updateOne(
        { _id: disciplineId, enrolledCount: { $gt: 0 } },
        { $inc: { enrolledCount: -1 } },
      )
      .exec();

    await audit?.record({
      action: AUDIT_ACTIONS.ELECTIVE_SELECTION_CANCEL,
      targetEntity: 'elective_selection',
      targetId: selectionId,
      details: {
        periodId,
        periodTitle: period.title,
        disciplineId: this.idToString(selection.discipline),
        groupId: this.idToString(selection.group),
        choiceSlot: selection.choiceSlot,
      },
    });

    return { success: true };
  }

  async getPeriodResults(
    periodId: string,
    user: AuthenticatedUser,
  ): Promise<ElectivePeriodResultsView> {
    this.ensurePeriodManager(user);
    await this.closeExpiredPeriods();

    const period = await this.getPeriodOrThrow(periodId);
    this.ensurePeriodResultsAvailable(period);
    const selections = await this.selectionModel
      .find({ period: period._id })
      .populate({
        path: 'discipline',
        populate: [
          { path: 'department' },
          { path: 'teacher' },
          { path: 'term' },
        ],
      })
      .populate('student')
      .populate('group')
      .sort({ selectedAt: 1 })
      .exec();

    type ResultBucket = {
      discipline: ElectiveDisciplineView;
      selectedCount: number;
      capacity: number;
      groups: Map<string, { group: ReferenceView; selectedCount: number }>;
      students: Array<{
        id: string;
        login?: string;
        fullName: string;
        group: ReferenceView;
        selectedAt: string;
      }>;
    };
    const grouped = new Map<string, ResultBucket>();
    const cancelledByDiscipline = new Map<
      string,
      { discipline: ElectiveDisciplineView; cancelledCount: number }
    >();
    const activeSelections: ElectiveSelectionDocument[] = [];

    for (const selection of selections) {
      const discipline = this.formatDiscipline(
        selection.discipline as ElectiveDisciplineDocument,
      );

      if (selection.status === ElectiveSelectionStatus.CANCELLED) {
        const cancelledBucket = cancelledByDiscipline.get(discipline.id) ?? {
          discipline,
          cancelledCount: 0,
        };
        cancelledBucket.cancelledCount += 1;
        cancelledByDiscipline.set(discipline.id, cancelledBucket);
        continue;
      }

      activeSelections.push(selection);
      let disciplineBucket = grouped.get(discipline.id);
      if (!disciplineBucket) {
        disciplineBucket = {
          discipline,
          selectedCount: 0,
          capacity: discipline.capacity,
          groups: new Map(),
          students: [],
        };
        grouped.set(discipline.id, disciplineBucket);
      }

      const group = this.referenceView(selection.group, 'code');
      const groupBucket = disciplineBucket.groups.get(group.id) ?? {
        group,
        selectedCount: 0,
      };
      groupBucket.selectedCount += 1;
      disciplineBucket.groups.set(group.id, groupBucket);
      disciplineBucket.selectedCount += 1;
      disciplineBucket.students.push({
        ...this.studentView(selection.student),
        group,
        selectedAt: selection.selectedAt.toISOString(),
      });
    }

    const uniqueStudentIds = new Set(
      activeSelections.map((selection) => this.idToString(selection.student)),
    );
    const targetStudentCount = await this.userModel
      .countDocuments({
        role: Role.STUDENT,
        status: 'active',
        ...activeStudentsInGroups(
          period.targetGroups.map((group) =>
            this.toObjectId(this.idToString(group)),
          ),
        ),
      })
      .exec();
    const expectedSelections = targetStudentCount * period.requiredChoices;

    return {
      period: await this.findPeriodView(period._id),
      totalSelections: activeSelections.length,
      totalStudents: uniqueStudentIds.size,
      expectedSelections,
      completionRate:
        expectedSelections === 0
          ? 0
          : Math.min(100, (activeSelections.length / expectedSelections) * 100),
      disciplines: [...grouped.values()].map((item) => ({
        discipline: item.discipline,
        selectedCount: item.selectedCount,
        capacity: item.capacity,
        groups: [...item.groups.values()],
        students: item.students,
      })),
      cancelledByDiscipline: [...cancelledByDiscipline.values()],
    };
  }

  async exportPeriodResults(
    periodId: string,
    user: AuthenticatedUser,
    format: SpreadsheetExportFormat,
  ): Promise<SpreadsheetExportArtifact> {
    const results = await this.getPeriodResults(periodId, user);
    const exportResults: ElectiveExportResults = {
      ...results,
      period: {
        title: results.period.title,
        academicYear: results.period.term.academicYear ?? '',
        termNumber: results.period.term.termNumber ?? 0,
        startsAt: results.period.startsAt,
        endsAt: results.period.endsAt,
        status: results.period.status,
        requiredChoices: results.period.requiredChoices,
        targetGroups: results.period.targetGroups,
      },
    };
    return buildSpreadsheetExportArtifact({
      filename: `elective-period-${periodId}-results`,
      format,
      buildCsv: () => buildElectiveResultsCsv(exportResults),
      buildXlsx: () => buildElectiveResultsXlsx(exportResults),
    });
  }

  private async createSelectionInAvailableSlot(params: {
    period: ElectiveSelectionPeriodDocument;
    disciplineId: Types.ObjectId;
    studentId: Types.ObjectId;
    groupId: Types.ObjectId;
    existingSelections: ExistingSelectionQuota[];
  }): Promise<ElectiveSelectionDocument> {
    const occupiedSlots = this.getOccupiedChoiceSlots(
      params.existingSelections,
      params.period.requiredChoices,
    );

    for (
      let choiceSlot = 0;
      choiceSlot < params.period.requiredChoices;
      choiceSlot += 1
    ) {
      if (occupiedSlots.has(choiceSlot)) {
        continue;
      }

      try {
        return await this.selectionModel.create({
          period: params.period._id,
          discipline: params.disciplineId,
          student: params.studentId,
          group: params.groupId,
          choiceSlot,
          selectedAt: new Date(),
        });
      } catch (error) {
        if (!this.isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    const duplicate = await this.selectionModel
      .findOne({
        period: params.period._id,
        student: params.studentId,
        discipline: params.disciplineId,
        status: { $in: ACTIVE_SELECTION_STATUSES },
      })
      .select('_id')
      .lean()
      .exec();

    if (duplicate) {
      throw new ConflictException('Цю дисципліну вже обрано');
    }

    throw new ConflictException('Ліміт вибору дисциплін для періоду вичерпано');
  }

  private getOccupiedChoiceSlots(
    selections: ExistingSelectionQuota[],
    requiredChoices: number,
  ): Set<number> {
    const occupied = new Set(
      selections
        .map((selection) => selection.choiceSlot)
        .filter(
          (slot): slot is number =>
            typeof slot === 'number' &&
            Number.isInteger(slot) &&
            slot >= 0 &&
            slot < requiredChoices,
        ),
    );
    const legacySelections = selections.filter(
      (selection) => !Number.isInteger(selection.choiceSlot),
    ).length;

    for (
      let slot = 0, assigned = 0;
      slot < requiredChoices && assigned < legacySelections;
      slot += 1
    ) {
      if (!occupied.has(slot)) {
        occupied.add(slot);
        assigned += 1;
      }
    }

    return occupied;
  }

  private ensureDisciplineManager(user: AuthenticatedUser): void {
    if (!DISCIPLINE_MANAGER_ROLES.has(user.role)) {
      throw new ForbiddenException('Немає прав для керування дисциплінами');
    }
  }

  private ensurePeriodManager(user: AuthenticatedUser): void {
    if (!PERIOD_MANAGER_ROLES.has(user.role)) {
      throw new ForbiddenException('Немає прав для керування періодами вибору');
    }
  }

  private async ensureCanManageDepartment(
    user: AuthenticatedUser,
    departmentId: Types.ObjectId,
  ): Promise<void> {
    if (user.role !== Role.DEPARTMENT_HEAD) {
      return;
    }

    const managerDepartmentId = await this.getManagerDepartmentId(user);
    if (!managerDepartmentId.equals(departmentId)) {
      throw new ForbiddenException('Немає доступу до цієї кафедри');
    }
  }

  private async getManagerDepartmentId(
    user: AuthenticatedUser,
  ): Promise<Types.ObjectId> {
    const profile = await this.usersService.findOne(user.sub);
    const department = profile.teacherProfile?.department;
    if (!department) {
      throw new ForbiddenException('У профілі керівника не вказана кафедра');
    }
    return this.toObjectId(department);
  }

  private async assertDepartmentExists(id: Types.ObjectId): Promise<void> {
    const exists = await this.departmentModel.exists({ _id: id });
    if (!exists) {
      throw new NotFoundException('Кафедру не знайдено');
    }
  }

  private async assertGroupsExist(ids: Types.ObjectId[]): Promise<void> {
    const count = await this.groupModel
      .countDocuments({ _id: { $in: ids } })
      .exec();
    if (count !== ids.length) {
      throw new NotFoundException('Одна або кілька груп не знайдені');
    }
  }

  private async normalizeTeacherId(
    teacherId?: string,
    departmentId?: Types.ObjectId,
  ): Promise<Types.ObjectId | null> {
    if (!teacherId) return null;

    const filter: Record<string, unknown> = {
      _id: this.toObjectId(teacherId),
      role: {
        $in: [Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN],
      },
      status: 'active',
    };
    if (departmentId) {
      filter['teacherProfile.department'] = departmentId;
    }

    const teacher = await this.userModel
      .findOne(filter)
      .select('_id')
      .lean()
      .exec();

    if (!teacher) {
      throw new NotFoundException(
        departmentId
          ? 'Активного викладача цієї кафедри не знайдено'
          : 'Активного викладача не знайдено',
      );
    }

    return this.toObjectId(teacherId);
  }

  private async getDisciplineOrThrow(
    id: string,
  ): Promise<ElectiveDisciplineDocument> {
    const discipline = await this.disciplineModel
      .findById(this.toObjectId(id))
      .exec();
    if (!discipline) {
      throw new NotFoundException('Вибіркова дисципліна не знайдена');
    }
    return discipline;
  }

  private async getPeriodOrThrow(
    id: string,
  ): Promise<ElectiveSelectionPeriodDocument> {
    const period = await this.periodModel.findById(this.toObjectId(id)).exec();
    if (!period) {
      throw new NotFoundException('Період вибору не знайдено');
    }
    return period;
  }

  private async findDisciplineView(
    id: Types.ObjectId,
  ): Promise<ElectiveDisciplineView> {
    const discipline = await this.disciplineModel
      .findById(id)
      .populate('department')
      .populate('teacher')
      .populate('term')
      .exec();

    if (!discipline) {
      throw new NotFoundException('Вибіркова дисципліна не знайдена');
    }

    return this.formatDiscipline(discipline);
  }

  private async findPeriodView(
    id: Types.ObjectId,
  ): Promise<ElectivePeriodView> {
    const period = await this.periodModel
      .findById(id)
      .populate('targetGroups')
      .populate('term')
      .exec();

    if (!period) {
      throw new NotFoundException('Період вибору не знайдено');
    }

    return this.formatPeriod(period);
  }

  private ensureDraftPeriod(period: ElectiveSelectionPeriodDocument): void {
    if (period.status !== ElectiveSelectionPeriodStatus.DRAFT) {
      throw new BadRequestException('Редагувати можна лише чернетку періоду');
    }
  }

  private ensurePeriodIsOpen(period: ElectiveSelectionPeriodDocument): void {
    const now = new Date();
    if (period.status !== ElectiveSelectionPeriodStatus.ACTIVE) {
      throw new BadRequestException('Період вибору неактивний');
    }
    if (period.startsAt > now) {
      throw new BadRequestException('Період вибору ще не розпочався');
    }
    if (period.endsAt < now) {
      throw new BadRequestException('Період вибору вже завершений');
    }
  }

  private ensurePeriodResultsAvailable(
    period: ElectiveSelectionPeriodDocument,
  ): void {
    if (
      period.status !== ElectiveSelectionPeriodStatus.CLOSED &&
      period.status !== ElectiveSelectionPeriodStatus.FINALIZED
    ) {
      throw new BadRequestException(
        'Результати та експорт доступні лише після закриття періоду',
      );
    }
  }

  private periodTargetsGroup(
    period: ElectiveSelectionPeriodDocument,
    groupId: string,
  ): boolean {
    return period.targetGroups.some(
      (group) => this.idToString(group) === groupId,
    );
  }

  private async closeExpiredPeriods(now = new Date()): Promise<void> {
    const result = await this.periodModel
      .updateMany(
        {
          status: ElectiveSelectionPeriodStatus.ACTIVE,
          endsAt: { $lt: now },
        },
        {
          $set: {
            status: ElectiveSelectionPeriodStatus.CLOSED,
            closedAt: now,
          },
        },
      )
      .exec();

    if (result.modifiedCount > 0) {
      await this.auditLogService?.logAction({
        userId: null,
        userLogin: 'system',
        action: AUDIT_ACTIONS.ELECTIVE_PERIOD_CLOSE,
        targetEntity: 'elective_period',
        details: {
          automated: true,
          closedCount: result.modifiedCount,
          before: { status: ElectiveSelectionPeriodStatus.ACTIVE },
          after: { status: ElectiveSelectionPeriodStatus.CLOSED },
          cutoff: now,
        },
        ipAddress: 'internal',
        userAgent: 'elective-lifecycle',
        result: 'success',
      });
    }
  }

  /**
   * Lazy reminder about the approaching discipline-selection deadline (spec
   * §7.1/§9.1). There's no scheduler (Р8) — the method runs at the start of
   * period list reads (findActiveForStudent, listPeriods).
   * Idempotency — a conditional findOneAndUpdate on a single document.
   */
  async remindDuePeriods(now = new Date(), days: number): Promise<number> {
    const deadline = new Date(now.getTime() + days * 24 * 3_600_000);
    let reminded = 0;
    for (;;) {
      const period = await this.periodModel
        .findOneAndUpdate(
          {
            status: ElectiveSelectionPeriodStatus.ACTIVE,
            startsAt: { $lte: now },
            endsAt: { $gt: now, $lte: deadline },
            $or: [
              { reminderSentAt: null },
              { reminderSentAt: { $exists: false } },
            ],
          },
          { $set: { reminderSentAt: now } },
          { returnDocument: 'after' },
        )
        .exec();
      if (!period) {
        return reminded;
      }
      reminded += 1;

      const groupIds = period.targetGroups.map((group) =>
        this.toObjectId(this.idToString(group)),
      );
      const students = await this.userModel
        // contract of plan 01 (`users/student-profile.filters.ts`)
        .find({
          role: Role.STUDENT,
          status: 'active',
          ...activeStudentsInGroups(groupIds),
        })
        .select('_id')
        .lean<Array<{ _id: Types.ObjectId }>>()
        .exec();
      const counts = await this.selectionModel
        .aggregate<{ _id: Types.ObjectId; count: number }>([
          {
            $match: {
              period: period._id,
              status: { $in: [...ACTIVE_SELECTION_STATUSES] },
            },
          },
          { $group: { _id: '$student', count: { $sum: 1 } } },
        ])
        .exec();
      const countByStudent = new Map(
        counts.map((count) => [this.idToString(count._id), count.count]),
      );
      const pending = students.filter(
        (student) =>
          (countByStudent.get(this.idToString(student._id)) ?? 0) <
          period.requiredChoices,
      );
      if (pending.length === 0) {
        continue;
      }
      // A reminder notification must not break the read: log and
      // continue (as in notifyPeriodPublished/notifyPeriodFinalized).
      try {
        await this.notificationsService.createMany(
          pending.map((student) => ({
            title: 'Завершується вибір дисциплін',
            message: `Період «${period.title}» триває до ${period.endsAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}. Оберіть ${period.requiredChoices} дисципліни.`,
            type: NotificationType.ELECTIVE,
            targetType: 'all' as const,
            userId: this.idToString(student._id),
            actionUrl: '/electives',
            entityType: 'elective',
            entityId: this.idToString(period._id),
            important: true,
          })),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unknown error';
        this.logger.warn(
          `Elective reminder was not sent for period ${this.idToString(period._id)}: ${message}`,
        );
      }
    }
  }

  private async notifyPeriodPublished(
    period: ElectiveSelectionPeriodDocument,
  ): Promise<void> {
    try {
      const periodId = this.idToString(period._id);
      await this.notificationsService.createMany(
        period.targetGroups.map((group) => ({
          title: 'Відкрито вибір дисциплін',
          message: period.title,
          type: NotificationType.ELECTIVE,
          targetType: 'group',
          groupId: this.idToString(group),
          actionUrl: '/electives',
          entityType: 'elective',
          entityId: periodId,
          important: true,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Elective period notification skipped: ${message}`);
    }
  }

  private groupSelectionsForFinalization(
    selections: ElectiveSelectionDocument[],
  ): Map<string, FinalizationBucket> {
    const buckets = new Map<string, FinalizationBucket>();

    for (const selection of selections) {
      const discipline = selection.discipline as ElectiveDisciplineDocument;
      const disciplineId = this.idToString(discipline?._id);
      const groupId = this.idToString(selection.group);
      const studentId = this.idToString(selection.student);

      if (
        !Types.ObjectId.isValid(disciplineId) ||
        !Types.ObjectId.isValid(groupId) ||
        !Types.ObjectId.isValid(studentId)
      ) {
        throw new BadRequestException(
          'Дані вибору містять некоректні посилання',
        );
      }

      const key = `${disciplineId}:${groupId}`;
      const bucket = buckets.get(key) ?? {
        discipline,
        groupId: this.toObjectId(groupId),
        studentIds: [],
        selectionIds: [],
      };

      if (!bucket.studentIds.some((id) => id.toHexString() === studentId)) {
        bucket.studentIds.push(this.toObjectId(studentId));
      }
      bucket.selectionIds.push(this.toObjectId(this.idToString(selection._id)));
      buckets.set(key, bucket);
    }

    return buckets;
  }

  private async validateFinalizationBuckets(
    buckets: Map<string, FinalizationBucket>,
    periodTermId: Types.ObjectId,
  ): Promise<void> {
    if (buckets.size === 0) {
      return;
    }

    // Defensive re-check: selectDiscipline() already rejects a discipline
    // whose term differs from the period's term, so this should never
    // trigger in practice. Kept here in case a discipline's term changes
    // (or data drifts) between selection and finalization.
    for (const bucket of buckets.values()) {
      if (
        this.idToString(bucket.discipline.term) !==
        this.idToString(periodTermId)
      ) {
        throw new BadRequestException(
          `Дисципліна ${bucket.discipline.code} не належить до навчального періоду цього періоду вибору`,
        );
      }
    }

    const teacherIds = [
      ...new Set(
        [...buckets.values()].map((bucket) => {
          const teacherId = this.idToString(bucket.discipline.teacher);
          if (!Types.ObjectId.isValid(teacherId)) {
            throw new BadRequestException(
              `Для дисципліни ${bucket.discipline.code} потрібно призначити викладача перед фіналізацією`,
            );
          }
          return teacherId;
        }),
      ),
    ];
    const teachers = await this.userModel
      .find({
        _id: { $in: teacherIds.map((id) => this.toObjectId(id)) },
        role: {
          $in: [Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN],
        },
        status: 'active',
      })
      .select('_id teacherProfile.department')
      .lean<
        Array<{
          _id: Types.ObjectId;
          teacherProfile?: { department?: unknown };
        }>
      >()
      .exec();
    const teachersById = new Map(
      teachers.map((teacher) => [this.idToString(teacher._id), teacher]),
    );

    for (const bucket of buckets.values()) {
      const teacherId = this.idToString(bucket.discipline.teacher);
      const departmentId = this.idToString(bucket.discipline.department);
      const teacher = teachersById.get(teacherId);
      if (
        !teacher ||
        this.idToString(teacher.teacherProfile?.department) !== departmentId
      ) {
        throw new BadRequestException(
          `Для дисципліни ${bucket.discipline.code} потрібно призначити активного викладача цієї кафедри`,
        );
      }
    }
  }

  private ensureCourseMatchesDiscipline(
    course: CourseDocument,
    discipline: ElectiveDisciplineDocument,
  ): void {
    // Course no longer carries a semester/term of its own (Task 6) — a Course
    // is a catalog entry shared across terms; the term now lives on
    // CourseAssignment (and, for electives, on ElectiveDiscipline/Period).
    // That term-level match is validated separately in
    // validateFinalizationBuckets(); this check only guards against reusing
    // an elective's code for an unrelated existing course.
    const matches =
      this.idToString(course.department) ===
        this.idToString(discipline.department) &&
      course.credits === discipline.credits;

    if (!matches) {
      throw new ConflictException(
        `Код ${discipline.code} вже використовується іншим навчальним курсом`,
      );
    }
  }

  private async releaseFinalizationLock(
    periodId: Types.ObjectId,
    finalizationToken: string,
  ): Promise<void> {
    await this.periodModel
      .updateOne(
        {
          _id: periodId,
          status: ElectiveSelectionPeriodStatus.CLOSED,
          finalizationToken,
        },
        {
          $unset: {
            finalizationStartedAt: '',
            finalizationStartedBy: '',
            finalizationToken: '',
          },
        },
      )
      .exec();
  }

  private async upsertFinalizedCourseAssignment(params: {
    courseId: Types.ObjectId;
    discipline: ElectiveDisciplineDocument;
    groupId: Types.ObjectId;
    period: ElectiveSelectionPeriodDocument;
    studentIds: Types.ObjectId[];
    teacherId: Types.ObjectId;
    finalizedAt: Date;
  }): Promise<CourseAssignmentDocument> {
    const termId = this.toObjectId(this.idToString(params.period.term));
    const filter = {
      course: params.courseId,
      group: params.groupId,
      term: termId,
    };
    const periodId = this.idToString(params.period._id);
    const disciplineId = this.idToString(params.discipline._id);
    const existing = await this.courseAssignmentModel
      .findOne(filter as never)
      .exec();

    if (existing) {
      const source = existing.source ?? CourseAssignmentSource.STANDARD;
      const existingPeriodId = this.idToString(existing.electivePeriod);
      const existingDisciplineId = this.idToString(existing.electiveDiscipline);

      if (
        source !== CourseAssignmentSource.ELECTIVE ||
        existingPeriodId !== periodId ||
        existingDisciplineId !== disciplineId
      ) {
        throw new ConflictException(
          `Курс ${params.discipline.code} вже призначений цій групі на цей навчальний період`,
        );
      }
    }

    const update = {
      $set: {
        teacher: params.teacherId,
        source: CourseAssignmentSource.ELECTIVE,
        electivePeriod: params.period._id,
        electiveDiscipline: params.discipline._id,
        finalizedAt: params.finalizedAt,
      },
      $setOnInsert: {
        course: params.courseId,
        group: params.groupId,
        term: termId,
      },
      $addToSet: {
        enrolledStudents: { $each: params.studentIds },
      },
    };

    const assignment = await this.courseAssignmentModel
      .findOneAndUpdate(filter as never, update as never, {
        returnDocument: 'after',
        runValidators: true,
        setDefaultsOnInsert: true,
        upsert: true,
      })
      .exec();

    if (!assignment) {
      throw new NotFoundException('Не вдалося створити призначення курсу');
    }

    return assignment;
  }

  private async getFinalizationSummary(
    period: ElectiveSelectionPeriodDocument,
  ): Promise<ElectivePeriodFinalizationView> {
    const [totalSelections, assignments] = await Promise.all([
      this.selectionModel
        .countDocuments({
          period: period._id,
          status: { $in: ACTIVE_SELECTION_STATUSES },
        })
        .exec(),
      this.courseAssignmentModel
        .find({
          source: CourseAssignmentSource.ELECTIVE,
          electivePeriod: period._id,
        } as never)
        .lean()
        .exec(),
    ]);

    return {
      period: await this.findPeriodView(period._id),
      totalSelections,
      courseAssignments: assignments.map((assignment) => ({
        id: this.idToString(assignment._id),
        courseId: this.idToString(assignment.course),
        disciplineId: this.idToString(assignment.electiveDiscipline),
        groupId: this.idToString(assignment.group),
        studentCount: Array.isArray(assignment.enrolledStudents)
          ? assignment.enrolledStudents.length
          : 0,
      })),
    };
  }

  private async notifyPeriodFinalized(
    period: ElectiveSelectionPeriodDocument,
    selections: ElectiveSelectionDocument[],
    incompleteStudentIds: Types.ObjectId[] = [],
  ): Promise<void> {
    try {
      const periodId = this.idToString(period._id);
      const studentIds = [
        ...new Set(
          selections
            .map((selection) => this.idToString(selection.student))
            .filter((id) => Types.ObjectId.isValid(id)),
        ),
      ];
      const incompleteIds = [
        ...new Set(incompleteStudentIds.map((id) => this.idToString(id))),
      ];

      await this.notificationsService.createMany([
        ...studentIds.map((studentId) => ({
          title: 'Вибір дисциплін зафіксовано',
          message: `Ваш вибір у періоді "${period.title}" зафіксовано. Дисципліни додано до розділу "Мої дисципліни".`,
          type: NotificationType.ELECTIVE,
          targetType: 'all' as const,
          userId: studentId,
          actionUrl: '/courses',
          entityType: 'elective',
          entityId: periodId,
          important: true,
        })),
        ...incompleteIds.map((studentId) => ({
          title: 'Вибір не зараховано',
          message: `У періоді "${period.title}" обрано менше дисциплін, ніж потрібно. Зверніться до деканату.`,
          type: NotificationType.ELECTIVE,
          targetType: 'all' as const,
          userId: studentId,
          actionUrl: '/electives',
          entityType: 'elective',
          entityId: periodId,
          important: true,
        })),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Elective finalization notification skipped: ${message}`,
      );
    }
  }

  private normalizePeriodDates(
    startsAt: string,
    endsAt: string,
  ): { startsAt: Date; endsAt: Date } {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    if (Number.isNaN(start.getTime())) {
      throw new BadRequestException('Некоректна дата початку');
    }
    if (Number.isNaN(end.getTime())) {
      throw new BadRequestException('Некоректна дата завершення');
    }
    if (end <= start) {
      throw new BadRequestException(
        'Дата завершення повинна бути пізніше дати початку',
      );
    }
    return { startsAt: start, endsAt: end };
  }

  private normalizeObjectIds(values: string[]): Types.ObjectId[] {
    return [...new Set(values.map((value) => value.trim()))]
      .filter(Boolean)
      .map((value) => this.toObjectId(value));
  }

  private normalizeCode(value: string): string {
    const code = this.trimRequired(value, 'Код дисципліни обовʼязковий')
      .toUpperCase()
      .replace(/\s+/g, '-');

    if (!/^[A-Z0-9_-]{2,24}$/.test(code)) {
      throw new BadRequestException(
        'Код дисципліни може містити лише латинські літери, цифри, _ або -',
      );
    }

    return code;
  }

  private trimRequired(value: string, message: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private trimOptional(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некоректний ID');
    }
    return new Types.ObjectId(id);
  }

  private idToString(value: unknown): string {
    if (value instanceof Types.ObjectId) {
      return value.toHexString();
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && '_id' in value) {
      return this.idToString((value as { _id?: unknown })._id);
    }
    return '';
  }

  private referenceView(
    value: unknown,
    labelKey: 'code' | 'name',
  ): ReferenceView {
    const id = this.idToString(value);
    const view: ReferenceView = { id };

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const label = record[labelKey];
      if (typeof label === 'string' && label.trim()) {
        view[labelKey] = label;
      }
      if (typeof record.name === 'string' && record.name.trim()) {
        view.name = record.name;
      }
      if (typeof record.code === 'string' && record.code.trim()) {
        view.code = record.code;
      }
    }

    return view;
  }

  private termView(value: unknown): TermView {
    if (value && typeof value === 'object' && 'academicYear' in value) {
      const t = value as {
        _id: unknown;
        academicYear: string;
        termNumber: 1 | 2;
      };
      return {
        id: this.idToString(t._id),
        academicYear: t.academicYear,
        termNumber: t.termNumber,
      };
    }
    return { id: this.idToString(value) };
  }

  private teacherView(value: unknown): ReferenceView | null {
    if (!value) return null;
    const id = this.idToString(value);
    if (!id) return null;

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const firstName =
        typeof record.firstName === 'string' ? record.firstName : '';
      const lastName =
        typeof record.lastName === 'string' ? record.lastName : '';
      const middleName =
        typeof record.middleName === 'string' ? record.middleName : '';
      const fullName = [lastName, firstName, middleName]
        .map((item) => item.trim())
        .filter(Boolean)
        .join(' ');
      return { id, ...(fullName ? { name: fullName } : {}) };
    }

    return { id };
  }

  private studentView(value: unknown): {
    id: string;
    login?: string;
    fullName: string;
  } {
    const id = this.idToString(value);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const firstName =
        typeof record.firstName === 'string' ? record.firstName : '';
      const lastName =
        typeof record.lastName === 'string' ? record.lastName : '';
      const middleName =
        typeof record.middleName === 'string' ? record.middleName : '';
      const fullName =
        [lastName, firstName, middleName]
          .map((item) => item.trim())
          .filter(Boolean)
          .join(' ') || id;
      const login = typeof record.login === 'string' ? record.login : undefined;
      return { id, fullName, ...(login ? { login } : {}) };
    }
    return { id, fullName: id };
  }

  private formatDiscipline(
    discipline: ElectiveDisciplineDocument,
  ): ElectiveDisciplineView {
    const description = this.trimOptional(discipline.description);
    const availableSeats = Math.max(
      0,
      discipline.capacity - discipline.enrolledCount,
    );

    return {
      id: this.idToString(discipline._id),
      code: discipline.code,
      title: discipline.title,
      ...(description ? { description } : {}),
      department: this.referenceView(discipline.department, 'name'),
      teacher: this.teacherView(discipline.teacher),
      term: this.termView(discipline.term),
      credits: discipline.credits,
      capacity: discipline.capacity,
      enrolledCount: discipline.enrolledCount,
      availableSeats,
      status: discipline.status,
      createdBy: this.idToString(discipline.createdBy),
      ...(discipline.createdAt
        ? { createdAt: discipline.createdAt.toISOString() }
        : {}),
      ...(discipline.updatedAt
        ? { updatedAt: discipline.updatedAt.toISOString() }
        : {}),
      ...(discipline.cancelReason
        ? { cancelReason: discipline.cancelReason }
        : {}),
      ...(discipline.cancelledAt
        ? { cancelledAt: discipline.cancelledAt.toISOString() }
        : {}),
    };
  }

  private formatPeriod(
    period: ElectiveSelectionPeriodDocument,
  ): ElectivePeriodView {
    return {
      id: this.idToString(period._id),
      title: period.title,
      term: this.termView(period.term),
      startsAt: period.startsAt.toISOString(),
      endsAt: period.endsAt.toISOString(),
      status: period.status,
      targetGroups: period.targetGroups.map((group) =>
        this.referenceView(group, 'code'),
      ),
      requiredChoices: period.requiredChoices,
      createdBy: this.idToString(period.createdBy),
      ...(period.publishedAt
        ? { publishedAt: period.publishedAt.toISOString() }
        : {}),
      ...(period.closedAt ? { closedAt: period.closedAt.toISOString() } : {}),
      ...(period.finalizedAt
        ? { finalizedAt: period.finalizedAt.toISOString() }
        : {}),
      ...(period.createdAt
        ? { createdAt: period.createdAt.toISOString() }
        : {}),
      ...(period.updatedAt
        ? { updatedAt: period.updatedAt.toISOString() }
        : {}),
    };
  }

  private formatSelection(
    selection: ElectiveSelectionDocument,
  ): ElectiveSelectionView {
    return {
      id: this.idToString(selection._id),
      periodId: this.idToString(selection.period),
      discipline: this.formatDiscipline(
        selection.discipline as ElectiveDisciplineDocument,
      ),
      student: this.studentView(selection.student),
      group: this.referenceView(selection.group, 'code'),
      selectedAt: selection.selectedAt.toISOString(),
      status: selection.status ?? ElectiveSelectionStatus.SELECTED,
      ...(selection.cancelReason
        ? { cancelReason: selection.cancelReason }
        : {}),
      ...(selection.cancelledAt
        ? { cancelledAt: selection.cancelledAt.toISOString() }
        : {}),
      ...(selection.courseAssignment
        ? { courseAssignmentId: this.idToString(selection.courseAssignment) }
        : {}),
      ...(selection.finalizedAt
        ? { finalizedAt: selection.finalizedAt.toISOString() }
        : {}),
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
