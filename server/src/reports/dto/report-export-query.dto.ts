import { IntersectionType } from '@nestjs/swagger';
import {
  LocalizedSpreadsheetExportQueryDto,
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../../common/export';
import { ReportQueryDto } from './report-query.dto';

export {
  SpreadsheetExportFormat as ReportExportFormat,
  SpreadsheetExportLocale as ReportExportLocale,
};

export class ReportExportQueryDto extends IntersectionType(
  ReportQueryDto,
  LocalizedSpreadsheetExportQueryDto,
) {}
