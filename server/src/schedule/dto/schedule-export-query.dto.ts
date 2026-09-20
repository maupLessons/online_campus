import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../../common/export';
import { ScheduleRangeQueryDto } from './schedule-range-query.dto';

export class ScheduleExportQueryDto extends ScheduleRangeQueryDto {
  @ApiPropertyOptional({
    enum: SpreadsheetExportFormat,
    default: SpreadsheetExportFormat.CSV,
  })
  @IsOptional()
  @IsEnum(SpreadsheetExportFormat)
  format?: SpreadsheetExportFormat = SpreadsheetExportFormat.CSV;

  @ApiPropertyOptional({
    enum: SpreadsheetExportLocale,
    default: SpreadsheetExportLocale.UK,
  })
  @IsOptional()
  @IsEnum(SpreadsheetExportLocale)
  locale?: SpreadsheetExportLocale = SpreadsheetExportLocale.UK;
}
