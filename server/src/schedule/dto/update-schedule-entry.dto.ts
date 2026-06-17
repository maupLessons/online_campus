import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CreateScheduleEntryDto } from './create-schedule-entry.dto';

export class UpdateScheduleEntryDto extends PartialType(
  CreateScheduleEntryDto,
) {
  @ApiPropertyOptional({
    description:
      'Reason shown in audit/history when the update changes status, room, time, or assignment.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  changeReason?: string;
}
