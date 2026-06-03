import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PaginateModel, Types } from 'mongoose';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { Role } from '../../common/types/roles.enum';
import { toId } from '../../common/utils/to-id.util';
import { ScheduleEntry, ScheduleEntryDocument } from '../../schedule/schemas';
import { User, UserDocument } from '../../users/schemas';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/dto/create-notification.dto';
import { CoursesService } from '../courses/courses.service';
import {
  CourseAssignment,
  CourseAssignmentDocument,
  CourseAssignmentSource,
  Grade,
  GradeDocument,
  LessonJournalEntry,
  LessonJournalEntryDocument,
} from '../schemas';
import {
  CreateLessonJournalEntryDto,
  LessonGradeDto,
  LessonJournalAttendanceDto,
  LessonJournalEntryDto,
  LessonJournalGradeDto,
  LessonJournalQueryDto,
  UpdateLessonJournalEntryDto,
} from './dto';

type StudentLean = {
  _id: unknown;
  login?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
};

type AttendanceLean = {
  student?: unknown;
  status: LessonJournalAttendanceDto['status'];
  comment?: string;
};

type LessonJournalEntryLean = {
  _id: unknown;
  courseAssignment: unknown;
  scheduleEntry?: unknown;
  teacher: unknown;
  date: Date | string;
  startTime?: string;
  endTime?: string;
  type?: LessonJournalEntryDto['type'];
  topic: string;
  description?: string;
  attendance?: AttendanceLean[];
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type GradeLean = {
  _id: unknown;
  student?: unknown;
  courseAssignment: unknown;
  lessonJournalEntry?: unknown;
  date: Date | string;
  type: string;
  value: number;
  comment?: string;
};

type ScheduleLean = {
  _id: unknown;
  courseAssignment: unknown;
  date: Date | string;
  startTime: string;
  endTime: string;
  type: LessonJournalEntryDto['type'];
};

@Injectable()
export class LessonJournalService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(LessonJournalEntry.name)
    private readonly lessonJournalModel: PaginateModel<LessonJournalEntryDocument>,
    @InjectModel(Grade.name)
    private readonly gradeModel: PaginateModel<GradeDocument>,
    @InjectModel(ScheduleEntry.name)
    private readonly scheduleEntryModel: Model<ScheduleEntryDocument>,
    private readonly coursesService: CoursesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findEntries(
    courseAssignmentId: string,
    query: LessonJournalQueryDto,
    userId: string,
    role: Role,
  ): Promise<PaginatedDto<LessonJournalEntryDto>> {
    await this.coursesService.validateOwnership(
      courseAssignmentId,
      userId,
      role,
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, unknown> = {
      courseAssignment: this.toObjectId(courseAssignmentId),
    };

    if (query.scheduleEntryId) {
      filter.scheduleEntry = this.toObjectId(query.scheduleEntryId);
    }

    if (query.startDate || query.endDate) {
      filter.date = this.buildDateRange(query.startDate, query.endDate);
    }

    const result = await this.lessonJournalModel.paginate(filter, {
      page,
      limit,
      sort: { date: -1, startTime: -1, createdAt: -1 },
      populate: [{ path: 'attendance.student', select: this.studentSelect() }],
      lean: true,
    } as never);

    const docs = result.docs as unknown as LessonJournalEntryLean[];
    const gradesByEntry = await this.findGradesByEntry(
      docs.map((entry) => entry._id),
    );

    return {
      docs: docs.map((entry) =>
        this.formatEntry(entry, gradesByEntry.get(toId(entry._id)) ?? []),
      ),
      totalDocs: result.totalDocs,
      limit: result.limit,
      page: result.page ?? page,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
      nextPage: result.nextPage ?? undefined,
      prevPage: result.prevPage ?? undefined,
    };
  }

  async create(
    courseAssignmentId: string,
    dto: CreateLessonJournalEntryDto,
    userId: string,
    role: Role,
  ): Promise<LessonJournalEntryDto> {
    const courseAssignment = await this.coursesService.validateOwnership(
      courseAssignmentId,
      userId,
      role,
    );
    const schedule = await this.getScheduleEntry(dto.scheduleEntryId);
    this.assertScheduleMatchesCourse(schedule, courseAssignmentId);

    const students = await this.getCourseStudentMap(courseAssignment);
    this.assertStudentsBelongToCourse(dto.attendance, students);
    this.assertStudentsBelongToCourse(dto.grades, students);

    const lesson = await this.lessonJournalModel.create({
      courseAssignment: this.toObjectId(courseAssignmentId),
      scheduleEntry: dto.scheduleEntryId
        ? this.toObjectId(dto.scheduleEntryId)
        : null,
      teacher: this.toObjectId(userId),
      date: this.normalizeDate(dto.date),
      startTime: dto.startTime,
      endTime: dto.endTime,
      type: dto.type,
      topic: dto.topic.trim(),
      description: dto.description?.trim() ?? '',
      attendance: this.normalizeAttendance(dto.attendance),
    } as never);

    if (dto.grades !== undefined) {
      await this.replaceLessonGrades(lesson, dto.grades);
    }

    return this.findEntryById(toId(lesson._id), userId, role);
  }

  async update(
    id: string,
    dto: UpdateLessonJournalEntryDto,
    userId: string,
    role: Role,
  ): Promise<LessonJournalEntryDto> {
    const lesson = await this.lessonJournalModel
      .findById(this.toObjectId(id))
      .exec();
    if (!lesson) {
      throw new NotFoundException('Запис журналу не знайдено');
    }

    const courseAssignmentId = toId(lesson.courseAssignment);
    const courseAssignment = await this.coursesService.validateOwnership(
      courseAssignmentId,
      userId,
      role,
    );
    const schedule = await this.getScheduleEntry(dto.scheduleEntryId);
    this.assertScheduleMatchesCourse(schedule, courseAssignmentId);

    const students = await this.getCourseStudentMap(courseAssignment);
    this.assertStudentsBelongToCourse(dto.attendance, students);
    this.assertStudentsBelongToCourse(dto.grades, students);

    if (dto.scheduleEntryId !== undefined) {
      lesson.scheduleEntry = (
        dto.scheduleEntryId ? this.toObjectId(dto.scheduleEntryId) : null
      ) as never;
    }
    if (dto.date !== undefined) lesson.date = this.normalizeDate(dto.date);
    if (dto.startTime !== undefined) lesson.startTime = dto.startTime;
    if (dto.endTime !== undefined) lesson.endTime = dto.endTime;
    if (dto.type !== undefined) lesson.type = dto.type;
    if (dto.topic !== undefined) lesson.topic = dto.topic.trim();
    if (dto.description !== undefined) {
      lesson.description = dto.description?.trim() ?? '';
    }
    if (dto.attendance !== undefined) {
      lesson.attendance = this.normalizeAttendance(dto.attendance) as never;
    }

    await lesson.save();

    if (dto.grades !== undefined) {
      await this.replaceLessonGrades(lesson, dto.grades);
    }

    return this.findEntryById(id, userId, role);
  }

  async remove(
    id: string,
    userId: string,
    role: Role,
  ): Promise<{ id: string }> {
    const lesson = await this.lessonJournalModel
      .findById(this.toObjectId(id))
      .exec();
    if (!lesson) {
      throw new NotFoundException('Запис журналу не знайдено');
    }

    await this.coursesService.validateOwnership(
      toId(lesson.courseAssignment),
      userId,
      role,
    );

    await Promise.all([
      this.gradeModel
        .deleteMany({ lessonJournalEntry: this.toObjectId(id) } as never)
        .exec(),
      this.lessonJournalModel.deleteOne({ _id: this.toObjectId(id) }).exec(),
    ]);

    return { id };
  }

  private async findEntryById(
    id: string,
    userId: string,
    role: Role,
  ): Promise<LessonJournalEntryDto> {
    const lesson = await this.lessonJournalModel
      .findById(this.toObjectId(id))
      .populate({ path: 'attendance.student', select: this.studentSelect() })
      .lean<LessonJournalEntryLean>()
      .exec();

    if (!lesson) {
      throw new NotFoundException('Запис журналу не знайдено');
    }

    await this.coursesService.validateOwnership(
      toId(lesson.courseAssignment),
      userId,
      role,
    );

    const grades = await this.findGradesByLessonId(id);
    return this.formatEntry(lesson, grades);
  }

  private async getCourseStudentMap(
    courseAssignment: CourseAssignmentDocument,
  ): Promise<Map<string, StudentLean>> {
    const filter: Record<string, unknown> = {
      role: Role.STUDENT,
      status: 'active',
      'studentProfile.group': courseAssignment.group,
    };

    if (
      courseAssignment.source === CourseAssignmentSource.ELECTIVE &&
      courseAssignment.enrolledStudents.length > 0
    ) {
      filter._id = {
        $in: courseAssignment.enrolledStudents.map((id) =>
          this.toObjectId(toId(id)),
        ),
      };
    }

    const students = await this.userModel
      .find(filter as never)
      .select(this.studentSelect())
      .lean<StudentLean[]>()
      .exec();

    return new Map(students.map((student) => [toId(student._id), student]));
  }

  private assertStudentsBelongToCourse(
    items: Array<{ studentId: string }> | undefined,
    students: Map<string, StudentLean>,
  ): void {
    if (!items) return;

    const invalidStudent = items.find((item) => !students.has(item.studentId));
    if (invalidStudent) {
      throw new BadRequestException(
        'Студент не належить до групи або вибіркового курсу',
      );
    }
  }

  private normalizeAttendance(
    attendance: CreateLessonJournalEntryDto['attendance'],
  ) {
    return (attendance ?? []).map((item) => ({
      student: this.toObjectId(item.studentId),
      status: item.status,
      comment: item.comment?.trim() ?? '',
    }));
  }

  private async replaceLessonGrades(
    lesson: LessonJournalEntryDocument,
    grades: LessonGradeDto[],
  ): Promise<void> {
    const lessonId = this.toObjectId(toId(lesson._id));
    await this.gradeModel
      .deleteMany({ lessonJournalEntry: lessonId } as never)
      .exec();

    if (grades.length === 0) {
      return;
    }

    const createdGrades = await this.gradeModel.insertMany(
      grades.map((grade) => ({
        student: this.toObjectId(grade.studentId),
        courseAssignment: this.toObjectId(toId(lesson.courseAssignment)),
        lessonJournalEntry: lessonId,
        type: grade.type ?? 'current',
        value: grade.value,
        date: lesson.date,
        comment: grade.comment?.trim() ?? '',
      })),
      { ordered: false },
    );
    await this.notifyLessonGradesCreated(createdGrades);
  }

  private async getScheduleEntry(
    scheduleEntryId?: string,
  ): Promise<ScheduleLean | null> {
    if (!scheduleEntryId) {
      return null;
    }

    const schedule = await this.scheduleEntryModel
      .findById(this.toObjectId(scheduleEntryId))
      .select('courseAssignment date startTime endTime type')
      .lean<ScheduleLean>()
      .exec();

    if (!schedule) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    return schedule;
  }

  private assertScheduleMatchesCourse(
    schedule: ScheduleLean | null,
    courseAssignmentId: string,
  ): void {
    if (!schedule) return;

    if (toId(schedule.courseAssignment) !== courseAssignmentId) {
      throw new BadRequestException(
        'Запис розкладу не належить до цього курсу',
      );
    }
  }

  private async findGradesByEntry(
    entryIds: unknown[],
  ): Promise<Map<string, GradeLean[]>> {
    const objectIds = entryIds
      .map((id) => toId(id))
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return new Map();
    }

    const grades = await this.gradeModel
      .find({ lessonJournalEntry: { $in: objectIds } } as never)
      .populate({ path: 'student', select: this.studentSelect() })
      .lean<GradeLean[]>()
      .exec();

    return this.groupGradesByEntry(grades);
  }

  private async findGradesByLessonId(id: string): Promise<GradeLean[]> {
    return this.gradeModel
      .find({ lessonJournalEntry: this.toObjectId(id) } as never)
      .populate({ path: 'student', select: this.studentSelect() })
      .lean<GradeLean[]>()
      .exec();
  }

  private groupGradesByEntry(grades: GradeLean[]): Map<string, GradeLean[]> {
    const grouped = new Map<string, GradeLean[]>();
    for (const grade of grades) {
      const entryId = toId(grade.lessonJournalEntry);
      if (!grouped.has(entryId)) {
        grouped.set(entryId, []);
      }
      grouped.get(entryId)?.push(grade);
    }
    return grouped;
  }

  private formatEntry(
    entry: LessonJournalEntryLean,
    grades: GradeLean[],
  ): LessonJournalEntryDto {
    return {
      id: toId(entry._id),
      courseAssignmentId: toId(entry.courseAssignment),
      scheduleEntryId: entry.scheduleEntry ? toId(entry.scheduleEntry) : null,
      teacherId: toId(entry.teacher),
      date: this.formatDate(entry.date),
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      topic: entry.topic,
      description: entry.description,
      attendance: (entry.attendance ?? []).map((record) =>
        this.formatAttendance(record),
      ),
      grades: grades.map((grade) => this.formatGrade(grade)),
      createdAt: this.formatDateTime(entry.createdAt),
      updatedAt: this.formatDateTime(entry.updatedAt),
    };
  }

  private formatAttendance(record: AttendanceLean): LessonJournalAttendanceDto {
    const student = this.asStudent(record.student);
    return {
      studentId: toId(record.student),
      studentName: this.formatStudentName(student),
      login: student?.login,
      status: record.status,
      comment: record.comment,
    };
  }

  private formatGrade(grade: GradeLean): LessonJournalGradeDto {
    const student = this.asStudent(grade.student);
    return {
      id: toId(grade._id),
      studentId: toId(grade.student),
      studentName: this.formatStudentName(student),
      login: student?.login,
      value: grade.value,
      type: grade.type,
      date: this.formatDate(grade.date),
      comment: grade.comment,
    };
  }

  private asStudent(value: unknown): StudentLean | undefined {
    if (typeof value === 'object' && value !== null) {
      return value as StudentLean;
    }
    return undefined;
  }

  private formatStudentName(student?: StudentLean): string {
    if (!student) return '';

    return [student.lastName, student.firstName, student.middleName]
      .filter(Boolean)
      .join(' ');
  }

  private buildDateRange(startDate?: string, endDate?: string) {
    const range: { $gte?: Date; $lt?: Date } = {};
    if (startDate) {
      range.$gte = this.normalizeDate(startDate);
    }
    if (endDate) {
      const end = this.normalizeDate(endDate);
      end.setUTCDate(end.getUTCDate() + 1);
      range.$lt = end;
    }
    if (range.$gte && range.$lt && range.$gte >= range.$lt) {
      throw new BadRequestException(
        'Дата завершення повинна бути не раніше дати початку',
      );
    }
    return range;
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

  private formatDate(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  private formatDateTime(value?: Date | string): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return value.toISOString();
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некоректний ID');
    }
    return new Types.ObjectId(id);
  }

  private studentSelect(): string {
    return 'login firstName lastName middleName';
  }

  private async notifyLessonGradesCreated(
    grades: GradeDocument[],
  ): Promise<void> {
    try {
      await this.notificationsService.createMany(
        grades.map((grade) => ({
          userId: toId(grade.student),
          title: 'Нова поточна оцінка',
          message: `Поточна оцінка: ${grade.value}`,
          type: NotificationType.GRADE,
          actionUrl: '/grades',
          entityType: 'grade',
          entityId: toId(grade._id),
        })),
      );
    } catch {
      // Notifications are non-critical for lesson journal updates.
    }
  }
}
