import { Types } from 'mongoose';
import { CourseAssignmentSource } from '../courses/schemas';
import { ReportsAnalyticsService } from './reports-analytics.service';
import { AssignmentMetadata } from './reports.types';

function aggregateResult(value: unknown) {
  return {
    option: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  };
}

describe('ReportsAnalyticsService', () => {
  const assignmentId = new Types.ObjectId();
  const gradeModel = { aggregate: jest.fn() };
  const lessonJournalModel = { aggregate: jest.fn() };
  const assignment: AssignmentMetadata = {
    id: assignmentId.toHexString(),
    academicYear: '2025-2026',
    semester: 1,
    source: CourseAssignmentSource.STANDARD,
    enrolledStudentIds: [],
    courseName: 'Enterprise Systems',
    courseCode: 'ES-101',
    groupId: new Types.ObjectId().toHexString(),
    groupCode: 'IS-21',
    departmentId: new Types.ObjectId().toHexString(),
    departmentName: 'Information Systems',
    facultyId: new Types.ObjectId().toHexString(),
    facultyName: 'Digital Technologies',
  };
  let service: ReportsAnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportsAnalyticsService(
      gradeModel as never,
      lessonJournalModel as never,
    );
  });

  it('calculates privacy-preserving summary and attendance formula', async () => {
    gradeModel.aggregate.mockReturnValue(
      aggregateResult([
        {
          summary: [{ averageGrade: 84.126, gradeCount: 3 }],
          trend: [
            {
              _id: new Date('2025-09-01T00:00:00.000Z'),
              averageGrade: 84.126,
              gradeCount: 3,
            },
          ],
        },
      ]),
    );
    lessonJournalModel.aggregate.mockReturnValue(
      aggregateResult([
        {
          summary: [
            {
              present: 8,
              late: 1,
              absent: 1,
              excused: 2,
              attendanceRecords: 12,
            },
          ],
          lessonCount: [{ count: 2 }],
          trend: [],
        },
      ]),
    );

    const analytics = await service.getOverview({
      assignments: [assignment],
      dateRange: null,
      trendUnit: 'month',
    });

    expect(analytics.summary).toEqual({
      averageGrade: 84.13,
      gradeCount: 3,
      attendanceRate: 90,
      attendanceRecords: 12,
      lessonsRecorded: 2,
      present: 8,
      late: 1,
      absent: 1,
      excused: 2,
    });
  });

  it('keeps lessons without attendance in the paginated course rows', async () => {
    gradeModel.aggregate.mockReturnValue(aggregateResult([]));
    lessonJournalModel.aggregate.mockReturnValue(
      aggregateResult([
        {
          lessons: [{ _id: assignmentId, count: 1 }],
          attendance: [],
        },
      ]),
    );

    const rows = await service.getCourseRows([assignment], null);

    expect(rows[0]).toMatchObject({
      courseAssignmentId: assignment.id,
      lessonsRecorded: 1,
      attendanceRate: null,
      attendanceRecords: 0,
    });
  });
});
