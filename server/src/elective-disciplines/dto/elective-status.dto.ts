import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionPeriodStatus,
} from '../schemas';

export class SetElectiveDisciplineStatusDto {
  @ApiProperty({ enum: ElectiveDisciplineStatus })
  @IsEnum(ElectiveDisciplineStatus)
  status: ElectiveDisciplineStatus;

  @ApiPropertyOptional({ minLength: 10, maxLength: 500 })
  @ValidateIf(
    (dto: SetElectiveDisciplineStatusDto) =>
      dto.status === ElectiveDisciplineStatus.CANCELLED,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}

export class SetElectivePeriodStatusDto {
  @ApiProperty({ enum: ElectiveSelectionPeriodStatus })
  @IsEnum(ElectiveSelectionPeriodStatus)
  status: ElectiveSelectionPeriodStatus;
}
