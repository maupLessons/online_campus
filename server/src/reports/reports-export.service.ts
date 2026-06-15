import { Injectable } from '@nestjs/common';
import {
  buildSpreadsheetExportArtifact,
  SpreadsheetExportArtifact,
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../common/export';
import { ReportExportDataDto } from './dto';
import { buildReportsCsv, buildReportsXlsx } from './reports-exporter';

@Injectable()
export class ReportsExportService {
  async build(
    report: ReportExportDataDto,
    format: SpreadsheetExportFormat,
    locale: SpreadsheetExportLocale,
  ): Promise<SpreadsheetExportArtifact> {
    return buildSpreadsheetExportArtifact({
      filename: 'academic-report',
      format,
      buildCsv: () => buildReportsCsv(report, locale),
      buildXlsx: () => buildReportsXlsx(report, locale),
    });
  }
}
