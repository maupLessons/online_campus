import * as ExcelJS from 'exceljs';
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
import {
  ReportExportDataDto,
  ReportExportLocale,
  ReportScopeType,
} from './dto';

type Labels = {
  title: string;
  generatedAt: string;
  scope: string;
  academicYear: string;
  semester: string;
  dateRange: string;
  assignments: string;
  students: string;
  averageGrade: string;
  grades: string;
  attendanceRate: string;
  attendanceRecords: string;
  lessons: string;
  present: string;
  late: string;
  absent: string;
  excused: string;
  coursesSheet: string;
  summarySheet: string;
  course: string;
  code: string;
  group: string;
  department: string;
  faculty: string;
  all: string;
  institution: string;
  facultyScope: string;
  departmentScope: string;
};

const LABELS: Record<ReportExportLocale, Labels> = {
  [ReportExportLocale.UK]: {
    title: 'Аналітичний звіт успішності та відвідуваності',
    generatedAt: 'Сформовано',
    scope: 'Область даних',
    academicYear: 'Навчальний рік',
    semester: 'Семестр',
    dateRange: 'Період',
    assignments: 'Навчальних дисциплін',
    students: 'Студентів у вибірці',
    averageGrade: 'Середній бал',
    grades: 'Оцінок',
    attendanceRate: 'Відвідуваність, %',
    attendanceRecords: 'Записів відвідування',
    lessons: 'Занять у журналі',
    present: 'Присутні',
    late: 'Запізнення',
    absent: 'Відсутні',
    excused: 'Поважна причина',
    coursesSheet: 'Дисципліни',
    summarySheet: 'Зведення',
    course: 'Дисципліна',
    code: 'Код',
    group: 'Група',
    department: 'Кафедра',
    faculty: 'Факультет',
    all: 'Усі',
    institution: 'Увесь кампус',
    facultyScope: 'Факультет',
    departmentScope: 'Кафедра',
  },
  [ReportExportLocale.EN]: {
    title: 'Academic performance and attendance report',
    generatedAt: 'Generated at',
    scope: 'Data scope',
    academicYear: 'Academic year',
    semester: 'Semester',
    dateRange: 'Period',
    assignments: 'Course assignments',
    students: 'Students covered',
    averageGrade: 'Average grade',
    grades: 'Grades',
    attendanceRate: 'Attendance, %',
    attendanceRecords: 'Attendance records',
    lessons: 'Journal lessons',
    present: 'Present',
    late: 'Late',
    absent: 'Absent',
    excused: 'Excused',
    coursesSheet: 'Courses',
    summarySheet: 'Summary',
    course: 'Course',
    code: 'Code',
    group: 'Group',
    department: 'Department',
    faculty: 'Faculty',
    all: 'All',
    institution: 'Entire campus',
    facultyScope: 'Faculty',
    departmentScope: 'Department',
  },
};

export function buildReportsCsv(
  report: ReportExportDataDto,
  locale: ReportExportLocale,
): string {
  const labels = LABELS[locale];
  const rows: unknown[][] = [
    [labels.title],
    [labels.generatedAt, report.generatedAt],
    [labels.scope, formatScope(report, labels)],
    [labels.academicYear, report.filters.selected.academicYear ?? labels.all],
    [labels.semester, report.filters.selected.semester ?? labels.all],
    [labels.dateRange, formatDateRange(report, labels)],
    [labels.assignments, report.scope.assignmentCount],
    [labels.students, report.scope.studentCount],
    [labels.averageGrade, report.summary.averageGrade ?? ''],
    [labels.grades, report.summary.gradeCount],
    [labels.attendanceRate, report.summary.attendanceRate ?? ''],
    [labels.attendanceRecords, report.summary.attendanceRecords],
    [labels.lessons, report.summary.lessonsRecorded],
    [labels.present, report.summary.present],
    [labels.late, report.summary.late],
    [labels.absent, report.summary.absent],
    [labels.excused, report.summary.excused],
    [],
    courseHeaders(labels),
    ...report.courseBreakdown.docs.map((row) => courseRow(row)),
  ];

  return buildSpreadsheetCsv(rows);
}

