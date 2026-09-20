import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AcademicTerm } from '../../academic-terms/schemas/academic-term.schema';
import { academicTerms } from '../../common/mock-data';

@Injectable()
export class AcademicTermSeeder {
  private readonly logger = new Logger(AcademicTermSeeder.name);

  constructor(
    @InjectModel(AcademicTerm.name)
    private readonly termModel: Model<AcademicTerm>,
  ) {}

  async seed(): Promise<void> {
    if ((await this.termModel.countDocuments()) > 0) {
      this.logger.log('Academic terms already exist. Skipping seeding.');
      return;
    }
    await this.termModel.insertMany(
      academicTerms.map(({ id, startsAt, endsAt, ...rest }) => ({
        ...rest,
        _id: id,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        activatedAt: rest.status === 'current' ? new Date() : null,
      })),
    );
    this.logger.log(`Seeded ${academicTerms.length} academic terms.`);
  }
}
