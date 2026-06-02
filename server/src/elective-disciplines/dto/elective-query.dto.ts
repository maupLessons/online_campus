import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
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

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  semester?: number;
}

export class ElectivePeriodQueryDto {
  @ApiPropertyOptional({ enum: ElectiveSelectionPeriodStatus })
  @IsOptional()
  @IsEnum(ElectiveSelectionPeriodStatus)
  status?: ElectiveSelectionPeriodStatus;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  semester?: number;
}
