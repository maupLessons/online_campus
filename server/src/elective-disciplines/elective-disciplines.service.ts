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
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
  CourseDocument,
} from '../courses/schemas';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Department, Group } from '../references/schemas';
import { User, UserDocument } from '../users/schemas';
import { UsersService } from '../users/users.service';
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
  ElectiveDiscipline,
  ElectiveDisciplineDocument,
  ElectiveDisciplineStatus,
  ElectiveSelection,
  ElectiveSelectionDocument,
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodDocument,
  ElectiveSelectionPeriodStatus,
} from './schemas';

type ReferenceView = {
  id: string;
  name?: string;
  code?: string;
};

export type ElectiveDisciplineView = {
  id: string;
  code: string;
  title: string;
  description?: string;
  department: ReferenceView;
  teacher?: ReferenceView | null;
  semester: number;
  credits: number;
  capacity: number;
  enrolledCount: number;
  availableSeats: number;
  status: ElectiveDisciplineStatus;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ElectivePeriodView = {
  id: string;
  title: string;
  academicYear: string;
  semester: number;
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
  courseAssignmentId?: string;
  finalizedAt?: string;
};

export type ActiveElectivePeriodView = {
  period: ElectivePeriodView;
  disciplines: ElectiveDisciplineView[];
  selections: ElectiveSelectionView[];
  selectedCount: number;
  remainingChoices: number;
};

export type ElectivePeriodResultsView = {
  period: ElectivePeriodView;
  totalSelections: number;
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
    }>;
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
  Role.RECTOR,
  Role.PRESIDENT,
]);

const PERIOD_MANAGER_ROLES = new Set<Role>([
  Role.ADMIN,
  Role.DEAN,
  Role.RECTOR,
  Role.PRESIDENT,
]);

