import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcademicTermsModule } from '../academic-terms/academic-terms.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AcademicAccessModule } from '../common/access/academic-access.module';
import { CourseAssignment, CourseAssignmentSchema } from '../courses/schemas';
import { User, UserSchema } from '../users/schemas';
import { ReportsController } from './reports.controller';
import { ReportsExportService } from './reports-export.service';
import { ReportsScopeService } from './reports-scope.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    AuditLogModule,
    AcademicAccessModule,
    AcademicTermsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsScopeService, ReportsExportService],
  exports: [ReportsService],
})
export class ReportsModule {}
