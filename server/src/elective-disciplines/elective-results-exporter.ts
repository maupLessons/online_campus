import * as ExcelJS from 'exceljs';

type ReferenceView = {
  id: string;
  name?: string;
  code?: string;
};

type ExportDiscipline = {
  code: string;
  title: string;
  department: ReferenceView;
  teacher?: ReferenceView | null;
  capacity: number;
};

export type ElectiveExportResults = {
  period: {
    title: string;
    academicYear: string;
    semester: number;
    startsAt: string;
    endsAt: string;
    status: string;
    requiredChoices: number;
    targetGroups: ReferenceView[];
  };
  totalSelections: number;
  totalStudents: number;
  expectedSelections: number;
  completionRate: number;
  disciplines: Array<{
    discipline: ExportDiscipline;
    selectedCount: number;
    capacity: number;
    students: Array<{
      id: string;
      login?: string;
      fullName: string;
      group: ReferenceView;
      selectedAt: string;
    }>;
  }>;
};

const HEADER_FILL = '1D4ED8';
const SUBHEADER_FILL = 'DBEAFE';
const BORDER_COLOR = 'CBD5E1';

export function buildElectiveResultsCsv(
  results: ElectiveExportResults,
): string {
  const targetGroups = results.period.targetGroups
    .map((group) => group.code ?? group.name ?? group.id)
    .join(', ');
  const rows: string[][] = [
    [
      'Період',
      'Навчальний рік',
      'Семестр',
      'Статус',
      'Початок',
      'Завершення',
      'Цільові групи',
      'Потрібно виборів на студента',
      'Студентів, які зробили вибір',
      'Зафіксовано виборів',
      'Очікувана кількість виборів',
      'Виконання, %',
      'Код дисципліни',
      'Дисципліна',
      'Кафедра',
      'Викладач',
      'Обрано',
      'Місткість',
      'Заповнення, %',
      '№',
      'ID студента',
      'Логін',
      'ПІБ студента',
      'Група',
      'Дата вибору',
    ],
  ];

  let rowNumber = 1;
  for (const item of results.disciplines) {
    const disciplineColumns = [
      results.period.title,
      results.period.academicYear,
      String(results.period.semester),
      periodStatusLabel(results.period.status),
      formatDateTime(results.period.startsAt),
      formatDateTime(results.period.endsAt),
      targetGroups,
      String(results.period.requiredChoices),
      String(results.totalStudents),
      String(results.totalSelections),
      String(results.expectedSelections),
      formatPercent(results.completionRate),
      item.discipline.code,
      item.discipline.title,
      referenceLabel(item.discipline.department),
      referenceLabel(item.discipline.teacher),
      String(item.selectedCount),
      String(item.capacity),
      formatPercent(
        item.capacity > 0 ? (item.selectedCount / item.capacity) * 100 : 0,
      ),
    ];

    if (item.students.length === 0) {
      rows.push([...disciplineColumns, '', '', '', '', '', '']);
      continue;
    }

    for (const student of item.students) {
      rows.push([
        ...disciplineColumns,
        String(rowNumber),
        student.id,
        student.login ?? '',
        student.fullName,
        referenceLabel(student.group),
        formatDateTime(student.selectedAt),
      ]);
      rowNumber += 1;
    }
  }

  const body = rows
    .map((row) => row.map((value) => escapeCsvCell(value)).join(';'))
    .join('\r\n');

  return `\uFEFF${body}\r\n`;
}

