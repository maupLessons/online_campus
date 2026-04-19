import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../database/schemas';
import {
  users,
  studentProfiles,
  teacherProfiles,
} from '../../common/mock-data';

@Injectable()
export class UserSeeder {
  private readonly logger = new Logger(UserSeeder.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async seed(): Promise<void> {
    const data = users.map((user) => {
      const studentProfile = studentProfiles.find((p) => p.userId === user.id);
      const teacherProfile = teacherProfiles.find((p) => p.userId === user.id);

      return {
        ...user,
        _id: user.id,
        studentProfile: studentProfile
          ? {
              group: studentProfile.groupId,
              recordBookNumber: studentProfile.recordBookNumber,
              year: studentProfile.year,
            }
          : undefined,
        teacherProfile: teacherProfile
          ? {
              department: teacherProfile.departmentId,
              position: teacherProfile.position,
            }
          : undefined,
      };
    });

    await this.userModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} users.`);
  }
}
