import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel } from 'mongoose';

import { CourseAssignmentDto, CourseDto } from './dto';
import { Role } from '../../common/types/roles.enum';
import { toId } from '../../common/utils/to-id.util';
import { User, UserDocument } from '../../users/schemas';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseDocument,
} from '../schemas';
import {
  transformToPaginatedDto,
  transformToDto,
} from '../../common/utils/transform.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name)
    private courseModel: PaginateModel<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: PaginateModel<CourseAssignmentDocument>,
  ) {}

  async validateOwnership(
    courseAssignmentId: string,
    userId: string,
    role: Role,
  ): Promise<CourseAssignmentDocument> {
    const ca = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .exec();

    if (!ca) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }

    if (role !== Role.ADMIN && toId(ca.teacher) !== userId) {
      throw new ForbiddenException('Ви не є викладачем цього курсу');
    }

    return ca;
  }

  async findAllCourses(
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseDto>> {
    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      sort: { name: 1 },
      lean: true,
    };

    const result = await this.courseModel.paginate({}, options as any);
    return transformToPaginatedDto(CourseDto, result);
  }

  async findCourseById(id: string): Promise<CourseDto> {
    const course = await this.courseModel.findById(id).lean().exec();
    if (!course) {
      throw new NotFoundException('Курс не знайдено');
    }
    return transformToDto(CourseDto, course);
  }

  async findCourseAssignmentById(id: string): Promise<CourseAssignmentDto> {
    const ca = await this.courseAssignmentModel
      .findById(id)
      .populate([
        'course',
        'teacher',
        {
          path: 'group',
          populate: { path: 'specialty' },
        },
      ])
      .lean()
      .exec();

    if (!ca) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }
    return transformToDto(CourseAssignmentDto, ca);
  }

  async findMy(
    userId: string,
    role: Role,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    if (role === Role.STUDENT) {
      return this.findCoursesByStudent(userId, pagination);
    }
    if (role === Role.TEACHER || role === Role.DEPARTMENT_HEAD) {
      return this.findCoursesByTeacher(userId, pagination);
    }

    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: ['course', 'teacher', 'group'],
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      {},
      options as any,
    );
    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async findCoursesByStudent(
    studentId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const user = await this.userModel.findById(studentId).lean().exec();
    if (!user || !user.studentProfile) {
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
      populate: ['course', 'teacher'],
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      { group: user.studentProfile.group },
      options as any,
    );

    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async findCoursesByTeacher(
    teacherId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedDto<CourseAssignmentDto>> {
    const options = {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      populate: [
        'course',
        'teacher',
        {
          path: 'group',
          populate: { path: 'specialty' },
        },
      ],
      lean: true,
    };

    const result = await this.courseAssignmentModel.paginate(
      { teacher: new Types.ObjectId(teacherId) },
      options as any,
    );

    return transformToPaginatedDto(CourseAssignmentDto, result);
  }

  async isUserAssignedToCourseTargets(params: {
    userId: string;
    role: Role;
    targetIds: string[];
    groupId?: string | null;
  }): Promise<boolean> {
    const objectIds = params.targetIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return false;
    }

    const targetFilter: Record<string, unknown> = {
      $or: [{ _id: { $in: objectIds } }, { course: { $in: objectIds } }],
    };

    if (params.role === Role.TEACHER) {
      if (!Types.ObjectId.isValid(params.userId)) {
        return false;
      }

      const match = await this.courseAssignmentModel
        .exists({
          ...targetFilter,
          teacher: new Types.ObjectId(params.userId),
        } as never)
        .exec();

      return match !== null;
    }

    if (params.role === Role.STUDENT) {
      if (!params.groupId || !Types.ObjectId.isValid(params.groupId)) {
        return false;
      }

      const match = await this.courseAssignmentModel
        .exists({
          ...targetFilter,
          group: new Types.ObjectId(params.groupId),
        } as never)
        .exec();

      return match !== null;
    }

    return false;
  }

  async findUserIdsByCourseTargets(targetIds: string[]): Promise<string[]> {
    const courseAssignments = await this.findCourseTargetAssignments(targetIds);

    const teacherIds = courseAssignments.map((assignment) =>
      toId(assignment.teacher),
    );
    const groupIds = [
      ...new Set(courseAssignments.map((assignment) => toId(assignment.group))),
    ]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (groupIds.length === 0) {
      return [...new Set(teacherIds)];
    }

    const studentFilter: Record<string, unknown> = {
      'studentProfile.group': { $in: groupIds },
    };
    const students = await this.userModel
      .find(studentFilter as never)
      .select('_id')
      .lean()
      .exec();
    const studentIds = students.map((student) => toId(student._id));

    return [...new Set([...teacherIds, ...studentIds])];
  }

  async findStudentIdsByCourseTargets(targetIds: string[]): Promise<string[]> {
    const courseAssignments = await this.findCourseTargetAssignments(targetIds);
    const groupIds = [
      ...new Set(courseAssignments.map((assignment) => toId(assignment.group))),
    ]
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (groupIds.length === 0) {
      return [];
    }

    const studentFilter: Record<string, unknown> = {
      role: Role.STUDENT,
      status: 'active',
      'studentProfile.group': { $in: groupIds },
    };
    const students = await this.userModel
      .find(studentFilter as never)
      .select('_id')
      .lean()
      .exec();
    const studentIds = students.map((student) => toId(student._id));

    return [...new Set(studentIds)];
  }

  private async findCourseTargetAssignments(targetIds: string[]) {
    const objectIds = targetIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return [];
    }

    const assignmentFilter: Record<string, unknown> = {
      $or: [{ _id: { $in: objectIds } }, { course: { $in: objectIds } }],
    };

    return this.courseAssignmentModel
      .find(assignmentFilter as never)
      .select('teacher group')
      .lean()
      .exec();
  }
}
