import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { toId } from '../../../common/utils/to-id.util';

export class AcademicTermRefDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: { _id?: unknown } }) => toId(obj._id ?? obj))
  id: string;

  @ApiProperty({ required: false })
  @Expose()
  academicYear?: string;

  @ApiProperty({ required: false })
  @Expose()
  termNumber?: 1 | 2;
}

/** Returns the ref DTO both from a populated document and from a bare ObjectId. */
export function termRef(value: unknown): AcademicTermRefDto | null {
  if (!value) return null;
  if (typeof value === 'object' && 'academicYear' in value) {
    const t = value as {
      _id: unknown;
      academicYear: string;
      termNumber: 1 | 2;
    };
    return {
      id: toId(t._id),
      academicYear: t.academicYear,
      termNumber: t.termNumber,
    };
  }
  return { id: toId(value) };
}