type FinalizationBucket = {
  discipline: ElectiveDisciplineDocument;
  groupId: Types.ObjectId;
  studentIds: Types.ObjectId[];
  selectionIds: Types.ObjectId[];
};

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
  ) {}

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
      semester: dto.semester,
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
    if (query.semester) filter.semester = query.semester;

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
      .sort({ semester: 1, title: 1 })
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
    if (dto.semester !== undefined) discipline.semester = dto.semester;
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
  ): Promise<ElectiveDisciplineView> {
    this.ensureDisciplineManager(user);

    const discipline = await this.getDisciplineOrThrow(id);
    await this.ensureCanManageDepartment(
      user,
      this.toObjectId(this.idToString(discipline.department)),
    );

    discipline.status = dto.status;
    await discipline.save();
    return this.findDisciplineView(discipline._id);
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
      academicYear: dto.academicYear.trim(),
      semester: dto.semester,
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

    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.semester) filter.semester = query.semester;

    const periods = await this.periodModel
      .find(filter)
      .populate('targetGroups')
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
    if (dto.academicYear !== undefined) {
      period.academicYear = dto.academicYear.trim();
    }
    if (dto.semester !== undefined) period.semester = dto.semester;
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
      period.status = ElectiveSelectionPeriodStatus.ACTIVE;
      period.publishedAt = now;
      period.closedAt = undefined;
      await period.save();
      await this.notifyPeriodPublished(period);
      return this.findPeriodView(period._id);
    }

    if (dto.status === ElectiveSelectionPeriodStatus.CLOSED) {
      if (period.status === ElectiveSelectionPeriodStatus.CLOSED) {
        throw new BadRequestException('Період уже закритий');
      }
      period.status = ElectiveSelectionPeriodStatus.CLOSED;
      period.closedAt = now;
      await period.save();
      return this.findPeriodView(period._id);
    }

    if (period.status !== ElectiveSelectionPeriodStatus.DRAFT) {
      throw new BadRequestException(
        'Повернути активний період у чернетку не можна',
      );
    }

    return this.findPeriodView(period._id);
  }

  async finalizePeriod(
    periodId: string,
    user: AuthenticatedUser,
  ): Promise<ElectivePeriodFinalizationView> {
    this.ensurePeriodManager(user);
    await this.closeExpiredPeriods();

    const period = await this.getPeriodOrThrow(periodId);
    if (period.status === ElectiveSelectionPeriodStatus.FINALIZED) {
      return this.getFinalizationSummary(period);
    }

    if (period.status !== ElectiveSelectionPeriodStatus.CLOSED) {
      throw new BadRequestException(
        'Фіналізувати можна лише закритий період вибору',
      );
    }

    const finalizedAt = new Date();
    const finalizedBy = this.toObjectId(user.sub);
    const selections = await this.selectionModel
      .find({ period: period._id })
      .populate({
        path: 'discipline',
        populate: [{ path: 'department' }, { path: 'teacher' }],
      })
      .populate('student')
      .populate('group')
      .exec();

    const buckets = this.groupSelectionsForFinalization(selections);
    const courseAssignments: ElectivePeriodFinalizationView['courseAssignments'] =
      [];

    for (const bucket of buckets.values()) {
      const discipline = bucket.discipline;
      const teacherId = this.idToString(discipline.teacher);
      if (!teacherId || !Types.ObjectId.isValid(teacherId)) {
        throw new BadRequestException(
          `Для дисципліни ${discipline.code} потрібно призначити викладача перед фіналізацією`,
        );
      }

      const course = await this.courseModel
        .findOneAndUpdate(
          { code: discipline.code },
          {
            $setOnInsert: {
              name: discipline.title,
              code: discipline.code,
              department: this.toObjectId(
                this.idToString(discipline.department),
              ),
              semester: discipline.semester,
              credits: discipline.credits,
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

      const assignment = await this.upsertFinalizedCourseAssignment({
        courseId: course._id,
        discipline,
        groupId: bucket.groupId,
        period,
        studentIds: bucket.studentIds,
        teacherId: this.toObjectId(teacherId),
        finalizedAt,
      });

      await this.selectionModel
        .updateMany(
          { _id: { $in: bucket.selectionIds } },
          {
            $set: {
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

    period.status = ElectiveSelectionPeriodStatus.FINALIZED;
    period.closedAt = period.closedAt ?? finalizedAt;
    period.finalizedAt = finalizedAt;
    period.finalizedBy = finalizedBy;
    await period.save();
    await this.notifyPeriodFinalized(period, selections);

    return {
      period: await this.findPeriodView(period._id),
      totalSelections: selections.length,
      courseAssignments,
    };
  }

  async findActiveForStudent(
    user: AuthenticatedUser,
  ): Promise<ActiveElectivePeriodView[]> {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('Вибір дисциплін доступний лише студентам');
    }

    await this.closeExpiredPeriods();

    const profile = await this.usersService.findOne(user.sub);
    const groupId = profile.studentProfile?.group;
    if (!groupId) {
      return [];
    }

    const groupObjectId = this.toObjectId(groupId);
    const now = new Date();
    const periods = await this.periodModel
      .find({
        status: ElectiveSelectionPeriodStatus.ACTIVE,
        startsAt: { $lte: now },
        endsAt: { $gte: now },
        targetGroups: groupObjectId,
      })
      .populate('targetGroups')
      .sort({ endsAt: 1 })
      .exec();

    if (periods.length === 0) {
      return [];
    }

    const semesters = [...new Set(periods.map((period) => period.semester))];
    const [disciplines, selections] = await Promise.all([
      this.disciplineModel
        .find({
          status: ElectiveDisciplineStatus.ACTIVE,
          semester: { $in: semesters },
        })
        .populate('department')
        .populate('teacher')
        .sort({ semester: 1, title: 1 })
        .exec(),
      this.selectionModel
        .find({
          period: { $in: periods.map((period) => period._id) },
          student: this.toObjectId(user.sub),
        })
        .populate({
          path: 'discipline',
          populate: [{ path: 'department' }, { path: 'teacher' }],
        })
        .populate('group')
        .sort({ selectedAt: 1 })
        .exec(),
    ]);

    const disciplinesBySemester = new Map<
      number,
      ElectiveDisciplineDocument[]
    >();
    for (const discipline of disciplines) {
      disciplinesBySemester.set(discipline.semester, [
        ...(disciplinesBySemester.get(discipline.semester) ?? []),
        discipline,
      ]);
    }

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
      const selectedCount = periodSelections.length;

      return {
        period: this.formatPeriod(period),
        disciplines: (disciplinesBySemester.get(period.semester) ?? []).map(
          (discipline) => this.formatDiscipline(discipline),
        ),
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
        populate: [{ path: 'department' }, { path: 'teacher' }],
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

    const groupId = profile.studentProfile?.group;
    if (!groupId) {
      throw new BadRequestException('У профілі студента не вказана група');
    }
    if (!this.periodTargetsGroup(period, groupId)) {
      throw new ForbiddenException('Період вибору недоступний для вашої групи');
    }

    const studentId = this.toObjectId(user.sub);
    const disciplineId = this.toObjectId(dto.disciplineId);
    const groupObjectId = this.toObjectId(groupId);

    const [selectedCount, duplicateSelection, discipline] = await Promise.all([
      this.selectionModel
        .countDocuments({
          period: period._id,
          student: studentId,
        })
        .exec(),
      this.selectionModel
        .findOne({
          period: period._id,
          student: studentId,
          discipline: disciplineId,
        })
        .exec(),
      this.disciplineModel.findById(disciplineId).exec(),
    ]);

    if (!discipline) {
      throw new NotFoundException('Вибіркова дисципліна не знайдена');
    }
    if (discipline.status !== ElectiveDisciplineStatus.ACTIVE) {
      throw new BadRequestException('Дисципліна недоступна для вибору');
    }
    if (discipline.semester !== period.semester) {
      throw new BadRequestException(
        'Дисципліна не належить до семестру цього періоду вибору',
      );
    }
    if (duplicateSelection) {
      throw new ConflictException('Цю дисципліну вже обрано');
    }
    if (selectedCount >= period.requiredChoices) {
      throw new ConflictException(
        'Ліміт вибору дисциплін для періоду вичерпано',
      );
    }

    const reserved = await this.disciplineModel
      .findOneAndUpdate(
        {
          _id: disciplineId,
          status: ElectiveDisciplineStatus.ACTIVE,
          semester: period.semester,
          $expr: { $lt: ['$enrolledCount', '$capacity'] },
        },
        { $inc: { enrolledCount: 1 } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!reserved) {
      throw new ConflictException('Вільних місць на дисципліні вже немає');
    }

    try {
      const selection = await this.selectionModel.create({
        period: period._id,
        discipline: disciplineId,
        student: studentId,
        group: groupObjectId,
        selectedAt: new Date(),
      });

      const populated = await this.selectionModel
        .findById(selection._id)
        .populate({
          path: 'discipline',
          populate: [{ path: 'department' }, { path: 'teacher' }],
        })
        .populate('group')
        .exec();

      if (!populated) {
        throw new NotFoundException('Вибір не знайдено після створення');
      }

      return this.formatSelection(populated);
    } catch (error) {
      await this.disciplineModel
        .updateOne(
          { _id: disciplineId, enrolledCount: { $gt: 0 } },
          { $inc: { enrolledCount: -1 } },
        )
        .exec();

      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Цю дисципліну вже обрано');
      }
      throw error;
    }
  }

  async cancelSelection(
    periodId: string,
    selectionId: string,
    user: AuthenticatedUser,
  ): Promise<{ success: true }> {
    if (user.role !== Role.STUDENT) {
      throw new ForbiddenException('Вибір дисциплін доступний лише студентам');
    }

    const period = await this.getPeriodOrThrow(periodId);
    this.ensurePeriodIsOpen(period);

    const selection = await this.selectionModel
      .findOne({
        _id: this.toObjectId(selectionId),
        period: period._id,
        student: this.toObjectId(user.sub),
      })
      .exec();

    if (!selection) {
      throw new NotFoundException('Вибір дисципліни не знайдено');
    }

    await selection.deleteOne();
    const disciplineId = this.toObjectId(this.idToString(selection.discipline));
    await this.disciplineModel
      .updateOne(
        { _id: disciplineId, enrolledCount: { $gt: 0 } },
        { $inc: { enrolledCount: -1 } },
      )
      .exec();

    return { success: true };
  }

  async getPeriodResults(
    periodId: string,
    user: AuthenticatedUser,
  ): Promise<ElectivePeriodResultsView> {
    this.ensurePeriodManager(user);

    const period = await this.getPeriodOrThrow(periodId);
    const selections = await this.selectionModel
      .find({ period: period._id })
      .populate({
        path: 'discipline',
        populate: [{ path: 'department' }, { path: 'teacher' }],
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
      }>;
    };
    const grouped = new Map<string, ResultBucket>();

    for (const selection of selections) {
      const discipline = this.formatDiscipline(
        selection.discipline as ElectiveDisciplineDocument,
      );
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
      });
    }

    return {
      period: await this.findPeriodView(period._id),
      totalSelections: selections.length,
      disciplines: [...grouped.values()].map((item) => ({
        discipline: item.discipline,
        selectedCount: item.selectedCount,
        capacity: item.capacity,
        groups: [...item.groups.values()],
        students: item.students,
      })),
    };
  }

  async exportPeriodResultsCsv(
    periodId: string,
    user: AuthenticatedUser,
  ): Promise<string> {
    const results = await this.getPeriodResults(periodId, user);
    const rows = [
      [
        'period',
        'academic_year',
        'semester',
        'discipline_code',
        'discipline_title',
        'student_id',
        'student_login',
        'student_name',
        'group',
      ],
    ];

    for (const item of results.disciplines) {
      for (const student of item.students) {
        rows.push([
          results.period.title,
          results.period.academicYear,
          String(results.period.semester),
          item.discipline.code,
          item.discipline.title,
          student.id,
          student.login ?? '',
          student.fullName,
          student.group.code ?? student.group.id,
        ]);
      }
    }

    return `\uFEFF${rows
      .map((row) => row.map((value) => this.escapeCsv(value)).join(','))
      .join('\n')}\n`;
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
        $in: [
          Role.TEACHER,
          Role.DEPARTMENT_HEAD,
          Role.DEAN,
          Role.RECTOR,
          Role.PRESIDENT,
        ],
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

  private periodTargetsGroup(
    period: ElectiveSelectionPeriodDocument,
    groupId: string,
  ): boolean {
    return period.targetGroups.some(
      (group) => this.idToString(group) === groupId,
    );
  }

  private async closeExpiredPeriods(now = new Date()): Promise<void> {
    await this.periodModel
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
          type: NotificationType.ANNOUNCEMENT,
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

  private async upsertFinalizedCourseAssignment(params: {
    courseId: Types.ObjectId;
    discipline: ElectiveDisciplineDocument;
    groupId: Types.ObjectId;
    period: ElectiveSelectionPeriodDocument;
    studentIds: Types.ObjectId[];
    teacherId: Types.ObjectId;
    finalizedAt: Date;
  }): Promise<CourseAssignmentDocument> {
    const filter = {
      course: params.courseId,
      group: params.groupId,
      academicYear: params.period.academicYear,
      semester: params.period.semester,
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
          `Курс ${params.discipline.code} вже призначений цій групі на цей семестр`,
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
        academicYear: params.period.academicYear,
        semester: params.period.semester,
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
      this.selectionModel.countDocuments({ period: period._id }).exec(),
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

      await this.notificationsService.createMany(
        studentIds.map((studentId) => ({
          title: 'Вибір дисциплін зафіксовано',
          message: `Ваш вибір у періоді "${period.title}" зафіксовано. Дисципліни додано до розділу "Мої дисципліни".`,
          type: NotificationType.ANNOUNCEMENT,
          targetType: 'all',
          userId: studentId,
          actionUrl: '/courses',
          entityType: 'elective',
          entityId: periodId,
          important: true,
        })),
      );
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
      semester: discipline.semester,
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
    };
  }

  private formatPeriod(
    period: ElectiveSelectionPeriodDocument,
  ): ElectivePeriodView {
    return {
      id: this.idToString(period._id),
      title: period.title,
      academicYear: period.academicYear,
      semester: period.semester,
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

  private escapeCsv(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
