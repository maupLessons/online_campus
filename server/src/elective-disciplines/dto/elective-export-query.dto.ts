import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum ElectiveExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
}

export class ElectiveExportQueryDto {
  @ApiPropertyOptional({
    enum: ElectiveExportFormat,
    default: ElectiveExportFormat.CSV,
  })
  @IsOptional()
  @IsEnum(ElectiveExportFormat)
  format: ElectiveExportFormat = ElectiveExportFormat.CSV;
}
