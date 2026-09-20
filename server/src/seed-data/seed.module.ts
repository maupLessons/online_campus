import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { AcademicTermsModule } from '../academic-terms/academic-terms.module';
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
  AcademicTermSeeder,
  CourseSeeder,
  CourseAssignmentSeeder,
  ScheduleSnapshotSeeder,
  ElectiveSurveyDemoSeeder,
} from './seeders';
import {
  Course,
  CourseSchema,
  CourseAssignment,
  CourseAssignmentSchema,
} from '../courses/schemas';
import { ScheduleSnapshot, ScheduleSnapshotSchema } from '../schedule/schemas';
import {
  AcademicTerm,
  AcademicTermSchema,
} from '../academic-terms/schemas/academic-term.schema';
import {
  ElectiveDiscipline,
  ElectiveDisciplineSchema,
  ElectiveSelection,
  ElectiveSelectionSchema,
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodSchema,
} from '../elective-disciplines/schemas';
import {
  Survey,
  SurveySchema,
  SurveyQuestion,
  SurveyQuestionSchema,
} from '../surveys/schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Faculty.name, schema: FacultySchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Group.name, schema: GroupSchema },
      { name: Specialty.name, schema: SpecialtySchema },
      { name: Classroom.name, schema: ClassroomSchema },
      { name: AcademicTerm.name, schema: AcademicTermSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: ScheduleSnapshot.name, schema: ScheduleSnapshotSchema },
      { name: ElectiveDiscipline.name, schema: ElectiveDisciplineSchema },
      {
        name: ElectiveSelectionPeriod.name,
        schema: ElectiveSelectionPeriodSchema,
      },
      { name: ElectiveSelection.name, schema: ElectiveSelectionSchema },
      { name: Survey.name, schema: SurveySchema },
      { name: SurveyQuestion.name, schema: SurveyQuestionSchema },
    ]),
    AcademicTermsModule,
  ],
  providers: [
    SeedService,
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
  ],
})
export class SeedModule {}
