import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas';
import {
  Assignment,
  AssignmentDocument,
  CourseAssignment,
  CourseAssignmentDocument,
  Submission,
  SubmissionDocument,
} from '../schemas';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
  ) {}

  async findAssignments(
    courseAssignmentId: string,
  ): Promise<AssignmentDocument[]> {
    return this.assignmentModel
      .find({
        courseAssignment: new Types.ObjectId(courseAssignmentId),
      } as any)
      .exec();
  }

  async findAssignmentsByStudent(studentId: string): Promise<any[]> {
    const user = await this.userModel.findById(studentId).lean().exec();
    if (!user || !user.studentProfile) return [];

    const caIds = await this.courseAssignmentModel
      .find({ group: user.studentProfile.group })
      .distinct('_id');

    const assignments = await this.assignmentModel
      .find({ courseAssignment: { $in: caIds } } as any)
      .populate({
        path: 'courseAssignment',
        populate: { path: 'course' },
      })
      .lean()
      .exec();

    const submissions = await this.submissionModel
      .find({
        student: new Types.ObjectId(studentId),
        assignment: { $in: assignments.map((a) => a._id) },
      } as any)
      .lean()
      .exec();

    return assignments.map((a) => {
      const sub = submissions.find(
        (s) => s.assignment.toString() === a._id.toString(),
      );
      return {
        ...a,
        courseName: (a.courseAssignment as any)?.course?.name,
        submission: sub || null,
      };
    });
  }
}
