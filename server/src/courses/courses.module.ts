import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { CoursesController } from './courses/courses.controller';
import { CoursesService } from './courses/courses.service';
import { CoursesAccessService } from './courses-access.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AcademicAccessModule } from '../common/access/academic-access.module';
import { AcademicTermsModule } from '../academic-terms/academic-terms.module';
import { UsersModule } from '../users/users.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { User, UserSchema } from '../users/schemas';
import {
  Department,
  DepartmentSchema,
  Faculty,
  FacultySchema,
} from '../references/schemas';
import {
  Course,
  CourseSchema,
  CourseAssignment,
  CourseAssignmentSchema,
} from './schemas';

@Module({
  imports: [
    ConfigModule,
    NotificationsModule,
    AuditLogModule,
    AcademicAccessModule,
    AcademicTermsModule,
    UsersModule,
    ScheduleModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Faculty.name, schema: FacultySchema },
    ]),
  ],
  controllers: [CoursesController],
  providers: [CoursesService, CoursesAccessService],
  exports: [CoursesService, CoursesAccessService],
})
export class CoursesModule {}