export async function buildElectiveResultsXlsx(
  results: ElectiveExportResults,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MAUP Online Campus';
  workbook.lastModifiedBy = 'MAUP Online Campus';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  addSummaryWorksheet(workbook, results);
  addSelectionsWorksheet(workbook, results);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSummaryWorksheet(
  workbook: ExcelJS.Workbook,
  results: ElectiveExportResults,
): void {
  const sheet = workbook.addWorksheet('Зведення', {
    views: [{ state: 'frozen', ySplit: 17 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.mergeCells('A1:G1');
  const title = sheet.getCell('A1');
  title.value = 'Результати вибору вибіркових дисциплін';
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  title.fill = solidFill(HEADER_FILL);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 32;

  const metadata: Array<[string, string | number]> = [
    ['Період', results.period.title],
    ['Навчальний рік', results.period.academicYear],
    ['Семестр', results.period.semester],
    ['Статус', periodStatusLabel(results.period.status)],
    ['Початок', formatDateTime(results.period.startsAt)],
    ['Завершення', formatDateTime(results.period.endsAt)],
    [
      'Цільові групи',
      results.period.targetGroups
        .map((group) => group.code ?? group.name ?? group.id)
        .join(', '),
    ],
    ['Потрібно виборів на студента', results.period.requiredChoices],
    ['Студентів, які зробили вибір', results.totalStudents],
    ['Зафіксовано виборів', results.totalSelections],
    ['Очікувана кількість виборів', results.expectedSelections],
    ['Виконання', results.completionRate / 100],
  ];

  metadata.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, color: { argb: 'FF1E3A8A' } };
    row.getCell(1).fill = solidFill('EFF6FF');
    row.getCell(2).value = sanitizeSpreadsheetText(value);
    sheet.mergeCells(index + 3, 2, index + 3, 7);
    row.getCell(2).alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true,
    };
  });
  sheet.getCell('B14').numFmt = '0.00%';

  const headerRowNumber = 17;
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = [
    'Код',
    'Дисципліна',
    'Кафедра',
    'Викладач',
    'Обрано',
    'Місткість',
    'Заповнення',
  ];
  styleHeaderRow(headerRow);
  alignCellsLeft(headerRow, 2, 7);

  for (const item of results.disciplines) {
    const row = sheet.addRow([
      sanitizeSpreadsheetText(item.discipline.code),
      sanitizeSpreadsheetText(item.discipline.title),
      sanitizeSpreadsheetText(referenceLabel(item.discipline.department)),
      sanitizeSpreadsheetText(referenceLabel(item.discipline.teacher)),
      item.selectedCount,
      item.capacity,
      item.capacity > 0 ? item.selectedCount / item.capacity : 0,
    ]);
    row.getCell(7).numFmt = '0.00%';
    styleDataRow(row);
    alignCellsLeft(row, 2, 7);
  }

  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: 7 },
  };
  sheet.columns = [
    { width: 38 },
    { width: 34 },
    { width: 32 },
    { width: 32 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
  ];
}

function addSelectionsWorksheet(
  workbook: ExcelJS.Workbook,
  results: ElectiveExportResults,
): void {
  const sheet = workbook.addWorksheet('Вибори студентів', {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = results.period.title;
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  title.fill = solidFill(HEADER_FILL);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.getRow(2);
  headerRow.values = [
    '№',
    'ID студента',
    'Логін',
    'ПІБ студента',
    'Група',
    'Код дисципліни',
    'Дисципліна',
    'Кафедра',
    'Викладач',
    'Дата вибору',
  ];
  styleHeaderRow(headerRow);
  alignCellsLeft(headerRow, 2, 7);

  let rowNumber = 1;
  for (const item of results.disciplines) {
    for (const student of item.students) {
      const row = sheet.addRow([
        rowNumber,
        sanitizeSpreadsheetText(student.id),
        sanitizeSpreadsheetText(student.login ?? ''),
        sanitizeSpreadsheetText(student.fullName),
        sanitizeSpreadsheetText(referenceLabel(student.group)),
        sanitizeSpreadsheetText(item.discipline.code),
        sanitizeSpreadsheetText(item.discipline.title),
        sanitizeSpreadsheetText(referenceLabel(item.discipline.department)),
        sanitizeSpreadsheetText(referenceLabel(item.discipline.teacher)),
        new Date(student.selectedAt),
      ]);
      row.getCell(10).numFmt = 'dd.mm.yyyy hh:mm';
      styleDataRow(row);
      alignCellsLeft(row, 2, 7);
      rowNumber += 1;
    }
  }

  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: 10 },
  };
  sheet.columns = [
    { width: 7 },
    { width: 27 },
    { width: 20 },
    { width: 32 },
    { width: 14 },
    { width: 18 },
    { width: 34 },
    { width: 32 },
    { width: 32 },
    { width: 20 },
  ];
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    cell.fill = solidFill(SUBHEADER_FILL);
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = thinBorder();
  });
}

function styleDataRow(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = thinBorder();
  });
}

function alignCellsLeft(
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

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = {
    style: 'thin',
    color: { argb: BORDER_COLOR },
  };
  return { top: side, left: side, bottom: side, right: side };
}

function solidFill(color: string): ExcelJS.Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: `FF${color}` },
  };
}

function sanitizeSpreadsheetText(value: string | number): string | number {
  if (typeof value === 'number') return value;
  return /^\s*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  const safeValue = String(sanitizeSpreadsheetText(value));
  if (/[;"\n\r]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

function referenceLabel(reference?: ReferenceView | null): string {
  if (!reference) return '';
  return reference.name ?? reference.code ?? reference.id;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('uk-UA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Kyiv',
  }).format(date);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function periodStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Чернетка',
    active: 'Активний',
    closed: 'Закритий',
    finalized: 'Фіналізований',
  };
  return labels[status] ?? status;
}
