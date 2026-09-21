import { Module } from '@nestjs/common';
import { AcademicTermsModule } from '../academic-terms/academic-terms.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ExternalDataCacheModule } from '../external-data-cache/external-data-cache.module';
import { MaupStudentApiModule } from '../integrations/maup-student-api/maup-student-api.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [
    ExternalDataCacheModule,
    MaupStudentApiModule,
    AcademicTermsModule,
    AuditLogModule,
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
