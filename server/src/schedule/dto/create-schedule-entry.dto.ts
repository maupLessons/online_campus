import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, Matches } from 'class-validator';
import { ScheduleEntryStatus, ScheduleEntryType } from '../schedule.enums';

export class CreateScheduleEntryDto {
  @ApiProperty()
  @IsMongoId()
  courseAssignmentId: string;

  @ApiPropertyOptional({
    description: 'Classroom id. Empty means online or no classroom assigned.',
  })
  @IsOptional()
  @IsMongoId()
  classroomId?: string;

  @ApiProperty({ example: '2026-09-01' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @ApiProperty({ example: '08:30' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @ApiProperty({ example: '10:05' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;

  @ApiProperty({ enum: ScheduleEntryType })
  @IsEnum(ScheduleEntryType)
  type: ScheduleEntryType;

  @ApiPropertyOptional({
    enum: ScheduleEntryStatus,
    default: ScheduleEntryStatus.SCHEDULED,
  })
  @IsOptional()
  @IsEnum(ScheduleEntryStatus)
  status?: ScheduleEntryStatus;
}
