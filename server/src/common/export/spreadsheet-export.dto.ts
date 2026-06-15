import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import {
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from './spreadsheet-export';

export class SpreadsheetExportQueryDto {
  @ApiPropertyOptional({
    enum: SpreadsheetExportFormat,
    default: SpreadsheetExportFormat.CSV,
  })
  @IsOptional()
  @IsEnum(SpreadsheetExportFormat)
  format: SpreadsheetExportFormat = SpreadsheetExportFormat.CSV;
}

export class LocalizedSpreadsheetExportQueryDto extends SpreadsheetExportQueryDto {
  @ApiPropertyOptional({
    enum: SpreadsheetExportLocale,
    default: SpreadsheetExportLocale.UK,
  })
  @IsOptional()
  @IsEnum(SpreadsheetExportLocale)
  locale: SpreadsheetExportLocale = SpreadsheetExportLocale.UK;
}
