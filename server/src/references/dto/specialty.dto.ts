import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';
import { Specialty } from '../schemas';

@Exclude()
export class SpecialtyDto {
  @Expose()
  @Transform(({ obj }: { obj: Specialty }) => obj._id.toString())
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  code: string;
}
