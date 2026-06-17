import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ScheduleEntryType } from '../schemas';
import { ScheduleTemplateStatus } from '../schemas';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ScheduleTemplateDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  courseAssignmentId: string;

  @ApiPropertyOptional()
  classroomId?: string;

  @ApiProperty({ minimum: 1, maximum: 7 })
  dayOfWeek: number;

  @ApiProperty({ example: '08:30' })
  startTime: string;

  @ApiProperty({ example: '10:05' })
  endTime: string;

  @ApiProperty({ enum: ScheduleEntryType })
  type: ScheduleEntryType;

  @ApiProperty({ enum: ScheduleTemplateStatus })
  status: ScheduleTemplateStatus;

  @ApiPropertyOptional()
  courseName?: string;

  @ApiPropertyOptional()
  courseCode?: string;

  @ApiPropertyOptional()
  groupCode?: string;

  @ApiPropertyOptional()
  teacherName?: string;

  @ApiPropertyOptional()
  classroom?: string;

  @ApiPropertyOptional()
  createdAt?: string;

  @ApiPropertyOptional()
  updatedAt?: string;
}

export class CreateScheduleTemplateDto {
  @ApiProperty({ example: 'КН-11 Понеділок 08:30' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsMongoId()
  courseAssignmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  classroomId?: string;

  @ApiProperty({ minimum: 1, maximum: 7, description: 'ISO day: 1=Mon, 7=Sun' })
  @IsInt()
  @Min(1)
  @Max(7)
  dayOfWeek: number;

  @ApiProperty({ example: '08:30' })
  @Matches(TIME_PATTERN)
  startTime: string;

  @ApiProperty({ example: '10:05' })
  @Matches(TIME_PATTERN)
  endTime: string;

  @ApiProperty({ enum: ScheduleEntryType })
  @IsEnum(ScheduleEntryType)
  type: ScheduleEntryType;
}

export class UpdateScheduleTemplateDto extends PartialType(
  CreateScheduleTemplateDto,
) {
  @ApiPropertyOptional({ enum: ScheduleTemplateStatus })
  @IsOptional()
  @IsEnum(ScheduleTemplateStatus)
  status?: ScheduleTemplateStatus;
}

export class ApplyScheduleTemplateDto {
  @ApiProperty({ example: '2026-09-01' })
  @Matches(DATE_PATTERN)
  startDate: string;

  @ApiProperty({ example: '2026-12-31' })
  @Matches(DATE_PATTERN)
  endDate: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  skipConflicts?: boolean;
}
