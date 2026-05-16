import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Submission,
  SubmissionDocument,
  Assignment,
  AssignmentDocument,
} from '../schemas';
import { User, UserDocument } from '../../users/schemas';
import { SubmissionDto, SubmitAssignmentDto } from '../dto';
import {
  transformToDto,
  transformToDtoArray,
} from '../../common/utils/transform.util';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findSubmissions(assignmentId: string): Promise<SubmissionDto[]> {
    const submissions = await this.submissionModel
      .find({ assignment: new Types.ObjectId(assignmentId) } as any)
      .populate('student')
      .populate('files')
      .lean()
      .exec();

    return transformToDtoArray(SubmissionDto, submissions);
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

    if (new Date() > assignment.dueDate) {
      throw new BadRequestException('Термін здачі завдання минув');
    }

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
}
