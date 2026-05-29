import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { User, UserSchema } from '../users/schemas';
import {
  Faculty,
  FacultySchema,
  Department,
  DepartmentSchema,
  Group,
  GroupSchema,
  Specialty,
  SpecialtySchema,
  Classroom,
  ClassroomSchema,
} from '../references/schemas';
import {
  UserSeeder,
  FacultySeeder,
  DepartmentSeeder,
  GroupSeeder,
  SpecialtySeeder,
  ClassroomSeeder,
  CourseSeeder,
  CourseAssignmentSeeder,
  ScheduleEntrySeeder,
  GradeSeeder,
  AssignmentSeeder,
  MaterialSeeder,
} from './seeders';
import {
  Course,
  CourseSchema,
  CourseAssignment,
  CourseAssignmentSchema,
  Grade,
  GradeSchema,
  Assignment,
  AssignmentSchema,
  Material,
  MaterialSchema,
} from '../courses/schemas';
import { ScheduleEntry, ScheduleEntrySchema } from '../schedule/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Faculty.name, schema: FacultySchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Group.name, schema: GroupSchema },
      { name: Specialty.name, schema: SpecialtySchema },
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: ScheduleEntry.name, schema: ScheduleEntrySchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Material.name, schema: MaterialSchema },
    ]),
  ],
  providers: [
    SeedService,
    UserSeeder,
    FacultySeeder,
    DepartmentSeeder,
    GroupSeeder,
    SpecialtySeeder,
    ClassroomSeeder,
    CourseSeeder,
    CourseAssignmentSeeder,
    ScheduleEntrySeeder,
    GradeSeeder,
    AssignmentSeeder,
    MaterialSeeder,
  ],
})
export class SeedModule {}
