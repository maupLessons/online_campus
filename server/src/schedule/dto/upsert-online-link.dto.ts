import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsSafeHttpsUrl } from '../../common/validators/https-url.validator';

// Spec §11 П7, §12 / Р12: there's no `reason` field, no break-glass is introduced for the administrator.
export class UpsertOnlineLinkDto {
  @ApiProperty({ example: 'КН-11' })
  @IsString()
  @MaxLength(64)
  groupCode: string;
  @ApiProperty({ example: '1001' })
  @IsString()
  @MaxLength(300)
  subjectKey: string;
  @ApiPropertyOptional({ example: '2026-09-07' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
  @ApiPropertyOptional({ example: '08:30' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;
  @ApiProperty({ example: 'https://meet.google.com/abc' })
  @IsSafeHttpsUrl()
  url: string;
}
