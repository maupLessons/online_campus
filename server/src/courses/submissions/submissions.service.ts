import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Submission, SubmissionDocument } from '../schemas';

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
  ) {}

  async findSubmissions(assignmentId: string): Promise<SubmissionDocument[]> {
    return this.submissionModel
      .find({ assignment: new Types.ObjectId(assignmentId) } as any)
      .populate('student')
      .exec();
  }
}
