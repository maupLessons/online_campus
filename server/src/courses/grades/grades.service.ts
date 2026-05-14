import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas';
import {
  Grade,
  GradeDocument,
  CourseAssignment,
  CourseAssignmentDocument,
} from '../schemas';

@Injectable()
export class GradesService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
  ) {}

  async findGradesByStudent(studentId: string): Promise<GradeDocument[]> {
    return this.gradeModel
      .find({ student: new Types.ObjectId(studentId) } as any)
      .populate({
        path: 'courseAssignment',
        populate: { path: 'course' },
      })
      .exec();
  }

  async findGradesByCourseAssignment(
    courseAssignmentId: string,
  ): Promise<any[]> {
    const ca = await this.courseAssignmentModel
      .findById(courseAssignmentId)
      .populate('group')
      .lean()
      .exec();
    if (!ca) return [];

    const students = await this.userModel
      .find({ 'studentProfile.group': ca.group._id } as any)
      .lean()
      .exec();

    const grades = await this.gradeModel
      .find({
        courseAssignment: new Types.ObjectId(courseAssignmentId),
      } as any)
      .lean()
      .exec();

    return students.map((s) => {
      const studentGrades = grades.filter(
        (g) => g.student.toString() === s._id.toString(),
      );
      return {
        studentId: s._id,
        studentName: `${s.lastName} ${s.firstName}`,
        grades: studentGrades,
      };
    });
  }
}
