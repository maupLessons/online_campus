import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, Matches } from 'class-validator';

// Spec §5.1: the fields date/startDate/endDate/groupId/teacherId/courseAssignmentId/status
// are deliberately absent here — the global ValidationPipe (forbidNonWhitelisted: true) will return 400
// for /schedule/my?date=…, and "today's schedule" is read via GET /schedule/today.
export class ScheduleRangeQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-07' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  // Only for /schedule/groups/:groupCode and /schedule/export; ignored on /schedule/my.
  @ApiPropertyOptional({ example: 'false' })
  @IsOptional()
  @IsBooleanString()
  session?: string;
}
