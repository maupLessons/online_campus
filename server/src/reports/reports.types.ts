import { CourseAssignmentSource } from '../courses/schemas';
import { ReportFiltersDto } from './dto';

export const REPORT_MAX_TIME_MS = 10_000;
export const MAX_REPORT_RANGE_DAYS = 366;
export const MAX_REPORT_EXPORT_ASSIGNMENTS = 5_000;

export type ReportTermRef = {
  id: string;
  academicYear: string;
  termNumber: number;
};

export type PopulatedAssignment = {
  _id: unknown;
  term?: { _id?: unknown; academicYear?: string; termNumber?: number } | null;
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
  term: ReportTermRef | null;
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
