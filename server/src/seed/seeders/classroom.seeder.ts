import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Classroom } from '../../database/schemas';
import { classrooms } from '../../common/mock-data';

@Injectable()
export class ClassroomSeeder {
  private readonly logger = new Logger(ClassroomSeeder.name);

  constructor(
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
  ) {}

  async seed(): Promise<void> {
    const data = classrooms.map((classroom) => ({
      ...classroom,
      _id: classroom.id,
    }));

    await this.classroomModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} classrooms.`);
  }
}
