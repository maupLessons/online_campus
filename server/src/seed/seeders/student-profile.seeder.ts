import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StudentProfile } from '../../database/schemas/student-profile.schema';
import { studentProfiles } from '../../common/mock-data';

@Injectable()
export class StudentProfileSeeder {
  private readonly logger = new Logger(StudentProfileSeeder.name);

  constructor(
    @InjectModel(StudentProfile.name)
    private readonly studentProfileModel: Model<StudentProfile>,
  ) {}

  async seed(): Promise<void> {
    const data = studentProfiles.map((profile) => ({
      ...profile,
      user: profile.userId,
      group: profile.groupId,
    }));
    await this.studentProfileModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} student profiles.`);
  }
}
