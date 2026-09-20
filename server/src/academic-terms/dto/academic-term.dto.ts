import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { toId } from '../../common/utils/to-id.util';

type AcademicTermLike = {
  _id?: unknown;
  id?: unknown;
};

const iso = ({ value }: { value?: Date | string | null }) =>
  value instanceof Date ? value.toISOString() : (value ?? null);

export class AcademicTermDto {
  @ApiProperty()
  @Expose()
  @Transform(({ obj }: { obj: AcademicTermLike }) => toId(obj._id ?? obj.id))
  id: string;

  @ApiProperty()
  @Expose()
  academicYear: string;

  @ApiProperty()
  @Expose()
  termNumber: 1 | 2;

  @ApiProperty()
  @Expose()
  @Transform(iso)
  startsAt: string;

  @ApiProperty()
  @Expose()
  @Transform(iso)
  endsAt: string;

  @ApiProperty()
  @Expose()
  status: 'planned' | 'current' | 'closed';

  @ApiProperty()
  @Expose()
  maupAcademicYear: number;

  @ApiProperty()
  @Expose()
  maupSemester: number;

  @ApiProperty({ nullable: true })
  @Expose()
  @Transform(iso)
  activatedAt: string | null;

  @ApiProperty({ nullable: true })
  @Expose()
  @Transform(iso)
  closedAt: string | null;
}
