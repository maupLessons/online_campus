import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel, PopulateOptions } from 'mongoose';
import {
  Grade,
  GradeDocument,
  CourseAssignment,
  CourseAssignmentDocument,
  Submission,
  SubmissionDocument,
  Assignment,
  AssignmentDocument,
} from '../schemas';
import {
  GradeResponseDto,
  GradeSubmissionDto,
  CreateGradeDto,
  UpdateGradeDto,
  GradeJournalResponseDto,
} from './dto';
import { StudentCourseResponseDto } from '../courses/dto';
import { SubmissionDto } from '../submissions/dto';
import {
  transformToPaginatedDto,
  transformToDtoArray,
  transformToDto,
} from '../../common/utils/transform.util';
import { Role } from '../../common/types/roles.enum';
import { CoursesService } from '../courses/courses.service';
import { toId } from '../../common/utils/to-id.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { User, UserDocument } from '../../users/schemas';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/dto/create-notification.dto';

@Injectable()
export class GradesService {
  constructor(
    @InjectModel(User.name) private userModel: PaginateModel<UserDocument>,
    @InjectModel(Grade.name) private gradeModel: PaginateModel<GradeDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: PaginateModel<CourseAssignmentDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    private coursesService: CoursesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async gradeSubmission(
    submissionId: string,
    dto: GradeSubmissionDto,
    userId: string,
    role: Role,
  ): Promise<SubmissionDto> {
    const submission = await this.submissionModel
      .findById(submissionId)
      .populate('assignment')
      .exec();

    if (!submission) {
      throw new NotFoundException('Роботу не знайдено');
    }

    const assignment = submission.assignment as unknown as AssignmentDocument;
    const courseAssignment = await this.coursesService.validateOwnership(
      toId(assignment.courseAssignment),
      userId,
      role,
    );
    await this.coursesService.assertStudentBelongsToCourseAssignment(
      courseAssignment,
      toId(submission.student),
    );

    if (submission.status === 'returned') {
      throw new BadRequestException(
        'Роботу повернено на доопрацювання та ще не здано повторно',
      );
    }

    if (submission.status === 'graded') {
      this.assertGradeEditableBeforeDeadline(assignment);
    }

    if (dto.score < 0 || dto.score > assignment.maxScore) {
      throw new BadRequestException(
        `Оцінка має бути в межах 0-${assignment.maxScore}`,
      );
    }

    const previousGrade = await this.gradeModel
      .findOne({ submission: submission._id })
      .lean()
      .exec();

    submission.score = dto.score;
    submission.comment = dto.comment ?? '';
    submission.status = 'graded';

    const saved = await submission.save();
    const grade = await this.upsertSubmissionGrade(saved, assignment, dto);
    if (this.shouldNotifySubmissionGrade(previousGrade, grade)) {
      await this.notifySubmissionGraded(grade, assignment, dto.score);
    }

    const populated = await saved.populate('files');
    return transformToDto(SubmissionDto, populated.toObject());
  }

  async create(
    dto: CreateGradeDto,
    userId: string,
    role: Role,
  ): Promise<GradeResponseDto> {
    const courseAssignment = await this.coursesService.validateOwnership(
      dto.courseAssignmentId,
      userId,
      role,
    );
    await this.coursesService.assertStudentBelongsToCourseAssignment(
      courseAssignment,
      dto.studentId,
    );

    const grade = new this.gradeModel({
      student: new Types.ObjectId(dto.studentId),
      courseAssignment: new Types.ObjectId(dto.courseAssignmentId),
      type: dto.type,
      value: dto.value,
      date: new Date(),
      comment: dto.comment,
    });

    const saved = await grade.save();
    const populated = await saved.populate({
      path: 'courseAssignment',
      populate: { path: 'course' },
    });

    await this.notifyGradeCreated(populated.toObject() as GradeDocument);
    return transformToDto(GradeResponseDto, populated.toObject());
  }

  async update(
    id: string,
    dto: UpdateGradeDto,
    userId: string,
    role: Role,
  ): Promise<GradeResponseDto> {
    const grade = await this.gradeModel
      .findOne({ _id: id, status: { $ne: 'withdrawn' } })
      .exec();
    if (!grade) {
      throw new NotFoundException('Оцінку не знайдено');
    }

    const courseAssignment = await this.coursesService.validateOwnership(
      toId(grade.courseAssignment),
      userId,
      role,
    );
    await this.coursesService.assertStudentBelongsToCourseAssignment(
      courseAssignment,
      toId(grade.student),
    );
    const linkedAssignment = await this.findLinkedAssignment(grade);
    if (linkedAssignment) {
      this.assertGradeEditableBeforeDeadline(linkedAssignment);
      this.assertGradeFitsAssignmentMaxScore(dto.value, linkedAssignment);
    }

    const previousGradeSnapshot = {
      value: grade.value,
      comment: grade.comment,
    };

    if (dto.type) grade.type = dto.type;
    if (dto.value !== undefined) grade.value = dto.value;
    if (dto.comment !== undefined) grade.comment = dto.comment;

    const saved = await grade.save();
    if (linkedAssignment) {
      await this.syncSubmissionFromGrade(saved, linkedAssignment);
    }

    const populated = await saved.populate([
      {
        path: 'courseAssignment',
        populate: { path: 'course' },
      },
      { path: 'assignment' },
    ]);

    if (
      linkedAssignment &&
      this.shouldNotifySubmissionGrade(previousGradeSnapshot, populated)
    ) {
      await this.notifySubmissionGraded(
        populated,
        linkedAssignment,
        populated.value,
      );
    }

    return transformToDto(GradeResponseDto, populated.toObject());
  }

  async findMyCoursesWithGrades(
    studentId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<StudentCourseResponseDto>> {
    const user = await this.userModel.findById(studentId).lean().exec();
    const groupId = user?.studentProfile?.group;

    if (!groupId) {
      return {
        docs: [],
        totalDocs: 0,
        limit: pagination.limit || 10,
        page: pagination.page || 1,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    const accessibleCourseAssignmentIds =
      await this.coursesService.findAccessibleCourseAssignmentIdsForStudent(
        studentId,
        toId(groupId),
      );

    if (accessibleCourseAssignmentIds.length === 0) {
      return {
        docs: [],
        totalDocs: 0,
        limit: pagination.limit || 10,
        page: pagination.page || 1,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      };
    }

    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: 'course',
      sort: { 'course.name': 1 },
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      { _id: { $in: accessibleCourseAssignmentIds } },
      options,
    );

    return transformToPaginatedDto(StudentCourseResponseDto, result);
  }

  async findStudentGradesByCourse(
    studentId: string,
    courseAssignmentId: string,
    pagination: PaginationDto,
    requesterId: string,
    requesterRole: Role,
  ): Promise<PaginatedDto<GradeResponseDto>> {
    const courseAssignment =
      await this.coursesService.assertCourseAssignmentAccess(
        courseAssignmentId,
        requesterId,
        requesterRole,
      );
    await this.coursesService.assertStudentBelongsToCourseAssignment(
      courseAssignment,
      studentId,
    );

    const { page, limit } = pagination;
    const options = {
      page,
      limit,
      sort: { date: -1 },
      populate: [
        {
          path: 'courseAssignment',
          populate: { path: 'course' },
        },
        { path: 'assignment' },
      ] as PopulateOptions[],
      lean: true,
    };

    const result = await this.gradeModel.paginate(
      {
        student: new Types.ObjectId(studentId),
        courseAssignment: new Types.ObjectId(courseAssignmentId),
        status: { $ne: 'withdrawn' },
      },
      options,
    );

    return transformToPaginatedDto(GradeResponseDto, result);
  }

  async findGradesByCourseAssignment(
    courseAssignmentId: string,
    pagination: PaginationDto,
    userId: string,
    role: Role,
  ): Promise<PaginatedDto<GradeJournalResponseDto>> {
    const courseAssignment =
      await this.coursesService.assertCourseAssignmentAccess(
        courseAssignmentId,
        userId,
        role,
      );

    const { page, limit } = pagination;
    const studentOptions = {
      page: page || 1,
      limit: limit || 10,
      lean: true,
      sort: { lastName: 1, firstName: 1 },
    };

    const studentResult = await this.userModel.paginate(
      this.coursesService.buildCourseStudentRosterFilter(courseAssignment),
      studentOptions,
    );

    const studentIds = studentResult.docs.map((s) => s._id);

    const grades = await this.gradeModel
      .find({
        courseAssignment: new Types.ObjectId(courseAssignmentId),
        student: { $in: studentIds },
        status: { $ne: 'withdrawn' },
      } as never)
      .populate({
        path: 'courseAssignment',
        populate: { path: 'course' },
      })
      .populate('assignment')
      .lean()
      .exec();

    const journalDocs = studentResult.docs.map((s) => {
      const studentGrades = grades.filter(
        (g) => toId(g.student) === toId(s._id),
      );
      return {
        studentId: s._id,
        studentName: `${s.lastName} ${s.firstName}`,
        grades: studentGrades,
      };
    });

    return {
      docs: transformToDtoArray(GradeJournalResponseDto, journalDocs),
      totalDocs: studentResult.totalDocs,
      limit: studentResult.limit,
      page: studentResult.page || 1,
      totalPages: studentResult.totalPages,
      hasNextPage: studentResult.hasNextPage,
      hasPrevPage: studentResult.hasPrevPage,
      nextPage: studentResult.nextPage || undefined,
      prevPage: studentResult.prevPage || undefined,
    };
  }

  private async notifyGradeCreated(grade: GradeDocument): Promise<void> {
    try {
      const courseName = this.getGradeCourseName(grade);
      await this.notificationsService.create({
        userId: toId(grade.student),
        title: 'Нова оцінка',
        message: `${courseName}: ${grade.value}`,
        type: NotificationType.GRADE,
        actionUrl: '/grades',
        entityType: 'grade',
        entityId: toId(grade._id),
        important: false,
      });
    } catch {
      // Notifications are non-critical for grade creation.
    }
  }

  private async upsertSubmissionGrade(
    submission: SubmissionDocument,
    assignment: AssignmentDocument,
    dto: GradeSubmissionDto,
  ): Promise<GradeDocument> {
    const grade = await this.gradeModel
      .findOneAndUpdate(
        { submission: submission._id },
        {
          $set: {
            student: submission.student,
            courseAssignment: assignment.courseAssignment,
            assignment: assignment._id,
            submission: submission._id,
            date: new Date(),
            type: 'current',
            value: dto.score,
            comment: this.buildSubmissionGradeComment(assignment, dto.comment),
            status: 'active',
          },
          $unset: {
            withdrawnAt: '',
            withdrawalReason: '',
          },
        },
        {
          returnDocument: 'after',
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      )
      .populate([
        {
          path: 'courseAssignment',
          populate: { path: 'course' },
        },
        { path: 'assignment' },
      ])
      .exec();

    if (!grade) {
      throw new BadRequestException('Не вдалося зберегти оцінку за завдання');
    }

    return grade;
  }

  private buildSubmissionGradeComment(
    assignment: AssignmentDocument,
    comment?: string,
  ): string {
    const trimmedComment = comment?.trim();
    const assignmentTitle = assignment.title?.trim() || 'Завдання';

    return trimmedComment
      ? `Завдання «${assignmentTitle}»: ${trimmedComment}`
      : `Завдання «${assignmentTitle}»`;
  }

  private shouldNotifySubmissionGrade(
    previousGrade: {
      value?: unknown;
      comment?: unknown;
      status?: unknown;
    } | null,
    nextGrade: GradeDocument,
  ): boolean {
    if (!previousGrade || previousGrade.status === 'withdrawn') {
      return true;
    }

    const previousComment =
      typeof previousGrade.comment === 'string' ? previousGrade.comment : '';
    const nextComment =
      typeof nextGrade.comment === 'string' ? nextGrade.comment : '';

    return (
      Number(previousGrade.value) !== nextGrade.value ||
      previousComment !== nextComment
    );
  }

  private async findLinkedAssignment(
    grade: GradeDocument,
  ): Promise<AssignmentDocument | null> {
    if (!grade.assignment) {
      return null;
    }

    const assignmentId = toId(grade.assignment);
    const assignment = await this.assignmentModel.findById(assignmentId).exec();
    if (!assignment) {
      return null;
    }

    return assignment;
  }

  private assertGradeEditableBeforeDeadline(
    assignment: AssignmentDocument,
  ): void {
    if (new Date() > new Date(assignment.dueDate)) {
      throw new BadRequestException(
        'Оцінку за завдання не можна змінювати після дедлайну',
      );
    }
  }

  private assertGradeFitsAssignmentMaxScore(
    value: number | undefined,
    assignment: AssignmentDocument,
  ): void {
    if (value === undefined) {
      return;
    }

    if (value > assignment.maxScore) {
      throw new BadRequestException(
        `Оцінка має бути в межах 0-${assignment.maxScore}`,
      );
    }
  }

  private async syncSubmissionFromGrade(
    grade: GradeDocument,
    assignment: AssignmentDocument,
  ): Promise<void> {
    if (!grade.submission) {
      return;
    }

    await this.submissionModel
      .findByIdAndUpdate(
        toId(grade.submission),
        {
          $set: {
            score: grade.value,
            comment: this.extractSubmissionComment(grade.comment, assignment),
            status: 'graded',
          },
        },
        { runValidators: true },
      )
      .exec();
  }

  private extractSubmissionComment(
    comment: string | undefined,
    assignment: AssignmentDocument,
  ): string {
    const normalizedComment = comment?.trim() ?? '';
    const assignmentTitle = assignment.title?.trim() || 'Завдання';
    const prefixedComment = `Завдання «${assignmentTitle}»:`;
    const titleOnlyComment = `Завдання «${assignmentTitle}»`;

    if (normalizedComment.startsWith(prefixedComment)) {
      return normalizedComment.slice(prefixedComment.length).trim();
    }

    return normalizedComment === titleOnlyComment ? '' : normalizedComment;
  }

  private async notifySubmissionGraded(
    grade: GradeDocument,
    assignment: AssignmentDocument,
    score: number,
  ): Promise<void> {
    try {
      const courseName = this.getGradeCourseName(grade);
      await this.notificationsService.create({
        userId: toId(grade.student),
        title: 'Оцінка за завдання',
        message: `${courseName}: «${assignment.title}» оцінено на ${score}/${assignment.maxScore}. Оцінка доступна у завданнях та заліковій книжці.`,
        type: NotificationType.GRADE,
        actionUrl: '/assignments',
        entityType: 'grade',
        entityId: toId(grade._id),
        important: true,
      });
    } catch {
      // Notifications are non-critical for grading submitted work.
    }
  }

  private getGradeCourseName(grade: GradeDocument): string {
    const courseAssignment = grade.courseAssignment as unknown;
    if (!courseAssignment || typeof courseAssignment !== 'object') {
      return 'Дисципліна';
    }

    const course = (courseAssignment as { course?: unknown }).course;
    if (!course || typeof course !== 'object') {
      return 'Дисципліна';
    }

    const name = (course as { name?: unknown }).name;
    return typeof name === 'string' && name.trim() ? name : 'Дисципліна';
  }
}
