import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Assignment,
  AssignmentSchema,
  Course,
  CourseAssignment,
  CourseAssignmentSchema,
  CourseSchema,
} from '../courses/schemas';
import {
  ElectiveDiscipline,
  ElectiveDisciplineSchema,
  ElectiveSelection,
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodSchema,
  ElectiveSelectionSchema,
} from '../elective-disciplines/schemas';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema';
import { AcademicAccessModule } from '../common/access/academic-access.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { ScheduleEntry, ScheduleEntrySchema } from '../schedule/schemas';
import { Survey, SurveySchema } from '../surveys/schemas';
import { User, UserSchema } from '../users/schemas';
import { ReferencesController } from './references.controller';
import {
  Classroom,
  ClassroomSchema,
  Department,
  DepartmentSchema,
  Faculty,
  FacultySchema,
  Group,
  GroupSchema,
  Specialty,
  SpecialtySchema,
} from './schemas';
import { GroupsService } from './groups.service';
import { ClassroomsService } from './classrooms.service';
import { DepartmentsService } from './departments.service';
import { FacultiesService } from './faculties.service';
import { SpecialtiesService } from './specialties.service';
import { ReferenceIntegrityService } from './reference-integrity.service';
import { ReferenceRelationsService } from './reference-relations.service';
import { ReferencesAdminService } from './references-admin.service';
import { ReferencesExportService } from './references-export.service';
import { ReferencesImportService } from './references-import.service';
import { ReferencesAccessService } from './references-access.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Group.name, schema: GroupSchema },
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Faculty.name, schema: FacultySchema },
      { name: Specialty.name, schema: SpecialtySchema },
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Survey.name, schema: SurveySchema },
      { name: ElectiveDiscipline.name, schema: ElectiveDisciplineSchema },
      {
        name: ElectiveSelectionPeriod.name,
        schema: ElectiveSelectionPeriodSchema,
      },
      { name: ElectiveSelection.name, schema: ElectiveSelectionSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: ScheduleEntry.name, schema: ScheduleEntrySchema },
    ]),
    ScheduleModule,
    AcademicAccessModule,
  ],
  controllers: [ReferencesController],
  providers: [
    ReferenceIntegrityService,
    ReferenceRelationsService,
    ReferencesAdminService,
    ReferencesExportService,
    ReferencesImportService,
    ReferencesAccessService,
    GroupsService,
    ClassroomsService,
    DepartmentsService,
    FacultiesService,
    SpecialtiesService,
  ],
})
export class ReferencesModule {}
