import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Course } from '../../courses/schemas';
import { courses } from '../../common/mock-data';

@Injectable()
export class CourseSeeder {
  private readonly logger = new Logger(CourseSeeder.name);

  constructor(
    @InjectModel(Course.name)
    private readonly courseModel: Model<Course>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.courseModel.countDocuments();
    if (count > 0) {
      this.logger.log('Courses already exist. Skipping seeding.');
      return;
    }

    const data = courses.map((course) => ({
      ...course,
      _id: course.id,
      department: course.departmentId,
    }));

    await this.courseModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} courses.`);
  }
}
