import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../common/export';
import { Role } from '../common/types/roles.enum';
import { CourseAssignmentSource } from '../courses/schemas';
import { ReportExportDataDto } from './dto';
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
    service = new ReportsService(
      scopeService as unknown as ReportsScopeService,
      exportService,
    );
  });

  it('builds aggregate overview without course-row aggregation', async () => {
    const report = await service.getOverview({}, user);

    expect(report.summary.averageGrade).toBeNull();
    expect(report.summary.gradeCount).toBe(0);
    expect(report.scope.studentCount).toBe(60);
  });

  it('aggregates only assignments from the requested course page', async () => {
    const result = await service.getCourseBreakdown(
      { page: 2, limit: 2 },
      user,
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

    expect(capturedExportReport?.courseBreakdown.totalDocs).toBe(
      assignments.length,
    );
    expect(exportService.build).toHaveBeenCalledWith(
      capturedExportReport,
      SpreadsheetExportFormat.CSV,
      SpreadsheetExportLocale.EN,
    );
    expect(exported.artifact.filename).toBe('academic-report.csv');
    expect(exported.filters.termId).toBe('term-1');
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
    expect(exportService.build).not.toHaveBeenCalled();
  });
});

function assignment(courseName: string, groupCode: string): AssignmentMetadata {
  return {
    id: new Types.ObjectId().toHexString(),
    term: { id: 'term-1', academicYear: '2025/2026', termNumber: 1 },
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
      terms: [
        {
          id: 'term-1',
          label: '2025/2026 · 1',
          academicYear: '2025/2026',
          termNumber: 1,
        },
      ],
      departments: [],
      groups: [],
      courseAssignments: [],
      selected: {
        termId: 'term-1',
        departmentId: null,
        groupId: null,
        courseAssignmentId: null,
        from: null,
        to: null,
      },
    },
  };
}
