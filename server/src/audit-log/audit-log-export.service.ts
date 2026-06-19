import { Injectable } from '@nestjs/common';
import {
  buildSpreadsheetCsv,
  buildSpreadsheetExportArtifact,
  createSpreadsheetWorkbook,
  fitWorksheetColumns,
  SpreadsheetExportArtifact,
  styleSpreadsheetDataRow,
  styleSpreadsheetHeaderRow,
} from '../common/export';
import {
  AuditLogEntryDto,
  AuditLogExportLocale,
  AuditLogExportQueryDto,
} from './dto';
import { AuditLogService } from './audit-log.service';

const HEADERS = {
  uk: [
    'Час',
    'Користувач',
    'Роль',
    'Дія',
    'Сутність',
    'ID сутності',
    'Результат',
    'IP',
    'Request ID',
    'Деталі',
  ],
  en: [
    'Timestamp',
    'User',
    'Role',
    'Action',
    'Entity',
    'Entity ID',
    'Result',
    'IP',
    'Request ID',
    'Details',
  ],
} as const;

@Injectable()
export class AuditLogExportService {
  constructor(private readonly auditLogService: AuditLogService) {}

  async build(
    query: AuditLogExportQueryDto,
  ): Promise<SpreadsheetExportArtifact> {
    const entries = await this.auditLogService.findForExport(query);
    const rows = this.rows(entries, query.locale);

    return buildSpreadsheetExportArtifact({
      filename: `audit-log-${new Date().toISOString().slice(0, 10)}`,
      format: query.format,
      buildCsv: () => buildSpreadsheetCsv(rows),
      buildXlsx: () => this.xlsx(rows),
    });
  }

  private rows(
    entries: AuditLogEntryDto[],
    locale: AuditLogExportLocale,
  ): unknown[][] {
    return [
      [...HEADERS[locale]],
      ...entries.map((entry) => [
        entry.timestamp,
        entry.userLogin,
        entry.userRole ?? '',
        entry.action,
        entry.targetEntity ?? '',
        entry.targetId ?? '',
        entry.result,
        entry.ipAddress,
        entry.requestId ?? '',
        entry.details ? JSON.stringify(entry.details) : '',
      ]),
    ];
  }

  private async xlsx(rows: unknown[][]): Promise<Buffer> {
    const workbook = createSpreadsheetWorkbook();
    const worksheet = workbook.addWorksheet('Audit log', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    rows.forEach((values, index) => {
      const row = worksheet.addRow(values);
      if (index === 0) styleSpreadsheetHeaderRow(row);
      else styleSpreadsheetDataRow(row);
    });
    worksheet.autoFilter = { from: 'A1', to: 'J1' };
    fitWorksheetColumns(worksheet, [24, 18, 14, 26, 18, 26, 12, 16, 24, 40]);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
