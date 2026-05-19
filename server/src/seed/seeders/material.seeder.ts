import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Material } from '../../courses/schemas';
import { materials } from '../../common/mock-data';

@Injectable()
export class MaterialSeeder {
  private readonly logger = new Logger(MaterialSeeder.name);

  constructor(
    @InjectModel(Material.name)
    private readonly materialModel: Model<Material>,
  ) {}

  async seed(): Promise<void> {
    const count = await this.materialModel.countDocuments();
    if (count > 0) {
      this.logger.log('Materials already exist. Skipping seeding.');
      return;
    }

    const data = materials.map((material) => ({
      _id: material.id,
      courseAssignment: material.courseAssignmentId,
      title: material.title,
      description: material.description,
      publishDate: new Date(material.publishDate),
      files: [],
    }));

    await this.materialModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} materials.`);
  }
}
