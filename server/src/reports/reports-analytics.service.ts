import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { toId } from '../common/utils/to-id.util';
import {
  Grade,
  GradeDocument,
  LessonJournalEntry,
  LessonJournalEntryDocument,
} from '../courses/schemas';
import {
  ReportAttendanceTrendDto,
  ReportCourseRowDto,
  ReportGradeTrendDto,
  ReportSummaryDto,
  ReportTrendUnit,
} from './dto';
import {
  attendanceGroupFields,
  attendanceRate,
  emptyAttendance,
  reportDateBucket,
  reportDateFilter,
  round,
  roundNullable,
} from './reports-query.util';
import {
  AssignmentMetadata,
  AttendanceCourseAggregation,
  AttendanceSummaryAggregation,
  DateRange,
  GradeCourseAggregation,
  GradeSummaryAggregation,
  REPORT_MAX_TIME_MS,
} from './reports.types';

@Injectable()
export class ReportsAnalyticsService {
  constructor(
    @InjectModel(Grade.name)
    private readonly gradeModel: Model<GradeDocument>,
    @InjectModel(LessonJournalEntry.name)
    private readonly lessonJournalModel: Model<LessonJournalEntryDocument>,
  ) {}

  async getOverview(params: {
    assignments: AssignmentMetadata[];
    dateRange: DateRange | null;
    trendUnit: ReportTrendUnit;
  }): Promise<{
    summary: ReportSummaryDto;
    gradeTrend: ReportGradeTrendDto[];
    attendanceTrend: ReportAttendanceTrendDto[];
  }> {
    const assignmentIds = toObjectIds(params.assignments);
    const [gradeData, attendanceData] = await Promise.all([
      this.aggregateGradeSummary(
        assignmentIds,
        params.dateRange,
        params.trendUnit,
      ),
      this.aggregateAttendanceSummary(
        assignmentIds,
        params.dateRange,
        params.trendUnit,
      ),
    ]);
    const attendanceSummary = attendanceData.summary[0] ?? emptyAttendance();
    const gradeSummary = gradeData.summary[0];

    return {
      summary: {
        averageGrade: roundNullable(gradeSummary?.averageGrade),
        gradeCount: gradeSummary?.gradeCount ?? 0,
        attendanceRate: attendanceRate(attendanceSummary),
        attendanceRecords: attendanceSummary.attendanceRecords,
        lessonsRecorded: attendanceData.lessonCount[0]?.count ?? 0,
        present: attendanceSummary.present,
        late: attendanceSummary.late,
        absent: attendanceSummary.absent,
        excused: attendanceSummary.excused,
      },
      gradeTrend: gradeData.trend
        .map((item) => ({
          period: item._id.toISOString(),
          averageGrade: round(item.averageGrade),
          gradeCount: item.gradeCount,
        }))
        .sort((left, right) => left.period.localeCompare(right.period)),
      attendanceTrend: attendanceData.trend
        .map((item) => ({
          period: item._id.toISOString(),
          attendanceRate: attendanceRate(item),
          present: item.present,
          late: item.late,
          absent: item.absent,
          excused: item.excused,
        }))
        .sort((left, right) => left.period.localeCompare(right.period)),
    };
  }

  async getCourseRows(
    assignments: AssignmentMetadata[],
    dateRange: DateRange | null,
  ): Promise<ReportCourseRowDto[]> {
    const assignmentIds = toObjectIds(assignments);
    const [gradeData, attendanceData] = await Promise.all([
      this.aggregateGradesByCourse(assignmentIds, dateRange),
      this.aggregateAttendanceByCourse(assignmentIds, dateRange),
    ]);
    const grades = new Map(gradeData.map((item) => [toId(item._id), item]));
    const attendance = new Map(
      attendanceData.attendance.map((item) => [toId(item._id), item]),
    );
    const lessons = new Map(
      attendanceData.lessons.map((item) => [toId(item._id), item.count]),
    );

    return assignments.map((item) => {
      const grade = grades.get(item.id);
      const attendanceItem = attendance.get(item.id);
      return {
        courseAssignmentId: item.id,
        courseName: item.courseName,
        courseCode: item.courseCode,
        groupCode: item.groupCode,
        departmentName: item.departmentName,
        facultyName: item.facultyName,
        academicYear: item.academicYear,
        semester: item.semester,
        averageGrade: roundNullable(grade?.averageGrade),
        gradeCount: grade?.gradeCount ?? 0,
        attendanceRate: attendanceItem ? attendanceRate(attendanceItem) : null,
        attendanceRecords: attendanceItem?.attendanceRecords ?? 0,
        lessonsRecorded: lessons.get(item.id) ?? 0,
      };
    });
  }

