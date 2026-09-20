import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas';
import {
  UserSeeder,
  FacultySeeder,
  DepartmentSeeder,
  GroupSeeder,
  SpecialtySeeder,
  ClassroomSeeder,
  AcademicTermSeeder,
  CourseSeeder,
  CourseAssignmentSeeder,
  ScheduleSnapshotSeeder,
  ElectiveSurveyDemoSeeder,
} from './seeders';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly userSeeder: UserSeeder,
    private readonly facultySeeder: FacultySeeder,
    private readonly departmentSeeder: DepartmentSeeder,
    private readonly specialtySeeder: SpecialtySeeder,
    private readonly classroomSeeder: ClassroomSeeder,
    private readonly groupSeeder: GroupSeeder,
    private readonly academicTermSeeder: AcademicTermSeeder,
    private readonly courseSeeder: CourseSeeder,
    private readonly courseAssignmentSeeder: CourseAssignmentSeeder,
    private readonly scheduleSnapshotSeeder: ScheduleSnapshotSeeder,
    // Optional: seed.service.spec.ts constructs SeedService directly without this
    // argument (undefined), so the call below is guarded with `?.`.
    private readonly electiveSurveyDemoSeeder?: ElectiveSurveyDemoSeeder,
  ) {}

  async onModuleInit() {
    if (!this.isDemoSeedEnabled()) {
      this.logger.log(
        'Demo database seeding is disabled. Set SEED_DEMO_DATA=true only for local development fixtures.',
      );
      await this.warnWhenLocalDatabaseHasNoUsers();
      return;
    }

    if (this.isProduction() && !this.isProductionDemoSeedAllowed()) {
      this.logger.warn(
        'Demo database seeding was requested in production and blocked. Set SEED_DEMO_DATA_IN_PRODUCTION=true only for disposable demo environments.',
      );
      return;
    }

    this.logger.log('Checking database for seeding...');
    await this.seed();
  }

  private async seed() {
    this.logger.log('Starting seeding process...');

    try {
      await this.userSeeder.seed();
      await this.facultySeeder.seed();
      await this.departmentSeeder.seed();
      await this.specialtySeeder.seed();
      await this.classroomSeeder.seed();
      await this.groupSeeder.seed();
      await this.academicTermSeeder.seed();
      await this.courseSeeder.seed();
      await this.courseAssignmentSeeder.seed();
      await this.scheduleSnapshotSeeder.seed();
      await this.electiveSurveyDemoSeeder?.seed();

      this.logger.log('Seeding process completed.');
    } catch (error) {
      this.logger.error('Error during seeding:', error);
      throw error;
    }
  }

  private async warnWhenLocalDatabaseHasNoUsers(): Promise<void> {
    if (this.isProduction()) {
      return;
    }

    const userCount = await this.userModel.estimatedDocumentCount().exec();

    if (userCount === 0) {
      this.logger.warn(
        'No users found in MongoDB while demo seeding is disabled. Fresh local installations cannot log in until demo fixtures are seeded or an administrator account is created.',
      );
    }
  }

  private isDemoSeedEnabled(): boolean {
    return isTruthy(this.configService.get<string>('SEED_DEMO_DATA'));
  }

  private isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  private isProductionDemoSeedAllowed(): boolean {
    return isTruthy(
      this.configService.get<string>('SEED_DEMO_DATA_IN_PRODUCTION'),
    );
  }
}

function isTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value ?? '').toLowerCase());
}
