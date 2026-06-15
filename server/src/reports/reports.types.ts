import { Types } from 'mongoose';
import { CourseAssignmentSource } from '../courses/schemas';
import { ReportFiltersDto, ReportOverviewDto, ReportTrendUnit } from './dto';

export const REPORT_MAX_TIME_MS = 10_000;
export const MAX_REPORT_RANGE_DAYS = 366;
export const MAX_REPORT_EXPORT_ASSIGNMENTS = 5_000;

export type PopulatedAssignment = {
  _id: unknown;
  academicYear: string;
  semester: number;
  source?: CourseAssignmentSource;
  enrolledStudents?: unknown[];
  course?: {
    _id?: unknown;
    name?: string;
    code?: string;
    department?: {
      _id?: unknown;
      name?: string;
      faculty?: {
        _id?: unknown;
        name?: string;
      };
    };
  };
  group?: {
    _id?: unknown;
    code?: string;
  };
};

export type AssignmentMetadata = {
  id: string;
  academicYear: string;
  semester: number;
  source: CourseAssignmentSource;
  enrolledStudentIds: string[];
  courseName: string;
  courseCode: string;
  groupId: string;
  groupCode: string;
  departmentId: string;
  departmentName: string;
  facultyId: string;
  facultyName: string;
};

export type ResolvedReportScope = {
  allAssignments: AssignmentMetadata[];
  selectedAssignments: AssignmentMetadata[];
  filters: ReportFiltersDto;
};

export type DateRange = {
  from: Date;
  toExclusive: Date;
  days: number;
};

export type GradeSummaryAggregation = {
  summary: Array<{
    averageGrade: number;
    gradeCount: number;
  }>;
  trend: Array<{
    _id: Date;
    averageGrade: number;
    gradeCount: number;
  }>;
};

export type GradeCourseAggregation = Array<{
  _id: Types.ObjectId;
  averageGrade: number;
  gradeCount: number;
}>;

export type AttendanceCounts = {
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendanceRecords: number;
};

export type AttendanceSummaryAggregation = {
  summary: AttendanceCounts[];
  lessonCount: Array<{ count: number }>;
  trend: Array<
    AttendanceCounts & {
      _id: Date;
    }
  >;
};

export type AttendanceCourseAggregation = {
  lessons: Array<{
    _id: Types.ObjectId;
    count: number;
  }>;
  attendance: Array<
    AttendanceCounts & {
      _id: Types.ObjectId;
    }
  >;
};

export type OverviewAnalytics = Pick<
  ReportOverviewDto,
  'summary' | 'gradeTrend' | 'attendanceTrend'
> & {
  trendUnit: ReportTrendUnit;
};
