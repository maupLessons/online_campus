import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Course,
  CourseAssignment,
  CourseAssignmentSchema,
  CourseSchema,
} from '../courses/schemas';
import { NotificationsModule } from '../notifications/notifications.module';
import { MaupStudentApiModule } from '../integrations/maup-student-api/maup-student-api.module';
import {
  Classroom,
  ClassroomSchema,
  Group,
  GroupSchema,
} from '../references/schemas';
import { User, UserSchema } from '../users/schemas';
import { ScheduleController } from './schedule.controller';
import { ScheduleExportService } from './schedule-export.service';
import { ScheduleMapper } from './schedule.mapper';
import { ScheduleMutationService } from './schedule-mutation.service';
import { ScheduleNotificationsService } from './schedule-notifications.service';
import { ScheduleReaderService } from './schedule-reader.service';
import { ScheduleService } from './schedule.service';
import { ScheduleTemplatesService } from './schedule-templates.service';
import { ScheduleValidationService } from './schedule-validation.service';
import { MaupScheduleService } from './maup-schedule.service';
import { ScheduleEntry, ScheduleEntrySchema } from './schemas';
import { ScheduleTemplate, ScheduleTemplateSchema } from './schemas';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AcademicAccessModule } from '../common/access/academic-access.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduleEntry.name, schema: ScheduleEntrySchema },
      { name: ScheduleTemplate.name, schema: ScheduleTemplateSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Group.name, schema: GroupSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    AuditLogModule,
    AcademicAccessModule,
    MaupStudentApiModule,
  ],
  controllers: [ScheduleController],
  providers: [
    ScheduleService,
    ScheduleMapper,
    ScheduleReaderService,
    ScheduleMutationService,
    ScheduleNotificationsService,
    ScheduleExportService,
    ScheduleTemplatesService,
    ScheduleValidationService,
    MaupScheduleService,
  ],
  exports: [ScheduleService],
})
export class ScheduleModule {}
