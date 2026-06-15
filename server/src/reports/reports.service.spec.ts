import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../common/export';
import { Role } from '../common/types/roles.enum';
import { CourseAssignmentSource } from '../courses/schemas';
import { ReportExportDataDto } from './dto';
import { ReportsAnalyticsService } from './reports-analytics.service';
import { ReportsScopeService } from './reports-scope.service';
import { ReportsService } from './reports.service';
import {
  AssignmentMetadata,
  MAX_REPORT_EXPORT_ASSIGNMENTS,
  ResolvedReportScope,
} from './reports.types';

describe('ReportsService', () => {
  const assignments = [
    assignment('Enterprise Systems', 'IS-21'),
    assignment('Information Security', 'IS-22'),
    assignment('Software Architecture', 'IS-23'),
  ];
  const scope = resolvedScope(assignments);
  const scopeService = {
    resolve: jest.fn(),
    countStudents: jest.fn(),
    describe: jest.fn(),
  };
  const analyticsService = {
    getOverview: jest.fn(),
    getCourseRows: jest.fn(),
  };
  let capturedExportReport: ReportExportDataDto | undefined;
  const exportService = {
    build: jest.fn((report: ReportExportDataDto) => {
      capturedExportReport = report;
      return Promise.resolve({
        buffer: Buffer.from('export'),
        contentType: 'text/csv; charset=utf-8',
        filename: 'academic-report.csv',
        format: SpreadsheetExportFormat.CSV,
      });
    }),
  };
  const user = {
    sub: new Types.ObjectId().toHexString(),
    login: 'rector',
    role: Role.RECTOR,
  };
  let service: ReportsService;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedExportReport = undefined;
    scopeService.resolve.mockResolvedValue(scope);
    scopeService.countStudents.mockResolvedValue(60);
    scopeService.describe.mockReturnValue({
      type: 'institution',
      names: [],
      assignmentCount: assignments.length,
      studentCount: 60,
    });
    analyticsService.getOverview.mockResolvedValue({
      summary: {
        averageGrade: 84.13,
        gradeCount: 30,
        attendanceRate: 90,
        attendanceRecords: 120,
        lessonsRecorded: 12,
        present: 90,
        late: 9,
        absent: 11,
        excused: 10,
      },
      gradeTrend: [],
      attendanceTrend: [],
    });
    analyticsService.getCourseRows.mockImplementation(
      (items: AssignmentMetadata[]) =>
        Promise.resolve(
          items.map((item) => ({
            courseAssignmentId: item.id,
            courseName: item.courseName,
            courseCode: item.courseCode,
            groupCode: item.groupCode,
            departmentName: item.departmentName,
            facultyName: item.facultyName,
            academicYear: item.academicYear,
            semester: item.semester,
            averageGrade: 84,
            gradeCount: 10,
            attendanceRate: 90,
            attendanceRecords: 40,
            lessonsRecorded: 4,
          })),
        ),
    );
    service = new ReportsService(
      scopeService as unknown as ReportsScopeService,
      analyticsService as unknown as ReportsAnalyticsService,
      exportService,
    );
  });

  it('builds aggregate overview without course-row aggregation', async () => {
    const report = await service.getOverview({}, user);

    expect(report.summary.averageGrade).toBe(84.13);
    expect(report.scope.studentCount).toBe(60);
    expect(analyticsService.getOverview).toHaveBeenCalledWith(
      expect.objectContaining({ assignments }),
    );
    expect(analyticsService.getCourseRows).not.toHaveBeenCalled();
  });

  it('aggregates only assignments from the requested course page', async () => {
    const result = await service.getCourseBreakdown(
      { page: 2, limit: 2 },
      user,
    );

    expect(analyticsService.getCourseRows).toHaveBeenCalledWith(
      [assignments[2]],
      null,
    );
    expect(result).toMatchObject({
      totalDocs: 3,
      page: 2,
      limit: 2,
      totalPages: 2,
      hasPrevPage: true,
      hasNextPage: false,
    });
    expect(result.docs[0].courseName).toBe('Software Architecture');
    expect(analyticsService.getOverview).not.toHaveBeenCalled();
    expect(scopeService.countStudents).not.toHaveBeenCalled();
  });

  it('rejects incomplete and excessive date ranges before database work', async () => {
    await expect(
      service.getOverview({ from: '2025-09-01' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getOverview({ from: '2025-01-01', to: '2026-12-31' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(scopeService.resolve).not.toHaveBeenCalled();
  });

  it('exports the complete filtered dataset through the shared artifact layer', async () => {
    const exported = await service.export(
      {
        format: SpreadsheetExportFormat.CSV,
        locale: SpreadsheetExportLocale.EN,
        page: 99,
        limit: 1,
      },
      user,
    );

    expect(analyticsService.getCourseRows).toHaveBeenCalledWith(
      assignments,
      null,
    );
    expect(capturedExportReport?.courseBreakdown.totalDocs).toBe(
      assignments.length,
    );
    expect(exportService.build).toHaveBeenCalledWith(
      capturedExportReport,
      SpreadsheetExportFormat.CSV,
      SpreadsheetExportLocale.EN,
    );
    expect(exported.artifact.filename).toBe('academic-report.csv');
    expect(exported.filters.academicYear).toBe('2025-2026');
  });

  it('fails closed when a synchronous export is too large', async () => {
    scopeService.resolve.mockResolvedValue(
      resolvedScope(
        Array.from({ length: MAX_REPORT_EXPORT_ASSIGNMENTS + 1 }, (_, index) =>
          assignment(`Course ${index}`, `G-${index}`),
        ),
      ),
    );

    await expect(
      service.export(
        {
          format: SpreadsheetExportFormat.XLSX,
          locale: SpreadsheetExportLocale.UK,
        },
        user,
      ),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(analyticsService.getOverview).not.toHaveBeenCalled();
    expect(exportService.build).not.toHaveBeenCalled();
  });
});

function assignment(courseName: string, groupCode: string): AssignmentMetadata {
  return {
    id: new Types.ObjectId().toHexString(),
    academicYear: '2025-2026',
    semester: 1,
    source: CourseAssignmentSource.STANDARD,
    enrolledStudentIds: [],
    courseName,
    courseCode: courseName.slice(0, 4).toUpperCase(),
    groupId: new Types.ObjectId().toHexString(),
    groupCode,
    departmentId: new Types.ObjectId().toHexString(),
    departmentName: 'Information Systems',
    facultyId: new Types.ObjectId().toHexString(),
    facultyName: 'Digital Technologies',
  };
}

function resolvedScope(
  selectedAssignments: AssignmentMetadata[],
): ResolvedReportScope {
  return {
    allAssignments: selectedAssignments,
    selectedAssignments,
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
  };
}
