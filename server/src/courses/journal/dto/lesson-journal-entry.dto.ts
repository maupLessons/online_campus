import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleEntryType } from '../../../schedule/schemas';
import { AttendanceStatus } from '../../schemas';

export class LessonJournalStudentDto {
  @ApiProperty()
  studentId: string;

  @ApiProperty()
  studentName: string;

  @ApiPropertyOptional()
  login?: string;
}

export class LessonJournalAttendanceDto extends LessonJournalStudentDto {
  @ApiProperty({ enum: AttendanceStatus })
  status: AttendanceStatus;

  @ApiPropertyOptional()
  comment?: string;
}

export class LessonJournalGradeDto extends LessonJournalStudentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  value: number;

  @ApiProperty()
  type: string;

  @ApiProperty()
  date: string;

  @ApiPropertyOptional()
  comment?: string;
}

export class LessonJournalEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  courseAssignmentId: string;

  @ApiPropertyOptional()
  scheduleEntryId?: string | null;

  @ApiProperty()
  teacherId: string;

  @ApiProperty()
  date: string;

  @ApiPropertyOptional()
  startTime?: string;

  @ApiPropertyOptional()
  endTime?: string;

  @ApiPropertyOptional({ enum: ScheduleEntryType })
  type?: ScheduleEntryType;

  @ApiProperty()
  topic: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ type: [LessonJournalAttendanceDto] })
  attendance: LessonJournalAttendanceDto[];

  @ApiProperty({ type: [LessonJournalGradeDto] })
  grades: LessonJournalGradeDto[];

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}
