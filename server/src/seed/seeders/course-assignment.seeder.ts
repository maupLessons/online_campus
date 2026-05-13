import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CourseAssignment } from '../../courses/schemas';
import { courseAssignments } from '../../common/mock-data';

@Injectable()
export class CourseAssignmentSeeder {
  private readonly logger = new Logger(CourseAssignmentSeeder.name);

  constructor(
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignment>,
  ) {}

  async seed(): Promise<void> {
    const data = courseAssignments.map((ca) => ({
      ...ca,
      _id: ca.id,
      course: ca.courseId,
      group: ca.groupId,
      teacher: ca.teacherId,
    }));

    await this.courseAssignmentModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} course assignments.`);
  }
}
