import { PartialType, PickType } from '@nestjs/swagger';
import { CreateAcademicTermDto } from './create-academic-term.dto';

export class UpdateAcademicTermDto extends PartialType(
  PickType(CreateAcademicTermDto, [
    'startsAt',
    'endsAt',
    'maupAcademicYear',
    'maupSemester',
  ] as const),
) {}
