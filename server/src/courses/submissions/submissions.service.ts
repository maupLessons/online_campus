import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel } from 'mongoose';
import {
  Submission,
  SubmissionDocument,
  Assignment,
  AssignmentDocument,
} from '../schemas';
import { User, UserDocument } from '../../users/schemas';
import { SubmissionDto, SubmitAssignmentDto } from './dto';
import {
  transformToDto,
  transformToPaginatedDto,
} from '../../common/utils/transform.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { FilesService } from '../../files/files.service';
import { Role } from '../../common/types/roles.enum';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name)
    private submissionModel: PaginateModel<SubmissionDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly filesService: FilesService,
  ) {}

  async findSubmissions(
    assignmentId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<SubmissionDto>> {
    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: ['student', 'files'],
      sort: { submittedAt: -1 },
      lean: true,
    };

    const result = await this.submissionModel.paginate(
      { assignment: new Types.ObjectId(assignmentId) } as any,
      options as any,
    );

    return transformToPaginatedDto(SubmissionDto, result);
  }

  async submitAssignment(
    assignmentId: string,
    dto: SubmitAssignmentDto,
    studentId: string,
  ): Promise<SubmissionDto> {
    const assignment = await this.assignmentModel.findById(assignmentId).exec();
    if (!assignment) {
      throw new NotFoundException('Завдання не знайдено');
    }
    // блокує завантаження після дедлайну, розкоментувати за потребою.
    // import { BadRequestException } from '@nestjs/common';
    // if (new Date() > assignment.dueDate) {
    //   throw new BadRequestException('Термін здачі завдання минув');
    // }

    const user = await this.userModel
      .findById(studentId)
      .select('studentProfile')
      .lean()
      .exec();

    if (
      !user?.studentProfile ||
      String(user.studentProfile.group as any) !==
        String(assignment.group as any)
    ) {
      throw new ForbiddenException(
        'Ви не належите до групи, якій призначено це завдання',
      );
    }

    const existingFilter: Record<string, unknown> = {
      assignment: new Types.ObjectId(assignmentId),
      student: new Types.ObjectId(studentId),
    };
    const existing = await this.submissionModel.findOne(existingFilter).exec();

    if (existing) {
      throw new ConflictException('Ви вже здали це завдання');
    }

    await this.filesService.assertFilesCanBeAttached(
      dto.fileIds,
      studentId,
      Role.STUDENT,
    );

    const fileObjectIds = dto.fileIds.map((id) => new Types.ObjectId(id));
    const submission = new this.submissionModel({
      assignment: new Types.ObjectId(assignmentId),
      student: new Types.ObjectId(studentId),
      files: fileObjectIds,
      status: 'submitted',
    });
    const saved = await submission.save();

    const populated = await saved.populate('files');
    return transformToDto(SubmissionDto, populated.toObject());
  }
  async removeSubmission(assignmentId: string, studentId: string) {
    const filter: Record<string, unknown> = {
      assignment: new Types.ObjectId(assignmentId),
      student: new Types.ObjectId(studentId),
    };

    const existing = await this.submissionModel.findOne(filter).exec();
    if (!existing) {
      throw new NotFoundException('Здану роботу не знайдено');
    }

    await this.submissionModel.deleteOne(filter).exec();
    return { success: true };
  }
}
