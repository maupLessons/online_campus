import * as ExcelJS from 'exceljs';
import {
  alignSpreadsheetCellsLeft as alignCellsLeft,
  buildSpreadsheetCsv,
  createSpreadsheetWorkbook,
  sanitizeSpreadsheetValue as sanitizeSpreadsheetText,
  spreadsheetSolidFill as solidFill,
  SPREADSHEET_EXPORT_CONFIG,
  styleSpreadsheetDataRow as styleDataRow,
  styleSpreadsheetHeaderRow as styleHeaderRow,
} from '../common/export';
import { SurveyQuestionType, SurveyStatus, SurveyTargetType } from './schemas';

type ExportSurvey = {
  title: string;
  description?: string;
  status: SurveyStatus;
  anonymous: boolean;
  targetType: SurveyTargetType;
  startDate?: string;
  endDate?: string;
  publishedAt?: string;
  closedAt?: string;
};

type ChoiceQuestion = {
  type: SurveyQuestionType.SINGLE | SurveyQuestionType.MULTIPLE;
  text: string;
  required: boolean;
  order: number;
  totalAnswers: number;
  options: Array<{
    value: string;
    count: number;
    percentage: number;
  }>;
};

type RatingQuestion = {
  type: SurveyQuestionType.RATING;
  text: string;
  required: boolean;
  order: number;
  totalAnswers: number;
  average: number | null;
  min: number | null;
  max: number | null;
  distribution: Array<{
    rating: number;
    count: number;
    percentage: number;
  }>;
};

type TextQuestion = {
  type: SurveyQuestionType.TEXT;
  text: string;
  required: boolean;
  order: number;
  totalAnswers: number;
  answers: string[];
};

type ExportQuestion = ChoiceQuestion | RatingQuestion | TextQuestion;

export type SurveyExportResults = {
  survey: ExportSurvey;
  anonymous: boolean;
  totalResponses: number;
  totalCompletions: number;
  expectedRecipients: number;
  completionRate: number;
  questions: ExportQuestion[];
};

const HEADER_FILL = SPREADSHEET_EXPORT_CONFIG.headerFill;

export function buildSurveyResultsCsv(results: SurveyExportResults): string {
  const rows: string[][] = [
    [
      'Опитування',
      'Статус',
      'Анонімне',
      'Цільова аудиторія',
      'Початок',
      'Завершення',
      'Очікувано отримувачів',
      'Проходжень',
      'Збережених відповідей',
      'Виконання, %',
      '№ питання',
      'Тип питання',
      'Питання',
      'Обов’язкове',
      'Метрика',
      'Значення',
      'Кількість',
      'Відповідей на питання',
      'Відсоток, %',
      'Середнє',
      'Мінімум',
      'Максимум',
    ],
  ];

  for (const question of results.questions) {
    const commonColumns = buildCsvCommonColumns(results, question);

    if (
      question.type === SurveyQuestionType.SINGLE ||
      question.type === SurveyQuestionType.MULTIPLE
    ) {
      for (const option of question.options) {
        rows.push([
          ...commonColumns,
          'Варіант відповіді',
          option.value,
          String(option.count),
          String(question.totalAnswers),
          formatNumber(option.percentage),
          '',
          '',
          '',
        ]);
      }
      continue;
    }

    if (question.type === SurveyQuestionType.RATING) {
      for (const item of question.distribution) {
        rows.push([
          ...commonColumns,
          'Оцінка',
          String(item.rating),
          String(item.count),
          String(question.totalAnswers),
          formatNumber(item.percentage),
          question.average === null ? '' : formatNumber(question.average),
          question.min === null ? '' : String(question.min),
          question.max === null ? '' : String(question.max),
        ]);
      }
      continue;
    }

    if (question.type !== SurveyQuestionType.TEXT) continue;

    if (question.answers.length === 0) {
      rows.push([
        ...commonColumns,
        'Текстова відповідь',
        '',
        '0',
        String(question.totalAnswers),
        '',
        '',
        '',
        '',
      ]);
      continue;
    }

    for (const answer of question.answers) {
      rows.push([
        ...commonColumns,
        'Текстова відповідь',
        answer,
        '1',
        String(question.totalAnswers),
        '',
        '',
        '',
        '',
      ]);
    }
  }

  return buildSpreadsheetCsv(rows);
}

