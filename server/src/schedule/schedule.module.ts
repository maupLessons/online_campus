import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcademicTermsModule } from '../academic-terms/academic-terms.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AcademicAccessModule } from '../common/access/academic-access.module';
import { CourseAssignment, CourseAssignmentSchema } from '../courses/schemas';
import { MaupStudentApiModule } from '../integrations/maup-student-api/maup-student-api.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Group, GroupSchema } from '../references/schemas';
import { User, UserSchema } from '../users/schemas';
import { UsersModule } from '../users/users.module';
import { OnlineLessonLinksService } from './online-lesson-links.service';
import { ScheduleChangeNotifierService } from './schedule-change-notifier.service';
import { ScheduleDiffService } from './schedule-diff.service';
import { ScheduleExportService } from './schedule-export.service';
import { ScheduleReaderService } from './schedule-reader.service';
import { ScheduleSnapshotService } from './schedule-snapshot.service';
import { ScheduleController } from './schedule.controller';
import { ScheduleService } from './schedule.service';
import {
  OnlineLessonLink,
  OnlineLessonLinkSchema,
  ScheduleSnapshot,
  ScheduleSnapshotSchema,
} from './schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ScheduleSnapshot.name, schema: ScheduleSnapshotSchema },
      { name: OnlineLessonLink.name, schema: OnlineLessonLinkSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Group.name, schema: GroupSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    AuditLogModule,
    MaupStudentApiModule,
    AcademicTermsModule,
    UsersModule,
    // Spec §9.1: the schedule no longer uses findVisibleCourseAssignmentIds,
    // but AcademicAccessService stays — for canAccessGroup (§8, scope of the group view).
    AcademicAccessModule,
  ],
  controllers: [ScheduleController],
  providers: [
    ScheduleService,
    ScheduleReaderService,
    ScheduleSnapshotService,
    ScheduleDiffService,
    ScheduleChangeNotifierService,
    OnlineLessonLinksService,
    ScheduleExportService,
  ],
  exports: [ScheduleService],
})
export class ScheduleModule {
  constructor(
    snapshots: ScheduleSnapshotService,
    notifier: ScheduleChangeNotifierService,
  ) {
    snapshots.setRefreshListener((event) => notifier.handleRefresh(event));
  }
}
