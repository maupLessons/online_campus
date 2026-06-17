import {
  buildSpreadsheetCsv,
  createSpreadsheetWorkbook,
  fitWorksheetColumns,
  sanitizeSpreadsheetValue,
  spreadsheetSolidFill,
  SPREADSHEET_EXPORT_CONFIG,
  styleSpreadsheetDataRow,
  styleSpreadsheetHeaderRow,
} from '../common/export';
import { SpreadsheetExportLocale } from '../common/export';
import { ScheduleEntryDto } from './dto';

type Labels = {
  title: string;
  sheet: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  courseCode: string;
  courseName: string;
  group: string;
  teacher: string;
  classroom: string;
  reason: string;
};

const LABELS: Record<SpreadsheetExportLocale, Labels> = {
  [SpreadsheetExportLocale.UK]: {
    title: 'Розклад занять',
    sheet: 'Розклад',
    date: 'Дата',
    startTime: 'Початок',
    endTime: 'Завершення',
    type: 'Тип заняття',
    status: 'Статус',
    courseCode: 'Код дисципліни',
    courseName: 'Дисципліна',
    group: 'Група',
    teacher: 'Викладач',
    classroom: 'Аудиторія',
    reason: 'Причина зміни',
  },
  [SpreadsheetExportLocale.EN]: {
    title: 'Class schedule',
    sheet: 'Schedule',
    date: 'Date',
    startTime: 'Start',
    endTime: 'End',
    type: 'Lesson type',
    status: 'Status',
    courseCode: 'Course code',
    courseName: 'Course',
    group: 'Group',
    teacher: 'Teacher',
    classroom: 'Classroom',
    reason: 'Change reason',
  },
};

export function buildScheduleCsv(
  entries: ScheduleEntryDto[],
  locale: SpreadsheetExportLocale,
): string {
  const labels = LABELS[locale];
  return buildSpreadsheetCsv([
    scheduleHeaders(labels),
    ...entries.map((entry) => scheduleRow(entry)),
  ]);
}

export async function buildScheduleXlsx(
  entries: ScheduleEntryDto[],
  locale: SpreadsheetExportLocale,
): Promise<Buffer> {
  const labels = LABELS[locale];
  const workbook = createSpreadsheetWorkbook();
  const sheet = workbook.addWorksheet(labels.sheet, {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.mergeCells('A1:K1');
  const title = sheet.getCell('A1');
  title.value = labels.title;
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  title.fill = spreadsheetSolidFill(SPREADSHEET_EXPORT_CONFIG.headerFill);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 32;

  const header = sheet.addRow(scheduleHeaders(labels));
  styleSpreadsheetHeaderRow(header);

  for (const entry of entries) {
    const row = sheet.addRow(
      scheduleRow(entry).map((value) => sanitizeSpreadsheetValue(value)),
    );
    styleSpreadsheetDataRow(row);
  }

  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: 11 },
  };
  fitWorksheetColumns(sheet, [14, 12, 12, 18, 16, 16, 34, 14, 28, 24, 36]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function scheduleHeaders(labels: Labels): string[] {
  return [
    labels.date,
    labels.startTime,
    labels.endTime,
    labels.type,
    labels.status,
    labels.courseCode,
    labels.courseName,
    labels.group,
    labels.teacher,
    labels.classroom,
    labels.reason,
  ];
}

function scheduleRow(entry: ScheduleEntryDto): unknown[] {
  return [
    entry.date,
    entry.startTime,
    entry.endTime,
    entry.type,
    entry.status,
    entry.courseCode ?? '',
    entry.courseName ?? '',
    entry.groupCode ?? '',
    entry.teacherName ?? '',
    entry.classroom ?? '',
    entry.changeReason ?? '',
  ];
}