export async function buildSurveyResultsXlsx(
  results: SurveyExportResults,
): Promise<Buffer> {
  const workbook = createSpreadsheetWorkbook();

  addSummaryWorksheet(workbook, results);
  addDistributionWorksheet(workbook, results);
  addTextAnswersWorksheet(workbook, results);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function buildCsvCommonColumns(
  results: SurveyExportResults,
  question: ExportQuestion,
): string[] {
  return [
    results.survey.title,
    surveyStatusLabel(results.survey.status),
    results.anonymous ? 'Так' : 'Ні',
    surveyTargetLabel(results.survey.targetType),
    formatDateTime(results.survey.startDate),
    formatDateTime(results.survey.endDate),
    String(results.expectedRecipients),
    String(results.totalCompletions),
    String(results.totalResponses),
    formatNumber(results.completionRate),
    String(question.order + 1),
    questionTypeLabel(question.type),
    question.text,
    question.required ? 'Так' : 'Ні',
  ];
}

function addSummaryWorksheet(
  workbook: ExcelJS.Workbook,
  results: SurveyExportResults,
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

  sheet.mergeCells('A1:H1');
  const title = sheet.getCell('A1');
  title.value = 'Результати опитування';
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  title.fill = solidFill(HEADER_FILL);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 32;

  const metadata: Array<[string, string | number]> = [
    ['Назва', results.survey.title],
    ['Опис', results.survey.description ?? ''],
    ['Статус', surveyStatusLabel(results.survey.status)],
    ['Анонімне', results.anonymous ? 'Так' : 'Ні'],
    ['Цільова аудиторія', surveyTargetLabel(results.survey.targetType)],
    ['Початок', formatDateTime(results.survey.startDate)],
    ['Завершення', formatDateTime(results.survey.endDate)],
    ['Очікувано отримувачів', results.expectedRecipients],
    ['Проходжень', results.totalCompletions],
    ['Збережених відповідей', results.totalResponses],
    ['Виконання', results.completionRate / 100],
  ];

  metadata.forEach(([label, value], index) => {
    const row = sheet.getRow(index + 3);
    row.getCell(1).value = label;
    row.getCell(1).font = { bold: true, color: { argb: 'FF1E3A8A' } };
    row.getCell(1).fill = solidFill('EFF6FF');
    row.getCell(2).value = sanitizeSpreadsheetText(value);
    sheet.mergeCells(index + 3, 2, index + 3, 8);
    row.getCell(2).alignment = {
      vertical: 'middle',
      horizontal: 'left',
      wrapText: true,
    };
  });
  sheet.getCell('B13').numFmt = '0.00%';

  const headerRowNumber = 17;
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = [
    '№',
    'Тип',
    'Питання',
    'Обов’язкове',
    'Відповідей',
    'Середнє',
    'Мінімум',
    'Максимум',
  ];
  styleHeaderRow(headerRow);

  for (const question of results.questions) {
    const row = sheet.addRow([
      question.order + 1,
      questionTypeLabel(question.type),
      sanitizeSpreadsheetText(question.text),
      question.required ? 'Так' : 'Ні',
      question.totalAnswers,
      question.type === SurveyQuestionType.RATING
        ? (question.average ?? '')
        : '',
      question.type === SurveyQuestionType.RATING ? (question.min ?? '') : '',
      question.type === SurveyQuestionType.RATING ? (question.max ?? '') : '',
    ]);
    styleDataRow(row);
    alignCellsLeft(row, 2, 4);
  }

  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: 8 },
  };
  sheet.columns = [
    { width: 38 },
    { width: 22 },
    { width: 54 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
  ];
}

