import { Module } from '@nestjs/common';
import { AcademicTermsModule } from '../academic-terms/academic-terms.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ExternalDataCacheModule } from '../external-data-cache/external-data-cache.module';
import { MaupStudentApiModule } from '../integrations/maup-student-api/maup-student-api.module';
import { GradebookController } from './gradebook.controller';
import { GradebookService } from './gradebook.service';

@Module({
  imports: [
    ExternalDataCacheModule,
    MaupStudentApiModule,
    AcademicTermsModule,
    AuditLogModule,
  ],
  controllers: [GradebookController],
  providers: [GradebookService],
})
export class GradebookModule {}
