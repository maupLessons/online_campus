import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TeacherProfile } from '../../database/schemas/teacher-profile.schema';
import { teacherProfiles } from '../../common/mock-data';

@Injectable()
export class TeacherProfileSeeder {
  private readonly logger = new Logger(TeacherProfileSeeder.name);

  constructor(
    @InjectModel(TeacherProfile.name)
    private readonly teacherProfileModel: Model<TeacherProfile>,
  ) {}

  async seed(): Promise<void> {
    const data = teacherProfiles.map((profile) => ({
      ...profile,
      user: profile.userId,
      department: profile.departmentId,
    }));
    await this.teacherProfileModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} teacher profiles.`);
  }
}
