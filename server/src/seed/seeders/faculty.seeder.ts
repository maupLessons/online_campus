import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Faculty } from '../../database/schemas/faculty.schema';
import { faculties } from '../../common/mock-data';

@Injectable()
export class FacultySeeder {
  private readonly logger = new Logger(FacultySeeder.name);

  constructor(
    @InjectModel(Faculty.name) private readonly facultyModel: Model<Faculty>,
  ) {}

  async seed(): Promise<void> {
    const data = faculties.map((faculty) => ({
      ...faculty,
      _id: faculty.id,
      dean: faculty.deanUserId,
    }));
    await this.facultyModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} faculties.`);
  }
}
