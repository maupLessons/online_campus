import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScheduleControlType, ScheduleEntryType } from '../schedule.enums';

export class ScheduleEntryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  date: string;

  @ApiProperty()
  startTime: string;

  @ApiProperty()
  endTime: string;

  @ApiProperty()
  courseTitle: string;

  @ApiProperty()
  subjectKey: string;

  @ApiProperty({ enum: ScheduleEntryType })
  type: ScheduleEntryType;

  @ApiPropertyOptional({ enum: ScheduleControlType })
  controlType?: ScheduleControlType;

  @ApiPropertyOptional()
  teacherName?: string;

  @ApiPropertyOptional()
  classroom?: string;

  @ApiProperty()
  onlineFormat: boolean;

  @ApiPropertyOptional()
  onlineUrl?: string;

  @ApiProperty()
  groupCode: string;
}
