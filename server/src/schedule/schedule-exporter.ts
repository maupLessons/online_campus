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
  sessionTitle: string;
  sheet: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  controlType: string;
  courseName: string;
  group: string;
  teacher: string;
  classroom: string;
  format: string;
  online: string;
  inPerson: string;
  onlineUrl: string;
};

const LABELS: Record<SpreadsheetExportLocale, Labels> = {
  [SpreadsheetExportLocale.UK]: {
    title: 'Розклад занять',
    sessionTitle: 'Розклад сесії',
    sheet: 'Розклад',
    date: 'Дата',
    startTime: 'Початок',
    endTime: 'Завершення',
    type: 'Тип заняття',
    controlType: 'Тип контролю',
    courseName: 'Дисципліна',
    group: 'Група',
    teacher: 'Викладач',
    classroom: 'Аудиторія',
    format: 'Формат',
    online: 'Онлайн',
    inPerson: 'Аудиторія',
    onlineUrl: 'Онлайн-пара',
  },
  [SpreadsheetExportLocale.EN]: {
    title: 'Class schedule',
    sessionTitle: 'Exam session schedule',
    sheet: 'Schedule',
    date: 'Date',
    startTime: 'Start',
    endTime: 'End',
    type: 'Lesson type',
    controlType: 'Control type',
    courseName: 'Course',
    group: 'Group',
    teacher: 'Teacher',
    classroom: 'Classroom',
    format: 'Format',
    online: 'Online',
    inPerson: 'On campus',
    onlineUrl: 'Online class link',
  },
};

export function buildScheduleCsv(
  entries: ScheduleEntryDto[],
  locale: SpreadsheetExportLocale,
  session: boolean,
): string {
  const labels = LABELS[locale];
  return buildSpreadsheetCsv([
    scheduleHeaders(labels, session),
    ...entries.map((entry) => scheduleRow(entry, labels, session)),
  ]);
}

export async function buildScheduleXlsx(
  entries: ScheduleEntryDto[],
  locale: SpreadsheetExportLocale,
  session: boolean,
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

  sheet.mergeCells('A1:J1');
  const title = sheet.getCell('A1');
  title.value = session ? labels.sessionTitle : labels.title;
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  title.fill = spreadsheetSolidFill(SPREADSHEET_EXPORT_CONFIG.headerFill);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 32;

  const header = sheet.addRow(scheduleHeaders(labels, session));
  styleSpreadsheetHeaderRow(header);

  for (const entry of entries) {
    const row = sheet.addRow(
      scheduleRow(entry, labels, session).map((value) =>
        sanitizeSpreadsheetValue(value),
      ),
    );
    styleSpreadsheetDataRow(row);
  }

  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: 10 },
  };
  fitWorksheetColumns(sheet, [14, 12, 12, 18, 34, 14, 28, 24, 14, 36]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function scheduleHeaders(labels: Labels, session: boolean): string[] {
  return [
    labels.date,
    labels.startTime,
    labels.endTime,
    session ? labels.controlType : labels.type,
    labels.courseName,
    labels.group,
    labels.teacher,
    labels.classroom,
    labels.format,
    labels.onlineUrl,
  ];
}

function scheduleRow(
  entry: ScheduleEntryDto,
  labels: Labels,
  session: boolean,
): unknown[] {
  return [
    entry.date,
    entry.startTime,
    entry.endTime,
    session ? (entry.controlType ?? '') : entry.type,
    entry.courseTitle,
    entry.groupCode,
    entry.teacherName ?? '',
    entry.classroom ?? '',
    entry.onlineFormat ? labels.online : labels.inPerson,
    entry.onlineUrl ?? '',
  ];
}
