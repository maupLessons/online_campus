import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Group } from '../../references/schemas';
import { groups } from '../../common/mock-data';

@Injectable()
export class GroupSeeder {
  private readonly logger = new Logger(GroupSeeder.name);

  constructor(
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.groupModel.countDocuments();
    if (count > 0) {
      this.logger.log('Groups already exist. Skipping seeding.');
      return;
    }

    const data = groups.map((group) => ({
      ...group,
      _id: group.id,
    }));
    await this.groupModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} groups.`);
  }
}
