import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import {
  ElectiveDisciplineStatus,
  ElectiveSelectionPeriodStatus,
} from '../schemas';

export class SetElectiveDisciplineStatusDto {
  @ApiProperty({ enum: ElectiveDisciplineStatus })
  @IsEnum(ElectiveDisciplineStatus)
  status: ElectiveDisciplineStatus;
}

export class SetElectivePeriodStatusDto {
  @ApiProperty({ enum: ElectiveSelectionPeriodStatus })
  @IsEnum(ElectiveSelectionPeriodStatus)
  status: ElectiveSelectionPeriodStatus;
}
