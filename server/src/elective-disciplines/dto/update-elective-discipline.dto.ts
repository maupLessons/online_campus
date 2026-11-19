import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateElectiveDisciplineDto } from './create-elective-discipline.dto';

export class UpdateElectiveDisciplineDto extends PartialType(
  OmitType(CreateElectiveDisciplineDto, ['code'] as const),
) {}
