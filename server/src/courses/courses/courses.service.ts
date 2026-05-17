import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, PaginateModel } from 'mongoose';

import { CourseAssignmentDto, CourseDto } from './dto';
import { Role } from '../../common/types/roles.enum';
import { User, UserDocument } from '../../users/schemas';
import {
  Course,
  CourseAssignment,
  CourseAssignmentDocument,
  CourseDocument,
} from '../schemas';
import {
  transformToPaginatedDto,
} from '../../common/utils/transform.util';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedDto } from '../../common/dto/paginated.dto';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name) private courseModel: PaginateModel<CourseDocument>,
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

    if (role !== Role.ADMIN && String(ca.teacher as any) !== userId) {
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
}
