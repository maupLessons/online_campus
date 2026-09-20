import { SpreadsheetExportLocale } from '../common/export';
import { ScheduleEntryDto } from './dto';
import { buildScheduleCsv } from './schedule-exporter';
import { ScheduleControlType, ScheduleEntryType } from './schedule.enums';

const entry = (over: Partial<ScheduleEntryDto> = {}): ScheduleEntryDto => ({
  id: 'k1',
  date: '2026-09-07',
  startTime: '08:30',
  endTime: '10:00',
  courseTitle: 'Основи програмування',
  subjectKey: '1001',
  type: ScheduleEntryType.LECTURE,
  teacherName: 'Іваненко І. І.',
  classroom: '101',
  onlineFormat: false,
  groupCode: 'КН-11',
  ...over,
});

describe('buildScheduleCsv', () => {
  it('exports lesson columns without removed fields', () => {
    const csv = buildScheduleCsv([entry()], SpreadsheetExportLocale.UK, false);
    const [header, row] = csv.trim().split('\n');
    expect(header).toContain('Тип заняття');
    expect(header).not.toContain('Статус');
    expect(header).not.toContain('Код дисципліни');
    expect(row).toContain('Основи програмування');
    expect(row).toContain('Аудиторія');
  });

  it('exports control type and online marker for the session', () => {
    const csv = buildScheduleCsv(
      [
        entry({
          type: ScheduleEntryType.EXAM,
          controlType: ScheduleControlType.EXAM,
          classroom: undefined,
          onlineFormat: true,
          onlineUrl: 'https://meet',
        }),
      ],
      SpreadsheetExportLocale.UK,
      true,
    );
    expect(csv).toContain('Тип контролю');
    expect(csv).toContain('Онлайн');
    expect(csv).toContain('https://meet');
  });
});