  private async aggregateGradeSummary(
    assignmentIds: Types.ObjectId[],
    dateRange: DateRange | null,
    trendUnit: ReportTrendUnit,
  ): Promise<GradeSummaryAggregation> {
    if (assignmentIds.length === 0) return { summary: [], trend: [] };

    const pipeline: PipelineStage[] = [
      {
        $match: {
          courseAssignment: { $in: assignmentIds },
          status: { $ne: 'withdrawn' },
          ...reportDateFilter(dateRange),
        },
      },
      {
        $facet: {
          summary: [
            {
              $group: {
                _id: null,
                averageGrade: { $avg: '$value' },
                gradeCount: { $sum: 1 },
              },
            },
          ],
          trend: [
            {
              $group: {
                _id: reportDateBucket('$date', trendUnit),
                averageGrade: { $avg: '$value' },
                gradeCount: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ];

    const [result] = await this.gradeModel
      .aggregate<GradeSummaryAggregation>(pipeline)
      .option({ maxTimeMS: REPORT_MAX_TIME_MS })
      .exec();
    return result ?? { summary: [], trend: [] };
  }

  private async aggregateGradesByCourse(
    assignmentIds: Types.ObjectId[],
    dateRange: DateRange | null,
  ): Promise<GradeCourseAggregation> {
    if (assignmentIds.length === 0) return [];

    return this.gradeModel
      .aggregate<GradeCourseAggregation[number]>([
        {
          $match: {
            courseAssignment: { $in: assignmentIds },
            status: { $ne: 'withdrawn' },
            ...reportDateFilter(dateRange),
          },
        },
        {
          $group: {
            _id: '$courseAssignment',
            averageGrade: { $avg: '$value' },
            gradeCount: { $sum: 1 },
          },
        },
      ])
      .option({ maxTimeMS: REPORT_MAX_TIME_MS })
      .exec();
  }

  private async aggregateAttendanceSummary(
    assignmentIds: Types.ObjectId[],
    dateRange: DateRange | null,
    trendUnit: ReportTrendUnit,
  ): Promise<AttendanceSummaryAggregation> {
    if (assignmentIds.length === 0) {
      return { summary: [], lessonCount: [], trend: [] };
    }
    const counts = attendanceGroupFields();
    const pipeline: PipelineStage[] = [
      {
        $match: {
          courseAssignment: { $in: assignmentIds },
          ...reportDateFilter(dateRange),
        },
      },
      {
        $facet: {
          lessonCount: [{ $count: 'count' }],
          summary: [
            { $unwind: '$attendance' },
            {
              $group: {
                _id: null,
                ...counts,
                attendanceRecords: { $sum: 1 },
              },
            },
          ],
          trend: [
            { $unwind: '$attendance' },
            {
              $group: {
                _id: reportDateBucket('$date', trendUnit),
                ...counts,
                attendanceRecords: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ];

    const [result] = await this.lessonJournalModel
      .aggregate<AttendanceSummaryAggregation>(pipeline)
      .option({ maxTimeMS: REPORT_MAX_TIME_MS })
      .exec();
    return result ?? { summary: [], lessonCount: [], trend: [] };
  }

  private async aggregateAttendanceByCourse(
    assignmentIds: Types.ObjectId[],
    dateRange: DateRange | null,
  ): Promise<AttendanceCourseAggregation> {
    if (assignmentIds.length === 0) {
      return { lessons: [], attendance: [] };
    }
    const counts = attendanceGroupFields();
    const pipeline: PipelineStage[] = [
      {
        $match: {
          courseAssignment: { $in: assignmentIds },
          ...reportDateFilter(dateRange),
        },
      },
      {
        $facet: {
          lessons: [
            {
              $group: {
                _id: '$courseAssignment',
                count: { $sum: 1 },
              },
            },
          ],
          attendance: [
            { $unwind: '$attendance' },
            {
              $group: {
                _id: '$courseAssignment',
                ...counts,
                attendanceRecords: { $sum: 1 },
              },
            },
          ],
        },
      },
    ];

    const [result] = await this.lessonJournalModel
      .aggregate<AttendanceCourseAggregation>(pipeline)
      .option({ maxTimeMS: REPORT_MAX_TIME_MS })
      .exec();
    return result ?? { lessons: [], attendance: [] };
  }
}

function toObjectIds(assignments: AssignmentMetadata[]): Types.ObjectId[] {
  return assignments.map((assignment) => new Types.ObjectId(assignment.id));
}
