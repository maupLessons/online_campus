import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform, Type } from 'class-transformer';
import { GradeResponseDto } from './grade.dto';
import { toId } from '../../../common/utils/to-id.util';

export class GradeJournalResponseDto {
  @ApiProperty()
  @Expose()
  @Transform(({ value }) => toId(value))
  studentId: string;

  @ApiProperty()
  @Expose()
  studentName: string;

  @ApiProperty({ type: [GradeResponseDto] })
  @Expose()
  @Type(() => GradeResponseDto)
  grades: GradeResponseDto[];
}
