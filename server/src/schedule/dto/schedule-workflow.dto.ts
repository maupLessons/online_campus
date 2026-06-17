import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateScheduleEntryDto } from './create-schedule-entry.dto';
import { ScheduleEntryType } from '../schemas';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleReasonDto {
  @ApiProperty({ example: 'Викладач на лікарняному' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}

export class RescheduleScheduleEntryDto extends ScheduleReasonDto {
  @ApiProperty({ example: '2026-09-02' })
  @Matches(DATE_PATTERN)
  date: string;

  @ApiProperty({ example: '10:15' })
  @Matches(TIME_PATTERN)
  startTime: string;

  @ApiProperty({ example: '11:45' })
  @Matches(TIME_PATTERN)
  endTime: string;

  @ApiPropertyOptional({
    description: 'New classroom id. Omit to keep the current classroom.',
  })
  @IsOptional()
  @IsMongoId()
  classroomId?: string;
}

export class SubstituteScheduleEntryDto extends ScheduleReasonDto {
  @ApiPropertyOptional({
    description:
      'Replacement course assignment id. Use when a teacher/course/group substitution is needed.',
  })
  @IsOptional()
  @IsMongoId()
  courseAssignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  classroomId?: string;

  @ApiPropertyOptional({ example: '2026-09-02' })
  @IsOptional()
  @Matches(DATE_PATTERN)
  date?: string;

  @ApiPropertyOptional({ example: '10:15' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  startTime?: string;

  @ApiPropertyOptional({ example: '11:45' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  endTime?: string;

  @ApiPropertyOptional({ enum: ScheduleEntryType })
  @IsOptional()
  @IsEnum(ScheduleEntryType)
  type?: ScheduleEntryType;
}

export class BulkCreateScheduleEntriesDto {
  @ApiProperty({ type: () => [CreateScheduleEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleEntryDto)
  entries: CreateScheduleEntryDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  skipConflicts?: boolean;
}

export class BulkCancelScheduleEntriesDto extends ScheduleReasonDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsMongoId({ each: true })
  ids: string[];
}
