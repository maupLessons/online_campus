import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../database/schemas';
import {
  UserSeeder,
  FacultySeeder,
  DepartmentSeeder,
  GroupSeeder,
  StudentProfileSeeder,
  TeacherProfileSeeder,
} from './seeders';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly userSeeder: UserSeeder,
    private readonly facultySeeder: FacultySeeder,
    private readonly departmentSeeder: DepartmentSeeder,
    private readonly groupSeeder: GroupSeeder,
    private readonly studentProfileSeeder: StudentProfileSeeder,
    private readonly teacherProfileSeeder: TeacherProfileSeeder,
  ) {}

  async onModuleInit() {
    this.logger.log('Checking database for seeding...');
    await this.seed();
  }

  private async seed() {
    const userCount = await this.userModel.countDocuments();
    if (userCount > 0) {
      this.logger.log('Database is not empty. Skipping seed.');
      return;
    }

    this.logger.log('Database is empty. Seeding data...');

    try {
      await this.userSeeder.seed();
      await this.facultySeeder.seed();
      await this.departmentSeeder.seed();
      await this.groupSeeder.seed();
      await this.teacherProfileSeeder.seed();
      await this.studentProfileSeeder.seed();

      this.logger.log('Seeding completed successfully.');
    } catch (error) {
      this.logger.error('Error during seeding:', error);
    }
  }
}
