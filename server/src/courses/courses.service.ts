import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import { User, UserDocument } from '../users/schemas';
import {
  Course,
  CourseDocument,
  CourseAssignment,
  CourseAssignmentDocument,
} from './schemas';
import { CourseAssignmentDto } from './dto';
import { transformToDtoArray } from '../common/utils/transform.util';

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
  ) {}

  // ============ COURSES ============

  async findAllCourses(): Promise<Course[]> {
    return this.courseModel.find().populate('department').exec();
  }

  async findMy(userId: string, role: Role): Promise<CourseAssignmentDto[]> {
    if (role === Role.STUDENT) {
      return this.findCoursesByStudent(userId);
    }
    if (role === Role.TEACHER || role === Role.DEPARTMENT_HEAD) {
      return this.findCoursesByTeacher(userId);
    }
    const all = await this.courseAssignmentModel
      .find()
      .populate('course')
      .populate('teacher')
      .populate('group')
      .lean()
      .exec();

    return transformToDtoArray(CourseAssignmentDto, all);
  }

  async findCoursesByStudent(
    studentId: string,
  ): Promise<CourseAssignmentDto[]> {
    const user = await this.userModel.findById(studentId).lean().exec();
    if (!user || !user.studentProfile) return [];

    const cas = await this.courseAssignmentModel
      .find({ group: user.studentProfile.group })
      .populate('course')
      .populate('teacher')
      .lean()
      .exec();

    return transformToDtoArray(CourseAssignmentDto, cas);
  }

  async findCoursesByTeacher(
    teacherId: string,
  ): Promise<CourseAssignmentDto[]> {
    const cas = await this.courseAssignmentModel
      .find({ teacher: new Types.ObjectId(teacherId) })
      .populate('course')
      .populate({
        path: 'group',
        populate: { path: 'specialty' },
      })
      .populate('teacher')
      .lean()
      .exec();

    return transformToDtoArray(CourseAssignmentDto, cas);
  }
}
