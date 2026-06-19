import { IntersectionType } from '@nestjs/swagger';
import {
  LocalizedSpreadsheetExportQueryDto,
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../../common/export';
import { AuditLogQueryDto } from './audit-log-query.dto';

export {
  SpreadsheetExportFormat as AuditLogExportFormat,
  SpreadsheetExportLocale as AuditLogExportLocale,
};

export class AuditLogExportQueryDto extends IntersectionType(
  AuditLogQueryDto,
  LocalizedSpreadsheetExportQueryDto,
) {}
