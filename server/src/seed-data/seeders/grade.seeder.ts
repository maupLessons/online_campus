import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Grade } from '../../courses/schemas';
import { grades } from '../../common/mock-data';

@Injectable()
export class GradeSeeder {
  private readonly logger = new Logger(GradeSeeder.name);

  constructor(
    @InjectModel(Grade.name)
    private readonly gradeModel: Model<Grade>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.gradeModel.countDocuments();
    if (count > 0) {
      this.logger.log('Grades already exist. Skipping seeding.');
      return;
    }

    const data = grades.map((grade) => ({
      ...grade,
      _id: grade.id,
      student: grade.studentId,
      courseAssignment: grade.courseAssignmentId,
      date: new Date(grade.date),
    }));

    await this.gradeModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} grades.`);
  }
}
