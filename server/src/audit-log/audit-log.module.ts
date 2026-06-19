import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { AuditOutbox, AuditOutboxSchema } from './schemas/audit-outbox.schema';
import { AuditOutboxProcessor } from './audit-outbox.processor';
import { TransactionLifecycleService } from './transaction-lifecycle.service';
import { AuditOutboxReadinessService } from './audit-outbox-readiness.service';
import { AuditLogExportService } from './audit-log-export.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: AuditOutbox.name, schema: AuditOutboxSchema },
    ]),
  ],
  controllers: [AuditLogController],
  providers: [
    AuditLogService,
    AuditOutboxProcessor,
    AuditOutboxReadinessService,
    TransactionLifecycleService,
    AuditLogExportService,
  ],
  exports: [AuditLogService, TransactionLifecycleService],
})
export class AuditLogModule {}
