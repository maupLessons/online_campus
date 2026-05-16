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
  CourseAssignment,
  CourseAssignmentDocument,
  Submission,
  SubmissionDocument,
} from '../schemas';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  AssignmentDto,
  SubmissionDto,
  AssignmentIdDto,
} from '../dto';
import { Role } from '../../common/types/roles.enum';
import {
  transformToDto,
  transformToPaginatedDto,
} from '../../common/utils/transform.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';
import { CoursesService } from '../courses.service';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: PaginateModel<AssignmentDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    private coursesService: CoursesService,
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
    const filter: Record<string, any> = {
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
        } as any)
        .populate('files')
        .lean()
        .exec();
      const submissionMap = new Map<string, SubmissionDocument>(
        submissions.map((s: SubmissionDocument) => [
          String(s.assignment as any),
          s,
        ]),
      );

      paginatedDto.docs = paginatedDto.docs.map((dto) => {
        const sub = submissionMap.get(dto.id);
        dto.submission = sub
          ? transformToDto(SubmissionDto, {
              ...sub,
              assignmentId: String(sub.assignment as any),
              studentId: String(sub.student as any),
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

    const dto = transformToDto(AssignmentDto, assignment);

    if (role === Role.STUDENT && userId) {
      const submission = await this.submissionModel
        .findOne({
          student: new Types.ObjectId(userId),
          assignment: new Types.ObjectId(id),
        } as any)
        .populate('files')
        .lean()
        .exec();

      dto.submission = submission
        ? transformToDto(SubmissionDto, {
            ...submission,
            assignmentId: String(submission.assignment as any),
            studentId: String(submission.student as any),
          })
        : null;
    }

    return dto;
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
    const assignment = new this.assignmentModel({
      ...rest,
      courseAssignment: new Types.ObjectId(courseAssignmentId),
      group: ca.group,
      files: fileIds ? fileIds.map((id) => new Types.ObjectId(id)) : [],
    });

    const saved = await assignment.save();
    const populated = await saved.populate('files');
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
    const { page, limit } = paginationDto;
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
      } as any);
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
      options as any,
    );

    const paginatedDto = transformToPaginatedDto(AssignmentDto, result);
    const assignments = result.docs;

    const submissions = (await this.submissionModel
      .find({
        student: new Types.ObjectId(studentId),
        assignment: { $in: assignments.map((a) => a._id) },
      } as any)
      .populate('files')
      .lean()
      .exec()) as any[];

    const submissionMap = new Map<string, SubmissionDocument>(
      submissions.map((s) => [String(s.assignment), s]),
    );

    paginatedDto.docs = paginatedDto.docs.map((dto, index) => {
      const a = assignments[index];
      const ca = a?.courseAssignment as unknown as CourseAssignmentDocument & {
        course: { name: string };
      };

      dto.courseName = ca?.course?.name;
      dto.courseAssignmentId = String(ca?._id as any);

      const sub = submissionMap.get(dto.id);
      dto.submission = sub
        ? transformToDto(SubmissionDto, {
            ...sub,
            assignmentId: String(sub.assignment as any),
            studentId: String(sub.student as any),
          })
        : null;

      return dto;
    });

    return paginatedDto;
  }
}
