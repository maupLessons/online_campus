import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionPeriodStatus,
} from '../schemas';

export class ElectiveDisciplineQueryDto {
  @ApiPropertyOptional({ enum: ElectiveDisciplineStatus })
  @IsOptional()
  @IsEnum(ElectiveDisciplineStatus)
  status?: ElectiveDisciplineStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'Id навчального періоду' })
  @IsOptional()
  @IsMongoId()
  termId?: string;
}

export class ElectivePeriodQueryDto {
  @ApiPropertyOptional({ enum: ElectiveSelectionPeriodStatus })
  @IsOptional()
  @IsEnum(ElectiveSelectionPeriodStatus)
  status?: ElectiveSelectionPeriodStatus;

  @ApiPropertyOptional({ description: 'Id навчального періоду' })
  @IsOptional()
  @IsMongoId()
  termId?: string;
}
