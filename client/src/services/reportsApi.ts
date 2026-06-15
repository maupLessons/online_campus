import api from "./api";
import { fetchSpreadsheetExport } from "./spreadsheetExportApi";
import type {
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from "../utils/spreadsheetExport";

export type ReportScopeType = "department" | "faculty" | "institution";
export type ReportTrendUnit = "day" | "week" | "month";
export type ReportExportFormat = SpreadsheetExportFormat;

export interface ReportQuery {
  academicYear?: string;
  semester?: number;
  departmentId?: string;
  groupId?: string;
  courseAssignmentId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface ReportOption {
  id: string;
  label: string;
}

export interface ReportCourseOption extends ReportOption {
  courseName: string;
  groupCode: string;
  academicYear: string;
  semester: number;
  departmentId: string;
  groupId: string;
}

export interface ReportSelectedFilters {
  academicYear: string | null;
  semester: number | null;
  departmentId: string | null;
  groupId: string | null;
  courseAssignmentId: string | null;
  from: string | null;
  to: string | null;
}

export interface ReportCourseRow {
  courseAssignmentId: string;
  courseName: string;
  courseCode: string;
  groupCode: string;
  departmentName: string;
  facultyName: string;
  academicYear: string;
  semester: number;
  averageGrade: number | null;
  gradeCount: number;
  attendanceRate: number | null;
  attendanceRecords: number;
  lessonsRecorded: number;
}

export interface ReportCourseBreakdown {
  docs: ReportCourseRow[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ReportOverview {
  generatedAt: string;
  trendUnit: ReportTrendUnit;
  scope: {
    type: ReportScopeType;
    names: string[];
    assignmentCount: number;
    studentCount: number;
  };
  filters: {
    academicYears: string[];
    semesters: number[];
    departments: ReportOption[];
    groups: ReportOption[];
    courseAssignments: ReportCourseOption[];
    selected: ReportSelectedFilters;
  };
  summary: {
    averageGrade: number | null;
    gradeCount: number;
    attendanceRate: number | null;
    attendanceRecords: number;
    lessonsRecorded: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
  };
  gradeTrend: Array<{
    period: string;
    averageGrade: number;
    gradeCount: number;
  }>;
  attendanceTrend: Array<{
    period: string;
    attendanceRate: number | null;
    present: number;
    late: number;
    absent: number;
    excused: number;
  }>;
}

export const reportsApi = {
  async getOverview(params: ReportQuery) {
    const { data } = await api.get<ReportOverview>("/reports/overview", {
      params,
    });
    return data;
  },

  async getCourseBreakdown(params: ReportQuery) {
    const { data } = await api.get<ReportCourseBreakdown>("/reports/courses", {
      params,
    });
    return data;
  },

  async export(
    params: ReportQuery,
    format: ReportExportFormat,
    locale: SpreadsheetExportLocale,
  ) {
    return fetchSpreadsheetExport("/reports/export", {
      params: { ...params, format, locale },
    });
  },
};
