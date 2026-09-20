import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../../users/schemas';
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
    const count = await this.userModel.countDocuments();
    if (count > 0) {
      this.logger.log('Users already exist. Skipping seeding.');
      return;
    }

    const data = users.map((user) => {
      const profiles = studentProfiles.filter((p) => p.userId === user.id);
      const teacherProfile = teacherProfiles.find((p) => p.userId === user.id);

      const built = profiles.map((p) => ({
        _id: new Types.ObjectId(),
        externalStudentId: p.externalStudentId,
        group: p.groupId,
        recordBookNumber: p.recordBookNumber,
        year: p.year,
        studyForm: p.studyForm,
        institute: p.institute,
        specialty: p.specialty,
        status: 'active',
        syncedAt: new Date(),
      }));

      return {
        ...user,
        _id: user.id,
        studentProfiles: built,
        activeStudentProfileId: built[0]?._id ?? null,
        teacherProfile: teacherProfile
          ? {
              department: teacherProfile.departmentId,
              position: teacherProfile.position,
              externalTeacherId: teacherProfile.externalTeacherId,
            }
          : undefined,
      };
    });

    await this.userModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} users.`);
  }
}
