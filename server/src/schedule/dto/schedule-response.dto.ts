import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleEntryDto } from './schedule-entry.dto';

export class ScheduleTermMetaDto {
  @ApiProperty() id: string;
  @ApiProperty() academicYear: string;
  @ApiProperty() termNumber: number;
}

export type ScheduleUnavailableReason =
  | 'no_current_term'
  | 'no_active_profile'
  | 'no_snapshot'
  | 'no_external_teacher_id';

export class ScheduleMetaDto {
  @ApiPropertyOptional({ type: ScheduleTermMetaDto })
  term?: ScheduleTermMetaDto;
  @ApiPropertyOptional() fetchedAt?: string;
  @ApiProperty() stale: boolean;
  @ApiPropertyOptional({
    enum: [
      'no_current_term',
      'no_active_profile',
      'no_snapshot',
      'no_external_teacher_id',
    ],
  })
  reason?: ScheduleUnavailableReason;
}

export class ScheduleResponseDto {
  @ApiProperty({ type: [ScheduleEntryDto] }) entries: ScheduleEntryDto[];
  @ApiProperty({ type: ScheduleMetaDto }) meta: ScheduleMetaDto;
}

// §5.3a — response for /schedule/today: the date is computed on the server in Europe/Kyiv,
// two arrays (session is rendered first), the client passes no parameters.
export class TodayScheduleResponseDto {
  @ApiProperty({ example: '2026-09-07' }) date: string;
  @ApiProperty({ type: [ScheduleEntryDto] }) lessons: ScheduleEntryDto[];
  @ApiProperty({ type: [ScheduleEntryDto] }) session: ScheduleEntryDto[];
  @ApiProperty({ type: ScheduleMetaDto }) meta: ScheduleMetaDto;
}

// §5.3b — response for /schedule/groups/:groupCode. An allowlist of fields, not a lean() document:
// fetchedByUserId, rawHash, teacherExternalId, classroomExternalId don't end up here
// (acceptance criterion §10.13).
export class ScheduleGroupResponseDto {
  @ApiProperty() groupCode: string;
  @ApiProperty() isExamSession: boolean;
  @ApiProperty({ nullable: true }) periodFrom: string | null;
  @ApiProperty({ nullable: true }) periodTo: string | null;
  @ApiProperty({ nullable: true }) fetchedAt: string | null;
  @ApiProperty() stale: boolean;
  @ApiProperty({ type: [ScheduleEntryDto] }) entries: ScheduleEntryDto[];
}
