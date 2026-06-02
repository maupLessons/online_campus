import { PartialType } from '@nestjs/swagger';
import { CreateElectivePeriodDto } from './create-elective-period.dto';

export class UpdateElectivePeriodDto extends PartialType(
  CreateElectivePeriodDto,
) {}
