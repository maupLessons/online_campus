import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Course,
  CourseAssignment,
  CourseAssignmentSchema,
  CourseSchema,
} from '../courses/schemas';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  Classroom,
  ClassroomSchema,
  Group,
  GroupSchema,
} from '../references/schemas';
import { User, UserSchema } from '../users/schemas';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { ScheduleEntry, ScheduleEntrySchema } from './schemas';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduleEntry.name, schema: ScheduleEntrySchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Classroom.name, schema: ClassroomSchema },
      { name: Group.name, schema: GroupSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    AuditLogModule,
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}
