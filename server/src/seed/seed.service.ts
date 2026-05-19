import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import {
  UserSeeder,
  FacultySeeder,
  DepartmentSeeder,
  GroupSeeder,
  SpecialtySeeder,
  ClassroomSeeder,
  CourseSeeder,
  CourseAssignmentSeeder,
  GradeSeeder,
  AssignmentSeeder,
  MaterialSeeder,
} from './seeders';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly userSeeder: UserSeeder,
    private readonly facultySeeder: FacultySeeder,
    private readonly departmentSeeder: DepartmentSeeder,
    private readonly specialtySeeder: SpecialtySeeder,
    private readonly classroomSeeder: ClassroomSeeder,
    private readonly groupSeeder: GroupSeeder,
    private readonly courseSeeder: CourseSeeder,
    private readonly courseAssignmentSeeder: CourseAssignmentSeeder,
    private readonly gradeSeeder: GradeSeeder,
    private readonly assignmentSeeder: AssignmentSeeder,
    private readonly materialSeeder: MaterialSeeder,
  ) {}

  async onModuleInit() {
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
      await this.courseSeeder.seed();
      await this.courseAssignmentSeeder.seed();
      await this.gradeSeeder.seed();
      await this.assignmentSeeder.seed();
      await this.materialSeeder.seed();

      this.logger.log('Seeding process completed.');
    } catch (error) {
      this.logger.error('Error during seeding:', error);
    }
  }
}
