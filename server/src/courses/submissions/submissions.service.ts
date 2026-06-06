import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel, PopulateOptions } from 'mongoose';
import {
  Submission,
  SubmissionDocument,
  Assignment,
  AssignmentDocument,
  Grade,
  GradeDocument,
} from '../schemas';
import { User, UserDocument } from '../../users/schemas';
import { ReturnSubmissionDto, SubmissionDto, SubmitAssignmentDto } from './dto';
import {
  transformToDto,
  transformToPaginatedDto,
} from '../../common/utils/transform.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { FilesService } from '../../files/files.service';
import { Role } from '../../common/types/roles.enum';
import { CoursesService } from '../courses/courses.service';
import { toId } from '../../common/utils/to-id.util';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/dto/create-notification.dto';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name)
    private submissionModel: PaginateModel<SubmissionDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Grade.name)
    private gradeModel: Model<GradeDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly filesService: FilesService,
    private readonly coursesService: CoursesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findSubmissions(
    assignmentId: string,
    pagination: PaginationDto,
    userId: string,
    role: Role,
  ): Promise<PaginatedDto<SubmissionDto>> {
    const assignment = await this.getOwnedAssignment(
      assignmentId,
      userId,
      role,
    );
    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: [
        {
          path: 'student',
          select: 'firstName lastName middleName email login studentProfile',
        },
        { path: 'files' },
      ] as PopulateOptions[],
      sort: { submittedAt: -1 as const },
      lean: true,
    };

    const result = await this.submissionModel.paginate(
      { assignment: assignment._id, status: 'submitted' },
      options,
    );

    return transformToPaginatedDto(SubmissionDto, result);
  }

  async submitAssignment(
    assignmentId: string,
    dto: SubmitAssignmentDto,
    studentId: string,
  ): Promise<SubmissionDto> {
    const assignment = await this.getOwnedAssignment(
      assignmentId,
      studentId,
      Role.STUDENT,
    );
    this.assertBeforeDeadline(assignment);

    const existingFilter: Record<string, unknown> = {
      assignment: assignment._id,
      student: new Types.ObjectId(studentId),
    };
    const existing = await this.submissionModel.findOne(existingFilter).exec();

    if (existing && existing.status !== 'returned') {
      throw new ConflictException('Ви вже здали це завдання');
    }

    await this.filesService.assertFilesCanBeAttached(
      dto.fileIds,
      studentId,
      Role.STUDENT,
    );

    const fileObjectIds = dto.fileIds.map((id) => new Types.ObjectId(id));

    if (existing) {
      const saved = await this.submissionModel
        .findOneAndUpdate(
          { ...existingFilter, status: 'returned' },
          {
            $set: {
              files: fileObjectIds,
              status: 'submitted',
              submittedAt: new Date(),
            },
            $inc: { attemptNumber: 1 },
            $unset: { score: '', comment: '' },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .exec();

      if (!saved) {
        throw new ConflictException(
          'Статус роботи вже змінено. Оновіть сторінку.',
        );
      }

      const populated = await saved.populate('files');
      await this.notifySubmissionCreated(assignment, saved, studentId);
      return transformToDto(SubmissionDto, populated.toObject());
    }

    const submission = new this.submissionModel({
      assignment: assignment._id,
      student: new Types.ObjectId(studentId),
      files: fileObjectIds,
      status: 'submitted',
      attemptNumber: 1,
    });
    const saved = await submission.save();

    const populated = await saved.populate('files');
    await this.notifySubmissionCreated(assignment, saved, studentId);
    return transformToDto(SubmissionDto, populated.toObject());
  }

  async returnForRevision(
    submissionId: string,
    dto: ReturnSubmissionDto,
    reviewerId: string,
    role: Role,
  ): Promise<SubmissionDto> {
    if (!Types.ObjectId.isValid(submissionId)) {
      throw new BadRequestException('Некоректний ID зданої роботи');
    }

    const submission = await this.submissionModel
      .findById(submissionId)
      .populate('assignment')
      .exec();

    if (!submission) {
      throw new NotFoundException('Роботу не знайдено');
    }

    if (submission.status === 'returned') {
      throw new ConflictException('Роботу вже повернено на доопрацювання');
    }

    const assignment = submission.assignment as unknown as AssignmentDocument;
    await this.coursesService.validateOwnership(
      toId(assignment.courseAssignment),
      reviewerId,
      role,
    );
    this.assertBeforeDeadline(assignment);

    const returnComment = dto.comment.trim();
    const returnedAt = new Date();

    const saved = await this.submissionModel
      .findOneAndUpdate(
        {
          _id: submission._id,
          status: { $in: ['submitted', 'graded'] },
        },
        {
          $set: {
            status: 'returned',
            attemptNumber: submission.attemptNumber ?? 1,
            returnComment,
            returnedAt,
            returnedBy: new Types.ObjectId(reviewerId),
          },
          $unset: { score: '', comment: '' },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!saved) {
      throw new ConflictException(
        'Статус роботи вже змінено. Оновіть сторінку.',
      );
    }

    await this.gradeModel
      .updateOne(
        { submission: saved._id, status: { $ne: 'withdrawn' } },
        {
          $set: {
            status: 'withdrawn',
            withdrawnAt: returnedAt,
            withdrawalReason: returnComment,
          },
        },
        { runValidators: true },
      )
      .exec();

    await this.notifySubmissionReturned(assignment, saved, returnComment);

    const populated = await saved.populate('files');
    return transformToDto(SubmissionDto, populated.toObject());
  }

  async removeSubmission(
    assignmentId: string,
    studentId: string,
    userId: string,
    role: Role,
  ) {
    if (role === Role.STUDENT && studentId !== userId) {
      throw new ForbiddenException('Можна видаляти лише власну роботу');
    }

    if (!Types.ObjectId.isValid(studentId)) {
      throw new BadRequestException('Некоректний ID студента');
    }

    const assignment = await this.getOwnedAssignment(
      assignmentId,
      userId,
      role,
    );

    const filter: Record<string, unknown> = {
      assignment: new Types.ObjectId(assignmentId),
      student: new Types.ObjectId(studentId),
    };

    const existing = await this.submissionModel.findOne(filter).exec();
    if (!existing) {
      throw new NotFoundException('Здану роботу не знайдено');
    }

    if (role === Role.STUDENT) {
      this.assertBeforeDeadline(assignment);

      if (existing.status !== 'submitted') {
        throw new BadRequestException(
          'Повернену або оцінену роботу не можна видалити',
        );
      }
    }

    await this.submissionModel.deleteOne(filter).exec();
    return { success: true };
  }

  private async getOwnedAssignment(
    assignmentId: string,
    userId: string,
    role: Role,
  ): Promise<AssignmentDocument> {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new BadRequestException('Некоректний ID завдання');
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Некоректний ID користувача');
    }

    const assignment = await this.assignmentModel.findById(assignmentId).exec();
    if (!assignment) {
      throw new NotFoundException('Завдання не знайдено');
    }

    await this.coursesService.assertCourseAssignmentAccess(
      toId(assignment.courseAssignment),
      userId,
      role,
    );

    return assignment;
  }

  private async notifySubmissionCreated(
    assignment: AssignmentDocument,
    submission: SubmissionDocument,
    studentId: string,
  ): Promise<void> {
    try {
      const courseAssignmentId = toId(assignment.courseAssignment);
      const courseAssignment =
        await this.coursesService.findCourseAssignmentById(courseAssignmentId);
      const teacherId = courseAssignment.teacherId;

      if (!teacherId || teacherId === studentId) {
        return;
      }

      const student = await this.userModel
        .findById(studentId)
        .select('firstName lastName middleName login')
        .lean()
        .exec();

      await this.notificationsService.create({
        userId: teacherId,
        title: 'Робота здана на перевірку',
        message: `${this.formatUserName(student)} здав(ла) завдання «${
          assignment.title
        }»${courseAssignment.courseName ? ` з дисципліни ${courseAssignment.courseName}` : ''}.`,
        type: NotificationType.ASSIGNMENT_SUBMITTED,
        actionUrl: `/courses/${courseAssignmentId}?tab=submissions&assignmentId=${toId(
          assignment._id,
        )}`,
        entityType: 'submission',
        entityId: toId(submission._id),
        important: true,
      });
    } catch {
      // Notifications are non-critical for assignment submission.
    }
  }

  private async notifySubmissionReturned(
    assignment: AssignmentDocument,
    submission: SubmissionDocument,
    comment: string,
  ): Promise<void> {
    try {
      const courseAssignmentId = toId(assignment.courseAssignment);
      const courseAssignment =
        await this.coursesService.findCourseAssignmentById(courseAssignmentId);

      await this.notificationsService.create({
        userId: toId(submission.student),
        title: 'Роботу повернено на доопрацювання',
        message: `${courseAssignment.courseName || 'Дисципліна'}: «${
          assignment.title
        }». Коментар викладача: ${comment}`,
        type: NotificationType.ASSIGNMENT_RETURNED,
        actionUrl: `/assignments?assignmentId=${toId(assignment._id)}`,
        entityType: 'submission',
        entityId: toId(submission._id),
        important: true,
      });
    } catch {
      // Notifications are non-critical for returning submitted work.
    }
  }

  private formatUserName(
    user: {
      firstName?: string;
      lastName?: string;
      middleName?: string;
      login?: string;
    } | null,
  ): string {
    if (!user) {
      return 'Студент';
    }

    const fullName = [user.lastName, user.firstName, user.middleName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || user.login || 'Студент';
  }

  private assertBeforeDeadline(assignment: AssignmentDocument): void {
    if (new Date() > new Date(assignment.dueDate)) {
      throw new BadRequestException('Термін здачі завдання минув');
    }
  }
}
