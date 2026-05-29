import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Specialty } from '../../references/schemas';
import { specialties } from '../../common/mock-data';

@Injectable()
export class SpecialtySeeder {
  private readonly logger = new Logger(SpecialtySeeder.name);

  constructor(
    @InjectModel(Specialty.name)
    private readonly specialtyModel: Model<Specialty>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.specialtyModel.countDocuments();
    if (count > 0) {
      this.logger.log('Specialties already exist. Skipping seeding.');
      return;
    }

    const data = specialties.map((specialty) => ({
      ...specialty,
      _id: specialty.id,
    }));

    await this.specialtyModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} specialties.`);
  }
}
