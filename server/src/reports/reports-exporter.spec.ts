import { ReportExportDataDto, ReportExportLocale } from './dto';
import { buildReportsCsv, buildReportsXlsx } from './reports-exporter';

const report: ReportExportDataDto = {
  generatedAt: '2026-06-15T10:00:00.000Z',
  trendUnit: 'month',
  scope: {
    type: 'institution',
    names: [],
    assignmentCount: 1,
    studentCount: 20,
  },
  filters: {
    academicYears: ['2025-2026'],
    semesters: [1],
    departments: [],
    groups: [],
    courseAssignments: [],
    selected: {
      academicYear: '2025-2026',
      semester: null,
      departmentId: null,
      groupId: null,
      courseAssignmentId: null,
      from: null,
      to: null,
    },
  },
  summary: {
    averageGrade: 82.5,
    gradeCount: 20,
    attendanceRate: 91.5,
    attendanceRecords: 100,
    lessonsRecorded: 5,
    present: 85,
    late: 6,
    absent: 9,
    excused: 4,
  },
  gradeTrend: [],
  attendanceTrend: [],
  courseBreakdown: {
    docs: [
      {
        courseAssignmentId: '6622b2a00f3a22d5b625d401',
        courseName: '=HYPERLINK("https://invalid.test")',
        courseCode: '+1',
        groupCode: 'IS-21',
        departmentName: 'Information Systems',
        facultyName: 'Digital Technologies',
        academicYear: '2025-2026',
        semester: 1,
        averageGrade: 82.5,
        gradeCount: 20,
        attendanceRate: 91.5,
        attendanceRecords: 100,
        lessonsRecorded: 5,
      },
    ],
    totalDocs: 1,
    page: 1,
    limit: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  },
};

describe('reports exporter', () => {
  it('neutralizes spreadsheet formulas in CSV output', () => {
    const csv = buildReportsCsv(report, ReportExportLocale.EN);

    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain(`'+1`);
    expect(csv).not.toContain(`;"=HYPERLINK`);
  });

  it('creates a structured XLSX workbook', async () => {
    const xlsx = await buildReportsXlsx(report, ReportExportLocale.UK);

    expect(xlsx.length).toBeGreaterThan(1000);
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
  });
});
