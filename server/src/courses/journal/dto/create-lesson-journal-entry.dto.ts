import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ScheduleEntryType } from '../../../schedule/schedule.enums';
import { AttendanceStatus } from '../../schemas';

export class LessonAttendanceDto {
  @ApiProperty()
  @IsMongoId()
  studentId: string;

  @ApiProperty({ enum: AttendanceStatus })
  @IsEnum(AttendanceStatus)
  status: AttendanceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class LessonGradeDto {
  @ApiProperty()
  @IsMongoId()
  studentId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(100)
  value: number;

  @ApiPropertyOptional({ enum: ['current', 'module', 'exam', 'final'] })
  @IsOptional()
  @IsEnum(['current', 'module', 'exam', 'final'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class CreateLessonJournalEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  scheduleEntryId?: string;

  @ApiProperty()
  @IsDateString()
  date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @ApiPropertyOptional({ enum: ScheduleEntryType })
  @IsOptional()
  @IsEnum(ScheduleEntryType)
  type?: ScheduleEntryType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  topic: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: [LessonAttendanceDto] })
  @IsOptional()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => LessonAttendanceDto)
  attendance?: LessonAttendanceDto[];

  @ApiPropertyOptional({ type: [LessonGradeDto] })
  @IsOptional()
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => LessonGradeDto)
  grades?: LessonGradeDto[];
}
