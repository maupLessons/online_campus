import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Assignment, CourseAssignment } from '../../courses/schemas';
import { assignments, courseAssignments } from '../../common/mock-data';

@Injectable()
export class AssignmentSeeder {
  private readonly logger = new Logger(AssignmentSeeder.name);

  constructor(
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<Assignment>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignment>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.assignmentModel.countDocuments();
    if (count > 0) {
      this.logger.log('Assignments already exist. Skipping seeding.');
      return;
    }

    const data = assignments.map((assignment) => {
      const ca = courseAssignments.find(
        (c) => c.id === assignment.courseAssignmentId,
      );

      return {
        ...assignment,
        _id: assignment.id,
        courseAssignment: assignment.courseAssignmentId,
        group: ca ? ca.groupId : undefined,
        dueDate: new Date(assignment.dueDate),
      };
    });

    await this.assignmentModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} assignments.`);
  }
}
