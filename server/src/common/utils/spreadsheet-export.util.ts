import * as ExcelJS from 'exceljs';

export const SPREADSHEET_EXPORT_CONFIG = {
  creator: 'MAUP Online Campus',
  csvDelimiter: ';',
  csvLineEnding: '\r\n',
  csvMimeType: 'text/csv; charset=utf-8',
  headerFill: '1D4ED8',
  subheaderFill: 'DBEAFE',
  borderColor: 'CBD5E1',
  maxColumnWidth: 80,
  columnPadding: 4,
} as const;

export function createSpreadsheetWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = SPREADSHEET_EXPORT_CONFIG.creator;
  workbook.lastModifiedBy = SPREADSHEET_EXPORT_CONFIG.creator;
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}

export function buildSpreadsheetCsv(rows: unknown[][]): string {
  const body = rows
    .map((row) =>
      row
        .map((value) => escapeSpreadsheetCsvCell(value))
        .join(SPREADSHEET_EXPORT_CONFIG.csvDelimiter),
    )
    .join(SPREADSHEET_EXPORT_CONFIG.csvLineEnding);

  return `\uFEFF${body}${SPREADSHEET_EXPORT_CONFIG.csvLineEnding}`;
}

export function sanitizeSpreadsheetValue(
  value: unknown,
): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'bigint'
        ? value.toString()
        : value instanceof Date
          ? value.toISOString()
          : '';
  return /^\s*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function escapeSpreadsheetCsvCell(value: unknown): string {
  const safeValue = String(sanitizeSpreadsheetValue(value));
  if (/[;"\n\r]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

export function fitWorksheetColumns(
  worksheet: ExcelJS.Worksheet,
  minimumWidths: number[],
): void {
  minimumWidths.forEach((minimumWidth, index) => {
    const column = worksheet.getColumn(index + 1);
    let contentWidth = 0;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.text ?? '';
      contentWidth = Math.max(
        contentWidth,
        ...value.split(/\r?\n/).map((line) => line.length),
      );
    });
    column.width = Math.min(
      Math.max(
        minimumWidth,
        contentWidth + SPREADSHEET_EXPORT_CONFIG.columnPadding,
      ),
      SPREADSHEET_EXPORT_CONFIG.maxColumnWidth,
    );
  });
}

export function styleSpreadsheetHeaderRow(row: ExcelJS.Row): void {
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    cell.fill = spreadsheetSolidFill(SPREADSHEET_EXPORT_CONFIG.subheaderFill);
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = spreadsheetThinBorder();
  });
}

export function styleSpreadsheetDataRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = spreadsheetThinBorder();
  });
}

export function alignSpreadsheetCellsLeft(
  row: ExcelJS.Row,
  fromColumn: number,
  toColumn: number,
): void {
  for (let column = fromColumn; column <= toColumn; column += 1) {
    const cell = row.getCell(column);
    cell.alignment = {
      ...cell.alignment,
      horizontal: 'left',
      wrapText: true,
    };
  }
}

export function spreadsheetThinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: SPREADSHEET_EXPORT_CONFIG.borderColor },
  };
  return { top: side, left: side, bottom: side, right: side };
}

export function spreadsheetSolidFill(color: string): ExcelJS.Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${color}` },
  };
}
