import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AcademicAccessModule } from '../common/access/academic-access.module';
import {
  CourseAssignment,
  CourseAssignmentSchema,
  Grade,
  GradeSchema,
  LessonJournalEntry,
  LessonJournalEntrySchema,
} from '../courses/schemas';
import { User, UserSchema } from '../users/schemas';
import { ReportsAnalyticsService } from './reports-analytics.service';
import { ReportsController } from './reports.controller';
import { ReportsExportService } from './reports-export.service';
import { ReportsScopeService } from './reports-scope.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    AuditLogModule,
    AcademicAccessModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: LessonJournalEntry.name, schema: LessonJournalEntrySchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsScopeService,
    ReportsAnalyticsService,
    ReportsExportService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
