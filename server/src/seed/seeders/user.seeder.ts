import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../database/schemas/user.schema';
import { users } from '../../common/mock-data';

@Injectable()
export class UserSeeder {
  private readonly logger = new Logger(UserSeeder.name);

  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  async seed(): Promise<void> {
    const data = users.map((user) => ({
      ...user,
      _id: user.id,
    }));
    await this.userModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} users.`);
  }
}
