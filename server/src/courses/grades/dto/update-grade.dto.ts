import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateGradeDto } from './create-grade.dto';

export class UpdateGradeDto extends PartialType(
  OmitType(CreateGradeDto, ['studentId', 'courseAssignmentId'] as const),
) {}
