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
  Department,
  DepartmentSchema,
  Group,
  GroupSchema,
} from '../references/schemas';
import { User, UserSchema } from '../users/schemas';
import { UsersModule } from '../users/users.module';
import { ElectiveDisciplinesController } from './elective-disciplines.controller';
import { ElectiveDisciplinesService } from './elective-disciplines.service';
import {
  ElectiveDiscipline,
  ElectiveDisciplineSchema,
  ElectiveSelection,
  ElectiveSelectionPeriod,
  ElectiveSelectionPeriodSchema,
  ElectiveSelectionSchema,
} from './schemas';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    AuditLogModule,
    MongooseModule.forFeature([
      { name: ElectiveDiscipline.name, schema: ElectiveDisciplineSchema },
      {
        name: ElectiveSelectionPeriod.name,
        schema: ElectiveSelectionPeriodSchema,
      },
      { name: ElectiveSelection.name, schema: ElectiveSelectionSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Group.name, schema: GroupSchema },
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
  ],
  controllers: [ElectiveDisciplinesController],
  providers: [ElectiveDisciplinesService],
  exports: [ElectiveDisciplinesService],
})
export class ElectiveDisciplinesModule {}
