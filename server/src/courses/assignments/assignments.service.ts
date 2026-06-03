import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel } from 'mongoose';
import { User, UserDocument } from '../../users/schemas';
import {
  Assignment,
  AssignmentDocument,
  Submission,
  SubmissionDocument,
} from '../schemas';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  AssignmentDto,
  AssignmentIdDto,
} from './dto';
import { CoursesService } from '../courses/courses.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Role } from '../../common/types/roles.enum';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import {
  transformToDto,
  transformToPaginatedDto,
} from '../../common/utils/transform.util';
import { SubmissionDto } from '../submissions/dto';
import { toId } from '../../common/utils/to-id.util';
import { FilesService } from '../../files/files.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../notifications/dto/create-notification.dto';

type SubmissionLookup = {
  assignment: unknown;
  student: unknown;
} & Record<string, unknown>;

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: PaginateModel<AssignmentDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    private coursesService: CoursesService,
    private readonly filesService: FilesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAssignments(
    courseAssignmentId: string,
    paginationDto: PaginationDto,
    userId?: string,
    role?: Role,
  ): Promise<PaginatedDto<AssignmentDto>> {
    const { page, limit } = paginationDto;
    const options = {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: ['files'],
      lean: true,
    };
    const filter: Record<string, unknown> = {
      courseAssignment: new Types.ObjectId(courseAssignmentId),
    };
    const result = await this.assignmentModel.paginate(filter, options);
    const paginatedDto = transformToPaginatedDto(AssignmentDto, result);

    if (role === Role.STUDENT && userId) {
      const assignments = result.docs;
      const submissions = await this.submissionModel
        .find({
          student: new Types.ObjectId(userId),
          assignment: { $in: assignments.map((a) => a._id) },
        } as never)
        .populate('files')
        .lean()
        .exec();
      const submissionMap = new Map<string, Submission>(
        submissions.map((s) => [toId(s.assignment), s]),
      );

      paginatedDto.docs = paginatedDto.docs.map((dto) => {
        const sub = submissionMap.get(dto.id);
        dto.submission = sub
          ? transformToDto(SubmissionDto, {
              ...sub,
              assignmentId: toId(sub.assignment),
              studentId: toId(sub.student),
            })
          : null;
        return dto;
      });
    }

    return paginatedDto;
  }

  async findOne(
    id: string,
    userId?: string,
    role?: Role,
  ): Promise<AssignmentDto> {
    const assignment = await this.assignmentModel
      .findById(id)
      .populate('files')
      .lean()
      .exec();

    if (!assignment) {
      throw new NotFoundException('Завдання не знайдено');
    }

    if (role === Role.STUDENT && userId) {
      const user = await this.userModel
        .findById(userId)
        .select('studentProfile')
        .lean()
        .exec();

      if (
        !user?.studentProfile ||
        toId(user.studentProfile.group) !== toId(assignment.group)
      ) {
        throw new ForbiddenException(
          'Ви не належите до групи, якій призначено це завдання',
        );
      }

      const submission = await this.submissionModel
        .findOne({
          student: new Types.ObjectId(userId),
          assignment: new Types.ObjectId(id),
        } as never)
        .populate('files')
        .lean()
        .exec();

      const dto = transformToDto(AssignmentDto, assignment);
      dto.submission = submission
        ? transformToDto(SubmissionDto, {
            ...submission,
            assignmentId: toId(submission.assignment),
            studentId: toId(submission.student),
          })
        : null;

      return dto;
    }

    return transformToDto(AssignmentDto, assignment);
  }

  async create(
    courseAssignmentId: string,
    dto: CreateAssignmentDto,
    userId: string,
    role: Role,
  ): Promise<AssignmentDto> {
    const ca = await this.coursesService.validateOwnership(
      courseAssignmentId,
      userId,
      role,
    );

    const { fileIds, ...rest } = dto;
    await this.filesService.assertFilesCanBeAttached(fileIds, userId, role);

    const assignment = new this.assignmentModel({
      ...rest,
      courseAssignment: new Types.ObjectId(courseAssignmentId),
      group: ca.group,
      files: fileIds ? fileIds.map((id) => new Types.ObjectId(id)) : [],
    });

    const saved = await assignment.save();
    const populated = await saved.populate('files');
    await this.notifyAssignmentCreated(
      courseAssignmentId,
      toId(ca.group),
      saved,
    );
    return transformToDto(AssignmentDto, populated.toObject());
  }

  async update(
    id: string,
    dto: UpdateAssignmentDto,
    userId: string,
    role: Role,
  ): Promise<AssignmentDto> {
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException('Завдання не знайдено');
    }

    await this.coursesService.validateOwnership(
      String(assignment.courseAssignment as any),
      userId,
      role,
    );

    const { fileIds, ...rest } = dto;
    Object.assign(assignment, rest);

    if (fileIds) {
      await this.filesService.assertFilesCanBeAttached(fileIds, userId, role);
      assignment.files = fileIds.map(
        (fid) => new Types.ObjectId(fid),
      ) as unknown as typeof assignment.files;
    }

    const saved = await assignment.save();
    const populated = await saved.populate('files');
    return transformToDto(AssignmentDto, populated.toObject());
  }

  async remove(
    id: string,
    userId: string,
    role: Role,
  ): Promise<AssignmentIdDto> {
    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException('Завдання не знайдено');
    }

    await this.coursesService.validateOwnership(
      String(assignment.courseAssignment as any),
      userId,
      role,
    );

    await this.assignmentModel.findByIdAndDelete(id).exec();
    return { id };
  }

  async findAssignmentsByStudent(
    studentId: string,
    paginationDto: PaginationDto,
  ): Promise<PaginatedDto<AssignmentDto>> {
    const page = paginationDto.page ?? 1;
    const limit = paginationDto.limit ?? 10;
    const user = (await this.userModel
      .findById(studentId)
      .select('studentProfile')
      .lean()
      .exec()) as unknown as {
      studentProfile?: { group: Types.ObjectId };
    } | null;

    if (!user?.studentProfile) {
      return transformToPaginatedDto(AssignmentDto, {
        docs: [],
        totalDocs: 0,
        limit,
        page,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false,
      });
    }

    const options = {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: ['files', { path: 'courseAssignment', populate: 'course' }],
      lean: true,
    };

    const result = await this.assignmentModel.paginate(
      { group: user.studentProfile.group },
      options as never,
    );

    const paginatedDto = transformToPaginatedDto(AssignmentDto, result);
    const assignments = result.docs;

    const submissions = (await this.submissionModel
      .find({
        student: new Types.ObjectId(studentId),
        assignment: { $in: assignments.map((a) => a._id) },
      } as never)
      .populate('files')
      .lean()
      .exec()) as unknown as SubmissionLookup[];
    const submissionMap = new Map<string, SubmissionLookup>(
      submissions.map((s) => [toId(s.assignment), s]),
    );

    paginatedDto.docs = paginatedDto.docs.map((dto, index) => {
      const a = assignments[index];
      const ca = a.courseAssignment;

      dto.courseName = ca?.course?.name;
      dto.courseAssignmentId = toId(ca);

      const sub = submissionMap.get(dto.id);
      dto.submission = sub
        ? transformToDto(SubmissionDto, {
            ...sub,
            assignmentId: toId(sub.assignment),
            studentId: toId(sub.student),
          })
        : null;

      return dto;
    });

    return paginatedDto;
  }

  private async notifyAssignmentCreated(
    courseAssignmentId: string,
    groupId: string,
    assignment: AssignmentDocument,
  ): Promise<void> {
    try {
      await this.notificationsService.create({
        title: 'Нове завдання',
        message: `${assignment.title}: дедлайн ${this.formatDate(
          assignment.dueDate,
        )}.`,
        type: NotificationType.NEW_ASSIGNMENT,
        targetType: 'group',
        groupId,
        actionUrl: `/courses/${courseAssignmentId}`,
        entityType: 'assignment',
        entityId: toId(assignment._id),
        important: true,
      });
    } catch {
      // Notifications are non-critical for assignment creation.
    }
  }

  private formatDate(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    return value.slice(0, 10);
  }
}