export async function buildReportsXlsx(
  report: ReportExportDataDto,
  locale: ReportExportLocale,
): Promise<Buffer> {
  const labels = LABELS[locale];
  const workbook = createSpreadsheetWorkbook();
  addSummarySheet(workbook, report, labels);
  addCoursesSheet(workbook, report, labels);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  report: ReportExportDataDto,
  labels: Labels,
) {
  const sheet = workbook.addWorksheet(labels.summarySheet, {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  sheet.mergeCells('A1:B1');
  const title = sheet.getCell('A1');
  title.value = labels.title;
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 15 };
  title.fill = spreadsheetSolidFill(SPREADSHEET_EXPORT_CONFIG.headerFill);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 32;

  const rows: Array<[string, unknown]> = [
    [labels.generatedAt, report.generatedAt],
    [labels.scope, formatScope(report, labels)],
    [labels.academicYear, report.filters.selected.academicYear ?? labels.all],
    [labels.semester, report.filters.selected.semester ?? labels.all],
    [labels.dateRange, formatDateRange(report, labels)],
    [labels.assignments, report.scope.assignmentCount],
    [labels.students, report.scope.studentCount],
    [labels.averageGrade, report.summary.averageGrade ?? ''],
    [labels.grades, report.summary.gradeCount],
    [labels.attendanceRate, report.summary.attendanceRate ?? ''],
    [labels.attendanceRecords, report.summary.attendanceRecords],
    [labels.lessons, report.summary.lessonsRecorded],
    [labels.present, report.summary.present],
    [labels.late, report.summary.late],
    [labels.absent, report.summary.absent],
    [labels.excused, report.summary.excused],
  ];

  for (const [label, value] of rows) {
    const row = sheet.addRow([
      sanitizeSpreadsheetValue(label),
      sanitizeSpreadsheetValue(value),
    ]);
    styleSpreadsheetDataRow(row);
    row.getCell(1).font = { bold: true };
  }

  fitWorksheetColumns(sheet, [28, 36]);
}

function addCoursesSheet(
  workbook: ExcelJS.Workbook,
  report: ReportExportDataDto,
  labels: Labels,
) {
  const sheet = workbook.addWorksheet(labels.coursesSheet, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  const header = sheet.addRow(courseHeaders(labels));
  styleSpreadsheetHeaderRow(header);

  for (const course of report.courseBreakdown.docs) {
    const row = sheet.addRow(
      courseRow(course).map((value) => sanitizeSpreadsheetValue(value)),
    );
    styleSpreadsheetDataRow(row);
  }

  fitWorksheetColumns(sheet, [30, 14, 14, 28, 28, 16, 12, 16, 12, 18, 16, 14]);
}

function courseHeaders(labels: Labels): string[] {
  return [
    labels.course,
    labels.code,
    labels.group,
    labels.department,
    labels.faculty,
    labels.academicYear,
    labels.semester,
    labels.averageGrade,
    labels.grades,
    labels.attendanceRate,
    labels.attendanceRecords,
    labels.lessons,
  ];
}

function courseRow(
  row: ReportExportDataDto['courseBreakdown']['docs'][number],
): unknown[] {
  return [
    row.courseName,
    row.courseCode,
    row.groupCode,
    row.departmentName,
    row.facultyName,
    row.academicYear,
    row.semester,
    row.averageGrade ?? '',
    row.gradeCount,
    row.attendanceRate ?? '',
    row.attendanceRecords,
    row.lessonsRecorded,
  ];
}

function formatScope(report: ReportExportDataDto, labels: Labels): string {
  const prefix: Record<ReportScopeType, string> = {
    institution: labels.institution,
    faculty: labels.facultyScope,
    department: labels.departmentScope,
  };
  return report.scope.names.length > 0
    ? `${prefix[report.scope.type]}: ${report.scope.names.join(', ')}`
    : prefix[report.scope.type];
}

function formatDateRange(report: ReportExportDataDto, labels: Labels): string {
  const { from, to } = report.filters.selected;
  return from && to ? `${from} - ${to}` : labels.all;
}
