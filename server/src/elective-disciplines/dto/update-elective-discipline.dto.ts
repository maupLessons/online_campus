import { PartialType } from '@nestjs/swagger';
import { CreateElectiveDisciplineDto } from './create-elective-discipline.dto';

export class UpdateElectiveDisciplineDto extends PartialType(
  CreateElectiveDisciplineDto,
) {}
