import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Department } from '../../database/schemas';
import { departments } from '../../common/mock-data';

@Injectable()
export class DepartmentSeeder {
  private readonly logger = new Logger(DepartmentSeeder.name);

  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<Department>,
  ) {}

  async seed(): Promise<void> {
    const data = departments.map((dep) => ({
      ...dep,
      _id: dep.id,
      faculty: dep.facultyId,
      head: dep.headUserId,
    }));
    await this.departmentModel.insertMany(data);
    this.logger.log(`Seeded ${data.length} departments.`);
  }
}
