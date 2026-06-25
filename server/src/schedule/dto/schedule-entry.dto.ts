import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ScheduleChangeAction,
  ScheduleEntryStatus,
  ScheduleEntryType,
} from '../schedule.enums';

export class ScheduleChangeHistoryDto {
  @ApiProperty({ enum: ScheduleChangeAction })
  action: ScheduleChangeAction;

  @ApiPropertyOptional()
  reason?: string;

  @ApiPropertyOptional()
  actorId?: string | null;

  @ApiPropertyOptional()
  actorLogin?: string;

  @ApiProperty()
  changedAt: string;
}

export class ScheduleEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  courseAssignmentId: string;

  @ApiPropertyOptional()
  classroomId?: string;

  @ApiProperty()
  date: string;

  @ApiProperty()
  startTime: string;

  @ApiProperty()
  endTime: string;

  @ApiProperty({ enum: ScheduleEntryType })
  type: ScheduleEntryType;

  @ApiProperty({ enum: ScheduleEntryStatus })
  status: ScheduleEntryStatus;

  @ApiPropertyOptional()
  courseName?: string;

  @ApiPropertyOptional()
  courseCode?: string;

  @ApiPropertyOptional()
  groupCode?: string;

  @ApiPropertyOptional()
  teacherId?: string;

  @ApiPropertyOptional()
  teacherName?: string;

  @ApiPropertyOptional()
  classroom?: string;

  @ApiPropertyOptional()
  onlineUrl?: string;

  @ApiPropertyOptional()
  changeReason?: string;

  @ApiPropertyOptional()
  cancelledAt?: string;

  @ApiPropertyOptional()
  rescheduledAt?: string;

  @ApiPropertyOptional()
  substitutedAt?: string;

  @ApiPropertyOptional({ type: () => [ScheduleChangeHistoryDto] })
  changeHistory?: ScheduleChangeHistoryDto[];

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}
