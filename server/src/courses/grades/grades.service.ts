import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel } from 'mongoose';
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
    await this.coursesService.validateOwnership(
      toId(assignment.courseAssignment),
      userId,
      role,
    );

    submission.score = dto.score;
    submission.comment = dto.comment ?? '';
    submission.status = 'graded';

    const saved = await submission.save();
    const populated = await saved.populate('files');
    return transformToDto(SubmissionDto, populated.toObject());
  }

  async create(
    dto: CreateGradeDto,
    userId: string,
    role: Role,
  ): Promise<GradeResponseDto> {
    await this.coursesService.validateOwnership(
      dto.courseAssignmentId,
      userId,
      role,
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
    const grade = await this.gradeModel.findById(id).exec();
    if (!grade) {
      throw new NotFoundException('Оцінку не знайдено');
    }

    await this.coursesService.validateOwnership(
      toId(grade.courseAssignment),
      userId,
      role,
    );

    if (dto.type) grade.type = dto.type;
    if (dto.value !== undefined) grade.value = dto.value;
    if (dto.comment !== undefined) grade.comment = dto.comment;

    const saved = await grade.save();
    const populated = await saved.populate({
      path: 'courseAssignment',
      populate: { path: 'course' },
    });

    return transformToDto(GradeResponseDto, populated.toObject());
  }

  async remove(
    id: string,
    userId: string,
    role: Role,
  ): Promise<{ id: string }> {
    const grade = await this.gradeModel.findById(id).exec();
    if (!grade) {
      throw new NotFoundException('Оцінку не знайдено');
    }

    await this.coursesService.validateOwnership(
      toId(grade.courseAssignment),
      userId,
      role,
    );

    await this.gradeModel.findByIdAndDelete(id).exec();
    return { id };
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

    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: 'course',
      sort: { 'course.name': 1 },
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      { group: groupId },
      options,
    );

    return transformToPaginatedDto(StudentCourseResponseDto, result);
  }

  async findStudentGradesByCourse(
    studentId: string,
    courseAssignmentId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<GradeResponseDto>> {
    const { page, limit } = pagination;
    const options = {
      page,
      limit,
      sort: { date: -1 },
      populate: {
        path: 'courseAssignment',
        populate: { path: 'course' },
      },
      lean: true,
    };

    const result = await this.gradeModel.paginate(
      {
        student: new Types.ObjectId(studentId),
        courseAssignment: new Types.ObjectId(courseAssignmentId),
      },
      options,
    );

    return transformToPaginatedDto(GradeResponseDto, result);
  }

  async findGradesByCourseAssignment(
    courseAssignmentId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<GradeJournalResponseDto>> {
    const ca = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .populate('group')
      .lean()
      .exec();
    if (!ca) {
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

    const { page, limit } = pagination;
    const studentOptions = {
      page: page || 1,
      limit: limit || 10,
      lean: true,
      sort: { lastName: 1, firstName: 1 },
    };

    const studentResult = await this.userModel.paginate(
      { 'studentProfile.group': toId(ca.group) },
      studentOptions,
    );

    const studentIds = studentResult.docs.map((s) => s._id);

    const grades = await this.gradeModel
      .find({
        courseAssignment: new Types.ObjectId(courseAssignmentId),
        student: { $in: studentIds },
      } as never)
      .populate({
        path: 'courseAssignment',
        populate: { path: 'course' },
      })
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
