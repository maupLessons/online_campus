import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum SurveyExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
}

export class SurveyExportQueryDto {
  @ApiPropertyOptional({
    enum: SurveyExportFormat,
    default: SurveyExportFormat.CSV,
  })
  @IsOptional()
  @IsEnum(SurveyExportFormat)
  format: SurveyExportFormat = SurveyExportFormat.CSV;
}
