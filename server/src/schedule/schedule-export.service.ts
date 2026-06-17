import { BadRequestException, Injectable } from '@nestjs/common';
import {
  buildSpreadsheetExportArtifact,
  SpreadsheetExportArtifact,
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../common/export';
import { ScheduleEntryDto } from './dto';
import { buildScheduleCsv, buildScheduleXlsx } from './schedule-exporter';

@Injectable()
export class ScheduleExportService {
  async export(
    entries: ScheduleEntryDto[],
    format?: SpreadsheetExportFormat,
    locale?: SpreadsheetExportLocale,
  ): Promise<SpreadsheetExportArtifact> {
    const exportFormat = format ?? SpreadsheetExportFormat.CSV;
    const exportLocale = locale ?? SpreadsheetExportLocale.UK;

    this.assertExportSize(entries.length);

    return buildSpreadsheetExportArtifact({
      format: exportFormat,
      filename: 'schedule',
      buildCsv: () => buildScheduleCsv(entries, exportLocale),
      buildXlsx: () => buildScheduleXlsx(entries, exportLocale),
    });
  }

  private assertExportSize(count: number): void {
    if (count > 5000) {
      throw new BadRequestException(
        'Експорт розкладу обмежено 5000 записами. Звузьте фільтр дат.',
      );
    }
  }
}