function addDistributionWorksheet(
  workbook: ExcelJS.Workbook,
  results: SurveyExportResults,
): void {
  const sheet = workbook.addWorksheet('Розподіл відповідей', {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.mergeCells('A1:H1');
  const title = sheet.getCell('A1');
  title.value = sanitizeSpreadsheetText(results.survey.title);
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  title.fill = solidFill(HEADER_FILL);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.getRow(2);
  headerRow.values = [
    '№ питання',
    'Тип',
    'Питання',
    'Метрика',
    'Значення',
    'Кількість',
    'Відповідей',
    'Відсоток',
  ];
  styleHeaderRow(headerRow);

  for (const question of results.questions) {
    if (
      question.type === SurveyQuestionType.SINGLE ||
      question.type === SurveyQuestionType.MULTIPLE
    ) {
      for (const option of question.options) {
        const row = sheet.addRow([
          question.order + 1,
          questionTypeLabel(question.type),
          sanitizeSpreadsheetText(question.text),
          'Варіант відповіді',
          sanitizeSpreadsheetText(option.value),
          option.count,
          question.totalAnswers,
          option.percentage / 100,
        ]);
        row.getCell(8).numFmt = '0.00%';
        styleDataRow(row);
        alignCellsLeft(row, 2, 5);
      }
      continue;
    }

    if (question.type === SurveyQuestionType.RATING) {
      for (const item of question.distribution) {
        const row = sheet.addRow([
          question.order + 1,
          questionTypeLabel(question.type),
          sanitizeSpreadsheetText(question.text),
          'Оцінка',
          item.rating,
          item.count,
          question.totalAnswers,
          item.percentage / 100,
        ]);
        row.getCell(8).numFmt = '0.00%';
        styleDataRow(row);
        alignCellsLeft(row, 2, 4);
      }
    }
  }

  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: 8 },
  };
  sheet.columns = [
    { width: 12 },
    { width: 22 },
    { width: 54 },
    { width: 22 },
    { width: 34 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];
}

function addTextAnswersWorksheet(
  workbook: ExcelJS.Workbook,
  results: SurveyExportResults,
): void {
  const sheet = workbook.addWorksheet('Текстові відповіді', {
    views: [{ state: 'frozen', ySplit: 2 }],
    properties: { defaultRowHeight: 20 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.mergeCells('A1:D1');
  const title = sheet.getCell('A1');
  title.value = sanitizeSpreadsheetText(results.survey.title);
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  title.fill = solidFill(HEADER_FILL);
  title.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.getRow(2);
  headerRow.values = ['№ питання', 'Питання', '№ відповіді', 'Відповідь'];
  styleHeaderRow(headerRow);

  for (const question of results.questions) {
    if (question.type !== SurveyQuestionType.TEXT) continue;

    question.answers.forEach((answer, index) => {
      const row = sheet.addRow([
        question.order + 1,
        sanitizeSpreadsheetText(question.text),
        index + 1,
        sanitizeSpreadsheetText(answer),
      ]);
      styleDataRow(row);
      alignCellsLeft(row, 2, 4);
    });
  }

  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to: { row: 2, column: 4 },
  };
  sheet.columns = [{ width: 12 }, { width: 54 }, { width: 14 }, { width: 80 }];
}

function formatDateTime(value?: string): string {
  if (!value) return '';
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function surveyStatusLabel(status: SurveyStatus): string {
  const labels: Record<SurveyStatus, string> = {
    [SurveyStatus.DRAFT]: 'Чернетка',
    [SurveyStatus.ACTIVE]: 'Активне',
    [SurveyStatus.CLOSED]: 'Закрите',
  };
  return labels[status];
}

function surveyTargetLabel(targetType: SurveyTargetType): string {
  const labels: Record<SurveyTargetType, string> = {
    [SurveyTargetType.ALL]: 'Усі студенти',
    [SurveyTargetType.TEACHERS]: 'Усі викладачі',
    [SurveyTargetType.STUDENTS_TEACHERS]: 'Студенти та викладачі',
    [SurveyTargetType.GROUPS]: 'Навчальні групи',
    [SurveyTargetType.COURSE]: 'Студенти курсів',
  };
  return labels[targetType];
}

function questionTypeLabel(type: SurveyQuestionType): string {
  const labels: Record<SurveyQuestionType, string> = {
    [SurveyQuestionType.SINGLE]: 'Один варіант',
    [SurveyQuestionType.MULTIPLE]: 'Декілька варіантів',
    [SurveyQuestionType.RATING]: 'Оцінка 1–5',
    [SurveyQuestionType.TEXT]: 'Текстова відповідь',
  };
  return labels[type];
}
