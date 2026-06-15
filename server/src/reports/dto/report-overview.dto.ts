import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type ReportScopeType = 'department' | 'faculty' | 'institution';
export type ReportTrendUnit = 'day' | 'week' | 'month';

export class ReportOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  label: string;
}

export class ReportCourseOptionDto extends ReportOptionDto {
  @ApiProperty()
  courseName: string;

  @ApiProperty()
  groupCode: string;

  @ApiProperty()
  academicYear: string;

  @ApiProperty()
  semester: number;

  @ApiProperty()
  departmentId: string;

  @ApiProperty()
  groupId: string;
}

export class ReportSelectedFiltersDto {
  @ApiPropertyOptional({ nullable: true })
  academicYear: string | null;

  @ApiPropertyOptional({ nullable: true })
  semester: number | null;

  @ApiPropertyOptional({ nullable: true })
  departmentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  groupId: string | null;

  @ApiPropertyOptional({ nullable: true })
  courseAssignmentId: string | null;

  @ApiPropertyOptional({ nullable: true })
  from: string | null;

  @ApiPropertyOptional({ nullable: true })
  to: string | null;
}

export class ReportFiltersDto {
  @ApiProperty({ type: [String] })
  academicYears: string[];

  @ApiProperty({ type: [Number] })
  semesters: number[];

  @ApiProperty({ type: [ReportOptionDto] })
  departments: ReportOptionDto[];

  @ApiProperty({ type: [ReportOptionDto] })
  groups: ReportOptionDto[];

  @ApiProperty({ type: [ReportCourseOptionDto] })
  courseAssignments: ReportCourseOptionDto[];

  @ApiProperty({ type: ReportSelectedFiltersDto })
  selected: ReportSelectedFiltersDto;
}

export class ReportScopeDto {
  @ApiProperty({ enum: ['department', 'faculty', 'institution'] })
  type: ReportScopeType;

  @ApiProperty({ type: [String] })
  names: string[];

  @ApiProperty()
  assignmentCount: number;

  @ApiProperty()
  studentCount: number;
}

export class ReportSummaryDto {
  @ApiPropertyOptional({ nullable: true })
  averageGrade: number | null;

  @ApiProperty()
  gradeCount: number;

  @ApiPropertyOptional({ nullable: true })
  attendanceRate: number | null;

  @ApiProperty()
  attendanceRecords: number;

  @ApiProperty()
  lessonsRecorded: number;

  @ApiProperty()
  present: number;

  @ApiProperty()
  late: number;

  @ApiProperty()
  absent: number;

  @ApiProperty()
  excused: number;
}

export class ReportGradeTrendDto {
  @ApiProperty()
  period: string;

  @ApiProperty()
  averageGrade: number;

  @ApiProperty()
  gradeCount: number;
}

export class ReportAttendanceTrendDto {
  @ApiProperty()
  period: string;

  @ApiPropertyOptional({ nullable: true })
  attendanceRate: number | null;

  @ApiProperty()
  present: number;

  @ApiProperty()
  late: number;

  @ApiProperty()
  absent: number;

  @ApiProperty()
  excused: number;
}

export class ReportCourseRowDto {
  @ApiProperty()
  courseAssignmentId: string;

  @ApiProperty()
  courseName: string;

  @ApiProperty()
  courseCode: string;

  @ApiProperty()
  groupCode: string;

  @ApiProperty()
  departmentName: string;

  @ApiProperty()
  facultyName: string;

  @ApiProperty()
  academicYear: string;

  @ApiProperty()
  semester: number;

  @ApiPropertyOptional({ nullable: true })
  averageGrade: number | null;

  @ApiProperty()
  gradeCount: number;

  @ApiPropertyOptional({ nullable: true })
  attendanceRate: number | null;

  @ApiProperty()
  attendanceRecords: number;

  @ApiProperty()
  lessonsRecorded: number;
}

export class ReportCourseBreakdownDto {
  @ApiProperty({ type: [ReportCourseRowDto] })
  docs: ReportCourseRowDto[];

  @ApiProperty()
  totalDocs: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasNextPage: boolean;

  @ApiProperty()
  hasPrevPage: boolean;
}

export class ReportOverviewDto {
  @ApiProperty()
  generatedAt: string;

  @ApiProperty({ enum: ['day', 'week', 'month'] })
  trendUnit: ReportTrendUnit;

  @ApiProperty({ type: ReportScopeDto })
  scope: ReportScopeDto;

  @ApiProperty({ type: ReportFiltersDto })
  filters: ReportFiltersDto;

  @ApiProperty({ type: ReportSummaryDto })
  summary: ReportSummaryDto;

  @ApiProperty({ type: [ReportGradeTrendDto] })
  gradeTrend: ReportGradeTrendDto[];

  @ApiProperty({ type: [ReportAttendanceTrendDto] })
  attendanceTrend: ReportAttendanceTrendDto[];
}

export class ReportExportDataDto extends ReportOverviewDto {
  @ApiProperty({ type: ReportCourseBreakdownDto })
  courseBreakdown: ReportCourseBreakdownDto;
}
